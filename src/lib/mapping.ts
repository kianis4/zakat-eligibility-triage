import { z } from "zod";

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
