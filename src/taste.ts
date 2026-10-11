// Step 2 of the pipeline: turn the product profile into Qloo taste data.
// 1. Look up each proposed seed in Qloo and let the model confirm the right match (or reject it).
// 2. Use the confirmed entities as signals to ask Qloo what else this audience loves,
//    how it skews by age and gender, and where in a market the taste is strongest.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, type ProductProfile } from "./read-product.js";
import type { Qloo } from "./qloo.js";

const AFFINITY_TYPES = ["brand", "book", "movie", "tv_show", "podcast", "artist", "person", "destination"] as const; // video_game is not accepted by insights here

interface Candidate { id: string; name: string; description: string; year?: number; popularity: number; tags: string[] }

export interface ConfirmedSeed { seed: string; type: string; entity_id: string; qloo_name: string; why: string }
export interface Affinity { name: string; entity_id: string; affinity: number; description: string }
export interface Place { label: string; latitude: number; longitude: number; affinity: number }

export interface TasteData {
  seeds: { confirmed: ConfirmedSeed[]; rejected: { seed: string; type: string; reason: string }[] };
  tags: { query: string; tag_id: string; name: string }[];
  affinities: Record<string, Affinity[]>;
  weak_types: string[];
  demographics: { age: Record<string, number>; gender: Record<string, number> } | null;
  places: Record<string, Place[]>;
}

const Verdict = z.object({
  entities: z.array(z.object({
    seed: z.string(),
    entity_id: z.string().nullable().describe("The id of the matching candidate, or null if none is the intended thing."),
    reason: z.string(),
  })),
  tags: z.array(z.object({
    query: z.string(),
    tag_id: z.string().nullable(),
  })),
  markets: z.array(z.string()).describe("1 to 3 countries where this product most plausibly sells, by English country name."),
});

function candidate(e: any): Candidate {
  return {
    id: e.entity_id,
    name: e.name,
    description: e.properties?.short_description ?? e.disambiguation ?? "",
    year: e.properties?.publication_year ?? e.properties?.release_year,
    popularity: Math.round((e.popularity ?? 0) * 1000) / 1000,
    tags: (e.tags ?? []).slice(0, 4).map((t: any) => t.name),
  };
}

export async function resolveSeeds(profile: ProductProfile, qloo: Qloo, claude: Anthropic) {
  const entityCandidates = await Promise.all(profile.qloo_seed_entities.map(async (s) => ({
    seed: s, candidates: ((await qloo.search(s.name, `urn:entity:${s.type}`)).results ?? []).map(candidate) as Candidate[],
  })));
  const tagCandidates = await Promise.all(profile.qloo_tag_queries.map(async (q) => ({
    query: q, candidates: (((await qloo.tags(q)).results?.tags) ?? []).map((t: any) => ({ id: t.id, name: t.name, type: t.type })),
  })));

  const response = await claude.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(Verdict) },
    system: `You check catalogue matches for Who Would Love. For each seed, pick the candidate that is exactly the thing the seed means (same work, same company, same person). Catalogue search is fuzzy and often returns unrelated items with similar words: reject them by returning null. Never pick a candidate just because it is popular. For tags, pick the candidate that best matches the theme, or null if none does. Also name the markets where the product most plausibly sells.`,
    messages: [{
      role: "user",
      content: JSON.stringify({
        product: { name: profile.name, one_liner: profile.one_liner, page_language: profile.page_language, pricing: profile.pricing },
        seeds: entityCandidates.map(({ seed, candidates }) => ({ seed: seed.name, type: seed.type, meant_because: seed.why, candidates })),
        tags: tagCandidates,
      }),
    }],
  });
  const verdict = response.parsed_output;
  if (!verdict) throw new Error(`Seed check failed (stop_reason: ${response.stop_reason})`);

  const confirmed: ConfirmedSeed[] = [];
  const rejected: TasteData["seeds"]["rejected"] = [];
  for (const { seed, candidates } of entityCandidates) {
    const v = verdict.entities.find((x) => x.seed === seed.name);
    const match = v?.entity_id ? candidates.find((c) => c.id === v.entity_id) : undefined;
    if (match) confirmed.push({ seed: seed.name, type: seed.type, entity_id: match.id, qloo_name: match.name, why: seed.why });
    else rejected.push({ seed: seed.name, type: seed.type, reason: v?.reason ?? "no verdict" });
  }
  const tags = tagCandidates.flatMap(({ query, candidates }) => {
    const id = verdict.tags.find((t) => t.query === query)?.tag_id;
    const tag = candidates.find((c: any) => c.id === id);
    return tag ? [{ query, tag_id: tag.id, name: tag.name }] : [];
  });
  return { confirmed, rejected, tags, markets: verdict.markets, usage: response.usage };
}

// Nominatim (OpenStreetMap) turns heatmap coordinates into readable place names.
async function placeName(lat: number, lon: number): Promise<string> {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`, {
    headers: { "User-Agent": "WhoWouldLove/0.1 (Qloo hackathon demo)", "Accept-Language": "en" },
  });
  if (!res.ok) return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  const a = ((await res.json()) as any).address ?? {};
  const city = a.city ?? a.town ?? a.county ?? a.state_district ?? "";
  return [city, a.state ?? a.country].filter(Boolean).join(", ") || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

async function wherePopular(signal: string, market: string, qloo: Qloo): Promise<Place[]> {
  const body = await qloo.insights({
    "filter.type": "urn:heatmap", "signal.interests.entities": signal, "filter.location.query": market, take: 40,
  });
  const cells = [...(body.results?.heatmap ?? [])].sort((a: any, b: any) => b.query.affinity - a.query.affinity);
  const places: Place[] = [];
  for (const c of cells) {
    if (places.length >= 6) break;
    const label = await placeName(c.location.latitude, c.location.longitude);
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim allows one request per second
    if (places.some((p) => p.label === label)) continue;
    places.push({ label, latitude: c.location.latitude, longitude: c.location.longitude, affinity: c.query.affinity });
  }
  return places;
}

export async function gatherTaste(seeds: ConfirmedSeed[], markets: string[], qloo: Qloo) {
  const signal = seeds.map((s) => s.entity_id).join(",");
  const seedIds = new Set(seeds.map((s) => s.entity_id));

  const affinities: Record<string, Affinity[]> = {};
  const weak: string[] = [];
  await Promise.all(AFFINITY_TYPES.map(async (type) => {
    const body = await qloo.insights({ "filter.type": `urn:entity:${type}`, "signal.interests.entities": signal, take: 15 })
      .catch(() => ({ results: { entities: [] } }));
    const list: Affinity[] = (body.results?.entities ?? [])
      .filter((e: any) => !seedIds.has(e.entity_id))
      .map((e: any) => ({
        name: e.name, entity_id: e.entity_id,
        affinity: Math.round((e.query?.affinity ?? 0) * 1000) / 1000,
        description: e.properties?.short_description ?? e.disambiguation ?? "",
      }));
    // Identical scores across the list mean Qloo had no real signal for this type.
    if (list.length > 2 && new Set(list.map((a) => a.affinity)).size === 1) weak.push(type);
    affinities[type] = list.slice(0, 12);
  }));

  const demo = await qloo.insights({ "filter.type": "urn:demographics", "signal.interests.entities": signal });
  const d = demo.results?.demographics?.[0]?.query;

  const places: Record<string, Place[]> = {};
  for (const m of markets) places[m] = await wherePopular(signal, m, qloo).catch(() => []);

  return { affinities, weak_types: weak, demographics: d ? { age: d.age, gender: d.gender } : null, places };
}
