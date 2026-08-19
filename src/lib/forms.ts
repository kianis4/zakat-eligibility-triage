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
 * A submitted campaign as the form supplies it, which is `CampaignInput` without its id.
 *
 * The id is generated on the server. A form that carries one lets the submitter choose the
 * key that every triage run and every decision will hang off, and the campaign this system
 * stores has to be the campaign the platform submitted rather than the one a request named.
 *
 * The organizer is flat here because form fields are flat, and it is nested again on the way
 * into the row. The relationship is the one optional field, and an untouched input arrives as
 * the empty string rather than as absent, so it is turned back into absent explicitly: stored
 * as an empty string it would render as a declared relationship of nothing.
 */
export const NewCampaignForm = z.object({
  title: z.string().trim().min(1, { message: "A campaign needs a title." }),
  story: z.string().trim().min(1, { message: "There is nothing to triage without the story." }),
  category: z.string().trim().min(1, { message: "Record the platform category as submitted." }),
  goalAmount: z.coerce
    .number()
    .positive({ message: "The stated goal is an amount greater than zero." }),
  currency: z.string().trim().min(1, { message: "Record the currency the goal is stated in." }),
  organizerName: z.string().trim().min(1, { message: "Record who submitted the campaign." }),
  organizerLocation: z.string().trim().min(1, { message: "Record where the organizer is." }),
  organizerRelationshipToBeneficiary: z
    .string()
    .trim()
    .transform((relationship) => (relationship === "" ? undefined : relationship))
    .optional(),
});

export type NewCampaignForm = z.infer<typeof NewCampaignForm>;

export function campaignRowFrom(form: NewCampaignForm): NewCampaignRow {
  return {
    id: `cmp_${randomUUID()}`,
    title: form.title,
    story: form.story,
    category: form.category,
    goalAmount: form.goalAmount.toFixed(2),
    currency: form.currency,
    organizerName: form.organizerName,
    organizerLocation: form.organizerLocation,
    organizerRelationshipToBeneficiary: form.organizerRelationshipToBeneficiary ?? null,
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
