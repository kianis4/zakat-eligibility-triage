import { describe, expect, it } from "vitest";

import type { EscalationReason } from "../../src/lib/escalation";
import { evaluateGates } from "../gate";
import { summarizeJudgements, type JudgeOutcome } from "../judge";
import { renderReport, renderSummary, type EvalRun } from "../report";
import { summarize, type FixtureScore } from "../run";
import { outcome, score } from "./score-builders";

type EscalationKind = EscalationReason["kind"];

function run(fixtures: readonly FixtureScore[], outcomes: readonly JudgeOutcome[]): EvalRun {
  const deterministic = summarize(fixtures);
  const judge = summarizeJudgements(outcomes, fixtures.length - outcomes.length);

  return {
    deterministic,
    judge,
    gates: evaluateGates(deterministic, judge),
    startedAt: new Date("2026-08-19T12:00:00.000Z"),
  };
}

const mixedTiers = [
  score("eval_0001"),
  score("eval_0006"),
  score("eval_0014", { difficulty: "ambiguous", agreed: 5 }),
  score("eval_0018", { difficulty: "ambiguous", agreed: 6 }),
];

describe("the report", () => {
  const rendered = renderReport(run(mixedTiers, mixedTiers.map((entry) => outcome(entry.id))));

  it("prints the tier the corpus expects to be hard in its own section", () => {
    const [handled, hard] = rendered.split("### Cases the corpus expects to be hard");

    expect(handled).toContain("eval_0001");
    expect(handled).not.toContain("eval_0014");
    expect(hard).toContain("eval_0014");
    expect(hard).toContain("eval_0018");
    expect(hard).not.toContain("eval_0001");
  });

  it("says how many cases are in each tier", () => {
    expect(rendered).toContain("Cases the corpus expects the pipeline to handle (2)");
    expect(rendered).toContain("Cases the corpus expects to be hard (2)");
  });

  it("says what the run cannot measure", () => {
    expect(rendered).toContain("written by the person who wrote the pipeline");
    expect(rendered).toContain("fixtures/evals/README.md");
  });
});

describe("a report on a failing run", () => {
  const failing = [
    score("eval_0001", { citationsValid: 0, citationsChecked: 2 }),
    score("eval_0014", { difficulty: "ambiguous" }),
  ];
  const outcomes = [outcome("eval_0001", ["no-ruling"], "It states which position is stronger."), outcome("eval_0014")];

  it("says the run fails the build, and on how many gates", () => {
    expect(renderReport(run(failing, outcomes))).toContain("gates failed, so this run fails the build");
  });

  it("carries the judge's own reason for every failed dimension", () => {
    expect(renderReport(run(failing, outcomes))).toContain(
      "`eval_0001` · no-ruling: It states which position is stronger.",
    );
  });

  it("names each failed gate and its shortfall in the terminal summary", () => {
    const summary = renderSummary(run(failing, outcomes));

    expect(summary).toContain("FAIL  citation-validity");
    expect(summary).toContain("citation-validity: 50.0 points below the 100.0% floor");
    expect(summary).toContain("judge/no-ruling:");
  });
});

/**
 * "differs" on its own says a set comparison failed and nothing about which way, and the two
 * directions are opposite defects: a condition that never fired is a recall bug, one that
 * fired spuriously is a noise bug. A reader deciding whether the label or the pipeline is
 * wrong cannot start without knowing which.
 */
describe("an escalation mismatch", () => {
  function mismatch(expected: readonly string[], actual: readonly string[]): FixtureScore {
    return {
      ...score("eval_0006"),
      escalation: {
        passed: false,
        expected: expected as EscalationKind[],
        actual: actual as EscalationKind[],
      },
    };
  }

  it("names the kinds on both sides in the report", () => {
    const rendered = renderReport(
      run([mismatch(["mixed_use"], ["mixed_use", "scholarly_difference"])], [outcome("eval_0006")]),
    );

    expect(rendered).toContain("escalation: expected [mixed_use], got [mixed_use, scholarly_difference]");
  });

  it("distinguishes a condition that never fired from one that fired spuriously", () => {
    const missing = renderReport(run([mismatch(["mixed_use"], [])], [outcome("eval_0006")]));
    const spurious = renderReport(run([mismatch([], ["mixed_use"])], [outcome("eval_0006")]));

    expect(missing).toContain("escalation: expected [mixed_use], got [none]");
    expect(spurious).toContain("escalation: expected [none], got [mixed_use]");
  });

  it("names the kinds in the terminal summary too", () => {
    const summary = renderSummary(
      run([mismatch(["mixed_use"], ["scholarly_difference"])], [outcome("eval_0006")]),
    );

    expect(summary).toContain("1 fixture refused on different grounds than the corpus expects:");
    expect(summary).toContain("eval_0006: escalation: expected [mixed_use], got [scholarly_difference]");
  });

  it("keeps the category disagreements beside it rather than replacing them", () => {
    const both: FixtureScore = {
      ...mismatch(["mixed_use"], []),
      categoryAgreement: {
        agreed: 7,
        total: 8,
        disagreements: [
          { category: "al-gharimin", expected: "supported", actual: "not_supported" },
        ],
      },
    };

    const rendered = renderReport(run([both], [outcome("eval_0006")]));

    expect(rendered).toContain("al-gharimin: expected supported, got not_supported");
    expect(rendered).toContain("escalation: expected [mixed_use], got [none]");
  });

  it("says nothing about escalation on a fixture that matched", () => {
    const rendered = renderReport(run([score("eval_0001")], [outcome("eval_0001")]));

    expect(rendered).not.toContain("escalation: expected");
    expect(renderSummary(run([score("eval_0001")], [outcome("eval_0001")]))).not.toContain(
      "refused on different grounds",
    );
  });
});

/**
 * A fixture the pipeline threw on has scores that look like very bad scores. The report has
 * to say it threw, or a reader has no way to tell a pipeline that read the case wrongly from
 * one that never read it at all.
 */
describe("a fixture that threw", () => {
  const threw = [
    score("eval_0001"),
    score("eval_0007", { threw: "MappingError: The category mapping call did not complete." }),
  ];

  it("is marked as having thrown rather than shown as a row of zeroes", () => {
    const rendered = renderReport(run(threw, [outcome("eval_0001")]));

    expect(rendered).toContain("threw");
    expect(rendered).toContain("MappingError: The category mapping call did not complete.");
  });

  it("is reported to the terminal with the error it threw", () => {
    const summary = renderSummary(run(threw, [outcome("eval_0001")]));

    expect(summary).toContain("1 fixture threw in the pipeline:");
    expect(summary).toContain("eval_0007: MappingError");
  });

  it("is counted out of what the judge saw", () => {
    expect(renderReport(run(threw, [outcome("eval_0001")]))).toContain(
      "1 fixture produced no record for it to read",
    );
  });
});
