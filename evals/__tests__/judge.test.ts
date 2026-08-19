import { describe, expect, it } from "vitest";

import { scholarlyDifferenceById } from "../../src/lib/categories";
import { loadEvalFixtures } from "../../src/lib/eval-fixture";
import type { CategoryMapping } from "../../src/lib/mapping";
import {
  JUDGE_DIMENSIONS,
  JudgeError,
  judgeCorpus,
  judgeRecord,
  parseJudgeVerdict,
  reviewBrief,
  summarizeJudgements,
  type JudgeOutcome,
  type JudgeVerdict,
} from "../judge";
import { scoreFixture } from "../run";
import { QUIET_FACTS, agreeingMapping, modelReturning, modelThrowing } from "./subject-mocks";

const corpus = await loadEvalFixtures();
const fixture = corpus.find((entry) => entry.id === "eval_0002")!;

const score = await scoreFixture(fixture, {
  extraction: modelReturning(QUIET_FACTS),
  mapping: modelReturning(agreeingMapping(fixture)),
});

const mapping = score.mapping as CategoryMapping;

function verdict(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...Object.fromEntries(
      JUDGE_DIMENSIONS.map((id) => [id, { pass: true, reason: "The record holds up here." }]),
    ),
    ...overrides,
  };
}

describe("the judge parser", () => {
  it("accepts a verdict carrying every dimension", () => {
    const parsed = parseJudgeVerdict(verdict());

    expect(Object.keys(parsed).sort()).toEqual([...JUDGE_DIMENSIONS].sort());
    expect(parsed["no-ruling"].pass).toBe(true);
  });

  it("rejects a verdict that leaves a dimension out", () => {
    const partial = verdict();
    delete (partial as Record<string, unknown>)["no-ruling"];

    expect(() => parseJudgeVerdict(partial)).toThrow(JudgeError);
  });

  it("names the dimension and the rule when it rejects one", () => {
    const thrown = (() => {
      try {
        parseJudgeVerdict(verdict({ "no-ruling": { pass: true } }));
        return null;
      } catch (error: unknown) {
        return error as JudgeError;
      }
    })();

    expect(thrown?.reason).toBe("schema_validation_failed");
    expect(thrown?.message).toContain("no-ruling");
  });

  it("rejects a pass that is not a boolean", () => {
    expect(() =>
      parseJudgeVerdict(verdict({ "no-ruling": { pass: "yes", reason: "It reads fine to me." } })),
    ).toThrow(JudgeError);
  });

  /**
   * A judge writing paragraphs is a judge re-triaging the case, which is not what it was
   * asked for and is not what the report has room to print.
   */
  it("rejects a reason that is an account rather than a sentence", () => {
    const essay = {
      pass: false,
      reason:
        "The rationale on the debt category asserts more than the text carries. It also reads as a determination.",
    };

    expect(() => parseJudgeVerdict(verdict({ "no-ruling": essay }))).toThrow(JudgeError);
  });

  it("rejects a reason padded with whitespace", () => {
    expect(() =>
      parseJudgeVerdict(
        verdict({ "no-ruling": { pass: true, reason: "  Nothing here rules on anything.  " } }),
      ),
    ).toThrow(JudgeError);
  });

  it("rejects a reason too short to say anything", () => {
    expect(() =>
      parseJudgeVerdict(verdict({ "no-ruling": { pass: false, reason: "bad" } })),
    ).toThrow(JudgeError);
  });

  it("rejects a response that is not an object at all", () => {
    expect(() => parseJudgeVerdict("pass")).toThrow(JudgeError);
  });
});

describe("what the judge is shown", () => {
  const brief = reviewBrief(score.campaign, mapping);

  it("carries the campaign story and the record written about it", () => {
    expect(brief).toContain(fixture.story);
    expect(brief).toContain(mapping.categories["al-gharimin"].rationale);
  });

  /**
   * The absences are the design. A judge shown the expected answer grades agreement with it,
   * which the deterministic half measures better, and a judge shown adjudicated cases rewards
   * resemblance to them, which is what ADR-0004 keeps away from the mapping model.
   */
  it("carries nothing from the label", () => {
    expect(brief).not.toContain(fixture.label.notes);
    expect(brief).not.toContain(fixture.label.difficulty);
    expect(brief).not.toContain("expectedFindings");
    expect(brief).not.toContain("mustCiteSubstring");
  });

  /**
   * A flagged difference is real information about the record and belongs in the brief, but
   * the corpus summary behind it is human-authored policy text rather than anything the model
   * wrote. Passing it in would invite the judge to grade the corpus, and would put a page of
   * scholarly positions in front of a model whose one instruction is not to reason from them.
   */
  it("names a flagged difference without reproducing what the scholars hold", async () => {
    const flagged = await scoreFixture(fixture, {
      extraction: modelReturning(QUIET_FACTS),
      mapping: modelReturning(
        agreeingMapping(fixture, {
          "al-gharimin": {
            status: "supported",
            quotes: [fixture.label.expectedFindings["al-gharimin"].status === "supported"
              ? fixture.label.expectedFindings["al-gharimin"].mustCiteSubstring
              : fixture.story.slice(0, 30)],
            rationale: "The story states a debt the household says it cannot clear.",
            scholarlyDifference: {
              id: "gharimin-debt-conditions",
              whyThisApplies: "The campaign does not say whether the borrowing is already due.",
            },
          },
        }),
      ),
    });

    const withDifference = reviewBrief(
      flagged.campaign,
      flagged.mapping as CategoryMapping,
    );

    expect(withDifference).toContain("conditions on debt");
    expect(withDifference).toContain(
      "The campaign does not say whether the borrowing is already due.",
    );
    expect(withDifference).not.toContain(
      scholarlyDifferenceById("gharimin-debt-conditions").summary,
    );
    expect(withDifference).not.toContain("Dar al-Ifta");
  });
});

describe("asking the judge", () => {
  it("returns the parsed verdict when the response satisfies the rubric", async () => {
    const parsed = await judgeRecord(score.campaign, mapping, modelReturning(verdict()));

    expect(parsed["sendable-questions"].pass).toBe(true);
  });

  it("fails loudly on a response the rubric does not admit", async () => {
    const thrown = await judgeRecord(
      score.campaign,
      mapping,
      modelReturning(verdict({ "no-ruling": { pass: true, reason: "  padded  " } })),
    ).catch((error: unknown) => error as JudgeError);

    expect(thrown).toBeInstanceOf(JudgeError);
    expect((thrown as JudgeError).reason).toBe("schema_validation_failed");
  });

  it("distinguishes a failed judge call from a malformed verdict", async () => {
    const thrown = await judgeRecord(
      score.campaign,
      mapping,
      modelThrowing("connect ECONNREFUSED"),
    ).catch((error: unknown) => error as JudgeError);

    expect(thrown).toBeInstanceOf(JudgeError);
    expect((thrown as JudgeError).reason).toBe("model_call_failed");
  });
});

describe("adding the verdicts up", () => {
  const passing: JudgeOutcome = {
    fixtureId: "eval_0001",
    difficulty: "clean",
    verdict: parseJudgeVerdict(verdict()) as JudgeVerdict,
    error: null,
  };

  const ruling: JudgeOutcome = {
    fixtureId: "eval_0015",
    difficulty: "ambiguous",
    verdict: parseJudgeVerdict(
      verdict({
        "no-ruling": { pass: false, reason: "The rationale states which position is stronger." },
      }),
    ) as JudgeVerdict,
    error: null,
  };

  it("counts a failed dimension against that dimension only", () => {
    const summary = summarizeJudgements([passing, ruling], 0);

    expect(summary.failureCountByDimension["no-ruling"]).toBe(1);
    expect(summary.failureCountByDimension["sendable-questions"]).toBe(0);
    expect(summary.passRateByDimension["no-ruling"]).toBe(0.5);
    expect(summary.passRateByDimension["evidence-not-assertion"]).toBe(1);
  });

  it("carries the judge's own reason into the failure list", () => {
    const summary = summarizeJudgements([passing, ruling], 0);

    expect(summary.failures).toEqual([
      {
        fixtureId: "eval_0015",
        dimension: "no-ruling",
        reason: "The rationale states which position is stronger.",
      },
    ]);
  });

  /**
   * A judge that could not answer must not make the gate easier. Dropping the outcome would
   * shrink the denominator, which is the shape of a check that gets quieter the worse things
   * get.
   */
  it("counts a judge that could not answer as a failure on every dimension", () => {
    const broken: JudgeOutcome = {
      fixtureId: "eval_0007",
      difficulty: "flagged",
      verdict: null,
      error: "JudgeError: The judge call for campaign eval_0007 did not complete.",
    };

    const summary = summarizeJudgements([passing, broken], 0);

    expect(summary.failures).toHaveLength(JUDGE_DIMENSIONS.length);
    for (const dimension of JUDGE_DIMENSIONS) {
      expect(summary.passRateByDimension[dimension]).toBe(0.5);
    }
  });

  it("reports how much of the corpus the judge never saw", async () => {
    const failed = await scoreFixture(fixture, {
      extraction: modelReturning(QUIET_FACTS),
      mapping: modelThrowing("connect ECONNREFUSED"),
    });

    const summary = await judgeCorpus([score, failed], modelReturning(verdict()));

    expect(summary.skipped).toBe(1);
    expect(summary.outcomes.map((outcome) => outcome.fixtureId)).toEqual(["eval_0002"]);
  });

  it("captures a judge error onto its own fixture rather than losing the run", async () => {
    const summary = await judgeCorpus([score], modelThrowing("connect ECONNREFUSED"));

    expect(summary.outcomes[0].verdict).toBeNull();
    expect(summary.outcomes[0].error).toContain("JudgeError");
    expect(summary.failures).toHaveLength(JUDGE_DIMENSIONS.length);
  });
});
