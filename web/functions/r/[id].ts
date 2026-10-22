// /r/<id>: the finished report if it is ready, otherwise the live progress page.
import type { PagesEnv } from "../../env";

export const onRequestGet: PagesFunction<PagesEnv> = async ({ request, env, params }) => {
  const id = String(params.id);
  const origin = new URL(request.url).origin;
  const html = await env.API.fetch(`${origin}/api/reports/${encodeURIComponent(id)}/html`);
  if (html.ok) {
    // The API decides caching: no-store while the ad kit is still being written.
    return new Response(html.body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": html.headers.get("Cache-Control") ?? "public, max-age=300" } });
  }
  return env.ASSETS.fetch(new URL("/progress", request.url));
};
