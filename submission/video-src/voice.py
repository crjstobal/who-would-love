# Generates one narration clip per scene with ElevenLabs and records its length in out/voice.json.
# The key is read from AWS SSM at runtime, never written to disk.
import json, os, subprocess
from functools import lru_cache

import boto3
import requests


@lru_cache(maxsize=None)
def _load(env_file: str) -> dict:
    session = boto3.Session(profile_name="servikaki-secrets", region_name="eu-west-1")
    raw = session.client("ssm").get_parameter(Name=f"/servikaki/secrets/{env_file}", WithDecryption=True)["Parameter"]["Value"]
    out = {}
    for line in raw.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


script = json.load(open("script.json"))
os.makedirs("out", exist_ok=True)
key = _load("elevenlabs.env")["ELEVENLABS_API_KEY"]
lengths = {}
for s in script["scenes"]:
    path = f"out/vo-{s['id']}.mp3"
    if not os.path.exists(path):
        r = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{script['voice_id']}?output_format=mp3_44100_128",
            headers={"xi-api-key": key, "Content-Type": "application/json"},
            json={"text": s["voice"], "model_id": "eleven_multilingual_v2",
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.15, "use_speaker_boost": True}},
            timeout=120,
        )
        r.raise_for_status()
        open(path, "wb").write(r.content)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())
    lengths[s["id"]] = round(dur, 3)
    print(f"{s['id']:10} {dur:5.2f}s")
json.dump(lengths, open("out/voice.json", "w"), indent=1)
print("total voice", round(sum(lengths.values()), 1), "s")
