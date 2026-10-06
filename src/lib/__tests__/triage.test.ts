import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { MockLanguageModelV3 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { campaigns, triageRuns } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/testing";
import { campaignRow, FIXTURE_CAMPAIGN } from "../../testing/triage-fixtures";
import { POLICY_VERSION, RECIPIENT_CATEGORY_IDS } from "../categories";
import { ExtractionError } from "../extraction";
import { MappingError } from "../mapping";
import * as triage from "../triage";
import { runTriage } from "../triage";

const SRC = fileURLToPath(new URL("../../", import.meta.url));

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
    });

    expect(run.missingEvidence.items).toHaveLength(8);
    expect(run.missingEvidence.questions).toEqual([question]);
  });

  /**
   * A refusal is the donor's to read on the result page, so it is stored like any other file
   * and sent nowhere. Nothing is recorded about delivery because nothing is delivered.
   */
  it("stores a refusal with no delivery state and sends it nowhere", async () => {
    const run = await runTriage(FIXTURE_CAMPAIGN.id, {
      db: database.db,
      model: refusingModel(),
    });

    const stored = await database.db.select().from(triageRuns);

    expect(run.escalation.escalate).toBe(true);
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toHaveProperty("slackDelivery");
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
