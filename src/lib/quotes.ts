export type QuoteSpan = { start: number; end: number };

/**
 * Finds where a quote sits in the text it claims to come from, or reports that it does
 * not sit there at all.
 *
 * Every model-facing schema in this pipeline asks for verbatim quotes and nothing else,
 * because a model that is asked for character offsets will produce numbers that look
 * right and are not. Locating the quote afterwards is the one step that can actually be
 * checked, and it is the same step whether the caller wants a yes-or-no verbatim check
 * (extraction) or the offsets themselves (mapping).
 *
 * A quote that appears more than once resolves to its first occurrence. The occurrences
 * are identical text, so a reviewer following the span reads the same words either way,
 * and picking the first keeps the resolution deterministic instead of asking the model
 * which one it meant.
 */
export function locateQuote(source: string, quote: string): QuoteSpan | null {
  const start = source.indexOf(quote);

  if (start === -1) {
    return null;
  }

  return { start, end: start + quote.length };
}
