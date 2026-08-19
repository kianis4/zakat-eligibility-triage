import { describe, expect, it } from "vitest";

import { EscalationDecision, type EscalationReason } from "../escalation";

const reason: EscalationReason = {
  kind: "mixed_use",
  question:
    "Which portion of the amount raised does each of those uses account for, and can the portion that is zakat eligible be ring-fenced from the rest?",
  citations: [{ quote: "clear that debt in full", start: 10, end: 33 }],
};

/**
 * The `@ts-expect-error` lines are the assertion here, and `tsc --noEmit` is what runs it.
 * A refusal with no reason on it is the shape this whole module exists to prevent: it is
 * the generic needs-review flag, and it would push the triage work back onto the reviewer
 * while still looking like an escalation.
 */
describe("a refusal with no reason on it is unrepresentable", () => {
  it("does not accept an escalating decision with no reasons field", () => {
    // @ts-expect-error a decision that escalates carries at least one reason
    const decision: EscalationDecision = { escalate: true };

    expect(EscalationDecision.safeParse(decision).success).toBe(false);
  });

  it("does not accept an escalating decision with an empty reason list", () => {
    const decision: EscalationDecision = {
      escalate: true,
      // @ts-expect-error a decision that escalates carries at least one reason
      reasons: [],
    };

    expect(EscalationDecision.safeParse(decision).success).toBe(false);
  });

  it("accepts an escalating decision carrying one reason", () => {
    const decision: EscalationDecision = { escalate: true, reasons: [reason] };

    expect(EscalationDecision.safeParse(decision).success).toBe(true);
  });

  it("accepts a decision that does not escalate", () => {
    const decision: EscalationDecision = { escalate: false };

    expect(EscalationDecision.safeParse(decision).success).toBe(true);
  });
});
