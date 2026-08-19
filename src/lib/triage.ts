import { randomUUID } from "node:crypto";

import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";

import type { TriageDatabase } from "../db/index";
import {
  campaigns,
  triageRuns,
  type CampaignRow,
  type SlackDelivery,
  type TriageRunRow,
} from "../db/schema";
import { CampaignInput } from "./campaign";
import type { EscalationDecision } from "./escalation";
import { evaluateEscalation } from "./escalation";
import { extractFacts } from "./extraction";
import { mapCategories } from "./mapping";
import { buildMissingEvidenceReport } from "./missing-evidence";
import {
  postEscalationToSlack,
  SlackConfigError,
  SlackDeliveryError,
  type SlackPostOptions,
} from "./slack";

/**
 * Precedent is deliberately absent from this module, and its absence is the design.
 *
 * Retrieval belongs to the render, not to the pipeline: a precedent read here would sit in
 * the same function as the two model calls and would be one refactor away from the prompt
 * that they build. ADR-0004 keeps adjudicated cases on the reviewer's screen and out of the
 * model's context, and the cheapest way to keep that true is for the module that talks to
 * the model to have no way of reaching them.
 */
export const DEFAULT_MODEL_ID = "claude-sonnet-5";

export type RunTriageOptions = {
  db: TriageDatabase;
  /** Defaults to the Anthropic model named above. */
  model?: LanguageModel;
  /** Injected so a test can pin the timestamp the row records. */
  now?: () => Date;
  /** Passed through to the Slack post, which is where the webhook and the fetch come from. */
  slack?: SlackPostOptions;
};

function modelIdOf(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}

/**
 * A stored campaign in the shape the pipeline reads.
 *
 * `goalAmount` comes back from a numeric column as a string, and the pipeline's input schema
 * wants a number. The conversion happens here rather than in the schema so the column keeps
 * storing money exactly, and `CampaignInput` parses the result so a row that cannot make a
 * valid campaign fails before a model is called on it.
 */
export function campaignFromRow(row: CampaignRow): CampaignInput {
  return CampaignInput.parse({
    id: row.id,
    title: row.title,
    story: row.story,
    category: row.category,
    goalAmount: Number(row.goalAmount),
    currency: row.currency,
    organizer: {
      name: row.organizerName,
      location: row.organizerLocation,
      ...(row.organizerRelationshipToBeneficiary === null
        ? {}
        : { relationshipToBeneficiary: row.organizerRelationshipToBeneficiary }),
    },
  });
}

/**
 * Sends the refusal to a channel and reports what happened to it.
 *
 * Every outcome is recorded and none of them stops the run being written. The refusal is
 * already assembled at this point, with the question a reviewer has to answer in it, and
 * losing that to a webhook returning 500 would throw away the most valuable thing the
 * pipeline produced for the sake of the least valuable step in it.
 *
 * A missing webhook records `not_configured` rather than passing silently. `postEscalationToSlack`
 * is right to throw on it, because a caller that escalates and sends nothing has failed at
 * the only thing escalation is for. What this caller can do that the poster cannot is make
 * the failure visible: the state is stored and the reviewer page shows the refusal as
 * undelivered, so an unconfigured deployment is something a person can see rather than
 * something the system forgets.
 *
 * The last branch swallows an error to record it, which is a thing worth being uneasy about.
 * It is bounded to a post that never got a response, has no status to name, and would
 * otherwise take the whole run down; `failed:unreachable` is what the reviewer reads.
 */
async function deliver(
  campaign: CampaignInput,
  escalation: EscalationDecision,
  options: SlackPostOptions,
): Promise<SlackDelivery> {
  try {
    await postEscalationToSlack(campaign, escalation, options);
    return "delivered";
  } catch (error: unknown) {
    if (error instanceof SlackConfigError) {
      return "not_configured";
    }

    if (error instanceof SlackDeliveryError) {
      return `failed:${error.status}`;
    }

    return "failed:unreachable";
  }
}

/**
 * Runs the pipeline over a stored campaign and files what it produced.
 *
 * The four stages run in order because each reads the one before it, and the row is written
 * once at the end. Nothing is written in between: an extraction that fabricates a quote or a
 * mapping that cites a sentence the organizer never wrote raises, and a half-file that says
 * what the agent believed before it failed is worse than no file, because a reviewer cannot
 * tell by looking which parts of it were finished.
 *
 * What this function does not do is decide anything. It stores facts, a mapping, what is
 * missing and whether the pipeline refused, and every one of those is evidence. The campaign
 * has no outcome when this returns, and acquires one only when a human records a decision
 * against the run it wrote (ADR-0008).
 */
export async function runTriage(
  campaignId: string,
  options: RunTriageOptions,
): Promise<TriageRunRow> {
  const { db, now, slack = {} } = options;

  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

  if (row === undefined) {
    throw new Error(`There is no campaign ${campaignId} to triage.`);
  }

  const campaign = campaignFromRow(row);
  const model = options.model ?? anthropic(DEFAULT_MODEL_ID);

  const facts = await extractFacts(campaign, model);
  const mapping = await mapCategories(campaign, facts, model);
  const missingEvidence = buildMissingEvidenceReport(mapping);
  const escalation = evaluateEscalation(campaign, facts, mapping);

  const slackDelivery = escalation.escalate ? await deliver(campaign, escalation, slack) : null;

  const [stored] = await db
    .insert(triageRuns)
    .values({
      id: `run_${randomUUID()}`,
      campaignId: campaign.id,
      facts,
      mapping,
      missingEvidence,
      escalation,
      policyVersion: mapping.policyVersion,
      model: modelIdOf(model),
      slackDelivery,
      ...(now === undefined ? {} : { createdAt: now() }),
    })
    .returning();

  return stored as TriageRunRow;
}
