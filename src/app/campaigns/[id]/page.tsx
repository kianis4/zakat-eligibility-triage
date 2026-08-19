import { eq } from "drizzle-orm";
import Link from "next/link";

import { getDatabase, isDatabaseConfigured } from "../../../db/index";
import { campaigns } from "../../../db/schema";
import { decisionHistory, triageRunsFor } from "../../../lib/decision";
import { retrievePrecedents, type PrecedentForReviewer } from "../../../lib/precedent";
import { runTriageAction } from "../actions";
import { AgentFile } from "./agent-file";
import { AuditTrail, DecisionForm } from "./decision-panel";
import { ProvenanceLegend } from "./provenance";

/**
 * The reviewer's file for one campaign, with comparable adjudications beside it.
 *
 * Rendered per request. Precedent is read at request time and read for this reviewer:
 * it is on this page and nowhere near a prompt, which is the rule ADR-0004 sets and
 * `src/lib/__tests__/precedent-isolation.test.ts` enforces.
 *
 * The page has no outcome to show until the audit trail has something in it. That is not a
 * rendering choice: there is no column anywhere that could hold one, so the only thing this
 * page can report about a campaign's standing is what a human recorded (ADR-0008).
 */
export const dynamic = "force-dynamic";

const DECISION_LABELS = {
  approved: "Approved",
  declined: "Declined",
  info_requested: "Information requested",
} as const;

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function PrecedentCard({ precedent }: { precedent: PrecedentForReviewer }) {
  return (
    <article style={{ borderTop: "1px solid #ccc", padding: "1rem 0" }}>
      <h3 style={{ margin: 0 }}>{precedent.title}</h3>
      <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
        <strong>{DECISION_LABELS[precedent.decision]}</strong>
        {` on ${day(precedent.decidedAt)}`}
      </p>
      <p style={{ margin: "0.5rem 0" }}>{precedent.storyExcerpt}</p>
      <dl style={{ margin: "0.5rem 0", fontSize: "0.9rem" }}>
        {Object.entries(precedent.categoryOutcomes).map(([category, outcome]) => (
          <div key={category} style={{ display: "flex", gap: "0.5rem" }}>
            <dt style={{ fontWeight: 600 }}>{category}</dt>
            <dd style={{ margin: 0 }}>{outcome.replace(/_/g, " ")}</dd>
          </div>
        ))}
      </dl>
      <blockquote style={{ margin: "0.5rem 0 0", paddingLeft: "1rem", borderLeft: "3px solid #ccc" }}>
        <p style={{ margin: 0 }}>{precedent.reviewerNote}</p>
        <footer style={{ fontSize: "0.85rem" }}>Recorded by the reviewer who decided this case</footer>
      </blockquote>
    </article>
  );
}

export default async function CampaignReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <main>
        <h1>Database not configured</h1>
        <p>
          DATABASE_URL is not set, so no campaign can be loaded and no precedent can be
          retrieved. Set it and reload; the suite runs without it.
        </p>
      </main>
    );
  }

  const db = getDatabase();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);

  if (campaign === undefined) {
    return (
      <main>
        <h1>No campaign {id}</h1>
        <p>Nothing is stored under that identifier.</p>
      </main>
    );
  }

  const [precedents, runs, history] = await Promise.all([
    retrievePrecedents(campaign, { db }),
    triageRunsFor(campaign.id, db),
    decisionHistory(campaign.id, db),
  ]);

  const latestRun = runs.at(-1);
  const runsById = new Map(runs.map((run) => [run.id, run]));

  return (
    <main>
      <p style={{ fontSize: "0.9rem" }}>
        <Link href="/campaigns">Back to the queue</Link>
      </p>
      <h1>{campaign.title}</h1>
      {error === undefined ? null : (
        <p role="alert" style={{ border: "1px solid #b00", padding: "0.5rem 0.75rem" }}>
          {error}
        </p>
      )}
      <dl>
        <dt>Platform category, as the organizer selected it</dt>
        <dd>{campaign.category}</dd>
        <dt>Stated goal</dt>
        <dd>{`${campaign.goalAmount} ${campaign.currency}`}</dd>
        <dt>Organizer</dt>
        <dd>{`${campaign.organizerName}, ${campaign.organizerLocation}`}</dd>
        <dt>Declared relationship to the beneficiary</dt>
        <dd>{campaign.organizerRelationshipToBeneficiary ?? "Not declared"}</dd>
        <dt>Submitted</dt>
        <dd>{day(campaign.createdAt)}</dd>
      </dl>

      <h2>Campaign story</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{campaign.story}</p>

      <h2>The agent&apos;s file</h2>
      <p>Who wrote what you are about to read:</p>
      <ProvenanceLegend />

      {latestRun === undefined ? (
        <form action={runTriageAction}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <p>
            The agent has not read this campaign yet. A decision is always recorded against a
            specific agent file, so the pipeline runs first.
          </p>
          <p>
            <button type="submit">Run the triage</button>
          </p>
        </form>
      ) : (
        <>
          <AgentFile run={latestRun} />
          <form action={runTriageAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <p>
              <button type="submit">Read the campaign again</button>
              {" "}
              <small>
                Files a new agent file. The one above is kept, and any decision already taken
                against it keeps pointing at what its reviewer read.
              </small>
            </p>
          </form>
        </>
      )}

      <h2>Precedent</h2>
      <p>
        Previously adjudicated campaigns, closest first. Every one of them is synthetic and
        written for this repository. They are here for you to compare against and they
        decide nothing: the decision on this campaign is yours to record.
      </p>
      <p>
        None of this section was shown to the model that read the campaign. See ADR-0004
        for why.
      </p>
      {precedents.length === 0 ? (
        <p>No adjudicated campaigns are stored yet.</p>
      ) : (
        precedents.map((precedent) => <PrecedentCard key={precedent.id} precedent={precedent} />)
      )}

      <h2>Decision</h2>
      {latestRun === undefined ? (
        <p>Run the triage above before recording a decision.</p>
      ) : (
        <DecisionForm campaignId={campaign.id} run={latestRun} />
      )}

      <h2>Audit trail</h2>
      <AuditTrail history={history} runs={runsById} />
    </main>
  );
}
