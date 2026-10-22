// Step 2 of the pipeline: turn the product profile into Qloo taste data, one audience segment at a time.
// 1. Look up every proposed seed in Qloo and let the model confirm the right match (or reject it).
// 2. For each segment, use its confirmed seeds as signals and ask Qloo what else that audience loves
//    (a mainstream band and a niche band), how it skews by age and gender, and where it is strongest.
// 3. Do the same "where" and "who" questions for the whole audience across the likely markets.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, type ProductProfile } from "./read-product.js";
import type { Qloo } from "./qloo.js";

export const AFFINITY_TYPES = ["brand", "book", "movie", "tv_show", "podcast", "artist", "person", "videogame", "destination"] as const;
// Popularity band for the niche list: high enough to be real, low enough to skip household names.
export const NICHE = { min: 0.3, max: 0.9 };

interface Candidate { id: string; name: string; description: string; year?: number; popularity: number; tags: string[] }

export interface ConfirmedSeed { name: string; type: string; entity_id: string; qloo_name: string; why: string }
export interface RejectedSeed { name: string; type: string; reason: string }
export interface Affinity { name: string; entity_id: string; affinity: number; popularity: number; description: string }
export interface Place { label: string; latitude: number; longitude: number; affinity: number }
export interface Demographics { age: Record<string, number>; gender: Record<string, number> }

export interface SegmentTaste {
  name: string;
  description: string;
  evidence: string;
  seeds: ConfirmedSeed[];
  rejected: RejectedSeed[];
  affinities: Record<string, { mainstream: Affinity[]; niche: Affinity[]; in_market: Affinity[] }>;
  weak: string[];
  demographics: Demographics | null;
  places: Place[];
  // Set when the taste agent read this segment (see taste-agent.ts); absent on the fixed fallback.
  dropped?: RejectedSeed[];
  trail?: TrailStep[];
  findings?: string | null;
}

// One question the taste agent asked Qloo: which tool, what it asked, why, and what came back.
export interface TrailStep { tool: string; ask: string; why: string; saw: string }

export interface TasteData {
  markets: string[];
  tags: { query: string; tag_id: string; name: string }[];
  segments: SegmentTaste[];
  overall: { demographics: Demographics | null; places: Record<string, Place[]> };
}

const Verdict = z.object({
  entities: z.array(z.object({
    key: z.string().describe("The key of the seed, copied exactly."),
    entity_id: z.string().nullable().describe("The id of the matching candidate, or null if none is the intended thing."),
    reason: z.string(),
  })),
  tags: z.array(z.object({ query: z.string(), tag_id: z.string().nullable() })),
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

const seedKey = (s: { name: string; type: string }) => `${s.type}:${s.name}`;

export async function resolveSeeds(profile: ProductProfile, qloo: Qloo, claude: Anthropic) {
  // The same seed can appear in two segments; look it up once.
  const unique = new Map<string, ProductProfile["segments"][number]["seeds"][number]>();
  for (const seg of profile.segments) for (const s of seg.seeds) if (!unique.has(seedKey(s))) unique.set(seedKey(s), s);

  const entityCandidates = await Promise.all([...unique.entries()].map(async ([key, s]) => ({
    // A failed lookup only drops that seed (it is reported as rejected), never the whole report.
    key, seed: s, candidates: ((await qloo.search(s.name, `urn:entity:${s.type}`).catch(() => ({}))).results ?? []).map(candidate) as Candidate[],
  })));
  const tagCandidates = await Promise.all(profile.qloo_tag_queries.map(async (q) => ({
    query: q, candidates: (((await qloo.tags(q).catch(() => ({}))).results?.tags) ?? []).map((t: any) => ({ id: t.id, name: t.name, type: t.type })),
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
        seeds: entityCandidates.map(({ key, seed, candidates }) => ({ key, meant_because: seed.why, candidates })),
        tags: tagCandidates,
      }),
    }],
  });
  const verdict = response.parsed_output;
  if (!verdict) throw new Error(`Seed check failed (stop_reason: ${response.stop_reason})`);

  const matches = new Map<string, Candidate | null>();
  const reasons = new Map<string, string>();
  for (const { key, candidates } of entityCandidates) {
    const v = verdict.entities.find((x) => x.key === key);
    matches.set(key, (v?.entity_id && candidates.find((c) => c.id === v.entity_id)) || null);
    reasons.set(key, v?.reason ?? "no verdict");
  }
  const segments = profile.segments.map((seg) => ({
    ...seg,
    confirmed: seg.seeds.flatMap((s): ConfirmedSeed[] => {
      const m = matches.get(seedKey(s));
      return m ? [{ name: s.name, type: s.type, entity_id: m.id, qloo_name: m.name, why: s.why }] : [];
    }),
    rejected: seg.seeds.filter((s) => !matches.get(seedKey(s))).map((s) => ({ name: s.name, type: s.type, reason: reasons.get(seedKey(s))! })),
  }));
  const tags = tagCandidates.flatMap(({ query, candidates }) => {
    const id = verdict.tags.find((t) => t.query === query)?.tag_id;
    const tag = candidates.find((c: any) => c.id === id);
    return tag ? [{ query, tag_id: tag.id, name: tag.name }] : [];
  });
  return { segments, tags, markets: verdict.markets, usage: response.usage };
}

// Nominatim (OpenStreetMap) turns heatmap coordinates into readable place names.
// It allows one request per second, so lookups are cached and spaced out.
const placeCache = new Map<string, string>();
async function placeName(lat: number, lon: number): Promise<string> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = placeCache.get(key);
  if (hit) return hit;
  await new Promise((r) => setTimeout(r, 1100));
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`, {
    headers: { "User-Agent": "WhoWouldLove/0.1 (Qloo hackathon demo)", "Accept-Language": "en" },
  });
  let label = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  if (res.ok) {
    const a = ((await res.json()) as any).address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state_district ?? "";
    label = [city, a.state ?? a.country].filter(Boolean).join(", ") || label;
  }
  placeCache.set(key, label);
  return label;
}

export async function wherePopular(signal: string, market: string, max: number, qloo: Qloo, tags = ""): Promise<Place[]> {
  const body = await qloo.insights({
    "filter.type": "urn:heatmap", "signal.interests.entities": signal || undefined, "signal.interests.tags": tags || undefined,
    "filter.location.query": market, take: 30,
  }).catch(() => ({}));
  const cells = [...(body.results?.heatmap ?? [])].sort((a: any, b: any) => b.query.affinity - a.query.affinity);
  const places: Place[] = [];
  for (const c of cells.slice(0, max * 2)) {
    if (places.length >= max) break;
    const label = await placeName(c.location.latitude, c.location.longitude);
    if (places.some((p) => p.label === label)) continue;
    places.push({ label, latitude: c.location.latitude, longitude: c.location.longitude, affinity: Math.round(c.query.affinity * 1000) / 1000 });
  }
  return places;
}

export async function demographics(signal: string, qloo: Qloo, tags = ""): Promise<Demographics | null> {
  const body = await qloo.insights({
    "filter.type": "urn:demographics", "signal.interests.entities": signal || undefined, "signal.interests.tags": tags || undefined,
  }).catch(() => ({}));
  const d = body.results?.demographics?.[0]?.query;
  return d ? { age: d.age, gender: d.gender } : null;
}

export function toAffinity(e: any): Affinity {
  return {
    name: e.name, entity_id: e.entity_id,
    affinity: Math.round((e.query?.affinity ?? 0) * 1000) / 1000,
    popularity: Math.round((e.popularity ?? 0) * 1000) / 1000,
    description: e.properties?.short_description ?? e.disambiguation ?? "",
  };
}

// Three lists per type: global, a niche popularity band, and read inside the primary market
// (so a seed loved abroad, e.g. Muji in Japan, cannot drag every result to another country).
// The report writer picks from all three.
async function affinities(signal: string, market: string, exclude: Set<string>, qloo: Qloo) {
  const out: SegmentTaste["affinities"] = {};
  const weak: string[] = [];
  await Promise.all(AFFINITY_TYPES.map(async (type) => {
    const ask = (extra: Record<string, string | number>) => qloo.insights({
      "filter.type": `urn:entity:${type}`, "signal.interests.entities": signal, take: 15, ...extra,
    }).then((b) => (b.results?.entities ?? []).map(toAffinity).filter((a: Affinity) => !exclude.has(a.entity_id)) as Affinity[])
      .catch(() => [] as Affinity[]);
    const [mainstream, nicheAll, local] = await Promise.all([
      ask({}),
      ask({ "filter.popularity.min": NICHE.min, "filter.popularity.max": NICHE.max }),
      ask({ "signal.location.query": market }),
    ]);
    const niche = nicheAll.filter((a) => !mainstream.some((m) => m.entity_id === a.entity_id));
    // Identical scores across a list mean Qloo had no real signal for this type.
    if (mainstream.length > 2 && new Set(mainstream.map((a) => a.affinity)).size === 1) weak.push(type);
    out[type] = { mainstream: mainstream.slice(0, 10), niche: niche.slice(0, 10), in_market: local.slice(0, 10) };
  }));
  return { affinities: out, weak };
}

export type Resolved = Awaited<ReturnType<typeof resolveSeeds>>;
export type ResolvedSegment = Resolved["segments"][number];

export const allSeedIds = (resolved: Resolved) => [...new Set(resolved.segments.flatMap((s) => s.confirmed.map((c) => c.entity_id)))];

// One segment's taste: what else they love, how they lean, and where in the primary market.
export async function gatherSegment(seg: ResolvedSegment, primary: string, exclude: string[], qloo: Qloo): Promise<SegmentTaste | null> {
  if (seg.confirmed.length === 0) return null;
  const signal = seg.confirmed.map((s) => s.entity_id).join(",");
  const [{ affinities: aff, weak }, demo] = await Promise.all([affinities(signal, primary, new Set(exclude), qloo), demographics(signal, qloo)]);
  const places = await wherePopular(signal, primary, 5, qloo);
  return {
    name: seg.name, description: seg.description, evidence: seg.evidence,
    seeds: seg.confirmed, rejected: seg.rejected, affinities: aff, weak, demographics: demo, places,
  };
}

// The whole audience at once, across every likely market.
export async function gatherOverall(resolved: Resolved, qloo: Qloo): Promise<TasteData["overall"]> {
  const signal = allSeedIds(resolved).join(",");
  const places: Record<string, Place[]> = {};
  for (const m of resolved.markets) places[m] = await wherePopular(signal, m, 6, qloo);
  return { demographics: await demographics(signal, qloo), places };
}
