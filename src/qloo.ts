// Minimal Qloo REST client (hackathon environment). Plain fetch, so it runs in Node and Workers.
// Never send personal data here: only product-derived entities, tags and places.

export type Query = Record<string, string | number | boolean | string[] | undefined>;

export class Qloo {
  constructor(private apiKey: string, private baseUrl = "https://hackathon.api.qloo.com") {}

  // Requests go out one at a time with a small gap, and a 429 is retried a bounded number of times,
  // because the hackathon key is rate limited.
  private queue: Promise<unknown> = Promise.resolve();
  private static GAP_MS = 250;
  private static RETRIES = 4;

  get(path: string, query: Query): Promise<any> {
    const run = this.queue.then(() => this.send(path, query));
    this.queue = run.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, Qloo.GAP_MS)));
    return run;
  }

  private async send(path: string, query: Query): Promise<any> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      params.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${this.baseUrl}${path}?${params}`, { headers: { "X-Api-Key": this.apiKey } });
      if (res.status === 429 && attempt < Qloo.RETRIES) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body.errors) {
        throw new Error(`Qloo ${path} failed (${res.status}): ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
      }
      return body;
    }
  }

  search(query: string, type: string, take = 5) {
    return this.get("/search", { query, types: type, take });
  }

  tags(query: string, take = 5) {
    return this.get("/v2/tags", { "filter.query": query, "feature.semantic_search": true, take });
  }

  insights(query: Query) {
    return this.get("/v2/insights", query);
  }
}
