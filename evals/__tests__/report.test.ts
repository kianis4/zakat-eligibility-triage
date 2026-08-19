import { describe, expect, it } from "vitest";

import { evaluateGates } from "../gate";
import { summarizeJudgements, type JudgeOutcome } from "../judge";
import { renderReport, renderSummary, type EvalRun } from "../report";
import { summarize, type FixtureScore } from "../run";
import { outcome, score } from "./score-builders";

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
