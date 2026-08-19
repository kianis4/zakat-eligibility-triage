import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";

import { CampaignInput } from "./campaign";
import { locateQuote } from "./quotes";
import { describeValidationIssues } from "./validation-detail";

const Quote = z.string().min(1).describe("A verbatim substring of the campaign story.");

export const ExtractedFacts = z.object({
  beneficiary: z.object({
    kind: z.enum([
      "self",
      "family_member",
      "named_third_party",
      "organization",
      "community",
      "unclear",
    ]),
    description: z.string().describe("Who the funds are for, in the story's own terms."),
  }),
  statedPurposes: z
    .array(z.object({ purpose: z.string(), quote: Quote }))
    .describe("What the story says the money is for."),
  amountsMentioned: z
    .array(
      z.object({
        amount: z.number(),
        currency: z.string().nullable(),
        quote: Quote,
      }),
    )
    .describe("Sums of money named anywhere in the story."),
  organizerRoleClaim: z
    .object({ claim: z.string(), quote: Quote })
    .nullable()
    .describe("The relationship to the beneficiary the story itself claims, or null."),
  hardshipClaims: z
    .array(z.object({ claim: z.string(), quote: Quote }))
    .describe("Claims of debt, poverty, displacement, being stranded, and the like."),
  explicitZakatClaim: z
    .object({ present: z.boolean(), quote: Quote.nullable() })
    .describe("Whether the story itself asserts that the campaign is zakat eligible."),
  fundRecipient: z
    .object({
      recipient: z.enum(["organizer", "beneficiary_directly", "organization", "unstated"]),
      quote: Quote.nullable(),
    })
    .describe("Who the story says actually receives the money."),
});

export type ExtractedFacts = z.infer<typeof ExtractedFacts>;

export type ExtractionFailureReason =
  | "model_call_failed"
  | "schema_validation_failed"
  | "quote_not_verbatim";

export class ExtractionError extends Error {
  readonly reason: ExtractionFailureReason;

  constructor(reason: ExtractionFailureReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExtractionError";
    this.reason = reason;
  }
}

const SYSTEM_PROMPT = [
  "You read a crowdfunding campaign story and record the factual claims it makes.",
  "",
  "Rules, all of them binding:",
  "1. Every quote field must be an EXACT VERBATIM substring of the campaign story, copied",
  "   character for character. Do not paraphrase, do not fix spelling, do not join two",
  "   separated fragments with an ellipsis, do not add or remove punctuation. Copy the span",
  "   out of the story as it stands there, keeping its capitalisation, its punctuation and",
  "   whatever spelling the organizer used, and normalise nothing: a quote that reads more",
  "   smoothly than the story does is a quote you have rewritten, and it fails the whole",
  "   extraction.",
  "2. Record only what the text states. Do not infer, complete, or guess at anything the",
  "   story leaves unsaid. If the story does not say it, it is not a fact you may record.",
  "3. Do not assess zakat eligibility, worthiness, or merit, and do not weigh the claims",
  "   against each other. Deciding is not this module's job and not yours.",
  "4. If a field has nothing to record, use an empty array or null rather than inventing a",
  "   plausible value. Absent evidence is itself a finding a reviewer needs to see.",
].join("\n");

type QuoteSite = { path: string; quote: string };

function quoteSites(facts: ExtractedFacts): QuoteSite[] {
  const sites: QuoteSite[] = [];

  facts.statedPurposes.forEach((entry, index) => {
    sites.push({ path: `statedPurposes[${index}].quote`, quote: entry.quote });
  });
  facts.amountsMentioned.forEach((entry, index) => {
    sites.push({ path: `amountsMentioned[${index}].quote`, quote: entry.quote });
  });
  facts.hardshipClaims.forEach((entry, index) => {
    sites.push({ path: `hardshipClaims[${index}].quote`, quote: entry.quote });
  });
  if (facts.organizerRoleClaim !== null) {
    sites.push({ path: "organizerRoleClaim.quote", quote: facts.organizerRoleClaim.quote });
  }
  if (facts.explicitZakatClaim.quote !== null) {
    sites.push({ path: "explicitZakatClaim.quote", quote: facts.explicitZakatClaim.quote });
  }
  if (facts.fundRecipient.quote !== null) {
    sites.push({ path: "fundRecipient.quote", quote: facts.fundRecipient.quote });
  }

  return sites;
}

/**
 * What one ask of the model produced: the facts, or the failure a second ask can correct.
 *
 * A failed call is not in this union. It is thrown from inside the attempt, because a call that
 * never reached the provider produced no response to correct and re-asking it would be a retry
 * of the transport, which the SDK already owns.
 */
type ExtractionAttempt = { facts: ExtractedFacts } | { failure: ExtractionError };

/**
 * The rejected response handed back to the model, in the words validation used to reject it.
 *
 * The correction names the rule that failed and the value that failed it, and it asks for the
 * same object against the same schema. It is deliberately not a hint about how to write a
 * better quote: what the first attempt lacked was the failure, not the instructions, which it
 * already had in full above this text.
 */
function correctionPrompt(failure: ExtractionError): string[] {
  return [
    "",
    "Your previous response to this exact request was rejected by validation, so it is not",
    `recorded anywhere and the request stands. It failed as ${failure.reason}: ${failure.message}`,
    "Answer the request again in full, with that failure corrected. The schema, the rules and",
    "the story are unchanged, and nothing in them has been relaxed for this attempt.",
  ];
}

async function attemptExtraction(
  input: CampaignInput,
  model: LanguageModel,
  correction: ExtractionError | null,
): Promise<ExtractionAttempt> {
  let facts: ExtractedFacts;

  try {
    const result = await generateObject({
      model,
      schema: ExtractedFacts,
      system: SYSTEM_PROMPT,
      prompt: [
        `Campaign title: ${input.title}`,
        `Platform category: ${input.category}`,
        `Stated goal: ${input.goalAmount} ${input.currency}`,
        "",
        "Campaign story:",
        input.story,
        ...(correction === null ? [] : correctionPrompt(correction)),
      ].join("\n"),
    });
    facts = result.object;
  } catch (cause) {
    if (NoObjectGeneratedError.isInstance(cause)) {
      const issues = describeValidationIssues(cause);

      return {
        failure: new ExtractionError(
          "schema_validation_failed",
          `The model response for campaign ${input.id} did not satisfy the ExtractedFacts schema${issues === null ? "." : `: ${issues}`}`,
          { cause },
        ),
      };
    }
    throw new ExtractionError(
      "model_call_failed",
      `The extraction call for campaign ${input.id} did not complete.`,
      { cause },
    );
  }

  const fabricated = quoteSites(facts).filter(
    (site) => locateQuote(input.story, site.quote) === null,
  );

  if (fabricated.length > 0) {
    const detail = fabricated.map((site) => `${site.path}: ${JSON.stringify(site.quote)}`);

    return {
      failure: new ExtractionError(
        "quote_not_verbatim",
        `The model response for campaign ${input.id} contains quotes that are not verbatim spans of the story: ${detail.join("; ")}`,
      ),
    };
  }

  return { facts };
}

/**
 * Extracts the factual claims a campaign story makes, each one anchored to the span of
 * text that carries it.
 *
 * A quote that is not a verbatim span of the story is treated as a hard failure rather
 * than a blemish to be tidied up. The whole point of the record is that a reviewer can
 * follow every claim back to the words the organizer wrote; a quote the model composed
 * looks identical to a real one on the page, so accepting it would silently break the
 * only guarantee this module offers. For the same reason there is no repair pass and no
 * retry against a looser schema.
 *
 * There is one re-ask, and it loosens nothing. A response that fails validation is handed
 * back to the model with the failure named in it, against the same schema and the same
 * rules, and a second failure throws exactly what a first failure used to throw. The
 * difference between that and the fuzzy rescue ADR-0003 rejects is that the model corrects
 * its own answer against the story; nothing here decides that a near miss was close enough.
 *
 * The campaign is re-parsed on the way in. This is the module boundary, where a raw
 * request body can arrive already cast to the type, and a story that is missing has to
 * surface as a schema error naming the field rather than as a `TypeError` thrown much
 * later inside quote validation.
 */
export async function extractFacts(
  campaign: CampaignInput,
  model?: LanguageModel,
): Promise<ExtractedFacts> {
  const input = CampaignInput.parse(campaign);
  const resolved = model ?? anthropic("claude-sonnet-5");

  const first = await attemptExtraction(input, resolved, null);

  if ("facts" in first) {
    return first.facts;
  }

  const second = await attemptExtraction(input, resolved, first.failure);

  if ("facts" in second) {
    return second.facts;
  }

  throw second.failure;
}
