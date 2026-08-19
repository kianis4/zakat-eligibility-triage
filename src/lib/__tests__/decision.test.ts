import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { campaigns, decisions, triageRuns } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/testing";
import {
  campaignRow,
  ESCALATED,
  FIXTURE_CAMPAIGN,
  mappingSupporting,
  NOT_ESCALATED,
  triageRunRow,
} from "../../testing/triage-fixtures";
import {
  agreementWith,
  decisionHistory,
  publishedOutcome,
  recordDecision,
  supportedCategories,
} from "../decision";

const supportedFile = {
  escalation: NOT_ESCALATED,
  mapping: mappingSupporting(["al-gharimin"]),
};

const refusedFile = {
  escalation: ESCALATED,
  mapping: mappingSupporting(["al-gharimin"]),
};

const emptyFile = {
  escalation: NOT_ESCALATED,
  mapping: mappingSupporting([]),
};

describe("whether the reviewer went the way the agent file pointed", () => {
  it("counts escalating a file that refused as agreement", () => {
    expect(agreementWith(refusedFile, "escalate")).toMatchObject({
      agreed: true,
      overrode: false,
    });
  });

  it("counts escalating a file that did not refuse as a departure", () => {
    expect(agreementWith(supportedFile, "escalate")).toMatchObject({
      agreed: false,
      overrode: false,
    });
  });

  it("counts approving a file that did not refuse as agreement", () => {
    expect(agreementWith(supportedFile, "approve")).toMatchObject({
      agreed: true,
      overrode: false,
    });
  });

  it("counts approving a file that refused as a departure", () => {
    expect(agreementWith(refusedFile, "approve")).toMatchObject({
      agreed: false,
      overrode: false,
    });
  });

  it("treats requesting information like approving, against the refusal axis", () => {
    expect(agreementWith(supportedFile, "request_info").agreed).toBe(true);
    expect(agreementWith(refusedFile, "request_info").agreed).toBe(false);
  });

  it("labels an approval of a file supporting no category as an override", () => {
    const agreement = agreementWith(emptyFile, "approve");

    expect(supportedCategories(emptyFile.mapping)).toEqual([]);
    expect(agreement.overrode).toBe(true);
    expect(agreement.summary).toBe("Human overrode agent file");
  });

  it("does not call requesting information on an empty file an override", () => {
    expect(agreementWith(emptyFile, "request_info").overrode).toBe(false);
  });

  it("says which way it went in words a reader can use", () => {
    expect(agreementWith(supportedFile, "approve").summary).toBe("Agreed with the agent file");
    expect(agreementWith(refusedFile, "approve").summary).toBe("Departed from the agent file");
  });
});

describe("recording a decision", () => {
  let database: TestDatabase;

  const other = { ...FIXTURE_CAMPAIGN, id: "cmp_fixture_0002" };

  const decision = {
    campaignId: FIXTURE_CAMPAIGN.id,
    triageRunId: "run_fixture_0001",
    action: "approve" as const,
    reviewer: "Amina Suleiman",
    note: "The debt is currently due and the beneficiary is named, so this is decidable.",
  };

  beforeEach(async () => {
    database = await createTestDatabase();
    await database.db.insert(campaigns).values([campaignRow(), campaignRow(other)]);
    await database.db.insert(triageRuns).values(triageRunRow());
    await database.db
      .insert(triageRuns)
      .values(triageRunRow({ id: "run_fixture_0002", campaignId: other.id }));
  });

  afterEach(async () => {
    await database.close();
  });

  it("stores the decision and returns it", async () => {
    const recorded = await recordDecision(decision, database.db);

    expect(recorded.action).toBe("approve");
    expect(recorded.reviewer).toBe("Amina Suleiman");
    expect(recorded.decidedAt).toBeInstanceOf(Date);
    expect(await database.db.select().from(decisions)).toHaveLength(1);
  });

  it("becomes the campaign's published outcome", async () => {
    expect(await publishedOutcome(FIXTURE_CAMPAIGN.id, database.db)).toBeNull();

    await recordDecision(decision, database.db);

    expect((await publishedOutcome(FIXTURE_CAMPAIGN.id, database.db))?.action).toBe("approve");
  });

  it("tells a reviewer which field they left blank", async () => {
    await expect(recordDecision({ ...decision, reviewer: "  " }, database.db)).rejects.toThrow(
      /anonymous decision/,
    );
    await expect(recordDecision({ ...decision, note: "" }, database.db)).rejects.toThrow(
      /without reasoning/,
    );
    expect(await database.db.select().from(decisions)).toHaveLength(0);
  });

  it("refuses a decision filed against another campaign's file", async () => {
    await expect(
      recordDecision({ ...decision, triageRunId: "run_fixture_0002" }, database.db),
    ).rejects.toThrow(/belongs to campaign cmp_fixture_0002/);
  });

  it("refuses a decision against a file that was never written", async () => {
    await expect(
      recordDecision({ ...decision, triageRunId: "run_never_ran" }, database.db),
    ).rejects.toThrow(/no triage run run_never_ran/);
  });

  it("keeps every decision and lets the latest one stand", async () => {
    await recordDecision({ ...decision, action: "request_info" }, database.db);
    await recordDecision({ ...decision, action: "approve", reviewer: "Bilal Ahmed" }, database.db);

    const history = await decisionHistory(FIXTURE_CAMPAIGN.id, database.db);

    expect(history.map((entry) => entry.action)).toEqual(["request_info", "approve"]);
    expect((await publishedOutcome(FIXTURE_CAMPAIGN.id, database.db))?.reviewer).toBe(
      "Bilal Ahmed",
    );
  });
});
