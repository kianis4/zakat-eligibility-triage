import { POLICY_VERSION } from "../src/lib/categories";
import { formatRate, type GateOutcome } from "./gate";
import { JUDGE_DIMENSIONS, JUDGE_RUBRIC, type JudgeSummary } from "./judge";
import type { DeterministicSummary, FixtureScore } from "./run";

export type EvalRun = {
  readonly deterministic: DeterministicSummary;
  readonly judge: JudgeSummary;
  readonly gates: readonly GateOutcome[];
  readonly startedAt: Date;
};

function row(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [row(headers), row(headers.map(() => "---")), ...rows.map(row)].join("\n");
}

/**
 * Names the refusal kinds behind an escalation mismatch.
 *
 * "differs" on its own says a set comparison failed and nothing about which way. Extra kinds
 * and missing kinds are opposite defects: the first is a pipeline refusing on something the
 * corpus does not expect, the second is a condition the corpus expects that never fired, and a
 * reader deciding whether a label or the gate is wrong needs to know which happened. Both
 * lists are printed rather than only the difference, because the expected set is small and the
 * comparison is exact-match, so seeing both is how the mismatch is read at a glance.
 */
function escalationDifference(fixture: FixtureScore): string {
  const set = (kinds: readonly string[]) => (kinds.length === 0 ? "none" : kinds.join(", "));

  return `escalation: expected [${set(fixture.escalation.expected)}], got [${set(
    fixture.escalation.actual,
  )}]`;
}

function fixtureRow(fixture: FixtureScore): readonly string[] {
  if (fixture.outcome === "failed") {
    return [
      fixture.id,
      fixture.difficulty,
      "threw",
      "threw",
      "threw",
      "threw",
      fixture.failure ?? "",
    ];
  }

  const citations =
    fixture.citations.checked === 0
      ? "none"
      : `${fixture.citations.valid}/${fixture.citations.checked}`;
  const questions =
    fixture.missingEvidence.expected === 0
      ? "none expected"
      : `${fixture.missingEvidence.covered}/${fixture.missingEvidence.expected}`;

  const differences = [
    ...fixture.categoryAgreement.disagreements.map(
      (entry) => `${entry.category}: expected ${entry.expected}, got ${entry.actual}`,
    ),
    ...(fixture.escalation.passed ? [] : [escalationDifference(fixture)]),
  ];

  return [
    fixture.id,
    fixture.difficulty,
    `${fixture.categoryAgreement.agreed}/${fixture.categoryAgreement.total}`,
    citations,
    fixture.escalation.passed ? "match" : "differs",
    questions,
    differences.join("; "),
  ];
}

const FIXTURE_HEADERS = [
  "fixture",
  "tier",
  "categories",
  "citations",
  "escalation",
  "questions",
  "where it differed",
] as const;

/**
 * Renders the run as a document a person reads before deciding whether a number moved for a
 * good reason.
 *
 * The ambiguous tier is printed in its own section rather than mixed into one table. Those
 * five cases were written to be cases two qualified reviewers could read differently, so a
 * miss there is a different event from a miss on a clean case, and a single sorted table
 * would let a reader average the two together. Separating them is what makes the honest
 * misses visible as honest misses instead of as noise in a total.
 */
export function renderReport(run: EvalRun): string {
  const { deterministic, judge, gates } = run;
  const hard = deterministic.fixtures.filter((fixture) => fixture.difficulty === "ambiguous");
  const rest = deterministic.fixtures.filter((fixture) => fixture.difficulty !== "ambiguous");
  const failed = gates.filter((gate) => !gate.passed);

  const lines = [
    "# Eval report",
    "",
    `${run.startedAt.toISOString()} · ${deterministic.fixtures.length} fixtures · policy ${POLICY_VERSION}`,
    "",
    failed.length === 0
      ? "Every gate held."
      : `${failed.length} of ${gates.length} gates failed, so this run fails the build.`,
    "",
    "## Gates",
    "",
    table(
      ["gate", "requires", "observed", "result"],
      gates.map((gate) => [
        gate.id,
        gate.required,
        gate.observed,
        gate.passed ? "pass" : `FAIL, ${gate.shortfall}`,
      ]),
    ),
    "",
    ...gates.map((gate) => `- \`${gate.id}\`: ${gate.statement}.`),
    "",
    "## Deterministic results",
    "",
    `### Cases the corpus expects the pipeline to handle (${rest.length})`,
    "",
    table(FIXTURE_HEADERS, rest.map(fixtureRow)),
    "",
    `### Cases the corpus expects to be hard (${hard.length})`,
    "",
    "The ambiguous tier. Two qualified reviewers could read each of these differently, and the",
    "labels say so. A miss here is a disagreement about a contestable reading; a miss in the",
    "table above is a defect. They are printed apart so nobody has to average them together.",
    "",
    table(FIXTURE_HEADERS, hard.map(fixtureRow)),
    "",
    "## Judge",
    "",
    judge.skipped === 0
      ? `The judge was given all ${judge.outcomes.length} records.`
      : `The judge was given ${judge.outcomes.length} records. ${judge.skipped} fixture${
          judge.skipped === 1 ? "" : "s"
        } produced no record for it to read, having thrown in the pipeline.`,
    "",
    /**
     * The denominator is stated before the table rather than left to be inferred from it. A
     * rate over four records and a rate over eighteen are different claims, and the run that
     * forced this section apart printed the first while looking like the second.
     */
    judge.errors.length === 0
      ? `It returned a usable verdict on every one, so the rates below are over ${judge.judged}.`
      : `It returned a usable verdict on ${judge.judged} of them. The other ${judge.errors.length} produced no verdict even after a repair attempt, and are counted as judge errors rather than as failures: the judge said nothing about those records, which is not the same event as the judge finding something wrong. Every rate below is over the ${judge.judged} it did judge.`,
    "",
    table(
      ["dimension", `passed (of ${judge.judged})`, "failed"],
      JUDGE_DIMENSIONS.map((dimension) => {
        const failures = judge.failureCountByDimension[dimension];

        return [
          `${dimension} (${formatRate(judge.passRateByDimension[dimension])})`,
          String(judge.judged - failures),
          String(failures),
        ];
      }),
    ),
    "",
    ...JUDGE_RUBRIC.map((dimension) => `- \`${dimension.id}\`: ${dimension.criterion}`),
    "",
    "### What the judge failed, and why",
    "",
    judge.failures.length === 0
      ? "Nothing."
      : judge.failures
          .map((failure) => `- \`${failure.fixtureId}\` · ${failure.dimension}: ${failure.reason}`)
          .join("\n"),
    "",
    "### Records the judge returned no verdict on",
    "",
    judge.errors.length === 0
      ? "None."
      : [
          "These are harness faults, not findings about the pipeline. Each one was retried once",
          "with the validation error quoted back before being counted here.",
          "",
          ...judge.errors.map((error) => `- \`${error.fixtureId}\`: ${error.message}`),
        ].join("\n"),
    "",
    "## What this run does not measure",
    "",
    "The corpus was written by the person who wrote the pipeline, so a green run says the two",
    "agree with each other. It is not an accuracy figure against real adjudications, and no",
    "error rate against a qualified reviewer can be read out of it. See",
    "`fixtures/evals/README.md` for the full statement and ADR-0009 for why the thresholds",
    "are where they are.",
    "",
  ];

  return lines.join("\n");
}

/**
 * The short form printed to the terminal, which is what a person reads first in CI logs.
 *
 * It carries the gate arithmetic and nothing else. Anyone who needs the per-fixture detail
 * has the report file, and burying a failed gate under eighteen rows of table is how a red
 * build gets scrolled past.
 */
export function renderSummary(run: EvalRun): string {
  const failed = run.gates.filter((gate) => !gate.passed);
  const lines = [
    "",
    `Eval run over ${run.deterministic.fixtures.length} fixtures, policy ${POLICY_VERSION}.`,
    "",
    ...run.gates.map(
      (gate) =>
        `  ${gate.passed ? "pass" : "FAIL"}  ${gate.id.padEnd(28)} requires ${gate.required.padEnd(
          10,
        )} observed ${gate.observed}`,
    ),
    "",
  ];

  const threw = run.deterministic.fixtures.filter((fixture) => fixture.outcome === "failed");

  if (threw.length > 0) {
    lines.push(
      `${threw.length} fixture${threw.length === 1 ? "" : "s"} threw in the pipeline:`,
      ...threw.map((fixture) => `  ${fixture.id}: ${fixture.failure}`),
      "",
    );
  }

  /**
   * The escalation gate is the one whose number says least on its own. It is scored per
   * fixture on an exact set match, so a failing rate names how many fixtures disagreed and
   * nothing about how, and the difference between a condition that never fired and one that
   * fired spuriously is the difference between a recall bug and a noise bug. Naming the kinds
   * in the terminal is what saves a reader opening the report to learn which they have.
   */
  const mismatched = run.deterministic.fixtures.filter(
    (fixture) => fixture.outcome === "scored" && !fixture.escalation.passed,
  );

  if (mismatched.length > 0) {
    lines.push(
      `${mismatched.length} fixture${mismatched.length === 1 ? "" : "s"} refused on different grounds than the corpus expects:`,
      ...mismatched.map((fixture) => `  ${fixture.id}: ${escalationDifference(fixture)}`),
      "",
    );
  }

  /**
   * Printed beside the pipeline throws and apart from the gate lines, because it is the same
   * kind of news: something in the harness did not work. Reading it as a finding about the
   * pipeline is the mistake the first live run made on a whole page of output.
   */
  if (run.judge.errors.length > 0) {
    lines.push(
      `${run.judge.errors.length} record${run.judge.errors.length === 1 ? "" : "s"} the judge returned no verdict on, after a repair attempt each:`,
      ...run.judge.errors.map((error) => `  ${error.fixtureId}: ${error.message}`),
      "",
    );
  }

  lines.push(
    failed.length === 0
      ? "Every gate held."
      : [
          `${failed.length} gate${failed.length === 1 ? "" : "s"} failed:`,
          ...failed.map((gate) => `  ${gate.id}: ${gate.shortfall}`),
        ].join("\n"),
    "",
  );

  return lines.join("\n");
}
