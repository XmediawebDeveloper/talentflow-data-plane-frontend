#!/usr/bin/env bash
#
# Run a Tier-3 spec against the QA stack — but not while CI is using the machine.
#
# Twice now a local suite has been started while a pipeline was mid-run, and both
# times the pipeline was the thing that suffered: two Playwright suites on one
# 12-core box took the load average to 14.75, `locator.fill` timed out after two
# minutes, and a job that normally finishes in 2 minutes took 26 and came back
# with 23 flaky tests and one failure. Nothing was wrong with the code either
# time. The runner's `concurrent = 1` does not help, because a container started
# by hand is outside the runner's accounting.
#
# Remembering was the plan the first time. This is the second time, so the check
# is a step rather than an intention.
#
#   e2e/scripts/local-run.sh smoke-tier3-signin
#   e2e/scripts/local-run.sh smoke-tier3-login smoke-tier3-session
#   FORCE=1 e2e/scripts/local-run.sh smoke-tier3-pages   # deliberate override
#
set -euo pipefail

PROJECT_ID="${GITLAB_PROJECT_ID:-1814}"
BRANCH="${GITLAB_BRANCH:-ci/cd-staging}"
TENANT_FILE="${QA_TENANT_FILE:-/opt/talentflow/qa/tenant.json}"
APP_URL="${TIER3_APP_URL:-http://192.168.2.12:3201}"
API_URL="${TIER3_API_URL:-http://192.168.2.12:8200}"
IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.59.1-jammy}"

if [ $# -eq 0 ]; then
  echo "usage: $0 <spec> [spec...]     e.g. $0 smoke-tier3-signin" >&2
  exit 2
fi

# ---- is CI using the machine? ----------------------------------------------
# The token is read from the environment, or from the dashboard's own .env if it
# happens to be on this box. Without one the check cannot run, and the script
# says so and stops rather than proceeding blind — an unchecked run is exactly
# what this exists to prevent.
TOKEN="${GITLAB_TOKEN:-}"
GITLAB_URL="${GITLAB_URL:-https://gitlab.mo.vc}"
if [ -z "$TOKEN" ] && [ -r /root/data_plane/qa-dashboard/.env ]; then
  TOKEN=$(grep -h '^GITLAB_TOKEN=' /root/data_plane/qa-dashboard/.env 2>/dev/null | cut -d= -f2- || true)
fi

if [ "${FORCE:-0}" = "1" ]; then
  echo "FORCE=1 — running without checking whether a pipeline is live."
elif [ -z "$TOKEN" ]; then
  echo "No GITLAB_TOKEN, so whether a pipeline is running cannot be checked." >&2
  echo "Set GITLAB_TOKEN, or FORCE=1 if you know the runner is idle." >&2
  exit 3
else
  STATE=$(curl -s --max-time 20 -H "PRIVATE-TOKEN: $TOKEN" \
    "$GITLAB_URL/api/v4/projects/$PROJECT_ID/pipelines?ref=$(printf '%s' "$BRANCH" | sed 's|/|%2F|g')&per_page=1" \
    | python3 -c 'import json,sys
try:
    p = json.load(sys.stdin)[0]
    print(p["status"], p["id"])
except Exception:
    print("unknown 0")' 2>/dev/null || echo "unknown 0")

  case "$STATE" in
    running*|pending*|created*|waiting*|preparing*)
      echo "Pipeline ${STATE#* } is $( echo "$STATE" | cut -d' ' -f1 ) on $BRANCH."
      echo
      echo "Not starting: two Playwright suites on this box is what took a 2-minute"
      echo "job to 26 minutes with 23 flaky tests, twice. Wait for it, or FORCE=1"
      echo "if you mean it."
      exit 1 ;;
    unknown*)
      echo "Could not read the pipeline state from GitLab. Not guessing — rerun," >&2
      echo "or FORCE=1 if the runner is idle." >&2
      exit 3 ;;
    *)
      echo "Pipeline ${STATE#* } is $( echo "$STATE" | cut -d' ' -f1 ) — the runner is idle." ;;
  esac
fi

# ---- the QA tenant ----------------------------------------------------------
if [ ! -r "$TENANT_FILE" ]; then
  echo "Cannot read $TENANT_FILE — that is where the QA tenant's credentials live." >&2
  exit 4
fi
read -r SUB MAIL PASS <<EOF
$(python3 -c "
import json
t = json.load(open('$TENANT_FILE'))
print(t['subdomain'], t['adminEmail'], t['adminPassword'])
")
EOF

echo "Running: $*"
exec docker run --rm --network host \
  -v "$PWD:/w" -w /w \
  -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -e E2E_EXTERNAL=1 \
  -e BASE_URL="$APP_URL" \
  -e TIER3_APP_URL="$APP_URL" \
  -e TIER3_API_URL="$API_URL" \
  -e TIER3_TENANT_SUBDOMAIN="$SUB" \
  -e TIER3_ADMIN_EMAIL="$MAIL" \
  -e TIER3_ADMIN_PASSWORD="$PASS" \
  -e PLAYWRIGHT_JSON_OUTPUT_NAME=report.json \
  "$IMAGE" \
  npx playwright test "$@" --reporter=line -j 1
