// Who Would Love API: accepts a URL, runs the report pipeline as a Cloudflare Workflow, and serves
// progress and the finished report. Called only by the website (through a Pages service binding),
// so API keys never reach the browser.

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import Anthropic from "@anthropic-ai/sdk";
import { scrapePage, scrapeSite, type ScrapedPage } from "../../src/firecrawl.js";
import { readProduct } from "../../src/read-product.js";
import { Qloo } from "../../src/qloo.js";
import { allSeedIds, gatherOverall, resolveSeeds, type SegmentTaste, type TasteData, type TrailStep } from "../../src/taste.js";
import { investigateSegment } from "../../src/taste-agent.js";
import { findCommunities, type Community } from "../../src/communities.js";
import { writeReport } from "../../src/write-report.js";
import { ADS_MARKER, renderReport } from "../../src/render.js";
import { makeAdKit } from "../../src/ads.js";
import { renderAdKit, renderAdKitPending } from "../../src/render-ads.js";

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
  PUBLIC_CAP: string;
  PUBLIC_WINDOW_DAYS: string;
  PUBLIC_FROM: string;
  JUDGE_DAILY_CAP: string;
}

type Params = { id: string; url: string; scope: "page" | "site" };

// What the progress page shows, in order. The workflow moves `step` forward as it goes.
export const STEPS = [
  "Reading your page",
  "Understanding what it is and who it is for",
  "Matching starting points in Qloo",
  "Agents investigate the taste graph, one per audience",
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
      // One taste agent per audience, all at the same time. They share one Qloo client, whose queue
      // keeps requests one at a time, so running them together does not raise the Qloo request rate.
      const sharedQloo = qloo();
      // The latest agent steps, shown live on the progress page. Writes are best effort.
      const activity: (TrailStep & { segment: string })[] = [];
      const onStep = (segment: string) => (s: TrailStep) => {
        activity.push({ segment, ...s });
        activity.splice(0, Math.max(0, activity.length - 12));
        env.DB.prepare("UPDATE reports SET activity=? WHERE id=?").bind(JSON.stringify(activity), id).run().catch(() => {});
      };
      const investigated = await Promise.all(resolved.segments.map((seg, i) => step.do(`taste segment ${i}`, RETRY, async () => {
        const r = await investigateSegment(read.profile, seg, primary, exclude, resolved.tags, sharedQloo, claude(), onStep(seg.name));
        return { taste: r.taste, cost: usd(r.usage) };
      })));
      await step.do("cost taste", () => addCost(env, id, investigated.reduce((sum, x) => sum + x.cost, 0)));
      const segments: SegmentTaste[] = investigated.flatMap((x) => (x.taste ? [x.taste] : []));
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
        // The inputs are kept so the ad kit (and any later re-render) can be made without re-running the report.
        const data = JSON.stringify({ page: { url: page.url, image: page.image ?? null }, profile: read.profile, taste, communities, spec: spec.spec });
        await env.DB.prepare("UPDATE reports SET status='done', step=?, html=?, data=?, ads_status='running', cost_usd=cost_usd+?, updated_at=? WHERE id=?")
          .bind(STEPS.length, html, data, usd(spec.usage), Date.now(), id).run();
      });

      // The report is readable from here on. The ad kit follows on the same page, and a failure here
      // only leaves the report without ads.
      try {
        const labels = Object.fromEntries(spec.spec.place_labels.map((p) => [p.raw, p.clean]));
        const kits = await Promise.all(segments.map((seg, i) => step.do(`ads ${i}`, RETRY, async () => {
          const r = await makeAdKit(read.profile, seg, spec.spec, communities, labels, sharedQloo, claude(), onStep(seg.name));
          return { segment: seg.name, result: r.result, cost: usd(r.usage) };
        })));
        await step.do("save ads", async () => {
          const brand = { name: read.profile.name, host: new URL(page.url).hostname.replace(/^www\./, ""), image: page.image ?? null };
          await env.DB.prepare("UPDATE reports SET ads_status='done', ads_html=?, cost_usd=cost_usd+?, updated_at=? WHERE id=?")
            .bind(renderAdKit(kits, brand), kits.reduce((sum, k) => sum + k.cost, 0), Date.now(), id).run();
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await step.do("ads failed", () => env.DB.prepare("UPDATE reports SET ads_status='failed', error=?, updated_at=? WHERE id=?")
          .bind(`Ads: ${message}`.slice(0, 500), Date.now(), id).run().then(() => null));
      }
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

  // Judges use the link from the Devpost page (it carries the code). Their reports are marked, so they
  // have their own daily cap and never use up the public one, and the public never uses up theirs.
  const judge = !!env.JUDGE_CODE && body.code === env.JUDGE_CODE;
  const ipHash = (judge ? "judge:" : "") + await sha256(`${env.IP_SALT}:${ip}`);
  const counts = await env.DB.prepare(`SELECT
      SUM(CASE WHEN ip_hash LIKE 'judge:%' AND created_at>?1 THEN 1 ELSE 0 END) AS judges,
      SUM(CASE WHEN ip_hash NOT LIKE 'judge:%' AND ip_hash <> 'owner-test' AND created_at>?2 THEN 1 ELSE 0 END) AS public
    FROM reports WHERE created_at>?2`).bind(Date.now() - DAY, Date.now() - Number(env.PUBLIC_WINDOW_DAYS) * DAY)
    .first<{ judges: number | null; public: number | null }>();
  // Shown as two paragraphs on the home page.
  const JUDGES = "\n\nAre you a judge? Use the special judges' link on our Devpost page.";
  if (judge) {
    if ((counts?.judges ?? 0) >= Number(env.JUDGE_DAILY_CAP)) return json({ error: "Today's judging reports are used up. Please try again tomorrow, or read the finished reports on the sample reports page." }, 429);
  } else {
    // Before PUBLIC_FROM only judges can start new reports; saved reports stay open to everyone.
    if (Date.now() < Date.parse(env.PUBLIC_FROM)) return json({ error: "New reports open to the public on November 1, 2026. Until then, you can read every finished report on the sample reports page." + JUDGES }, 403);
    if ((counts?.public ?? 0) >= Number(env.PUBLIC_CAP)) return json({ error: `To keep API costs under control, the public can start one new report every ${env.PUBLIC_WINDOW_DAYS} days, and this one is taken. You can still read every finished report on the sample reports page.` + JUDGES }, 429);
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO reports (id, url, scope, status, step, ip_hash, created_at, updated_at) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?)")
    .bind(id, url, scope, ipHash, now, now).run();
  try {
    await env.REPORT.create({ id, params: { id, url, scope } });
  } catch (e) {
    // Never leave a report queued forever: a stuck row would also be reused for this link for a day.
    await env.DB.prepare("UPDATE reports SET status='failed', error=?, updated_at=? WHERE id=?")
      .bind("We could not start this report. Please try again in a minute.", Date.now(), id).run();
    return json({ error: "We could not start this report. Please try again in a minute." }, 503);
  }
  return json({ id });
}

async function reportStatus(id: string, env: Env) {
  const row = await env.DB.prepare("SELECT id, url, scope, status, step, product_name, error, ads_status, activity, created_at, updated_at FROM reports WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!row) return json({ error: "No report with that id." }, 404);
  return json({ ...row, activity: row.activity ? JSON.parse(String(row.activity)) : [], steps: STEPS });
}

async function reportHtml(id: string, env: Env) {
  const row = await env.DB.prepare("SELECT html, ads_status, ads_html FROM reports WHERE id=? AND status='done'").bind(id).first<{ html: string; ads_status: string | null; ads_html: string | null }>();
  if (!row?.html) return new Response("Not ready", { status: 404 });
  const pending = row.ads_status === "running";
  const audiences = (row.html.match(/<section class="sec audience"/g) ?? []).length;
  const ads = row.ads_status === "done" && row.ads_html ? row.ads_html : pending ? renderAdKitPending(id, audiences) : "";
  return new Response(row.html.replace(ADS_MARKER, () => ads), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": pending ? "no-store" : "public, max-age=300" },
  });
}

// The gallery on /reports: reports we chose to show (featured > 0, in that order). The card details are
// read back from each report's HTML, so the gallery never needs its own copy of the data.
const unescape = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e as string]!).trim();

async function samples(env: Env) {
  const { results } = await env.DB.prepare("SELECT id, url, product_name, html, created_at FROM reports WHERE featured>0 AND status='done' ORDER BY featured")
    .all<{ id: string; url: string; product_name: string; html: string; created_at: number }>();
  const cards = results.map((r) => ({
    id: r.id,
    name: r.product_name,
    host: new URL(r.url).hostname.replace(/^www\./, ""),
    date: new Date(r.created_at).toISOString().slice(0, 10),
    icon: r.html.match(/<div class="app"><img src="([^"]+)"/)?.[1] ?? null,
    summary: unescape(r.html.match(/<p class="lead">([\s\S]*?)<\/p>/)?.[1] ?? ""),
    audiences: [...r.html.matchAll(/<section class="sec audience">[\s\S]*?<h2>([\s\S]*?)<\/h2>/g)].map((m) => unescape(m[1])),
    agent: r.html.includes("How the agent investigated"),
  }));
  return Response.json(cards, { headers: { "Cache-Control": "public, max-age=300" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/config") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, steps: STEPS });
    if (pathname === "/api/samples") return samples(env);
    if (pathname === "/api/reports" && request.method === "POST") return createReport(request, env);
    const m = pathname.match(/^\/api\/reports\/([a-z0-9-]{3,40})(\/html)?$/);
    if (m && request.method === "GET") return m[2] ? reportHtml(m[1], env) : reportStatus(m[1], env);
    return json({ error: "Not found" }, 404);
  },
};
