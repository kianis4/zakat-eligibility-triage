import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TriageRunRow } from "../../../../db/schema";
import {
  CROSS_CUTTING_RESTRICTIONS,
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
    createdAt: new Date("2026-08-19T11:00:00.000Z"),
    sequence: 1,
    ...overrides,
  };
}

function markupOf(run: TriageRunRow): string {
  return renderToStaticMarkup(<AgentFile run={run} />);
}

describe("the agent file on the result page", () => {
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

  it("shows the questions a donor would send the organizer", () => {
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
      }),
    );

    expect(markup).toContain("Which portion of the amount raised");
  });

  it("says nothing about sending the refusal anywhere, because it is not sent", () => {
    const markups = [
      markupOf(runWith()),
      markupOf(
        runWith({
          escalation: {
            escalate: true,
            reasons: [{ kind: "nothing_resolvable", question: "Ask or decline?", citations: [] }],
          },
        }),
      ),
    ];

    for (const markup of markups) {
      expect(markup).not.toMatch(/slack|\bdeliver(ed)?\b|reviewer channel|notified/i);
    }
  });

  it("records which model read the campaign and against which policy", () => {
    const markup = markupOf(runWith());

    expect(markup).toContain("claude-sonnet-5");
    expect(markup).toContain(POLICY_VERSION);
    expect(markup).toContain("This file decides nothing");
  });
});

/**
 * The donor is the person who acts on the file, and there are two people they can take a
 * question to. The page sorts every question by who can answer it.
 */
describe("the questions, sorted by who can answer them", () => {
  const organizerQuestion = "Which portion of the amount raised does each of those uses account for?";
  const scholarQuestion = "Which position does the scholar you follow hold, and does it cover this campaign?";

  const refused = runWith({
    escalation: {
      escalate: true,
      reasons: [
        { kind: "mixed_use", question: organizerQuestion, citations: [] },
        { kind: "scholarly_difference", question: scholarQuestion, citations: [] },
      ],
    },
  });

  function section(markup: string, id: string): string {
    const start = markup.indexOf(`id="${id}"`);
    const next = markup.indexOf("<h3", start + 1);

    expect(start).toBeGreaterThan(-1);

    return markup.slice(start, next === -1 ? undefined : next);
  }

  it("puts the organizer's questions under their own heading, missing evidence included", () => {
    const markup = markupOf(refused);
    const organizer = section(markup, "ask-organizer");

    expect(organizer).toContain("Questions to ask the organizer");
    expect(organizer).toContain(organizerQuestion);
    expect(organizer).toContain(question);
    expect(organizer).not.toContain(scholarQuestion);
  });

  it("puts a scholarly difference under a heading of its own, for a scholar the donor trusts", () => {
    const markup = markupOf(refused);
    const scholar = section(markup, "ask-scholar");

    expect(scholar).toContain("Questions to take to a scholar you trust");
    expect(scholar).toContain(scholarQuestion);
    expect(scholar).not.toContain(organizerQuestion);
  });

  it("shows the restrictions only the donor can check, and none that bind the recipient", () => {
    const markup = markupOf(runWith());
    const donor = CROSS_CUTTING_RESTRICTIONS.filter((entry) => entry.whereItBinds === "donor");
    const recipient = CROSS_CUTTING_RESTRICTIONS.filter((entry) => entry.whereItBinds !== "donor");

    expect(donor.length).toBeGreaterThan(0);

    for (const entry of donor) {
      expect(markup).toContain(entry.summary.replace(/'/g, "&#x27;"));
    }

    for (const entry of recipient) {
      expect(markup).not.toContain(entry.summary.replace(/'/g, "&#x27;"));
    }
  });

  it("speaks to the donor, not to a reviewer working a queue", () => {
    for (const markup of [markupOf(runWith()), markupOf(refused)]) {
      expect(markup).not.toMatch(/reviewer|queue|\bdecision|platform policy/i);
    }
  });
});
