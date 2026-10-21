from playwright.sync_api import sync_playwright
import os
src="file://"+os.path.abspath("thumb.html")
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,w,h,u,pad,extra in [
        ("../devpost-thumbnail.png",1500,1000,48,90,""),
        ("../video-thumbnail.png",1280,720,40,64,"document.getElementById('h1').innerHTML='Who would love<br><em>your app?</em>';document.getElementById('sub').textContent='Paste a link. Get the audiences, what they love, and where to find them.';"),
    ]:
        pg=b.new_page(viewport={"width":w,"height":h})
        pg.goto(src); pg.evaluate(f"document.documentElement.style.cssText='--w:{w}px;--h:{h}px;--u:{u}px;--pad:{pad}px'"); pg.evaluate(extra or "0")
        pg.wait_for_timeout(1500); pg.screenshot(path=name); print(name)
    b.close()
