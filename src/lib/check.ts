import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";

import type { TriageDatabase } from "../db/index";
import { campaigns } from "../db/schema";
import { campaignRowFrom, firstIssue, NewCampaignForm } from "./forms";
import { runTriage } from "./triage";

export type CheckOptions = {
  /** Null when the deployment has no database, which is reported after validation. */
  db: TriageDatabase | null;
  /** Defaults to the model `runTriage` defaults to. */
  model?: LanguageModel;
};

export type CheckResult =
  | { readonly ok: true; readonly campaignId: string }
  | { readonly ok: false; readonly reason: string };

/**
 * The one step a donor takes: paste a campaign, get its agent file.
 *
 * The submission is validated before anything is stored or any model is called. A campaign the
 * agent could not read is deleted again, so a failed check leaves no row behind and no link
 * that leads to a page with nothing on it. `runTriage` writes nothing on failure, so the
 * campaign row is the only thing to remove.
 */
export async function runCheck(
  fields: Record<string, string>,
  options: CheckOptions,
): Promise<CheckResult> {
  const submitted = NewCampaignForm.safeParse(fields);

  if (!submitted.success) {
    return { ok: false, reason: firstIssue(submitted.error) };
  }

  const { db, model } = options;

  if (db === null) {
    return {
      ok: false,
      reason: "This deployment has no database configured, so no campaign can be checked.",
    };
  }

  const row = campaignRowFrom(submitted.data);
  await db.insert(campaigns).values(row);

  const failure = await runTriage(row.id, { db, ...(model === undefined ? {} : { model }) }).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

  if (failure !== null) {
    await db.delete(campaigns).where(eq(campaigns.id, row.id));

    return { ok: false, reason: `The campaign could not be checked: ${failure}` };
  }

  return { ok: true, campaignId: row.id };
}
