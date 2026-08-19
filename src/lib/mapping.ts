import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";

import { CampaignInput } from "./campaign";
import {
  POLICY_VERSION,
  RECIPIENT_CATEGORIES,
  RECIPIENT_CATEGORY_IDS,
  SCHOLARLY_DIFFERENCES,
  SCHOLARLY_DIFFERENCE_IDS,
  scholarlyDifferenceById,
  type RecipientCategory,
} from "./categories";
import type { ExtractedFacts } from "./extraction";
import { modelProse } from "./model-prose";
import { locateQuote } from "./quotes";
import { describeValidationIssues } from "./validation-detail";

/**
 * A span of campaign story standing behind a claim about it.
 *
 * `story.slice(start, end) === quote` holds for every citation this module hands out.
 * The model never supplies the offsets; it supplies the quote, and `resolveCitation`
 * finds the offsets by exact search. See ADR-0003.
 */
export const Citation = z.object({
  quote: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});

export type Citation = z.infer<typeof Citation>;

export type MappingFailureReason =
  | "model_call_failed"
  | "schema_validation_failed"
  | "citation_unresolvable";

export class MappingError extends Error {
  readonly reason: MappingFailureReason;

  constructor(reason: MappingFailureReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MappingError";
    this.reason = reason;
  }
}

/**
 * Turns a quote the model produced into a citation into the story.
 *
 * A quote that cannot be found is a hard failure. There is no nearest-match rescue and
 * no quiet demotion of the finding to an uncited one: a quote that has to be rescued is
 * not a quote from the story, and a finding that loses its citation on the way out is
 * exactly the uncited assertion this pipeline exists to refuse.
 *
 * The result is parsed before it is returned, so this exported helper cannot hand back a
 * value its own schema would reject. An empty quote is the case that matters: every string
 * contains it, so a plain search reports a match at offset zero and the caller receives a
 * citation to nothing that looks resolved.
 */
export function resolveCitation(story: string, quote: string): Citation {
  const span = locateQuote(story, quote);
  const resolved = span === null ? null : Citation.safeParse({ quote, ...span });

  if (resolved === null || !resolved.success) {
    throw new MappingError(
      "citation_unresolvable",
      `The quote ${JSON.stringify(quote)} cannot be cited as a verbatim span of the campaign story.`,
      { cause: resolved?.error },
    );
  }

  return resolved.data;
}

/**
 * The model's one sentence on why this campaign sits inside a recorded difference.
 *
 * It is about the campaign rather than about the disagreement: the positions come from the
 * corpus, and this field is the model saying what the campaign does that lands it there. The
 * length bound is what keeps it that way, because one sentence has no room for an account of
 * a school's reasoning. The shape guard it shares with every other model-authored field is
 * in `./model-prose`. See ADR-0007.
 */
const WhyThisApplies = modelProse(
  z
    .string()
    .min(12)
    .max(240)
    .refine((why) => why === why.trim(), {
      message: "The sentence is stored as it will be read, without surrounding whitespace.",
    })
    .refine((why) => (why.match(/[.!?](\s|$)/g) ?? []).length <= 1, {
      message: "Why a campaign sits inside a difference is one sentence, not an account of it.",
    }),
);

/**
 * The corpus entry as it is carried into the output, with the id it was selected by.
 *
 * The fields mirror `ScholarlyDifference` in `./categories` because this is that value,
 * not a restatement of it. Parsing enforces the identity: an entry whose text differs from
 * what the corpus holds under its id is rejected, so a summary cannot be edited on the way
 * through by a model, a fixture, or a JSON round-trip.
 */
const ResolvedScholarlyDifference = z
  .object({
    id: z.enum(SCHOLARLY_DIFFERENCE_IDS),
    category: z.enum(RECIPIENT_CATEGORY_IDS),
    topic: z.string().min(1),
    summary: z.string().min(1),
  })
  .refine(
    (entry) => {
      const recorded = SCHOLARLY_DIFFERENCES.find((difference) => difference.id === entry.id);

      return (
        recorded !== undefined &&
        recorded.category === entry.category &&
        recorded.topic === entry.topic &&
        recorded.summary === entry.summary
      );
    },
    {
      message:
        "A scholarly difference is the entry recorded under its id, word for word, not a description of one.",
    },
  );

/**
 * A disagreement between recognised scholars that this finding sits inside.
 *
 * The difference itself is reference data: human-authored, versioned in `./categories`, and
 * reached by id, so nothing in citation position was written by a model. The model selects
 * which entry applies and says in one sentence what the campaign does that puts it there.
 * That sentence is model prose like the rationale and the organizer question: shape-guarded
 * against quotation and citation by `./model-prose`, not proof against a paraphrase, and to
 * be rendered as the model's own words rather than as a quotation. ADR-0007 argues the split
 * and states what it does not cover.
 */
export const ScholarlyDifferenceReference = z.object({
  entry: ResolvedScholarlyDifference,
  whyThisApplies: WhyThisApplies,
});

export type ScholarlyDifferenceReference = z.infer<typeof ScholarlyDifferenceReference>;

/**
 * The vocabulary this pipeline uses to talk to itself, none of which an organizer can act on.
 *
 * A category id is a doctrinal frame the platform has not adjudicated and is not entitled to
 * put to the person it is about, and a status word tells an organizer they are being graded
 * rather than asked something. Either one appearing in the question is a sign the question
 * was written about our record instead of about their campaign.
 */
const INTERNAL_VOCABULARY: readonly string[] = [
  ...RECIPIENT_CATEGORY_IDS,
  "insufficient_evidence",
  "not_supported",
  "supported",
];

/**
 * What the model says about the campaign, in its own words, under the shape guard.
 *
 * Every field the model writes prose into runs through `modelProse`, on the model-facing
 * schema and on the output schema both. The rationale matters most of the four: rule 6 sends
 * unresolved discussion of a difference into it, so it is the field most likely to reach for
 * a source, and until this guard it was a bare `z.string().min(1)`.
 */
const Rationale = modelProse(z.string().min(1));

const MissingFact = modelProse(z.string().min(1));

/**
 * A question a reviewer can forward to the organizer exactly as it stands.
 *
 * Most of what makes the question sendable cannot be checked here. Whether it is polite,
 * self-contained, answerable with facts rather than with a religious opinion, and phrased in
 * the organizer's own terms is a matter of reading it, and the prompt is where that is asked
 * for. What a schema can check is checked, because these are the failures that would reach
 * an organizer's inbox unnoticed: a statement dressed as a request, whitespace from whatever
 * assembled it, and our internal vocabulary leaking out of the file it belongs in.
 */
export const OrganizerQuestion = modelProse(
  z
    .string()
    .min(1)
    .refine((question) => question === question.trim(), {
      message: "A question that is forwarded untouched carries no surrounding whitespace.",
    })
    .refine((question) => question.endsWith("?"), {
      message: "A question a reviewer sends to the organizer ends with a question mark.",
    })
    .refine(
      (question) => {
        const lowered = question.toLowerCase();
        return !INTERNAL_VOCABULARY.some((term) => lowered.includes(term));
      },
      {
        message:
          "A question to the organizer names no recipient category and no finding status of ours.",
      },
    ),
);

export type OrganizerQuestion = z.infer<typeof OrganizerQuestion>;

/**
 * What the campaign text does or does not say about one recipient category.
 *
 * The three statuses are defined here and nowhere else. `SYSTEM_PROMPT` below encodes this
 * definition, the eval corpus is labelled against it, and every other note in the repository
 * that names a status points here rather than restating it, because two statements of one
 * definition drift and the drift is invisible until a label and a finding disagree for a
 * reason neither of them records. All three are statements about the story. None of them is
 * a determination of zakat eligibility, which ADR-0001 reserves to the reviewer.
 *
 * - `supported`: the story states the qualifying facts the category's `evidenceGuidance` in
 *   `./categories` asks for, and the spans stating them are cited. Hardship, urgency, a
 *   sympathetic account and a sum of money are not qualifying facts. Income and rent figures
 *   that never say the household cannot meet its basic needs do not support al-fuqara.
 * - `insufficient_evidence`: the story engages the category, or gestures at it, and the
 *   qualifying facts are missing. The absent fact is named and the question that would obtain
 *   it travels with it. A story asserting its own zakat eligibility gestures in exactly this
 *   way: the assertion puts the categories it would cover in play and settles none of them.
 * - `not_supported`: the story does not engage the category at all, or engages it and points
 *   away.
 *
 * Gesturing has an operational test, because it was the word doing the most work and the least
 * defined. A story gestures at a category when it states a concrete fact that the category's
 * qualifying facts in `./categories` would directly resolve or quantify. A rent shortfall the
 * page asks for money to cover, or an organizer saying they have not caught up since their
 * hours were cut, is a stated fact that a creditor, a sum, a cause and a due date would resolve,
 * so al-gharimin is unresolved on that page and the question asks whether anything is owed and
 * to whom. General hardship ambiance states no such fact and gestures at nothing in particular:
 * where a page like that leaves a line open, what leaves it open is one of the shapes in the
 * prompt rather than a gesture.
 *
 * The contrast sits inside the same category. A borrower who says he is repaying an advance at
 * a rate he can manage has stated the fact and settled it, which is engaging the category and
 * pointing away from it. Naming no creditor is not on its own pointing away, so a page that
 * states a shortfall and mentions nobody it owes is unresolved on debt rather than closed on it.
 *
 * The line between the last two is operational rather than cosmetic. Organizer questions
 * attach to `insufficient_evidence` alone, in `./missing-evidence`, so silence recorded as
 * unresolved sends a reviewer a question about something the page never raised, and
 * engagement recorded as absent withholds the one question that would settle the file.
 *
 * The union is the enforcement mechanism, not documentation of one: `supported` carries a
 * citation list typed as non-empty, so a supported finding with nothing behind it cannot
 * be constructed, in TypeScript or at parse time. `insufficient_evidence` carries the
 * specific fact that is missing and the question that would obtain it, so the finding a
 * reviewer cannot act on is the one status that cannot exist without the way to resolve it.
 *
 * No finding carries a score. A number here would be a determination with a decimal point
 * in it, and ADR-0001 rules that out.
 */
export const CategoryFinding = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("supported"),
    citations: z.tuple([Citation], Citation),
    rationale: Rationale,
    scholarlyDifference: ScholarlyDifferenceReference.optional(),
  }),
  z.object({
    status: z.literal("not_supported"),
    rationale: Rationale,
    scholarlyDifference: ScholarlyDifferenceReference.optional(),
  }),
  z.object({
    status: z.literal("insufficient_evidence"),
    rationale: Rationale,
    missingFact: MissingFact,
    questionForOrganizer: OrganizerQuestion,
    scholarlyDifference: ScholarlyDifferenceReference.optional(),
  }),
]);

export type CategoryFinding = z.infer<typeof CategoryFinding>;

/**
 * A span suggesting the campaign splits its funds across distinct uses, some of which may
 * belong to different categories or to none. Escalation logic reads these directly.
 *
 * The citation list is non-empty for the same reason a supported finding's is. A signal is
 * a claim about the campaign, and a claim about the campaign with no span behind it is the
 * thing this pipeline does not emit, whether it sits beside a category or outside all eight.
 */
/**
 * The words that become the reviewer's question when the pipeline refuses on a split.
 *
 * The escalation step builds that question by carrying this description into it verbatim, so
 * the description is the only place the distinct uses are ever named. A description of "."
 * or of one bare noun parses as a string, produces a grammatical question, and asks the
 * reviewer to apportion between uses it never states, which is the generic needs-review flag
 * arriving by the back door. Two words of two or more letters is the floor at which the
 * description can name two things at all; the length minimum catches the abbreviations that
 * clear that bar and still say nothing.
 */
export const MixedUseDescription = modelProse(
  z
    .string()
    .min(12, { message: "A description of a split says what the money is split between." })
    .refine((description) => (description.match(/\p{L}{2,}/gu) ?? []).length >= 2, {
      message: "A description of a split names the distinct uses the money goes to.",
    }),
);

export type MixedUseDescription = z.infer<typeof MixedUseDescription>;

export const MixedUseSignal = z.object({
  description: MixedUseDescription,
  citations: z.tuple([Citation], Citation),
});

export type MixedUseSignal = z.infer<typeof MixedUseSignal>;

/**
 * The eight findings, the mixed-use signals, and the policy the whole thing was produced
 * against.
 *
 * `policyVersion` is stamped server-side from the corpus in `./categories` and is absent
 * from the model-facing schema, so it records what the pipeline read rather than what the
 * model says it read. Without it a mapping is undated against a moving corpus, and a policy
 * change leaves no way to tell which stored outputs it invalidated.
 */
export const CategoryMapping = z.object({
  policyVersion: z.string().regex(/^[0-9a-f]{12}$/),
  categories: z.record(z.enum(RECIPIENT_CATEGORY_IDS), CategoryFinding),
  mixedUseSignals: z.array(MixedUseSignal),
});

export type CategoryMapping = z.infer<typeof CategoryMapping>;

/**
 * The model is asked for quotes and never for offsets (ADR-0003), for the id of a scholarly
 * difference and never for an account of one (ADR-0007), and is asked to state the absence
 * of a difference rather than to omit the field, so that silence cannot be mistaken for a
 * considered null.
 */
const ModelScholarlyDifference = z
  .object({
    id: z
      .enum(SCHOLARLY_DIFFERENCE_IDS)
      .describe("The id of the recorded difference this campaign sits inside."),
    whyThisApplies: WhyThisApplies.describe(
      "One sentence on what this campaign does that puts it inside that difference. Write about the campaign only. Do not state the difference, the positions, or who holds them, and quote nothing.",
    ),
  })
  .nullable()
  .describe(
    "The recorded difference this finding sits inside, selected by id, or null. Null unless the facts this story states sit on the contested side of it, so the recorded positions would read this campaign differently from one another.",
  );

const FINDING_STATUSES = ["supported", "not_supported", "insufficient_evidence"] as const;

/**
 * One category's finding, in the one shape the model fills eight times over.
 *
 * The model used to be handed eight named category properties, each a three-member union
 * carrying a nullable selection, and the provider's structured-output compiler refused the
 * result: thirty-two union-typed parameters against a limit of sixteen. The categories are
 * a list now, and the category this finding is about is a field in it, so the schema
 * describes one item rather than eight copies of one. Union-typed parameters in this item:
 * one, `scholarlyDifference`, which is nullable. The whole model-facing schema declares that
 * one, and `src/lib/__tests__/mapping-types.test.ts` holds it under the limit.
 *
 * The flattening costs the union that made an uncited supported finding unconstructable at
 * the model boundary, so the check below carries it instead: a supported finding with no
 * quote, or an unresolved one missing the fact or the question, fails parsing exactly as it
 * did before. `quotes` is required and empty on the statuses that have nothing to quote,
 * because an empty list of supporting spans is the honest reading of a finding with none.
 * `missingFact` and `questionForOrganizer` stay optional: an empty string there would be a
 * missing fact that claims to name one. Nothing about the output type changes; the eight
 * findings are folded back into the `CategoryMapping` record server-side.
 */
const ModelFinding = z
  .object({
    category: z
      .enum(RECIPIENT_CATEGORY_IDS)
      .describe("The category this finding is about. Exactly one finding per category."),
    status: z
      .enum(FINDING_STATUSES)
      .describe("What the story does or does not say about this category."),
    quotes: z
      .array(z.string().min(1))
      .describe(
        "Verbatim spans of the story that support this category. At least one when the status is supported, empty otherwise.",
      ),
    rationale: Rationale.describe(
      "What this story says about this category, in one or two sentences, carrying no fact the story does not state.",
    ),
    missingFact: MissingFact.optional().describe(
      "The one specific fact the story does not state, in a single sentence. Only on an insufficient_evidence finding.",
    ),
    questionForOrganizer: OrganizerQuestion.optional().describe(
      "The question a reviewer sends the organizer, word for word, to obtain that fact. Only on an insufficient_evidence finding.",
    ),
    scholarlyDifference: ModelScholarlyDifference,
  })
  .superRefine((finding, ctx) => {
    if (finding.status === "supported" && finding.quotes.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quotes"],
        message: "A supported status without a quote from the story is not available.",
      });
    }

    if (finding.status !== "insufficient_evidence") {
      return;
    }

    if (finding.missingFact === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["missingFact"],
        message: "An unresolved finding names the fact that would resolve it.",
      });
    }

    if (finding.questionForOrganizer === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["questionForOrganizer"],
        message: "An unresolved finding carries the question that would obtain the missing fact.",
      });
    }
  });

type ModelFinding = z.infer<typeof ModelFinding>;

/**
 * Everything the model is permitted to return, and the surface a test reads to check that
 * the permission is what ADR-0007 says it is.
 */
export const ModelMapping = z.object({
  findings: z
    .array(ModelFinding)
    .describe(
      "One finding for each of the eight categories, in any order. Every category appears exactly once.",
    ),
  mixedUseSignals: z
    .array(
      z.object({
        description: MixedUseDescription.describe(
          "What the money is split between, naming each distinct use in the story's own terms.",
        ),
        quotes: z
          .array(z.string().min(1))
          .min(1)
          .describe("Verbatim spans showing the split. At least one."),
      }),
    )
    .describe(
      "Signals that the campaign splits funds across distinct uses. The list may be empty, but a signal in it must quote the story.",
    ),
});

export type ModelMapping = z.infer<typeof ModelMapping>;

const CATEGORY_BRIEFING = RECIPIENT_CATEGORIES.map((category) =>
  [`${category.id} (${category.gloss})`, `  ${category.evidenceGuidance}`].join("\n"),
).join("\n\n");

const DIFFERENCE_BRIEFING = SCHOLARLY_DIFFERENCES.map((difference) =>
  [
    `id: ${difference.id} (${difference.category} / ${difference.topic})`,
    `  ${difference.summary}`,
  ].join("\n"),
).join("\n\n");

const SYSTEM_PROMPT = [
  "You read a crowdfunding campaign story and record, for each of the eight categories of",
  "zakat recipient named in Qur'an 9:60, what the text does and does not say about it.",
  "",
  "You are not deciding anything. You do not determine zakat eligibility, you do not rank",
  "categories, and you do not choose between scholarly positions. A qualified human reviewer",
  "decides, and your output is the evidence they read. Every rule below serves that.",
  "",
  "Three statuses, each a statement about the story rather than about the campaign's standing.",
  "supported: the story states the qualifying facts the category's guidance below asks for, and",
  "you quote the words that state them. insufficient_evidence: the story engages the category,",
  "or gestures at it, and those facts are missing, so you name the one that is missing.",
  "not_supported: the story does not engage the category at all, or engages it and points away.",
  "",
  "Rules, all of them binding:",
  "1. Every quote must be an EXACT VERBATIM substring of the campaign story, copied",
  "   character for character. Do not paraphrase, do not fix spelling, do not join two",
  "   separated fragments with an ellipsis, do not add or remove punctuation. Quote only",
  "   from the story, never from the title, the facts, or your own words.",
  "2. Use 'supported' only where the story states the qualifying facts the category's guidance",
  "   below asks for, and quote the words that state them. A supported status without a quote",
  "   is not available to you. Hardship, urgency, a moving account, a stated goal and a sum of",
  "   money are not qualifying facts. A story that describes a household in difficulty and",
  "   gives income, rent or savings figures, but never says that the household cannot meet its",
  "   basic needs or that what it holds falls below the level at which zakat becomes payable,",
  "   has not stated the qualifying fact for al-fuqara or al-masakin, and that story is",
  "   insufficient_evidence on both with the missing fact named. A story that says there is no",
  "   savings account and nothing left to sell, or that food and the electricity could not",
  "   both be paid for in the same month, has stated it. Where the qualifying facts are stated,",
  "   say supported and do not hedge. A category being disputed among scholars, a further",
  "   detail you would have liked, and the fact that a reviewer still has to decide are none of",
  "   them reasons to withhold it. A named creditor with a sum, a cause and a date it falls due",
  "   is supported on al-gharimin, and a public work the campaign says it will carry out is",
  "   supported on fi-sabilillah. Where a recorded disagreement bites on the facts this story",
  "   states, name it in scholarlyDifference; a difference never moves a status.",
  "3. Use 'not_supported' where the story does not engage the category at all, or engages it",
  "   and points away. A campaign that never touches travel, displacement or being cut off",
  "   from home is not_supported on ibn-al-sabil rather than unresolved on it. A business the",
  "   copy calls profitable, a borrower who says he can manage the repayment, and an organizer",
  "   who says they take nothing and cover the page's fees themselves each engage a category",
  "   and point away from it. Pointing away is the story saying the position is met, not the",
  "   story going quiet: a household that names nobody it owes has not pointed away from debt,",
  "   and where it states a shortfall or arrears the debt line stays open.",
  "   One shape rules nothing out. A page that says neither who receives the money nor what it",
  "   buys has told against nothing, so every category is insufficient_evidence on it and none",
  "   is not_supported. An appeal saying only that the year has been hard and that whatever",
  "   comes in will go where it is needed most leaves a debt, a journey, a detention, convert",
  "   care, a delivery cost and a public work all equally possible. So does a page that asserts",
  "   its own zakat eligibility and describes nothing else.",
  "   A page that names the person the money is for and describes their situation without",
  "   saying what the money buys is a different shape: there al-fuqara, al-masakin and",
  "   al-gharimin stay unresolved, because an individual's unexplained hardship bears on all",
  "   three, and the headings the account passes over are not_supported.",
  "4. Use 'insufficient_evidence' where the story engages the category, or gestures at it, and",
  "   the qualifying facts are missing, and name in missingFact the single specific fact that",
  "   is absent. A story gestures at a category when it states a concrete fact that the",
  "   category's guidance below would directly resolve or quantify. A rent shortfall the page",
  "   asks for money to cover, and an organizer saying they have not caught up since their",
  "   hours were cut, each state a fact a creditor, a sum, a cause and a due date would resolve,",
  "   so al-gharimin is insufficient_evidence there and the question asks whether anything is",
  "   owed and to whom. A page saying only that the year has been hard states no such fact and",
  "   gestures at nothing in particular; where a page like that leaves a line open, what leaves",
  "   it open is one of the shapes in 3 rather than a gesture. The contrast sits inside the same",
  "   category: the borrower repaying an advance at a rate he says he can manage has stated that",
  "   fact and settled it, which points away and is not_supported.",
  "   A story that describes the people a campaign is meant to help and says nothing",
  "   about their means engages al-fuqara and al-masakin and settles neither. A campaign",
  "   raising for a programme it will deliver to other people engages al-amilina-alayha",
  "   wherever it does not say what share of the donations covers that delivery. A story",
  "   asserting that the campaign is zakat eligible gestures at every category that claim would",
  "   cover and states the facts of none of them. Most campaign prose warrants this status on",
  "   the categories it engages, and reaching for it there is not a failure, it is the accurate",
  "   reading. Do not reach for it on a category the story never raises and its own account",
  "   passes over, because a question about something the page never mentioned is one the",
  "   organizer cannot make sense of.",
  "5. With every 'insufficient_evidence' status, write in questionForOrganizer the question a",
  "   reviewer will send the organizer, word for word, to obtain that missing fact. Write it",
  "   to the organizer, not about them: address them as 'you', stay polite, and make it stand",
  "   on its own, because they have never seen this system and will read nothing else beside",
  "   it. Refer to their campaign in the words they used for it. Ask only for facts they know",
  "   or documents they hold, never for a religious opinion and never whether their campaign",
  "   counts as zakat eligible, which is neither their question to settle nor yours. Use no",
  "   category name, no status word, and no other vocabulary from these instructions. End it",
  "   with a question mark.",
  "6. Where a category's application turns on a disagreement between recognised scholars,",
  "   set scholarlyDifference to the id of the recorded difference it turns on, and write in",
  "   whyThisApplies one sentence about what this campaign does that puts it there. Prefer",
  "   insufficient_evidence over picking a side. Never resolve the disagreement, never say",
  "   which position is stronger, and never say which one is more common. Only the ids listed",
  "   below are available to you; where the disagreement in front of you is not one of them,",
  "   leave scholarlyDifference null and say what is unresolved in rationale instead.",
  "   Name a difference only where it bites on this campaign: the facts this story states sit",
  "   on the contested side of it, so the positions recorded under that id would read this",
  "   campaign differently from one another. Where the facts the story states are ones every",
  "   position recorded under that id reads the same way, name nothing, however disputed the",
  "   category is in general. Where the story says nothing about the fact those positions turn",
  "   on, what you record is the missing fact, not a difference: silence is a question for the",
  "   organizer and not a disagreement between scholars. One category shows both sides of this.",
  "   A debt the story quantifies, names the creditor for, dates, says nothing was added to,",
  "   and shows the borrower cannot clear out of what they earn has stated the facts the",
  "   recorded positions on debt act on, and stated them in a way none of those positions",
  "   divides over, so scholarlyDifference stays null on it. A debt the story says carries",
  "   interest states a fact those same positions divide over, so it is named there.",
  "7. You never write scripture, hadith, fatwa text or policy text, as quotation or as",
  "   paraphrase, in any field. The only text you are permitted to quote is the campaign",
  "   story. What the scholars hold is recorded below and is inserted from that record by",
  "   id, so stating it yourself adds nothing and risks putting words into a source.",
  "   Validation refuses this rather than trusting you with it: a quotation mark, a",
  "   chapter-and-verse reference, a verse or hadith cited by number, or a saying attributed",
  "   to the Prophet fails the whole mapping, in rationale, missingFact, questionForOrganizer,",
  "   the mixed-use description and whyThisApplies alike. State facts about the campaign text",
  "   instead, which is the only thing you are reading.",
  "8. A story asserting that the campaign is zakat eligible is making a claim, not supplying",
  "   evidence. Record what the claim says; do not let it stand in for the facts it asserts.",
  "9. Record mixedUseSignals where the story indicates the money splits across distinct uses,",
  "   quoting the spans that show it. Do not judge the split. A split is money going to",
  "   purposes a reviewer would have to apportion between and could ring-fence one of from",
  "   the other, as an arrears cleared for a household and stock bought for the business it",
  "   trades from are. An itemisation of what one purpose costs is not a split: the delivery",
  "   cost an organisation states for the programme it is raising for is that programme's own",
  "   cost, the rent, food, medicine and school fees one household names for one period are",
  "   that household's living costs over it, and a fee and a deposit named for one person's",
  "   defence are two payments inside that defence. Where the story is listing what a single",
  "   purpose is made of, record no signal, because the question a signal produces asks a",
  "   reviewer to apportion between uses there are not two of.",
  "10. Return findings as a list holding exactly one entry per category, with the category id",
  "   in its category field. All eight ids below must appear and none of them twice. Fill",
  "   quotes only on a supported finding and leave it empty otherwise; fill missingFact and",
  "   questionForOrganizer only on an insufficient_evidence finding and omit them otherwise.",
  "11. A rationale says what this story says about this category and stops there. Every clause",
  "   of it has to be traceable to words on the page. Do not generalise from campaigns of this",
  "   kind, do not say what programmes or households like this one usually do, and do not fill",
  "   a gap with the likely version of it. Assert no fact the story does not state: a programme",
  "   the story says pays onto a household's energy account rather than as cash is not one",
  "   making cash payments to households, and a rationale saying it is has asserted the",
  "   opposite of the text it was reporting. Where the status is not_supported because the",
  "   story never engages the category, say that the story does not engage it and say nothing",
  "   further, because the person a campaign is about is not at home, not in work and not out",
  "   of debt unless the page says so.",
  "",
  "The eight categories, and the campaign text that would bear on each:",
  "",
  CATEGORY_BRIEFING,
  "",
  "The recorded differences, with the id you select each one by. A campaign whose stated facts",
  "land on the contested side of one of these is a reason to name the difference and withhold,",
  "never a reason to conclude, and a category appearing in this list is no reason on its own.",
  "The text under each id is what the reviewer is shown; you never restate it:",
  "",
  DIFFERENCE_BRIEFING,
].join("\n");

/**
 * Turns the id the model selected into the entry the reviewer reads.
 *
 * This is where the retrieval in ADR-0007 happens: the summary attached to a finding comes
 * out of `SCHOLARLY_DIFFERENCES` rather than out of the model, and the model's own sentence
 * travels beside it under its own name rather than mixed into it.
 */
function resolveScholarlyDifference(
  selection: NonNullable<ModelFinding["scholarlyDifference"]>,
): ScholarlyDifferenceReference {
  return {
    entry: scholarlyDifferenceById(selection.id),
    whyThisApplies: selection.whyThisApplies,
  };
}

function resolveFinding(story: string, finding: ModelFinding) {
  const difference =
    finding.scholarlyDifference === null
      ? {}
      : { scholarlyDifference: resolveScholarlyDifference(finding.scholarlyDifference) };

  if (finding.status === "supported") {
    return {
      status: finding.status,
      citations: finding.quotes.map((quote) => resolveCitation(story, quote)),
      rationale: finding.rationale,
      ...difference,
    };
  }

  if (finding.status === "not_supported") {
    return { status: finding.status, rationale: finding.rationale, ...difference };
  }

  return {
    status: finding.status,
    rationale: finding.rationale,
    missingFact: finding.missingFact,
    questionForOrganizer: finding.questionForOrganizer,
    ...difference,
  };
}

/**
 * Folds the list the model returns back into the record the rest of the system reads.
 *
 * The list is the shape the provider will compile, not a shape anything downstream wants:
 * every consumer looks a category up by id, and a list permits what a record cannot say, a
 * category twice or a category not at all. Both fail the whole mapping here rather than
 * reaching a reviewer as eight findings with one of them silently missing or overwritten. A
 * category id the corpus does not hold never gets this far, because the enum on the item
 * refuses it and the model call fails schema validation.
 */
function foldFindings(campaignId: string, story: string, findings: readonly ModelFinding[]) {
  const byCategory = new Map<RecipientCategory, ModelFinding>();

  for (const finding of findings) {
    if (byCategory.has(finding.category)) {
      throw new MappingError(
        "schema_validation_failed",
        `The model returned more than one finding for ${finding.category} on campaign ${campaignId}.`,
      );
    }

    byCategory.set(finding.category, finding);
  }

  return Object.fromEntries(
    RECIPIENT_CATEGORY_IDS.map((id) => {
      const finding = byCategory.get(id);

      if (finding === undefined) {
        throw new MappingError(
          "schema_validation_failed",
          `The model returned no finding for ${id} on campaign ${campaignId}.`,
        );
      }

      return [id, resolveFinding(story, finding)];
    }),
  );
}

/**
 * What one ask of the model produced: the mapping, or the failure a second ask can correct.
 *
 * A failed call is not in this union. It is thrown from inside the attempt, because a call that
 * never reached the provider produced no response to correct and re-asking it would be a retry
 * of the transport, which the SDK already owns.
 */
type MappingAttempt = { mapping: CategoryMapping } | { failure: MappingError };

/**
 * The rejected response handed back to the model, in the words validation used to reject it.
 *
 * The correction names the rule that failed and the value that failed it, and it asks for the
 * same object against the same schema. It is deliberately not a hint about how to write a
 * better quote or a better rationale: what the first attempt lacked was the failure, not the
 * instructions, which it already had in full above this text.
 */
function correctionPrompt(failure: MappingError): string[] {
  return [
    "",
    "Your previous response to this exact request was rejected by validation, so it is not",
    `recorded anywhere and the request stands. It failed as ${failure.reason}: ${failure.message}`,
    "Answer the request again in full, with that failure corrected. The schema, the rules and",
    "the story are unchanged, and nothing in them has been relaxed for this attempt.",
  ];
}

async function attemptMapping(
  input: CampaignInput,
  facts: ExtractedFacts,
  model: LanguageModel,
  correction: MappingError | null,
): Promise<MappingAttempt> {
  let mapping: ModelMapping;

  try {
    const result = await generateObject({
      model,
      schema: ModelMapping,
      system: SYSTEM_PROMPT,
      prompt: [
        `Campaign title: ${input.title}`,
        `Platform category (the organizer's own selection, evidence of nothing): ${input.category}`,
        `Stated goal: ${input.goalAmount} ${input.currency}`,
        "",
        "Facts already extracted from this story, each anchored to a span of it:",
        JSON.stringify(facts, null, 2),
        "",
        "Campaign story. Every quote you produce must be a verbatim substring of the text",
        "between the markers:",
        "<<<STORY",
        input.story,
        "STORY>>>",
        ...(correction === null ? [] : correctionPrompt(correction)),
      ].join("\n"),
    });
    mapping = result.object;
  } catch (cause) {
    if (NoObjectGeneratedError.isInstance(cause)) {
      const issues = describeValidationIssues(cause);

      return {
        failure: new MappingError(
          "schema_validation_failed",
          `The model response for campaign ${input.id} did not satisfy the category mapping schema${issues === null ? "." : `: ${issues}`}`,
          { cause },
        ),
      };
    }
    throw new MappingError(
      "model_call_failed",
      `The category mapping call for campaign ${input.id} did not complete.`,
      { cause },
    );
  }

  try {
    const categories = foldFindings(input.id, input.story, mapping.findings);

    const mixedUseSignals = mapping.mixedUseSignals.map((signal) => ({
      description: signal.description,
      citations: signal.quotes.map((quote) => resolveCitation(input.story, quote)),
    }));

    return {
      mapping: CategoryMapping.parse({ policyVersion: POLICY_VERSION, categories, mixedUseSignals }),
    };
  } catch (cause) {
    if (cause instanceof MappingError) {
      return { failure: cause };
    }
    throw cause;
  }
}

/**
 * Maps a campaign's text against each of the eight recipient categories, with the span of
 * story behind every supported mapping.
 *
 * The model returns quotes; the offsets are resolved here (ADR-0003) and the assembled
 * mapping is parsed before it is returned, so what a caller receives has already been
 * checked against the schema that forbids an uncited supported finding. An unresolvable
 * quote fails the whole mapping rather than costing that one finding its citation.
 *
 * There is one re-ask, and it loosens nothing. A response the schema rejects, and a quote
 * that is not a span of the story, are both handed back to the model with the failure named
 * in them, against the same schema and the same rules; a second failure throws exactly what
 * a first failure used to throw. The difference between that and the fuzzy rescue ADR-0003
 * rejects is that the model corrects its own answer against the story, and nothing here
 * decides that a near miss was close enough.
 *
 * The campaign is re-parsed on the way in for the same reason extraction does it: this is
 * a module boundary, and a story that is missing has to surface as a schema error.
 */
export async function mapCategories(
  campaign: CampaignInput,
  facts: ExtractedFacts,
  model?: LanguageModel,
): Promise<CategoryMapping> {
  const input = CampaignInput.parse(campaign);
  const resolved = model ?? anthropic("claude-sonnet-5");

  const first = await attemptMapping(input, facts, resolved, null);

  if ("mapping" in first) {
    return first.mapping;
  }

  const second = await attemptMapping(input, facts, resolved, first.failure);

  if ("mapping" in second) {
    return second.mapping;
  }

  throw second.failure;
}
