# Builds the final video: cuts each recorded scene to its narration, speeds up the progress recording,
# overlays captions (rendered as images, because this ffmpeg has no subtitles filter), adds the voice,
# and writes the .srt for YouTube. Output: ../video/who-would-love-demo.mp4 and .srt
import glob, json, os, re, subprocess
from playwright.sync_api import sync_playwright

script = json.load(open("script.json"))
voice = json.load(open("out/voice.json"))
scenes = script["scenes"]
dur = {s["id"]: voice[s["id"]] + s["pad"] for s in scenes}
os.makedirs("out/clips", exist_ok=True)
os.makedirs("out/caps", exist_ok=True)


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def length(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())


ENC = ["-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "18", "-an"]

# 1. One clip per scene, exactly as long as its narration.
for s in scenes:
    sid, d, out = s["id"], dur[s["id"]], f"out/clips/{s['id']}.mp4"
    if sid == "agents":
        src = sorted(glob.glob("raw/progress/*.webm"), key=os.path.getmtime)[-1]
        skip = 2.0  # page load
        speed = (length(src) - skip) / d
        # Zoom in on the progress card so the agents' steps are readable.
        run("ffmpeg", "-y", "-ss", str(skip), "-i", src, "-vf", f"setpts=PTS/{speed:.4f},fps=30,crop=1120:630:400:300,scale=1920:1080:flags=lanczos", "-t", f"{d:.3f}", *ENC, out)
    else:
        meta = json.load(open(f"raw/{sid}.json"))
        run("ffmpeg", "-y", "-ss", f"{meta['start']:.3f}", "-i", f"raw/{sid}.webm", "-t", f"{d:.3f}", "-vf", "fps=30,scale=1920:1080", *ENC, out)
    print(f"{sid:10} {length(out):5.2f}s")

# 2. Caption chunks, timed by length within each line of narration.
def chunks(text, limit=64):
    parts = re.split(r"(?<=[.:,?])\s+", text)
    out, cur = [], ""
    for p in parts:
        if cur and len(cur) + 1 + len(p) > limit:
            out.append(cur); cur = p
        else:
            cur = f"{cur} {p}".strip()
    if cur:
        out.append(cur)
    return out

cues, t = [], 0.0
for s in scenes:
    pieces = chunks(s["caption"])
    total = sum(len(x) for x in pieces) or 1
    v, c = voice[s["id"]], t + 0.05
    for x in pieces:
        d = v * len(x) / total
        cues.append((c, c + d, x)); c += d
    t += dur[s["id"]]

def stamp(x):
    h, m, sec = int(x // 3600), int(x % 3600 // 60), x % 60
    return f"{h:02}:{m:02}:{sec:06.3f}".replace(".", ",")

with open("../video/who-would-love-demo.srt", "w") as f:
    for i, (a, b, x) in enumerate(cues, 1):
        f.write(f"{i}\n{stamp(a)} --> {stamp(b)}\n{x}\n\n")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1920, "height": 1080})
    for i, (_, _, x) in enumerate(cues):
        pg.set_content(f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Geist:wght@500&display=swap" rel="stylesheet">
        <style>html,body{{margin:0;background:transparent}}div{{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);max-width:1500px;
        font:500 40px/1.35 Geist,sans-serif;color:#fff;background:rgba(10,12,18,.82);padding:14px 30px;border-radius:16px;text-align:center}}</style></head>
        <body><div>{x}</div></body></html>""")
        pg.wait_for_timeout(250 if i else 1200)
        pg.screenshot(path=f"out/caps/{i:02}.png", omit_background=True)
    b.close()

# 3. Join the clips, overlay captions, add the narration with each scene's pause.
with open("out/list.txt", "w") as f:
    for s in scenes:
        f.write(f"file 'clips/{s['id']}.mp4'\n")
run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "out/list.txt", "-c", "copy", "out/joined.mp4")

inputs, graph, last = ["-i", "out/joined.mp4"], [], "[0:v]"
for i, (a, b2, _) in enumerate(cues):
    inputs += ["-i", f"out/caps/{i:02}.png"]
    graph.append(f"{last}[{i + 1}:v]overlay=0:0:enable='between(t,{a:.3f},{b2:.3f})'[v{i}]")
    last = f"[v{i}]"
base = len(cues) + 1
for j, s in enumerate(scenes):
    inputs += ["-i", f"out/vo-{s['id']}.mp3"]
    graph.append(f"[{base + j}:a]apad=whole_dur={dur[s['id']]:.3f}[a{j}]")
graph.append("".join(f"[a{j}]" for j in range(len(scenes))) + f"concat=n={len(scenes)}:v=0:a=1[aout]")
run("ffmpeg", "-y", *inputs, "-filter_complex", ";".join(graph), "-map", last, "-map", "[aout]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", "../video/who-would-love-demo.mp4")
print("video", round(length("../video/who-would-love-demo.mp4"), 2), "s")
