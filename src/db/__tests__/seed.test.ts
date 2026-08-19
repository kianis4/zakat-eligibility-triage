import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHashEmbedder } from "../../testing/hash-embedder";
import { EMBEDDING_DIMENSIONS, precedents } from "../schema";
import { loadPrecedentFixtures, seedPrecedents } from "../seed";
import { createTestDatabase, type TestDatabase } from "../testing";

describe("the adjudicated precedent corpus", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it("parses every fixture against the schema the table stores", async () => {
    const fixtures = await loadPrecedentFixtures();

    expect(fixtures.length).toBeGreaterThanOrEqual(10);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
  });

  it("covers all three outcomes, so retrieval has something to distinguish", async () => {
    const decisions = new Set((await loadPrecedentFixtures()).map((fixture) => fixture.decision));

    expect(decisions).toEqual(new Set(["approved", "declined", "info_requested"]));
  });

  it("records reasoning on every adjudication", async () => {
    const fixtures = await loadPrecedentFixtures();

    for (const fixture of fixtures) {
      expect(fixture.reviewerNote.length).toBeGreaterThan(80);
      expect(Object.keys(fixture.categoryOutcomes).length).toBeGreaterThan(0);
    }
  });

  it("seeds the corpus with an embedding of the schema's width", async () => {
    const seeded = await seedPrecedents(database.db, createHashEmbedder());
    const stored = await database.db.select().from(precedents);

    expect(stored).toHaveLength(seeded);
    expect(stored.every((row) => row.embedding.length === EMBEDDING_DIMENSIONS)).toBe(true);
  });

  it("upserts on the fixture id, so re-seeding does not duplicate a case", async () => {
    const seeded = await seedPrecedents(database.db, createHashEmbedder());
    await seedPrecedents(database.db, createHashEmbedder());

    const stored = await database.db.select().from(precedents);

    expect(stored).toHaveLength(seeded);
  });

  it("refuses an embedder whose width does not match the column", async () => {
    await expect(seedPrecedents(database.db, createHashEmbedder(8))).rejects.toThrow(
      /8 dimensions/,
    );
  });
});
