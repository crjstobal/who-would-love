// Who Would Love API: accepts a URL, runs the report pipeline as a Cloudflare Workflow, and serves
// progress and the finished report. Called only by the website (through a Pages service binding),
// so API keys never reach the browser.

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import Anthropic from "@anthropic-ai/sdk";
import { scrapePage, scrapeSite, type ScrapedPage } from "../../src/firecrawl.js";
import { readProduct } from "../../src/read-product.js";
import { Qloo } from "../../src/qloo.js";
import { allSeedIds, gatherOverall, gatherSegment, resolveSeeds, type SegmentTaste, type TasteData } from "../../src/taste.js";
import { findCommunities, type Community } from "../../src/communities.js";
import { writeReport } from "../../src/write-report.js";
import { renderReport } from "../../src/render.js";

export interface Env {
  DB: D1Database;
  REPORT: Workflow<Params>;
  ANTHROPIC_API_KEY: string;
  FIRECRAWL_API_KEY: string;
  QLOO_API_KEY: string;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  IP_SALT: string;
  JUDGE_CODE?: string;
  DAILY_CAP: string;
  PER_IP_DAILY_CAP: string;
}

type Params = { id: string; url: string; scope: "page" | "site" };

// What the progress page shows, in order. The workflow moves `step` forward as it goes.
export const STEPS = [
  "Reading your page",
  "Understanding what it is and who it is for",
  "Matching starting points in Qloo",
  "Reading the taste graph, one audience at a time",
  "Finding where they gather online",
  "Writing your report",
];

const RETRY = { retries: { limit: 2, delay: "15 seconds" as const, backoff: "exponential" as const }, timeout: "15 minutes" as const };
const usd = (u: { input_tokens: number; output_tokens: number }, searches = 0) => (u.input_tokens * 4 + u.output_tokens * 20) / 1e6 + searches * 0.01;

export class ReportWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { id, url, scope } = event.payload;
    const env = this.env;
    const claude = () => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const qloo = () => new Qloo(env.QLOO_API_KEY);
    const progress = (n: number, extra: Record<string, unknown> = {}) => step.do(`progress ${n}`, () => setProgress(env, id, n, extra));

    try {
      await progress(0, { status: "running" });
      const page = await step.do("read page", RETRY, async (): Promise<ScrapedPage & { pages?: string[] }> => {
        try {
          return scope === "site" ? await scrapeSite(url, env.FIRECRAWL_API_KEY) : await scrapePage(url, env.FIRECRAWL_API_KEY);
        } catch (e) {
          throw new NonRetryableError(`We could not read that page. ${String((e as Error).message ?? e).slice(0, 200)}`);
        }
      });
      if (page.markdown.trim().length < 200) throw new NonRetryableError("That page has almost no readable text, so there is nothing to analyse.");

      await progress(1);
      const read = await step.do("understand product", RETRY, () => readProduct(page, claude()));
      await progress(2, { product_name: read.profile.name, cost: usd(read.usage) });

      const resolved = await step.do("match seeds", RETRY, () => resolveSeeds(read.profile, qloo(), claude()));
      await progress(3, { cost: usd(resolved.usage) });
      if (resolved.segments.every((s) => s.confirmed.length === 0)) {
        throw new NonRetryableError("Qloo had no match for anything this product relates to, so we cannot build a taste profile.");
      }

      const primary = resolved.markets[0] ?? "United States";
      const exclude = allSeedIds(resolved);
      const segments: SegmentTaste[] = [];
      for (const [i, seg] of resolved.segments.entries()) {
        const out = await step.do(`taste segment ${i}`, RETRY, () => gatherSegment(seg, primary, exclude, qloo()));
        if (out) segments.push(out);
      }
      const overall = await step.do("taste overall", RETRY, () => gatherOverall(resolved, qloo()));
      const taste: TasteData = { markets: resolved.markets, tags: resolved.tags, segments, overall };

      await progress(4);
      // One web search agent per audience, all at the same time.
      const found = await Promise.all(segments.map((seg, i) => step.do(`communities ${i}`, RETRY, async () => {
        const r = await findCommunities(read.profile, seg, claude());
        return { places: r.places, cost: usd(r.usage, r.usage.searches) };
      })));
      const communities: Community[] = found.flatMap((f) => f.places);
      await step.do("cost communities", () => addCost(env, id, found.reduce((sum, f) => sum + f.cost, 0)));

      await progress(5);
      const spec = await step.do("write report", RETRY, () => writeReport(read.profile, taste, communities, claude()));
      await step.do("render and save", async () => {
        const html = renderReport({
          page, profile: read.profile, taste, communities, spec: spec.spec,
          date: new Date().toISOString().slice(0, 10), id: `WWL-${id.slice(0, 6).toUpperCase()}`, pagesRead: page.pages?.length ?? 1,
        });
        await env.DB.prepare("UPDATE reports SET status='done', step=?, html=?, cost_usd=cost_usd+?, updated_at=? WHERE id=?")
          .bind(STEPS.length, html, usd(spec.usage), Date.now(), id).run();
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await step.do("mark failed", () => env.DB.prepare("UPDATE reports SET status='failed', error=?, updated_at=? WHERE id=?")
        .bind(message.slice(0, 500), Date.now(), id).run().then(() => null));
      throw e;
    }
  }
}

async function setProgress(env: Env, id: string, n: number, extra: Record<string, unknown>) {
  await env.DB.prepare(`UPDATE reports SET step=?, status=COALESCE(?, status), product_name=COALESCE(?, product_name), cost_usd=cost_usd+?, updated_at=? WHERE id=?`)
    .bind(n, (extra.status as string) ?? null, (extra.product_name as string) ?? null, (extra.cost as number) ?? 0, Date.now(), id).run();
  return n;
}

async function addCost(env: Env, id: string, cost: number) {
  await env.DB.prepare("UPDATE reports SET cost_usd=cost_usd+? WHERE id=?").bind(cost, id).run();
  return cost;
}

// ---------- HTTP API ----------

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const DAY = 24 * 60 * 60 * 1000;

function cleanUrl(raw: unknown): string | null {
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function turnstileOk(env: Env, token: unknown, ip: string) {
  if (!env.TURNSTILE_SECRET) return true; // local development
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", String(token ?? ""));
  form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return ((await res.json()) as { success?: boolean }).success === true;
}

async function createReport(request: Request, env: Env) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; scope?: string; token?: string; code?: string };
  const url = cleanUrl(body.url);
  if (!url) return json({ error: "Please paste a full public link, starting with https://" }, 400);
  const scope = body.scope === "site" ? "site" : "page";
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await turnstileOk(env, body.token, ip))) return json({ error: "We could not confirm you are human. Please reload the page and try again." }, 403);

  // Same link analysed recently (or being analysed now): reuse it. Saves cost and gives an instant result.
  const recent = await env.DB.prepare("SELECT id FROM reports WHERE url=? AND scope=? AND ((status='done' AND created_at>?) OR (status IN ('queued','running') AND created_at>?)) ORDER BY created_at DESC LIMIT 1")
    .bind(url, scope, Date.now() - 30 * DAY, Date.now() - DAY).first<{ id: string }>();
  if (recent) return json({ id: recent.id, reused: true });

  const ipHash = await sha256(`${env.IP_SALT}:${ip}`);
  // Judges get unrestricted access (a rules requirement) with the code from the testing instructions.
  const judge = !!env.JUDGE_CODE && body.code === env.JUDGE_CODE;
  const since = Date.now() - DAY;
  const counts = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN ip_hash=? THEN 1 ELSE 0 END) AS mine FROM reports WHERE created_at>?")
    .bind(ipHash, since).first<{ total: number; mine: number | null }>();
  if (!judge && (counts?.mine ?? 0) >= Number(env.PER_IP_DAILY_CAP)) return json({ error: "You have used today's free reports. Come back tomorrow, or open the sample report in the meantime." }, 429);
  if (!judge && (counts?.total ?? 0) >= Number(env.DAILY_CAP)) return json({ error: "We have hit today's limit of free reports (each one runs real AI and data queries). Please try again tomorrow, or open the sample report." }, 429);

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO reports (id, url, scope, status, step, ip_hash, created_at, updated_at) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?)")
    .bind(id, url, scope, ipHash, now, now).run();
  await env.REPORT.create({ id, params: { id, url, scope } });
  return json({ id });
}

async function reportStatus(id: string, env: Env) {
  const row = await env.DB.prepare("SELECT id, url, scope, status, step, product_name, error, created_at, updated_at FROM reports WHERE id=?").bind(id).first();
  if (!row) return json({ error: "No report with that id." }, 404);
  return json({ ...row, steps: STEPS });
}

async function reportHtml(id: string, env: Env) {
  const row = await env.DB.prepare("SELECT html FROM reports WHERE id=? AND status='done'").bind(id).first<{ html: string }>();
  if (!row?.html) return new Response("Not ready", { status: 404 });
  return new Response(row.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/config") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, steps: STEPS });
    if (pathname === "/api/reports" && request.method === "POST") return createReport(request, env);
    const m = pathname.match(/^\/api\/reports\/([a-z0-9-]{3,40})(\/html)?$/);
    if (m && request.method === "GET") return m[2] ? reportHtml(m[1], env) : reportStatus(m[1], env);
    return json({ error: "Not found" }, 404);
  },
};
