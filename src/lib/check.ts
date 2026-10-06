import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";

import type { TriageDatabase } from "../db/index";
import { campaigns } from "../db/schema";
import { campaignRowFrom, firstIssue, NewCampaignForm } from "./forms";
import { consumeAnalysis, hashIp, purgeExpired, type QuotaLimits } from "./quota";
import { runTriage } from "./triage";

export type CheckOptions = {
  /** Null when the deployment has no database, which is reported after validation. */
  db: TriageDatabase | null;
  /** Defaults to the model `runTriage` defaults to. */
  model?: LanguageModel;
  /** Injected so a test can pin the day the quota and the retention are measured on. */
  now?: () => Date;
  quota: {
    /** IP_HASH_SECRET. Unset refuses every analysis, since the limit cannot be kept without it. */
    readonly secret: string | undefined;
    /** Read only once the submission is valid, so a refused form never touches the request. */
    readonly ip: () => Promise<string | null>;
    readonly limits: QuotaLimits;
  };
};

export type CheckResult =
  | { readonly ok: true; readonly campaignId: string }
  | { readonly ok: false; readonly reason: string };

/**
 * The one step a donor takes: paste a campaign, get its agent file.
 *
 * The submission is validated before anything is stored or any model is called, and the
 * analysis is charged against the visitor's and the site's daily limits before the model is
 * called too, so a refused check has spent nothing. Expired campaigns are purged on the way in,
 * which keeps retention a property of the write path rather than of a job that may not run. A campaign the
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

  const { db, model, quota } = options;

  if (db === null) {
    return {
      ok: false,
      reason: "This deployment has no database configured, so no campaign can be checked.",
    };
  }

  const now = options.now?.() ?? new Date();
  await purgeExpired(db, now, quota.limits.retentionDays);

  if (quota.secret === undefined || quota.secret.length === 0) {
    return {
      ok: false,
      reason: "This deployment has no IP_HASH_SECRET configured, so it cannot keep its usage limits and runs no checks.",
    };
  }

  const ip = await quota.ip();

  if (ip === null) {
    return {
      ok: false,
      reason: "The request did not say where it came from, so it cannot be counted against a limit.",
    };
  }

  const charged = await consumeAnalysis(hashIp(ip, quota.secret), db, quota.limits, now);

  if (!charged.ok) {
    return charged;
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
