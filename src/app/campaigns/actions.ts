"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDatabase, isDatabaseConfigured } from "../../db/index";
import { runCheck } from "../../lib/check";
import type { CheckErrorCode } from "../../lib/check-errors";
import { fieldsOf } from "../../lib/forms";
import { clientIp, quotaLimits } from "../../lib/quota";

/**
 * The write side of the app: one step, from a pasted campaign to its result page.
 *
 * Everything arrives as form strings and is parsed by a schema before it reaches a query. A
 * failure sends the donor back to the paste form with the reason on it, rather than to a stack
 * trace, and leaves nothing stored. Only the reason's code goes in the link, and the form looks
 * its words up, so a link cannot carry text of its own onto the page.
 */

function backToForm(code: CheckErrorCode): never {
  redirect(`/?error=${encodeURIComponent(code)}`);
}

export async function checkCampaign(formData: FormData): Promise<void> {
  const result = await runCheck(fieldsOf(formData), {
    db: isDatabaseConfigured() ? getDatabase() : null,
    quota: {
      secret: process.env.IP_HASH_SECRET,
      ip: async () => clientIp(await headers()),
      limits: quotaLimits(process.env),
    },
  });

  if (!result.ok) {
    backToForm(result.code);
  }

  redirect(`/campaigns/${encodeURIComponent(result.campaignId)}`);
}
