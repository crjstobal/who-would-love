// Local runner: loads keys from AWS SSM into memory (never to disk) and runs the pipeline on one URL.
// Usage: npm run read -- <url>

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { scrapePage } from "../src/firecrawl.js";
import { readProduct } from "../src/read-product.js";

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

const url = process.argv[2];
if (!url) throw new Error("Usage: npm run read -- <url>");

const anthropic = new Anthropic({ apiKey: ssmEnv("whowouldlove.env").ANTHROPIC_API_KEY });
const firecrawlKey = ssmEnv("firecrawl.env").FIRECRAWL_API_KEY;

const slug = new URL(url).hostname.replace(/\W+/g, "-") + "-" + new Date().toISOString().slice(0, 19).replace(/\D/g, "");
const dir = `runs/${slug}`;
mkdirSync(dir, { recursive: true });

let t = Date.now();
const page = await scrapePage(url, firecrawlKey);
writeFileSync(`${dir}/00-page.md`, `# ${page.title}\n\n${page.markdown}`);
console.log(`Scraped ${page.markdown.length} chars in ${((Date.now() - t) / 1000).toFixed(1)}s: ${page.title}`);

t = Date.now();
const { profile, usage } = await readProduct(page, anthropic);
writeFileSync(`${dir}/01-profile.json`, JSON.stringify(profile, null, 2));
const cost = (usage.input_tokens * 4 + usage.output_tokens * 20) / 1e6;
console.log(`Read in ${((Date.now() - t) / 1000).toFixed(1)}s, ${usage.input_tokens} in / ${usage.output_tokens} out tokens, about $${cost.toFixed(3)}`);
console.log(`Saved to ${dir}`);
console.log(JSON.stringify(profile, null, 2));
