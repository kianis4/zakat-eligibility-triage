import { eq } from "drizzle-orm";
import Link from "next/link";

import { getDatabase, isDatabaseConfigured } from "../../../db/index";
import { campaigns } from "../../../db/schema";
import { decisionHistory, triageRunsFor } from "../../../lib/decision";
import { retrievePrecedents, type PrecedentForReviewer } from "../../../lib/precedent";
import { Khatam } from "../../khatam";
import { runTriageAction } from "../actions";
import { AgentFile } from "./agent-file";
import { CaseRail } from "./case-rail";
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
 *
 * The campaign's own words are set in a serif wherever they appear, here and in every cited
 * span below, because the document under examination should not look like the tool examining
 * it.
 */
export const dynamic = "force-dynamic";

const DECISION_LABELS = {
  approved: "Approved",
  declined: "Declined",
  info_requested: "Information requested",
} as const;

const DECISION_TONES = {
  approved: "pill--yes",
  declined: "pill--no",
  info_requested: "pill--unknown",
} as const;

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function PrecedentCard({ precedent }: { precedent: PrecedentForReviewer }) {
  return (
    <article className="precedent">
      <div className="card__header">
        <h3>{precedent.title}</h3>
        <span className={`pill ${DECISION_TONES[precedent.decision]}`}>
          {DECISION_LABELS[precedent.decision]}
        </span>
      </div>
      <p className="meta tnum">{`on ${day(precedent.decidedAt)}`}</p>
      <p className="voice-organizer">{precedent.storyExcerpt}</p>
      <div className="outcomes">
        {Object.entries(precedent.categoryOutcomes).map(([category, outcome]) => (
          <span className="outcomes__item" key={category}>
            <span className="outcomes__label">{category}</span>
            {outcome.replace(/_/g, " ")}
          </span>
        ))}
      </div>
      <blockquote className="quote" style={{ marginTop: "1rem" }}>
        <p className="voice-quoted">{precedent.reviewerNote}</p>
        <footer className="quote__offsets">
          Recorded by the reviewer who decided this case
        </footer>
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
        <div className="state">
          <Khatam className="state__mark" outline size={40} />
          <h1>Database not configured</h1>
          <p>
            DATABASE_URL is not set, so no campaign can be loaded and no precedent can be
            retrieved. Set it and reload; the suite runs without it.
          </p>
        </div>
      </main>
    );
  }

  const db = getDatabase();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);

  if (campaign === undefined) {
    return (
      <main>
        <div className="state">
          <Khatam className="state__mark" outline size={40} />
          <h1>No campaign {id}</h1>
          <p>Nothing is stored under that identifier.</p>
        </div>
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
    <main className="case">
      <CaseRail
        decided={history.length > 0}
        hasRun={latestRun !== undefined}
        refused={latestRun?.escalation.escalate === true}
      />

      <div>
        <Link className="backlink" href="/campaigns">
          Back to the queue
        </Link>

        <div className="card">
          <h1>{campaign.title}</h1>
          {error === undefined ? null : (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <dl className="meta-grid">
            <div>
              <dt className="meta-grid__label">Platform category, as the organizer selected it</dt>
              <dd className="meta-grid__value">{campaign.category}</dd>
            </div>
            <div>
              <dt className="meta-grid__label">Stated goal</dt>
              <dd className="meta-grid__value tnum">
                {`${campaign.goalAmount} ${campaign.currency}`}
              </dd>
            </div>
            <div>
              <dt className="meta-grid__label">Organizer</dt>
              <dd className="meta-grid__value">
                {`${campaign.organizerName}, ${campaign.organizerLocation}`}
              </dd>
            </div>
            <div>
              <dt className="meta-grid__label">Declared relationship to the beneficiary</dt>
              <dd className="meta-grid__value">
                {campaign.organizerRelationshipToBeneficiary ?? "Not declared"}
              </dd>
            </div>
            <div>
              <dt className="meta-grid__label">Submitted</dt>
              <dd className="meta-grid__value tnum">{day(campaign.createdAt)}</dd>
            </div>
          </dl>
        </div>

        <h2 id="story">Campaign story</h2>
        <div className="card measure">
          <p className="voice-organizer" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {campaign.story}
          </p>
        </div>

        <h2 id="agent-file">The agent&apos;s file</h2>
        <div className="card card--tint measure">
          <p>Who wrote what you are about to read:</p>
          <ProvenanceLegend />
        </div>

        {latestRun === undefined ? (
          <form action={runTriageAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <div className="card measure">
              <p>
                The agent has not read this campaign yet. A decision is always recorded against a
                specific agent file, so the pipeline runs first.
              </p>
              <button className="btn" type="submit">
                Run the triage
              </button>
            </div>
          </form>
        ) : (
          <>
            <AgentFile run={latestRun} />
            <form action={runTriageAction}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <p style={{ marginTop: "1.5rem" }}>
                <button className="btn btn--quiet" type="submit">
                  Read the campaign again
                </button>
              </p>
              <p className="meta measure">
                Files a new agent file. The one above is kept, and any decision already taken
                against it keeps pointing at what its reviewer read.
              </p>
            </form>
          </>
        )}

        <h2 id="precedent">Precedent</h2>
        <p className="measure">
          Previously adjudicated campaigns, closest first. Every one of them is synthetic and
          written for this repository. They are here for you to compare against and they
          decide nothing: the decision on this campaign is yours to record.
        </p>
        <p className="meta measure">
          None of this section was shown to the model that read the campaign. See ADR-0004
          for why.
        </p>
        {precedents.length === 0 ? (
          <div className="state">
            <Khatam className="state__mark" outline size={40} />
            <p>No adjudicated campaigns are stored yet.</p>
          </div>
        ) : (
          precedents.map((precedent) => <PrecedentCard key={precedent.id} precedent={precedent} />)
        )}

        <h2 id="decision">Decision</h2>
        {latestRun === undefined ? (
          <p>Run the triage above before recording a decision.</p>
        ) : (
          <DecisionForm campaignId={campaign.id} run={latestRun} />
        )}

        <h2 id="audit-trail">Audit trail</h2>
        <AuditTrail history={history} runs={runsById} />
      </div>
    </main>
  );
}
