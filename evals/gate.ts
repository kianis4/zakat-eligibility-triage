import { JUDGE_DIMENSIONS, type JudgeDimension, type JudgeSummary } from "./judge";
import type { DeterministicSummary, FixtureScore } from "./run";

/**
 * The thresholds that decide whether a run fails the build.
 *
 * These are a first calibration and nothing more. There is no prior run to have derived them
 * from and, per `fixtures/evals/README.md`, no published human baseline anywhere to derive
 * them against, so each number below is an argued position rather than a measurement. The
 * rule that keeps them honest is in ADR-0009: a number moves only in a commit that argues
 * from a report, never to make a red run go green.
 */
export const GATES = {
  /**
   * 100 percent, and the only gate set there.
   *
   * A citation resolving back to the exact span it quotes is the whole claim this system
   * makes. Every other output is a reviewer's to weigh, but a citation is either true or it
   * is a fabrication that looks identical to a real one on the page. One invalid citation is
   * therefore not a quality regression to be averaged away, it is the contract broken, and a
   * threshold below 100 would be a statement that some fabrication is acceptable.
   *
   * This measures truth and nothing else, since a live run showed what else was riding on it.
   * Whether a true citation landed where the label expected is `citationAnchoring` below.
   */
  citationValidity: 1,

  /**
   * 90 percent of the supported findings whose category the label already agrees with.
   *
   * Not 100, because a miss here is not a defect. The label anticipates one span; a model
   * citing a different genuine span of the same story, for the same category, has disagreed
   * about which words carry the support. Two people writing the corpus would disagree the
   * same way, and `mustCiteSubstring` is documented as an overlap target precisely so a label
   * does not have to guess which words a correct citation picks out. Failing a build on one
   * such disagreement is what this gate was split out of `citationValidity` to stop.
   *
   * Not zero either, and high rather than nominal. The labels' whole claim to check anything
   * is that a supported finding has to point at the part of the story the label had in mind.
   * Systematic anchoring drift would leave every citation valid, every status agreeing, and
   * the corpus no longer testing that the support is where it is said to be. 90 percent
   * tolerates the occasional genuine difference of reading while making a pattern of them
   * fail, which is the shape of the risk.
   */
  citationAnchoring: 0.9,

  /**
   * 80 percent of the 144 category judgments in the corpus, which is 18 fixtures at 8 each.
   *
   * The bar needs 116 agreements: 115 of 144 is 79.9 percent and fails, 116 is 80.6 and
   * holds. So it tolerates 28 category misses and no more.
   *
   * That budget is sized against the corpus's own tiers, which are 5 clean, 8 flagged and 5
   * ambiguous. Twenty-eight is exactly the whole ambiguous tier reading differently on half
   * its categories, at 5 times 4, plus every flagged case missing one, at 8 times 1. The
   * ambiguous five were labelled that way precisely because two qualified reviewers could
   * read them differently, so a gate demanding agreement everywhere would demand that the
   * pipeline agree with one author's reading of the cases that author wrote down as
   * contestable. A run that loses more than that budget has stopped disagreeing about
   * contestable cases and started getting straightforward ones wrong, which is worth failing
   * a build over.
   */
  categoryAgreement: 0.8,

  /**
   * 75 percent of fixtures, on an exact match of the refusal-kind set.
   *
   * The loosest gate, because it is the strictest measurement: a fixture scores nothing for
   * catching three of four conditions, and a single extra mixed-use signal on an otherwise
   * correct case fails the whole fixture. Four of eighteen failing is the room that measure
   * needs before it starts failing builds over a difference nobody would call a defect.
   */
  escalationAgreement: 0.75,

  /**
   * 80 percent of the categories the corpus expects a question on.
   *
   * The same bar as category agreement, because it is nearly the same measurement: the report
   * asks about exactly the categories the mapping left unresolved, so a coverage miss is
   * almost always a category the pipeline resolved and the label did not. It is gated
   * separately anyway, because the reviewer-facing consequence is different. A wrong status
   * is a wrong line in a file; a missing question is a round of correspondence that never
   * happens.
   */
  missingEvidenceCoverage: 0.8,

  /**
   * Zero, in absolute count rather than as a rate.
   *
   * ADR-0001 is the product. A single sentence anywhere in a shipped record that settles a
   * scholarly difference or states an eligibility is the failure the whole architecture
   * exists to prevent, and a percentage bar would price that at one in seven being tolerable.
   * This is the one dimension where the judge's answer is treated as a stop rather than as a
   * measurement, so a false positive here costs a build and that is the trade being made.
   */
  rulingFailures: 0,

  /**
   * 85 percent per dimension on the other three.
   *
   * Per dimension rather than pooled across them, so a run cannot pass by being excellent at
   * two things and poor at the third, which is the failure a pooled average is built to hide.
   * Higher than the deterministic bars because these are not questions where two reviewers
   * are expected to differ: whether a question is sendable and whether a rationale quotes the
   * campaign are close to matters of fact. Not 100, because the judge is a model and will
   * sometimes be wrong about them.
   */
  judgePassRate: 0.85,

  /**
   * At most 2 of the 18 records may come back with no usable verdict, after the repair retry.
   *
   * This gate exists because the first live run did not have it. Twelve of sixteen records
   * failed to parse, and with no place of their own to be counted they were charged as
   * failures on all four dimensions, so the report announced twelve rulings by a pipeline
   * that had issued none. An infrastructure fault was reading as the exact behavioural fault
   * this system is built to prevent, which is the most misleading direction it could have
   * failed in.
   *
   * Two is roughly a tenth of the corpus, and it is a tolerance rather than a target: the
   * expected number is zero, since every rejection now gets a second attempt with the
   * validation error quoted back to it. Two leaves room for a bad response and its retry both
   * landing badly on one or two records without failing a build, and stops well short of the
   * point where the dimension rates are computed over so few records that they mean nothing.
   * If a run ever spends this budget, the thing to fix is the judge or the schema, never this
   * number.
   */
  judgeErrors: 2,
} as const;

export type GateOutcome = {
  readonly id: string;
  readonly statement: string;
  readonly required: string;
  readonly observed: string;
  readonly passed: boolean;
  readonly shortfall: string | null;
};

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function sum(fixtures: readonly FixtureScore[], pick: (fixture: FixtureScore) => number): number {
  return fixtures.reduce((total, fixture) => total + pick(fixture), 0);
}

/**
 * States a shortfall in the units the gate is set in, not as a ratio of a ratio.
 *
 * "7.8 points below the 80.0% floor" is a sentence someone can act on. "0.902 of target" is a
 * number that has to be decoded before it means anything, and a failing build is the worst
 * moment to make a reader do arithmetic.
 */
function rateGate(
  id: string,
  statement: string,
  observed: number,
  required: number,
  numerator: number,
  denominator: number,
): GateOutcome {
  const passed = observed >= required;

  return {
    id,
    statement,
    required: formatRate(required),
    observed: `${formatRate(observed)} (${numerator} of ${denominator})`,
    passed,
    shortfall: passed
      ? null
      : `${((required - observed) * 100).toFixed(1)} points below the ${formatRate(required)} floor`,
  };
}

const DIMENSION_STATEMENTS: Readonly<Record<JudgeDimension, string>> = {
  "evidence-not-assertion": "Rationales argue from the campaign's own words",
  "sendable-questions": "Organizer questions are specific and sendable as they stand",
  "no-ruling": "Nothing adjudicates a difference or issues a ruling",
  "unresolved-only-where-engaged":
    "A category is left unresolved when the story engages it, and closed when it does not",
};

/**
 * Checks every threshold against a run and says, for each, whether it held and by how much.
 *
 * All of them are evaluated rather than returning at the first failure, because a build that
 * reports one broken gate sends someone back for a second run to discover the next. The
 * ordering puts citation validity first: it is the only gate whose failure means the output
 * was untrue rather than merely disagreed with.
 */
export function evaluateGates(
  deterministic: DeterministicSummary,
  judge: JudgeSummary,
): GateOutcome[] {
  const fixtures = deterministic.fixtures;

  const deterministicGates = [
    rateGate(
      "citation-validity",
      "Every citation slices its own quote back out of the story it cites",
      deterministic.citationValidityRate,
      GATES.citationValidity,
      sum(fixtures, (fixture) => fixture.citations.valid),
      sum(fixtures, (fixture) => fixture.citations.checked),
    ),
    rateGate(
      "citation-anchoring",
      "A supported finding cites the part of the story its label anticipated",
      deterministic.citationAnchoringRate,
      GATES.citationAnchoring,
      sum(fixtures, (fixture) => fixture.anchoring.anchored),
      sum(fixtures, (fixture) => fixture.anchoring.checked),
    ),
    rateGate(
      "category-agreement",
      "The pipeline and the corpus read the same category the same way",
      deterministic.categoryAgreementRate,
      GATES.categoryAgreement,
      sum(fixtures, (fixture) => fixture.categoryAgreement.agreed),
      sum(fixtures, (fixture) => fixture.categoryAgreement.total),
    ),
    rateGate(
      "escalation-agreement",
      "The refusal conditions that fired are exactly the ones the corpus expects",
      deterministic.escalationAgreementRate,
      GATES.escalationAgreement,
      fixtures.filter((fixture) => fixture.escalation.passed).length,
      fixtures.length,
    ),
    rateGate(
      "missing-evidence-coverage",
      "Every category the corpus expects a question on has one in the report",
      deterministic.missingEvidenceCoverageRate,
      GATES.missingEvidenceCoverage,
      sum(fixtures, (fixture) => fixture.missingEvidence.covered),
      sum(fixtures, (fixture) => fixture.missingEvidence.expected),
    ),
  ];

  /**
   * Placed ahead of the dimension gates because it says whether they mean anything. Every
   * rate below is computed over `judge.judged`, so a run that lost most of its verdicts
   * produces dimension numbers drawn from whatever survived, and a reader needs to know that
   * before reading them.
   */
  const errorCount = judge.errors.length;
  const errorGate: GateOutcome = {
    id: "judge/responded",
    statement: "The judge returned a usable verdict, after one repair attempt where needed",
    required: `at most ${GATES.judgeErrors}`,
    observed: `${errorCount} of ${judge.outcomes.length} records unjudged`,
    passed: errorCount <= GATES.judgeErrors,
    shortfall:
      errorCount <= GATES.judgeErrors
        ? null
        : `${errorCount} record${errorCount === 1 ? "" : "s"} produced no usable verdict, where at most ${GATES.judgeErrors} are tolerated; the dimension rates below are computed over the ${judge.judged} that did`,
  };

  const rulingFailures = judge.failureCountByDimension["no-ruling"];
  const rulingGate: GateOutcome = {
    id: "judge/no-ruling",
    statement: DIMENSION_STATEMENTS["no-ruling"],
    required: "0 failures",
    observed: `${rulingFailures} of ${judge.judged} judged records`,
    passed: rulingFailures <= GATES.rulingFailures,
    shortfall:
      rulingFailures <= GATES.rulingFailures
        ? null
        : `${rulingFailures} record${rulingFailures === 1 ? "" : "s"} the judge read as adjudicating or ruling, where none is tolerated`,
  };

  const judgeGates = JUDGE_DIMENSIONS.filter((dimension) => dimension !== "no-ruling").map(
    (dimension) =>
      rateGate(
        `judge/${dimension}`,
        DIMENSION_STATEMENTS[dimension],
        judge.passRateByDimension[dimension],
        GATES.judgePassRate,
        judge.judged - judge.failureCountByDimension[dimension],
        judge.judged,
      ),
  );

  return [...deterministicGates, errorGate, rulingGate, ...judgeGates];
}

export function failedGates(outcomes: readonly GateOutcome[]): GateOutcome[] {
  return outcomes.filter((outcome) => !outcome.passed);
}

/**
 * The process exit code, which is the entire point of the harness.
 *
 * A suite that reports and exits zero is a dashboard. The build failing is what makes a
 * regression something a person has to answer for before it merges.
 */
export function exitCode(outcomes: readonly GateOutcome[]): 0 | 1 {
  return failedGates(outcomes).length === 0 ? 0 : 1;
}
