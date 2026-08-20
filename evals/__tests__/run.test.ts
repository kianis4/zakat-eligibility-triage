import { describe, expect, it } from "vitest";

import {
  MINIMUM_CORPUS_SIZE,
  loadEvalFixtures,
  type EvalFixture,
} from "../../src/lib/eval-fixture";
import type { CategoryMapping } from "../../src/lib/mapping";
import {
  assertCorpusIsWhole,
  scoreCitations,
  scoreCorpus,
  scoreFixture,
  summarize,
  type SubjectModels,
} from "../run";
import { score as syntheticScore } from "./score-builders";
import {
  QUIET_FACTS,
  agreeingMapping,
  mixedUseSignal,
  modelReturning,
  modelThrowing,
  type ModelFindingPayload,
} from "./subject-mocks";

const corpus = await loadEvalFixtures();

function fixture(id: string): EvalFixture {
  const found = corpus.find((entry) => entry.id === id);

  if (found === undefined) {
    throw new Error(`The corpus holds no fixture with the id ${JSON.stringify(id)}.`);
  }

  return found;
}

function subject(mapping: unknown): SubjectModels {
  return {
    extraction: modelReturning(QUIET_FACTS),
    mapping: modelReturning(mapping),
  };
}

/**
 * A clean case with two supported categories, no expected refusal and no expected question,
 * which is the smallest fixture that can move all four deterministic dimensions.
 */
const clean = fixture("eval_0001");

/**
 * A clean case that does expect two organizer questions, which is the only way to see the
 * coverage dimension count something rather than pass vacuously.
 */
const withQuestions = fixture("eval_0002");

/**
 * A flagged case labelled as splitting its money, which is the case where the escalation
 * dimension can be seen agreeing rather than only disagreeing.
 */
const split = fixture("eval_0006");

describe("scoring a fixture the pipeline agrees with", () => {
  it("agrees on all eight categories", async () => {
    const score = await scoreFixture(clean, subject(agreeingMapping(clean)));

    expect(score.outcome).toBe("scored");
    expect(score.categoryAgreement).toEqual({ agreed: 8, total: 8, disagreements: [] });
  });

  it("finds every citation valid", async () => {
    const score = await scoreFixture(clean, subject(agreeingMapping(clean)));

    expect(score.citations.violations).toEqual([]);
    expect(score.citations.checked).toBeGreaterThan(0);
    expect(score.citations.valid).toBe(score.citations.checked);
  });

  it("agrees on the absence of a refusal", async () => {
    const score = await scoreFixture(clean, subject(agreeingMapping(clean)));

    expect(score.escalation).toEqual({ passed: true, expected: [], actual: [] });
  });

  it("covers every category the label expects a question on", async () => {
    const score = await scoreFixture(withQuestions, subject(agreeingMapping(withQuestions)));

    expect(score.missingEvidence).toEqual({ covered: 2, expected: 2, uncovered: [] });
  });
});

describe("scoring a fixture the pipeline reads differently", () => {
  /**
   * The direction of the disagreement is recorded, not only that there was one. A label
   * expecting `supported` against a pipeline saying `not_supported` is a recall failure, and
   * the reverse is an over-claim, and a harness reporting one number for both would hide the
   * distinction the corpus was written to expose.
   */
  it("counts a category the mapping misses as a disagreement", async () => {
    const missed: Record<string, ModelFindingPayload> = {
      "al-fuqara": {
        status: "not_supported",
        rationale: "The story says nothing bearing on this.",
        scholarlyDifference: null,
      },
    };

    const score = await scoreFixture(clean, subject(agreeingMapping(clean, missed)));

    expect(score.categoryAgreement.agreed).toBe(7);
    expect(score.categoryAgreement.disagreements).toEqual([
      { category: "al-fuqara", expected: "supported", actual: "not_supported" },
    ]);
  });

  /**
   * The case that forced validity and anchoring apart. The finding is on the right category,
   * its quote is a real span of the story, and it resolves byte-exact. The only thing wrong
   * with it is that the label had different words in mind, which is a disagreement about
   * which sentence carries the support and not a fabricated citation.
   */
  it("counts a true citation the label did not anticipate against anchoring alone", async () => {
    const elsewhere: Record<string, ModelFindingPayload> = {
      "al-fuqara": {
        status: "supported",
        quotes: [clean.story.slice(0, 30)],
        rationale: "The quoted words state this directly.",
        scholarlyDifference: null,
      },
    };

    const score = await scoreFixture(clean, subject(agreeingMapping(clean, elsewhere)));

    expect(score.categoryAgreement.agreed).toBe(8);
    expect(score.citations.violations).toEqual([]);
    expect(score.citations.valid).toBe(score.citations.checked);
    expect(score.anchoring.anchored).toBe(score.anchoring.checked - 1);
    expect(score.anchoring.misses).toEqual([
      {
        category: "al-fuqara",
        expected: clean.label.expectedFindings["al-fuqara"].status === "supported"
          ? clean.label.expectedFindings["al-fuqara"].mustCiteSubstring
          : "",
        nearest: clean.story.slice(0, 30),
      },
    ]);
  });

  it("keeps a fabricated quote on validity and off anchoring", async () => {
    const fabricated: Record<string, ModelFindingPayload> = {
      "al-fuqara": {
        status: "supported",
        quotes: ["the household has been destitute since 2019"],
        rationale: "The story states a long-standing hardship.",
        scholarlyDifference: null,
      },
    };

    const score = await scoreFixture(clean, subject(agreeingMapping(clean, fabricated)));

    expect(score.citations.valid).toBe(0);
    expect(score.citations.violations).toEqual([
      expect.objectContaining({ kind: "unresolvable" }),
    ]);
    expect(score.anchoring).toEqual({ checked: 0, anchored: 0, misses: [] });
  });

  it("counts a citation landing on the expected span as anchored", async () => {
    const score = await scoreFixture(clean, subject(agreeingMapping(clean)));

    expect(score.anchoring.checked).toBe(2);
    expect(score.anchoring.anchored).toBe(2);
    expect(score.anchoring.misses).toEqual([]);
  });

  /**
   * Anchoring is only asked where the two already agree the category is supported. Where they
   * do not, that is a category disagreement and is counted there; charging it here as well
   * would move two gates for one reading error.
   */
  it("asks nothing of anchoring on a category the label does not call supported", async () => {
    const overClaimed: Record<string, ModelFindingPayload> = {
      "al-gharimin": {
        status: "supported",
        quotes: [clean.story.slice(0, 30)],
        rationale: "The quoted words state this directly.",
        scholarlyDifference: null,
      },
    };

    const score = await scoreFixture(clean, subject(agreeingMapping(clean, overClaimed)));

    expect(score.categoryAgreement.agreed).toBe(7);
    expect(score.anchoring.checked).toBe(2);
    expect(score.anchoring.misses).toEqual([]);
  });

  it("counts an unexpected refusal as an escalation disagreement", async () => {
    const score = await scoreFixture(
      clean,
      subject(agreeingMapping(clean, {}, [mixedUseSignal(clean)])),
    );

    expect(score.escalation).toEqual({ passed: false, expected: [], actual: ["mixed_use"] });
  });

  it("counts the expected refusal kinds matching exactly as agreement", async () => {
    const score = await scoreFixture(
      split,
      subject(agreeingMapping(split, {}, [mixedUseSignal(split)])),
    );

    expect(score.escalation).toEqual({
      passed: true,
      expected: ["mixed_use"],
      actual: ["mixed_use"],
    });
  });

  it("counts a category the report never asks about as uncovered", async () => {
    const resolved: Record<string, ModelFindingPayload> = {
      "al-fuqara": {
        status: "not_supported",
        rationale: "The story says nothing bearing on this.",
        scholarlyDifference: null,
      },
      "al-masakin": {
        status: "not_supported",
        rationale: "The story says nothing bearing on this.",
        scholarlyDifference: null,
      },
    };

    const score = await scoreFixture(withQuestions, subject(agreeingMapping(withQuestions, resolved)));

    expect(score.missingEvidence).toEqual({
      covered: 0,
      expected: 2,
      uncovered: ["al-fuqara", "al-masakin"],
    });
  });
});

/**
 * The byte-exactness check is the one assertion the pipeline cannot be made to fail, because
 * `resolveCitation` computes the offsets by exact search. Reaching the scorer directly with
 * offsets moved by hand is the only way to know the check would fire if it ever could, and a
 * check nobody has evidence about is not a check.
 */
describe("the end-to-end citation check", () => {
  it("catches a citation whose offsets do not slice its own quote out of the story", async () => {
    const score = await scoreFixture(clean, subject(agreeingMapping(clean)));
    const mapping = score.mapping as CategoryMapping;
    const finding = mapping.categories["al-fuqara"];

    expect(finding.status).toBe("supported");
    if (finding.status !== "supported") return;

    const [citation] = finding.citations;
    const shifted: CategoryMapping = {
      ...mapping,
      categories: {
        ...mapping.categories,
        "al-fuqara": {
          ...finding,
          citations: [{ ...citation, start: citation.start + 1, end: citation.end + 1 }],
        },
      },
    };

    const rescored = scoreCitations(clean, shifted);

    expect(rescored.violations).toEqual([
      expect.objectContaining({ category: "al-fuqara", kind: "not_verbatim" }),
    ]);
  });

  it("passes the same mapping with its offsets left alone", async () => {
    const score = await scoreFixture(clean, subject(agreeingMapping(clean)));

    expect(scoreCitations(clean, score.mapping as CategoryMapping).violations).toEqual([]);
  });
});

describe("a fixture the pipeline throws on", () => {
  it("is a counted failure rather than a crash", async () => {
    const score = await scoreFixture(clean, {
      extraction: modelReturning(QUIET_FACTS),
      mapping: modelThrowing("connect ECONNREFUSED"),
    });

    expect(score.outcome).toBe("failed");
    expect(score.failure).toContain("MappingError");
    expect(score.categoryAgreement.agreed).toBe(0);
    expect(score.escalation.passed).toBe(false);
    expect(score.mapping).toBeNull();
  });

  it("counts a schema failure as a failure on every dimension", async () => {
    const uncited: Record<string, ModelFindingPayload> = {
      "al-fuqara": {
        status: "supported",
        quotes: [],
        rationale: "The household has nothing left.",
        scholarlyDifference: null,
      },
    };

    const score = await scoreFixture(withQuestions, subject(agreeingMapping(withQuestions, uncited)));

    expect(score.outcome).toBe("failed");
    expect(score.failure).toContain("MappingError");
    expect(score.categoryAgreement.agreed).toBe(0);
    expect(score.missingEvidence).toEqual({
      covered: 0,
      expected: 2,
      uncovered: ["al-fuqara", "al-masakin"],
    });
  });

  /**
   * A quote the mapping stage cannot find is the citation contract failing one step earlier
   * than the harness looks. It is charged to the citation gate rather than disappearing into
   * a fixture-level error, because the gate that exists to catch a broken citation should be
   * the gate that catches this one.
   */
  it("charges an unresolvable quote to the citation gate", async () => {
    const fabricated: Record<string, ModelFindingPayload> = {
      "al-fuqara": {
        status: "supported",
        quotes: ["the household has been destitute since 2019"],
        rationale: "The story states a long-standing hardship.",
        scholarlyDifference: null,
      },
    };

    const score = await scoreFixture(clean, subject(agreeingMapping(clean, fabricated)));

    expect(score.outcome).toBe("failed");
    expect(score.citations).toEqual({
      checked: 1,
      valid: 0,
      violations: [expect.objectContaining({ kind: "unresolvable" })],
    });
  });

  it("does not stop the fixtures beside it being scored", async () => {
    const summary = await scoreCorpus(corpus, {
      extraction: modelReturning(QUIET_FACTS),
      mapping: modelThrowing("connect ECONNREFUSED"),
    });

    expect(summary.fixtures).toHaveLength(corpus.length);
    expect(summary.fixtures.every((entry) => entry.outcome === "failed")).toBe(true);
    expect(summary.categoryAgreementRate).toBe(0);
  });
});

/**
 * The hole this closes had the worst available shape: an emptied fixtures directory took
 * every gate green in about a second, because all four rates read an empty denominator as a
 * vacuous pass and there was nothing left to fail the non-vacuous ones.
 */
describe("a corpus too small to be the corpus the gates were set against", () => {
  it("refuses to score an empty corpus", async () => {
    await expect(scoreCorpus([], subject(agreeingMapping(clean)))).rejects.toThrow(
      /holds 0 fixtures, and the gate requires at least 14/,
    );
  });

  it("refuses to score one fixture short of the floor", async () => {
    const thirteen = corpus.slice(0, MINIMUM_CORPUS_SIZE - 1);

    expect(thirteen).toHaveLength(13);
    await expect(scoreCorpus(thirteen, subject(agreeingMapping(clean)))).rejects.toThrow(
      /holds 13 fixtures, and the gate requires at least 14/,
    );
  });

  it("scores a corpus exactly at the floor", () => {
    expect(() => assertCorpusIsWhole(corpus.slice(0, MINIMUM_CORPUS_SIZE))).not.toThrow();
  });

  it("is the same floor the corpus test pins, not a second opinion about it", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(MINIMUM_CORPUS_SIZE);
  });
});

describe("the pooled rates the gates read", () => {
  it("pools category agreement over categories rather than over fixtures", async () => {
    const missed: Record<string, ModelFindingPayload> = {
      "al-fuqara": {
        status: "not_supported",
        rationale: "The story says nothing bearing on this.",
        scholarlyDifference: null,
      },
    };

    const summary = summarize([
      await scoreFixture(clean, subject(agreeingMapping(clean, missed))),
      await scoreFixture(withQuestions, subject(agreeingMapping(withQuestions))),
    ]);

    expect(summary.categoryAgreementRate).toBeCloseTo(15 / 16, 10);
    expect(summary.escalationAgreementRate).toBe(1);
    expect(summary.citationValidityRate).toBe(1);
  });

  /**
   * Stated over a constructed score rather than over a fixture that happens to expect no
   * questions. This test used to name eval_0001 and assert its label was empty, which made a
   * claim about `rate` depend on a label the corpus is free to change; when a later issue
   * opened al-gharimin on that fixture, a correct arithmetic property failed for a reason that
   * had nothing to do with the arithmetic.
   */
  it("reads an empty denominator as a vacuous pass rather than as NaN", () => {
    const summary = summarize([syntheticScore("synthetic", { covered: 0, expectedQuestions: 0 })]);

    expect(summary.missingEvidenceCoverageRate).toBe(1);
    expect(Number.isNaN(summary.missingEvidenceCoverageRate)).toBe(false);
  });

  it("keeps fixture order regardless of the order the calls complete in", async () => {
    const summary = await scoreCorpus(corpus, subject(agreeingMapping(clean)), 6);

    expect(summary.fixtures.map((entry) => entry.id)).toEqual(corpus.map((entry) => entry.id));
  });
});
