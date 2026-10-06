import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

import { getDatabase, isDatabaseConfigured } from "../../../db/index";
import { campaigns } from "../../../db/schema";
import { quotaLimits } from "../../../lib/quota";
import { triageRunsFor } from "../../../lib/triage";
import { Khatam } from "../../khatam";
import { SadaqahNote } from "../../sadaqah-note";
import { AgentFile } from "./agent-file";
import { CaseRail } from "./case-rail";
import { ProvenanceLegend } from "./provenance";

/**
 * The result of one check, at the link the donor was sent to and can share.
 *
 * Rendered per request. It shows the campaign as pasted and the agent's file on it, and
 * nothing the donor did not supply.
 *
 * The page has no outcome to show, ever. That is not a rendering choice: there is no column
 * anywhere that could hold one, and the decision belongs to the person reading the page.
 *
 * The campaign's own words are set in a serif wherever they appear, here and in every cited
 * span below, because the document under examination should not look like the tool examining
 * it.
 */
export const dynamic = "force-dynamic";

/** A result is reached by its link and by nothing else, so it is kept out of search. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function CampaignReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <main>
        <div className="state">
          <Khatam className="state__mark" outline size={40} />
          <h1>Database not configured</h1>
          <p>
            DATABASE_URL is not set, so no campaign can be loaded. Set it and reload; the suite
            runs without it.
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
          <h1>Campaign not found</h1>
          <p>
            {`This campaign was not found, or was deleted after ${quotaLimits(process.env).retentionDays} days.`}
          </p>
        </div>
      </main>
    );
  }

  const runs = await triageRunsFor(campaign.id, db);
  const latestRun = runs.at(-1);

  return (
    <main className="case">
      <CaseRail hasRun={latestRun !== undefined} refused={latestRun?.escalation.escalate === true} />

      <div>
        <Link className="backlink" href="/">
          Check another campaign
        </Link>

        <div className="card">
          <h1>{campaign.title}</h1>
          <dl className="meta-grid">
            {campaign.category === null ? null : (
              <div>
                <dt className="meta-grid__label">Category, as the campaign page shows it</dt>
                <dd className="meta-grid__value">{campaign.category}</dd>
              </div>
            )}
            {campaign.goalAmount === null ? null : (
              <div>
                <dt className="meta-grid__label">Stated goal</dt>
                <dd className="meta-grid__value tnum">
                  {campaign.currency === null
                    ? campaign.goalAmount
                    : `${campaign.goalAmount} ${campaign.currency}`}
                </dd>
              </div>
            )}
            <div>
              <dt className="meta-grid__label">Checked</dt>
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
          <div className="card measure">
            <p>The agent has no file on this campaign. Paste it again on the front page to check it.</p>
          </div>
        ) : (
          <AgentFile run={latestRun} />
        )}

        <SadaqahNote />
      </div>
    </main>
  );
}
