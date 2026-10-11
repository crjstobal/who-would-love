// Local runner: loads keys from AWS SSM into memory (never to disk) and runs the pipeline on one URL.
// Usage: npm run read -- <url>
//        npm run read -- --from runs/<folder>   (reuse a saved page read, skip Firecrawl and step 1)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { scrapePage } from "../src/firecrawl.js";
import { readProduct, type ProductProfile } from "../src/read-product.js";
import { Qloo } from "../src/qloo.js";
import { gatherTaste, resolveSeeds } from "../src/taste.js";

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

const usd = (u: Anthropic.Usage) => (u.input_tokens * 4 + u.output_tokens * 20) / 1e6;
const secs = (t: number) => ((Date.now() - t) / 1000).toFixed(1) + "s";

const args = process.argv.slice(2);
const claude = new Anthropic({ apiKey: ssmEnv("whowouldlove.env").ANTHROPIC_API_KEY });
const qlooEnv = ssmEnv("qloo.env");
const qloo = new Qloo(qlooEnv.QLOO_API_KEY, qlooEnv.QLOO_API_URL);

let dir: string;
let profile: ProductProfile;
let t = Date.now();
if (args[0] === "--from") {
  dir = args[1].replace(/\/$/, "");
  profile = JSON.parse(readFileSync(`${dir}/01-profile.json`, "utf8"));
  console.log(`Reusing ${dir}/01-profile.json (${profile.name})`);
} else {
  const url = args[0];
  if (!url) throw new Error("Usage: npm run read -- <url> | --from runs/<folder>");
  dir = `runs/${new URL(url).hostname.replace(/\W+/g, "-")}-${new Date().toISOString().slice(0, 19).replace(/\D/g, "")}`;
  mkdirSync(dir, { recursive: true });
  const page = await scrapePage(url, ssmEnv("firecrawl.env").FIRECRAWL_API_KEY);
  writeFileSync(`${dir}/00-page.md`, `# ${page.title}\n\n${page.markdown}`);
  console.log(`1a. Scraped ${page.markdown.length} chars in ${secs(t)}: ${page.title}`);
  t = Date.now();
  const read = await readProduct(page, claude);
  profile = read.profile;
  writeFileSync(`${dir}/01-profile.json`, JSON.stringify(profile, null, 2));
  console.log(`1b. Read product in ${secs(t)}, about $${usd(read.usage).toFixed(3)}`);
}

t = Date.now();
const seeds = await resolveSeeds(profile, qloo, claude);
console.log(`2a. Checked seeds in ${secs(t)}, about $${usd(seeds.usage).toFixed(3)}`);
for (const s of seeds.confirmed) console.log(`    OK  ${s.seed} -> ${s.qloo_name}`);
for (const s of seeds.rejected) console.log(`    NO  ${s.seed}: ${s.reason}`);
console.log(`    tags: ${seeds.tags.map((x) => x.name).join(", ")} | markets: ${seeds.markets.join(", ")}`);

t = Date.now();
const taste = await gatherTaste(seeds.confirmed, seeds.markets, qloo);
writeFileSync(`${dir}/02-taste.json`, JSON.stringify({ seeds: { confirmed: seeds.confirmed, rejected: seeds.rejected }, tags: seeds.tags, markets: seeds.markets, ...taste }, null, 2));
console.log(`2b. Qloo taste data in ${secs(t)}${taste.weak_types.length ? `, weak signal for: ${taste.weak_types.join(", ")}` : ""}`);
for (const [type, list] of Object.entries(taste.affinities)) console.log(`    [${type}] ${list.slice(0, 7).map((a) => `${a.name} ${Math.round(a.affinity * 100)}`).join(" · ")}`);
console.log(`    demographics: ${JSON.stringify(taste.demographics)}`);
for (const [m, list] of Object.entries(taste.places)) console.log(`    [${m}] ${list.map((p) => p.label).join(" · ")}`);
console.log(`Saved to ${dir}`);
