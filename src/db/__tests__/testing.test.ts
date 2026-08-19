import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMBEDDING_DIMENSIONS, precedents } from "../schema";
import { createTestDatabase, type TestDatabase } from "../testing";

const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index / 10_000);

const row = {
  id: "prc_test_0001",
  title: "A previously adjudicated case",
  story: "The organizer described a household that could not meet its rent.",
  categoryOutcomes: { "al-fuqara": "supported" } as const,
  decision: "approved" as const,
  reviewerNote: "Recorded so the harness has something to read back.",
  decidedAt: new Date("2026-03-04T00:00:00.000Z"),
  embedding,
};

describe("createTestDatabase", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it("applies the shipped migration, vector column and enum included", async () => {
    await database.db.insert(precedents).values(row);

    const stored = await database.db.select().from(precedents);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.decision).toBe("approved");
    expect(stored[0]?.categoryOutcomes).toEqual({ "al-fuqara": "supported" });
    expect(stored[0]?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("rejects an embedding of the wrong width rather than storing it", async () => {
    const mismatched = { ...row, id: "prc_test_0002", embedding: [0.1, 0.2, 0.3] };

    await expect(database.db.insert(precedents).values(mismatched)).rejects.toThrow();
  });

  it("rejects a decision outside the recorded outcomes", async () => {
    const invalid = { ...row, id: "prc_test_0003", decision: "escalated" };

    await expect(
      database.db.insert(precedents).values(invalid as unknown as typeof row),
    ).rejects.toThrow();
  });
});
