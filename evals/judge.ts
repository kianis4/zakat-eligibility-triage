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
  "unresolved-only-where-engaged",
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
  /**
   * The status definitions this dimension tests are pinned in the `CategoryFinding` docblock
   * in `src/lib/mapping.ts`, which states that they are defined there and nowhere else. The
   * clauses this criterion turns on, quoted from it:
   *
   *   `insufficient_evidence`: the story engages the category, or gestures at it, and the
   *   qualifying facts are missing.
   *   A story asserting its own zakat eligibility gestures in exactly this way: the assertion
   *   puts the categories it would cover in play and settles none of them.
   *   `not_supported`: the story does not engage the category at all, or engages it and points
   *   away.
   *   A story gestures at a category when it states a concrete fact that the category's
   *   qualifying facts in `./categories` would directly resolve or quantify.
   *   General hardship ambiance states no such fact and gestures at nothing in particular.
   *   Naming no creditor is not on its own pointing away, so a page that states a shortfall
   *   and mentions nobody it owes is unresolved on debt rather than closed on it.
   *
   * Those quotes are asserted against the real docblock by a test, not trusted to stay
   * accurate. A comment claiming to quote a definition is a copy like any other, and this
   * dimension has already been wrong once by drifting from the thing it tests.
   *
   * The criterion is a test of that line and not a second statement of it. Three live findings
   * shaped its current wording, each one the rubric being wrong rather than the pipeline:
   *
   * - Records were failed for closing categories on stories that never raise them, which the
   *   definition calls correct. That was the first version, written before the definition was
   *   pinned, and it said the opposite of what the definition says.
   * - Records were failed for leaving categories open on campaigns that assert their own zakat
   *   eligibility, which the quoted claim clause calls correct: the assertion is what puts an
   *   otherwise-silent category in play.
   * - A record was failed for closing a category as not_supported while its rationale described
   *   the engagement it was pointing away from, which is the second half of the not_supported
   *   clause working exactly as written.
   *
   * The line is operational, per the same docblock: organizer questions attach to
   * `insufficient_evidence` alone, so getting it wrong either sends a reviewer a question about
   * something the page never raised, or withholds the one question that would settle the file.
   */
  {
    id: "unresolved-only-where-engaged",
    label: "A category is left unresolved when the story engages it, and closed when it does not",
    criterion:
      "A story gestures at a category when it states a concrete fact that the category's qualifying facts would directly resolve or quantify: a stated rent shortfall, or an organizer saying they have not caught up since their hours were cut, gestures at debt. General hardship ambiance states no such fact and gestures at nothing in particular. A campaign asserting its own zakat eligibility gestures at every category that assertion would cover, however silent the rest of the page is about them. Naming no creditor, and naming no counterpart of any other kind, is not on its own pointing away: a page that states a shortfall and mentions nobody it owes is unresolved on that category rather than closed on it. Four things pass and must not be reported as failures: a category the story states no concrete fact about, and does not reach by an eligibility claim, closed as not_supported; a category the story engages and then points away from, closed as not_supported, including where the rationale describes the engagement it is pointing away from; a category left insufficient_evidence because an eligibility claim put it in play; and a category left insufficient_evidence because a stated fact gestures at it while the qualifying facts are missing. Three things fail: a category the story gestures at under the test above being settled either way instead of left insufficient_evidence with the absent qualifying fact named; a category the story neither states a concrete fact about nor reaches by an eligibility claim being left insufficient_evidence; and a closure justified by asserting facts the story does not state, rather than by observing what the story does and does not say.",
  },
];

/**
 * The clauses `unresolved-only-where-engaged` quotes out of the `CategoryFinding` docblock.
 *
 * Exported so a test can read `src/lib/mapping.ts` and prove each one is still there, word for
 * word. This is the only mechanism available: a rubric is prose sent to a model, and the
 * definition it tests is prose in a comment, so nothing else in the toolchain relates the two.
 * The dimension has already drifted from the definition once and shipped confident, specific,
 * wrong judgments for a whole corpus, which is the argument for spending a test on it.
 */
export const PINNED_STATUS_CLAUSES: readonly string[] = [
  "the story engages the category, or gestures at it, and the qualifying facts are missing",
  "A story asserting its own zakat eligibility gestures in exactly this way: the assertion puts the categories it would cover in play and settles none of them.",
  "the story does not engage the category at all, or engages it and points away",
  "A story gestures at a category when it states a concrete fact that the category's qualifying facts in `./categories` would directly resolve or quantify.",
  "General hardship ambiance states no such fact and gestures at nothing in particular",
  "Naming no creditor is not on its own pointing away, so a page that states a shortfall and mentions nobody it owes is unresolved on debt rather than closed on it.",
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
 * What the judge saw, bounded by length and by nothing else.
 *
 * This was a one-sentence rule, enforced by counting terminal punctuation, and the first live
 * run showed why that was the wrong instrument: 12 of 16 records were rejected by it, and the
 * judgments inside them were sound. The rule was validating the wrong thing. A pass or fail
 * boolean is the contract this harness gates on; the reason beside it is diagnostic prose for
 * a report, read by a person deciding whether a gate moved for a good cause. Rejecting a whole
 * verdict because its explanation ran to two sentences discards four sound judgments to
 * enforce a preference about prose.
 *
 * The length cap survives, at 400 characters, because it still does the job the sentence rule
 * was reaching for: it keeps the reason an observation about the record rather than a second
 * opinion on the campaign. Nothing here forbids quotation marks, deliberately. The judge
 * quoting the phrase it objects to is what makes a reason checkable against the record.
 */
const Reason = z.string().min(1).max(400);

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
 * the same reason: a bound stated in a description is a request, and a bound stated in the
 * parser is a check, and a human debugging a rejected verdict wants a message naming the
 * field and the rule it broke rather than an opaque generation failure.
 *
 * Both sides now carry the same length bound, since the only rule left is one a JSON schema
 * can express.
 */
const ModelDimension = z.object({
  pass: z.boolean().describe("Whether the record passes this dimension."),
  reason: z
    .string()
    .min(1)
    .max(400)
    .describe("One or two sentences saying what you saw. At most 400 characters."),
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
  "For each dimension, return pass or fail and a short reason saying what you saw. One or two",
  "sentences, at most 400 characters, and quote the phrase you are objecting to where that",
  "makes the reason easier to check. Judge the record in front of you against the campaign text",
  "in front of you, and nothing else: you have not been shown an expected answer or any",
  "previously decided case, and you should not reason as though you had.",
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
/**
 * The SDK owns the backoff; this sizes its budget. The default of two retries gave up inside
 * a sustained rate-limit window on the PR #33 run, where the last five judge calls of the
 * batch all died together, so the budget now spans roughly a minute of exponential backoff.
 * A mock rejection is not retryable, so unit tests see exactly the calls they count.
 */
const JUDGE_CALL_RETRIES = 5;

async function askJudge(
  campaign: CampaignInput,
  prompt: string,
  model: LanguageModel,
): Promise<JudgeVerdict> {
  try {
    const result = await generateObject({
      model,
      maxRetries: JUDGE_CALL_RETRIES,
      schema: ModelVerdict,
      system: SYSTEM_PROMPT,
      prompt,
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
    const detail =
      cause instanceof Error && cause.message.trim().length > 0
        ? ` ${cause.message.trim().slice(0, 200)}`
        : " The provider returned no error message.";
    throw new JudgeError(
      "model_call_failed",
      `The judge call for campaign ${campaign.id} did not complete.${detail}`,
      { cause },
    );
  }
}

export async function judgeRecord(
  campaign: CampaignInput,
  mapping: CategoryMapping,
  model: LanguageModel,
): Promise<JudgeVerdict> {
  const brief = reviewBrief(campaign, mapping);

  try {
    return await askJudge(campaign, brief, model);
  } catch (thrown: unknown) {
    if (!(thrown instanceof JudgeError) || thrown.reason !== "schema_validation_failed") {
      throw thrown;
    }

    /**
     * One repair attempt, with the validation error quoted back. A malformed response is
     * usually a formatting slip rather than a judge with nothing to say, and the first live
     * run was mostly this: sound judgments discarded over the shape of the prose beside them.
     * Telling the model exactly which field broke which rule is the cheapest thing that has a
     * chance of fixing it.
     *
     * Once, not until it works. A retry loop turns a persistently broken judge into a slow
     * expensive one that eventually says something, and the point of counting judge errors is
     * to see that the judge is broken rather than to grind past it. Only a schema failure is
     * retried; a call that did not complete is the AI SDK's own retry to make, and repeating
     * it here would stack two backoffs.
     */
    return askJudge(
      campaign,
      [
        brief,
        "",
        "Your previous response to this was rejected before it could be recorded. The",
        "judgments themselves were not the problem; the response did not satisfy the required",
        "shape. Send the same judgments again in a response that does. The validation error",
        "was:",
        "",
        thrown.message,
      ].join("\n"),
      model,
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

/**
 * A record the judge never returned a usable verdict on, after its repair attempt.
 *
 * Kept apart from `JudgeFailure` because it is a different kind of event. A failure is the
 * judge saying the record fell short. This is the judge saying nothing at all, and the two
 * were indistinguishable in the report until a live run made the difference impossible to
 * miss.
 */
export type JudgeErrorRecord = {
  readonly fixtureId: string;
  readonly message: string;
};

export type JudgeSummary = {
  readonly outcomes: readonly JudgeOutcome[];
  readonly skipped: number;
  readonly judged: number;
  readonly errors: readonly JudgeErrorRecord[];
  readonly failures: readonly JudgeFailure[];
  readonly passRateByDimension: Readonly<Record<JudgeDimension, number>>;
  readonly failureCountByDimension: Readonly<Record<JudgeDimension, number>>;
};

/**
 * Turns per-fixture verdicts into the per-dimension numbers the gates read.
 *
 * A judge call that produced no verdict is counted as its own thing and gated on its own
 * threshold, rather than charged as a failure on all four dimensions. It used to be charged,
 * on the argument that dropping it shrinks the denominator and makes a gate quieter the worse
 * things get. The first live run showed the cost of that argument: 12 of 16 records failed to
 * parse over a formatting rule, every dimension went deep red, and the report said the
 * pipeline had adjudicated a scholarly difference twelve times. It had not. Nothing about the
 * pipeline was measured at all, and the number that said otherwise was the loudest one on the
 * page.
 *
 * So infrastructure failure and behavioural failure are now separate readings. The dimension
 * rates compute over the records that were actually judged, with that denominator printed
 * everywhere the rate is, and the count of unjudged records is its own gate. The denominator
 * argument is answered by that gate rather than by contaminating these: a judge that stops
 * answering fails the run, and it fails it under a name that says what went wrong.
 *
 * A fixture the pipeline itself failed on is skipped rather than counted as either. There is
 * no prose to judge, and charging that fixture again here would move two gates for one defect.
 */
export function summarizeJudgements(
  outcomes: readonly JudgeOutcome[],
  skipped: number,
): JudgeSummary {
  const failures: JudgeFailure[] = [];
  const errors: JudgeErrorRecord[] = [];
  const passes = new Map<JudgeDimension, number>(JUDGE_DIMENSIONS.map((id) => [id, 0]));

  for (const outcome of outcomes) {
    if (outcome.verdict === null) {
      errors.push({
        fixtureId: outcome.fixtureId,
        message: outcome.error ?? "No verdict was produced and no error was recorded.",
      });
      continue;
    }

    for (const dimension of JUDGE_DIMENSIONS) {
      const judgment = outcome.verdict[dimension];

      if (judgment.pass) {
        passes.set(dimension, (passes.get(dimension) ?? 0) + 1);
        continue;
      }

      failures.push({
        fixtureId: outcome.fixtureId,
        dimension,
        reason: judgment.reason,
      });
    }
  }

  const judged = outcomes.length - errors.length;

  const byDimension = <Value>(pick: (dimension: JudgeDimension) => Value) =>
    Object.fromEntries(JUDGE_DIMENSIONS.map((id) => [id, pick(id)])) as Record<
      JudgeDimension,
      Value
    >;

  return {
    outcomes,
    skipped,
    judged,
    errors,
    failures,
    passRateByDimension: byDimension((dimension) =>
      judged === 0 ? 1 : (passes.get(dimension) ?? 0) / judged,
    ),
    failureCountByDimension: byDimension((dimension) => judged - (passes.get(dimension) ?? 0)),
  };
}

/**
 * Judges every fixture whose record the pipeline actually produced.
 *
 * Bounded concurrency and fixture order, for the reasons `scoreCorpus` gives, but at two
 * rather than four: the judge's calls are the largest in the run, and four of them abreast
 * raced the provider's rate window on the PR #33 run until the tail of the batch starved.
 * Two halves the burst for a couple of minutes of wall clock. A judge error is captured onto
 * its outcome rather than thrown, so one bad response does not cost the run the seventeen
 * verdicts it already has.
 */
export async function judgeCorpus(
  scores: readonly FixtureScore[],
  model: LanguageModel,
  concurrency = 2,
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
