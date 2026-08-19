import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { RECIPIENT_CATEGORY_IDS } from "../lib/categories";
import { embeddableText, type Embedder } from "../lib/embedding";
import type { TriageDatabase } from "./index";
import { EMBEDDING_DIMENSIONS, precedents } from "./schema";

const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/precedents/", import.meta.url));

/**
 * A hand-written adjudication on disk.
 *
 * Parsed rather than cast. These files are edited by hand and read by people who know the
 * subject, so a typo in a category key or a status is a likely mistake and a silent one:
 * the column is jsonb and the database would take it.
 */
export const PrecedentFixture = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  story: z.string().min(1),
  categoryOutcomes: z.partialRecord(
    z.enum(RECIPIENT_CATEGORY_IDS),
    z.enum(["supported", "not_supported", "insufficient_evidence"]),
  ),
  decision: z.enum(["approved", "declined", "info_requested"]),
  reviewerNote: z.string().min(1),
  decidedAt: z.iso.datetime(),
});

export type PrecedentFixture = z.infer<typeof PrecedentFixture>;

export async function loadPrecedentFixtures(): Promise<PrecedentFixture[]> {
  const names = (await readdir(FIXTURES_DIR)).filter((name) => name.endsWith(".json")).sort();

  return Promise.all(
    names.map(async (name) =>
      PrecedentFixture.parse(JSON.parse(await readFile(join(FIXTURES_DIR, name), "utf8"))),
    ),
  );
}

/**
 * Embeds the corpus and writes it, replacing any row that is already there.
 *
 * The upsert is on the fixture id, so re-seeding after editing a note updates the row
 * instead of duplicating the case. A duplicated precedent is worse than a missing one: it
 * would occupy two of the four slots a reviewer sees and make one adjudication look like
 * a pattern.
 */
export async function seedPrecedents(db: TriageDatabase, embedder: Embedder): Promise<number> {
  const fixtures = await loadPrecedentFixtures();

  for (const fixture of fixtures) {
    const embedding = await embedder(embeddableText(fixture));

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `The embedder returned ${embedding.length} dimensions for ${fixture.id}, but the precedents column holds ${EMBEDDING_DIMENSIONS}.`,
      );
    }

    await db
      .insert(precedents)
      .values({ ...fixture, decidedAt: new Date(fixture.decidedAt), embedding })
      .onConflictDoUpdate({
        target: precedents.id,
        set: {
          title: fixture.title,
          story: fixture.story,
          categoryOutcomes: fixture.categoryOutcomes,
          decision: fixture.decision,
          reviewerNote: fixture.reviewerNote,
          decidedAt: new Date(fixture.decidedAt),
          embedding,
        },
      });
  }

  return fixtures.length;
}
