import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { campaigns, triageRuns } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/testing";
import { RECIPIENT_CATEGORY_IDS } from "../categories";
import { runCheck } from "../check";

const story = "My sister was hospitalised last winter. The family borrowed to cover it and cannot repay it.";

const facts = {
  beneficiary: { kind: "family_member", description: "The organizer's sister." },
  statedPurposes: [{ purpose: "Repay what the family borrowed", quote: "cannot repay it" }],
  amountsMentioned: [],
  organizerRoleClaim: null,
  hardshipClaims: [{ claim: "A debt the family cannot repay", quote: "cannot repay it" }],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "unstated", quote: null },
};

const mapping = {
  findings: RECIPIENT_CATEGORY_IDS.map((id) =>
    id === "al-gharimin"
      ? {
          category: id,
          status: "supported",
          quotes: ["cannot repay it"],
          rationale: "The story states a debt the family says it cannot repay.",
          scholarlyDifference: null,
        }
      : {
          category: id,
          status: "not_supported",
          quotes: [],
          rationale: "The story says nothing that bears on this category.",
          scholarlyDifference: null,
        },
  ),
  mixedUseSignals: [],
};

function modelAnswering(payloads: unknown[]): MockLanguageModelV3 {
  const queue = [...payloads];

  return new MockLanguageModelV3({
    doGenerate: async () => {
      const payload = queue.shift();

      if (payload === undefined) {
        throw new Error("The check made more model calls than the fake had answers for.");
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

describe("checking a pasted campaign in one step", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("stores the campaign and its agent file, and names the campaign to send the donor to", async () => {
    const result = await runCheck(
      { title: "Help the Haddad family", story },
      { db: database.db, model: modelAnswering([facts, mapping]) },
    );

    const stored = await database.db.select().from(campaigns);
    const runs = await database.db.select().from(triageRuns);

    expect(result).toEqual({ ok: true, campaignId: stored[0]?.id });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.story).toBe(story);
    expect(runs.map((run) => run.campaignId)).toEqual([stored[0]?.id]);
  });

  it("refuses an invalid submission with the reason, before storing or calling anything", async () => {
    const model = modelAnswering([facts, mapping]);

    const result = await runCheck({ title: "", story }, { db: database.db, model });

    expect(result).toEqual({ ok: false, reason: "A campaign needs a title." });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await database.db.select().from(campaigns)).toHaveLength(0);
  });

  it("leaves nothing behind when the agent could not read the campaign", async () => {
    const failing = modelAnswering([{ beneficiary: { kind: "invented" } }]);

    const result = await runCheck({ title: "Help the Haddad family", story }, { db: database.db, model: failing });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/could not be checked/);
    expect(await database.db.select().from(campaigns)).toHaveLength(0);
    expect(await database.db.select().from(triageRuns)).toHaveLength(0);
  });
});

describe("checking with no database configured", () => {
  it("still reports what is wrong with the submission first", async () => {
    expect(await runCheck({ title: "Help", story: "" }, { db: null })).toEqual({
      ok: false,
      reason: "There is nothing to check without the story.",
    });
  });

  it("refuses a valid submission with the reason, rather than throwing", async () => {
    const result = await runCheck({ title: "Help", story }, { db: null });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/no database configured/);
  });
});
