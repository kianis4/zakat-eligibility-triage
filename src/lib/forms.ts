import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { NewCampaignRow } from "../db/schema";

/**
 * A form's fields as strings, which is the only thing a form ever submits.
 *
 * Files and repeated fields are dropped rather than coerced. Nothing on these forms is
 * either, and turning a `File` into the string `[object File]` on the way to a schema would
 * make a mistyped input arrive as a plausible value.
 */
export function fieldsOf(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") {
      fields[name] = value;
    }
  }

  return fields;
}

/**
 * A field the donor may leave blank. An untouched input arrives as the empty string rather than
 * as absent, so it is turned back into absent explicitly: stored as an empty string it would
 * render as a category of nothing.
 */
function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, { message })
    .transform((value) => (value === "" ? undefined : value))
    .optional();
}

/**
 * A campaign as a donor pastes it, which is `CampaignInput` without its id or its organizer.
 *
 * The id is generated on the server. A form that carries one lets the submitter choose the
 * key that the agent file and the shared link hang off.
 *
 * Only the title and the story are required, because they are what every campaign page shows.
 * The lengths bound what a single paste can cost, and are generous for a real campaign page.
 */
export const NewCampaignForm = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: "A campaign needs a title." })
    .max(300, { message: "That title is longer than 300 characters. Paste the campaign's title only." }),
  story: z
    .string()
    .trim()
    .min(1, { message: "There is nothing to check without the story." })
    .max(20000, { message: "That story is longer than 20,000 characters. Paste the campaign's story only." }),
  category: optionalText(100, "That category is longer than 100 characters."),
  goalAmount: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number()
      .positive({ message: "The stated goal is an amount greater than zero." })
      .optional(),
  ),
  currency: optionalText(10, "That currency is longer than 10 characters."),
});

export type NewCampaignForm = z.infer<typeof NewCampaignForm>;

export function campaignRowFrom(form: NewCampaignForm): NewCampaignRow {
  return {
    id: `cmp_${randomUUID()}`,
    title: form.title,
    story: form.story,
    category: form.category ?? null,
    goalAmount: form.goalAmount?.toFixed(2) ?? null,
    currency: form.currency ?? null,
  };
}

/**
 * The first thing wrong with the submission, in the words the schema used.
 *
 * One message rather than all of them, because it is going into a query string and back onto
 * the page above the form. A reviewer fixes the first problem and resubmits.
 */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "The submission could not be read.";
}
