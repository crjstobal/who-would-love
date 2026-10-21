#!/usr/bin/env bash
# Run a command with this project's API keys in its environment, read from AWS SSM.
# Nothing is written to disk. Usage: scripts/with-secrets.sh <command...>
set -euo pipefail
ssm() {
  aws ssm get-parameter --name "/servikaki/secrets/$1" --with-decryption \
    --profile servikaki-secrets --region eu-west-1 --query Parameter.Value --output text
}
val() { printf '%s\n' "$1" | sed -n "s/^$2=//p" | head -1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
WWL=$(ssm whowouldlove.env); FC=$(ssm firecrawl.env); QL=$(ssm qloo.env); CF=$(ssm cloudflare.env)
export ANTHROPIC_API_KEY=$(val "$WWL" ANTHROPIC_API_KEY)
export TURNSTILE_SECRET=$(val "$WWL" TURNSTILE_SECRET)
export IP_SALT=$(val "$WWL" IP_SALT)
export JUDGE_CODE=$(val "$WWL" JUDGE_CODE)
export FIRECRAWL_API_KEY=$(val "$FC" FIRECRAWL_API_KEY)
export QLOO_API_KEY=$(val "$QL" QLOO_API_KEY)
export CLOUDFLARE_API_TOKEN=$(val "$CF" CLOUDFLARE_API_TOKEN)
export CLOUDFLARE_ACCOUNT_ID=$(val "$CF" CLOUDFLARE_ACCOUNT_ID)
exec "$@"
