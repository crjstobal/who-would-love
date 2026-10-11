// Step 1 of the pipeline: read a product page and describe the product and who it seems built for.
// The output also proposes Qloo "seeds": concrete entities and tag queries that the next step
// resolves against Qloo and uses as taste signals.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ScrapedPage } from "./firecrawl.js";

export const MODEL = "claude-opus-5-5";

export const QLOO_ENTITY_TYPES = [
  "artist", "book", "brand", "destination", "movie", "person", "place", "podcast", "tv_show", "video_game",
] as const;

export const ProductProfile = z.object({
  name: z.string(),
  one_liner: z.string().describe("What the product is, in one plain sentence."),
  category: z.string(),
  what_it_does: z.string().describe("Two or three sentences."),
  key_features: z.array(z.string()),
  pricing: z.string().describe("Free, freemium, paid, price if shown, or 'not stated'."),
  platforms: z.array(z.string()),
  tone: z.string().describe("Voice and visual mood of the page, in a few words."),
  page_language: z.string(),
  use_cases: z.array(z.string()).describe("Concrete situations where someone would reach for this product."),
  apparent_audience: z.array(z.object({
    segment: z.string(),
    evidence: z.string().describe("Short quote or fact from the page that supports this segment."),
  })),
  qloo_seed_entities: z.array(z.object({
    name: z.string().describe("Exact, canonical, well-known name, as it would appear in a catalogue."),
    type: z.enum(QLOO_ENTITY_TYPES),
    why: z.string().describe("Why people who love this would plausibly love the product."),
  })).describe("6 to 10 entities that represent the taste of the likely audience."),
  qloo_tag_queries: z.array(z.string()).describe("3 to 6 short themes or keywords, e.g. 'journaling', 'long distance relationship'."),
  open_questions: z.array(z.string()).describe("What the page does not make clear."),
});
export type ProductProfile = z.infer<typeof ProductProfile>;

const SYSTEM = `You are the first step of Who Would Love, a tool that tells makers who would love their product and where to find those people.

You receive the text of one product page. Describe the product faithfully, using only what the page says or clearly implies. Do not invent features, prices or claims.

Then propose seeds for Qloo, a cultural taste graph. Qloo knows entities of these types: ${QLOO_ENTITY_TYPES.join(", ")}. It does not know apps, so a comparable app goes in as its company or brand (for example "Notion" as a brand). Good seeds are:
- famous and unambiguous, so a catalogue search finds the right one (prefer "Day One" style exact names only if they are widely known; otherwise choose a better-known neighbour);
- specific to this audience's taste, not generic giants that everyone likes (avoid Google, Apple, Netflix, Coca-Cola);
- varied in type (mix brands with books, shows, podcasts, artists or places when the page supports it).
Each seed needs a reason tied to the page. Seeds describe tastes of a group, never a specific private person.`;

export async function readProduct(page: ScrapedPage, client: Anthropic): Promise<{ profile: ProductProfile; usage: Anthropic.Usage }> {
  const text = page.markdown.slice(0, 60000);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "high", format: zodOutputFormat(ProductProfile) },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `URL: ${page.url}\nTitle: ${page.title}\nMeta description: ${page.description}\n\n<page>\n${text}\n</page>`,
    }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Model did not return a profile (stop_reason: ${response.stop_reason})`);
  }
  return { profile: response.parsed_output, usage: response.usage };
}
