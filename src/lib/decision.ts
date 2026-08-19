import { randomUUID } from "node:crypto";

import { desc, eq, exists, sql } from "drizzle-orm";
import { z } from "zod";

import type { TriageDatabase } from "../db/index";
import {
  campaigns,
  DECISION_ACTIONS,
  decisions,
  triageRuns,
  type DecisionAction,
  type DecisionRow,
  type TriageRunRow,
} from "../db/schema";
import { RECIPIENT_CATEGORY_IDS, type RecipientCategory } from "./categories";
import type { EscalationDecision } from "./escalation";
import type { CategoryMapping } from "./mapping";

export type { DecisionAction };

/**
 * What a reviewer has to supply, checked before it reaches the insert.
 *
 * The database is where this is enforced, not here. Every rule below is also a CHECK
 * constraint on the table, and the suite proves the constraints by inserting past this
 * function. What the schema adds is a readable failure at the boundary a form posts to,
 * so a reviewer who left the note blank is told which field, rather than being shown a
 * constraint name from Postgres.
 */
export const DecisionInput = z.object({
  campaignId: z.string().min(1),
  triageRunId: z.string().min(1),
  action: z.enum(DECISION_ACTIONS),
  reviewer: z
    .string()
    .trim()
    .min(1, { message: "Record who is deciding. An anonymous decision is not an audit trail." }),
  note: z.string().trim().min(1, {
    message: "Record why. A decision without reasoning cannot be reviewed later.",
  }),
});

export type DecisionInput = z.infer<typeof DecisionInput>;

/**
 * The campaign's outcome, which is a recorded human decision or nothing at all.
 *
 * There is no third state and no derived one. A campaign with eight supported categories, a
 * clean file and no refusal has no outcome until a reviewer records one, and this function
 * returns null for it in exactly the same way as for a campaign nobody has looked at. That
 * is the invariant in ADR-0008 expressed as the query the UI reads: what it cannot find in
 * `decisions`, it cannot show as decided.
 *
 * The latest decision stands. A reviewer who returns to a campaign after the organizer
 * answers records a second decision rather than editing the first, so the trail keeps both,
 * and latest means last recorded rather than latest-stamped: the sequence is what orders
 * them, for the reason given on the column.
 */
export async function publishedOutcome(
  campaignId: string,
  db: TriageDatabase,
): Promise<DecisionRow | null> {
  const [latest] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.campaignId, campaignId))
    .orderBy(desc(decisions.sequence))
    .limit(1);

  return latest ?? null;
}

/**
 * Every decision recorded about a campaign, oldest first, which is the audit trail.
 */
export async function decisionHistory(
  campaignId: string,
  db: TriageDatabase,
): Promise<DecisionRow[]> {
  return db
    .select()
    .from(decisions)
    .where(eq(decisions.campaignId, campaignId))
    .orderBy(decisions.sequence);
}

export type QueueEntry = {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly hasTriageRun: boolean;
  readonly outcome: DecisionAction | null;
};

/**
 * The reviewer's queue: every campaign, whether the agent has read it, and how it came out.
 *
 * The outcome is a correlated subquery into `decisions` rather than a column on `campaigns`,
 * and the extra SQL is the point rather than the cost. There is no status to read, so a
 * campaign nobody has decided reports null here for the same reason it reports null
 * everywhere else: nothing has been published about it (ADR-0008).
 *
 * The subqueries are built rather than written into a template. Drizzle renders a bare
 * column in select position without its table, so a hand-written `where campaign_id = id`
 * correlates against the inner table and silently compares two of its own columns: it
 * returns rows, reports every campaign as unread and undecided, and looks like a queue with
 * nothing in it yet.
 */
export async function campaignQueue(db: TriageDatabase): Promise<QueueEntry[]> {
  return db
    .select({
      id: campaigns.id,
      title: campaigns.title,
      createdAt: campaigns.createdAt,
      hasTriageRun: sql<boolean>`${exists(
        db
          .select({ one: sql`1` })
          .from(triageRuns)
          .where(eq(triageRuns.campaignId, campaigns.id)),
      )}`,
      outcome: sql<DecisionAction | null>`${db
        .select({ action: decisions.action })
        .from(decisions)
        .where(eq(decisions.campaignId, campaigns.id))
        .orderBy(desc(decisions.sequence))
        .limit(1)}`,
    })
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt), campaigns.id);
}

/**
 * Every agent file written about a campaign, oldest first.
 *
 * The reviewer page reads the last one and shows it, and reads all of them because the audit
 * trail needs them: a decision names the run it was taken against, and an older decision was
 * taken against an older file. Recomputing agreement against whichever file is newest would
 * quietly restate what a past reviewer was looking at.
 */
export async function triageRunsFor(
  campaignId: string,
  db: TriageDatabase,
): Promise<TriageRunRow[]> {
  return db
    .select()
    .from(triageRuns)
    .where(eq(triageRuns.campaignId, campaignId))
    .orderBy(triageRuns.sequence);
}

export function supportedCategories(mapping: CategoryMapping): RecipientCategory[] {
  return RECIPIENT_CATEGORY_IDS.filter(
    (category) => mapping.categories[category]?.status === "supported",
  );
}

export type DecisionAgreement = {
  readonly agreed: boolean;
  readonly overrode: boolean;
  readonly summary: string;
};

/**
 * Whether the human went the way the agent file pointed, worked out from the file itself.
 *
 * Agreement is not stored anywhere, and the reason is worth stating where it is computed: it
 * is a function of a decision and the run it names, so a column holding it would be a second
 * copy that a change to this function silently falsifies. Deriving it means the trail can
 * never disagree with itself.
 *
 * The agent's file has one axis a decision can be measured against: whether it refused. A
 * reviewer who escalates a file that refused went with it; one who approves a file that
 * refused did not. Requesting information counts as going with a file that did not refuse,
 * because the file names what is missing without stopping on it.
 *
 * The override is the case worth reading separately. A file supporting no category at all is
 * one where the agent found nothing in the text for any category of recipient; approving it
 * is the reviewer bringing knowledge the file does not contain, which is exactly what the
 * boundary is for and exactly the decision an auditor should be able to find.
 */
export function agreementWith(
  run: Pick<TriageRunRow, "escalation" | "mapping">,
  action: DecisionAction,
): DecisionAgreement {
  const escalation: EscalationDecision = run.escalation;
  const agreed = action === "escalate" ? escalation.escalate : !escalation.escalate;
  const overrode = action === "approve" && supportedCategories(run.mapping).length === 0;

  if (overrode) {
    return { agreed, overrode, summary: "Human overrode agent file" };
  }

  return {
    agreed,
    overrode,
    summary: agreed ? "Agreed with the agent file" : "Departed from the agent file",
  };
}

/**
 * Records a human decision, which is the only way this system publishes anything.
 *
 * The run is read back and checked against the campaign the caller named. Both arrive from
 * the same form, and a mismatch means the form was assembled wrong or submitted against a
 * different campaign, which would file a decision on one campaign's file under another
 * campaign's name and leave a trail that reads as coherent afterwards.
 *
 * The database refuses that row too, through the composite foreign key on the pair, and that
 * is where the guarantee lives: this check exists to name the mismatch rather than to be the
 * thing preventing it. A caller that skips this function still cannot store the row.
 */
export async function recordDecision(
  input: DecisionInput,
  db: TriageDatabase,
): Promise<DecisionRow> {
  const decision = DecisionInput.parse(input);

  const [run] = await db
    .select({ campaignId: triageRuns.campaignId })
    .from(triageRuns)
    .where(eq(triageRuns.id, decision.triageRunId))
    .limit(1);

  if (run === undefined) {
    throw new Error(`There is no triage run ${decision.triageRunId} to decide against.`);
  }

  if (run.campaignId !== decision.campaignId) {
    throw new Error(
      `Triage run ${decision.triageRunId} belongs to campaign ${run.campaignId}, not to ${decision.campaignId}.`,
    );
  }

  const [recorded] = await db
    .insert(decisions)
    .values({ id: `dec_${randomUUID()}`, ...decision })
    .returning();

  return recorded as DecisionRow;
}
