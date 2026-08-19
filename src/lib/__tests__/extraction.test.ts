import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { CampaignInput } from "../campaign";
import { ExtractionError, extractFacts } from "../extraction";

const campaign: CampaignInput = {
  id: "cmp_0042",
  title: "Help the Haddad family clear their hospital debt",
  story:
    "My sister Rania was hospitalised for four months last winter. The family borrowed 9,000 JOD from relatives to cover the treatment and cannot repay it. I am collecting on her behalf and the funds will go directly to the hospital.",
  category: "Medical",
  goalAmount: 9000,
  currency: "JOD",
  organizer: {
    name: "Yusuf Haddad",
    location: "Irbid, Jordan",
    relationshipToBeneficiary: "brother",
  },
};

const wellFormedFacts = {
  beneficiary: {
    kind: "family_member",
    description: "The organizer's sister Rania and the wider Haddad family.",
  },
  statedPurposes: [
    {
      purpose: "Repay money borrowed for hospital treatment",
      quote: "borrowed 9,000 JOD from relatives to cover the treatment and cannot repay it",
    },
  ],
  amountsMentioned: [
    {
      amount: 9000,
      currency: "JOD",
      quote: "borrowed 9,000 JOD from relatives",
    },
  ],
  organizerRoleClaim: {
    claim: "Brother of the beneficiary, collecting on her behalf",
    quote: "I am collecting on her behalf",
  },
  hardshipClaims: [
    {
      claim: "Outstanding debt the family cannot repay",
      quote: "cannot repay it",
    },
  ],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "organization", quote: "the funds will go directly to the hospital" },
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

describe("extractFacts", () => {
  it("returns typed facts when the model responds with verbatim quotes", async () => {
    const facts = await extractFacts(campaign, modelReturning(wellFormedFacts));

    expect(facts.beneficiary.kind).toBe("family_member");
    expect(facts.statedPurposes).toHaveLength(1);
    expect(facts.amountsMentioned[0]?.amount).toBe(9000);
    expect(facts.organizerRoleClaim?.quote).toBe("I am collecting on her behalf");
    expect(facts.explicitZakatClaim.present).toBe(false);
    expect(facts.fundRecipient.recipient).toBe("organization");
  });

  it("sends the story to the model so quotes can be drawn from it", async () => {
    const model = modelReturning(wellFormedFacts);
    await extractFacts(campaign, model);

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
      "hospitalised for four months",
    );
  });

  it("throws on a response that does not satisfy the schema", async () => {
    const malformed = {
      ...wellFormedFacts,
      beneficiary: { kind: "the whole neighbourhood", description: 7 },
      amountsMentioned: "nine thousand dinars",
    };

    await expect(extractFacts(campaign, modelReturning(malformed))).rejects.toThrow(
      ExtractionError,
    );
  });

  it("reports schema failure as the reason rather than coercing the response", async () => {
    const malformed = { beneficiary: { kind: "self" } };

    const error = await extractFacts(campaign, modelReturning(malformed)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).reason).toBe("schema_validation_failed");
  });

  it("distinguishes a failed model call from a malformed response", async () => {
    const unreachable = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });

    const error = await extractFacts(campaign, unreachable).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).reason).toBe("model_call_failed");
  });

  it("throws when a schema-valid quote is not a verbatim span of the story", async () => {
    const fabricated = {
      ...wellFormedFacts,
      hardshipClaims: [
        {
          claim: "The family was evicted",
          quote: "we were evicted from our home in February",
        },
      ],
    };

    const error = await extractFacts(campaign, modelReturning(fabricated)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).reason).toBe("quote_not_verbatim");
    expect((error as ExtractionError).message).toContain("hardshipClaims[0].quote");
  });

  it("checks nullable quote fields too", async () => {
    const fabricated = {
      ...wellFormedFacts,
      explicitZakatClaim: { present: true, quote: "this campaign is zakat eligible" },
    };

    const error = await extractFacts(campaign, modelReturning(fabricated)).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).reason).toBe("quote_not_verbatim");
    expect((error as ExtractionError).message).toContain("explicitZakatClaim.quote");
  });

  it("names every offending quote, not only the first", async () => {
    const fabricated = {
      ...wellFormedFacts,
      statedPurposes: [
        { purpose: "Buy a car", quote: "we need a car" },
        { purpose: "Pay tuition", quote: "tuition is due in March" },
      ],
    };

    const error = (await extractFacts(campaign, modelReturning(fabricated)).catch(
      (thrown: unknown) => thrown,
    )) as ExtractionError;

    expect(error.message).toContain("statedPurposes[0].quote");
    expect(error.message).toContain("statedPurposes[1].quote");
  });
});
