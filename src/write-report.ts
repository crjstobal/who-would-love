// Step 4 of the pipeline: the model turns everything gathered so far into the report's words and choices.
// It never writes Qloo numbers itself: it picks Qloo entities by id and communities by name, and the
// renderer copies the real values from the saved data. Interpretation stays clearly labelled as ours.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, type ProductProfile } from "./read-product.js";
import type { TasteData } from "./taste.js";
import type { Community } from "./communities.js";

export const ReportSpec = z.object({
  short_version: z.string().describe("Two or three sentences: who would love this product and the single most useful thing to do about it."),
  understood: z.string().describe("Plain summary of the product as we read it, three or four sentences."),
  segments: z.array(z.object({
    name: z.string().describe("Segment name, copied exactly."),
    headline: z.string().describe("One sharp sentence about this audience, grounded in the Qloo data."),
    reading: z.string().describe("Two or three sentences interpreting the taste data: what it says about these people and how to talk to them."),
    loves: z.array(z.object({
      entity_id: z.string().describe("Copied exactly from the Qloo lists of THIS segment."),
      note: z.string().nullable().describe("Optional few words on why it matters for marketing."),
    })).describe("6 to 9 picks, varied in type, chosen for marketing usefulness (specific beats famous)."),
    communities: z.array(z.string()).describe("Names of 3 to 6 places for this segment, copied exactly from the communities list."),
    meta_interests: z.array(z.string()).describe("5 to 8 interest names to type into Meta Ads Manager, based on the Qloo picks and the segment."),
    age_gender: z.string().describe("Suggested age range and gender setting for ads, based on the Qloo demographics; say 'all' when the lean is weak."),
    creative_angle: z.string().describe("What the first ad or post for this segment should say or show, in one or two sentences."),
  })),
  place_labels: z.array(z.object({ raw: z.string(), clean: z.string() })).describe("A short, recognisable name for every place label given (e.g. 'Area A (Kicking Horse/Kinbasket Lake), British Columbia' -> 'Golden & Kicking Horse, BC')."),
  places_reading: z.string().describe("One or two sentences on what the places say, e.g. why rural dark-sky counties show up."),
  plan: z.array(z.string()).describe("3 to 5 concrete first experiments, in order, each one or two sentences."),
  page_gaps: z.array(z.string()).describe("2 to 4 things the page should make clearer for these audiences."),
});
export type ReportSpec = z.infer<typeof ReportSpec>;

const SYSTEM = `You write the audience report for Who Would Love. Your reader is the maker of the product: busy, practical, not a marketer.

You receive the product profile, Qloo taste data per audience segment, and communities found on the web.

Ground rules:
- Qloo data describes what groups of people tend to like. Never describe an individual, never claim causation or probability for a person ("people who love X tend to also love Y", not "your users will love Y").
- When you pick Qloo entities, copy their entity_id exactly from that segment's lists (mainstream, niche or in_market). Prefer specific and niche picks that a maker can act on (target, sponsor, reference in an ad) over household names everyone likes.
- Each segment may carry analyst_findings: notes from the agent that investigated it in Qloo. Use them in your reading, but the lists are the evidence.
- Leave out political, religious and adult entities and communities, even if Qloo returns them.
- Only pick communities from the list you are given, by exact name. Prefer ones whose link was confirmed.
- Describe demographic leans by their size: under 0.15 is no real lean (say so), 0.15 to 0.35 is a slight lean, above 0.35 is a clear lean. Never call a weak lean "clear".
- Be concrete and short. No hype, no filler. No em dashes. Write as "we", never "I".`;

function compactTaste(t: TasteData) {
  const brief = (l: { entity_id: string; name: string; affinity: number }[]) => l.map((a) => ({ id: a.entity_id, name: a.name, affinity: a.affinity }));
  return {
    markets: t.markets,
    segments: t.segments.map((s) => ({
      name: s.name, description: s.description,
      seeds: s.seeds.map((x) => x.qloo_name),
      analyst_findings: s.findings ?? null,
      demographics: s.demographics,
      places: s.places.map((p) => p.label),
      loves: Object.fromEntries(Object.entries(s.affinities).map(([type, l]) => [type, {
        mainstream: brief(l.mainstream.slice(0, 8)), niche: brief(l.niche.slice(0, 8)), in_market: brief(l.in_market.slice(0, 8)),
      }])),
    })),
    overall: { demographics: t.overall.demographics, places: Object.fromEntries(Object.entries(t.overall.places).map(([m, l]) => [m, l.map((p) => p.label)])) },
  };
}

export async function writeReport(profile: ProductProfile, taste: TasteData, communities: Community[], claude: Anthropic) {
  const response = await claude.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "high", format: zodOutputFormat(ReportSpec) },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: JSON.stringify({
        product: profile,
        taste: compactTaste(taste),
        communities: communities.map((c) => ({ segment: c.segment, name: c.name, platform: c.platform, size: c.size, why: c.why, link_confirmed: c.link_ok })),
      }),
    }],
  });
  if (!response.parsed_output) throw new Error(`Report writing failed (stop_reason: ${response.stop_reason})`);
  return { spec: response.parsed_output, usage: response.usage };
}
