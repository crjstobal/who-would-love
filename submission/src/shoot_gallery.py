# Gallery screenshots for Devpost (1500 x 1000), taken from the live site.
from playwright.sync_api import sync_playwright

SITE = "https://whowouldlove.javi.link"
HADES, MOMENT = "9f615f1d8786", "momentline"

def at(pg, js, wait=900):
    # The back-to-top button is only noise in a still image.
    pg.add_style_tag(content=".totop{display:none!important}")
    pg.evaluate("document.documentElement.style.scrollBehavior='auto';" + js)
    pg.wait_for_timeout(wait)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1500, "height": 1000}, device_scale_factor=1)

    pg.goto(SITE + "/"); pg.wait_for_timeout(2500)
    pg.screenshot(path="../gallery/01-home.png")

    pg.goto(f"{SITE}/r/{HADES}"); pg.wait_for_timeout(2500)
    at(pg, "scrollTo(0, document.getElementById('s01').offsetTop - 140)")
    pg.screenshot(path="../gallery/03-summary.png")

    at(pg, "const d=document.querySelector('#s03 details.trail'); d.open=true; scrollTo(0, d.getBoundingClientRect().top + scrollY - 150)")
    pg.screenshot(path="../gallery/04-taste-agent.png")

    at(pg, "scrollTo(0, document.querySelector('#ads details.kit').getBoundingClientRect().top + scrollY - 150)")
    pg.screenshot(path="../gallery/05-ad-kit.png")

    pg.goto(f"{SITE}/r/{MOMENT}"); pg.wait_for_timeout(2500)
    at(pg, "const k=[...document.querySelectorAll('#ads details.kit')].pop(); k.open=true; const h=k.querySelector('details.how'); h.open=true; scrollTo(0, h.getBoundingClientRect().top + scrollY - 260)")
    pg.screenshot(path="../gallery/06-critic.png")

    pg.goto(SITE + "/reports"); pg.wait_for_timeout(2500)
    pg.screenshot(path="../gallery/07-samples.png")

    pg.goto(SITE + "/pricing"); pg.wait_for_timeout(2000)
    pg.screenshot(path="../gallery/08-pricing.png")
    b.close()
