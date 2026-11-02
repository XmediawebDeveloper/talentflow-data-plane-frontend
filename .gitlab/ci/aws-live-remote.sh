#!/usr/bin/env bash
# =============================================================================
# Runs ON the AWS EC2 instance — piped over SSH by .gitlab/ci/aws-live.yml.
# Identical copy lives in the frontend repo; keep the two in sync.
#
#   deploy <dir> <IMAGE_VAR> <image>   pull <image>, restart, remember previous
#   health <dir> <url> <tries>         wait for <url>; on failure roll back
#
# The image actually running is recorded in <dir>/release.env (passed to
# compose via --env-file), so a manual restart on the server uses the same
# image the pipeline deployed:
#   cd <dir> && docker compose --env-file release.env up -d
# =============================================================================
set -euo pipefail

action=$1
dir=$2
cd "$dir"

case "$action" in
deploy)
  var=$3
  image=$4
  test -f .env || { echo "MISSING $dir/.env — create it before the first deploy"; exit 1; }
  docker network inspect talentflow >/dev/null 2>&1 || docker network create talentflow
  if [ -f release.env ]; then cp release.env release.env.prev; fi
  echo "$var=$image" > release.env
  docker compose --env-file release.env pull
  docker compose --env-file release.env up -d --remove-orphans
  docker logout "${image%%/*}" >/dev/null 2>&1 || true
  docker image prune -f
  ;;
health)
  url=$3
  tries=$4
  for _ in $(seq 1 "$tries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "health check OK — $(cat release.env)"
      exit 0
    fi
    sleep 5
  done
  echo "health check FAILED after $((tries * 5))s"
  docker compose --env-file release.env logs --tail=100
  if [ -f release.env.prev ]; then
    echo "rolling back to: $(cat release.env.prev)"
    cp release.env.prev release.env
    docker compose --env-file release.env up -d --remove-orphans
  else
    echo "no previous release to roll back to"
  fi
  exit 1
  ;;
*)
  echo "unknown action: $action"; exit 2
  ;;
esac
