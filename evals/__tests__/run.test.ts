import { describe, expect, it } from "vitest";

import { loadEvalFixtures, type EvalFixture } from "../../src/lib/eval-fixture";
import type { CategoryMapping } from "../../src/lib/mapping";
import { scoreCitations, scoreCorpus, scoreFixture, summarize, type SubjectModels } from "../run";
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

  it("counts a supported finding citing the wrong part of the story as a citation violation", async () => {
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
    expect(score.citations.valid).toBe(score.citations.checked - 1);
    expect(score.citations.violations).toEqual([
      expect.objectContaining({ category: "al-fuqara", kind: "misses_expected_span" }),
    ]);
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
    const summary = await scoreCorpus([clean, withQuestions], {
      extraction: modelReturning(QUIET_FACTS),
      mapping: modelThrowing("connect ECONNREFUSED"),
    });

    expect(summary.fixtures).toHaveLength(2);
    expect(summary.fixtures.map((entry) => entry.id)).toEqual(["eval_0001", "eval_0002"]);
    expect(summary.categoryAgreementRate).toBe(0);
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

  it("reads an empty denominator as a vacuous pass rather than as NaN", async () => {
    const summary = summarize([await scoreFixture(clean, subject(agreeingMapping(clean)))]);

    expect(clean.label.expectedMissingEvidence).toHaveLength(0);
    expect(summary.missingEvidenceCoverageRate).toBe(1);
  });

  it("keeps fixture order regardless of the order the calls complete in", async () => {
    const summary = await scoreCorpus([split, clean, withQuestions], subject(agreeingMapping(clean)), 3);

    expect(summary.fixtures.map((entry) => entry.id)).toEqual([
      "eval_0006",
      "eval_0001",
      "eval_0002",
    ]);
  });
});
