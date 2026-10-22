// Renders the ad kit as one report section: per audience, three concepts as feed (1:1) and story (9:16)
// mockups with copy to paste, the Qloo evidence behind each one (real scores), a Reddit post, a podcast
// host-read, city variants and what to avoid. It is spliced into the saved report at ADS_MARKER, so it
// relies on the report's own styles, filter and copy() script.

import { esc, paste, tag } from "./render.js";
import type { AdKit, KitResult } from "./ads.js";

const TYPE_LABEL: Record<string, string> = {
  brand: "Brand", book: "Book", movie: "Film", tv_show: "TV", podcast: "Podcast", artist: "Music", person: "Person", videogame: "Game", destination: "Destination",
};
const TOOL_LABEL: Record<string, string> = { get_local_taste: "Asked Qloo about a place", submit_kit: "Sent a draft to the critic" };

// Dark or light text, whichever reads better on the agent's colour.
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#15121b" : "#ffffff";
}
const safeHex = (h: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(h) ? h : fallback);

interface Brand { name: string; host: string; image: string | null }

function avatar(b: Brand) {
  return b.image ? `<img class="av" src="${esc(b.image)}" alt="">` : `<span class="av mono">${esc(b.name.trim().charAt(0).toUpperCase())}</span>`;
}

function feed(c: AdKit["concepts"][number], b: Brand) {
  const bg = safeHex(c.visual.background, "#0e5e63"), accent = safeHex(c.visual.accent, "#ff6a3d");
  return `<div class="ad feed" aria-label="Feed ad mockup">
    <div class="ad-top">${avatar(b)}<div><b>${esc(b.name)}</b><small>Sponsored</small></div></div>
    <p class="ad-text">${esc(c.primary_text)}</p>
    <div class="ad-art" style="background:${bg};color:${inkOn(bg)}">${b.image ? `<img src="${esc(b.image)}" alt="">` : ""}<span class="ad-hook">${esc(c.hook)}</span></div>
    <div class="ad-bottom"><div><small>${esc(b.host)}</small><b>${esc(c.headline)}</b></div><span class="ad-cta" style="background:${accent};color:${inkOn(accent)}">${esc(c.cta)}</span></div>
  </div>`;
}

function story(c: AdKit["concepts"][number], b: Brand) {
  const bg = safeHex(c.visual.background, "#0e5e63"), accent = safeHex(c.visual.accent, "#ff6a3d");
  return `<div class="ad story" style="background:linear-gradient(170deg,${bg} 55%,${accent});color:${inkOn(bg)}" aria-label="Story ad mockup">
    <div class="st-top">${avatar(b)}<span>${esc(b.name)} · Sponsored</span></div>
    <div class="st-hook">${esc(c.hook)}</div>
    ${b.image ? `<img class="st-img" src="${esc(b.image)}" alt="">` : `<span class="st-img mono">${esc(b.name.trim().charAt(0).toUpperCase())}</span>`}
    <div class="st-cta" style="background:#fff;color:#15121b">${esc(c.cta)}</div>
  </div>`;
}

function evidence(list: { entity_id: string; how: string }[], entities: KitResult["entities"]) {
  return list.map((e) => {
    const x = entities[e.entity_id];
    return x ? `<span class="ev" title="${esc(e.how)}"><small>${esc(TYPE_LABEL[x.type] ?? x.type)}</small>${esc(x.name)}<b>${x.affinity.toFixed(2)}</b></span>` : "";
  }).join("");
}

function audience(name: string, r: KitResult, b: Brand, open: boolean) {
  const { kit, entities } = r;
  const concepts = kit.concepts.map((c, i) => `
    <div class="concept">
      <div class="cn">Concept ${i + 1} · ${esc(c.name)}</div>
      <p class="angle">${esc(c.angle)}</p>
      <div class="mocks">${feed(c, b)}${story(c, b)}</div>
      <div class="copy">
        <div><p class="sub">Hook</p>${paste(c.hook)}<p class="sub">Headline</p>${paste(c.headline)}<p class="sub">Primary text</p>${paste(c.primary_text)}</div>
        <div><p class="sub">What it shows</p><p>${esc(c.visual.scene)}</p><p class="sub">Why this audience</p><p>${esc(c.why)}</p>
          ${c.evidence.length ? `<div class="evs"><span class="tag q">Qloo data</span>${evidence(c.evidence, entities)}</div>` : ""}</div>
      </div>
    </div>`).join("");
  const variants = kit.city_variants.length ? `<p class="sub">City variants</p><ul class="vars">${kit.city_variants.map((v) => `<li><b>${esc(v.place)}</b>${paste(v.hook)}<p>${esc(v.why)}</p><div class="evs">${evidence(v.evidence, entities)}</div></li>`).join("")}</ul>` : "";
  const steps = r.trail.map((s) => `<li><b>${esc(TOOL_LABEL[s.tool] ?? s.tool)}</b> <span class="ask">${esc(s.ask)}</span><div class="note">Why: ${esc(s.why)}</div><div class="note">Result: ${esc(s.saw)}</div></li>`).join("");
  return `<details class="box o kit"${open ? " open" : ""}><summary>${tag("o")}<span class="sum">${esc(name)} <span class="muted">· 3 concepts${kit.city_variants.length ? ` · ${kit.city_variants.length} city variant${kit.city_variants.length > 1 ? "s" : ""}` : ""}</span></span></summary>
    ${concepts}
    <div class="channels">
      <div><p class="sub">Reddit post for ${esc(kit.reddit.community)}</p>${paste(kit.reddit.title)}${paste(kit.reddit.body)}</div>
      <div><p class="sub">Podcast host-read for ${esc(kit.podcast_read.show)} (30 s)</p>${paste(kit.podcast_read.script)}</div>
    </div>
    ${variants}
    <p class="sub">Stay away from</p><ul class="limits">${kit.avoid.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
    ${steps ? `<details class="how"><summary>How the creative agents worked <span class="muted">· ${r.trail.length} steps · ${r.approved ? `approved by the critic after ${r.reviews} draft${r.reviews > 1 ? "s" : ""}` : "shipped without the critic's approval, unsupported evidence removed"}</span></summary><ol class="steps">${steps}</ol></details>` : ""}
  </details>`;
}

const SIDE = `<div class="side"><div class="num">Ads</div><h2>Ad kit</h2><p>Ready-to-run ads for each audience, written from what Qloo says they love, and checked by a critic agent before you see them.</p></div>`;

export function renderAdKit(kits: { segment: string; result: KitResult }[], brand: Brand) {
  return `<style>${CSS}</style><section class="sec adkit" id="ads">${SIDE}<div class="blocks">${kits.map((k, i) => audience(k.segment, k.result, brand, i === 0)).join("")}</div></section>`;
}

// Shown while the kit is being made: the creative and critic agents' latest steps, live, and a reload
// once the kit is ready.
export function renderAdKitPending(id: string, audiences: number) {
  return `<style>${CSS}</style><section class="sec adkit" id="ads">${SIDE}<div class="blocks"><div class="box o pending">${tag("o")}
    <p class="lead sm">Writing your ads now.</p>
    <p>A creative agent is turning each audience's taste into ads, and a critic agent is checking every draft. This usually takes about three minutes; the page updates by itself.</p>
    <div class="adbar"><i></i></div>
    <div class="adprog"><span id="adDone">0</span> of ${audiences} ad kits approved by the critic</div>
    <div class="adacts" id="adActs"></div></div></div></section>
  <script>(function(){
    var L={get_local_taste:'Asked Qloo about a place',submit_kit:'Sent a draft to the critic'};
    function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
    function tick(){fetch('/api/reports/${esc(id)}',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
      if(d.ads_status!=='running'){location.reload();return}
      var a=(d.activity||[]).filter(function(x){return L[x.tool]}),box=document.getElementById('adActs');
      document.getElementById('adDone').textContent=a.filter(function(x){return x.saw==='critic approved'}).length;
      box.textContent='';
      a.slice(-4).reverse().forEach(function(x){var r=el('div','adact');r.append(el('span','seg',x.segment),el('div',null,L[x.tool]+': '+x.ask+' → '+x.saw),el('div','why','Why: '+x.why));box.append(r)});
      setTimeout(tick,4000)}).catch(function(){setTimeout(tick,6000)})}
    tick()})()</script>`;
}

const CSS = `
.adkit .kit summary{cursor:pointer;list-style:none}.adkit .kit summary::-webkit-details-marker{display:none}
.adkit .kit > summary .tag{margin-bottom:8px}
.adkit .sum{display:block;font-family:var(--display);font-weight:600;font-size:21px;letter-spacing:-.02em}
.adkit .sum::after{content:" +";color:var(--ink-3)}.adkit .kit[open] > summary .sum::after{content:" −"}
.concept{padding:28px 0;border-bottom:1px solid var(--soft)}
.mocks{display:grid;grid-template-columns:minmax(0,330px) minmax(0,200px);gap:18px;align-items:start;margin:18px 0 6px}
.copy{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}
.ad{border-radius:16px;overflow:hidden;font-family:var(--sans);font-size:13px;line-height:1.4;box-shadow:0 14px 30px -18px rgba(21,18,27,.45)}
.ad .av{width:28px;height:28px;border-radius:8px;object-fit:cover;flex:none;background:#000}
.ad .av.mono,.st-img.mono{display:grid;place-items:center;background:linear-gradient(135deg,#0e5e63,#e2552d);color:#fff;font-weight:700}
.feed{background:#fff;border:1px solid var(--line)}
.ad-top{display:flex;gap:8px;align-items:center;padding:10px 12px}
.ad-top > div{min-width:0}.ad-top b,.st-top span{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ad-top small{color:var(--ink-3);font-size:11px}
.ad-text{padding:0 12px 10px;color:var(--ink)}
.ad-art{aspect-ratio:1/1;display:flex;flex-direction:column;justify-content:space-between;padding:14px;gap:10px}
.ad-art img{width:100%;height:62%;object-fit:contain;border-radius:10px}
.ad-hook{font-family:var(--display);font-weight:600;font-size:17px;line-height:1.15;letter-spacing:-.02em}
.ad-bottom{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:var(--soft)}
.ad-bottom small{display:block;color:var(--ink-3);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
.ad-bottom b{font-size:13px}
.ad-cta{font-weight:600;font-size:12px;padding:6px 10px;border-radius:8px;white-space:nowrap}
.story{aspect-ratio:9/16;display:flex;flex-direction:column;padding:12px;gap:10px}
.st-top{display:flex;gap:6px;align-items:center;font-size:11px;opacity:.9;min-width:0}.st-top span{font-size:11px}
.st-hook{font-family:var(--display);font-weight:600;font-size:18px;line-height:1.12;letter-spacing:-.02em;margin-top:6px}
.st-img{width:100%;flex:1;min-height:0;object-fit:contain;border-radius:12px}
.st-cta{text-align:center;font-weight:600;font-size:13px;padding:9px;border-radius:999px}
.concept .cn{font-family:var(--mono);font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ours)}
.concept .angle{font-family:var(--display);font-weight:500;font-size:19px;line-height:1.3;letter-spacing:-.015em;margin:6px 0 4px}
.copy .paste{font-size:13px}
.evs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:16px}.evs .tag{margin:0 4px 0 0}
.ev{display:inline-flex;align-items:baseline;gap:6px;font-size:13px;background:var(--qloo-bg);color:var(--ink);border-radius:9px;padding:4px 9px}
.ev small{font-family:var(--mono);font-size:10px;text-transform:uppercase;color:var(--qloo)}.ev b{font-family:var(--mono);font-size:12px;color:var(--qloo)}
.channels{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding-top:22px}
.channels .paste+.paste{margin-top:8px}
ul.vars{list-style:none}ul.vars li{padding:10px 0;border-bottom:1px solid var(--soft)}ul.vars li:last-child{border-bottom:0}ul.vars b{display:block;margin-bottom:6px}ul.vars p{font-size:14px;color:var(--ink-2);margin-top:6px}
.adkit details.how{margin-top:20px;font-size:14.5px}.adkit details.how summary{cursor:pointer;font-weight:600}
.adkit .pending .adbar{height:6px;background:var(--soft);border-radius:999px;overflow:hidden;margin-top:18px}
.adkit .pending .adbar i{display:block;height:100%;width:40%;border-radius:999px;background:var(--ours);animation:adbar 1.6s ease-in-out infinite}
.adkit .adprog{margin-top:14px;font-size:14px;color:var(--ink-2)}.adkit .adprog span{font-family:var(--mono);font-weight:600;color:var(--ours)}
.adkit .adact{padding:10px 0;border-bottom:1px solid var(--soft);font-size:14px}.adkit .adact:last-child{border-bottom:0}
.adkit .adact .seg{display:block;font-family:var(--mono);font-size:11px;color:var(--ink-3)}.adkit .adact .why{font-size:13px;color:var(--ink-2);margin-top:2px}
.adkit .adacts{margin-top:10px}
@keyframes adbar{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (max-width:860px){.copy,.channels{grid-template-columns:1fr;gap:0}.mocks{grid-template-columns:minmax(0,1fr);gap:16px}.mocks .story{width:62%;justify-self:center}}
`;
