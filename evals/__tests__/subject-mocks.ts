import { MockLanguageModelV3 } from "ai/test";

import { RECIPIENT_CATEGORY_IDS } from "../../src/lib/categories";
import type { EvalFixture } from "../../src/lib/eval-fixture";
import type { ExtractedFacts } from "../../src/lib/extraction";

/**
 * The mock-model shape the pipeline's own unit tests use, lifted so the harness tests drive
 * the real `extractFacts` and `mapCategories` rather than a reimplementation of them.
 *
 * Driving the real functions is the point. The harness is being tested on whether it counts
 * what it says it counts, and a fake pipeline would let the count be right about output no
 * pipeline produces.
 */
export function modelReturning(payload: unknown): MockLanguageModelV3 {
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

export function modelThrowing(message: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error(message);
    },
  });
}

/**
 * Facts that record nothing, so the escalation conditions that read them stay quiet.
 *
 * Two of the four refusal conditions are driven by extracted facts rather than by the
 * mapping, and a test about category agreement should not have to reason about them. A
 * beneficiary who is not `unclear` and no asserted eligibility leaves the gate to fire on the
 * mapping alone, which is what each escalation test then varies deliberately.
 */
export const QUIET_FACTS: ExtractedFacts = {
  beneficiary: { kind: "family_member", description: "The household the story names." },
  statedPurposes: [],
  amountsMentioned: [],
  organizerRoleClaim: null,
  hardshipClaims: [],
  explicitZakatClaim: { present: false, quote: null },
  fundRecipient: { recipient: "unstated", quote: null },
};

export type ModelFindingPayload = Record<string, unknown>;

/**
 * A model mapping that agrees with a fixture's label on every category.
 *
 * A supported finding quotes the label's own `mustCiteSubstring`, which the fixture schema
 * has already proved is a span of the story, so the agreeing case is agreeing on the citation
 * too rather than only on the status. Every test below starts from this and breaks one thing,
 * which is what makes the resulting count attributable to the break.
 *
 * The output is a flat `findings` array carrying its own category ids, which is the shape
 * `ModelMapping` accepts since the provider property-count limit forced the eight named
 * properties into a list. The overrides stay keyed by category because that is how a test
 * reads, and the builder does the transposing.
 */
export function agreeingMapping(
  fixture: EvalFixture,
  overrides: Record<string, ModelFindingPayload> = {},
  mixedUseSignals: readonly unknown[] = [],
) {
  const findings = RECIPIENT_CATEGORY_IDS.map((id) => {
    /**
     * `category` and `quotes` are supplied here rather than by each caller. Both are required
     * on every finding in the new shape, and neither is ever the thing a test is varying: an
     * override says what status and prose a category comes back with, and having to restate
     * its own id and an empty quote list beside that would be noise a reader has to check
     * past to find the one deliberate break.
     */
    if (overrides[id] !== undefined) {
      return { category: id, quotes: [], ...overrides[id] };
    }

    const expected = fixture.label.expectedFindings[id];

    if (expected.status === "supported") {
      return {
        category: id,
        status: "supported",
        quotes: [expected.mustCiteSubstring],
        rationale: "The quoted words state this directly.",
        scholarlyDifference: null,
      };
    }

    if (expected.status === "not_supported") {
      return {
        category: id,
        status: "not_supported",
        quotes: [],
        rationale: "The story says nothing bearing on this.",
        scholarlyDifference: null,
      };
    }

    return {
      category: id,
      status: "insufficient_evidence",
      quotes: [],
      rationale: "The story leaves this open.",
      missingFact: "What the story does not say about who receives the money.",
      questionForOrganizer: "Could you tell us who receives the money you raise?",
      scholarlyDifference: null,
    };
  });

  return { findings, mixedUseSignals };
}

/**
 * A mixed-use signal quoting a span the story really contains, built by slicing the story.
 *
 * A slice is verbatim by construction, so a test using this is varying the escalation gate
 * and nothing else. The description is fixed prose that clears `MixedUseDescription`.
 */
export function mixedUseSignal(fixture: EvalFixture) {
  return {
    description: "Rent arrears and shop stock are funded from the same appeal.",
    quotes: [fixture.story.slice(0, 40)],
  };
}
