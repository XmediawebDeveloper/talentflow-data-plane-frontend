#!/usr/bin/env python3
"""
Remove the records the Tier-3 suite created and has finished with.

Every Tier-3 run writes real rows into the QA tenant — roles, teams, and the
audit entries they produce. Measured over one afternoon: job descriptions went
from 114 to 235, audit rows from 606 to 1,383. Left alone that breaks the suite
twice over. Pages get slower, and the tests that assert on an empty list — "the
Internal Resume Database explains an empty database" — start describing a
database that is no longer empty.

Two rules keep this safe:

  * Only records whose name starts with the marker the seed helpers write.
    Nothing without `E2E T3 ` in front of it is even considered.
  * Only records old enough that no run in flight could still be using them.

── Why age is measured against the data, not the clock ──────────────────────
The backend stores timestamps with no timezone offset, in local time:

    created_at: 2026-08-05T16:37:26.372864     (IST)
    UTC at that moment:  2026-08-05T11:07

Comparing those to a UTC cutoff — the obvious thing, and the first thing tried —
makes every record look five and a half hours into the future, so nothing is
ever old enough and the sweep silently removes nothing. Comparing them to a
local cutoff would be just as wrong on a runner in another timezone.

So the cutoff is derived from the newest matching record instead. Whatever clock
the server is writing, every row is written on the same one, and "six hours older
than the newest" means the same thing in all of them.

Usage:  qa-tenant-cleanup.py --api http://127.0.0.1:8200 --token <jwt> [--hours 6]
        --dry-run  reports what it would remove and removes nothing
"""
import argparse
import datetime
import json
import sys
import urllib.error
import urllib.request

# resource path -> the field its display name lives in
RESOURCES = [("jd", ("title",)), ("teams", ("name",))]
MARKER = "E2E T3 "


def request(api, token, method, path):
    req = urllib.request.Request(
        f"{api}/api/v1{path}", method=method, headers={"Authorization": f"Bearer {token}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            if method != "GET" or res.status == 204:
                return res.status, None
            return res.status, json.load(res)
    except urllib.error.HTTPError as err:
        return err.code, None
    except Exception as err:  # network, timeout, malformed JSON
        print(f"  ! {method} {path}: {err}", file=sys.stderr)
        return 0, None


def parse_when(value):
    try:
        return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def collect(api, token, resource, name_fields):
    """Every record carrying the marker, with a usable timestamp."""
    found, page = [], 1
    while page <= 50:
        status, body = request(api, token, "GET", f"/{resource}?page={page}&page_size=100")
        if status != 200 or body is None:
            break
        items = body if isinstance(body, list) else (body.get("items") or [])
        for item in items:
            name = next((str(item[f]) for f in name_fields if item.get(f)), "")
            if not name.startswith(MARKER):
                continue
            when = parse_when(item.get("created_at"))
            if when and item.get("id"):
                found.append((when, item["id"], name))
        pages = 1 if isinstance(body, list) else int(body.get("total_pages") or 1)
        if page >= pages:
            break
        page += 1
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--token", required=True)
    ap.add_argument("--hours", type=float, default=6.0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    total_removed = 0
    for resource, name_fields in RESOURCES:
        records = collect(args.api, args.token, resource, name_fields)
        if not records:
            print(f"  {resource}: nothing this suite created")
            continue

        newest = max(when for when, _, _ in records)
        cutoff = newest - datetime.timedelta(hours=args.hours)
        stale = [(w, i, n) for w, i, n in records if w < cutoff]

        print(
            f"  {resource}: {len(records)} seeded, {len(stale)} older than "
            f"{args.hours:g}h before the newest ({newest.isoformat(timespec='seconds')})"
        )
        if args.dry_run:
            for _, _, name in stale[:5]:
                print(f"      would remove {name}")
            continue

        removed = 0
        for _, rid, _ in stale:
            status, _ = request(args.api, args.token, "DELETE", f"/{resource}/{rid}")
            if status in (200, 202, 204):
                removed += 1
        # A refusal is worth seeing rather than silently tolerating: it usually
        # means the record is referenced by something else, which is a fact about
        # the product, not about this script.
        if removed < len(stale):
            print(f"      {len(stale) - removed} could not be removed")
        total_removed += removed

    print(f"  removed {total_removed} record(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
