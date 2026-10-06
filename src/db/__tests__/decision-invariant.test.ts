import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable, pgTable, text } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { campaignRow, ESCALATED, triageRunRow } from "../../testing/triage-fixtures";
import * as schema from "../schema";
import { campaigns, triageRuns } from "../schema";
import { createTestDatabase, type TestDatabase } from "../testing";

/**
 * The words a shortcut would be spelled with.
 *
 * A future contributor under deadline does not add a column called `human_decision_bypass`.
 * They add `campaigns.status`, or `triage_runs.outcome`, or `eligibility_verdict`, populate
 * it from the pipeline, and read it in a template, and the trust boundary is gone without a
 * single line of it looking wrong in review. This is the vocabulary that catches that.
 */
const OUTCOME_WORDS = /status|outcome|verdict|eligib|approved/i;

/**
 * The one column that may carry the word, and why.
 *
 * `precedents.category_outcomes` records how a campaign someone else already adjudicated
 * came out. It is a human's finished decision, imported as reference data; nothing in the
 * pipeline writes it and no campaign in the system is published from it. Every other match
 * is a shortcut, so the exemption is one pair rather than a whole table.
 */
const PERMITTED_OUTCOME_COLUMNS = new Set(["precedents.category_outcomes"]);

function outcomeColumns(tables: readonly PgTable[]): string[] {
  return tables.flatMap((table) => {
    const name = getTableName(table);

    return Object.entries(getTableColumns(table))
      .filter(
        ([property, column]) =>
          (OUTCOME_WORDS.test(property) || OUTCOME_WORDS.test(column.name)) &&
          !PERMITTED_OUTCOME_COLUMNS.has(`${name}.${column.name}`),
      )
      .map(([, column]) => `${name}.${column.name}`);
  });
}

/**
 * The system records no outcome at all: the donor reading the file is the one who decides,
 * and decides off the page. So no table may carry an outcome, which is a stricter guard than
 * the one that permitted a reviewer's decisions table and nothing else.
 */
describe("no table carries an outcome", () => {
  const exported: unknown[] = Object.values(schema);
  const tables = exported.filter((value): value is PgTable => is(value, PgTable));

  it("walks every table the schema exports", () => {
    expect(tables.map(getTableName).sort()).toEqual([
      "analysis_quota",
      "campaigns",
      "precedents",
      "triage_runs",
    ]);
  });

  it("finds no outcome-shaped column anywhere in the schema", () => {
    expect(outcomeColumns(tables)).toEqual([]);
  });

  /**
   * The guard is worth nothing if it passes on a schema that has the shortcut in it, so it is
   * run against one. The table below is the change a future contributor makes under deadline:
   * a campaign carrying its own status, written by the pipeline, read by a template.
   */
  it("catches the shortcut column when a table gains one", () => {
    const shortcut = pgTable("campaigns", {
      id: text("id").primaryKey(),
      eligibilityStatus: text("eligibility_status"),
    });

    expect(outcomeColumns([shortcut])).toEqual(["campaigns.eligibility_status"]);
  });

  it("catches it under the other names it would be given", () => {
    for (const column of ["outcome", "verdict", "is_eligible", "approved_at", "review_status"]) {
      const shortcut = pgTable("triage_runs", { [column]: text(column) });

      expect(outcomeColumns([shortcut])).toHaveLength(1);
    }
  });
});

/**
 * The shipped migrations, applied in order, leave no reviewer workflow behind them.
 *
 * The schema file can say anything; this is what a database built from `drizzle/` holds.
 */
describe("the database the shipped migrations build", () => {
  let database: TestDatabase;

  /** The driver-neutral handle types `execute` as unknown; PGlite returns `{ rows }`. */
  async function namesFrom(query: ReturnType<typeof sql>): Promise<string[]> {
    const result = (await database.db.execute(query)) as unknown as { rows: { name: string }[] };

    return result.rows.map((row) => row.name);
  }

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.db.insert(campaigns).values(campaignRow());
  });

  afterAll(async () => {
    await database.close();
  });

  it("has no table for a reviewer's decisions", async () => {
    const names = await namesFrom(
      sql`select table_name as name from information_schema.tables where table_schema = 'public'`,
    );

    expect(names.sort()).toEqual(["analysis_quota", "campaigns", "precedents", "triage_runs"]);
  });

  it("keeps no delivery state on a triage run", async () => {
    const columns = await namesFrom(
      sql`select column_name as name from information_schema.columns where table_name = 'triage_runs'`,
    );

    expect(columns).not.toContain("slack_delivery");
  });

  it("stores a run that refused without asking where the refusal was sent", async () => {
    await database.db
      .insert(triageRuns)
      .values(triageRunRow({ id: "run_refused", escalation: ESCALATED }));

    const stored = await database.db.select().from(triageRuns);

    expect(stored.map((row) => row.escalation.escalate)).toEqual([true]);
  });
});
