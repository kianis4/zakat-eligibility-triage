import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DecisionAction, DecisionRow, TriageRunRow } from "../../../../db/schema";
import { POLICY_VERSION } from "../../../../lib/categories";
import { buildMissingEvidenceReport } from "../../../../lib/missing-evidence";
import {
  ESCALATED,
  FIXTURE_CAMPAIGN,
  FIXTURE_FACTS,
  mappingSupporting,
  NOT_ESCALATED,
} from "../../../../testing/triage-fixtures";
import { AuditTrail, DecisionForm } from "../decision-panel";

function runWith(overrides: Partial<TriageRunRow> = {}): TriageRunRow {
  const mapping = overrides.mapping ?? mappingSupporting(["al-gharimin"]);

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

function decisionWith(action: DecisionAction, overrides: Partial<DecisionRow> = {}): DecisionRow {
  return {
    id: "dec_render_0001",
    campaignId: FIXTURE_CAMPAIGN.id,
    triageRunId: "run_render_0001",
    action,
    reviewer: "Amina Suleiman",
    note: "The debt is currently due and the beneficiary is named, so this is decidable.",
    decidedAt: new Date("2026-08-19T12:30:00.000Z"),
    sequence: 1,
    ...overrides,
  };
}

function trailOf(history: DecisionRow[], runs: TriageRunRow[]): string {
  return renderToStaticMarkup(
    <AuditTrail history={history} runs={new Map(runs.map((run) => [run.id, run]))} />,
  );
}

describe("the audit trail", () => {
  it("says there is no outcome when nobody has decided", () => {
    const markup = trailOf([], [runWith()]);

    expect(markup).toContain("No decision has been recorded");
    expect(markup).toContain("no outcome");
  });

  it("records who decided what, when, and why", () => {
    const markup = trailOf([decisionWith("approve")], [runWith()]);

    expect(markup).toContain("Approved");
    expect(markup).toContain("Amina Suleiman");
    expect(markup).toContain("2026-08-19 12:30 UTC");
    expect(markup).toContain("The debt is currently due");
  });

  it("names the agent file the decision was taken against", () => {
    const markup = trailOf([decisionWith("approve")], [runWith()]);

    expect(markup).toContain("run_render_0001");
  });

  it("reports agreement when the reviewer went the way the file pointed", () => {
    const markup = trailOf([decisionWith("approve")], [runWith()]);

    expect(markup).toContain("Agreed with the agent file");
  });

  it("reports a departure when the reviewer approved a file that refused", () => {
    const markup = trailOf([decisionWith("approve")], [runWith({ escalation: ESCALATED })]);

    expect(markup).toContain("Departed from the agent file");
  });

  it("calls approving a file that supported nothing an override", () => {
    const markup = trailOf([decisionWith("approve")], [runWith({ mapping: mappingSupporting([]) })]);

    expect(markup).toContain("Human overrode agent file");
  });

  it("measures each decision against the file it names, not the newest one", () => {
    const older = runWith({ id: "run_older", escalation: ESCALATED });
    const newer = runWith({ id: "run_newer", sequence: 2 });

    const markup = trailOf(
      [
        decisionWith("escalate", { id: "dec_a", triageRunId: "run_older", sequence: 1 }),
        decisionWith("approve", { id: "dec_b", triageRunId: "run_newer", sequence: 2 }),
      ],
      [older, newer],
    );

    expect(markup.match(/Agreed with the agent file/g)).toHaveLength(2);
  });
});

describe("the decision form", () => {
  it("offers the three actions and no fourth", () => {
    const markup = renderToStaticMarkup(
      <DecisionForm campaignId={FIXTURE_CAMPAIGN.id} run={runWith()} />,
    );

    expect(markup).toContain('value="approve"');
    expect(markup).toContain('value="request_info"');
    expect(markup).toContain('value="escalate"');
    expect(markup.match(/type="radio"/g)).toHaveLength(3);
  });

  it("carries the agent file the decision is being taken against", () => {
    const markup = renderToStaticMarkup(
      <DecisionForm campaignId={FIXTURE_CAMPAIGN.id} run={runWith()} />,
    );

    expect(markup).toContain('name="triageRunId" value="run_render_0001"');
  });

  it("says on the page that the reviewer name is self-reported", () => {
    const markup = renderToStaticMarkup(
      <DecisionForm campaignId={FIXTURE_CAMPAIGN.id} run={runWith()} />,
    );

    expect(markup).toContain("no");
    expect(markup).toContain("authentication");
  });
});
