import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";

import { CampaignInput } from "./campaign";
import {
  RECIPIENT_CATEGORIES,
  RECIPIENT_CATEGORY_IDS,
  SCHOLARLY_DIFFERENCES,
  SCHOLARLY_DIFFERENCE_IDS,
  scholarlyDifferenceById,
  type RecipientCategory,
} from "./categories";
import type { ExtractedFacts } from "./extraction";
import { locateQuote } from "./quotes";

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
 * It is the only prose the model writes anywhere near a scholarly disagreement, and it is
 * about the campaign rather than about the disagreement: the positions come from the
 * corpus. The bounds are what keep it that way. One sentence has no room for an account of
 * a school's reasoning, and a quotation mark or a chapter-and-verse reference is the shape
 * scripture arrives in, so both are refused rather than trusted to be harmless. See
 * ADR-0007.
 */
const WhyThisApplies = z
  .string()
  .min(12)
  .max(240)
  .refine((why) => why === why.trim(), {
    message: "The sentence is stored as it will be read, without surrounding whitespace.",
  })
  .refine((why) => (why.match(/[.!?](\s|$)/g) ?? []).length <= 1, {
    message: "Why a campaign sits inside a difference is one sentence, not an account of it.",
  })
  .refine((why) => !/["“”]/.test(why) && !/\b\d{1,3}:\d{1,3}\b/.test(why), {
    message:
      "This field carries no quotation and no chapter-and-verse reference. Scripture, fatwa text and policy text are never written here.",
  });

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
 * reached by id. The model selects which one applies and says why in one sentence; it never
 * states what the difference is. That split is the whole point, and ADR-0007 is where it is
 * argued.
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
 * A question a reviewer can forward to the organizer exactly as it stands.
 *
 * Most of what makes the question sendable cannot be checked here. Whether it is polite,
 * self-contained, answerable with facts rather than with a religious opinion, and phrased in
 * the organizer's own terms is a matter of reading it, and the prompt is where that is asked
 * for. What a schema can check is checked, because these are the failures that would reach
 * an organizer's inbox unnoticed: a statement dressed as a request, whitespace from whatever
 * assembled it, and our internal vocabulary leaking out of the file it belongs in.
 */
export const OrganizerQuestion = z
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
  );

export type OrganizerQuestion = z.infer<typeof OrganizerQuestion>;

/**
 * What the campaign text does or does not say about one recipient category.
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
    rationale: z.string().min(1),
    scholarlyDifference: ScholarlyDifferenceReference.optional(),
  }),
  z.object({
    status: z.literal("not_supported"),
    rationale: z.string().min(1),
    scholarlyDifference: ScholarlyDifferenceReference.optional(),
  }),
  z.object({
    status: z.literal("insufficient_evidence"),
    rationale: z.string().min(1),
    missingFact: z.string().min(1),
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
export const MixedUseDescription = z
  .string()
  .min(12, { message: "A description of a split says what the money is split between." })
  .refine((description) => (description.match(/\p{L}{2,}/gu) ?? []).length >= 2, {
    message: "A description of a split names the distinct uses the money goes to.",
  });

export type MixedUseDescription = z.infer<typeof MixedUseDescription>;

export const MixedUseSignal = z.object({
  description: MixedUseDescription,
  citations: z.tuple([Citation], Citation),
});

export type MixedUseSignal = z.infer<typeof MixedUseSignal>;

export const CategoryMapping = z.object({
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
  .describe("The recorded difference this finding sits inside, selected by id, or null.");

const ModelFinding = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("supported"),
    quotes: z
      .array(z.string().min(1))
      .min(1)
      .describe("Verbatim spans of the story that support this category. At least one."),
    rationale: z.string().min(1).describe("What the quoted text says, in one or two sentences."),
    scholarlyDifference: ModelScholarlyDifference,
  }),
  z.object({
    status: z.literal("not_supported"),
    rationale: z.string().min(1).describe("Why the story does not bear on this category."),
    scholarlyDifference: ModelScholarlyDifference,
  }),
  z.object({
    status: z.literal("insufficient_evidence"),
    rationale: z.string().min(1).describe("What is unresolved about this category."),
    missingFact: z
      .string()
      .min(1)
      .describe("The one specific fact the story does not state, in a single sentence."),
    questionForOrganizer: OrganizerQuestion.describe(
      "The question a reviewer sends the organizer, word for word, to obtain that fact.",
    ),
    scholarlyDifference: ModelScholarlyDifference,
  }),
]);

/**
 * Everything the model is permitted to return, and the surface a test reads to check that
 * the permission is what ADR-0007 says it is.
 */
export const ModelMapping = z.object({
  categories: z.object(
    Object.fromEntries(RECIPIENT_CATEGORY_IDS.map((id) => [id, ModelFinding])) as Record<
      RecipientCategory,
      typeof ModelFinding
    >,
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
  "Rules, all of them binding:",
  "1. Every quote must be an EXACT VERBATIM substring of the campaign story, copied",
  "   character for character. Do not paraphrase, do not fix spelling, do not join two",
  "   separated fragments with an ellipsis, do not add or remove punctuation. Quote only",
  "   from the story, never from the title, the facts, or your own words.",
  "2. Use status 'supported' only when the story itself says something that bears on the",
  "   category, and quote it. A supported status without a quote is not available to you.",
  "3. Use 'not_supported' when the story bears on the category and tells against it, or when",
  "   the category is plainly not in play.",
  "4. Use 'insufficient_evidence' when the category might be in play but the story does not",
  "   say enough to tell, and name in missingFact the single specific fact that is absent.",
  "   Most campaign prose warrants this status on most categories. Reaching for it is not a",
  "   failure, it is the accurate reading.",
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
  "7. You never write scripture, hadith, fatwa text or policy text, as quotation or as",
  "   paraphrase, in any field. The only text you are permitted to quote is the campaign",
  "   story. What the scholars hold is recorded below and is inserted from that record by",
  "   id, so stating it yourself adds nothing and risks putting words into a source.",
  "8. A story asserting that the campaign is zakat eligible is making a claim, not supplying",
  "   evidence. Record what the claim says; do not let it stand in for the facts it asserts.",
  "9. Record mixedUseSignals where the story indicates the money splits across distinct uses,",
  "   quoting the spans that show it. Do not judge the split.",
  "",
  "The eight categories, and the campaign text that would bear on each:",
  "",
  CATEGORY_BRIEFING,
  "",
  "The recorded differences, with the id you select each one by. Landing in one of these is a",
  "reason to name the difference and withhold, never a reason to conclude. The text under each",
  "id is what the reviewer is shown; you never restate it:",
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
  selection: NonNullable<ModelMapping["categories"][RecipientCategory]["scholarlyDifference"]>,
): ScholarlyDifferenceReference {
  return {
    entry: scholarlyDifferenceById(selection.id),
    whyThisApplies: selection.whyThisApplies,
  };
}

function resolveFinding(story: string, finding: ModelMapping["categories"][RecipientCategory]) {
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
 * Maps a campaign's text against each of the eight recipient categories, with the span of
 * story behind every supported mapping.
 *
 * The model returns quotes; the offsets are resolved here (ADR-0003) and the assembled
 * mapping is parsed before it is returned, so what a caller receives has already been
 * checked against the schema that forbids an uncited supported finding. An unresolvable
 * quote fails the whole mapping rather than costing that one finding its citation.
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
  let mapping: ModelMapping;

  try {
    const result = await generateObject({
      model: model ?? anthropic("claude-sonnet-5"),
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
      ].join("\n"),
    });
    mapping = result.object;
  } catch (cause) {
    if (NoObjectGeneratedError.isInstance(cause)) {
      throw new MappingError(
        "schema_validation_failed",
        `The model response for campaign ${input.id} did not satisfy the category mapping schema.`,
        { cause },
      );
    }
    throw new MappingError(
      "model_call_failed",
      `The category mapping call for campaign ${input.id} did not complete.`,
      { cause },
    );
  }

  const categories = Object.fromEntries(
    RECIPIENT_CATEGORY_IDS.map((id) => [id, resolveFinding(input.story, mapping.categories[id])]),
  );

  const mixedUseSignals = mapping.mixedUseSignals.map((signal) => ({
    description: signal.description,
    citations: signal.quotes.map((quote) => resolveCitation(input.story, quote)),
  }));

  return CategoryMapping.parse({ categories, mixedUseSignals });
}
