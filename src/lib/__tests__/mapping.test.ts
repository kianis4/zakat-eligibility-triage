import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import type { CampaignInput } from "../campaign";
import { POLICY_VERSION, RECIPIENT_CATEGORY_IDS, scholarlyDifferenceById } from "../categories";
import type { ExtractedFacts } from "../extraction";
import { CategoryFinding, MappingError, mapCategories, resolveCitation } from "../mapping";

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

type ModelFindingPayload = Record<string, unknown>;

function modelMapping(overrides: Record<string, ModelFindingPayload> = {}) {
  const findings = RECIPIENT_CATEGORY_IDS.map((id) => ({
    category: id,
    quotes: [],
    ...(overrides[id] ?? {
      status: "insufficient_evidence",
      rationale: "The story does not say enough about this category.",
      missingFact: "Whether the beneficiary falls under this category at all.",
      questionForOrganizer:
        "Could you tell us who will receive this money and what it will be spent on?",
      scholarlyDifference: null,
    }),
  }));

  return {
    findings,
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

const tamlikSelection = {
  status: "insufficient_evidence",
  rationale: "The generator is a communal asset and the story does not say who owns it.",
  missingFact: "Whether ownership of the generator transfers to the community.",
  questionForOrganizer: "Once the new generator is installed, who will own it and be responsible for it?",
  scholarlyDifference: {
    id: "fi-sabilillah-tamlik",
    whyThisApplies: "The campaign buys a generator the clinic keeps afterward.",
  },
};

const supportedDebtFinding = {
  status: "supported",
  quotes: [debtQuote],
  rationale: "The story states a debt the family says it cannot repay.",
  scholarlyDifference: null,
};

describe("mapCategories", () => {
  it("returns a finding for every one of the eight categories", async () => {
    const mapping = await mapCategories(
      campaign,
      facts,
      modelReturning(modelMapping({ "al-gharimin": supportedDebtFinding })),
    );

    expect(Object.keys(mapping.categories).sort()).toEqual([...RECIPIENT_CATEGORY_IDS].sort());
  });

  /**
   * The model returns a list, because the provider's compiler refuses eight named
   * union-shaped properties, and a list says three things a record cannot: a category in any
   * order, a category twice, and a category not at all. The first has to survive the fold
   * intact and the other two have to fail it, because a duplicate silently overwrites a
   * finding and an omission silently loses one, and both reach the reviewer looking complete.
   */
  it("folds a finding onto its own category whatever order the list arrives in", async () => {
    const complete = modelMapping({ "al-gharimin": supportedDebtFinding });
    const reversed = { ...complete, findings: [...complete.findings].reverse() };
    const mapping = await mapCategories(campaign, facts, modelReturning(reversed));

    expect(mapping.categories["al-gharimin"].status).toBe("supported");
    expect(mapping.categories["fi-sabilillah"].status).toBe("insufficient_evidence");
  });

  it("fails the mapping when the model leaves a category out", async () => {
    const complete = modelMapping();
    const incomplete = {
      ...complete,
      findings: complete.findings.filter((finding) => finding.category !== "ibn-al-sabil"),
    };

    const error = await mapCategories(campaign, facts, modelReturning(incomplete)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
    expect((error as MappingError).message).toContain("ibn-al-sabil");
  });

  it("fails the mapping when the model returns a category twice", async () => {
    const complete = modelMapping({ "al-gharimin": supportedDebtFinding });
    const duplicated = {
      ...complete,
      findings: [
        ...complete.findings,
        { ...complete.findings[0], category: "al-gharimin", quotes: [debtQuote] },
      ],
    };

    const error = await mapCategories(campaign, facts, modelReturning(duplicated)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
    expect((error as MappingError).message).toContain("al-gharimin");
  });

  it("fails the mapping when the model names a category the corpus does not hold", async () => {
    const complete = modelMapping();
    const invented = {
      ...complete,
      findings: complete.findings.map((finding, index) =>
        index === 0 ? { ...finding, category: "al-yatama" } : finding,
      ),
    };

    const error = await mapCategories(campaign, facts, modelReturning(invented)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
  });

  it("stamps the mapping with the policy version it was produced under", async () => {
    const mapping = await mapCategories(campaign, facts, modelReturning(modelMapping()));

    expect(mapping.policyVersion).toBe(POLICY_VERSION);
  });

  /**
   * The stamp says which guidance the pipeline mapped against, so it has to come from the
   * guidance rather than from the thing being checked against it. A model that could set it
   * could date its own output to a policy it never read.
   */
  it("ignores a policy version the model supplies", async () => {
    const forged = { ...modelMapping(), policyVersion: "000000000000" };
    const mapping = await mapCategories(campaign, facts, modelReturning(forged));

    expect(mapping.policyVersion).toBe(POLICY_VERSION);
  });

  it("carries a citation that resolves to a real span of the story", async () => {
    const mapping = await mapCategories(
      campaign,
      facts,
      modelReturning(modelMapping({ "al-gharimin": supportedDebtFinding })),
    );

    const finding = mapping.categories["al-gharimin"];

    expect(finding.status).toBe("supported");
    if (finding.status !== "supported") return;

    const [citation] = finding.citations;
    expect(campaign.story.slice(citation.start, citation.end)).toBe(citation.quote);
    expect(citation.quote).toBe(debtQuote);
  });

  it("keeps the missing fact on an insufficient-evidence finding", async () => {
    const mapping = await mapCategories(campaign, facts, modelReturning(modelMapping()));

    const finding = mapping.categories["fi-sabilillah"];

    expect(finding.status).toBe("insufficient_evidence");
    if (finding.status !== "insufficient_evidence") return;
    expect(finding.missingFact.length).toBeGreaterThan(0);
  });

  it("carries the organizer question beside the missing fact", async () => {
    const mapping = await mapCategories(campaign, facts, modelReturning(modelMapping()));

    const finding = mapping.categories["fi-sabilillah"];

    expect(finding.status).toBe("insufficient_evidence");
    if (finding.status !== "insufficient_evidence") return;
    expect(finding.questionForOrganizer).toBe(
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
      modelReturning(modelMapping({ "fi-sabilillah": tamlikSelection })),
    );

    expect(mapping.categories["fi-sabilillah"].scholarlyDifference?.entry.topic).toBe(
      "tamlik on project campaigns",
    );
    expect(mapping.categories["al-gharimin"].scholarlyDifference).toBeUndefined();
  });

  /**
   * The difference the reviewer reads is the one in the corpus, byte for byte. That is what
   * makes it checkable: a summary the model wrote would be a description of a scholarly
   * position with nothing to diff it against, which is what ADR-0007 forbids.
   */
  it("resolves the selected id to the recorded entry rather than to anything the model wrote", async () => {
    const mapping = await mapCategories(
      campaign,
      facts,
      modelReturning(modelMapping({ "fi-sabilillah": tamlikSelection })),
    );

    const difference = mapping.categories["fi-sabilillah"].scholarlyDifference;

    expect(difference?.entry).toEqual(scholarlyDifferenceById("fi-sabilillah-tamlik"));
    expect(difference?.whyThisApplies).toBe(
      "The campaign buys a generator the clinic keeps afterward.",
    );
  });

  it("fails the mapping when the model names a difference the corpus does not record", async () => {
    const invented = modelMapping({
      "fi-sabilillah": {
        ...tamlikSelection,
        scholarlyDifference: {
          id: "fi-sabilillah-mosques",
          whyThisApplies: "The campaign buys a generator the clinic keeps afterward.",
        },
      },
    });

    const error = await mapCategories(campaign, facts, modelReturning(invented)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
  });

  it("fails the mapping when the model writes an account of the difference instead of one sentence", async () => {
    const described = modelMapping({
      "fi-sabilillah": {
        ...tamlikSelection,
        scholarlyDifference: {
          id: "fi-sabilillah-tamlik",
          whyThisApplies:
            "The Hanafi position requires transfer of ownership to a needy person. Other bodies accept community ownership.",
        },
      },
    });

    const error = await mapCategories(campaign, facts, modelReturning(described)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(MappingError);
    expect((error as MappingError).reason).toBe("schema_validation_failed");
  });

  it("resolves the citations behind a mixed-use signal", async () => {
    const mapping = await mapCategories(campaign, facts, modelReturning(modelMapping()));

    const [signal] = mapping.mixedUseSignals;
    const [citation] = signal.citations;

    expect(campaign.story.slice(citation.start, citation.end)).toBe(citation.quote);
  });

  it("rejects a supported finding that cites nothing, at the schema level", async () => {
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

  /**
   * The model-facing schema used to type the missing fact and the question onto the one
   * status that cannot be acted on without them. One flat item schema is what the provider's
   * compiler accepts, so the requirement is a check on that item now rather than a shape, and
   * these are the two payloads that would otherwise reach a reviewer as a finding they cannot
   * act on and cannot resolve.
   */
  for (const field of ["missingFact", "questionForOrganizer"] as const) {
    it(`rejects an unresolved finding with no ${field}, at the schema level`, async () => {
      const incomplete = modelMapping({
        "al-gharimin": {
          status: "insufficient_evidence",
          rationale: "The story does not say when the debt falls due.",
          missingFact: "When the repayment falls due.",
          questionForOrganizer: "When does the repayment you mention fall due?",
          scholarlyDifference: null,
          [field]: undefined,
        },
      });

      const error = await mapCategories(campaign, facts, modelReturning(incomplete)).catch(
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(MappingError);
      expect((error as MappingError).reason).toBe("schema_validation_failed");
    });
  }

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

  /**
   * These four payloads all mapped cleanly before the shape guard reached the fields the
   * model writes prose into. Each one puts fabricated scripture somewhere a reviewer reads:
   * the rationale beside the citations, the missing fact, the question that gets forwarded
   * to the organizer untouched, and the description that becomes the mixed-use question.
   */
  const fabricated = {
    rationale: {
      "al-gharimin": {
        status: "supported",
        quotes: [debtQuote],
        rationale:
          'The story describes a family in debt, and Quran 9:60 says "zakat is for the poor and those in debt" which covers them.',
        scholarlyDifference: null,
      },
    },
    missingFact: {
      "al-gharimin": {
        status: "insufficient_evidence",
        rationale: "The story does not say when the debt falls due.",
        missingFact:
          "Whether the debt is currently due, since the Prophet said a debt not yet due does not qualify.",
        questionForOrganizer: "When does the repayment you mention fall due?",
        scholarlyDifference: null,
      },
    },
    questionForOrganizer: {
      "al-gharimin": {
        status: "insufficient_evidence",
        rationale: "The story does not say what the family has already done about the debt.",
        missingFact: "What steps the family has taken toward the debt.",
        questionForOrganizer:
          'The Prophet said "the upper hand is better than the lower hand", so can you tell us what you have already tried?',
        scholarlyDifference: null,
      },
    },
  };

  for (const [field, override] of Object.entries(fabricated)) {
    it(`fails the mapping when the model puts a fabricated source in ${field}`, async () => {
      const error = await mapCategories(
        campaign,
        facts,
        modelReturning(modelMapping(override)),
      ).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(MappingError);
      expect((error as MappingError).reason).toBe("schema_validation_failed");
    });
  }

  it("fails the mapping when the model puts a fabricated source in a mixed-use description", async () => {
    const cited = {
      ...modelMapping(),
      mixedUseSignals: [
        {
          description:
            "Half the money clears the debt and half funds the hall, per Surah 2 verse 271 on public giving.",
          quotes: ["Any surplus will go to the clinic's new generator"],
        },
      ],
    };

    const error = await mapCategories(campaign, facts, modelReturning(cited)).catch(
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
    const parsed = CategoryFinding.safeParse(
      withQuestion("Who will receive the money you raise, and how will it reach them?"),
    );

    expect(parsed.success).toBe(true);
  });

  it("rejects a question that is not asked as a question", () => {
    const parsed = CategoryFinding.safeParse(
      withQuestion("Tell us who will receive the money you raise."),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a question naming one of the eight categories", () => {
    const parsed = CategoryFinding.safeParse(
      withQuestion("Is the money you raise going to al-gharimin?"),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a question carrying our own status vocabulary", () => {
    const parsed = CategoryFinding.safeParse(
      withQuestion("Our reviewer marked this insufficient_evidence, can you say more?"),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects an empty question", () => {
    expect(CategoryFinding.safeParse(withQuestion("")).success).toBe(false);
  });

  it("rejects a question padded with the whitespace of the template around it", () => {
    const parsed = CategoryFinding.safeParse(
      withQuestion("\n  Who will receive the money you raise?  "),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects an insufficient-evidence finding carrying no question at all", () => {
    const parsed = CategoryFinding.safeParse({
      status: "insufficient_evidence",
      rationale: "The story does not say who receives the money.",
      missingFact: "Who receives the money.",
    });

    expect(parsed.success).toBe(false);
  });
});
