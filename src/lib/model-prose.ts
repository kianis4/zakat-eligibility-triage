import { z } from "zod";

/**
 * The shape guard on every free-text field a model fills.
 *
 * ADR-0007 keeps model-authored text out of citation position: what a scholar holds is
 * retrieved from the corpus by id, and what the campaign says is a byte-checked span. The
 * model still writes prose elsewhere, and prose is where a fabricated verse or narration
 * arrives. Bouchekif et al. measured models reasoning from Qur'anic verses and prophetic
 * narrations that exist in no canonical collection, so a field that merely says "one or two
 * sentences" is an opening.
 *
 * What this catches is a shape, not a meaning:
 *
 * - text inside double quotation marks, straight or curly, and a curly opening single quote,
 *   which is how quoted source text arrives;
 * - a chapter-and-verse reference, a number and a number separated by a colon;
 * - a source word (surah, ayah, verse, hadith, narration and their spellings) sitting within
 *   a clause of a digit, which is the citation construction;
 * - a saying attributed to the Prophet, the Messenger or God by a reporting verb.
 *
 * What it cannot catch, and no schema can, is an unquoted paraphrase: a sentence that states
 * what a source says in the model's own words carries the same authority to a reader and has
 * no shape to match on. That residual is stated in ADR-0007 and is answered by the rule that
 * model prose is always rendered as the model's own prose, never as quotation or citation.
 *
 * The straight apostrophe is deliberately left alone. It is the possessive in ordinary
 * English and in the transliterations this domain is full of, and banning it would reject
 * more honest sentences than dishonest ones.
 */
const QUOTATION = /["“”‘]/;
const CHAPTER_AND_VERSE = /\b\d{1,3}\s*:\s*\d{1,3}\b/;
const SOURCE_WORD_NEAR_A_NUMBER =
  /\b(sura|surah|surat|aya|ayah|ayat|verse|hadith|hadeeth|narration)\b[^.!?]{0,40}\d/i;
const ATTRIBUTED_SAYING =
  /\b(the\s+)?(prophet|messenger|allah|god)\b[^.!?]{0,24}\b(said|says|stated|commanded|revealed|narrated)\b/i;

export const SOURCE_QUOTATION_MESSAGE =
  "This field carries the model's own words about the campaign. Scripture, hadith, fatwa text and policy text are never quoted or cited here, in any field.";

/**
 * Whether a string is shaped like quoted or cited source text.
 *
 * Exported so a test can probe it directly. A caller deciding what to do with the answer
 * should not exist: every model-authored field runs it through `modelProse` and fails
 * closed.
 */
export function quotesOrCitesASource(text: string): boolean {
  return (
    QUOTATION.test(text) ||
    CHAPTER_AND_VERSE.test(text) ||
    SOURCE_WORD_NEAR_A_NUMBER.test(text) ||
    ATTRIBUTED_SAYING.test(text)
  );
}

/**
 * Wraps a string schema so the field it types cannot carry quoted or cited source text.
 *
 * Applied to every field the model writes prose into, on the model-facing schema and on the
 * output schema both, because the output is what a reviewer reads and a value can reach it
 * from a fixture as well as from a model.
 */
export function modelProse<Schema extends z.ZodType<string, string>>(schema: Schema) {
  return schema.refine((text) => !quotesOrCitesASource(text), {
    message: SOURCE_QUOTATION_MESSAGE,
  });
}
