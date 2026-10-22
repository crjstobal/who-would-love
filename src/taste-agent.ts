// Step 2b of the pipeline: an agent investigates one audience segment in Qloo's taste graph.
// It starts from the segment's confirmed seeds and decides what to ask next: which entity types to read,
// mainstream or niche, inside the primary market or worldwide, and whether a seed is distorting the
// signal (it can drop seeds, add ones it finds, or add Qloo tags) before reading again.
// Every Qloo answer lands in a ledger, and the report is built from the ledger, never from the model's
// words, so numbers stay real. Each call is kept as a trail step that the report shows.
// If the agent fails, the fixed reading in taste.ts runs instead, so a report never depends on it.

import Anthropic from "@anthropic-ai/sdk";
import { MODEL, type ProductProfile } from "./read-product.js";
import type { Qloo } from "./qloo.js";
import {
  AFFINITY_TYPES, NICHE, demographics, gatherSegment, toAffinity, wherePopular,
  type Affinity, type ConfirmedSeed, type Demographics, type Place, type RejectedSeed, type ResolvedSegment, type SegmentTaste, type TrailStep,
} from "./taste.js";

const QLOO_BUDGET = 24;
const MAX_TURNS = 16;
const BANDS = ["mainstream", "niche", "in_market"] as const;
type Band = (typeof BANDS)[number];

const why = { type: "string", description: "One sentence: why this call, given what you have seen so far. Shown to the reader of the report." } as const;
const tool = (name: string, description: string, properties: Record<string, unknown>): Anthropic.Tool => ({
  name, description, strict: true,
  input_schema: { type: "object", properties: { ...properties, why }, required: [...Object.keys(properties), "why"], additionalProperties: false },
});

const TOOLS: Anthropic.Tool[] = [
  tool("get_affinities", "What else this audience loves, for one entity type, read from the current signal. 'mainstream' is global, 'niche' keeps only mid-popularity entities (skips household names), 'in_market' reads it inside the primary market. Returns up to 10 entities with affinity (0 to 1) and popularity; 'flat' means Qloo had no real signal for this type.", {
    type: { type: "string", enum: [...AFFINITY_TYPES] },
    band: { type: "string", enum: [...BANDS] },
  }),
  tool("get_demographics", "How the current signal leans by age and gender, compared with the average (-1 to +1, 0 is average).", {}),
  tool("get_heatmap", "Where in the primary market the current signal's taste is strongest. Returns up to 5 named areas.", {}),
  tool("search_entities", "Search Qloo's catalogue for an entity (a brand, artist, show...) that could sharpen the signal. Returns candidates with ids; add one with set_signal only if it is exactly the thing you mean.", {
    name: { type: "string" },
    type: { type: "string", enum: [...AFFINITY_TYPES] },
  }),
  tool("find_tags", "Search Qloo tags (themes such as 'minimalism' or 'long distance relationship') that could sharpen the signal. Returns tag ids.", {
    query: { type: "string" },
  }),
  tool("set_signal", "Replace the signal that the read tools use. Use ids from the confirmed seeds or from your search results only. Earlier reads stay in the ledger but are overwritten when you read the same type and band again, so re-read what you will rely on after changing the signal.", {
    entity_ids: { type: "array", items: { type: "string" } },
    tag_ids: { type: "array", items: { type: "string" } },
  }),
];

const SYSTEM = `You are the taste analyst of Who Would Love. You investigate one audience segment of a product in Qloo's taste graph, so that a report can tell the maker what this audience loves, how it leans and where it lives.

You have a budget of ${QLOO_BUDGET} Qloo calls. Spend it where it teaches the most about this audience:
- Start from the confirmed seeds as the signal. Read the types that matter for this product first.
- Read niche lists, not only mainstream: specific, mid-popularity picks are what a maker can act on (sponsor, target, reference in an ad).
- Check the primary market with in_market when it could differ from the global picture.
- Watch for a signal that misleads: a seed loved mostly abroad that drags results to another country, results that are clearly about another audience, or flat scores. When you see one, change the signal (drop a seed, add an entity you searched and confirmed, or add a tag) and read again.
- Before you finish, make sure the ledger holds demographics, the heatmap, and mainstream and niche reads for at least five types.

When you are done, reply with no tool call: one plain paragraph of at most 90 words, no markdown, on what you learned about this audience, what you changed and why, and what to trust less. Write as "we", never "I". No em dashes. Never describe an individual; Qloo describes groups.`;

interface Ledger {
  affinities: SegmentTaste["affinities"];
  demographics: Demographics | null;
  places: Place[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function investigateSegment(
  profile: ProductProfile, seg: ResolvedSegment, primary: string, exclude: string[], tags: { tag_id: string; name: string }[], qloo: Qloo, claude: Anthropic,
) {
  const usage = { input_tokens: 0, output_tokens: 0 };
  if (seg.confirmed.length === 0) return { taste: null, usage };
  try {
    return { taste: await run(profile, seg, primary, exclude, tags, qloo, claude, usage), usage };
  } catch (e) {
    console.error(`Taste agent failed for "${seg.name}", using the fixed reading:`, e);
    return { taste: await gatherSegment(seg, primary, exclude, qloo), usage };
  }
}

async function run(
  profile: ProductProfile, seg: ResolvedSegment, primary: string, exclude: string[], tags: { tag_id: string; name: string }[], qloo: Qloo, claude: Anthropic,
  usage: { input_tokens: number; output_tokens: number },
): Promise<SegmentTaste> {
  // Everything the agent may put in the signal, by id: confirmed seeds now, search results later.
  const known = new Map<string, ConfirmedSeed>(seg.confirmed.map((s) => [s.entity_id, s]));
  const knownTags = new Map(tags.map((t) => [t.tag_id, t.name]));
  let signal = { entities: seg.confirmed.map((s) => s.entity_id), tags: [] as string[], why: "" };
  const skip = new Set(exclude);
  const ledger: Ledger = { affinities: {}, demographics: null, places: [] };
  const trail: TrailStep[] = [];
  let calls = 0;

  const ents = () => signal.entities.join(",");
  const tagList = () => signal.tags.join(",");
  const brief = (l: Affinity[]) => l.map((a) => ({ id: a.entity_id, name: a.name, affinity: a.affinity, popularity: a.popularity }));
  const top = (l: Affinity[]) => l.length ? l.slice(0, 3).map((a) => `${a.name} (${a.affinity.toFixed(2)})`).join(", ") : "nothing";

  async function call(name: string, input: any): Promise<unknown> {
    if (name !== "set_signal" && ++calls > QLOO_BUDGET) return { error: "Qloo budget spent. Finish now with your summary." };
    switch (name) {
      case "get_affinities": {
        const type = input.type as (typeof AFFINITY_TYPES)[number];
        const band = input.band as Band;
        const extra = band === "niche" ? { "filter.popularity.min": NICHE.min, "filter.popularity.max": NICHE.max }
          : band === "in_market" ? { "signal.location.query": primary } : {};
        const body = await qloo.insights({
          "filter.type": `urn:entity:${type}`, "signal.interests.entities": ents() || undefined, "signal.interests.tags": tagList() || undefined, take: 15, ...extra,
        });
        const list = ((body.results?.entities ?? []).map(toAffinity) as Affinity[]).filter((a) => !skip.has(a.entity_id) && !signal.entities.includes(a.entity_id)).slice(0, 10);
        const flat = list.length > 2 && new Set(list.map((a) => a.affinity)).size === 1;
        ledger.affinities[type] ??= { mainstream: [], niche: [], in_market: [] };
        ledger.affinities[type][band] = list;
        trail.push({ tool: name, ask: `${type}, ${band.replace("_", " ")}`, why: input.why, saw: flat ? "flat scores, no real signal" : top(list) });
        return { type, band, flat, entities: brief(list) };
      }
      case "get_demographics": {
        ledger.demographics = await demographics(ents(), qloo, tagList());
        const d = ledger.demographics;
        const lean = d ? Object.entries({ ...d.age, ...d.gender }).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2).map(([k, v]) => `${k.replace(/_/g, " ")} ${v > 0 ? "+" : ""}${v.toFixed(2)}`).join(", ") : "no data";
        trail.push({ tool: name, ask: "age and gender lean", why: input.why, saw: `strongest: ${lean}` });
        return d ?? { error: "Qloo returned no demographics for this signal." };
      }
      case "get_heatmap": {
        ledger.places = await wherePopular(ents(), primary, 5, qloo, tagList());
        trail.push({ tool: name, ask: `where in ${primary}`, why: input.why, saw: ledger.places.map((p) => p.label).join("; ") || "nothing" });
        return ledger.places.map((p) => ({ label: p.label, affinity: p.affinity }));
      }
      case "search_entities": {
        const body = await qloo.search(input.name, `urn:entity:${input.type}`);
        const found = (body.results ?? []).map((e: any) => ({
          id: e.entity_id, name: e.name, popularity: r3(e.popularity ?? 0), description: e.properties?.short_description ?? e.disambiguation ?? "",
        }));
        for (const f of found) if (!known.has(f.id)) known.set(f.id, { name: input.name, type: input.type, entity_id: f.id, qloo_name: f.name, why: "" });
        trail.push({ tool: name, ask: `${input.type} "${input.name}"`, why: input.why, saw: found.slice(0, 3).map((f: any) => f.name).join(", ") || "no match" });
        return found;
      }
      case "find_tags": {
        const body = await qloo.tags(input.query);
        const found = (body.results?.tags ?? []).map((t: any) => ({ id: t.id, name: t.name }));
        for (const t of found) knownTags.set(t.id, t.name);
        trail.push({ tool: name, ask: `"${input.query}"`, why: input.why, saw: found.slice(0, 3).map((t: any) => t.name).join(", ") || "no match" });
        return found;
      }
      case "set_signal": {
        const entities = (input.entity_ids as string[]).filter((id) => known.has(id));
        const tagIds = (input.tag_ids as string[]).filter((id) => knownTags.has(id));
        const unknown = [...(input.entity_ids as string[]), ...(input.tag_ids as string[])].filter((id) => !known.has(id) && !knownTags.has(id));
        if (entities.length + tagIds.length === 0) return { error: "The signal needs at least one known entity or tag id." };
        signal = { entities, tags: tagIds, why: input.why };
        const names = [...entities.map((id) => known.get(id)!.qloo_name), ...tagIds.map((id) => `#${knownTags.get(id)}`)];
        trail.push({ tool: name, ask: names.join(", "), why: input.why, saw: unknown.length ? `ignored unknown ids: ${unknown.join(", ")}` : "signal changed" });
        return { signal: names, ...(unknown.length ? { ignored_unknown_ids: unknown } : {}) };
      }
    }
    return { error: `Unknown tool ${name}` };
  }

  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: JSON.stringify({
      product: { name: profile.name, one_liner: profile.one_liner, pricing: profile.pricing },
      segment: { name: seg.name, description: seg.description, evidence: seg.evidence },
      confirmed_seeds: seg.confirmed.map((s) => ({ id: s.entity_id, name: s.qloo_name, type: s.type, why: s.why })),
      tags_matched_for_the_product: tags.map((t) => ({ id: t.tag_id, name: t.name })),
      primary_market: primary,
    }),
  }];

  let findings: string | null = null;
  for (let turn = 0; turn < MAX_TURNS && findings === null; turn++) {
    const response = await claude.messages.create({
      model: MODEL, max_tokens: 16000, output_config: { effort: "medium" }, system: SYSTEM, tools: TOOLS, messages,
    });
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "tool_use") {
      // Run calls in order: a set_signal must apply before the reads that follow it.
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        try {
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(await call(block.name, block.input)) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: e instanceof Error ? e.message : String(e) });
        }
      }
      messages.push({ role: "user", content: results });
    } else if (response.stop_reason === "end_turn") {
      findings = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim() || null;
      if (findings === null) break;
    } else {
      throw new Error(`Taste agent stopped early (stop_reason: ${response.stop_reason})`);
    }
  }

  // The report needs these three; fill in what the agent left out, from its final signal.
  if (!ledger.demographics) ledger.demographics = await demographics(ents(), qloo, tagList());
  if (!ledger.places.length) ledger.places = await wherePopular(ents(), primary, 5, qloo, tagList());
  if (Object.keys(ledger.affinities).length === 0) throw new Error("The taste agent read no affinities");

  const weak = Object.entries(ledger.affinities)
    .filter(([, l]) => l.mainstream.length > 2 && new Set(l.mainstream.map((a) => a.affinity)).size === 1).map(([type]) => type);
  const seeds = signal.entities.map((id) => {
    const s = known.get(id)!;
    return s.why ? s : { ...s, why: signal.why };
  });
  const dropped: RejectedSeed[] = seg.confirmed.filter((s) => !signal.entities.includes(s.entity_id))
    .map((s) => ({ name: s.qloo_name, type: s.type, reason: signal.why }));

  return {
    name: seg.name, description: seg.description, evidence: seg.evidence,
    seeds, rejected: seg.rejected, dropped, affinities: ledger.affinities, weak,
    demographics: ledger.demographics, places: ledger.places, trail, findings,
  };
}
