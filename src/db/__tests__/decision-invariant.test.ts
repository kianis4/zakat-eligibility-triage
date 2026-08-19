import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, pgTable, text } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { publishedOutcome } from "../../lib/decision";
import {
  RECIPIENT_CATEGORY_IDS,
  type RecipientCategory,
} from "../../lib/categories";
import {
  campaignRow,
  FIXTURE_CAMPAIGN,
  mappingSupporting,
  triageRunRow,
} from "../../testing/triage-fixtures";
import * as schema from "../schema";
import { DECISION_ACTIONS, campaigns, decisions, triageRuns } from "../schema";
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
 * The one column outside `decisions` that may carry the word, and why.
 *
 * `precedents.category_outcomes` records how a campaign someone else already adjudicated
 * came out. It is a human's finished decision, imported as reference data and shown to a
 * reviewer under ADR-0004; nothing in the pipeline writes it and no campaign in the system
 * is published from it. Every other match is a shortcut, so the exemption is one pair rather
 * than a whole table.
 */
const PERMITTED_OUTCOME_COLUMNS = new Set(["precedents.category_outcomes"]);

/**
 * The reason the database gave, all the way down.
 *
 * Drizzle's own message is the SQL it tried to run, which contains every column name in the
 * insert and would match an assertion about a constraint without the database having
 * enforced anything. The constraint name is on the cause underneath, so the whole chain is
 * flattened and the assertion is made against that. An insert that succeeds fails loudly
 * here rather than returning a string nothing matches.
 */
async function refusalFrom(work: Promise<unknown>): Promise<string> {
  const thrown = await work.then(
    () => null,
    (error: unknown) => error,
  );

  if (thrown === null) {
    throw new Error("The database accepted a row the test expected it to refuse.");
  }

  const reasons: string[] = [];

  for (let error: unknown = thrown; error instanceof Error; error = error.cause) {
    reasons.push(error.message);
  }

  return reasons.join("\n");
}

function outcomeColumnsOutsideDecisions(tables: readonly PgTable[]): string[] {
  return tables.flatMap((table) => {
    const name = getTableName(table);

    if (name === "decisions") {
      return [];
    }

    return Object.entries(getTableColumns(table))
      .filter(
        ([property, column]) =>
          (OUTCOME_WORDS.test(property) || OUTCOME_WORDS.test(column.name)) &&
          !PERMITTED_OUTCOME_COLUMNS.has(`${name}.${column.name}`),
      )
      .map(([, column]) => `${name}.${column.name}`);
  });
}

describe("no table but decisions carries an outcome", () => {
  const exported: unknown[] = Object.values(schema);
  const tables = exported.filter((value): value is PgTable => is(value, PgTable));

  it("walks every table the schema exports", () => {
    expect(tables.map(getTableName).sort()).toEqual([
      "campaigns",
      "decisions",
      "precedents",
      "triage_runs",
    ]);
  });

  it("finds no outcome-shaped column anywhere else in the schema", () => {
    expect(outcomeColumnsOutsideDecisions(tables)).toEqual([]);
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

    expect(outcomeColumnsOutsideDecisions([shortcut])).toEqual(["campaigns.eligibility_status"]);
  });

  it("catches it under the other names it would be given", () => {
    for (const column of ["outcome", "verdict", "is_eligible", "approved_at", "review_status"]) {
      const shortcut = pgTable("triage_runs", { [column]: text(column) });

      expect(outcomeColumnsOutsideDecisions([shortcut])).toHaveLength(1);
    }
  });
});

describe("what the decisions table refuses to store", () => {
  let database: TestDatabase;

  const decision = {
    id: "dec_0001",
    campaignId: FIXTURE_CAMPAIGN.id,
    triageRunId: "run_fixture_0001",
    action: "approve" as const,
    reviewer: "Amina Suleiman",
    note: "The debt is currently due and the beneficiary is named, so this is decidable.",
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.db.insert(campaigns).values(campaignRow());
    await database.db.insert(triageRuns).values(triageRunRow());
  });

  afterAll(async () => {
    await database.close();
  });

  it("stores a decision that names a reviewer and carries their reasoning", async () => {
    await database.db.insert(decisions).values(decision);

    const [stored] = await database.db.select().from(decisions);

    expect(stored?.action).toBe("approve");
    expect(stored?.reviewer).toBe("Amina Suleiman");
    expect(stored?.triageRunId).toBe("run_fixture_0001");
  });

  it("refuses an anonymous decision", async () => {
    const refusal = await refusalFrom(
      database.db.insert(decisions).values({ ...decision, id: "dec_0002", reviewer: "" }),
    );

    expect(refusal).toContain("decisions_reviewer_is_named");
  });

  it("refuses a reviewer who is only whitespace", async () => {
    const refusal = await refusalFrom(
      database.db.insert(decisions).values({ ...decision, id: "dec_0003", reviewer: "   \t\n " }),
    );

    expect(refusal).toContain("decisions_reviewer_is_named");
  });

  it("refuses a decision with no reasoning behind it", async () => {
    const refusal = await refusalFrom(
      database.db.insert(decisions).values({ ...decision, id: "dec_0004", note: "" }),
    );

    expect(refusal).toContain("decisions_note_carries_reasoning");
  });

  it("refuses a note that is only whitespace", async () => {
    const refusal = await refusalFrom(
      database.db.insert(decisions).values({ ...decision, id: "dec_0005", note: "  \n  " }),
    );

    expect(refusal).toContain("decisions_note_carries_reasoning");
  });

  it("refuses an action outside the three a reviewer may take", async () => {
    const refusal = await refusalFrom(
      database.db.insert(decisions).values({
        ...decision,
        id: "dec_0006",
        action: "eligible" as unknown as (typeof DECISION_ACTIONS)[number],
      }),
    );

    expect(refusal).toContain("decisions_action_is_recorded");
  });

  it("accepts every action the code offers, so the constraint cannot drift from it", async () => {
    for (const [index, action] of DECISION_ACTIONS.entries()) {
      await database.db
        .insert(decisions)
        .values({ ...decision, id: `dec_action_${index}`, action });
    }

    const stored = await database.db.select().from(decisions);

    expect(new Set(stored.map((row) => row.action))).toEqual(new Set(DECISION_ACTIONS));
  });

  it("refuses a decision that names no agent file", async () => {
    const refusal = await refusalFrom(
      database.db.insert(decisions).values({
        ...decision,
        id: "dec_0007",
        triageRunId: null as unknown as string,
      }),
    );

    expect(refusal).toContain("null value in column");
  });

  it("refuses a decision against an agent file that does not exist", async () => {
    const refusal = await refusalFrom(
      database.db
        .insert(decisions)
        .values({ ...decision, id: "dec_0008", triageRunId: "run_never_ran" }),
    );

    expect(refusal).toContain("decisions_triage_run_id_triage_runs_id_fk");
  });
});

describe("what the triage_runs table refuses to store", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.db.insert(campaigns).values(campaignRow());
  });

  afterAll(async () => {
    await database.close();
  });

  it("refuses a refusal that records nothing about reaching a reviewer", async () => {
    const refusal = await refusalFrom(
      database.db.insert(triageRuns).values(
        triageRunRow({
          id: "run_silent",
          escalation: {
            escalate: true,
            reasons: [{ kind: "mixed_use", question: "Which portion is which?", citations: [] }],
          },
          slackDelivery: null,
        }),
      ),
    );

    expect(refusal).toContain("triage_runs_escalation_has_a_delivery_state");
  });

  it("refuses a delivery state on a run that never refused", async () => {
    const refusal = await refusalFrom(
      database.db
        .insert(triageRuns)
        .values(triageRunRow({ id: "run_undelivered", slackDelivery: "delivered" })),
    );

    expect(refusal).toContain("triage_runs_escalation_has_a_delivery_state");
  });

  it("refuses a delivery state outside the recorded vocabulary", async () => {
    const refusal = await refusalFrom(
      database.db.insert(triageRuns).values(
        triageRunRow({
          id: "run_odd",
          escalation: {
            escalate: true,
            reasons: [{ kind: "mixed_use", question: "Which portion is which?", citations: [] }],
          },
          slackDelivery: "probably fine" as never,
        }),
      ),
    );

    expect(refusal).toContain("triage_runs_slack_delivery_recorded");
  });
});

describe("publishedOutcome", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await database.db.insert(campaigns).values(campaignRow());
  });

  afterAll(async () => {
    await database.close();
  });

  it("is undecided for a campaign the pipeline has never read", async () => {
    expect(await publishedOutcome(FIXTURE_CAMPAIGN.id, database.db)).toBeNull();
  });

  it("stays undecided when the agent supported all eight categories", async () => {
    await database.db.insert(triageRuns).values(
      triageRunRow({
        id: "run_all_supported",
        mapping: mappingSupporting(RECIPIENT_CATEGORY_IDS as readonly RecipientCategory[]),
      }),
    );

    const [stored] = await database.db.select().from(triageRuns);
    const supported = RECIPIENT_CATEGORY_IDS.filter(
      (id) => stored?.mapping.categories[id]?.status === "supported",
    );

    expect(supported).toHaveLength(8);
    expect(await publishedOutcome(FIXTURE_CAMPAIGN.id, database.db)).toBeNull();
  });

  it("becomes the reviewer's decision once one is recorded, and not before", async () => {
    await database.db.insert(decisions).values({
      id: "dec_published",
      campaignId: FIXTURE_CAMPAIGN.id,
      triageRunId: "run_all_supported",
      action: "request_info",
      reviewer: "Amina Suleiman",
      note: "The story never says who receives the money, so this cannot be settled yet.",
    });

    const outcome = await publishedOutcome(FIXTURE_CAMPAIGN.id, database.db);

    expect(outcome?.action).toBe("request_info");
    expect(outcome?.reviewer).toBe("Amina Suleiman");
    expect(outcome?.triageRunId).toBe("run_all_supported");
  });
});
