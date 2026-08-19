import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

import type { RecipientCategory } from "@/lib/categories";

/**
 * Dimensionality of the embedding column.
 *
 * It is a property of the schema rather than of whichever embedder is wired in, so it
 * lives here and the embedder is checked against it. A vector of the wrong width is a
 * write that fails loudly at the database, which is the behaviour we want: silently
 * padding or truncating would leave a row that retrieves as if it were comparable.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * A submitted campaign, stored in the shape `CampaignInput` describes.
 *
 * The organizer is flattened into columns rather than kept as a document because a
 * reviewer queue filters on it. `goalAmount` is numeric and comes back as a string, since
 * a float would round money for the sake of a convenience the reviewer UI does not need.
 */
export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  story: text("story").notNull(),
  category: text("category").notNull(),
  goalAmount: numeric("goal_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  organizerName: text("organizer_name").notNull(),
  organizerLocation: text("organizer_location").notNull(),
  organizerRelationshipToBeneficiary: text("organizer_relationship_to_beneficiary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What a reviewer decided about a campaign, once.
 *
 * `info_requested` is a real outcome and not a pending state: the reviewer read the file,
 * found the determinative fact absent, and recorded that the campaign cannot be
 * adjudicated until the organizer answers. Collapsing it into approved or declined would
 * lose the case a triage system most needs to show a reviewer, per docs/RESEARCH.md 6.3.
 */
export const precedentDecision = pgEnum("precedent_decision", [
  "approved",
  "declined",
  "info_requested",
]);

export type PrecedentDecision = (typeof precedentDecision.enumValues)[number];

/**
 * How the adjudicated campaign came out against each of the eight recipient categories.
 *
 * The three statuses match `CategoryVerdict` in src/lib/mapping.ts, so a reviewer reads a
 * precedent in the same vocabulary as the file in front of them. The record is partial
 * because a past adjudication only records the categories it engaged with.
 */
export type PrecedentCategoryOutcome = "supported" | "not_supported" | "insufficient_evidence";

export type PrecedentCategoryOutcomes = Partial<Record<RecipientCategory, PrecedentCategoryOutcome>>;

/**
 * A previously adjudicated campaign, kept so a reviewer can see comparable cases.
 *
 * `reviewerNote` is the human's recorded reasoning, and it is the most valuable column in
 * the table and the most dangerous. It is written to be read by another reviewer, and
 * ADR-0004 confines it to that: no row of this table is ever serialized into a model
 * prompt, because a model shown past decisions imitates them and the trust boundary the
 * system is built on becomes decorative.
 */
export const precedents = pgTable(
  "precedents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    story: text("story").notNull(),
    categoryOutcomes: jsonb("category_outcomes").$type<PrecedentCategoryOutcomes>().notNull(),
    decision: precedentDecision("decision").notNull(),
    reviewerNote: text("reviewer_note").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (table) => [
    index("precedents_embedding_cosine_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export type PrecedentRow = typeof precedents.$inferSelect;
export type NewPrecedentRow = typeof precedents.$inferInsert;
export type CampaignRow = typeof campaigns.$inferSelect;
export type NewCampaignRow = typeof campaigns.$inferInsert;
