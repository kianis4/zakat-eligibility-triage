import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";

import type { CampaignInput } from "../src/lib/campaign";
import { RECIPIENT_CATEGORIES, RECIPIENT_CATEGORY_IDS } from "../src/lib/categories";
import type { CategoryMapping } from "../src/lib/mapping";
import type { FixtureScore } from "./run";

/**
 * The four things about a mapping's prose that no deterministic check can see.
 *
 * The deterministic half of the harness reads statuses, offsets and kinds, all of which a
 * label can be right about. What it cannot read is whether the rationale behind a correct
 * status argues from the campaign or merely asserts, whether a well-formed question is one a
 * reviewer would actually send, whether a sentence has quietly ruled on something, and
 * whether an unresolved status was the honest reading or a hedge. Those four are what this
 * rubric asks about, and they are the failure modes that make a green deterministic run
 * mean less than it looks.
 *
 * The ids are stable keys because the gates and the report index by them.
 */
export const JUDGE_DIMENSIONS = [
  "evidence-not-assertion",
  "sendable-questions",
  "no-ruling",
  "silence-not-guesswork",
] as const;

export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

export type RubricDimension = {
  readonly id: JudgeDimension;
  readonly label: string;
  readonly criterion: string;
};

export const JUDGE_RUBRIC: readonly RubricDimension[] = [
  {
    id: "evidence-not-assertion",
    label: "Rationales argue from the campaign's own words",
    criterion:
      "Every rationale says what the quoted or described campaign text states. A rationale that asserts a conclusion the story does not carry, or that reasons from general plausibility about campaigns of this kind rather than from this campaign, fails.",
  },
  {
    id: "sendable-questions",
    label: "Organizer questions are specific and sendable as they stand",
    criterion:
      "Every question to the organizer asks for a fact they know or a document they hold, is answerable without a religious opinion, refers to their campaign in their own terms, and could be forwarded word for word without a reviewer rewriting it. A question that is vague, that asks them to assess their own eligibility, or that reads as written about them rather than to them, fails.",
  },
  {
    id: "no-ruling",
    label: "Nothing adjudicates a difference or issues a ruling",
    criterion:
      "No sentence anywhere in the record settles a disagreement between scholars, says which position is stronger or more common, or states that the campaign is or is not zakat eligible. Naming that a question is unsettled is correct and passes. Any sentence a reader could take as the answer to it fails.",
  },
  {
    id: "silence-not-guesswork",
    label: "Silence is recorded as unresolved rather than guessed either way",
    criterion:
      "Where the story simply does not speak to a category, the record leaves it unresolved and names the fact that is missing. A category resolved as supported or not supported on text that does not actually bear on it fails, in either direction.",
  },
];

export type JudgeFailureReason = "model_call_failed" | "schema_validation_failed";

export class JudgeError extends Error {
  readonly reason: JudgeFailureReason;

  constructor(reason: JudgeFailureReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JudgeError";
    this.reason = reason;
  }
}

/**
 * One sentence saying what the judge saw, bounded the way the pipeline's own model prose is.
 *
 * The bound is the point rather than the tidiness. A reason with room for a paragraph becomes
 * a second opinion on the campaign, and the judge is being asked about the record's prose, not
 * invited to re-triage the case. One sentence is also the unit a human reads when scanning a
 * report of eighteen verdicts.
 */
const Reason = z
  .string()
  .min(12)
  .max(300)
  .refine((reason) => reason === reason.trim(), {
    message: "The sentence is stored as it will be read, without surrounding whitespace.",
  })
  .refine((reason) => (reason.match(/[.!?](\s|$)/g) ?? []).length <= 1, {
    message: "A judgment on one dimension is one sentence, not an account of the case.",
  });

/**
 * Pass or fail, and why, with no number anywhere.
 *
 * A score would be the thing ADR-0001 rejected arriving through the back door of the test
 * harness: an uncalibrated figure that a threshold then treats as meaningful, on a corpus
 * that cannot calibrate it. Pass or fail with a stated reason is a claim someone can argue
 * with, which is what the report is for. It also makes the gate arithmetic honest, because
 * counting failures is a thing the underlying judgments actually support.
 */
const Dimension = z.object({
  pass: z.boolean(),
  reason: Reason,
});

export const JudgeVerdict = z.object(
  Object.fromEntries(JUDGE_DIMENSIONS.map((id) => [id, Dimension])) as Record<
    JudgeDimension,
    typeof Dimension
  >,
);

export type JudgeVerdict = z.infer<typeof JudgeVerdict>;

/**
 * What the judge is asked for, which is looser than what the harness accepts.
 *
 * The split is the one `mapping.ts` makes between `ModelMapping` and `CategoryMapping`, for
 * the same reason. A refinement has no JSON-schema rendering, so a one-sentence rule sent to
 * a model arrives as nothing and comes back enforced only as an opaque generation failure.
 * Asking in the description and checking in `parseJudgeVerdict` gives the model a schema it
 * can satisfy and gives a human a message that names the field and the rule it broke.
 */
const ModelDimension = z.object({
  pass: z.boolean().describe("Whether the record passes this dimension."),
  reason: z
    .string()
    .min(12)
    .max(300)
    .describe("One sentence, no surrounding whitespace, saying what you saw."),
});

const ModelVerdict = z.object(
  Object.fromEntries(JUDGE_DIMENSIONS.map((id) => [id, ModelDimension])) as Record<
    JudgeDimension,
    typeof ModelDimension
  >,
);

/**
 * Parses a judge response, failing loudly on anything the schema does not admit.
 *
 * Same discipline as `extractFacts` and `mapCategories`, for the same reason: a harness that
 * repaired or defaulted a malformed verdict would report a pass nobody produced, and a gate
 * reading that pass would be measuring the repair. Exported so the failure is testable
 * without a model.
 */
export function parseJudgeVerdict(value: unknown): JudgeVerdict {
  const parsed = JudgeVerdict.safeParse(value);

  if (!parsed.success) {
    throw new JudgeError(
      "schema_validation_failed",
      `The judge response did not satisfy the rubric schema: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
      { cause: parsed.error },
    );
  }

  return parsed.data;
}

const GLOSS_BY_ID = new Map(RECIPIENT_CATEGORIES.map((category) => [category.id, category.gloss]));

/**
 * The campaign and the record under review, and nothing else.
 *
 * What is deliberately absent is the whole design. The label is absent because a judge shown
 * the expected answer grades agreement with it, which the deterministic half already measures
 * and measures better. Precedent is absent for the reason ADR-0004 keeps it away from the
 * mapping model: adjudicated cases in a model's context are examples to imitate, and a judge
 * imitating them would reward a record for resembling past decisions rather than for
 * reasoning from this campaign. The scholarly-difference summaries are absent because they
 * are corpus text rather than model-authored text, and the question here is only about what
 * the model wrote.
 *
 * Exported so a test can assert those absences rather than trusting the prompt to hold.
 */
export function reviewBrief(campaign: CampaignInput, mapping: CategoryMapping): string {
  const findings = RECIPIENT_CATEGORY_IDS.map((id) => {
    const finding = mapping.categories[id];
    const lines = [`${id} (${GLOSS_BY_ID.get(id) ?? id}): ${finding.status}`];

    if (finding.status === "supported") {
      for (const citation of finding.citations) {
        lines.push(`  cites: ${JSON.stringify(citation.quote)}`);
      }
    }

    lines.push(`  rationale: ${finding.rationale}`);

    if (finding.status === "insufficient_evidence") {
      lines.push(`  missing fact: ${finding.missingFact}`);
      lines.push(`  question to the organizer: ${finding.questionForOrganizer}`);
    }

    if (finding.scholarlyDifference !== undefined) {
      lines.push(
        `  flags an unsettled question about ${finding.scholarlyDifference.entry.topic}, because: ${finding.scholarlyDifference.whyThisApplies}`,
      );
    }

    return lines.join("\n");
  });

  const splits = mapping.mixedUseSignals.map(
    (signal) => `- ${signal.description} (cites ${JSON.stringify(signal.citations[0].quote)})`,
  );

  return [
    `Campaign title: ${campaign.title}`,
    "",
    "Campaign story:",
    "<<<STORY",
    campaign.story,
    "STORY>>>",
    "",
    "The record under review, written by the triage system about that story:",
    "",
    findings.join("\n\n"),
    "",
    splits.length === 0
      ? "The record notes no split of the money across distinct uses."
      : ["The record notes these splits of the money across distinct uses:", ...splits].join("\n"),
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "You audit the reasoning quality of a triage record written about a crowdfunding campaign.",
  "",
  "The system that produced the record does not decide zakat eligibility. It records, for each",
  "of the eight categories of recipient named in Qur'an 9:60, what the campaign text does and",
  "does not say, cites the campaign for anything it calls supported, and hands the case to a",
  "qualified human. You are not deciding eligibility either, and you are not being asked",
  "whether you agree with the statuses. You are being asked whether the prose the system wrote",
  "holds up on four specific dimensions.",
  "",
  "For each dimension, return pass or fail and one sentence saying what you saw. Write exactly",
  "one sentence, and do not put a full stop inside a fragment you quote. Judge the record in",
  "front of you against the campaign text in front of you, and nothing else: you have not been",
  "shown an expected answer or any previously decided case, and you should not reason as though",
  "you had.",
  "",
  "Fail a dimension when the record fails it anywhere, not on balance. One question a reviewer",
  "would have to rewrite is a failure of that dimension, and one sentence that settles a",
  "disagreement is a failure of its own.",
  "",
  "The four dimensions:",
  "",
  ...JUDGE_RUBRIC.map((dimension) => `${dimension.id} (${dimension.label})\n  ${dimension.criterion}`),
].join("\n");

/**
 * Asks the judge model for one verdict on one campaign's record.
 *
 * One call per fixture rather than one per category, because three of the four dimensions are
 * about the record as a whole. Whether a difference was adjudicated and whether the questions
 * read as a set a reviewer would send are both invisible from inside a single category, and
 * eight calls would cost eight times as much to answer a worse version of the question.
 */
export async function judgeRecord(
  campaign: CampaignInput,
  mapping: CategoryMapping,
  model: LanguageModel,
): Promise<JudgeVerdict> {
  try {
    const result = await generateObject({
      model,
      schema: ModelVerdict,
      system: SYSTEM_PROMPT,
      prompt: reviewBrief(campaign, mapping),
    });

    return parseJudgeVerdict(result.object);
  } catch (cause) {
    if (cause instanceof JudgeError) {
      throw cause;
    }
    if (NoObjectGeneratedError.isInstance(cause)) {
      throw new JudgeError(
        "schema_validation_failed",
        `The judge response for campaign ${campaign.id} did not satisfy the rubric schema.`,
        { cause },
      );
    }
    throw new JudgeError(
      "model_call_failed",
      `The judge call for campaign ${campaign.id} did not complete.`,
      { cause },
    );
  }
}

export type JudgeOutcome = {
  readonly fixtureId: string;
  readonly difficulty: FixtureScore["difficulty"];
  readonly verdict: JudgeVerdict | null;
  readonly error: string | null;
};

export type JudgeFailure = {
  readonly fixtureId: string;
  readonly dimension: JudgeDimension;
  readonly reason: string;
};

export type JudgeSummary = {
  readonly outcomes: readonly JudgeOutcome[];
  readonly skipped: number;
  readonly failures: readonly JudgeFailure[];
  readonly passRateByDimension: Readonly<Record<JudgeDimension, number>>;
  readonly failureCountByDimension: Readonly<Record<JudgeDimension, number>>;
};

/**
 * Turns per-fixture verdicts into the per-dimension numbers the gates read.
 *
 * A judge call that threw counts as a failure on all four rather than being dropped. The
 * alternative rewards a broken judge with a smaller denominator, which is the shape of a
 * gate that gets quieter the worse things get.
 *
 * A fixture the pipeline itself failed on is skipped instead, and counted separately. There
 * is no prose to judge, and charging that fixture again here would move two gates for one
 * defect. The count is reported so a reader can see how much of the corpus the judge
 * actually saw.
 */
export function summarizeJudgements(
  outcomes: readonly JudgeOutcome[],
  skipped: number,
): JudgeSummary {
  const failures: JudgeFailure[] = [];
  const passes = new Map<JudgeDimension, number>(JUDGE_DIMENSIONS.map((id) => [id, 0]));

  for (const outcome of outcomes) {
    for (const dimension of JUDGE_DIMENSIONS) {
      const judgment = outcome.verdict?.[dimension];

      if (judgment !== undefined && judgment.pass) {
        passes.set(dimension, (passes.get(dimension) ?? 0) + 1);
        continue;
      }

      failures.push({
        fixtureId: outcome.fixtureId,
        dimension,
        reason: judgment?.reason ?? (outcome.error ?? "No verdict was produced."),
      });
    }
  }

  const byDimension = <Value>(pick: (dimension: JudgeDimension) => Value) =>
    Object.fromEntries(JUDGE_DIMENSIONS.map((id) => [id, pick(id)])) as Record<
      JudgeDimension,
      Value
    >;

  return {
    outcomes,
    skipped,
    failures,
    passRateByDimension: byDimension((dimension) =>
      outcomes.length === 0 ? 1 : (passes.get(dimension) ?? 0) / outcomes.length,
    ),
    failureCountByDimension: byDimension(
      (dimension) => outcomes.length - (passes.get(dimension) ?? 0),
    ),
  };
}

/**
 * Judges every fixture whose record the pipeline actually produced.
 *
 * Bounded concurrency and fixture order, for the reasons `scoreCorpus` gives. A judge error
 * is captured onto its outcome rather than thrown, so one bad response does not cost the run
 * the seventeen verdicts it already has.
 */
export async function judgeCorpus(
  scores: readonly FixtureScore[],
  model: LanguageModel,
  concurrency = 4,
): Promise<JudgeSummary> {
  const judgeable = scores.filter((score) => score.mapping !== null);
  const outcomes: JudgeOutcome[] = new Array(judgeable.length);
  let next = 0;

  const worker = async () => {
    while (next < judgeable.length) {
      const index = next;
      next += 1;
      const score = judgeable[index];

      try {
        outcomes[index] = {
          fixtureId: score.id,
          difficulty: score.difficulty,
          verdict: await judgeRecord(score.campaign, score.mapping as CategoryMapping, model),
          error: null,
        };
      } catch (thrown: unknown) {
        outcomes[index] = {
          fixtureId: score.id,
          difficulty: score.difficulty,
          verdict: null,
          error: thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown),
        };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, judgeable.length) }, () => worker()),
  );

  return summarizeJudgements(outcomes, scores.length - judgeable.length);
}
