// Firecrawl client: turns a URL into clean markdown plus page metadata.
// Plain fetch so it runs unchanged in Node and Cloudflare Workers.

export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  markdown: string;
  image?: string;
}

export async function scrapePage(url: string, apiKey: string): Promise<ScrapedPage> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 60000 }),
  });
  const body: any = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(`Firecrawl failed (${res.status}): ${body.error ?? "unknown error"}`);
  }
  const meta = body.data.metadata ?? {};
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v) ?? "";
  return {
    url: meta.url ?? url,
    title: String(first(meta.title)),
    description: String(first(meta.description)),
    markdown: body.data.markdown ?? "",
    image: String(first(meta.ogImage ?? meta["og:image"] ?? "")) || undefined,
  };
}

// "Whole website" mode: map the site, then read the home page plus up to `extra` key pages
// (features, pricing, about...). Capped so one report costs a handful of Firecrawl credits.
const KEY_PAGES = /(feature|product|pricing|price|plans|about|how-it-works|how|why|faq|app|download|story|team|tour)/i;
const SKIP_PAGES = /(blog\/.+|news\/.+|privacy|terms|legal|cookie|login|signin|signup|register|account|cart|checkout|careers|jobs|\.pdf$|\.xml$|\/tag\/|\/category\/|\/author\/|#)/i;

export async function scrapeSite(url: string, apiKey: string, extra = 4): Promise<ScrapedPage & { pages: string[] }> {
  const root = new URL(url);
  const res = await fetch("https://api.firecrawl.dev/v2/map", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: root.origin, limit: 200 }),
  });
  const body: any = await res.json().catch(() => ({}));
  const links: string[] = (body.links ?? []).map((l: any) => (typeof l === "string" ? l : l.url)).filter(Boolean);
  const sameSite = links.filter((l) => {
    try {
      const u = new URL(l);
      return u.hostname.replace(/^www\./, "") === root.hostname.replace(/^www\./, "") && u.pathname !== "/" && !SKIP_PAGES.test(u.pathname);
    } catch { return false; }
  });
  // Short paths with a key word first: /pricing beats /blog/2021/some-pricing-post.
  const ranked = [...new Set(sameSite)]
    .filter((l) => KEY_PAGES.test(new URL(l).pathname))
    .sort((a, b) => new URL(a).pathname.split("/").length - new URL(b).pathname.split("/").length || a.length - b.length);
  const targets = [url, ...ranked.filter((l) => l.replace(/\/$/, "") !== url.replace(/\/$/, "")).slice(0, extra)];

  const pages = await Promise.all(targets.map((t) => scrapePage(t, apiKey).catch(() => null)));
  const ok = pages.filter((p): p is ScrapedPage => p !== null && p.markdown.length > 0);
  if (ok.length === 0) throw new Error("Could not read any page of this website");
  const perPage = Math.floor(60000 / ok.length);
  return {
    ...ok[0],
    markdown: ok.map((p) => `## Page: ${p.url}\n\n${p.markdown.slice(0, perPage)}`).join("\n\n---\n\n"),
    pages: ok.map((p) => p.url),
  };
}
