"use server";

import { redirect } from "next/navigation";

import { getDatabase, isDatabaseConfigured } from "../../db/index";
import { runCheck } from "../../lib/check";
import { fieldsOf } from "../../lib/forms";

/**
 * The write side of the app: one step, from a pasted campaign to its result page.
 *
 * Everything arrives as form strings and is parsed by a schema before it reaches a query. A
 * failure sends the donor back to the paste form with the reason on it, rather than to a stack
 * trace, and leaves nothing stored.
 */

function backToForm(reason: string): never {
  redirect(`/?error=${encodeURIComponent(reason)}`);
}

export async function checkCampaign(formData: FormData): Promise<void> {
  const result = await runCheck(fieldsOf(formData), {
    db: isDatabaseConfigured() ? getDatabase() : null,
  });

  if (!result.ok) {
    backToForm(result.reason);
  }

  redirect(`/campaigns/${encodeURIComponent(result.campaignId)}`);
}
