// Local runner: loads keys from AWS SSM into memory (never to disk) and runs the pipeline on one URL.
// Usage: npm run report -- <url>
//        npm run report -- --from runs/<folder>
// With --from, every step whose output file already exists in the folder is reused, so deleting
// one file (e.g. 03-communities.json) re-runs only that step and the ones after it.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { scrapePage, type ScrapedPage } from "../src/firecrawl.js";
import { readProduct, type ProductProfile } from "../src/read-product.js";
import { Qloo } from "../src/qloo.js";
import { gatherTaste, resolveSeeds, type TasteData } from "../src/taste.js";
import { findCommunities, type Community } from "../src/communities.js";
import { writeReport, type ReportSpec } from "../src/write-report.js";
import { renderReport } from "../src/render.js";

function ssmEnv(name: string): Record<string, string> {
  const raw = execFileSync("aws", [
    "ssm", "get-parameter", "--name", `/servikaki/secrets/${name}`, "--with-decryption",
    "--profile", "servikaki-secrets", "--region", "eu-west-1", "--query", "Parameter.Value", "--output", "text",
  ], { encoding: "utf8" });
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

let spent = 0;
const charge = (u: { input_tokens: number; output_tokens: number; searches?: number }) => {
  const usd = (u.input_tokens * 4 + u.output_tokens * 20) / 1e6 + (u.searches ?? 0) * 0.01;
  spent += usd;
  return `$${usd.toFixed(3)}`;
};
const secs = (t: number) => ((Date.now() - t) / 1000).toFixed(1) + "s";

async function step<T>(file: string, label: string, run: () => Promise<T>): Promise<T> {
  if (existsSync(file)) {
    console.log(`${label}: reused ${file}`);
    return JSON.parse(readFileSync(file, "utf8"));
  }
  const t = Date.now();
  const out = await run();
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`${label}: done in ${secs(t)}`);
  return out;
}

const args = process.argv.slice(2);
let dir: string;
let url: string;
if (args[0] === "--from") {
  dir = args[1].replace(/\/$/, "");
  url = JSON.parse(readFileSync(`${dir}/00-page.json`, "utf8")).url;
} else {
  url = args[0];
  if (!url) throw new Error("Usage: npm run report -- <url> | --from runs/<folder>");
  dir = `runs/${new URL(url).hostname.replace(/\W+/g, "-")}-${new Date().toISOString().slice(0, 19).replace(/\D/g, "")}`;
  mkdirSync(dir, { recursive: true });
}

const claude = new Anthropic({ apiKey: ssmEnv("whowouldlove.env").ANTHROPIC_API_KEY });
const qlooEnv = ssmEnv("qloo.env");
const qloo = new Qloo(qlooEnv.QLOO_API_KEY, qlooEnv.QLOO_API_URL);

const page = await step<ScrapedPage>(`${dir}/00-page.json`, "1a. Read page (Firecrawl)", () => scrapePage(url, ssmEnv("firecrawl.env").FIRECRAWL_API_KEY));

const profile = await step<ProductProfile>(`${dir}/01-profile.json`, "1b. Understand product (Opus)", async () => {
  const r = await readProduct(page, claude);
  console.log(`    ${charge(r.usage)}`);
  return r.profile;
});

const taste = await step<TasteData>(`${dir}/02-taste.json`, "2. Taste data (Qloo)", async () => {
  const t = Date.now();
  const resolved = await resolveSeeds(profile, qloo, claude);
  console.log(`    seeds checked in ${secs(t)}, ${charge(resolved.usage)}, markets: ${resolved.markets.join(", ")}`);
  for (const seg of resolved.segments) {
    console.log(`    ${seg.name}: ${seg.confirmed.map((s) => s.qloo_name).join(" · ")}`);
    for (const r of seg.rejected) console.log(`      rejected ${r.name}: ${r.reason}`);
  }
  return gatherTaste(resolved, qloo, (m) => console.log(`    ${m} (${secs(t)})`));
});

const communities = await step<Community[]>(`${dir}/03-communities.json`, "3. Communities (Opus + web search)", async () => {
  const results = await Promise.all(taste.segments.map((seg) => findCommunities(profile, seg, claude)));
  results.forEach((r, i) => console.log(`    ${taste.segments[i].name}: ${r.places.length} places, ${r.usage.searches} searches, ${charge(r.usage)}`));
  return results.flatMap((r) => r.places);
});
for (const c of communities) console.log(`    ${c.link_ok ? "ok " : "BAD"} [${c.segment}] ${c.platform} ${c.name} ${c.size ?? ""} ${c.url}`);


const spec = await step<ReportSpec>(`${dir}/04-spec.json`, "4. Write report (Opus)", async () => {
  const r = await writeReport(profile, taste, communities, claude);
  console.log(`    ${charge(r.usage)}`);
  return r.spec;
});
const date = new Date().toISOString().slice(0, 10);
const id = "WWL-" + dir.split("-").pop()!.slice(-6);
writeFileSync(`${dir}/report.html`, renderReport({ page, profile, taste, communities, spec, date, id }));
console.log(`5. Rendered ${dir}/report.html. Spent this run: about $${spent.toFixed(2)}`);
