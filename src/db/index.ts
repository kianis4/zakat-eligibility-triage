import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * A handle on the triage schema, whichever driver is underneath.
 *
 * Retrieval takes this type rather than a concrete driver so the same query runs against
 * Postgres in production and against PGlite in the suite. The tests therefore exercise
 * the query that ships, not a stand-in for it (ADR-0005).
 */
export type TriageDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export function isDatabaseConfigured(): boolean {
  return (process.env.DATABASE_URL ?? "").length > 0;
}

let cached: TriageDatabase | null = null;

/**
 * Connects on first use, not at import.
 *
 * A module-level connection would make `DATABASE_URL` a build-time requirement: the page
 * that reads a campaign imports this file, `next build` imports the page, and a missing
 * variable would fail the build rather than one request. Callers that can render without
 * a database ask `isDatabaseConfigured` first.
 */
export function getDatabase(): TriageDatabase {
  if (cached !== null) {
    return cached;
  }

  const url = process.env.DATABASE_URL;

  if (url === undefined || url.length === 0) {
    throw new Error("DATABASE_URL is not set, so there is no database to connect to.");
  }

  cached = drizzle(postgres(url), { schema });

  return cached;
}
