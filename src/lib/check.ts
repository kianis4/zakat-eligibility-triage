import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";

import type { TriageDatabase } from "../db/index";
import { campaigns } from "../db/schema";
import { CHECK_ERRORS, type CheckErrorCode } from "./check-errors";
import { campaignRowFrom, firstIssueCode, NewCampaignForm } from "./forms";
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
  | { readonly ok: false; readonly code: CheckErrorCode; readonly reason: string };

function refused(code: CheckErrorCode): CheckResult {
  return { ok: false, code, reason: CHECK_ERRORS[code] };
}

/**
 * The one step a donor takes: paste a campaign, get its agent file.
 *
 * The submission is validated before anything is stored or any model is called, and the
 * analysis is charged against the visitor's and the site's daily limits before the model is
 * called too, so a refused check has spent nothing. Expired campaigns are purged on the way in,
 * which keeps retention a property of the write path rather than of a job that may not run. A campaign the
 * agent could not read is deleted again, so a failed check leaves no row behind and no link
 * that leads to a page with nothing on it. `runTriage` writes nothing on failure, so the
 * campaign row is the only thing to remove. A campaign the database will not store is refused
 * with a stated reason too, and stays charged, like any check that fails after the charge
 * (ADR-0011).
 */
export async function runCheck(
  fields: Record<string, string>,
  options: CheckOptions,
): Promise<CheckResult> {
  const submitted = NewCampaignForm.safeParse(fields);

  if (!submitted.success) {
    return refused(firstIssueCode(submitted.error));
  }

  const { db, model, quota } = options;

  if (db === null) {
    return refused("no-database");
  }

  const now = options.now?.() ?? new Date();
  await purgeExpired(db, now, quota.limits.retentionDays);

  if (quota.secret === undefined || quota.secret.length === 0) {
    return refused("no-secret");
  }

  const ip = await quota.ip();

  if (ip === null) {
    return refused("no-address");
  }

  const charged = await consumeAnalysis(hashIp(ip, quota.secret), db, quota.limits, now);

  if (!charged.ok) {
    return charged;
  }

  const row = campaignRowFrom(submitted.data);
  const stored = await db.insert(campaigns).values(row).then(
    () => true,
    () => false,
  );

  if (!stored) {
    return refused("not-stored");
  }

  const failed = await runTriage(row.id, { db, ...(model === undefined ? {} : { model }) }).then(
    () => false,
    () => true,
  );

  if (failed) {
    // If the database is the thing that failed, the row is left for the retention purge; the
    // donor still gets an answer rather than an error page.
    await db
      .delete(campaigns)
      .where(eq(campaigns.id, row.id))
      .catch(() => undefined);

    return refused("unreadable");
  }

  return { ok: true, campaignId: row.id };
}
