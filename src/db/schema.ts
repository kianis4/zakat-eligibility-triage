import { sql } from "drizzle-orm";
import {
  bigserial,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

import type { RecipientCategory } from "../lib/categories";
import type { EscalationDecision } from "../lib/escalation";
import type { ExtractedFacts } from "../lib/extraction";
import type { CategoryMapping } from "../lib/mapping";
import type { MissingEvidenceReport } from "../lib/missing-evidence";

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
 * A campaign a donor pasted, stored in the shape `CampaignInput` describes.
 *
 * Only the title and the story are required, as on the form. Nothing about the organizer is
 * stored: the donor is asked for none of it and no prompt reads it. `goalAmount` is numeric
 * and comes back as a string, since a float would round money for no benefit.
 */
export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  story: text("story").notNull(),
  category: text("category"),
  goalAmount: numeric("goal_amount", { precision: 14, scale: 2 }),
  currency: text("currency"),
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
 * The three statuses match `CategoryFinding` in src/lib/mapping.ts, so a reviewer reads a
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

/**
 * One pass of the pipeline over one campaign: the agent's file, exactly as it stood.
 *
 * The row is written once and never rewritten. There is no update path to it anywhere in
 * this repository, so a shared link shows what the agent read at the time rather than what
 * the pipeline would say today.
 *
 * Nothing here is an outcome, and nothing anywhere in the schema is. The four documents are
 * what the agent read, mapped, found missing and refused on, and the columns beside them say
 * which policy corpus and which model produced them. The decision is the donor's, and it is
 * made off the page (ADR-0001).
 */
export const triageRuns = pgTable("triage_runs", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  facts: jsonb("facts").$type<ExtractedFacts>().notNull(),
  mapping: jsonb("mapping").$type<CategoryMapping>().notNull(),
  missingEvidence: jsonb("missing_evidence").$type<MissingEvidenceReport>().notNull(),
  escalation: jsonb("escalation").$type<EscalationDecision>().notNull(),
  policyVersion: text("policy_version").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`),
  sequence: bigserial("sequence", { mode: "number" }).notNull(),
});

/**
 * How many analyses a bucket has spent on one UTC day, which is the whole rate limit.
 *
 * A bucket is a visitor's salted IP hash with the day appended, or `global:<day>` for the
 * site-wide cap, so a visitor's count resets at midnight UTC without a job to reset it. The
 * raw address is never stored, and rows older than yesterday are purged on the next check.
 * The column names stay clear of the outcome vocabulary the schema guard watches for.
 */
export const analysisQuota = pgTable("analysis_quota", {
  bucket: text("bucket").primaryKey(),
  day: date("day").notNull(),
  uses: integer("uses").notNull(),
});

export type PrecedentRow = typeof precedents.$inferSelect;
export type NewPrecedentRow = typeof precedents.$inferInsert;
export type CampaignRow = typeof campaigns.$inferSelect;
export type NewCampaignRow = typeof campaigns.$inferInsert;
export type TriageRunRow = typeof triageRuns.$inferSelect;
export type NewTriageRunRow = typeof triageRuns.$inferInsert;
