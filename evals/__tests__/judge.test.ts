import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import { scholarlyDifferenceById } from "../../src/lib/categories";
import { loadEvalFixtures } from "../../src/lib/eval-fixture";
import type { CategoryMapping } from "../../src/lib/mapping";
import {
  JUDGE_DIMENSIONS,
  JUDGE_RUBRIC,
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
import {
  QUIET_FACTS,
  agreeingMapping,
  modelReturning,
  modelReturningInSequence,
  modelThrowing,
} from "./subject-mocks";

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
   * The rule this replaces rejected 12 of 16 records on the first live run, over the shape of
   * the prose rather than the substance of the judgment. The booleans are the contract and
   * the reason is diagnostic prose, so a two-sentence explanation is now a fine explanation.
   */
  it("accepts a reason that runs to two sentences", () => {
    const twoSentences = {
      pass: false,
      reason:
        "The rationale on the debt category asserts more than the text carries. It also reads as a determination.",
    };

    expect(parseJudgeVerdict(verdict({ "no-ruling": twoSentences }))["no-ruling"].pass).toBe(
      false,
    );
  });

  /**
   * Quoting the phrase under objection is what makes a reason checkable against the record,
   * so nothing here forbids quotation marks. That is the opposite of the rule the pipeline's
   * own model prose lives under, and deliberately: this text reaches a report, never a
   * reviewer or an organizer.
   */
  it("accepts a reason quoting the phrase it objects to", () => {
    const quoting = {
      pass: false,
      reason: 'The rationale calls the figures "concrete subsistence-level evidence", which the story never states.',
    };

    expect(parseJudgeVerdict(verdict({ "no-ruling": quoting }))["no-ruling"].pass).toBe(false);
  });

  it("rejects a reason long enough to be a second opinion on the campaign", () => {
    const essay = { pass: false, reason: `The record ${"drifts and asserts ".repeat(30)}.` };

    expect(essay.reason.length).toBeGreaterThan(400);
    expect(() => parseJudgeVerdict(verdict({ "no-ruling": essay }))).toThrow(JudgeError);
  });

  it("rejects an empty reason", () => {
    expect(() => parseJudgeVerdict(verdict({ "no-ruling": { pass: false, reason: "" } }))).toThrow(
      JudgeError,
    );
  });

  it("rejects a response that is not an object at all", () => {
    expect(() => parseJudgeVerdict("pass")).toThrow(JudgeError);
  });
});

/**
 * The rubric is prose sent to a model, so nothing compiles it against the definition it is
 * meant to test. That is how it came to say the opposite: it was written before the three
 * statuses were pinned in `CategoryFinding`, and the first live run failed records for
 * behaviour the pinned definition calls correct. These assertions are the cheapest available
 * standing check that the two have not drifted apart again.
 */
describe("the rubric against the status definition it tests", () => {
  const boundary = JUDGE_RUBRIC.find(
    (dimension) => dimension.id === "unresolved-only-where-engaged",
  );

  it("is carried on a dimension the gates and the report can index", () => {
    expect(boundary).toBeDefined();
    expect(JUDGE_DIMENSIONS).toContain("unresolved-only-where-engaged");
  });

  it("calls closing an unengaged category correct rather than a failure", () => {
    expect(boundary?.criterion).toContain("correctly closed as not_supported");
    expect(boundary?.criterion).toContain("must not be reported as one");
  });

  it("fails a category the story engages being settled instead of left unresolved", () => {
    expect(boundary?.criterion).toContain("engage or gesture at");
    expect(boundary?.criterion).toContain("left insufficient_evidence");
  });

  it("fails a closure justified by facts the story does not state", () => {
    expect(boundary?.criterion).toContain("asserting facts the story does not state");
  });

  /**
   * The rule that produced the false positives, in the words it used. A rubric telling the
   * judge that silence belongs in insufficient_evidence contradicts the pinned definition,
   * whichever dimension it is written on.
   */
  it("nowhere tells the judge that an unraised category should be left unresolved", () => {
    for (const dimension of JUDGE_RUBRIC) {
      expect(dimension.criterion).not.toContain("does not speak to a category");
      expect(dimension.criterion).not.toContain("leaves it unresolved");
    }
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

  const malformed = verdict({ "no-ruling": { pass: true, reason: "" } });

  /**
   * The repair pass. A malformed response is usually a formatting slip beside sound
   * judgments, and the first live run threw away most of a corpus of them, so a rejection now
   * buys one more attempt with the validation error quoted back.
   */
  it("retries once with the validation error when the first response is malformed", async () => {
    const { model, prompts } = modelReturningInSequence([malformed, verdict()]);

    const parsed = await judgeRecord(score.campaign, mapping, model);

    expect(parsed["no-ruling"].pass).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).not.toContain("rejected before it could be recorded");
    expect(prompts[1]).toContain("rejected before it could be recorded");
  });

  it("tells the retry which rule the first response broke", async () => {
    const { model, prompts } = modelReturningInSequence([malformed, verdict()]);

    await judgeRecord(score.campaign, mapping, model);

    expect(prompts[1]).toContain("no-ruling");
  });

  it("still carries the record under review into the retry", async () => {
    const { model, prompts } = modelReturningInSequence([malformed, verdict()]);

    await judgeRecord(score.campaign, mapping, model);

    expect(prompts[1]).toContain(fixture.story.slice(0, 60));
  });

  /**
   * Once, not until it works. A retry loop turns a persistently broken judge into a slow
   * expensive one that eventually says something, and the point of counting judge errors is
   * to see the judge is broken rather than to grind past it.
   */
  it("fails loudly when the retry is malformed too, without asking a third time", async () => {
    const { model, prompts } = modelReturningInSequence([malformed]);

    const thrown = await judgeRecord(score.campaign, mapping, model).catch(
      (error: unknown) => error as JudgeError,
    );

    expect(thrown).toBeInstanceOf(JudgeError);
    expect((thrown as JudgeError).reason).toBe("schema_validation_failed");
    expect(prompts).toHaveLength(2);
  });

  it("does not retry a call that never completed", async () => {
    let calls = 0;
    const unreachable = new MockLanguageModelV3({
      doGenerate: async () => {
        calls += 1;
        throw new Error("connect ECONNREFUSED");
      },
    });

    await judgeRecord(score.campaign, mapping, unreachable).catch(() => null);

    expect(calls).toBe(1);
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

  const broken: JudgeOutcome = {
    fixtureId: "eval_0007",
    difficulty: "flagged",
    verdict: null,
    error: "JudgeError: The judge call for campaign eval_0007 did not complete.",
  };

  /**
   * This used to be charged as a failure on all four dimensions, so that a judge which stopped
   * answering could not quietly shrink its own denominator. The first live run showed what
   * that cost: 12 of 16 records failed to parse, and the report announced twelve rulings by a
   * pipeline that had issued none. The judge saying nothing and the judge finding something
   * wrong are now different readings, and the denominator argument is answered by the separate
   * judge/responded gate instead.
   */
  it("counts a judge that could not answer as an error rather than four failures", () => {
    const summary = summarizeJudgements([passing, broken], 0);

    expect(summary.failures).toEqual([]);
    expect(summary.errors).toEqual([
      {
        fixtureId: "eval_0007",
        message: "JudgeError: The judge call for campaign eval_0007 did not complete.",
      },
    ]);
  });

  it("computes the dimension rates over the records it actually judged", () => {
    const summary = summarizeJudgements([passing, broken], 0);

    expect(summary.judged).toBe(1);
    for (const dimension of JUDGE_DIMENSIONS) {
      expect(summary.passRateByDimension[dimension]).toBe(1);
      expect(summary.failureCountByDimension[dimension]).toBe(0);
    }
  });

  it("keeps a real failure and an unanswered record apart in the same run", () => {
    const summary = summarizeJudgements([passing, ruling, broken], 0);

    expect(summary.judged).toBe(2);
    expect(summary.errors).toHaveLength(1);
    expect(summary.failures).toEqual([
      {
        fixtureId: "eval_0015",
        dimension: "no-ruling",
        reason: "The rationale states which position is stronger.",
      },
    ]);
    expect(summary.passRateByDimension["no-ruling"]).toBe(0.5);
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
    expect(summary.errors).toHaveLength(1);
    expect(summary.failures).toEqual([]);
    expect(summary.judged).toBe(0);
  });
});
