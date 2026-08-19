import { fileURLToPath } from "node:url";

import { MockLanguageModelV3 } from "ai/test";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { seedPrecedents } from "../../db/seed";
import { createTestDatabase, type TestDatabase } from "../../db/testing";
import { createHashEmbedder } from "../../testing/hash-embedder";
import { collectImportGraph } from "../../testing/import-graph";
import type { CampaignInput } from "../campaign";
import { RECIPIENT_CATEGORY_IDS } from "../categories";
import { extractFacts } from "../extraction";
import { mapCategories } from "../mapping";
import { retrievePrecedents, type PrecedentForReviewer } from "../precedent";

const SRC = fileURLToPath(new URL("../../", import.meta.url));

const campaign: CampaignInput = {
  id: "cmp_7781",
  title: "Help the Haddad family clear their hospital debt",
  story:
    "My sister Rania was hospitalised for four months last winter. The family borrowed 9,000 JOD from relatives to cover the treatment and cannot repay it. Any surplus will go to the clinic's new generator.",
  category: "Medical",
  goalAmount: 9000,
  currency: "JOD",
  organizer: {
    name: "Yusuf Haddad",
    location: "Irbid, Jordan",
    relationshipToBeneficiary: "brother",
  },
};

const factsPayload = {
  beneficiary: { kind: "family_member", description: "The organizer's sister Rania." },
  statedPurposes: [
    {
      purpose: "Repay money borrowed for hospital treatment",
      quote: "borrowed 9,000 JOD from relatives to cover the treatment and cannot repay it",
    },
  ],
  amountsMentioned: [
    { amount: 9000, currency: "JOD", quote: "borrowed 9,000 JOD from relatives" },
  ],
  organizerRoleClaim: null,
  hardshipClaims: [{ claim: "Debt the family cannot repay", quote: "cannot repay it" }],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "unstated", quote: null },
};

const mappingPayload = {
  categories: Object.fromEntries(
    RECIPIENT_CATEGORY_IDS.map((id) => [
      id,
      id === "al-gharimin"
        ? {
            status: "supported",
            quotes: ["cannot repay it"],
            rationale: "The story states a debt the family says it cannot repay.",
            scholarlyDifference: null,
          }
        : {
            status: "insufficient_evidence",
            rationale: "The story does not say enough about this category.",
            missingFact: "Whether the beneficiary falls under this category at all.",
            questionForOrganizer:
              "Could you tell us who receives the money once it is raised, and what it pays for first?",
            scholarlyDifference: null,
          },
    ]),
  ),
  mixedUseSignals: [],
};

/**
 * A model that keeps everything it is handed.
 *
 * The whole call options object is recorded, not only the prompt string, so the system
 * prompt, the message list and the response schema are all inside the transcript the
 * assertions search.
 */
function recordingModel(transcript: string[], payload: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      transcript.push(JSON.stringify(options));

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

describe("precedent stays out of the generation prompts", () => {
  let database: TestDatabase;
  let transcript: string[];
  let retrieved: PrecedentForReviewer[];

  beforeAll(async () => {
    const embedder = createHashEmbedder();
    database = await createTestDatabase();
    await seedPrecedents(database.db, embedder);

    transcript = [];
    const facts = await extractFacts(campaign, recordingModel(transcript, factsPayload));
    await mapCategories(campaign, facts, recordingModel(transcript, mappingPayload));

    retrieved = await retrievePrecedents(campaign, { db: database.db, embedder, k: 12 });
  });

  afterAll(async () => {
    await database.close();
  });

  it("recorded the prompts the pipeline actually sent", () => {
    expect(transcript).toHaveLength(2);

    const everything = transcript.join("\n");

    expect(everything).toContain("hospitalised for four months");
    expect(everything).toContain("EXACT VERBATIM substring");
  });

  it("retrieved adjudications that had something to leak", () => {
    expect(retrieved.length).toBeGreaterThanOrEqual(10);

    for (const precedent of retrieved) {
      expect(precedent.reviewerNote.length).toBeGreaterThan(80);
      expect(precedent.storyExcerpt.length).toBeGreaterThan(40);
    }
  });

  it("sent no reviewer note to the model", () => {
    const everything = transcript.join("\n");

    for (const precedent of retrieved) {
      expect(everything).not.toContain(precedent.reviewerNote);
      expect(everything).not.toContain(precedent.reviewerNote.slice(0, 60));
    }
  });

  it("sent no precedent title or story to the model", () => {
    const everything = transcript.join("\n");

    for (const precedent of retrieved) {
      expect(everything).not.toContain(precedent.title);
      expect(everything).not.toContain(precedent.storyExcerpt.slice(40, 120));
    }
  });

  it("sent no past decision to the model, in any form", () => {
    const everything = transcript.join("\n");

    for (const decision of new Set(retrieved.map((precedent) => precedent.decision))) {
      expect(everything).not.toContain(decision);
    }

    for (const precedent of retrieved) {
      for (const [category, outcome] of Object.entries(precedent.categoryOutcomes)) {
        expect(everything).not.toContain(`"${category}":"${outcome}"`);
      }
    }
  });

  it("carries no serialized precedent of any kind, whatever it holds", () => {
    const everything = transcript.join("\n");

    expect(everything).not.toContain('"reviewerNote"');
    expect(everything).not.toContain('"decision":"');
    expect(everything).not.toContain('"decidedAt"');
    expect(everything).not.toContain('"categoryOutcomes"');
  });
});

describe("the generation modules cannot reach the precedent store", () => {
  it("finds no path from fact extraction to precedent or to the database", async () => {
    const graph = await collectImportGraph(`${SRC}lib/extraction.ts`);

    expect(graph).toContain(`${SRC}lib/campaign.ts`);
    expect(graph.some((file) => file.startsWith(`${SRC}db/`))).toBe(false);
    expect(graph).not.toContain(`${SRC}lib/precedent.ts`);
  });

  it("finds no path from category mapping to precedent or to the database", async () => {
    const graph = await collectImportGraph(`${SRC}lib/mapping.ts`);

    expect(graph).toContain(`${SRC}lib/categories.ts`);
    expect(graph).toContain(`${SRC}lib/quotes.ts`);
    expect(graph.some((file) => file.startsWith(`${SRC}db/`))).toBe(false);
    expect(graph).not.toContain(`${SRC}lib/precedent.ts`);
  });

  it("detects the edge when one genuinely exists", async () => {
    const graph = await collectImportGraph(`${SRC}lib/precedent.ts`);

    expect(graph).toContain(`${SRC}db/index.ts`);
    expect(graph).toContain(`${SRC}db/schema.ts`);
  });
});
