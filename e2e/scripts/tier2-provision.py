#!/usr/bin/env python3
"""
Provision a throwaway tenant for the Tier-2 suite.

Why this exists instead of the suite registering itself over HTTP:
`POST /api/v1/tenants/register` is broken on the backend. Measured against a
throwaway backend on 2026-08-04:

    File "/app/app/routers/tenants.py", line 33, in register_tenant
        return await tenant_service.create_tenant(request)
    TypeError: TenantService.create_tenant() missing 1 required positional
               argument: 'password'

The router passes one argument; the service wants two, and it then reads
`data.company_name` / `data.domain`, neither of which exists on `TenantCreate`.
So the endpoint returns 500 for every well-formed body. That is a product bug,
not a test-harness bug — but it means the suite cannot bootstrap over the API.

This script drives `ProvisioningService.provision_tenant` directly, which is the
same code path the control plane uses. It lives in the *frontend* repo on
purpose: the backend is production source and stays untouched. The CI job mounts
this file into a throwaway backend container and runs it there, where the
backend's dependencies and settings already exist.

Isolation is DATABASE. SCHEMA would have been tidier — one shared database to
drop instead of one per tenant — but it does not work in this build:
`create_tenant_record` sets `database_name` to the generated per-tenant name
even under SCHEMA isolation, so `provision_schema` then tries to connect to a
database that was never created and dies with

    [PROVISIONING] Error creating schema tenant_e2e… in tenant_e2e…:
    database "tenant_e2e…" does not exist

DATABASE isolation is also what the real signup flow uses, so the suite runs
against the provisioning path that actually ships. The cost is per-tenant
databases named `tenant_e2e<stamp>`; the CI job drops them by prefix on teardown.

Output: a single JSON object on stdout. Everything else goes to stderr so the
caller can pipe stdout straight into a file.

    docker run --rm --env-file tier2.env \
      -v .../tier2-provision.py:/app/tier2-provision.py:ro \
      talentflow-backend:<tag> python /app/tier2-provision.py > tenant.json
"""
import asyncio
import json
import os
import random
import string
import sys
import time


def _suffix() -> str:
    """Unique per run, so repeated runs never collide and a leaked row is
    traceable back to the run that made it."""
    stamp = int(time.time())
    noise = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
    return f"{stamp}{noise}"


def _tenant_dsn(database: str) -> str:
    from app.config import settings

    return (
        f"postgresql+asyncpg://{settings.DATABASE_USER}:{settings.DATABASE_PASSWORD}"
        f"@{settings.DATABASE_HOST}:{settings.DATABASE_PORT}/{database}"
    )


async def _tenant_is_usable(tenant, admin_email: str) -> bool:
    """True when the tenant database can actually serve the suite.

    Checked, not assumed: the tables the Tier-2 assertions read and write, plus
    the admin row the suite logs in as. `permissions` and `roles` matter because
    the 190 rbac_denied rows need a real role hierarchy, not an empty one.
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    required = ["users", "roles", "permissions", "company_settings", "job_descriptions"]
    engine = create_async_engine(_tenant_dsn(tenant.database_name))
    try:
        async with engine.connect() as conn:
            found = set(
                (
                    await conn.execute(
                        text(
                            "SELECT table_name FROM information_schema.tables "
                            "WHERE table_schema = 'public'"
                        )
                    )
                ).scalars()
            )
            missing = [t for t in required if t not in found]
            if missing:
                print(f"tenant database is missing tables: {missing}", file=sys.stderr)
                return False

            admins = (
                await conn.execute(
                    text("SELECT count(*) FROM users WHERE email = :e"),
                    {"e": admin_email},
                )
            ).scalar()
            if not admins:
                print("tenant database has no admin user", file=sys.stderr)
                return False

            print(f"tenant database checked: {len(found)} tables, admin present", file=sys.stderr)
            return True
    finally:
        await engine.dispose()


async def _mark_active(tenant_id) -> None:
    from sqlalchemy import text

    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE tenants SET status = 'ACTIVE', activated_at = now() WHERE id = :id"),
            {"id": tenant_id},
        )
        await db.commit()


async def main() -> int:
    # Refuse to run against anything that looks live. The guard is here as well
    # as in the TypeScript fixture because this script writes to the database
    # directly — by the time it runs, Playwright's guards have not been reached.
    db_name = os.environ.get("DATABASE_NAME", "")
    shared = os.environ.get("SHARED_DATABASE_NAME", "")
    forbidden = {
        "talentflow_landlord",
        "talentflow_shared",
        "talentflow_trail",
        "postgres",
        "machine",
    }
    if db_name in forbidden or shared in forbidden:
        print(
            f"refusing to provision: DATABASE_NAME={db_name!r} "
            f"SHARED_DATABASE_NAME={shared!r} names a live database",
            file=sys.stderr,
        )
        return 2
    if not db_name or not shared:
        print(
            "DATABASE_NAME and SHARED_DATABASE_NAME must both be set — there is "
            "no safe default",
            file=sys.stderr,
        )
        return 2

    from app.database import AsyncSessionLocal
    from app.models.tenant import IsolationType
    from app.schemas.tenant import TenantRegisterRequest
    from app.services.provisioning import ProvisioningService

    sfx = _suffix()
    # Subdomain must start with a letter and hold only [a-z0-9-] — the schema's
    # own validator, not a guess.
    subdomain = f"e2e{sfx}"
    admin_email = f"e2e-admin-{sfx}@example.com"
    admin_password = f"E2e!{sfx}Aa1"

    req = TenantRegisterRequest(
        company_name=f"E2E Tenant {sfx}",
        subdomain=subdomain,
        admin_email=admin_email,
        admin_name="E2E Admin",
        admin_password=admin_password,
        company_size="1-10",
    )

    async with AsyncSessionLocal() as db:
        svc = ProvisioningService(db)
        tenant, ok, message = await svc.provision_tenant(
            req, isolation_type=IsolationType.DATABASE
        )

    if tenant is None:
        print(f"provisioning failed before a tenant existed: {message}", file=sys.stderr)
        return 1

    # `provision_tenant` reports failure for a late cosmetic step as loudly as
    # for a missing database, and on this build it always fails one:
    #
    #   [PROVISIONING] Error fixing company_settings DEFAULT: cannot import name
    #   'TenantDatabaseManager' from 'app.database'
    #
    # Step 9 of 10 — the tenant database, its 96 tables, the RBAC seed and the
    # admin user are all already in place by then. Trusting `ok` would throw away
    # a perfectly good tenant over a DEFAULT clause.
    #
    # So don't trust the flag, measure the result: the tenant is usable if the
    # tables that every Tier-2 assertion touches exist and the admin can be found.
    # Anything less is a real failure and still exits non-zero.
    if not await _tenant_is_usable(tenant, admin_email):
        print(f"provisioning failed: {message}", file=sys.stderr)
        print(f"tenant left in status: {getattr(tenant, 'status', '?')}", file=sys.stderr)
        return 1

    if not ok:
        print(
            f"provision_tenant reported {message!r}, but the tenant database "
            f"checks out — continuing and marking it ACTIVE",
            file=sys.stderr,
        )

    # Login refuses a tenant that is not ACTIVE, and the failed step above left
    # it FAILED. Set it here rather than in the product code, which stays untouched.
    await _mark_active(tenant.id)

    print(f"provisioned {subdomain} ({message})", file=sys.stderr)
    json.dump(
        {
            "tenantId": str(tenant.id),
            "subdomain": subdomain,
            "adminEmail": admin_email,
            "adminPassword": admin_password,
            "schemaName": getattr(tenant, "schema_name", None),
            "databaseName": getattr(tenant, "database_name", None),
        },
        sys.stdout,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
