// Renders the final report as one self-contained HTML page (fonts from Google Fonts, no scripts
// beyond the source filter and copy buttons). Every Qloo number comes straight from TasteData.

import type { ScrapedPage } from "./firecrawl.js";
import type { ProductProfile } from "./read-product.js";
import type { Affinity, Demographics, SegmentTaste, TasteData } from "./taste.js";
import type { Community } from "./communities.js";
import type { ReportSpec } from "./write-report.js";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pad = (n: number) => String(n).padStart(2, "0");

const TYPE_LABEL: Record<string, string> = {
  brand: "Brand", book: "Book", movie: "Film", tv_show: "TV", podcast: "Podcast", artist: "Music", person: "Person", videogame: "Game", destination: "Destination", place: "Place",
};
const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "Under 25", "25_to_29": "25–29", "30_to_34": "30–34", "35_to_44": "35–44", "45_to_54": "45–54", "55_and_older": "55+",
};
const PLATFORM_LABEL: Record<string, string> = {
  reddit: "Reddit", newsletter: "Newsletter", podcast: "Podcast", youtube: "YouTube", discord: "Discord", forum: "Forum",
  facebook_group: "Facebook group", instagram: "Instagram", tiktok: "TikTok", event: "Event", website: "Website", other: "Other",
};

const LOGO = `<svg viewBox="0 0 40 48" aria-hidden="true"><path stroke="currentColor" d="M20 37 C 9 29, 3 22, 3.5 14 C 4 7, 10 4, 14.5 5 C 17.5 5.7, 19.2 7.6, 20 10" fill="none" stroke-width="2.6" stroke-linecap="round"/><path d="M20 10 C 21.5 5.5, 26 3.6, 30 4.6 C 35 5.8, 37.5 10.5, 36 15.5 C 34.5 20.5, 27 22.5, 23.5 26 C 21.2 28.3, 20.4 31, 20.2 33.5" fill="none" stroke="#ff6a3d" stroke-width="5.5" stroke-linecap="round"/><circle cx="20" cy="43.5" r="3.4" fill="#ff6a3d"/></svg>`;

export const tag = (k: "q" | "w" | "o") => `<span class="tag ${k}">${{ q: "Qloo data", w: "Web research", o: "Our interpretation" }[k]}</span>`;
export const paste = (text: string) => `<div class="paste"><span>${esc(text)}</span><button type="button" onclick="copy(this)">Copy</button></div>`;

function skewRow(label: string, v: number) {
  const w = Math.min(Math.abs(v), 1) * 50;
  const side = v >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
  return `<div class="demo"><span>${esc(label)}</span><div class="skew"><i class="${v >= 0 ? "up" : "down"}" style="${side}"></i></div><span class="n">${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}</span></div>`;
}

function demographicsBlock(d: Demographics | null) {
  if (!d) return `<p class="muted">Qloo returned no demographic lean for this audience.</p>`;
  const ages = Object.keys(AGE_LABEL).filter((k) => k in d.age).map((k) => skewRow(AGE_LABEL[k], d.age[k])).join("");
  const genders = ["female", "male"].filter((k) => k in d.gender).map((k) => skewRow(k === "female" ? "Women" : "Men", d.gender[k])).join("");
  return `<h4>Age</h4>${ages}<h4 class="gap">Gender</h4>${genders}`;
}

function lovesTable(picks: { a: Affinity; type: string; note: string | null }[]) {
  const rows = picks.map(({ a, type, note }) => `<tr><td><span class="cat">${esc(TYPE_LABEL[type] ?? type)}</span><br>${esc(a.name)}${note ? `<div class="note">${esc(note)}</div>` : ""}</td><td class="hide-m"><div class="meter"><i style="width:${Math.round(a.affinity * 100)}%"></i></div></td><td class="n">${a.affinity.toFixed(2)}</td></tr>`).join("");
  return `<table><thead><tr><th>They also love</th><th class="hide-m">Affinity</th><th style="text-align:right">Score</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function communitiesTable(list: Community[]) {
  const rows = list.map((c) => `<tr><td><span class="cat">${esc(PLATFORM_LABEL[c.platform] ?? c.platform)}</span><br><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>${c.size ? `<div class="size">${esc(c.size)}</div>` : ""}</td><td>${esc(c.why)}<div class="note">${esc(c.approach)}</div></td></tr>`).join("");
  return `<table class="comm"><thead><tr><th>Where</th><th>Why it fits, and how to show up</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const TOOL_LABEL: Record<string, string> = {
  get_affinities: "Read what they love", get_demographics: "Read the age and gender lean", get_heatmap: "Read where they live",
  search_entities: "Searched the catalogue", find_tags: "Searched tags", set_signal: "Changed the signal",
};

// The taste agent's investigation for one audience, folded by default.
function trailBlock(seg: SegmentTaste) {
  if (!seg.trail?.length) return "";
  const steps = seg.trail.map((s) => `<li><b>${esc(TOOL_LABEL[s.tool] ?? s.tool)}</b> <span class="ask">${esc(s.ask)}</span><div class="note">Why: ${esc(s.why)}</div><div class="note">Qloo: ${esc(s.saw)}</div></li>`).join("");
  return `<details class="box q trail"><summary>${tag("q")}<span class="sum">How the agent investigated this audience in Qloo <span class="muted">· ${seg.trail.length} steps</span></span></summary>
    ${seg.findings ? `<p class="findings">${esc(seg.findings.replace(/\*\*|__|^#+\s*/gm, ""))}</p>` : ""}<ol class="steps">${steps}</ol></details>`;
}

export const ADS_MARKER = "<!--ADS-->";

export function renderReport(input: {
  page: ScrapedPage; profile: ProductProfile; taste: TasteData; communities: Community[]; spec: ReportSpec; date: string; id: string;
  pagesRead?: number;
}) {
  const { page, profile, taste, communities, spec, date, id } = input;
  const pagesRead = input.pagesRead ?? 1;
  const scope = pagesRead > 1 ? `whole website · ${pagesRead} pages read` : "this page only";
  const clean = (label: string) => spec.place_labels.find((p) => p.raw === label)?.clean ?? label;
  const primary = taste.markets[0] ?? "";
  const host = new URL(page.url).hostname.replace(/^www\./, "");
  let n = 0;
  // Every section also gets an entry in the sticky section menu under the source filter.
  const nav: { id: string; label: string; hot?: boolean }[] = [];
  const sec = (title: string, side: string, blocks: string, cls = "", label = title) => {
    const sid = `s${pad(++n)}`;
    nav.push({ id: sid, label });
    return `<section class="sec ${cls}" id="${sid}"><div class="side"><div class="num">${pad(n)}</div><h2>${title}</h2>${side}</div><div class="blocks">${blocks}</div></section>`;
  };

  // Count of Qloo affinities read, for the cover numbers.
  const qlooCount = taste.segments.reduce((sum, s) => sum + Object.values(s.affinities).reduce((x, l) => x + l.mainstream.length + l.niche.length + l.in_market.length, 0), 0);
  const okCommunities = communities.filter((c) => c.link_ok);

  const sections: string[] = [];
  sections.push(sec("The short version", "", `
    <div class="box o">${tag("o")}<p class="lead">${esc(spec.short_version)}</p></div>
    <div class="kpis">
      <div class="kpi o"><b>${taste.segments.length}</b><span>Distinct audiences, each with its own taste</span>${tag("o")}</div>
      <div class="kpi q"><b>${qlooCount}</b><span>Taste affinities read from Qloo</span>${tag("q")}</div>
      <div class="kpi w"><b>${new Set(okCommunities.map((c) => c.url)).size}</b><span>Places to reach them, links checked</span>${tag("w")}</div>
    </div>
    <a class="adcall" href="#ads"><span class="spark">✦</span><span><b>Your ad kit is part of this report</b>Three ready-to-run ads for each audience, written from what they love and checked by a critic agent.</span><i>See the ads ↓</i></a>`, "", "Summary"));

  const seeds = taste.segments.flatMap((s) => s.seeds.map((x) => `<span class="chip">${esc(x.qloo_name)}<small>${esc(TYPE_LABEL[x.type] ?? x.type)}</small></span>`));
  const rejected = taste.segments.flatMap((s) => [
    ...s.rejected.map((x) => `<span class="chip off">${esc(x.name)}<small>not in Qloo</small></span>`),
    ...(s.dropped ?? []).map((x) => `<span class="chip off" title="${esc(x.reason)}">${esc(x.name)}<small>dropped by the agent</small></span>`),
  ]);
  sections.push(sec("What we understood", `<p>How the AI read your page before asking Qloo anything. If this is wrong, the rest is too: check it first.</p>`, `
    <div class="box o">${tag("o")}<p>${esc(spec.understood)}</p></div>
    <div class="box q">${tag("q")}<p>Starting points we matched in Qloo, one set per audience:</p><div class="chips">${[...new Set(seeds)].join("")}</div>
      ${rejected.length ? `<p class="small">We also tried these, but left them out: Qloo had no exact match, or the agent found they pulled the signal away from this audience:</p><div class="chips">${rejected.join("")}</div>` : ""}</div>`, "", "What we read"));

  taste.segments.forEach((seg, i) => {
    const s = spec.segments.find((x) => x.name === seg.name);
    if (!s) return;
    const pool = new Map<string, { a: Affinity; type: string }>();
    for (const [type, l] of Object.entries(seg.affinities)) for (const a of [...l.mainstream, ...l.niche, ...l.in_market]) if (!pool.has(a.entity_id)) pool.set(a.entity_id, { a, type });
    const picks = s.loves.flatMap((p) => { const hit = pool.get(p.entity_id); return hit ? [{ ...hit, note: p.note }] : []; })
      .sort((x, y) => y.a.affinity - x.a.affinity);
    const comm = s.communities.flatMap((name) => communities.filter((c) => c.segment === seg.name && c.name === name)).filter((c) => c.link_ok);
    const reddit = comm.filter((c) => c.platform === "reddit").map((c) => c.name);
    sections.push(sec(`${esc(seg.name)}`, `<div class="aud">Audience ${i + 1} of ${taste.segments.length}</div><p>${esc(seg.description)}</p><blockquote>“${esc(seg.evidence.replace(/^[\s"“”']+|[\s"“”']+$/g, ""))}”<cite>from your page</cite></blockquote>`, `
      <div class="box o">${tag("o")}<p class="lead sm">${esc(s.headline)}</p><p>${esc(s.reading)}</p></div>
      <div class="box q">${tag("q")}
        <div class="split">
          <div>${lovesTable(picks)}</div>
          <div><p class="sub0">How they lean, compared with the average</p>${demographicsBlock(seg.demographics)}
            ${seg.places.length ? `<h4 class="gap">Where in ${esc(primary)} this taste is strongest</h4><ol class="places">${seg.places.map((p) => `<li>${esc(clean(p.label))}</li>`).join("")}</ol>` : ""}</div>
        </div>
      </div>
      ${trailBlock(seg)}
      ${comm.length ? `<div class="box w">${tag("w")}${communitiesTable(comm)}</div>` : ""}
      <div class="box o">${tag("o")}
        <p class="sub">Meta Ads interests</p>${paste(s.meta_interests.join(", "))}
        <p class="sub">Age and gender</p>${paste(s.age_gender)}
        ${reddit.length ? `<p class="sub">Reddit Ads communities</p>${paste(reddit.join(", "))}` : ""}
        <p class="sub">First creative</p><p>${esc(s.creative_angle)}</p>
      </div>`, "audience"));
  });

  // The ad kit is made after the report is saved; the API swaps this marker for it (or its progress).
  sections.push(ADS_MARKER);
  nav.push({ id: "ads", label: "Ad kit", hot: true });

  const placeCols = Object.entries(taste.overall.places).filter(([, l]) => l.length).map(([m, l]) => `<div><h4>${esc(m)}</h4><ol class="places">${l.map((p) => `<li>${esc(clean(p.label))}</li>`).join("")}</ol></div>`).join("");
  sections.push(sec("Where the whole audience lives", `<p>All audiences together. Areas where this combined taste is strongest, by market.</p>`, `
    <div class="box q">${tag("q")}<div class="placecols">${placeCols}</div></div>
    <div class="box o">${tag("o")}<p>${esc(spec.places_reading)}</p></div>`, "", "Where they live"));

  sections.push(sec("What we would try first", "", `<div class="box o">${tag("o")}<ol class="plan">${spec.plan.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>`, "", "First steps"));

  sections.push(sec("What your page does not say", `<p>Questions these audiences will have that your page leaves open.</p>`, `<div class="box o">${tag("o")}<ul class="limits">${spec.page_gaps.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`, "", "Page gaps"));

  sections.push(sec("Method and limits", "", `<div class="box o">${tag("o")}<ul class="limits">
    <li>Qloo results describe what groups of people tend to like. They are not a prediction about any single person.</li>
    <li>For each audience, an AI agent chose which questions to ask Qloo, within a fixed budget. Its steps are listed under each audience; every number shown comes from Qloo's answers, not from the agent.</li>
    <li>Everything depends on how we read your page and which starting points we matched in Qloo (section 02).</li>
    <li>Affinity scores run from 0 to 1 and compare against everyone else. Demographic leans run from −1 to +1; 0 is average.</li>
    <li>Community sizes and rules change; check them before you post or spend. Links were checked on ${esc(date)}.</li>
    <li>No personal data was sent to Qloo. Only the public content of your page was analysed.</li>
  </ul></div>`, "", "Method"));

  const icon = page.image
    ? `<img src="${esc(page.image)}" alt="">`
    : `<div class="mono-icon">${esc(profile.name.trim().charAt(0).toUpperCase())}</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Who Would Love: ${esc(profile.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header class="cover">
  <div class="mesh"><i></i><i></i><i></i></div>
  <div class="wrap">
    <div class="top"><a class="logo" href="/">${LOGO}Who Would Love</a><span><a href="/reports">Sample reports</a> · Audience report · ${esc(date)}</span></div>
    <div class="app">${icon}<div>
      <div class="eyebrow">Audience report for</div>
      <h1>${esc(profile.name)}</h1>
      <div class="meta">${esc(host)} · scope: ${esc(scope)} · markets: ${esc(taste.markets.join(", "))}</div>
    </div></div>
  </div>
</header>
<div class="bar"><div class="wrap">
  <span class="lbl">Show</span>
  <div class="seg" role="group" aria-label="Filter by source">
    <button type="button" aria-pressed="true" data-f="all">Everything</button>
    <button type="button" aria-pressed="false" data-f="q"><i style="background:var(--qloo)"></i>Qloo data</button>
    <button type="button" aria-pressed="false" data-f="w"><i style="background:var(--web)"></i>Web research</button>
    <button type="button" aria-pressed="false" data-f="o"><i style="background:var(--ours)"></i>Our interpretation</button>
  </div>
</div>
<div class="wrap"><nav class="toc" id="toc" aria-label="Sections">${nav.map((x) => `<a href="#${x.id}"${x.hot ? ' class="hot"' : ""}>${x.hot ? "✦ " : ""}${x.label}</a>`).join("")}</nav></div>
</div>
<main><div class="wrap">
${sections.join("\n")}
<p class="empty" id="empty">Nothing from this source in the report.</p>
<footer><span>Who Would Love · Taste data by Qloo</span><span>Report ${esc(id)}</span></footer>
</div></main>
<script>
const btns=[...document.querySelectorAll('.seg button')];
btns.forEach(b=>b.addEventListener('click',()=>{
  const f=b.dataset.f;
  btns.forEach(x=>x.setAttribute('aria-pressed',x===b));
  document.querySelectorAll('.box,.kpi').forEach(el=>el.classList.toggle('hidden',f!=='all'&&!el.classList.contains(f)));
  let any=false;
  document.querySelectorAll('.sec').forEach(s=>{
    const vis=[...s.querySelectorAll('.box,.kpi')].some(el=>!el.classList.contains('hidden'));
    s.classList.toggle('hidden',!vis); any=any||vis;
  });
  document.querySelectorAll('.kpis').forEach(k=>k.style.display=[...k.children].some(c=>!c.classList.contains('hidden'))?'':'none');
  document.getElementById('empty').style.display=any?'none':'block';
}));
// Section menu: keep the sticky offsets in step with the bar, and mark the section being read.
const bar=document.querySelector('.bar'),toc=document.getElementById('toc'),links=[...toc.querySelectorAll('a')];
const setBar=()=>document.documentElement.style.setProperty('--barh',bar.offsetHeight+'px');
setBar();addEventListener('resize',setBar);
// Reports whose ad kit failed have no #ads section: drop its menu entry and the call-out.
if(!document.getElementById('ads')){links.filter(a=>a.hash==='#ads').forEach(a=>a.remove());document.querySelector('.adcall')?.remove();links.splice(0,links.length,...toc.querySelectorAll('a'));}
let current=null;
function spy(){
  const y=bar.offsetHeight+60;let on=null;
  for(const a of links){const s=document.getElementById(a.getAttribute('href').slice(1));if(s&&!s.classList.contains('hidden')&&s.getBoundingClientRect().top<=y)on=a;}
  if(on===current)return;current=on;
  links.forEach(a=>a.classList.toggle('on',a===on));
  if(on)toc.scrollTo({left:on.offsetLeft-toc.clientWidth/2+on.offsetWidth/2,behavior:'smooth'});
}
addEventListener('scroll',spy,{passive:true});spy();
btns.forEach(b=>b.addEventListener('click',()=>{links.forEach(a=>{const s=document.getElementById(a.getAttribute('href').slice(1));a.classList.toggle('off',!s||s.classList.contains('hidden'))});spy();}));
function copy(btn){
  const t=btn.previousElementSibling.textContent;
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>{btn.textContent='Copied';setTimeout(()=>btn.textContent='Copy',1400)}).catch(()=>{});
}
</script>
</body>
</html>`;
}

const CSS = `
:root{
  --bg:#f6f4f1; --card:#fff; --ink:#15121b; --ink-2:#4f4a58; --ink-3:#8b8693; --line:#e4e0e8; --soft:#f4f2f6;
  --night:#08121a; --accent:#ff6a3d; --accent-2:#e2552d;
  --qloo:#2f7a63; --qloo-bg:#ecf6f2; --web:#4062e0; --web-bg:#eef2fe; --ours:#b9780f; --ours-bg:#fdf5e6;
  --display:'Bricolage Grotesque',system-ui,sans-serif; --sans:'Geist',system-ui,sans-serif; --mono:'Geist Mono',ui-monospace,monospace;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16.5px;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--web);text-underline-offset:3px}
.wrap{max-width:1180px;margin:0 auto;padding:0 32px}
.cover{position:relative;overflow:hidden;isolation:isolate;background:var(--night);color:#fff;padding:28px 0 64px}
.mesh{position:absolute;inset:0;z-index:-1}
.mesh i{position:absolute;border-radius:50%;filter:blur(90px);opacity:.7}
.mesh i:nth-child(1){width:50%;height:90%;left:-10%;top:-30%;background:#0e5e63}
.mesh i:nth-child(2){width:40%;height:80%;right:-8%;top:0;background:#e2552d;opacity:.45}
.mesh i:nth-child(3){width:16%;height:30%;right:30%;top:-10%;background:#f2a33a;opacity:.3}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font-size:14px;color:rgba(255,255,255,.7)}
.logo{font-family:var(--display);font-weight:600;font-size:23px;letter-spacing:-.025em;display:flex;align-items:center;gap:10px;color:#fff}
a.logo{text-decoration:none}.top span a{color:#fff}
.logo svg{width:30px;height:36px;color:#fff}
.app{display:flex;gap:24px;align-items:center;margin-top:56px}
.app img,.mono-icon{width:104px;height:104px;border-radius:24px;box-shadow:0 20px 40px -16px rgba(0,0,0,.7);flex:none;object-fit:contain;background:#000}
.mono-icon{display:grid;place-items:center;background:linear-gradient(135deg,#0e5e63,#e2552d);font-family:var(--display);font-weight:700;font-size:52px}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.6)}
h1{font-family:var(--display);font-weight:600;font-size:clamp(36px,6vw,72px);letter-spacing:-.04em;line-height:1.02;margin:6px 0 10px}
.meta{font-family:var(--mono);font-size:13px;color:rgba(255,255,255,.6);overflow-wrap:anywhere}
.bar{position:sticky;top:0;z-index:10;background:rgba(246,244,241,.86);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.bar .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:14px;padding-bottom:14px;flex-wrap:wrap}
.bar .lbl{font-size:14px;color:var(--ink-2)}
.seg{display:flex;gap:4px;background:#ebe7ee;padding:4px;border-radius:14px;flex-wrap:wrap}
.seg button{font:inherit;font-size:14px;font-weight:500;border:0;background:transparent;color:var(--ink-2);padding:8px 14px;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background .2s,color .2s}
.seg button i{width:8px;height:8px;border-radius:50%}
.seg button[aria-pressed=true]{background:#fff;color:var(--ink);box-shadow:0 2px 8px -3px rgba(21,18,27,.25)}
main{padding:24px 0 80px}
.sec{display:grid;grid-template-columns:260px 1fr;gap:40px;padding:48px 0;border-bottom:1px solid var(--line)}
.sec.hidden{display:none}
@media (min-width:861px){.side{position:sticky;top:calc(var(--barh,124px) + 16px);align-self:start}}
.sec{scroll-margin-top:calc(var(--barh,124px) + 8px)}
.toc{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:0 0 10px;margin-top:-4px}
.toc::-webkit-scrollbar{display:none}
.toc a{flex:none;font-size:13.5px;color:var(--ink-2);text-decoration:none;padding:6px 12px;border-radius:999px;white-space:nowrap;transition:background .2s,color .2s}
.toc a:hover{background:#ebe7ee;color:var(--ink)}
.toc a.on{background:var(--ink);color:#fff}
.toc a.hot{background:var(--accent);color:#fff;font-weight:600}
.toc a.hot.on{background:var(--accent-2);box-shadow:0 0 0 3px rgba(255,106,61,.25)}
.toc a.off{display:none}
.adcall{display:flex;align-items:center;gap:16px;text-decoration:none;color:#fff;background:linear-gradient(120deg,#15121b,#3a1f3f 60%,#e2552d);border-radius:20px;padding:20px 24px;transition:transform .2s}
.adcall:hover{transform:translateY(-2px)}
.adcall .spark{font-size:26px;color:#ffb38f}
.adcall b{display:block;font-family:var(--display);font-size:20px;letter-spacing:-.02em;margin-bottom:2px}
.adcall span span,.adcall > span:nth-child(2){font-size:14.5px;color:rgba(255,255,255,.8)}
.adcall i{margin-left:auto;font-style:normal;font-weight:600;white-space:nowrap;background:#fff;color:#15121b;padding:9px 14px;border-radius:12px;font-size:14px}
.side .num{font-family:var(--mono);font-size:13px;color:var(--accent-2)}
.side h2{font-family:var(--display);font-weight:600;font-size:30px;letter-spacing:-.03em;line-height:1.08;margin-top:8px}
.side p{color:var(--ink-2);font-size:15px;margin-top:10px}
.side .aud{font-family:var(--mono);font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-top:10px}
.side blockquote{margin-top:16px;padding-left:14px;border-left:2px solid var(--accent);font-size:14px;color:var(--ink-2);font-style:italic}
.side cite{display:block;font-style:normal;font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-top:6px}
.blocks{display:flex;flex-direction:column;gap:16px;min-width:0}
.box{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px 26px;position:relative}
.box.hidden{display:none}
.box p+p{margin-top:10px}
.tag{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:500;padding:4px 10px;border-radius:999px;margin-bottom:14px}
.tag::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.tag.q{background:var(--qloo-bg);color:var(--qloo)}.tag.w{background:var(--web-bg);color:var(--web)}.tag.o{background:var(--ours-bg);color:var(--ours)}
.lead{font-family:var(--display);font-weight:500;font-size:26px;line-height:1.3;letter-spacing:-.02em}
.lead.sm{font-size:22px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:20px 22px}
.kpi.hidden{display:none}
.kpi b{display:block;font-family:var(--display);font-weight:600;font-size:40px;letter-spacing:-.03em;line-height:1.1;margin-bottom:4px}
.kpi > span:not(.tag){display:block;font-size:14px;color:var(--ink-2)}
.kpi .tag{margin:12px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.chip{font-size:14px;font-weight:500;background:var(--soft);border-radius:10px;padding:6px 11px}
.chip small{font-family:var(--mono);font-size:10.5px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-left:6px}
.chip.off{background:transparent;border:1px dashed var(--line);color:var(--ink-3);text-decoration:line-through}
.chip.off small{text-decoration:none;display:inline-block}
.small{font-size:14px;color:var(--ink-2);margin-top:16px}
table{width:100%;border-collapse:collapse;font-size:15px}
th{text-align:left;font-family:var(--mono);font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);font-weight:500;padding:0 8px 10px;border-bottom:1px solid var(--line)}
td{padding:11px 8px;border-bottom:1px solid var(--soft);vertical-align:top}
tr:last-child td{border-bottom:0}
td.n{font-family:var(--mono);text-align:right;white-space:nowrap;font-size:14px}
td .cat{font-family:var(--mono);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)}
td .note{font-size:13.5px;color:var(--ink-3);margin-top:3px;line-height:1.45}
td .size{font-family:var(--mono);font-size:12px;color:var(--ink-2);margin-top:2px}
table.comm td:first-child{width:34%}
.meter{height:8px;background:var(--soft);border-radius:999px;overflow:hidden;min-width:80px;margin-top:8px}
.meter i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#57a88d,var(--qloo))}
.split{display:grid;grid-template-columns:1.35fr 1fr;gap:36px}
.split h4,.placecols h4{font-size:13px;font-weight:600;color:var(--ink-2);margin-bottom:6px}
.split h4.gap{margin-top:18px}
.sub0{font-size:14px;color:var(--ink-2);margin-bottom:12px}
.demo{display:grid;grid-template-columns:70px 1fr 48px;gap:12px;align-items:center;font-size:14px;margin:7px 0}
.demo .n{font-family:var(--mono);text-align:right;color:var(--ink-2);font-size:13px}
.skew{position:relative;height:8px;background:var(--soft);border-radius:999px}
.skew::after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--ink-3)}
.skew i{position:absolute;top:0;bottom:0;border-radius:999px}
.skew i.up{background:var(--qloo)}.skew i.down{background:#c9c3cf}
ol.places{padding-left:20px;font-size:14.5px}ol.places li{margin:4px 0}
.placecols{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:28px}
.paste{font-family:var(--mono);font-size:13.5px;background:var(--soft);border-radius:12px;padding:12px 14px;line-height:1.7;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.paste button{font:inherit;font-family:var(--sans);font-size:12.5px;font-weight:600;border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;flex:none}
.sub{font-weight:600;margin:18px 0 8px}.box .tag+.sub{margin-top:0}
ol.plan{padding-left:20px}ol.plan li{margin:8px 0}
.limits{list-style:none}
.limits li{padding:9px 0 9px 26px;position:relative;color:var(--ink-2);border-bottom:1px solid var(--soft)}
.limits li:last-child{border-bottom:0}
.limits li::before{content:"!";position:absolute;left:0;top:10px;width:17px;height:17px;border-radius:50%;background:var(--soft);font-size:11px;font-weight:700;display:grid;place-items:center;color:var(--ink-2)}
.muted{color:var(--ink-3);font-size:14px}
.trail summary{cursor:pointer;list-style:none}.trail summary::-webkit-details-marker{display:none}
.trail summary .tag{margin-bottom:8px}
.trail .sum{display:block;font-weight:600}.trail .sum::after{content:" +";color:var(--ink-3)}.trail[open] .sum::after{content:" −"}
.trail .findings{margin-top:14px;color:var(--ink-2)}
ol.steps{padding-left:22px;margin-top:14px;font-size:14.5px}ol.steps li{margin:10px 0}
ol.steps .ask{font-family:var(--mono);font-size:13px;color:var(--ink-2);overflow-wrap:anywhere}
.empty{display:none;text-align:center;color:var(--ink-3);padding:60px 0}
footer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-top:28px;font-size:13px;color:var(--ink-3)}
@media (max-width:860px){
  .wrap{padding:0 16px}
  .sec{grid-template-columns:1fr;gap:18px;padding:36px 0}
  .kpis,.split{grid-template-columns:1fr}
  .app{flex-direction:column;align-items:flex-start}
  .box{padding:20px 18px}
  table{font-size:14px}
  table.comm td:first-child{width:auto}
  .hide-m{display:none}
  .bar .lbl{display:none}
  .bar .wrap{padding-top:8px;padding-bottom:8px}
  .seg{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;width:100%}
  .seg::-webkit-scrollbar{display:none}
  .seg button{flex:none;padding:7px 11px;font-size:13px}
  .toc{padding-bottom:6px}
  .adcall{flex-wrap:wrap}.adcall i{margin-left:0}
}
@media print{.bar{display:none}body{background:#fff}.box{break-inside:avoid}}
`;
