"""Store this project's API keys in AWS SSM without writing them to disk.

Run it, paste each key when asked (input is hidden). Leave the Firecrawl key
empty to reuse the one already stored in /servikaki/secrets/firecrawl.env.
"""
from getpass import getpass

import boto3

PARAM = "/servikaki/secrets/whowouldlove.env"
session = boto3.Session(profile_name="servikaki-secrets", region_name="eu-west-1")
ssm = session.client("ssm")


def read_env(name: str) -> dict:
    raw = ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]
    pairs = (line.split("=", 1) for line in raw.splitlines() if "=" in line and not line.startswith("#"))
    return {k.strip(): v.strip().strip('"').strip("'") for k, v in pairs}


anthropic = getpass("ANTHROPIC_API_KEY (hidden): ").strip()
firecrawl = getpass("FIRECRAWL_API_KEY (hidden, empty = reuse firecrawl.env): ").strip()
if not firecrawl:
    firecrawl = read_env("/servikaki/secrets/firecrawl.env")["FIRECRAWL_API_KEY"]

if not anthropic.startswith("sk-ant-"):
    raise SystemExit("That does not look like an Anthropic key (should start with sk-ant-).")

value = f"ANTHROPIC_API_KEY={anthropic}\nFIRECRAWL_API_KEY={firecrawl}\n"
ssm.put_parameter(Name=PARAM, Value=value, Type="SecureString", Overwrite=True)
print(f"Saved to {PARAM}: ANTHROPIC_API_KEY, FIRECRAWL_API_KEY")
