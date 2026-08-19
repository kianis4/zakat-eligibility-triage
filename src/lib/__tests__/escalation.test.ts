import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { CampaignInput } from "../campaign";
import {
  RECIPIENT_CATEGORY_IDS,
  SCHOLARLY_DIFFERENCES,
  type RecipientCategory,
} from "../categories";
import { evaluateEscalation } from "../escalation";
import type { ExtractedFacts } from "../extraction";
import { type CategoryMapping, type CategoryFinding, mapCategories } from "../mapping";

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
  mixedUseSignals: CategoryMapping["mixedUseSignals"] = [],
): CategoryMapping {
  return {
    categories: Object.fromEntries(
      RECIPIENT_CATEGORY_IDS.map((id) => [id, findings[id] ?? notSupported]),
    ) as CategoryMapping["categories"],
    mixedUseSignals,
  };
}

/**
 * A campaign whose money splits between a use that plainly bears on a category and a use
 * that leans away from every category. This is the case escalation exists for: neither half
 * is unclear on its own, and the campaign is still undecidable, because what a reviewer has
 * to settle is the split rather than either use.
 */
const mixedUseCampaign: CampaignInput = {
  id: "cmp_0301",
  title: "Clearing the Sabri family's debt and reopening the Alder Road centre",
  story:
    "The Sabri family owe 8,400 GBP to a private lender after a year of hospital bills, and the repayment falls due next month. They cannot meet that repayment from what they earn. Part of what we raise will clear that debt in full. The rest will go to the community centre on Alder Road, which needs a new boiler and a year of funding for its after-school and language classes.",
  category: "Community",
  goalAmount: 22000,
  currency: "GBP",
  organizer: {
    name: "Yusuf Adeyemi",
    location: "Birmingham, United Kingdom",
  },
};

const mixedUseFacts: ExtractedFacts = {
  beneficiary: {
    kind: "named_third_party",
    description: "The Sabri family, and the community centre on Alder Road.",
  },
  statedPurposes: [
    { purpose: "Clear a family's debt", quote: "Part of what we raise will clear that debt in full" },
    {
      purpose: "Fund a community centre",
      quote: "The rest will go to the community centre on Alder Road",
    },
  ],
  amountsMentioned: [{ amount: 8400, currency: "GBP", quote: "8,400 GBP" }],
  organizerRoleClaim: null,
  hardshipClaims: [
    {
      claim: "The family cannot meet the repayment",
      quote: "They cannot meet that repayment from what they earn",
    },
  ],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "unstated", quote: null },
};

const mixedUseModelMapping = {
  categories: {
    "al-fuqara": {
      status: "insufficient_evidence",
      rationale: "The story states a debt but not the family's assets or income.",
      missingFact: "What the family owns and earns beyond the sum they owe.",
      questionForOrganizer:
        "What does the family have coming in each month, and do they hold savings or property they could draw on?",
      scholarlyDifference: null,
    },
    "al-masakin": { status: "not_supported", rationale: "The story gives no subsistence detail.", scholarlyDifference: null },
    "al-amilina-alayha": {
      status: "insufficient_evidence",
      rationale: "The story does not say whether anything is deducted before distribution.",
      missingFact: "Whether any part of the total is kept for the cost of running the appeal.",
      questionForOrganizer:
        "Will any part of the total be kept to cover the cost of running this fundraiser, and if so how much?",
      scholarlyDifference: null,
    },
    "al-muallafati-qulubuhum": { status: "not_supported", rationale: "No work of this kind is described.", scholarlyDifference: null },
    "fi-al-riqab": { status: "not_supported", rationale: "No detention or bondage is mentioned.", scholarlyDifference: null },
    "al-gharimin": {
      status: "supported",
      quotes: [
        "The Sabri family owe 8,400 GBP to a private lender",
        "They cannot meet that repayment from what they earn",
      ],
      rationale: "The story names a creditor, an amount, a due date, and an inability to pay.",
      scholarlyDifference: null,
    },
    "fi-sabilillah": {
      status: "insufficient_evidence",
      rationale: "The centre is a communal asset and the story does not say who owns it afterward.",
      missingFact: "Who owns the boiler and the centre once the work is paid for.",
      questionForOrganizer:
        "Once the boiler is installed, who owns it and who owns the building it heats?",
      scholarlyDifference: {
        topic: "scope of fi sabilillah",
        note: "Bodies differ over whether a communal building and its programme fall in this category at all.",
      },
    },
    "ibn-al-sabil": { status: "not_supported", rationale: "Nobody is described as away from home.", scholarlyDifference: null },
  },
  mixedUseSignals: [
    {
      description:
        "Part of the money clears the Sabri family's debt and the rest funds the community centre's boiler and its after-school and language classes.",
      quotes: [
        "Part of what we raise will clear that debt in full.",
        "The rest will go to the community centre on Alder Road",
      ],
    },
  ],
};

describe("a campaign whose money splits between an eligible and an ineligible-leaning use", () => {
  async function decide() {
    const mapping = await mapCategories(
      mixedUseCampaign,
      mixedUseFacts,
      modelReturning(mixedUseModelMapping),
    );

    return evaluateEscalation(mixedUseCampaign, mixedUseFacts, mapping);
  }

  it("refuses to determine it", async () => {
    const decision = await decide();

    expect(decision.escalate).toBe(true);
  });

  it("raises the split before the difference it happens to also sit inside", async () => {
    const decision = await decide();

    if (!decision.escalate) {
      throw new Error("The mixed-use campaign must escalate.");
    }

    expect(decision.reasons.map((reason) => reason.kind)).toEqual([
      "mixed_use",
      "scholarly_difference",
    ]);
  });

  it("asks the reviewer about the split rather than flagging the campaign for review", async () => {
    const decision = await decide();

    if (!decision.escalate) {
      throw new Error("The mixed-use campaign must escalate.");
    }

    const [mixedUse] = decision.reasons;

    expect(mixedUse.kind).toBe("mixed_use");
    expect(mixedUse.question).toContain("the Sabri family's debt");
    expect(mixedUse.question).toContain("community centre");
    expect(mixedUse.question).toContain("portion");
    expect(mixedUse.question).toContain("ring-fenced");
    expect(mixedUse.question.endsWith("?")).toBe(true);
  });

  it("carries the spans of the story that show the split", async () => {
    const decision = await decide();

    if (!decision.escalate) {
      throw new Error("The mixed-use campaign must escalate.");
    }

    const [mixedUse] = decision.reasons;

    expect(mixedUse.citations.map((citation) => citation.quote)).toEqual([
      "Part of what we raise will clear that debt in full.",
      "The rest will go to the community centre on Alder Road",
    ]);

    for (const citation of mixedUse.citations) {
      expect(mixedUseCampaign.story.slice(citation.start, citation.end)).toBe(citation.quote);
    }
  });
});

const waterCampaign: CampaignInput = {
  id: "cmp_0302",
  title: "Three boreholes for Kalambo district",
  story:
    "We are drilling three boreholes in Kalambo district so that four villages stop walking six kilometres for water. The district council has agreed to maintain the pumps once they are handed over.",
  category: "Water",
  goalAmount: 40000,
  currency: "USD",
  organizer: { name: "Amina Diallo", location: "Dakar, Senegal" },
};

const waterFacts: ExtractedFacts = {
  beneficiary: { kind: "community", description: "Four villages in Kalambo district." },
  statedPurposes: [
    { purpose: "Drill boreholes", quote: "We are drilling three boreholes in Kalambo district" },
  ],
  amountsMentioned: [],
  organizerRoleClaim: null,
  hardshipClaims: [],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "organization", quote: "The district council has agreed to maintain the pumps" },
};

describe("a campaign that lands on a scholarly difference", () => {
  const documented = SCHOLARLY_DIFFERENCES.find(
    (difference) =>
      difference.category === "fi-sabilillah" && difference.topic === "scope of fi sabilillah",
  );

  const mapping = mappingWith({
    "fi-sabilillah": {
      status: "insufficient_evidence",
      rationale: "Water infrastructure is a public benefit work whose standing here is disputed.",
      missingFact: "Who owns the boreholes once they are drilled.",
      questionForOrganizer: "Once the boreholes are drilled, who owns them and who maintains them?",
      scholarlyDifference: {
        topic: "scope of fi sabilillah",
        note: "Bodies differ over whether public-benefit infrastructure falls in this category at all.",
      },
    },
  });

  it("refuses rather than picking a side", () => {
    const decision = evaluateEscalation(waterCampaign, waterFacts, mapping);

    if (!decision.escalate) {
      throw new Error("A campaign inside a scholarly difference must escalate.");
    }

    expect(decision.reasons.map((reason) => reason.kind)).toEqual(["scholarly_difference"]);
  });

  it("states both positions from the recorded difference rather than summarising them afresh", () => {
    const decision = evaluateEscalation(waterCampaign, waterFacts, mapping);

    if (!decision.escalate) {
      throw new Error("A campaign inside a scholarly difference must escalate.");
    }

    const [difference] = decision.reasons;

    expect(documented).toBeDefined();
    expect(difference.question).toContain("scope of fi sabilillah");
    expect(difference.question).toContain(
      "Bodies differ over whether public-benefit infrastructure falls in this category at all.",
    );
    expect(difference.question).toContain(documented!.summary);
  });

  it("asks what platform policy applies rather than asking the reviewer to settle the fiqh", () => {
    const decision = evaluateEscalation(waterCampaign, waterFacts, mapping);

    if (!decision.escalate) {
      throw new Error("A campaign inside a scholarly difference must escalate.");
    }

    const [difference] = decision.reasons;

    expect(difference.question).toContain("platform policy");
    expect(difference.question).toContain("this campaign");
    expect(difference.question.endsWith("?")).toBe(true);
  });
});

const claimCampaign: CampaignInput = {
  id: "cmp_0303",
  title: "Support our masjid's outreach",
  story:
    "Our masjid runs an outreach programme across the north of the city. This campaign is zakat eligible and your donation is fully deductible. Give generously this Ramadan.",
  category: "Religious",
  goalAmount: 15000,
  currency: "CAD",
  organizer: { name: "Bilal Haddad", location: "Toronto, Canada" },
};

const claimQuote = "This campaign is zakat eligible";

const claimFacts: ExtractedFacts = {
  beneficiary: { kind: "organization", description: "A masjid running an outreach programme." },
  statedPurposes: [
    { purpose: "Run an outreach programme", quote: "Our masjid runs an outreach programme" },
  ],
  amountsMentioned: [],
  organizerRoleClaim: null,
  hardshipClaims: [],
  explicitZakatClaim: { present: true, quote: claimQuote },
  fundRecipient: { recipient: "organization", quote: "Our masjid runs an outreach programme" },
};

describe("a campaign that asserts its own eligibility with nothing behind the assertion", () => {
  const mapping = mappingWith({
    "al-fuqara": unresolved(
      "Who receives the money.",
      "Who receives the money you raise, and what is their situation?",
    ),
  });

  it("treats the claim as a question for the reviewer rather than as evidence", () => {
    const decision = evaluateEscalation(claimCampaign, claimFacts, mapping);

    if (!decision.escalate) {
      throw new Error("An unsupported eligibility claim must escalate.");
    }

    expect(decision.reasons.map((reason) => reason.kind)).toEqual(["claim_without_support"]);

    const [claim] = decision.reasons;

    expect(claim.question).toContain(claimQuote);
    expect(claim.question).toContain("On which basis");
    expect(claim.question.endsWith("?")).toBe(true);
  });

  it("cites the span where the campaign makes the claim", () => {
    const decision = evaluateEscalation(claimCampaign, claimFacts, mapping);

    if (!decision.escalate) {
      throw new Error("An unsupported eligibility claim must escalate.");
    }

    const [claim] = decision.reasons;
    const [citation] = claim.citations;

    expect(citation.quote).toBe(claimQuote);
    expect(claimCampaign.story.slice(citation.start, citation.end)).toBe(claimQuote);
  });

  it("stays silent once a category is supported, because the claim then rests on something", () => {
    const supported = mappingWith({
      "al-gharimin": {
        status: "supported",
        citations: [{ quote: "Our masjid runs an outreach programme", start: 0, end: 36 }],
        rationale: "The story states what the money funds.",
      },
    });

    expect(evaluateEscalation(claimCampaign, claimFacts, supported).escalate).toBe(false);
  });
});

describe("a campaign the story resolves nothing about", () => {
  const emptyCampaign: CampaignInput = {
    id: "cmp_0304",
    title: "Please help",
    story: "Please help us, we need support right now and every little bit counts.",
    category: "Community",
    goalAmount: 3000,
    currency: "GBP",
    organizer: { name: "Sara Malik", location: "Leeds, United Kingdom" },
  };

  const emptyFacts: ExtractedFacts = {
    beneficiary: { kind: "unclear", description: "Not stated." },
    statedPurposes: [],
    amountsMentioned: [],
    organizerRoleClaim: null,
    hardshipClaims: [{ claim: "Support is needed", quote: "we need support right now" }],
    explicitZakatClaim: { present: false, quote: null },
    fundRecipient: { recipient: "unstated", quote: null },
  };

  const mapping = mappingWith(
    Object.fromEntries(
      RECIPIENT_CATEGORY_IDS.map((id) => [
        id,
        unresolved("What this campaign is for.", "What will the money you raise be used for?"),
      ]),
    ),
  );

  it("asks the reviewer whether to engage at all", () => {
    const decision = evaluateEscalation(emptyCampaign, emptyFacts, mapping);

    if (!decision.escalate) {
      throw new Error("A campaign resolving nothing must escalate.");
    }

    expect(decision.reasons.map((reason) => reason.kind)).toEqual(["nothing_resolvable"]);

    const [nothing] = decision.reasons;

    expect(nothing.question).toContain("declined");
    expect(nothing.question.endsWith("?")).toBe(true);
    expect(nothing.citations).toEqual([]);
  });
});

const cleanCampaign: CampaignInput = {
  id: "cmp_0305",
  title: "Rent arrears for the Haruna household",
  story:
    "The Haruna household owe four months of rent and have had a possession notice served. They have no savings and one part-time wage between five people.",
  category: "Housing",
  goalAmount: 4200,
  currency: "GBP",
  organizer: { name: "Ifeoma Bello", location: "London, United Kingdom" },
};

const cleanFacts: ExtractedFacts = {
  beneficiary: { kind: "family_member", description: "The Haruna household." },
  statedPurposes: [{ purpose: "Clear rent arrears", quote: "owe four months of rent" }],
  amountsMentioned: [],
  organizerRoleClaim: null,
  hardshipClaims: [{ claim: "No savings", quote: "They have no savings" }],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "beneficiary_directly", quote: null },
};

const cleanMapping = mappingWith({
  "al-gharimin": {
    status: "supported",
    citations: [{ quote: "owe four months of rent", start: 22, end: 45 }],
    rationale: "The story names the debt, its age, and the enforcement step taken.",
  },
});

describe("a campaign with nothing to escalate", () => {
  it("does not escalate", () => {
    expect(evaluateEscalation(cleanCampaign, cleanFacts, cleanMapping).escalate).toBe(false);
  });

  /**
   * The `@ts-expect-error` line is the assertion, and `tsc --noEmit` runs it. A caller that
   * has not narrowed on `escalate` cannot reach for reasons that may not be there.
   */
  it("puts the reasons out of reach until the caller has narrowed on the refusal", () => {
    const decision = evaluateEscalation(cleanCampaign, cleanFacts, cleanMapping);

    // @ts-expect-error reasons exist only on a decision that escalates
    expect(decision.reasons).toBeUndefined();
  });
});

describe("evaluateEscalation", () => {
  it("returns the same decision for the same inputs", () => {
    const first = evaluateEscalation(waterCampaign, waterFacts, cleanMapping);
    const second = evaluateEscalation(waterCampaign, waterFacts, cleanMapping);

    expect(first).toEqual(second);
  });

  it("returns the same decision for the same escalating inputs", () => {
    const mapping = mappingWith({}, [
      {
        description: "Half the money goes to a family and half to a building fund.",
        citations: [{ quote: "The Haruna household owe four months of rent", start: 0, end: 43 }],
      },
    ]);

    expect(evaluateEscalation(cleanCampaign, cleanFacts, mapping)).toEqual(
      evaluateEscalation(cleanCampaign, cleanFacts, mapping),
    );
  });
});
