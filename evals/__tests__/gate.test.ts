import { describe, expect, it } from "vitest";

import { GATES, evaluateGates, exitCode, failedGates } from "../gate";
import { JUDGE_DIMENSIONS, summarizeJudgements, type JudgeOutcome } from "../judge";
import { summarize, type FixtureScore } from "../run";
import { outcome, score } from "./score-builders";

function gatesFor(
  fixtures: readonly FixtureScore[],
  outcomes: readonly JudgeOutcome[] = fixtures.map((fixture) => outcome(fixture.id)),
) {
  return evaluateGates(summarize(fixtures), summarizeJudgements(outcomes, 0));
}

function sumAgreed(fixtures: readonly FixtureScore[]): number {
  return fixtures.reduce((total, fixture) => total + fixture.categoryAgreement.agreed, 0);
}

function gate(fixtures: readonly FixtureScore[], id: string, outcomes?: readonly JudgeOutcome[]) {
  const found = gatesFor(fixtures, outcomes).find((entry) => entry.id === id);

  if (found === undefined) {
    throw new Error(`No gate is evaluated under the id ${JSON.stringify(id)}.`);
  }

  return found;
}

const clean = [score("a"), score("b"), score("c"), score("d"), score("e")];

describe("a run that clears every threshold", () => {
  it("exits zero", () => {
    expect(exitCode(gatesFor(clean))).toBe(0);
  });

  it("reports no failed gate", () => {
    expect(failedGates(gatesFor(clean))).toEqual([]);
  });
});

describe("the citation gate", () => {
  /**
   * The one gate at 100 percent. A citation that does not resolve is not a quality regression
   * to be averaged away, it is a fabricated quote that looks identical to a real one on the
   * page, so a single one is the contract broken.
   */
  it("fails the build on one invalid citation out of ten", () => {
    const fixtures = [...clean.slice(1), score("a", { citationsValid: 1, citationsChecked: 2 })];

    expect(gate(fixtures, "citation-validity").passed).toBe(false);
    expect(exitCode(gatesFor(fixtures))).toBe(1);
  });

  it("says how far short it fell, in the units the gate is set in", () => {
    const fixtures = [...clean.slice(1), score("a", { citationsValid: 1, citationsChecked: 2 })];

    expect(gate(fixtures, "citation-validity").shortfall).toBe(
      "10.0 points below the 100.0% floor",
    );
    expect(gate(fixtures, "citation-validity").observed).toBe("90.0% (9 of 10)");
  });

  it("is set at exactly one, so nothing below it can pass", () => {
    expect(GATES.citationValidity).toBe(1);
  });
});

/**
 * Split out of citation-validity after a live run failed a build on one supported finding
 * that cited a real span of the right story for the right category, differing from the label
 * only about which words carried the point.
 */
describe("the citation anchoring gate", () => {
  it("holds at exactly the floor", () => {
    const fixtures = [
      score("a", { anchored: 9, anchorChecks: 10 }),
      score("b", { anchored: 9, anchorChecks: 10 }),
    ];

    expect(gate(fixtures, "citation-anchoring").observed).toBe("90.0% (18 of 20)");
    expect(gate(fixtures, "citation-anchoring").passed).toBe(true);
    expect(exitCode(gatesFor(fixtures))).toBe(0);
  });

  it("fails one miss below the floor", () => {
    const fixtures = [
      score("a", { anchored: 8, anchorChecks: 10 }),
      score("b", { anchored: 9, anchorChecks: 10 }),
    ];

    expect(gate(fixtures, "citation-anchoring").observed).toBe("85.0% (17 of 20)");
    expect(gate(fixtures, "citation-anchoring").passed).toBe(false);
    expect(exitCode(gatesFor(fixtures))).toBe(1);
  });

  /**
   * The whole point of the split. One anchoring miss used to fail the 100 percent validity
   * gate; it must now leave that gate alone.
   */
  it("does not touch citation validity", () => {
    const fixtures = [score("a", { anchored: 0, anchorChecks: 1 })];

    expect(gate(fixtures, "citation-validity").passed).toBe(true);
    expect(gate(fixtures, "citation-validity").observed).toBe("100.0% (2 of 2)");
    expect(failedGates(gatesFor(fixtures)).map((entry) => entry.id)).toEqual([
      "citation-anchoring",
    ]);
  });

  it("leaves an invalid citation on the validity gate and off this one", () => {
    const fixtures = [score("a", { citationsValid: 1, citationsChecked: 2 })];

    expect(gate(fixtures, "citation-anchoring").passed).toBe(true);
    expect(failedGates(gatesFor(fixtures)).map((entry) => entry.id)).toEqual(["citation-validity"]);
  });

  it("is set below one, so a single difference of reading cannot fail a build", () => {
    expect(GATES.citationAnchoring).toBeLessThan(1);
    expect(GATES.citationAnchoring).toBeGreaterThanOrEqual(0.9);
  });
});

describe("the category agreement gate", () => {
  it("holds at exactly the floor", () => {
    const fixtures = [score("a", { agreed: 8 }), score("b", { agreed: 8 }), score("c", { agreed: 8 }), score("d", { agreed: 8 }), score("e", { agreed: 0 })];

    expect(gate(fixtures, "category-agreement").observed).toBe("80.0% (32 of 40)");
    expect(gate(fixtures, "category-agreement").passed).toBe(true);
  });

  /**
   * The comment on `GATES.categoryAgreement` argues from a specific miss budget over the real
   * corpus, and a comment doing arithmetic is a comment that can be wrong about it. This pins
   * the boundary the comment claims, so the number and the justification cannot drift apart
   * again without a test going red.
   */
  it("tolerates exactly 28 misses across the corpus of 144 category judgments", () => {
    const spread = (misses: number) =>
      Array.from({ length: 18 }, (_, index) => {
        const taken = Math.min(8, Math.max(0, misses - index * 8));

        return score(`f${index}`, { agreed: 8 - taken });
      });

    const tolerated = spread(28);
    const tooMany = spread(29);

    expect(sumAgreed(tolerated)).toBe(144 - 28);
    expect(gate(tolerated, "category-agreement").observed).toBe("80.6% (116 of 144)");
    expect(gate(tolerated, "category-agreement").passed).toBe(true);

    expect(sumAgreed(tooMany)).toBe(144 - 29);
    expect(gate(tooMany, "category-agreement").observed).toBe("79.9% (115 of 144)");
    expect(gate(tooMany, "category-agreement").passed).toBe(false);
  });

  it("fails one category below the floor", () => {
    const fixtures = [score("a", { agreed: 7 }), score("b", { agreed: 8 }), score("c", { agreed: 8 }), score("d", { agreed: 8 }), score("e", { agreed: 0 })];

    expect(gate(fixtures, "category-agreement").observed).toBe("77.5% (31 of 40)");
    expect(gate(fixtures, "category-agreement").passed).toBe(false);
  });
});

describe("the escalation gate", () => {
  it("holds at three fixtures in four", () => {
    const fixtures = [
      score("a"),
      score("b"),
      score("c"),
      score("d", { escalationPassed: false }),
    ];

    expect(gate(fixtures, "escalation-agreement").passed).toBe(true);
  });

  it("fails at two in four", () => {
    const fixtures = [
      score("a"),
      score("b"),
      score("c", { escalationPassed: false }),
      score("d", { escalationPassed: false }),
    ];

    expect(gate(fixtures, "escalation-agreement").passed).toBe(false);
  });
});

describe("the missing-evidence gate", () => {
  it("fails when a fifth of the expected questions never got asked", () => {
    const fixtures = [
      score("a", { covered: 3, expectedQuestions: 5 }),
      score("b", { covered: 5, expectedQuestions: 5 }),
    ];

    expect(gate(fixtures, "missing-evidence-coverage").observed).toBe("80.0% (8 of 10)");
    expect(gate(fixtures, "missing-evidence-coverage").passed).toBe(true);

    const worse = [score("a", { covered: 2, expectedQuestions: 5 }), fixtures[1]];

    expect(gate(worse, "missing-evidence-coverage").passed).toBe(false);
  });
});

describe("the judge gates", () => {
  /**
   * ADR-0001 is the product, so the one dimension that names it is a stop rather than a
   * measurement. A percentage bar here would price one record in seven settling a scholarly
   * difference as acceptable.
   */
  it("fails the build on a single adjudicating record, whatever the rate", () => {
    const outcomes = [
      ...Array.from({ length: 19 }, (_, index) => outcome(`f${index}`)),
      outcome("f19", ["no-ruling"]),
    ];

    const ruling = gate(clean, "judge/no-ruling", outcomes);

    expect(ruling.passed).toBe(false);
    expect(ruling.observed).toBe("1 of 20 judged records");
    expect(exitCode(gatesFor(clean, outcomes))).toBe(1);
  });

  it("gates each of the other three on its own rather than pooling them", () => {
    const outcomes = [
      outcome("a", ["sendable-questions"]),
      outcome("b", ["sendable-questions"]),
      outcome("c"),
      outcome("d"),
      outcome("e"),
    ];

    expect(gate(clean, "judge/sendable-questions", outcomes).passed).toBe(false);
    expect(gate(clean, "judge/evidence-not-assertion", outcomes).passed).toBe(true);
    expect(gate(clean, "judge/unresolved-only-where-engaged", outcomes).passed).toBe(true);
  });

  it("holds a dimension at the floor", () => {
    const outcomes = [
      ...Array.from({ length: 17 }, (_, index) => outcome(`f${index}`)),
      outcome("f17", ["sendable-questions"]),
      outcome("f18", ["sendable-questions"]),
      outcome("f19", ["sendable-questions"]),
    ];

    expect(gate(clean, "judge/sendable-questions", outcomes).observed).toBe("85.0% (17 of 20)");
    expect(gate(clean, "judge/sendable-questions", outcomes).passed).toBe(true);
  });
});

/**
 * A build that reports one broken gate sends someone back for a second run to find the next
 * one, which on a harness that costs a full corpus of model calls is an expensive way to
 * learn something the first run already knew.
 */
describe("a run that breaks several things at once", () => {
  it("reports every failure rather than stopping at the first", () => {
    const fixtures = [
      score("a", { agreed: 0, citationsValid: 0, citationsChecked: 2, escalationPassed: false }),
      score("b", { agreed: 0, escalationPassed: false }),
      score("c", { agreed: 0, escalationPassed: false }),
      score("d"),
      score("e"),
    ];

    const failures = failedGates(gatesFor(fixtures)).map((entry) => entry.id);

    expect(failures).toEqual(
      expect.arrayContaining(["citation-validity", "category-agreement", "escalation-agreement"]),
    );
    expect(exitCode(gatesFor(fixtures))).toBe(1);
  });

  it("evaluates one gate per deterministic dimension, one per judge dimension, and the judge-responded gate", () => {
    expect(gatesFor(clean)).toHaveLength(5 + 1 + JUDGE_DIMENSIONS.length);
  });
});

/**
 * The gate the first live run did not have. Twelve of sixteen records failed to parse, and
 * with nowhere of their own to be counted they were charged as failures on all four
 * dimensions, so the report announced twelve rulings by a pipeline that had issued none.
 */
describe("the judge-responded gate", () => {
  function unanswered(count: number): JudgeOutcome[] {
    return Array.from({ length: 18 }, (_, index) =>
      index < count
        ? {
            fixtureId: `f${index}`,
            difficulty: "clean" as const,
            verdict: null,
            error: "JudgeError: The judge response did not satisfy the rubric schema.",
          }
        : outcome(`f${index}`),
    );
  }

  it("tolerates two unjudged records", () => {
    const responded = gate(clean, "judge/responded", unanswered(2));

    expect(responded.observed).toBe("2 of 18 records unjudged");
    expect(responded.passed).toBe(true);
    expect(exitCode(gatesFor(clean, unanswered(2)))).toBe(0);
  });

  it("flips the build at three", () => {
    const responded = gate(clean, "judge/responded", unanswered(3));

    expect(responded.passed).toBe(false);
    expect(responded.shortfall).toContain("3 records produced no usable verdict");
    expect(exitCode(gatesFor(clean, unanswered(3)))).toBe(1);
  });

  /**
   * The behavioural gates must stay quiet while the infrastructure gate speaks. This is the
   * whole point of the split: an unanswered record is not evidence that the pipeline ruled on
   * anything.
   */
  it("does not turn unjudged records into dimension failures", () => {
    const gates = gatesFor(clean, unanswered(12));
    const failed = failedGates(gates).map((entry) => entry.id);

    expect(failed).toEqual(["judge/responded"]);
    expect(gate(clean, "judge/no-ruling", unanswered(12)).passed).toBe(true);
    expect(gate(clean, "judge/no-ruling", unanswered(12)).observed).toBe("0 of 6 judged records");
  });

  it("computes the dimension rates over the records that were judged", () => {
    const outcomes = [
      ...unanswered(2).slice(0, 2),
      ...Array.from({ length: 15 }, (_, index) => outcome(`g${index}`)),
      outcome("g15", ["sendable-questions"]),
    ];

    expect(gate(clean, "judge/sendable-questions", outcomes).observed).toBe("93.8% (15 of 16)");
  });
});
