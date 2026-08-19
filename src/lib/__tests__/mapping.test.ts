import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import type { CampaignInput } from "../campaign";
import { RECIPIENT_CATEGORY_IDS } from "../categories";
import type { ExtractedFacts } from "../extraction";
import { CategoryVerdict, MappingError, mapCategories, resolveCitation } from "../mapping";

const story =
  "We are stranded in Cairo with no way home. We are stranded and the embassy has no funds left for us.";

describe("resolveCitation", () => {
  it("resolves a verbatim quote to the offsets it occupies in the story", () => {
    const citation = resolveCitation(story, "the embassy has no funds left for us");

    expect(story.slice(citation.start, citation.end)).toBe(citation.quote);
    expect(citation.start).toBe(story.indexOf("the embassy has no funds left for us"));
    expect(citation.end).toBe(citation.start + citation.quote.length);
  });

  it("resolves a quote that appears twice to its first occurrence", () => {
    const citation = resolveCitation(story, "We are stranded");

    expect(citation.start).toBe(0);
    expect(story.slice(citation.start, citation.end)).toBe("We are stranded");
    expect(story.indexOf("We are stranded", citation.end)).toBeGreaterThan(citation.end);
  });

  it("resolves a quote at the very end of the story", () => {
    const citation = resolveCitation(story, "no funds left for us.");

    expect(citation.end).toBe(story.length);
    expect(story.slice(citation.start, citation.end)).toBe(citation.quote);
  });

  it("refuses an empty quote rather than returning a citation to nothing", () => {
    const thrown = (() => {
      try {
        resolveCitation(story, "");
        return null;
      } catch (error: unknown) {
        return error;
      }
    })();

    expect(thrown).toBeInstanceOf(MappingError);
    expect((thrown as MappingError).reason).toBe("citation_unresolvable");
  });

  it("throws rather than approximating a quote that is not in the story", () => {
    const thrown = (() => {
      try {
        resolveCitation(story, "we are stranded in cairo");
        return null;
      } catch (error: unknown) {
        return error;
      }
    })();

    expect(thrown).toBeInstanceOf(MappingError);
    expect((thrown as MappingError).reason).toBe("citation_unresolvable");
    expect((thrown as MappingError).message).toContain("we are stranded in cairo");
  });
});

const campaign: CampaignInput = {
  id: "cmp_0042",
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

const facts: ExtractedFacts = {
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

const debtQuote = "borrowed 9,000 JOD from relatives to cover the treatment and cannot repay it";

type ModelVerdictPayload = Record<string, unknown>;

function modelMapping(overrides: Record<string, ModelVerdictPayload> = {}) {
  const categories = Object.fromEntries(
    RECIPIENT_CATEGORY_IDS.map((id) => [
      id,
      overrides[id] ?? {
        status: "insufficient_evidence",
        rationale: "The story does not say enough about this category.",
        missingFact: "Whether the beneficiary falls under this category at all.",
        questionForOrganizer:
          "Could you tell us who will receive this money and what it will be spent on?",
        scholarlyDifference: null,
      },
    ]),
  );

  return {
    categories,
    mixedUseSignals: [
      {
        description: "Surplus funds are directed to equipment rather than to the debt.",
        quotes: ["Any surplus will go to the clinic's new generator"],
      },
    ],
  };
}

function modelReturning(payload: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

const supportedDebtVerdict = {
  status: "supported",
  quotes: [debtQuote],
  rationale: "The story states a debt the family says it cannot repay.",
  scholarlyDifference: null,
};

describe("mapCategories", () => {
  it("returns a verdict for every one of the eight categories", async () => {
    const mapping = await mapCategories(
      campaign,
      facts,
      modelReturning(modelMapping({ "al-gharimin": supportedDebtVerdict })),
    );

    expect(Object.keys(mapping.categories).sort()).toEqual([...RECIPIENT_CATEGORY_IDS].sort());
  });

  it("carries a citation that resolves to a real span of the story", async () => {
    const mapping = await mapCategories(
      campaign,
      facts,
      modelReturning(modelMapping({ "al-gharimin": supportedDebtVerdict })),
    );

    const verdict = mapping.categories["al-gharimin"];

    expect(verdict.status).toBe("supported");
    if (verdict.status !== "supported") return;

    const [citation] = verdict.citations;
    expect(campaign.story.slice(citation.start, citation.end)).toBe(citation.quote);
    expect(citation.quote).toBe(debtQuote);
  });

  it("keeps the missing fact on an insufficient-evidence verdict", async () => {
    const mapping = await mapCategories(campaign, facts, modelReturning(modelMapping()));

    const verdict = mapping.categories["fi-sabilillah"];

    expect(verdict.status).toBe("insufficient_evidence");
    if (verdict.status !== "insufficient_evidence") return;
    expect(verdict.missingFact.length).toBeGreaterThan(0);
  });

  it("carries the organizer question beside the missing fact", async () => {
    const mapping = await mapCategories(campaign, facts, modelReturning(modelMapping()));

    const verdict = mapping.categories["fi-sabilillah"];

    expect(verdict.status).toBe("insufficient_evidence");
    if (verdict.status !== "insufficient_evidence") return;
    expect(verdict.questionForOrganizer).toBe(
      "Could you tell us who will receive this money and what it will be spent on?",
    );
  });

  it("fails the mapping when the question is one a reviewer cannot forward", async () => {
    const jargon = modelMapping({
      "fi-sabilillah": {
        status: "insufficient_evidence",
        rationale: "The story claims a general public benefit and names no beneficiary.",
        missingFact: "Who receives the money.",
        questionForOrganizer: "Does this campaign qualify under fi-sabilillah?",
        scholarlyDifference: null,
      },
    });

    const error = await mapCategories(campaign, facts, modelReturning(jargon)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
  });

  it("records a scholarly difference without resolving it", async () => {
    const mapping = await mapCategories(
      campaign,
      facts,
      modelReturning(
        modelMapping({
          "fi-sabilillah": {
            status: "insufficient_evidence",
            rationale: "The generator is a communal asset and the story does not say who owns it.",
            missingFact: "Whether ownership of the generator transfers to the community.",
            questionForOrganizer:
              "Once the new generator is installed, who will own it and be responsible for it?",
            scholarlyDifference: {
              topic: "tamlik on project campaigns",
              note: "Hanafi positions require transfer of ownership to a needy person; other bodies accept community ownership or a wakalah agreement.",
            },
          },
        }),
      ),
    );

    expect(mapping.categories["fi-sabilillah"].scholarlyDifference?.topic).toBe(
      "tamlik on project campaigns",
    );
    expect(mapping.categories["al-gharimin"].scholarlyDifference).toBeUndefined();
  });

  it("resolves the citations behind a mixed-use signal", async () => {
    const mapping = await mapCategories(campaign, facts, modelReturning(modelMapping()));

    const [signal] = mapping.mixedUseSignals;
    const [citation] = signal.citations;

    expect(campaign.story.slice(citation.start, citation.end)).toBe(citation.quote);
  });

  it("rejects a supported verdict that cites nothing, at the schema level", async () => {
    const uncited = modelMapping({
      "al-gharimin": {
        status: "supported",
        quotes: [],
        rationale: "The family is in debt.",
        scholarlyDifference: null,
      },
    });

    const error = await mapCategories(campaign, facts, modelReturning(uncited)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
  });

  it("fails the mapping when a quote cannot be found in the story", async () => {
    const fabricated = modelMapping({
      "al-gharimin": {
        status: "supported",
        quotes: ["the family has been in debt since 2019"],
        rationale: "The story states a long-standing debt.",
        scholarlyDifference: null,
      },
    });

    const error = await mapCategories(campaign, facts, modelReturning(fabricated)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("citation_unresolvable");
  });

  it("rejects a mixed-use signal that cites nothing, at the schema level", async () => {
    const uncited = {
      ...modelMapping(),
      mixedUseSignals: [{ description: "The money is split across two purposes.", quotes: [] }],
    };

    const error = await mapCategories(campaign, facts, modelReturning(uncited)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
  });

  it("rejects a mixed-use signal whose description names no use, at the schema level", async () => {
    const degenerate = {
      ...modelMapping(),
      mixedUseSignals: [
        { description: ".", quotes: ["Any surplus will go to the clinic's new generator"] },
      ],
    };

    const error = await mapCategories(campaign, facts, modelReturning(degenerate)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
  });

  it("rejects a mixed-use description naming only one thing the money goes to", async () => {
    const single = {
      ...modelMapping(),
      mixedUseSignals: [
        { description: "Equipment", quotes: ["Any surplus will go to the clinic's new generator"] },
      ],
    };

    const error = await mapCategories(campaign, facts, modelReturning(single)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
  });

  it("distinguishes a failed model call from a malformed response", async () => {
    const unreachable = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });

    const error = await mapCategories(campaign, facts, unreachable).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("model_call_failed");
  });

  it("rejects a campaign that does not satisfy the input schema", async () => {
    const withoutStory = { ...campaign, story: undefined } as unknown as CampaignInput;

    await expect(
      mapCategories(withoutStory, facts, modelReturning(modelMapping())),
    ).rejects.toThrow(ZodError);
  });

  it("gives the model the story, the category guidance, and the known differences", async () => {
    const model = modelReturning(modelMapping());
    await mapCategories(campaign, facts, model);

    const call = JSON.stringify(model.doGenerateCalls[0]);

    expect(call).toContain("hospitalised for four months");
    expect(call).toContain("al-gharimin");
    expect(call).toContain("tamlik on project campaigns");
    expect(call).toContain("You do not determine zakat eligibility");
    expect(call).toContain("never for a religious opinion");
  });
});

/**
 * The question is written to be forwarded to the organizer untouched, so the checks that a
 * schema can carry are the ones that stop a reviewer having to rewrite it first.
 */
describe("a question the reviewer cannot send as it stands", () => {
  function withQuestion(questionForOrganizer: string) {
    return {
      status: "insufficient_evidence" as const,
      rationale: "The story does not say who receives the money.",
      missingFact: "Who receives the money.",
      questionForOrganizer,
    };
  }

  it("accepts a question addressed to the organizer in their own terms", () => {
    const parsed = CategoryVerdict.safeParse(
      withQuestion("Who will receive the money you raise, and how will it reach them?"),
    );

    expect(parsed.success).toBe(true);
  });

  it("rejects a question that is not asked as a question", () => {
    const parsed = CategoryVerdict.safeParse(
      withQuestion("Tell us who will receive the money you raise."),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a question naming one of the eight categories", () => {
    const parsed = CategoryVerdict.safeParse(
      withQuestion("Is the money you raise going to al-gharimin?"),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a question carrying our own status vocabulary", () => {
    const parsed = CategoryVerdict.safeParse(
      withQuestion("Our reviewer marked this insufficient_evidence, can you say more?"),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects an empty question", () => {
    expect(CategoryVerdict.safeParse(withQuestion("")).success).toBe(false);
  });

  it("rejects a question padded with the whitespace of the template around it", () => {
    const parsed = CategoryVerdict.safeParse(
      withQuestion("\n  Who will receive the money you raise?  "),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects an insufficient-evidence verdict carrying no question at all", () => {
    const parsed = CategoryVerdict.safeParse({
      status: "insufficient_evidence",
      rationale: "The story does not say who receives the money.",
      missingFact: "Who receives the money.",
    });

    expect(parsed.success).toBe(false);
  });
});
