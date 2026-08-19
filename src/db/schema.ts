import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
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
 * What happened to the escalation on its way to a channel, or nothing when none fired.
 *
 * A failure is recorded rather than thrown away, and it is recorded with the status that
 * caused it, because "the reviewer was never told" is a fact about this campaign that the
 * next person to open it has to be able to see. `failed:unreachable` covers a post that
 * never received a response at all, which has no status to name.
 *
 * Null means the run did not escalate, so there was nothing to deliver. It does not mean
 * delivery is pending: `slack_delivery IS NULL` is checked against the escalation itself
 * in the table below, so a run that refused and quietly sent nothing cannot be stored.
 */
export type SlackDelivery = "delivered" | "not_configured" | `failed:${string}`;

/**
 * One pass of the pipeline over one campaign: the agent's file, exactly as it stood.
 *
 * The row is written once and never rewritten. There is no update path to it anywhere in
 * this repository, which is the property that makes a decision auditable: a decision names
 * the run it was taken against, so a reader can see what the reviewer was actually looking
 * at rather than what the pipeline would say today. Re-running a campaign appends another
 * row, and the older one keeps standing behind the decisions that cite it.
 *
 * Nothing here is an outcome. The four documents are what the agent read, mapped, found
 * missing and refused on, and the columns beside them say which policy corpus and which
 * model produced them. Under ADR-0001 a campaign's outcome is a `decisions` row and only
 * ever that.
 */
export const triageRuns = pgTable(
  "triage_runs",
  {
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
    slackDelivery: text("slack_delivery").$type<SlackDelivery>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
  },
  (table) => [
    check(
      "triage_runs_slack_delivery_recorded",
      sql`${table.slackDelivery} is null or ${table.slackDelivery} in ('delivered', 'not_configured') or ${table.slackDelivery} like 'failed:%'`,
    ),
    check(
      "triage_runs_escalation_has_a_delivery_state",
      sql`(${table.escalation}->>'escalate' = 'true') = (${table.slackDelivery} is not null)`,
    ),
  ],
);

/**
 * Every character that can make a field look filled while saying nothing.
 *
 * Enumerated by codepoint rather than matched by a character class, and that is a measured
 * choice rather than a stylistic one. Under PGlite a non-breaking space matches neither the
 * POSIX `[[:space:]]` class nor the `\s` shorthand, both of which follow the database ctype
 * and do not know the Unicode blanks, so a regex check written either way accepts a reviewer
 * named by one. `btrim` takes a literal set of characters and has no such opinion.
 *
 * The set is JavaScript's `String.prototype.trim`, which is what `DecisionInput` applies at
 * the application boundary, so both layers agree on what blank means. It adds the zero width
 * space and the byte order mark, which `trim` leaves alone: both are invisible, and a
 * database stricter than the form in front of it fails loudly rather than storing a name
 * nobody can read.
 *
 * Written as codepoints because the alternative is pasting invisible characters into a source
 * file, where nobody reviewing this can see what the set contains or notice one going missing.
 */
const BLANK_CODEPOINTS = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20,
  0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x200b, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
] as const;

const BLANKS = sql.raw(
  `E'${BLANK_CODEPOINTS.map((point) => `\\u${point.toString(16).padStart(4, "0")}`).join("")}'`,
);

/**
 * What a reviewer may record, and the whole vocabulary of it.
 *
 * `request_info` is a decision and not a deferral of one: the reviewer read the file, found
 * the determinative fact absent, and recorded that the campaign cannot be adjudicated until
 * the organizer answers. `escalate` sends it to someone with more standing than the reviewer
 * has, which is a judgement about the campaign rather than an absence of one.
 *
 * None of the three is an eligibility ruling. A reviewer approving a campaign is a qualified
 * human deciding, which is the only thing this system will publish (ADR-0001).
 */
export const DECISION_ACTIONS = ["approve", "request_info", "escalate"] as const;

export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/**
 * A human's decision about a campaign, against the agent file they read.
 *
 * This table is the only representation of an outcome in the schema, so publishing an
 * outcome *is* inserting a row here, and there is no shorter way to do it. The constraints
 * make the two useless decisions unrepresentable rather than discouraged: an anonymous one,
 * which cannot be an audit trail because it records no one, and an unreasoned one, which
 * records a verdict and loses the only part of it a later reader can weigh.
 *
 * `triage_run_id` is not null because a decision is always about a specific file. Without it
 * the trail says a reviewer approved a campaign and not what they approved it on, and the
 * agreement between human and agent stops being computable at all.
 *
 * `decided_at` records when, and `sequence` records in what order, and they are two columns
 * because a wall clock does not give the second one. `now()` is the transaction's start time
 * and is identical for every row written inside one transaction; `clock_timestamp()` is per
 * statement but only as fine as the clock underneath it, and under PGlite five consecutive
 * inserts came back with one timestamp between them. The order of an audit trail is part of
 * what it records, so it is read off a sequence that cannot tie rather than off a reading
 * that happens not to.
 *
 * Whether the reviewer agreed with the agent is deliberately not a column. It is a function
 * of this row and the run it points at, so storing it would be storing something derivable,
 * and derivable data that is stored is data that drifts. See ADR-0008.
 *
 * The emptiness checks trim with an explicit whitespace set rather than with bare `trim`,
 * which in Postgres strips the space character and nothing else. A reviewer of one tab
 * satisfies `length(trim(reviewer)) > 0`, and an anonymous decision that a constraint waves
 * through is worse than no constraint, because the schema then claims a guarantee it does
 * not give.
 */
export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    triageRunId: text("triage_run_id")
      .notNull()
      .references(() => triageRuns.id),
    action: text("action").$type<DecisionAction>().notNull(),
    reviewer: text("reviewer").notNull(),
    note: text("note").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
  },
  (table) => [
    check(
      "decisions_action_is_recorded",
      sql`${table.action} in ('approve', 'request_info', 'escalate')`,
    ),
    check("decisions_reviewer_is_named", sql`length(btrim(${table.reviewer}, ${BLANKS})) > 0`),
    check("decisions_note_carries_reasoning", sql`length(btrim(${table.note}, ${BLANKS})) > 0`),
  ],
);

export type PrecedentRow = typeof precedents.$inferSelect;
export type NewPrecedentRow = typeof precedents.$inferInsert;
export type CampaignRow = typeof campaigns.$inferSelect;
export type NewCampaignRow = typeof campaigns.$inferInsert;
export type TriageRunRow = typeof triageRuns.$inferSelect;
export type NewTriageRunRow = typeof triageRuns.$inferInsert;
export type DecisionRow = typeof decisions.$inferSelect;
export type NewDecisionRow = typeof decisions.$inferInsert;
