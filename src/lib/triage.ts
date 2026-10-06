import { randomUUID } from "node:crypto";

import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { eq } from "drizzle-orm";

import type { TriageDatabase } from "../db/index";
import { campaigns, triageRuns, type CampaignRow, type TriageRunRow } from "../db/schema";
import { CampaignInput } from "./campaign";
import { evaluateEscalation } from "./escalation";
import { extractFacts } from "./extraction";
import { mapCategories } from "./mapping";
import { buildMissingEvidenceReport } from "./missing-evidence";

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
 * has no outcome when this returns and never acquires one here: the donor reading the file
 * decides, and records nothing in this system when they do.
 */
export async function runTriage(
  campaignId: string,
  options: RunTriageOptions,
): Promise<TriageRunRow> {
  const { db, now } = options;

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
      ...(now === undefined ? {} : { createdAt: now() }),
    })
    .returning();

  return stored as TriageRunRow;
}

/**
 * Every agent file written about a campaign, oldest first. The result page shows the last.
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
