import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";

import { CampaignInput } from "./campaign";
import {
  RECIPIENT_CATEGORIES,
  RECIPIENT_CATEGORY_IDS,
  SCHOLARLY_DIFFERENCES,
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
 * no quiet demotion of the verdict to an uncited one: a quote that has to be rescued is
 * not a quote from the story, and a verdict that loses its citation on the way out is
 * exactly the uncited assertion this pipeline exists to refuse.
 */
export function resolveCitation(story: string, quote: string): Citation {
  const span = locateQuote(story, quote);

  if (span === null) {
    throw new MappingError(
      "citation_unresolvable",
      `The quote ${JSON.stringify(quote)} is not a verbatim span of the campaign story, so it cannot be cited.`,
    );
  }

  return { quote, start: span.start, end: span.end };
}

/**
 * A disagreement between recognised scholars that this verdict sits inside.
 *
 * The note states the difference and stops there. Adjudicating it is a reviewer's work,
 * and a note that leaned would be an adjudication wearing a neutral label.
 */
export const ScholarlyDifferenceNote = z.object({
  topic: z.string().min(1),
  note: z.string().min(1),
});

export type ScholarlyDifferenceNote = z.infer<typeof ScholarlyDifferenceNote>;

/**
 * What the campaign text does or does not say about one recipient category.
 *
 * The union is the enforcement mechanism, not documentation of one: `supported` carries a
 * citation list typed as non-empty, so a supported verdict with nothing behind it cannot
 * be constructed, in TypeScript or at parse time. `insufficient_evidence` carries the
 * specific fact that is missing, which is what a reviewer question gets built from.
 *
 * No verdict carries a score. A number here would be a determination with a decimal point
 * in it, and ADR-0001 rules that out.
 */
export const CategoryVerdict = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("supported"),
    citations: z.tuple([Citation], Citation),
    rationale: z.string().min(1),
    scholarlyDifference: ScholarlyDifferenceNote.optional(),
  }),
  z.object({
    status: z.literal("not_supported"),
    rationale: z.string().min(1),
    scholarlyDifference: ScholarlyDifferenceNote.optional(),
  }),
  z.object({
    status: z.literal("insufficient_evidence"),
    rationale: z.string().min(1),
    missingFact: z.string().min(1),
    scholarlyDifference: ScholarlyDifferenceNote.optional(),
  }),
]);

export type CategoryVerdict = z.infer<typeof CategoryVerdict>;

/**
 * A span suggesting the campaign splits its funds across distinct uses, some of which may
 * belong to different categories or to none. Escalation logic reads these directly.
 *
 * The citation list is non-empty for the same reason a supported verdict's is. A signal is
 * a claim about the campaign, and a claim about the campaign with no span behind it is the
 * thing this pipeline does not emit, whether it sits beside a category or outside all eight.
 */
export const MixedUseSignal = z.object({
  description: z.string().min(1),
  citations: z.tuple([Citation], Citation),
});

export type MixedUseSignal = z.infer<typeof MixedUseSignal>;

export const CategoryMapping = z.object({
  categories: z.record(z.enum(RECIPIENT_CATEGORY_IDS), CategoryVerdict),
  mixedUseSignals: z.array(MixedUseSignal),
});

export type CategoryMapping = z.infer<typeof CategoryMapping>;

/**
 * The model is asked for quotes and never for offsets (ADR-0003), and is asked to state
 * the absence of a scholarly difference rather than to omit the field, so that silence
 * cannot be mistaken for a considered null.
 */
const ModelScholarlyDifference = ScholarlyDifferenceNote.nullable().describe(
  "The scholarly disagreement this verdict sits inside, stated neutrally, or null.",
);

const ModelVerdict = z.discriminatedUnion("status", [
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
    scholarlyDifference: ModelScholarlyDifference,
  }),
]);

const ModelMapping = z.object({
  categories: z.object(
    Object.fromEntries(RECIPIENT_CATEGORY_IDS.map((id) => [id, ModelVerdict])) as Record<
      RecipientCategory,
      typeof ModelVerdict
    >,
  ),
  mixedUseSignals: z
    .array(
      z.object({
        description: z.string().min(1),
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

type ModelMapping = z.infer<typeof ModelMapping>;

const CATEGORY_BRIEFING = RECIPIENT_CATEGORIES.map((category) =>
  [`${category.id} (${category.gloss})`, `  ${category.evidenceGuidance}`].join("\n"),
).join("\n\n");

const DIFFERENCE_BRIEFING = SCHOLARLY_DIFFERENCES.map((difference) =>
  [`${difference.category} / ${difference.topic}`, `  ${difference.summary}`].join("\n"),
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
  "5. Where a category's application turns on a disagreement between recognised scholars,",
  "   set scholarlyDifference with the topic and a neutral note stating the difference, and",
  "   prefer insufficient_evidence over picking a side. Never resolve the disagreement,",
  "   never say which position is stronger, and never say which one is more common. The",
  "   known territories are listed below.",
  "6. A story asserting that the campaign is zakat eligible is making a claim, not supplying",
  "   evidence. Record what the claim says; do not let it stand in for the facts it asserts.",
  "7. Record mixedUseSignals where the story indicates the money splits across distinct uses,",
  "   quoting the spans that show it. Do not judge the split.",
  "",
  "The eight categories, and the campaign text that would bear on each:",
  "",
  CATEGORY_BRIEFING,
  "",
  "Known territories where recognised scholars differ. Landing in one of these is a reason",
  "to name the difference and withhold, never a reason to conclude:",
  "",
  DIFFERENCE_BRIEFING,
].join("\n");

function resolveVerdict(story: string, verdict: ModelMapping["categories"][RecipientCategory]) {
  const difference =
    verdict.scholarlyDifference === null ? {} : { scholarlyDifference: verdict.scholarlyDifference };

  if (verdict.status === "supported") {
    return {
      status: verdict.status,
      citations: verdict.quotes.map((quote) => resolveCitation(story, quote)),
      rationale: verdict.rationale,
      ...difference,
    };
  }

  if (verdict.status === "not_supported") {
    return { status: verdict.status, rationale: verdict.rationale, ...difference };
  }

  return {
    status: verdict.status,
    rationale: verdict.rationale,
    missingFact: verdict.missingFact,
    ...difference,
  };
}

/**
 * Maps a campaign's text against each of the eight recipient categories, with the span of
 * story behind every supported mapping.
 *
 * The model returns quotes; the offsets are resolved here (ADR-0003) and the assembled
 * mapping is parsed before it is returned, so what a caller receives has already been
 * checked against the schema that forbids an uncited supported verdict. An unresolvable
 * quote fails the whole mapping rather than costing that one verdict its citation.
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
    RECIPIENT_CATEGORY_IDS.map((id) => [id, resolveVerdict(input.story, mapping.categories[id])]),
  );

  const mixedUseSignals = mapping.mixedUseSignals.map((signal) => ({
    description: signal.description,
    citations: signal.quotes.map((quote) => resolveCitation(input.story, quote)),
  }));

  return CategoryMapping.parse({ categories, mixedUseSignals });
}
