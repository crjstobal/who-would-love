// Step 3 of the pipeline: find real places where each audience segment gathers online.
// The model searches the open web, guided by the segment and its Qloo affinities, and every
// link it returns is checked before it reaches the report.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, type ProductProfile } from "./read-product.js";
import type { SegmentTaste } from "./taste.js";

const PLATFORMS = ["reddit", "newsletter", "podcast", "youtube", "discord", "forum", "facebook_group", "instagram", "tiktok", "event", "website", "other"] as const;

export const Communities = z.object({
  places: z.array(z.object({
    platform: z.enum(PLATFORMS),
    name: z.string().describe("e.g. 'r/LongDistance' or the newsletter's name."),
    url: z.string(),
    size: z.string().nullable().describe("Audience size exactly as found (e.g. '412k members'), or null if not found."),
    why: z.string().describe("Why this segment gathers here, in one sentence."),
    approach: z.string().describe("How to show up without being spammy: rules on self-promotion, sponsorship option, or ad targeting."),
  })).describe("6 to 10 places, best first."),
});
export type Community = z.infer<typeof Communities>["places"][number] & { segment: string; link_ok: boolean };

const SYSTEM = `You find where an audience gathers online, for Who Would Love.

Search the web and return real, active places where this specific audience already spends time: subreddits, newsletters, podcasts that take sponsors, YouTube channels, Discord servers, forums and similar. Prefer places that match the audience's taste (the Qloo affinities you are given are real data about what they love) over generic marketing advice.

How to search:
- Start from the life moments and needs behind the segment (e.g. long-distance couples, wedding planning), then from the Qloo affinities (fan communities of the artists, shows and podcasts they love).
- Look for communities big enough to matter but focused enough to fit. Skip huge general forums where the product would be off-topic.

Rules:
- Return 6 to 10 places. Only return places you actually saw in search results or fetched pages.
- The URL must be the community itself (https://www.reddit.com/r/Name/, the newsletter's own site, the podcast's own page), never a third-party page about it.
- Give sizes only if you found them; otherwise null. Never guess numbers.
- Avoid political, religious and adult communities.
- Prefer a mix of platforms. Include at least a few subreddits when they exist.
- For each place, say how a maker should approach it honestly (many subreddits ban self-promotion).
- Write as "we", never "I". No em dashes.`;

function topNames(seg: SegmentTaste, n = 4) {
  return Object.entries(seg.affinities).map(([type, l]) => `${type}: ${[...l.mainstream.slice(0, n), ...l.niche.slice(0, 2)].map((a) => a.name).join(", ")}`).join("\n");
}

// Subreddits always link to Reddit itself, even when the size came from a third-party stats page.
function canonicalUrl(platform: string, name: string, url: string): string {
  const sub = platform === "reddit" ? (name.match(/r\/([A-Za-z0-9_]+)/)?.[1] ?? url.match(/\/r\/([A-Za-z0-9_]+)/)?.[1]) : undefined;
  return sub ? `https://www.reddit.com/r/${sub}/` : url;
}

async function linkWorks(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; WhoWouldLove/0.1)" }, signal: AbortSignal.timeout(10000) });
    // Reddit and some sites block unknown clients with 403/429; that still proves the page exists.
    return res.ok || res.status === 403 || res.status === 429;
  } catch {
    return false;
  }
}

export async function findCommunities(profile: ProductProfile, seg: SegmentTaste, claude: Anthropic) {
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `Product: ${profile.name}. ${profile.one_liner}\nPricing: ${profile.pricing}. Platforms: ${profile.platforms.join(", ")}.\n\nAudience segment: ${seg.name}\n${seg.description}\n\nWhat this segment loves, according to Qloo:\n${topNames(seg)}\n\nFind where these people gather online.`,
  }];
  const usage = { input_tokens: 0, output_tokens: 0, searches: 0 };
  for (let turn = 0; turn < 6; turn++) {
    const response = await claude.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Communities) },
      system: SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 8 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
      ],
      messages,
    });
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    usage.searches += response.usage.server_tool_use?.web_search_requests ?? 0;
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (!response.parsed_output) throw new Error(`Community search failed for "${seg.name}" (stop_reason: ${response.stop_reason})`);
    const places = await Promise.all(response.parsed_output.places.map(async (p) => {
      const url = canonicalUrl(p.platform, p.name, p.url);
      return { ...p, url, segment: seg.name, link_ok: await linkWorks(url) };
    }));
    return { places, usage };
  }
  throw new Error(`Community search for "${seg.name}" did not finish`);
}
