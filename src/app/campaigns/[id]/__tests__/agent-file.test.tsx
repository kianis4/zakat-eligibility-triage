import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TriageRunRow } from "../../../../db/schema";
import {
  POLICY_VERSION,
  RECIPIENT_CATEGORY_IDS,
  SCHOLARLY_DIFFERENCE_IDS,
  scholarlyDifferenceById,
} from "../../../../lib/categories";
import { CategoryMapping, resolveCitation } from "../../../../lib/mapping";
import { buildMissingEvidenceReport } from "../../../../lib/missing-evidence";
import { FIXTURE_CAMPAIGN, FIXTURE_FACTS, NOT_ESCALATED } from "../../../../testing/triage-fixtures";
import { AgentFile } from "../agent-file";

const difference = scholarlyDifferenceById(SCHOLARLY_DIFFERENCE_IDS[0]);

const whyThisApplies = "The campaign funds a programme rather than a named household.";

const question = "Could you tell us who receives the money once it is raised?";

const mapping = CategoryMapping.parse({
  policyVersion: POLICY_VERSION,
  categories: Object.fromEntries(
    RECIPIENT_CATEGORY_IDS.map((id) => [
      id,
      id === "al-gharimin"
        ? {
            status: "supported",
            citations: [resolveCitation(FIXTURE_CAMPAIGN.story, "cannot repay it")],
            rationale: "The story states a debt the family says it cannot repay.",
          }
        : id === difference.category
          ? {
              status: "insufficient_evidence",
              rationale: "The story does not say enough about this category.",
              missingFact: "Who ultimately receives the money.",
              questionForOrganizer: question,
              scholarlyDifference: { entry: difference, whyThisApplies },
            }
          : {
              status: "not_supported",
              rationale: "The story says nothing that bears on this category.",
            },
    ]),
  ),
  mixedUseSignals: [],
});

function runWith(overrides: Partial<TriageRunRow> = {}): TriageRunRow {
  return {
    id: "run_render_0001",
    campaignId: FIXTURE_CAMPAIGN.id,
    facts: FIXTURE_FACTS,
    mapping,
    missingEvidence: buildMissingEvidenceReport(mapping),
    escalation: NOT_ESCALATED,
    policyVersion: POLICY_VERSION,
    model: "claude-sonnet-5",
    slackDelivery: null,
    createdAt: new Date("2026-08-19T11:00:00.000Z"),
    sequence: 1,
    ...overrides,
  };
}

function markupOf(run: TriageRunRow): string {
  return renderToStaticMarkup(<AgentFile run={run} />);
}

describe("the agent file on the reviewer's page", () => {
  it("attributes the model's own sentences to the model", () => {
    const markup = markupOf(runWith());

    expect(markup).toContain("MODEL PROSE");
    expect(markup).toContain("The story states a debt the family says it cannot repay.");
    expect(markup).toContain(whyThisApplies);
  });

  it("shows a supported finding's span with the offsets it occupies", () => {
    const markup = markupOf(runWith());
    const citation = resolveCitation(FIXTURE_CAMPAIGN.story, "cannot repay it");

    expect(markup).toContain("CAMPAIGN QUOTE");
    expect(markup).toContain(`characters ${citation.start} to ${citation.end}`);
  });

  it("shows a recorded difference as corpus text, under the id it is stored by", () => {
    const markup = markupOf(runWith());

    expect(markup).toContain("CORPUS TEXT");
    expect(markup).toContain(difference.id);
    expect(markup).toContain(difference.topic);
    expect(markup).toContain(difference.summary.slice(0, 90));
  });

  it("shows the questions a reviewer would send the organizer", () => {
    const markup = markupOf(runWith());

    expect(markup).toContain(question);
  });

  it("says the pipeline did not refuse, rather than saying it approved", () => {
    const markup = markupOf(runWith());

    expect(markup).toContain("The pipeline did not refuse");
    expect(markup).not.toContain("Approved");
    expect(markup).not.toContain("eligible");
  });

  it("renders a refusal with the specific question it raised", () => {
    const markup = markupOf(
      runWith({
        escalation: {
          escalate: true,
          reasons: [
            {
              kind: "mixed_use",
              question: "Which portion of the amount raised does each of those uses account for?",
              citations: [resolveCitation(FIXTURE_CAMPAIGN.story, "cannot repay it")],
            },
          ],
        },
        slackDelivery: "delivered",
      }),
    );

    expect(markup).toContain("Which portion of the amount raised");
    expect(markup).toContain("Posted to the reviewer channel");
  });

  it("says plainly when the refusal reached nobody", () => {
    const undelivered = markupOf(
      runWith({
        escalation: {
          escalate: true,
          reasons: [{ kind: "nothing_resolvable", question: "Ask or decline?", citations: [] }],
        },
        slackDelivery: "not_configured",
      }),
    );

    expect(undelivered).toContain("NOT DELIVERED");
    expect(undelivered).toContain("No Slack webhook is configured");
  });

  it("says which failure kept the refusal from reaching anyone", () => {
    const failed = markupOf(
      runWith({
        escalation: {
          escalate: true,
          reasons: [{ kind: "nothing_resolvable", question: "Ask or decline?", citations: [] }],
        },
        slackDelivery: "failed:500",
      }),
    );

    expect(failed).toContain("NOT DELIVERED");
    expect(failed).toContain("failed:500");
  });

  it("records which model read the campaign and against which policy", () => {
    const markup = markupOf(runWith());

    expect(markup).toContain("claude-sonnet-5");
    expect(markup).toContain(POLICY_VERSION);
    expect(markup).toContain("This file decides nothing");
  });
});
