import type { CampaignInput } from "../../src/lib/campaign";
import type { EvalDifficulty } from "../../src/lib/eval-fixture";
import { JUDGE_DIMENSIONS, type JudgeDimension, type JudgeOutcome, type JudgeVerdict } from "../judge";
import type { FixtureScore } from "../run";

export const campaign: CampaignInput = {
  id: "cmp_gate",
  title: "A campaign that exists only to give a score somewhere to hang",
  story: "The family owe four months of rent and cannot clear it from what they earn.",
  category: "Housing",
  goalAmount: 4200,
  currency: "GBP",
  organizer: { name: "Ifeoma Bello", location: "London, United Kingdom" },
};

/**
 * A score built directly rather than run through the pipeline.
 *
 * The gates and the report are both arithmetic and formatting over numbers the harness has
 * already produced, and a test about either should be able to state the numbers. Driving a
 * mock pipeline to reach an 80-percent-exactly agreement rate would make a boundary case
 * depend on eighteen fixtures happening to divide the right way.
 */
export function score(
  id: string,
  parts: {
    agreed?: number;
    citationsValid?: number;
    citationsChecked?: number;
    anchored?: number;
    anchorChecks?: number;
    escalationPassed?: boolean;
    covered?: number;
    expectedQuestions?: number;
    difficulty?: EvalDifficulty;
    threw?: string;
  } = {},
): FixtureScore {
  const checked = parts.citationsChecked ?? 2;
  const anchorChecks = parts.anchorChecks ?? 1;

  return {
    id,
    title: campaign.title,
    difficulty: parts.difficulty ?? "clean",
    outcome: parts.threw === undefined ? "scored" : "failed",
    failure: parts.threw ?? null,
    categoryAgreement: { agreed: parts.agreed ?? 8, total: 8, disagreements: [] },
    citations: { checked, valid: parts.citationsValid ?? checked, violations: [] },
    anchoring: {
      checked: anchorChecks,
      anchored: parts.anchored ?? anchorChecks,
      misses: [],
    },
    escalation: { passed: parts.escalationPassed ?? true, expected: [], actual: [] },
    missingEvidence: {
      covered: parts.covered ?? 0,
      expected: parts.expectedQuestions ?? 0,
      uncovered: [],
    },
    campaign,
    mapping: null,
  };
}

export function outcome(
  id: string,
  failing: readonly JudgeDimension[] = [],
  reason = "The record reads as it should here.",
): JudgeOutcome {
  return {
    fixtureId: id,
    difficulty: "clean",
    verdict: Object.fromEntries(
      JUDGE_DIMENSIONS.map((dimension) => [
        dimension,
        { pass: !failing.includes(dimension), reason },
      ]),
    ) as JudgeVerdict,
    error: null,
  };
}
