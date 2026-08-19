import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { campaigns, triageRuns } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/testing";
import { campaignRow, FIXTURE_CAMPAIGN } from "../../testing/triage-fixtures";
import { POLICY_VERSION, RECIPIENT_CATEGORY_IDS } from "../categories";
import {
  agreementWith,
  publishedOutcome,
  recordDecision,
  supportedCategories,
} from "../decision";
import { ExtractionError } from "../extraction";
import { MappingError } from "../mapping";
import * as triage from "../triage";
import { runTriage } from "../triage";

const SRC = fileURLToPath(new URL("../../", import.meta.url));

const webhookUrl = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX";

const question =
  "Could you tell us who receives the money once it is raised, and what it pays for first?";

function factsPayload(beneficiaryKind: "family_member" | "unclear") {
  return {
    beneficiary: { kind: beneficiaryKind, description: "The organizer's sister." },
    statedPurposes: [
      { purpose: "Repay what the family borrowed", quote: "cannot repay it" },
    ],
    amountsMentioned: [],
    organizerRoleClaim: null,
    hardshipClaims: [{ claim: "A debt the family cannot repay", quote: "cannot repay it" }],
    explicitZakatClaim: { present: false, quote: null },
    fundRecipient: { recipient: "unstated", quote: null },
  };
}

function mappingPayload(status: "supported" | "insufficient_evidence") {
  return {
    findings: RECIPIENT_CATEGORY_IDS.map((id) =>
      status === "supported" && id === "al-gharimin"
        ? {
            category: id,
            status: "supported",
            quotes: ["cannot repay it"],
            rationale: "The story states a debt the family says it cannot repay.",
            scholarlyDifference: null,
          }
        : status === "supported"
          ? {
              category: id,
              status: "not_supported",
              quotes: [],
              rationale: "The story says nothing that bears on this category.",
              scholarlyDifference: null,
            }
          : {
              category: id,
              status: "insufficient_evidence",
              quotes: [],
              rationale: "The story does not say enough about this category.",
              missingFact: "Whether the beneficiary falls under this category at all.",
              questionForOrganizer: question,
              scholarlyDifference: null,
            },
    ),
    mixedUseSignals: [],
  };
}

/**
 * A model that answers each call with the next payload it was given.
 *
 * The pipeline calls a model twice, for extraction and then for mapping, and the two want
 * different shapes. Queueing the answers rather than matching on the prompt keeps the fake
 * from encoding an assumption about prompt text that the real prompts are free to change.
 */
function modelAnswering(payloads: unknown[]): MockLanguageModelV3 {
  const queue = [...payloads];

  return new MockLanguageModelV3({
    doGenerate: async () => {
      const payload = queue.shift();

      if (payload === undefined) {
        throw new Error("The pipeline made more model calls than the fake had answers for.");
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

function resolvingModel() {
  return modelAnswering([factsPayload("family_member"), mappingPayload("supported")]);
}

function refusingModel() {
  return modelAnswering([factsPayload("unclear"), mappingPayload("insufficient_evidence")]);
}

type Call = { url: string; init: RequestInit | undefined };

function fetchReturning(status: number): { fetch: typeof globalThis.fetch; calls: Call[] } {
  const calls: Call[] = [];

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return { status, ok: status >= 200 && status < 300 } as Response;
  }) as typeof globalThis.fetch;

  return { fetch, calls };
}

describe("runTriage", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
    await database.db.insert(campaigns).values(campaignRow());
  });

  afterEach(async () => {
    await database.close();
  });

  it("persists one row carrying everything the agent produced", async () => {
    const at = new Date("2026-08-19T11:00:00.000Z");

    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: resolvingModel(),
      now: () => at,
    });

    const stored = await database.db.select().from(triageRuns);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(run.id);
    expect(stored[0]?.campaignId).toBe(FIXTURE_CAMPAIGN.id);
    expect(stored[0]?.policyVersion).toBe(POLICY_VERSION);
    expect(stored[0]?.createdAt).toEqual(at);
    expect(stored[0]?.facts.beneficiary.kind).toBe("family_member");
    expect(stored[0]?.mapping.categories["al-gharimin"]?.status).toBe("supported");
    expect(stored[0]?.escalation.escalate).toBe(false);
    expect(stored[0]?.slackDelivery).toBeNull();
  });

  it("records the model that produced the file", async () => {
    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: resolvingModel(),
    });

    expect(run.model).toBe("mock-model-id");
  });

  it("carries the missing-evidence questions the mapping raised", async () => {
    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: refusingModel(),
      slack: { webhookUrl, fetch: fetchReturning(200).fetch },
    });

    expect(run.missingEvidence.items).toHaveLength(8);
    expect(run.missingEvidence.questions).toEqual([question]);
  });

  it("posts the refusal to Slack and records that it landed", async () => {
    const { fetch, calls } = fetchReturning(200);

    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: refusingModel(),
      slack: { webhookUrl, fetch },
    });

    expect(run.escalation.escalate).toBe(true);
    expect(run.slackDelivery).toBe("delivered");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(webhookUrl);
    expect(String(calls[0]?.init?.body)).toContain("Escalated, not determined");
  });

  it("records an undelivered refusal rather than throwing when no webhook is configured", async () => {
    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: refusingModel(),
      slack: { webhookUrl: "" },
    });

    expect(run.escalation.escalate).toBe(true);
    expect(run.slackDelivery).toBe("not_configured");
    expect(await database.db.select().from(triageRuns)).toHaveLength(1);
  });

  it("keeps the run when Slack rejects the post, and records the status", async () => {
    const { fetch } = fetchReturning(500);

    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: refusingModel(),
      slack: { webhookUrl, fetch },
    });

    const stored = await database.db.select().from(triageRuns);

    expect(run.slackDelivery).toBe("failed:500");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.escalation.escalate).toBe(true);
  });

  it("keeps the run when the post never reaches Slack at all", async () => {
    const unreachable = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;

    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: refusingModel(),
      slack: { webhookUrl, fetch: unreachable },
    });

    expect(run.slackDelivery).toBe("failed:unreachable");
    expect(await database.db.select().from(triageRuns)).toHaveLength(1);
  });

  it("appends a second file rather than rewriting the first", async () => {
    const first = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: resolvingModel(),
      now: () => new Date("2026-08-19T11:00:00.000Z"),
    });
    const second = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: refusingModel(),
      now: () => new Date("2026-08-19T12:00:00.000Z"),
      slack: { webhookUrl: "" },
    });

    const stored = await database.db.select().from(triageRuns);

    expect(stored).toHaveLength(2);
    expect(second.id).not.toBe(first.id);
    expect(stored.find((row) => row.id === first.id)?.escalation.escalate).toBe(false);
  });

  it("writes nothing when extraction fails", async () => {
    const failing = modelAnswering([{ beneficiary: { kind: "invented" } }]);

    await expect(
      runTriage(FIXTURE_CAMPAIGN.id, { db: database.db, model: failing }),
    ).rejects.toBeInstanceOf(ExtractionError);

    expect(await database.db.select().from(triageRuns)).toHaveLength(0);
  });

  it("writes nothing when a mapping quote is not in the story", async () => {
    const fabricating = modelAnswering([
      factsPayload("family_member"),
      {
        ...mappingPayload("supported"),
        findings: mappingPayload("supported").findings.map((finding) =>
          finding.category === "al-gharimin"
            ? { ...finding, quotes: ["a sentence the organizer never wrote"] }
            : finding,
        ),
      },
    ]);

    await expect(
      runTriage(FIXTURE_CAMPAIGN.id, { db: database.db, model: fabricating }),
    ).rejects.toBeInstanceOf(MappingError);

    expect(await database.db.select().from(triageRuns)).toHaveLength(0);
  });

  it("refuses a campaign that is not stored rather than triaging an empty one", async () => {
    await expect(
      runTriage("cmp_never_submitted", { db: database.db, model: resolvingModel() }),
    ).rejects.toThrow(/cmp_never_submitted/);
  });
});

/**
 * The invariant, end to end, over a pipeline run rather than over a fixture.
 *
 * The constraint tests in `src/db/__tests__/decision-invariant.test.ts` prove the database
 * refuses what it should. This proves the other half: that a finished, clean, unrefused agent
 * file publishes nothing on its own, and that the only thing which changes that is a human
 * recording a decision.
 */
describe("a campaign the agent finished still has no outcome", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
    await database.db.insert(campaigns).values(campaignRow());
  });

  afterEach(async () => {
    await database.close();
  });

  it("publishes nothing until a human decides, and then publishes their decision", async () => {
    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: resolvingModel(),
    });

    expect(run.escalation.escalate).toBe(false);
    expect(supportedCategories(run.mapping)).toEqual(["al-gharimin"]);
    expect(await publishedOutcome(FIXTURE_CAMPAIGN.id, database.db)).toBeNull();

    await recordDecision(
      {
        campaignId: FIXTURE_CAMPAIGN.id,
        triageRunId: run.id,
        action: "approve",
        reviewer: "Amina Suleiman",
        note: "The debt is named and currently due, and the beneficiary is a person.",
      },
      database.db,
    );

    const outcome = await publishedOutcome(FIXTURE_CAMPAIGN.id, database.db);

    expect(outcome?.action).toBe("approve");
    expect(outcome?.triageRunId).toBe(run.id);
    expect(agreementWith(run, "approve").agreed).toBe(true);
  });
});

/**
 * The agent's file is immutable because there is no way to change it, not because nobody has
 * wanted to yet. Both halves are checked: the module offers no update, and no module anywhere
 * writes an update against the table behind its back.
 */
describe("a triage run cannot be rewritten", () => {
  it("exports no way to change a run that has been written", () => {
    const changing = Object.keys(triage).filter((name) =>
      /update|edit|patch|amend|revise|overwrite/i.test(name),
    );

    expect(changing).toEqual([]);
  });

  it("has no update against triage_runs anywhere in the source", async () => {
    const files: string[] = [];

    async function walk(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) {
          await walk(path);
        } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
          files.push(path);
        }
      }
    }

    await walk(SRC);
    expect(files.length).toBeGreaterThan(20);

    for (const file of files) {
      const source = await readFile(file, "utf8");

      expect(source).not.toMatch(/\.update\(\s*triageRuns/);
      expect(source).not.toMatch(/update\s+"?triage_runs/i);
    }
  });
});
