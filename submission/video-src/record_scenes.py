# Records each scene of the demo video from the live site at 1920x1080, timed to its narration.
# Usage: python record_scenes.py <report id> [scene ids...]
# Each scene is saved as raw/<id>.webm plus the second where its action starts (raw/<id>.json),
# so assemble.py can cut away the page load.
import json, sys, time
from playwright.sync_api import sync_playwright

SITE = "https://whowouldlove.javi.link"
RID = sys.argv[1]
ONLY = set(sys.argv[2:])
script = json.load(open("script.json"))
voice = json.load(open("out/voice.json"))
dur = {s["id"]: voice[s["id"]] + s["pad"] for s in script["scenes"]}

HELPERS = """
window.ease = (y, ms) => new Promise(done => {
  const y0 = scrollY, t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
    scrollTo(0, y0 + (y - y0) * e); k < 1 ? requestAnimationFrame(step) : done(); };
  requestAnimationFrame(step);
});
window.yOf = (el, off) => el.getBoundingClientRect().top + scrollY - off;
const st = document.createElement('style');
st.textContent = `.hl{outline:4px solid #ff6a3d!important;outline-offset:6px;border-radius:14px;transition:outline-color .3s}
  .totop{display:none!important} html{scroll-behavior:auto!important}`;
document.head.append(st);
"""


def scene(browser, sid, url, setup, act, zoom=1.0):
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080}, record_video_dir="raw/tmp",
                                 record_video_size={"width": 1920, "height": 1080},
                                 permissions=["clipboard-read", "clipboard-write"])
    t0 = time.time()
    pg = ctx.new_page()
    pg.goto(url, wait_until="networkidle")
    pg.evaluate(HELPERS)
    if zoom != 1.0:
        pg.evaluate(f"document.body.style.zoom={zoom}")
    setup(pg)
    pg.wait_for_timeout(700)
    start = time.time() - t0
    act(pg, dur[sid] * 1000)
    pg.wait_for_timeout(300)
    path = pg.video.path()
    ctx.close()
    import shutil
    shutil.move(path, f"raw/{sid}.webm")
    json.dump({"start": round(start, 3), "dur": dur[sid]}, open(f"raw/{sid}.json", "w"))
    print(f"{sid:10} start {start:5.2f}s, {dur[sid]:5.2f}s")


report = f"{SITE}/r/{RID}"


def paste_setup(pg):
    pg.evaluate("scrollTo(0, 0)")


def paste_act(pg, ms):
    pg.wait_for_timeout(500)
    pg.evaluate("ease(yOf(document.getElementById('f'), 260), 900)")
    pg.wait_for_timeout(1000)
    pg.click("#url")
    pg.keyboard.type("https://www.allbirds.com/products/mens-tree-runners", delay=28)
    pg.wait_for_timeout(250)
    pg.hover("#go")
    pg.evaluate("document.getElementById('go').style.transform='scale(.98)'")
    pg.wait_for_timeout(max(200, ms - 3900))


def taste_setup(pg):
    pg.evaluate("scrollTo(0, yOf(document.getElementById('s03'), 140))")


def taste_act(pg, ms):
    pg.wait_for_timeout(900)
    pg.evaluate("ease(yOf(document.querySelector('#s03 .box.q table'), 170), 1400)")
    pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#s03 .box.q table').classList.add('hl')")
    pg.wait_for_timeout(ms * 0.45)
    pg.evaluate("document.querySelector('#s03 .box.q table').classList.remove('hl'); document.querySelector('#s03 .split > div:nth-child(2)').classList.add('hl')")
    pg.wait_for_timeout(max(300, ms * 0.55 - 2400))


def targeting_setup(pg):
    pg.evaluate("scrollTo(0, yOf([...document.querySelectorAll('#s03 .sub')].find(e => e.textContent.startsWith('Meta')), 330))")


def targeting_act(pg, ms):
    pg.wait_for_timeout(500)
    box = "[...document.querySelectorAll('#s03 .sub')].find(e => e.textContent.startsWith('Meta')).nextElementSibling"
    pg.evaluate(f"{box}.classList.add('hl')")
    pg.wait_for_timeout(1100)
    pg.evaluate(f"{box}.querySelector('button').click()")
    pg.wait_for_timeout(max(300, ms - 1600))


def ads_setup(pg):
    pg.evaluate("scrollTo(0, yOf(document.getElementById('s06') || document.getElementById('s05'), 140))")


def ads_act(pg, ms):
    pg.wait_for_timeout(700)
    pg.evaluate("document.querySelector('.toc a.hot').classList.add('hl')")
    pg.wait_for_timeout(700)
    pg.evaluate("document.querySelector('.toc a.hot').classList.remove('hl'); ease(yOf(document.getElementById('ads'), 150), 1300)")
    pg.wait_for_timeout(1700)
    pg.evaluate("ease(yOf(document.querySelector('#ads .concept .mocks'), 230), 1200)")
    pg.wait_for_timeout(1400)
    pg.evaluate("document.querySelector('#ads .concept .mocks').classList.add('hl')")
    pg.wait_for_timeout(max(300, ms - 4500))


def evidence_setup(pg):
    pg.evaluate("scrollTo(0, yOf(document.querySelector('#ads .concept .evs'), 520))")


def evidence_act(pg, ms):
    pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#ads .concept .evs').classList.add('hl')")
    pg.wait_for_timeout(max(300, ms - 300))


def critic_setup(pg):
    # The kit whose critic sent the most drafts back, with its agent log open.
    pg.evaluate("""(() => {
      const kits = [...document.querySelectorAll('#ads details.kit')];
      const drafts = k => (k.querySelector('details.how summary')?.textContent.match(/after (\\d+) draft/) || [0, 1])[1] * 1;
      const k = kits.sort((a, b) => drafts(b) - drafts(a))[0];
      k.open = true; const h = k.querySelector('details.how'); h.open = true; window.critic = h;
      scrollTo(0, yOf(h, 260));
    })()""")


def critic_act(pg, ms):
    pg.wait_for_timeout(500)
    pg.evaluate("""(() => { const li = [...critic.querySelectorAll('li')].find(l => /critic: \\d+ issue/.test(l.textContent));
      if (li) { ease(yOf(li, 420), 1200); setTimeout(() => li.classList.add('hl'), 1300); } })()""")
    pg.wait_for_timeout(max(300, ms - 500))


def close_setup(pg):
    pass


def close_act(pg, ms):
    pg.evaluate("document.body.classList.add('go')")
    pg.wait_for_timeout(ms)


import os
os.makedirs("raw", exist_ok=True)
with sync_playwright() as p:
    plan = [
        ("paste", SITE + "/?v=video", paste_setup, paste_act, 1.0),
        ("taste", report, taste_setup, taste_act, 1.25),
        ("targeting", report, targeting_setup, targeting_act, 1.25),
        ("ads", report, ads_setup, ads_act, 1.25),
        ("evidence", report, evidence_setup, evidence_act, 1.25),
        ("critic", report, critic_setup, critic_act, 1.25),
        ("close", "file://" + os.path.abspath("close.html"), close_setup, close_act, 1.0),
    ]
    browser = p.chromium.launch()
    for sid, url, setup, act, zoom in plan:
        if not ONLY or sid in ONLY:
            scene(browser, sid, url, setup, act, zoom)
    browser.close()
