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
