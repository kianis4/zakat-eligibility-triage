import { cosineDistance } from "drizzle-orm";

import type { TriageDatabase } from "../db/index";
import {
  EMBEDDING_DIMENSIONS,
  precedents,
  type PrecedentCategoryOutcomes,
  type PrecedentDecision,
} from "../db/schema";
import type { CampaignInput } from "./campaign";
import { embeddableText, embedWithOpenAI, type Embedder } from "./embedding";

export const PRECEDENT_EXCERPT_LENGTH = 320;

const DEFAULT_K = 4;

/**
 * A previously adjudicated campaign, on its way to a reviewer's screen.
 *
 * ARCHITECTURAL RULE, and the reason this type has a name of its own: a value of this
 * type is rendered to a human and MUST NOT be serialized into any model prompt, in whole
 * or in part. Not as context, not as a few-shot example, not as a summary of what past
 * reviewers tended to do.
 *
 * The reason is in ADR-0004. Precedent shown to a reviewer informs a judgement; precedent
 * fed to the model makes the model imitate past outcomes, which converts the human
 * decisions this table records into machine decisions with a human's authority attached,
 * and entrenches whatever the early ones got wrong. Retrieval sits downstream of
 * generation on purpose, and `src/lib/__tests__/precedent-isolation.test.ts` fails if a
 * prompt ever contains one of these.
 */
export type PrecedentForReviewer = {
  readonly id: string;
  readonly title: string;
  readonly storyExcerpt: string;
  readonly categoryOutcomes: PrecedentCategoryOutcomes;
  readonly decision: PrecedentDecision;
  readonly reviewerNote: string;
  readonly decidedAt: Date;
};

export type RetrievePrecedentsOptions = {
  db: TriageDatabase;
  k?: number;
  embedder?: Embedder;
};

/**
 * Cuts the story down to something a reviewer can scan in a list, at a word boundary.
 *
 * The excerpt is a navigation aid and never the basis of a comparison. A reviewer who
 * wants to compare two campaigns properly opens the precedent; truncating in the middle
 * of a sentence would invite them not to.
 */
function excerpt(story: string): string {
  if (story.length <= PRECEDENT_EXCERPT_LENGTH) {
    return story;
  }

  const cut = story.slice(0, PRECEDENT_EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace === -1 ? cut : cut.slice(0, lastSpace)).trimEnd()}...`;
}

/**
 * Finds the adjudicated campaigns closest to a submitted one, for a reviewer to read.
 *
 * No language model is involved here and none may be added. The module embeds text and
 * runs a distance query; it does not summarise a precedent, does not say which precedent
 * governs, and does not compare the submitted campaign to what it finds. Those are the
 * reviewer's to do, and a machine doing any of them is the model deciding by way of the
 * corpus (ADR-0004).
 *
 * The distance orders the list and is not returned. A similarity figure on a reviewer's
 * screen reads as a confidence in the comparison, and the comparison it would be
 * expressing confidence in is between two pieces of marketing prose.
 *
 * The embedder is injected for the same reason the language model is injected upstream,
 * and it is checked against the column width rather than trusted: a fake or a swapped
 * model that returns the wrong number of dimensions would otherwise surface as an opaque
 * database error at the far end of a query.
 */
export async function retrievePrecedents(
  campaign: CampaignInput,
  options: RetrievePrecedentsOptions,
): Promise<PrecedentForReviewer[]> {
  const { db, k = DEFAULT_K, embedder = embedWithOpenAI } = options;
  const embedding = await embedder(embeddableText(campaign));

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `The embedder returned ${embedding.length} dimensions, but the precedents column holds ${EMBEDDING_DIMENSIONS}.`,
    );
  }

  const rows = await db
    .select({
      id: precedents.id,
      title: precedents.title,
      story: precedents.story,
      categoryOutcomes: precedents.categoryOutcomes,
      decision: precedents.decision,
      reviewerNote: precedents.reviewerNote,
      decidedAt: precedents.decidedAt,
    })
    .from(precedents)
    .orderBy(cosineDistance(precedents.embedding, embedding))
    .limit(k);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    storyExcerpt: excerpt(row.story),
    categoryOutcomes: row.categoryOutcomes,
    decision: row.decision,
    reviewerNote: row.reviewerNote,
    decidedAt: row.decidedAt,
  }));
}
