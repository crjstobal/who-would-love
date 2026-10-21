#!/usr/bin/env bash
# Deploy the API Worker (with its secrets, read from AWS SSM and piped straight to Cloudflare)
# and the website (Cloudflare Pages). Usage: scripts/deploy.sh [api|web|secrets|all]
set -euo pipefail
cd "$(dirname "$0")/.."
what=${1:-all}

if [[ $what == secrets || $what == all ]]; then
  scripts/with-secrets.sh bash -c '
    node -e "process.stdout.write(JSON.stringify(Object.fromEntries(
      [\"ANTHROPIC_API_KEY\",\"FIRECRAWL_API_KEY\",\"QLOO_API_KEY\",\"TURNSTILE_SECRET\",\"IP_SALT\",\"JUDGE_CODE\"]
        .filter(k => process.env[k]).map(k => [k, process.env[k]]))))" |
    npx wrangler secret bulk --config api/wrangler.jsonc'
fi

if [[ $what == api || $what == all ]]; then
  scripts/with-secrets.sh npx wrangler deploy --config api/wrangler.jsonc
fi

if [[ $what == web || $what == all ]]; then
  cd web
  ../scripts/with-secrets.sh npx wrangler pages project list | grep -q who-would-love ||
    ../scripts/with-secrets.sh npx wrangler pages project create who-would-love --production-branch main
  ../scripts/with-secrets.sh npx wrangler pages deploy --branch main --commit-dirty=true
fi
