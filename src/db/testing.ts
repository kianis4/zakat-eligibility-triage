import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "./schema";
import type { TriageDatabase } from "./index";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/", import.meta.url));

type Journal = { entries: { tag: string }[] };

export type TestDatabase = {
  db: TriageDatabase;
  close: () => Promise<void>;
};

/**
 * Boots an in-process Postgres with pgvector and applies the migrations that ship.
 *
 * The suite runs the real schema, the real enum, the real vector column and the real
 * distance operator, with no service container and no network. The alternative, a mocked
 * repository, would let a query that Postgres rejects pass the suite, and the queries this
 * repository most needs pinned down are the ones with SQL in them (ADR-0005).
 *
 * Migration SQL is read from `drizzle/` in journal order rather than reapplied from the
 * schema definition, so a migration that is wrong fails the tests instead of hiding behind
 * a second source of truth.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = await PGlite.create({ extensions: { vector } });
  const journal = JSON.parse(
    await readFile(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  ) as Journal;

  for (const entry of journal.entries) {
    const sql = await readFile(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");

    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim().length > 0) {
        await client.exec(statement);
      }
    }
  }

  return {
    db: drizzle(client, { schema }),
    close: () => client.close(),
  };
}
