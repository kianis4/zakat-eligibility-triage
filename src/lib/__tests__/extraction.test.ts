import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

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
  return modelReturningInTurn(payload);
}

/**
 * A model whose responses are scripted call by call, so a test can say what the re-ask gets.
 *
 * A call past the end of the script returns the last payload again rather than throwing, which
 * keeps a test that over-calls failing on the call count it is actually asserting instead of on
 * a mock that ran out.
 */
function modelReturningInTurn(...payloads: readonly unknown[]): MockLanguageModelV3 {
  let call = 0;

  return new MockLanguageModelV3({
    doGenerate: async () => {
      const payload = payloads[Math.min(call, payloads.length - 1)];
      call += 1;

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

const fabricatedQuote = {
  ...wellFormedFacts,
  hardshipClaims: [
    { claim: "The family was evicted", quote: "we were evicted from our home in February" },
  ],
};

const malformedResponse = { beneficiary: { kind: "self" } };

describe("extractFacts", () => {
  it("rejects a campaign that does not satisfy the input schema", async () => {
    const withoutStory = { ...campaign, story: undefined } as unknown as CampaignInput;

    await expect(extractFacts(withoutStory, modelReturning(wellFormedFacts))).rejects.toThrow(
      ZodError,
    );
  });

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

/**
 * One re-ask, with the validation failure named in it, and then the same error as before.
 *
 * The chances go from one to two and nothing else moves: the schema is the same schema, the
 * rules are the same rules, and a second failure throws what a first failure used to throw.
 * The call counts are asserted because the whole cost of this behaviour is the extra call, and
 * a loop that re-asks twice, or one that re-asks a call that never reached the provider, is the
 * failure mode worth pinning down.
 */
describe("extractFacts re-asking once", () => {
  it("recovers a fabricated quote on the second ask, with exactly two calls", async () => {
    const model = modelReturningInTurn(fabricatedQuote, wellFormedFacts);

    const facts = await extractFacts(campaign, model);

    expect(facts.hardshipClaims[0]?.quote).toBe("cannot repay it");
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("recovers a schema failure on the second ask, with exactly two calls", async () => {
    const model = modelReturningInTurn(malformedResponse, wellFormedFacts);

    const facts = await extractFacts(campaign, model);

    expect(facts.beneficiary.kind).toBe("family_member");
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("hands the model the quote it fabricated, in the second prompt", async () => {
    const model = modelReturningInTurn(fabricatedQuote, wellFormedFacts);
    await extractFacts(campaign, model);

    const retry = JSON.stringify(model.doGenerateCalls[1]?.prompt);

    expect(retry).toContain("quote_not_verbatim");
    expect(retry).toContain("hardshipClaims[0].quote");
    expect(retry).toContain("we were evicted from our home in February");
  });

  it("hands the model the schema issue it failed on, in the second prompt", async () => {
    const model = modelReturningInTurn(malformedResponse, wellFormedFacts);
    await extractFacts(campaign, model);

    const retry = JSON.stringify(model.doGenerateCalls[1]?.prompt);

    expect(retry).toContain("schema_validation_failed");
    expect(retry).toContain("beneficiary.description");
  });

  it("throws the same error as before when the second ask fails too", async () => {
    const model = modelReturningInTurn(fabricatedQuote, fabricatedQuote);

    const error = await extractFacts(campaign, model).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).reason).toBe("quote_not_verbatim");
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("names the underlying schema issues in the error it throws", async () => {
    const model = modelReturningInTurn(malformedResponse, malformedResponse);

    const error = await extractFacts(campaign, model).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).reason).toBe("schema_validation_failed");
    expect((error as ExtractionError).message).toContain("beneficiary.description");
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  /**
   * A call that never reached the provider produced no response to correct, so re-asking it
   * would be a retry of the transport rather than of the model's answer. The SDK owns that.
   */
  it("does not re-ask a call that failed to complete", async () => {
    const unreachable = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });

    const error = await extractFacts(campaign, unreachable).catch((thrown: unknown) => thrown);

    expect((error as ExtractionError).reason).toBe("model_call_failed");
    expect(unreachable.doGenerateCalls).toHaveLength(1);
  });
});
