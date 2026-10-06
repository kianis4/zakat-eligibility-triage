import { createHmac } from "node:crypto";

import { inArray, lt, sql } from "drizzle-orm";

import type { TriageDatabase } from "../db/index";
import { analysisQuota, campaigns, triageRuns } from "../db/schema";

/**
 * The limits a hosted deployment runs under, which exist because every analysis spends the
 * owner's model credit and the site has no accounts to bill against.
 */
export type QuotaLimits = {
  /** Analyses one visitor may run per UTC day. */
  readonly perIp: number;
  /** Analyses the whole site may run per UTC day, whoever asks. */
  readonly perDay: number;
  /** Days a pasted campaign and its file are kept so the shared link keeps working. */
  readonly retentionDays: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function quotaLimits(env: Record<string, string | undefined>): QuotaLimits {
  return {
    perIp: positiveInteger(env.ANALYSES_PER_IP_PER_DAY, 5),
    perDay: positiveInteger(env.ANALYSES_PER_DAY, 100),
    retentionDays: positiveInteger(env.RETENTION_DAYS, 30),
  };
}

/**
 * The visitor's address as the proxy in front of the app saw it: the first hop of
 * `x-forwarded-for`, else `x-real-ip`, else nothing.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (forwarded !== undefined && forwarded.length > 0) {
    return forwarded;
  }

  const real = headers.get("x-real-ip")?.trim();

  return real === undefined || real.length === 0 ? null : real;
}

/**
 * A salted hash of the address, which is the only form of it this system stores.
 *
 * HMAC rather than a bare hash, because the IPv4 space is small enough to enumerate: without
 * the secret, a stored hash is the address with one extra step.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export type QuotaResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

class QuotaSpent extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/**
 * Charges one analysis to the visitor and to the day, or to neither.
 *
 * Each bucket is one conditional upsert, so the count and the cap are checked in the same
 * statement and concurrent requests cannot both take the last analysis. The visitor is charged
 * first and the day second inside one transaction: a refusal on the global cap rolls the
 * visitor's charge back, so a visitor turned away because the site is spent loses nothing.
 */
export async function consumeAnalysis(
  ipHash: string,
  db: TriageDatabase,
  limits: QuotaLimits,
  now: Date,
): Promise<QuotaResult> {
  const day = utcDay(now);

  async function charge(tx: TriageDatabase, bucket: string, cap: number): Promise<boolean> {
    const charged = await tx
      .insert(analysisQuota)
      .values({ bucket, day, uses: 1 })
      .onConflictDoUpdate({
        target: analysisQuota.bucket,
        set: { uses: sql`${analysisQuota.uses} + 1` },
        setWhere: sql`${analysisQuota.uses} < ${cap}`,
      })
      .returning({ uses: analysisQuota.uses });

    return charged.length > 0;
  }

  try {
    await db.transaction(async (tx) => {
      if (!(await charge(tx, `ip:${ipHash}:${day}`, limits.perIp))) {
        throw new QuotaSpent(
          `You have used today's limit of ${limits.perIp} checks. It resets at midnight UTC.`,
        );
      }

      if (!(await charge(tx, `global:${day}`, limits.perDay))) {
        throw new QuotaSpent(
          "This site has used today's limit of checks for everyone. It resets at midnight UTC.",
        );
      }
    });
  } catch (error: unknown) {
    if (error instanceof QuotaSpent) {
      return { ok: false, reason: error.reason };
    }

    throw error;
  }

  return { ok: true };
}

/**
 * Deletes what has outlived its purpose: campaigns and their files past the retention period,
 * and rate-limit rows older than yesterday, so a visitor's hash is kept for two days at most.
 */
export async function purgeExpired(
  db: TriageDatabase,
  now: Date,
  retentionDays: number,
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const expired = db.select({ id: campaigns.id }).from(campaigns).where(lt(campaigns.createdAt, cutoff));

  await db.delete(triageRuns).where(inArray(triageRuns.campaignId, expired));
  await db.delete(campaigns).where(lt(campaigns.createdAt, cutoff));
  await db
    .delete(analysisQuota)
    .where(lt(analysisQuota.day, utcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))));
}
