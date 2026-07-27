'use client';

/**
 * Browser-exposed environment name.
 *
 * The server-only `ENVIRONMENT` var is NOT readable in the browser, so the
 * frontend mirrors it via `NEXT_PUBLIC_ENVIRONMENT`. NOTE: NEXT_PUBLIC_* values
 * are inlined at BUILD time — you must rebuild the frontend after changing it
 * (a plain restart keeps the previously-baked value).
 */
export const ENVIRONMENT_NAME = (process.env.NEXT_PUBLIC_ENVIRONMENT || '').toLowerCase();

/** True only on the production build. */
export const IS_PRODUCTION_ENV = ENVIRONMENT_NAME === 'production';

/**
 * Testing-only conveniences (e.g. the recruiter toggle that lets copy-paste be
 * ENABLED for a test run) are offered only OUTSIDE production, so staging stays
 * flexible while production stays locked down.
 */
export const ALLOW_TESTING_ONLY_SETTINGS = !IS_PRODUCTION_ENV;
