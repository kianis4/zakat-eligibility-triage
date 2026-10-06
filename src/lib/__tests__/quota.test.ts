import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analysisQuota, campaigns, triageRuns } from "../../db/schema";
import { createTestDatabase, type TestDatabase } from "../../db/testing";
import { campaignRow, FIXTURE_CAMPAIGN, triageRunRow } from "../../testing/triage-fixtures";
import {
  clientIp,
  consumeAnalysis,
  hashIp,
  purgeExpired,
  quotaLimits,
  type QuotaLimits,
} from "../quota";

const limits: QuotaLimits = { perIp: 3, perDay: 5, retentionDays: 30 };

const noon = new Date("2026-10-06T12:00:00.000Z");

describe("hashIp", () => {
  it("never carries the address it was given", () => {
    const hash = hashIp("203.0.113.7", "secret-one");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
    expect(hash).not.toContain("203");
  });

  it("is stable for one secret and changes with it", () => {
    expect(hashIp("203.0.113.7", "secret-one")).toBe(hashIp("203.0.113.7", "secret-one"));
    expect(hashIp("203.0.113.7", "secret-one")).not.toBe(hashIp("203.0.113.7", "secret-two"));
    expect(hashIp("203.0.113.7", "secret-one")).not.toBe(hashIp("203.0.113.8", "secret-one"));
  });
});

describe("clientIp", () => {
  it("takes the first address a proxy chain forwarded", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to the real-ip header, and to nothing", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": " , " }))).toBeNull();
  });
});

describe("quotaLimits", () => {
  it("defaults to five a visitor, a hundred a day, and thirty days kept", () => {
    expect(quotaLimits({})).toEqual({ perIp: 5, perDay: 100, retentionDays: 30 });
  });

  it("reads the three limits from the environment", () => {
    expect(
      quotaLimits({ ANALYSES_PER_IP_PER_DAY: "2", ANALYSES_PER_DAY: "40", RETENTION_DAYS: "7" }),
    ).toEqual({ perIp: 2, perDay: 40, retentionDays: 7 });
  });
});

describe("consumeAnalysis", () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("allows a visitor their daily analyses and refuses the next one", async () => {
    const hash = hashIp("203.0.113.7", "secret");
    const results = [];

    for (let index = 0; index <= limits.perIp; index += 1) {
      results.push((await consumeAnalysis(hash, database.db, limits, noon)).ok);
    }

    expect(results).toEqual([true, true, true, false]);
  });

  it("refuses a fresh visitor once the day is spent, without charging them", async () => {
    for (let index = 0; index < limits.perDay; index += 1) {
      expect((await consumeAnalysis(hashIp(`203.0.113.${index}`, "secret"), database.db, limits, noon)).ok).toBe(true);
    }

    const fresh = hashIp("198.51.100.4", "secret");
    const refused = await consumeAnalysis(fresh, database.db, limits, noon);
    const rows = await database.db.select().from(analysisQuota);

    expect(refused.ok).toBe(false);
    expect(rows.some((row) => row.bucket.includes(fresh))).toBe(false);
  });

  it("never lets concurrent requests past the cap", async () => {
    const hash = hashIp("203.0.113.7", "secret");

    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeAnalysis(hash, database.db, limits, noon)),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(limits.perIp);
    expect(await database.db.select().from(analysisQuota)).toEqual(
      expect.arrayContaining([expect.objectContaining({ uses: limits.perIp })]),
    );
  });

  it("starts each visitor afresh on a new UTC day", async () => {
    const hash = hashIp("203.0.113.7", "secret");

    for (let index = 0; index < limits.perIp; index += 1) {
      await consumeAnalysis(hash, database.db, limits, noon);
    }

    expect((await consumeAnalysis(hash, database.db, limits, noon)).ok).toBe(false);
    expect(
      (await consumeAnalysis(hash, database.db, limits, new Date("2026-10-07T00:00:01.000Z"))).ok,
    ).toBe(true);
  });
});

describe("purgeExpired", () => {
  let database: TestDatabase;

  const daysAgo = (days: number) => new Date(noon.getTime() - days * 24 * 60 * 60 * 1000);

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("deletes a campaign and its file once they are older than the retention period", async () => {
    await database.db.insert(campaigns).values([
      { ...campaignRow({ ...FIXTURE_CAMPAIGN, id: "cmp_old" }), createdAt: daysAgo(31) },
      { ...campaignRow({ ...FIXTURE_CAMPAIGN, id: "cmp_recent" }), createdAt: daysAgo(29) },
    ]);
    await database.db.insert(triageRuns).values([
      triageRunRow({ id: "run_old", campaignId: "cmp_old" }),
      triageRunRow({ id: "run_recent", campaignId: "cmp_recent" }),
    ]);

    await purgeExpired(database.db, noon, 30);

    expect((await database.db.select().from(campaigns)).map((row) => row.id)).toEqual(["cmp_recent"]);
    expect((await database.db.select().from(triageRuns)).map((row) => row.id)).toEqual(["run_recent"]);
  });

  it("keeps a visitor's hash for today and yesterday only", async () => {
    await database.db.insert(analysisQuota).values([
      { bucket: "ip:a:2026-10-04", day: "2026-10-04", uses: 1 },
      { bucket: "ip:b:2026-10-05", day: "2026-10-05", uses: 1 },
      { bucket: "ip:c:2026-10-06", day: "2026-10-06", uses: 1 },
    ]);

    await purgeExpired(database.db, noon, 30);

    const kept = await database.db.select().from(analysisQuota);

    expect(kept.map((row) => row.day).sort()).toEqual(["2026-10-05", "2026-10-06"]);
    expect(await database.db.select().from(analysisQuota).where(eq(analysisQuota.day, "2026-10-04"))).toEqual([]);
  });
});
