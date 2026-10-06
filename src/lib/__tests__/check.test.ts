import { MockLanguageModelV3 } from "ai/test";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analysisQuota, campaigns, triageRuns } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/testing";
import { RECIPIENT_CATEGORY_IDS } from "../categories";
import { runCheck, type CheckOptions } from "../check";

const visitor: CheckOptions["quota"] = {
  secret: "test-secret",
  ip: async () => "203.0.113.7",
  limits: { perIp: 2, perDay: 100, retentionDays: 30 },
};

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
      { db: database.db, model: modelAnswering([facts, mapping]), quota: visitor },
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

    const result = await runCheck({ title: "", story }, { db: database.db, model, quota: visitor });

    expect(result).toEqual({ ok: false, code: "title-missing", reason: "A campaign needs a title." });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await database.db.select().from(campaigns)).toHaveLength(0);
  });

  it("refuses a goal larger than the stored amount can hold, before charging anything", async () => {
    const model = modelAnswering([facts, mapping]);

    const result = await runCheck(
      { title: "Help the Haddad family", story, goalAmount: "1e15" },
      { db: database.db, model, quota: visitor },
    );

    expect(result).toMatchObject({ ok: false, code: "goal-invalid" });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await database.db.select().from(analysisQuota)).toHaveLength(0);
  });

  it("says so, rather than throwing, when the campaign cannot be stored", async () => {
    await database.db.execute(sql`
      create function refuse_campaign() returns trigger language plpgsql as $$
      begin raise exception 'campaigns refused by the test'; end $$
    `);
    await database.db.execute(sql`
      create trigger refuse_campaign before insert on campaigns
      for each row execute function refuse_campaign()
    `);
    const model = modelAnswering([facts, mapping]);

    const result = await runCheck(
      { title: "Help the Haddad family", story },
      { db: database.db, model, quota: visitor },
    );

    expect(result).toMatchObject({ ok: false, code: "not-stored" });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await database.db.select().from(campaigns)).toHaveLength(0);
  });

  it("leaves nothing behind when the agent could not read the campaign", async () => {
    const failing = modelAnswering([{ beneficiary: { kind: "invented" } }]);

    const result = await runCheck({ title: "Help the Haddad family", story }, { db: database.db, model: failing, quota: visitor });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, code: "unreadable" });
    expect(result.ok ? "" : result.reason).toMatch(/could not be checked/);
    expect(await database.db.select().from(campaigns)).toHaveLength(0);
    expect(await database.db.select().from(triageRuns)).toHaveLength(0);
  });

  it("still answers the donor when the database goes away mid-check", async () => {
    const lost = await createTestDatabase();
    const dropsTheDatabase = new MockLanguageModelV3({
      doGenerate: async () => {
        await lost.close();
        throw new Error("provider down");
      },
    });

    const result = await runCheck({ title: "Help the Haddad family", story }, { db: lost.db, model: dropsTheDatabase, quota: visitor });

    expect(result).toMatchObject({ ok: false, code: "unreadable" });
  });
});

/**
 * The hosted demo spends the owner's model credit, so every analysis is charged against a
 * per-visitor and a global daily cap before any model is called.
 */
describe("the limits on a hosted check", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("calls no model once the visitor has used their analyses for the day", async () => {
    for (let index = 0; index < 2; index += 1) {
      const result = await runCheck(
        { title: "Help the Haddad family", story },
        { db: database.db, model: modelAnswering([facts, mapping]), quota: visitor },
      );

      expect(result.ok).toBe(true);
    }

    const model = modelAnswering([facts, mapping]);
    const refused = await runCheck({ title: "Help the Haddad family", story }, { db: database.db, model, quota: visitor });

    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.reason).toMatch(/limit/);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await database.db.select().from(campaigns)).toHaveLength(2);
  });

  it("refuses every analysis when no IP hashing secret is configured", async () => {
    const model = modelAnswering([facts, mapping]);

    const refused = await runCheck(
      { title: "Help the Haddad family", story },
      { db: database.db, model, quota: { ...visitor, secret: undefined } },
    );

    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.reason).toMatch(/IP_HASH_SECRET/);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await database.db.select().from(campaigns)).toHaveLength(0);
  });

  it("refuses an analysis it cannot attribute to a visitor", async () => {
    const model = modelAnswering([facts, mapping]);

    const refused = await runCheck(
      { title: "Help the Haddad family", story },
      { db: database.db, model, quota: { ...visitor, ip: async () => null } },
    );

    expect(refused.ok).toBe(false);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("stores the visitor's address only as a hash", async () => {
    await runCheck(
      { title: "Help the Haddad family", story },
      { db: database.db, model: modelAnswering([facts, mapping]), quota: visitor },
    );

    const everything = JSON.stringify([
      await database.db.select().from(campaigns),
      await database.db.select().from(triageRuns),
      await database.db.select().from(analysisQuota),
    ]);

    expect(everything).not.toContain("203.0.113.7");
  });
});

describe("checking with no database configured", () => {
  it("still reports what is wrong with the submission first", async () => {
    expect(await runCheck({ title: "Help", story: "" }, { db: null, quota: visitor })).toEqual({
      ok: false,
      code: "story-missing",
      reason: "There is nothing to check without the story.",
    });
  });

  it("refuses a valid submission with the reason, rather than throwing", async () => {
    const result = await runCheck({ title: "Help", story }, { db: null, quota: visitor });

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/no database configured/);
  });
});
