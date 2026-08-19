"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "../../db/index";
import { campaigns } from "../../db/schema";
import { DecisionInput, recordDecision } from "../../lib/decision";
import { campaignRowFrom, fieldsOf, firstIssue, NewCampaignForm } from "../../lib/forms";
import { runTriage } from "../../lib/triage";

/**
 * The write side of the reviewer UI.
 *
 * NO AUTHENTICATION. This is a prototype, and the reviewer types their own name into the
 * decision form. That is a real limitation and not a simplification of one: an audit trail
 * whose author is self-reported records who someone said they were. A deployment binds the
 * reviewer from the session instead, and the `reviewer` field stops being an input.
 *
 * Everything arrives as form strings and is parsed by a schema before it reaches a query.
 * A failure sends the reviewer back to the page they came from with the reason on it, rather
 * than to a stack trace, and nothing is written on the way.
 */

const CampaignId = z.string().min(1);

function backTo(path: string, reason: string): never {
  redirect(`${path}?error=${encodeURIComponent(reason)}`);
}

export async function createCampaign(formData: FormData): Promise<void> {
  const submitted = NewCampaignForm.safeParse(fieldsOf(formData));

  if (!submitted.success) {
    backTo("/campaigns", firstIssue(submitted.error));
  }

  const row = campaignRowFrom(submitted.data);
  await getDatabase().insert(campaigns).values(row);

  redirect(`/campaigns/${encodeURIComponent(row.id)}`);
}

/**
 * Runs the pipeline over a campaign and files the agent's reading of it.
 *
 * A failed run is reported and nothing is stored, which is `runTriage`'s behaviour rather
 * than this handler's: a model that fabricates a quote fails the whole file (ADR-0003), and
 * the reviewer is told that the campaign has not been read rather than shown a partial file
 * they cannot tell is partial.
 */
export async function runTriageAction(formData: FormData): Promise<void> {
  const campaignId = CampaignId.parse(fieldsOf(formData).campaignId);
  const detail = `/campaigns/${encodeURIComponent(campaignId)}`;

  const failure = await runTriage(campaignId, { db: getDatabase() }).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

  if (failure !== null) {
    backTo(detail, `The triage run did not complete: ${failure}`);
  }

  redirect(detail);
}

/**
 * Records the human decision, which is the only thing that publishes an outcome.
 *
 * There is no branch here that publishes anything else, and there could not usefully be one:
 * the schema has nowhere else to put an outcome, so a handler that wanted to skip this step
 * would have nothing to write (ADR-0008).
 */
export async function submitDecision(formData: FormData): Promise<void> {
  const fields = fieldsOf(formData);
  const campaignId = CampaignId.parse(fields.campaignId);
  const detail = `/campaigns/${encodeURIComponent(campaignId)}`;

  const submitted = DecisionInput.safeParse(fields);

  if (!submitted.success) {
    backTo(detail, firstIssue(submitted.error));
  }

  await recordDecision(submitted.data, getDatabase());

  redirect(detail);
}
