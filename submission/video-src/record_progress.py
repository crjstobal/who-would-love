# Records the live progress page of a real run, from start until the report opens, as one
# continuous 1080p video. assemble.py speeds it up into a few seconds.
import sys, time, json, urllib.request
from playwright.sync_api import sync_playwright

rid = sys.argv[1]
url = f"https://whowouldlove.javi.link/r/{rid}"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, record_video_dir="raw/progress", record_video_size={"width": 1920, "height": 1080})
    pg = ctx.new_page()
    pg.goto(url)
    t0 = time.time()
    # The page reloads itself into the report when the run is done; stop shortly after that.
    while time.time() - t0 < 1500:
        pg.wait_for_timeout(5000)
        if pg.locator("main .sec").count() > 0:
            pg.wait_for_timeout(4000)
            break
    print("recorded", round(time.time() - t0), "s")
    ctx.close(); b.close()
