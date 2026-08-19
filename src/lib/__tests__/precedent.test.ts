import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedPrecedents } from "../../db/seed";
import { createTestDatabase, type TestDatabase } from "../../db/testing";
import { createHashEmbedder } from "../../testing/hash-embedder";
import type { CampaignInput } from "../campaign";
import { PRECEDENT_EXCERPT_LENGTH, retrievePrecedents } from "../precedent";

const embedder = createHashEmbedder();

const hospitalDebt: CampaignInput = {
  id: "cmp_1001",
  title: "Clearing a hospital invoice for my aunt",
  story:
    "My aunt spent nine weeks in hospital after a fall and came home to an invoice for 5,200 JOD. The hospital has sent a payment demand with a deadline at the end of next month. She has not worked since the fall and the family has no savings left. We are asking for help to clear the balance in one payment.",
  category: "Medical",
  goalAmount: 5200,
  currency: "JOD",
  organizer: { name: "Samira Qasim", location: "Zarqa, Jordan" },
};

const playground: CampaignInput = {
  id: "cmp_1002",
  title: "New surface and swings for the playground",
  story:
    "The playground behind our community hall has a split rubber surface and two swings chained up, and the children on the street have nowhere to go after school. Our residents association has three contractor quotes to resurface the play area, replace the swings and plant trees along the fence.",
  category: "Community",
  goalAmount: 16000,
  currency: "GBP",
  organizer: { name: "Peter Nkemelu", location: "Leeds, United Kingdom" },
};

describe("retrievePrecedents", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedPrecedents(database.db, embedder);
  });

  afterAll(async () => {
    await database.close();
  });

  it("ranks the comparable adjudication first", async () => {
    const found = await retrievePrecedents(hospitalDebt, { db: database.db, embedder });

    expect(found[0]?.id).toBe("prc_0002");
  });

  it("ranks by the submitted campaign, not by a fixed order of the corpus", async () => {
    const found = await retrievePrecedents(playground, { db: database.db, embedder });

    expect(found[0]?.id).toBe("prc_0004");
  });

  it("returns four precedents by default and honours an explicit k", async () => {
    const byDefault = await retrievePrecedents(hospitalDebt, { db: database.db, embedder });
    const two = await retrievePrecedents(hospitalDebt, { db: database.db, embedder, k: 2 });

    expect(byDefault).toHaveLength(4);
    expect(two).toHaveLength(2);
    expect(two.map((precedent) => precedent.id)).toEqual(
      byDefault.slice(0, 2).map((precedent) => precedent.id),
    );
  });

  it("carries the decision, the outcomes and the reviewer's reasoning", async () => {
    const [first] = await retrievePrecedents(hospitalDebt, { db: database.db, embedder, k: 1 });

    expect(first?.decision).toBe("approved");
    expect(first?.categoryOutcomes["al-gharimin"]).toBe("supported");
    expect(first?.reviewerNote).toContain("payment demands");
    expect(first?.decidedAt).toBeInstanceOf(Date);
  });

  it("excerpts a long story at a word boundary rather than mid-word", async () => {
    const found = await retrievePrecedents(hospitalDebt, { db: database.db, embedder, k: 12 });
    const truncated = found.filter((precedent) => precedent.storyExcerpt.endsWith("..."));

    expect(truncated.length).toBeGreaterThan(0);

    for (const precedent of truncated) {
      expect(precedent.storyExcerpt.length).toBeLessThanOrEqual(PRECEDENT_EXCERPT_LENGTH + 3);
      expect(precedent.storyExcerpt).not.toMatch(/\s\.\.\.$/);
    }
  });

  it("refuses an embedder whose width does not match the column", async () => {
    await expect(
      retrievePrecedents(hospitalDebt, { db: database.db, embedder: createHashEmbedder(8) }),
    ).rejects.toThrow(/8 dimensions/);
  });
});
