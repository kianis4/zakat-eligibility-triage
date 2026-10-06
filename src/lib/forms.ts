import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { NewCampaignRow } from "../db/schema";
import { CHECK_ERRORS, type CheckErrorCode } from "./check-errors";

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

/** The largest amount `goal_amount`, a numeric(14,2), can hold. */
const MAX_GOAL = 999_999_999_999.99;

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
    .min(1, { message: CHECK_ERRORS["title-missing"] })
    .max(300, { message: CHECK_ERRORS["title-too-long"] }),
  story: z
    .string()
    .trim()
    .min(1, { message: CHECK_ERRORS["story-missing"] })
    .max(20000, { message: CHECK_ERRORS["story-too-long"] }),
  category: optionalText(100, CHECK_ERRORS["category-too-long"]),
  goalAmount: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ message: CHECK_ERRORS["goal-invalid"] })
      .positive({ message: CHECK_ERRORS["goal-invalid"] })
      .max(MAX_GOAL, { message: CHECK_ERRORS["goal-invalid"] })
      .refine((value) => Number(value.toFixed(2)) === value, { message: CHECK_ERRORS["goal-invalid"] })
      .optional(),
  ),
  currency: optionalText(10, CHECK_ERRORS["currency-too-long"]),
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
 * The first thing wrong with the submission, as the code for the words the schema used.
 *
 * One code rather than all of them, because it is going into a query string and back onto
 * the page above the form. An issue the app wrote no words for, such as a field that is not a
 * string at all, is the generic code.
 */
export function firstIssueCode(error: z.ZodError): CheckErrorCode {
  const message = error.issues[0]?.message;
  const code = (Object.keys(CHECK_ERRORS) as CheckErrorCode[]).find(
    (candidate) => CHECK_ERRORS[candidate] === message,
  );

  return code ?? "invalid";
}
