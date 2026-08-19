import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { CampaignInput } from "../campaign";
import { RECIPIENT_CATEGORY_IDS, type RecipientCategory } from "../categories";
import type { ExtractedFacts } from "../extraction";
import { type CategoryMapping, type CategoryFinding, mapCategories } from "../mapping";
import { buildMissingEvidenceReport } from "../missing-evidence";

/**
 * A campaign that says almost nothing: no beneficiary, no purpose beyond helping, no
 * amounts, no recipient of the funds. This is the case the report exists for, and it is
 * also the ordinary case, since most campaign prose leaves most categories unresolved.
 */
const vagueCampaign: CampaignInput = {
  id: "cmp_0117",
  title: "Raising money for my community",
  story:
    "I am raising money for my community. The funds will help many people who are going through a hard time. Please give what you can and share this with anyone who might.",
  category: "Community",
  goalAmount: 5000,
  currency: "GBP",
  organizer: {
    name: "Nadia Rahman",
    location: "Manchester, United Kingdom",
  },
};

const vagueFacts: ExtractedFacts = {
  beneficiary: { kind: "unclear", description: "An unnamed community." },
  statedPurposes: [
    { purpose: "Help people in hardship", quote: "The funds will help many people" },
  ],
  amountsMentioned: [],
  organizerRoleClaim: null,
  hardshipClaims: [{ claim: "People are in hardship", quote: "going through a hard time" }],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "unstated", quote: null },
};

const beneficiaryQuestion =
  "Who exactly will receive the money you raise, and what is their situation right now?";

/**
 * What a model would plausibly return for a story this thin: nothing supported, most
 * categories unresolved, and the same question reached for twice, because the two
 * categories of material need turn on the same unstated fact.
 */
const vagueModelMapping = {
  categories: {
    "al-fuqara": {
      status: "insufficient_evidence",
      rationale: "The story names no beneficiary and states no financial position.",
      missingFact: "Who the beneficiaries are and what their financial position is.",
      questionForOrganizer: beneficiaryQuestion,
      scholarlyDifference: null,
    },
    "al-masakin": {
      status: "insufficient_evidence",
      rationale: "The story gives no subsistence-level detail.",
      missingFact: "Which basic needs go unmet, and for how many people.",
      questionForOrganizer: beneficiaryQuestion,
      scholarlyDifference: null,
    },
    "al-amilina-alayha": {
      status: "insufficient_evidence",
      rationale: "The story does not say whether anything is deducted before distribution.",
      missingFact: "Whether any part of the total is kept for the cost of running the appeal.",
      questionForOrganizer:
        "Will any part of the total be kept to cover the cost of running this fundraiser, and if so how much?",
      scholarlyDifference: null,
    },
    "al-muallafati-qulubuhum": {
      status: "not_supported",
      rationale: "The story describes no work of this kind.",
      scholarlyDifference: null,
    },
    "fi-al-riqab": {
      status: "not_supported",
      rationale: "The story mentions no detention, bondage, or trafficking.",
      scholarlyDifference: null,
    },
    "al-gharimin": {
      status: "insufficient_evidence",
      rationale: "The story mentions hardship but never a debt.",
      missingFact: "Whether anyone owes a debt, to whom, and whether it is currently due.",
      questionForOrganizer:
        "Does anyone you are raising for owe money to someone, and if so who is owed and by when?",
      scholarlyDifference: null,
    },
    "fi-sabilillah": {
      status: "insufficient_evidence",
      rationale: "The story claims a general benefit without saying what is done or built.",
      missingFact: "What the money buys, and whether it reaches people or funds a project.",
      questionForOrganizer:
        "What will the money actually be spent on, and does it go to people directly or into a project?",
      scholarlyDifference: {
        id: "fi-sabilillah-scope",
        whyThisApplies: "The campaign describes a general benefit and names no beneficiary.",
      },
    },
    "ibn-al-sabil": {
      status: "insufficient_evidence",
      rationale: "The story does not say whether anyone is displaced or stranded.",
      missingFact: "Whether any beneficiary is away from home and cut off from their means.",
      questionForOrganizer:
        "Is anyone you are raising for away from home or unable to get back to it?",
      scholarlyDifference: null,
    },
  },
  mixedUseSignals: [],
};

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

/**
 * The send-as-is constraints, restated here rather than delegated to the schema, so that
 * loosening the schema breaks this test instead of being ratified by it.
 */
function expectSendableToOrganizer(question: string) {
  expect(question.length).toBeGreaterThan(0);
  expect(question).toBe(question.trim());
  expect(question.endsWith("?")).toBe(true);

  for (const id of RECIPIENT_CATEGORY_IDS) {
    expect(question.toLowerCase()).not.toContain(id);
  }
  for (const status of ["insufficient_evidence", "not_supported", "supported"]) {
    expect(question.toLowerCase()).not.toContain(status);
  }
}

describe("a report on an underspecified campaign", () => {
  it("names the specific missing fact behind every unresolved category", async () => {
    const mapping = await mapCategories(
      vagueCampaign,
      vagueFacts,
      modelReturning(vagueModelMapping),
    );

    const report = buildMissingEvidenceReport(mapping);

    expect(report.items.map((item) => item.category)).toEqual([
      "al-fuqara",
      "al-masakin",
      "al-amilina-alayha",
      "al-gharimin",
      "fi-sabilillah",
      "ibn-al-sabil",
    ]);
    expect(report.items.map((item) => item.missingFact)).toEqual([
      "Who the beneficiaries are and what their financial position is.",
      "Which basic needs go unmet, and for how many people.",
      "Whether any part of the total is kept for the cost of running the appeal.",
      "Whether anyone owes a debt, to whom, and whether it is currently due.",
      "What the money buys, and whether it reaches people or funds a project.",
      "Whether any beneficiary is away from home and cut off from their means.",
    ]);
  });

  it("gives the reviewer questions they can forward to the organizer untouched", async () => {
    const mapping = await mapCategories(
      vagueCampaign,
      vagueFacts,
      modelReturning(vagueModelMapping),
    );

    const report = buildMissingEvidenceReport(mapping);

    expect(report.questions.length).toBeGreaterThan(0);
    for (const question of report.questions) {
      expectSendableToOrganizer(question);
    }
  });

  it("asks a question the two categories share only once", async () => {
    const mapping = await mapCategories(
      vagueCampaign,
      vagueFacts,
      modelReturning(vagueModelMapping),
    );

    const report = buildMissingEvidenceReport(mapping);

    const asking = (question: string) => question === beneficiaryQuestion;

    expect(report.items.filter((item) => asking(item.questionForOrganizer))).toHaveLength(2);
    expect(report.questions.filter(asking)).toHaveLength(1);
    expect(report.questions).toHaveLength(5);
  });
});

const notSupported: CategoryFinding = {
  status: "not_supported",
  rationale: "The story does not bear on this category.",
};

function unresolved(missingFact: string, questionForOrganizer: string): CategoryFinding {
  return {
    status: "insufficient_evidence",
    rationale: "The story does not say enough.",
    missingFact,
    questionForOrganizer,
  };
}

function mappingWith(
  findings: Partial<Record<RecipientCategory, CategoryFinding>>,
): CategoryMapping {
  return {
    categories: Object.fromEntries(
      RECIPIENT_CATEGORY_IDS.map((id) => [id, findings[id] ?? notSupported]),
    ) as CategoryMapping["categories"],
    mixedUseSignals: [],
  };
}

describe("buildMissingEvidenceReport", () => {
  it("collects nothing when no category was left unresolved", () => {
    const report = buildMissingEvidenceReport(mappingWith({}));

    expect(report.items).toEqual([]);
    expect(report.questions).toEqual([]);
  });

  it("passes over supported and not-supported findings", () => {
    const report = buildMissingEvidenceReport(
      mappingWith({
        "al-gharimin": {
          status: "supported",
          citations: [{ quote: "cannot repay it", start: 0, end: 15 }],
          rationale: "The story states a debt.",
        },
        "ibn-al-sabil": unresolved(
          "Whether the beneficiary is away from home.",
          "Is anyone you are raising for away from home?",
        ),
      }),
    );

    expect(report.items.map((item) => item.category)).toEqual(["ibn-al-sabil"]);
  });

  it("orders the items by the categories rather than by the mapping's key order", () => {
    const report = buildMissingEvidenceReport(
      mappingWith({
        "ibn-al-sabil": unresolved("Whether anyone is displaced.", "Is anyone displaced?"),
        "al-fuqara": unresolved("Who receives the money.", "Who receives the money you raise?"),
        "al-gharimin": unresolved("Whether a debt is owed.", "Does anyone owe money?"),
      }),
    );

    expect(report.items.map((item) => item.category)).toEqual([
      "al-fuqara",
      "al-gharimin",
      "ibn-al-sabil",
    ]);
  });

  it("treats questions differing only in case and spacing as the same question", () => {
    const report = buildMissingEvidenceReport(
      mappingWith({
        "al-fuqara": unresolved("Who receives the money.", "Who receives the money you raise?"),
        "al-masakin": unresolved(
          "Which basic needs go unmet.",
          "who   receives the money\nyou raise?",
        ),
        "al-gharimin": unresolved("Whether a debt is owed.", "Does anyone owe money?"),
      }),
    );

    expect(report.items).toHaveLength(3);
    expect(report.questions).toEqual([
      "Who receives the money you raise?",
      "Does anyone owe money?",
    ]);
  });

  it("keeps every category's own missing fact when their questions collapse into one", () => {
    const report = buildMissingEvidenceReport(
      mappingWith({
        "al-fuqara": unresolved("Who receives the money.", "Who receives the money you raise?"),
        "al-masakin": unresolved(
          "Which basic needs go unmet.",
          "Who receives the money you raise?",
        ),
      }),
    );

    expect(report.items.map((item) => item.missingFact)).toEqual([
      "Who receives the money.",
      "Which basic needs go unmet.",
    ]);
    expect(report.questions).toHaveLength(1);
  });

  it("returns the same report for the same mapping", () => {
    const mapping = mappingWith({
      "al-fuqara": unresolved("Who receives the money.", "Who receives the money you raise?"),
      "fi-sabilillah": unresolved("What the money buys.", "What will the money be spent on?"),
    });

    expect(buildMissingEvidenceReport(mapping)).toEqual(buildMissingEvidenceReport(mapping));
  });
});
