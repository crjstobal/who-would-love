// Step 5 of the pipeline, after the report is saved: an ad kit for each audience.
// A creative director agent turns the audience's Qloo taste into ad concepts, channel versions and
// city variants. It can ask Qloo what this audience loves in a specific place, and it hands every
// draft to a critic (one of its tools) that it cannot talk past: code checks that each cited entity
// is real Qloo data for this audience and that every community and podcast comes from the report,
// then a second model checks for clichés, stereotypes and claims the product page does not support.
// The director revises until the critic approves or the rounds run out.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, type ProductProfile } from "./read-product.js";
import type { Qloo } from "./qloo.js";
import { AFFINITY_TYPES, toAffinity, type Affinity, type SegmentTaste, type TrailStep } from "./taste.js";
import type { Community } from "./communities.js";
import type { ReportSpec } from "./write-report.js";

const LOCAL_BUDGET = 6;
const MAX_TURNS = 12;
const MAX_REVIEWS = 3;

const Evidence = z.array(z.object({
  entity_id: z.string().describe("Copied exactly from the Qloo lists you were given or from get_local_taste."),
  how: z.string().describe("How this taste shows up in the ad, in a few words."),
})).describe("1 to 3 Qloo entities this decision rests on.");

export const AdKit = z.object({
  concepts: z.array(z.object({
    name: z.string().describe("Short internal name for the concept."),
    angle: z.string().describe("The idea behind it, in one sentence."),
    hook: z.string().describe("First line or on-screen opener, at most 12 words."),
    headline: z.string().describe("Ad headline, at most 40 characters."),
    primary_text: z.string().describe("Main ad text, one to three short sentences."),
    cta: z.enum(["Download", "Learn more", "Shop now", "Sign up", "Get offer", "Install now", "Buy now", "Wishlist"]),
    visual: z.object({
      background: z.string().describe("Background colour as #RRGGBB, drawn from the audience's taste."),
      accent: z.string().describe("Accent colour as #RRGGBB."),
      scene: z.string().describe("What the image or video shows, for a designer, in one or two sentences."),
    }),
    evidence: Evidence,
    why: z.string().describe("Why this should land with this audience, in one or two sentences."),
  })).describe("Exactly 3 distinct concepts, strongest first."),
  reddit: z.object({
    community: z.string().describe("Copied exactly from the communities list (a subreddit if there is one)."),
    title: z.string(),
    body: z.string().describe("A post that respects the community: honest about who we are, useful on its own, no hard sell."),
  }),
  podcast_read: z.object({
    show: z.string().describe("A podcast from the Qloo lists or the communities list, copied exactly."),
    script: z.string().describe("A 30-second host-read script, about 75 words, in the show's voice."),
  }),
  city_variants: z.array(z.object({
    place: z.string().describe("A place from the audience's strongest places, as given."),
    hook: z.string().describe("The lead concept's hook, adapted for this place."),
    evidence: Evidence,
    why: z.string(),
  })).describe("0 to 2 variants, only where get_local_taste showed a real local difference."),
  avoid: z.array(z.string()).describe("2 to 4 clichés or angles to stay away from with this audience, and why."),
});
export type AdKit = z.infer<typeof AdKit>;

const Review = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()).describe("Each problem, specific enough to fix. Empty when approved."),
});

const DIRECTOR = `You are the creative director of Who Would Love. A maker has a report on who would love their product; you write the ads to reach one of those audiences.

Your edge is Qloo taste data: real things this audience loves, with affinity scores. Use it to decide what the ad says, shows and sounds like, the way a good agency uses cultural references. Never use demographic stereotypes; demographics only set targeting.

How to work:
- Read the audience, its Qloo lists and its places. Pick specific, mid-popularity references over household names.
- If a place could change the message, call get_local_taste for that place and a type or two. Use what is really different there for city_variants; skip variants when nothing differs.
- When the kit is ready, call submit_kit with the whole kit. A critic checks it. Fix every issue it raises and submit again. You are done when it approves.

Rules:
- Every claim about the product must come from the product profile. Never invent prices, features, awards or numbers.
- Every entity_id must be copied exactly from the lists you were given or from get_local_taste. Never cite an id you have not seen.
- Never name or imply a celebrity endorsement; references set tone, they are not partners.
- Ads must work under Meta's ad rules: never assert or imply personal attributes ("Are you a lonely...", "As a woman...").
- Write in the product page's language. No em dashes. No hype words like "revolutionary" or "game-changing".`;

const CRITIC = `You review ad kits for Who Would Love before a maker sees them. Be strict but fair: approve a kit that is honest, specific and safe, even if you would have written it differently.

Reject, with a specific issue for each, when:
- a claim about the product is not supported by the product profile (prices, features, results, awards);
- an ad relies on a cliché or stereotype about the audience or a place instead of its real taste;
- an ad implies a celebrity or brand endorsement, or asserts personal attributes of the viewer (against Meta's ad rules);
- a taste reference is decorative: cited as evidence but not visible in the hook, text, scene or tone;
- the three concepts are the same idea in different words;
- the Reddit post reads as an advert where the community would see it as spam;
- a hook is longer than 12 words or a headline longer than 40 characters.`;

export interface KitResult {
  kit: AdKit;
  // Every Qloo entity the kit may cite, with its real score, so the renderer shows Qloo's numbers.
  entities: Record<string, { name: string; type: string; affinity: number }>;
  trail: TrailStep[];
  approved: boolean;
  reviews: number;
}

const HEX = /^#[0-9a-f]{6}$/i;
const { $schema: _, ...kitSchema } = z.toJSONSchema(AdKit) as Record<string, unknown>;

export async function makeAdKit(
  profile: ProductProfile, seg: SegmentTaste, spec: ReportSpec, communities: Community[], placeLabels: Record<string, string>, qloo: Qloo, claude: Anthropic,
) {
  const usage = { input_tokens: 0, output_tokens: 0 };
  const add = (u: { input_tokens: number; output_tokens: number }) => { usage.input_tokens += u.input_tokens; usage.output_tokens += u.output_tokens; };

  // What the kit may cite: this audience's Qloo lists, plus whatever get_local_taste returns.
  const entities: KitResult["entities"] = {};
  for (const [type, l] of Object.entries(seg.affinities)) {
    for (const a of [...l.mainstream, ...l.niche, ...l.in_market]) entities[a.entity_id] ??= { name: a.name, type, affinity: a.affinity };
  }
  const mine = communities.filter((c) => c.segment === seg.name && c.link_ok);
  const podcasts = new Set([...Object.values(seg.affinities.podcast ?? {}).flat().map((a) => a.name), ...mine.filter((c) => c.platform === "podcast").map((c) => c.name)]);
  const places = seg.places.map((p) => placeLabels[p.label] ?? p.label);
  const segSpec = spec.segments.find((s) => s.name === seg.name);
  const signal = seg.seeds.map((s) => s.entity_id).join(",");
  const trail: TrailStep[] = [];
  let localCalls = 0;
  let reviews = 0;
  let last: { kit: AdKit; approved: boolean } | null = null;

  const brief = (l: Affinity[], type: string) => l.slice(0, 8).map((a) => ({ id: a.entity_id, name: a.name, type, affinity: a.affinity }));

  function codeChecks(kit: AdKit): string[] {
    const issues: string[] = [];
    if (kit.concepts.length !== 3) issues.push(`Write exactly 3 concepts, not ${kit.concepts.length}.`);
    const cited = [...kit.concepts.flatMap((c) => c.evidence), ...kit.city_variants.flatMap((v) => v.evidence)];
    for (const e of cited) if (!entities[e.entity_id]) issues.push(`entity_id ${e.entity_id} is not in the Qloo data you were given. Use an id from the lists or from get_local_taste.`);
    for (const c of kit.concepts) {
      if (c.evidence.length === 0) issues.push(`Concept "${c.name}" cites no Qloo evidence.`);
      if (!HEX.test(c.visual.background) || !HEX.test(c.visual.accent)) issues.push(`Concept "${c.name}" needs colours as #RRGGBB.`);
      if (c.hook.split(/\s+/).length > 12) issues.push(`Concept "${c.name}": the hook has more than 12 words.`);
      if (c.headline.length > 40) issues.push(`Concept "${c.name}": the headline has more than 40 characters.`);
    }
    if (mine.length && !mine.some((c) => c.name === kit.reddit.community)) issues.push(`Reddit community "${kit.reddit.community}" is not in the communities list. Copy one exactly: ${mine.map((c) => c.name).join(", ")}.`);
    if (podcasts.size && !podcasts.has(kit.podcast_read.show)) issues.push(`Podcast "${kit.podcast_read.show}" is not in the Qloo podcast list or the communities list. Copy one exactly.`);
    for (const v of kit.city_variants) if (!places.includes(v.place)) issues.push(`City variant place "${v.place}" is not one of: ${places.join("; ")}.`);
    return issues;
  }

  async function review(kit: AdKit): Promise<string[]> {
    const issues = codeChecks(kit);
    if (issues.length) return issues;
    const response = await claude.messages.parse({
      model: MODEL, max_tokens: 8000, output_config: { effort: "medium", format: zodOutputFormat(Review) }, system: CRITIC,
      messages: [{ role: "user", content: JSON.stringify({ product: productBrief, audience: { name: seg.name, description: seg.description }, kit }) }],
    });
    add(response.usage);
    const r = response.parsed_output;
    return !r || r.approved ? [] : r.issues.length ? r.issues : ["Rejected without a reason; tighten the weakest concept."];
  }

  async function call(name: string, input: any): Promise<unknown> {
    if (name === "get_local_taste") {
      if (++localCalls > LOCAL_BUDGET) return { error: "Local lookups spent. Submit the kit." };
      const body = await qloo.insights({
        "filter.type": `urn:entity:${input.type}`, "signal.interests.entities": signal, "signal.location.query": input.place, take: 10,
      });
      const list = (body.results?.entities ?? []).map(toAffinity) as Affinity[];
      for (const a of list) entities[a.entity_id] ??= { name: a.name, type: input.type, affinity: a.affinity };
      trail.push({ tool: name, ask: `${input.type} in ${input.place}`, why: input.why, saw: list.slice(0, 3).map((a) => `${a.name} (${a.affinity.toFixed(2)})`).join(", ") || "nothing" });
      return brief(list, input.type);
    }
    if (name === "submit_kit") {
      const parsed = AdKit.safeParse(input.kit);
      if (!parsed.success) return { approved: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
      reviews++;
      const issues = await review(parsed.data);
      last = { kit: parsed.data, approved: issues.length === 0 };
      trail.push({ tool: name, ask: `draft ${reviews}`, why: input.why, saw: issues.length ? `critic: ${issues.length} issue(s): ${issues[0]}` : "critic approved" });
      if (issues.length && reviews >= MAX_REVIEWS) return { approved: false, issues, note: "Out of review rounds. Stop now." };
      return { approved: issues.length === 0, issues };
    }
    return { error: `Unknown tool ${name}` };
  }

  const productBrief = {
    name: profile.name, one_liner: profile.one_liner, what_it_does: profile.what_it_does, key_features: profile.key_features,
    pricing: profile.pricing, platforms: profile.platforms, tone: profile.tone, page_language: profile.page_language,
  };
  const tools: Anthropic.Tool[] = [
    {
      name: "get_local_taste", strict: true,
      description: "What this audience loves inside one place, for one entity type (Qloo, using the audience's seeds as the signal). Returns up to 10 entities with ids and affinity.",
      input_schema: {
        type: "object", additionalProperties: false, required: ["place", "type", "why"],
        properties: {
          place: { type: "string", enum: places.length ? places : ["United States"] },
          type: { type: "string", enum: [...AFFINITY_TYPES] },
          why: { type: "string", description: "One sentence: what you expect this place to change." },
        },
      },
    },
    {
      name: "submit_kit",
      description: "Hand the full ad kit to the critic. Returns approved, or the issues to fix.",
      input_schema: {
        type: "object", additionalProperties: false, required: ["kit", "why"],
        properties: { kit: kitSchema, why: { type: "string", description: "One sentence: what changed since the last draft, or 'first draft'." } },
      },
    },
  ];

  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: JSON.stringify({
      product: productBrief,
      audience: {
        name: seg.name, description: seg.description, quote_from_page: seg.evidence,
        report_reading: segSpec ? { headline: segSpec.headline, reading: segSpec.reading, creative_angle: segSpec.creative_angle, age_gender: segSpec.age_gender } : null,
        analyst_findings: seg.findings ?? null,
        demographics: seg.demographics,
        strongest_places: places,
      },
      qloo_lists: Object.fromEntries(Object.entries(seg.affinities).map(([type, l]) => [type, { mainstream: brief(l.mainstream, type), niche: brief(l.niche, type), in_market: brief(l.in_market, type) }])),
      communities: mine.map((c) => ({ name: c.name, platform: c.platform, size: c.size, approach: c.approach })),
    }),
  }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await claude.messages.create({ model: MODEL, max_tokens: 16000, output_config: { effort: "medium" }, system: DIRECTOR, tools, messages });
    add(response.usage);
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") break;
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
    if ((last as { approved: boolean } | null)?.approved || reviews >= MAX_REVIEWS) break;
  }

  const final = last as { kit: AdKit; approved: boolean } | null;
  if (!final) throw new Error(`The creative director submitted no ad kit for "${seg.name}"`);
  // An unapproved kit still ships, but never with evidence that is not real Qloo data.
  const kit = final.kit;
  for (const c of kit.concepts) c.evidence = c.evidence.filter((e) => entities[e.entity_id]);
  kit.city_variants = kit.city_variants.filter((v) => places.includes(v.place)).map((v) => ({ ...v, evidence: v.evidence.filter((e) => entities[e.entity_id]) }));
  const cited = new Set([...kit.concepts.flatMap((c) => c.evidence), ...kit.city_variants.flatMap((v) => v.evidence)].map((e) => e.entity_id));
  const used = Object.fromEntries(Object.entries(entities).filter(([id]) => cited.has(id)));
  const result: KitResult = { kit, entities: used, trail, approved: final.approved, reviews };
  return { result, usage };
}
