import { eq } from "drizzle-orm";

import { getDatabase, isDatabaseConfigured } from "../../../db/index";
import { campaigns } from "../../../db/schema";
import { retrievePrecedents, type PrecedentForReviewer } from "../../../lib/precedent";

/**
 * The reviewer's file for one campaign, with comparable adjudications beside it.
 *
 * Rendered per request. Precedent is read at request time and read for this reviewer:
 * it is on this page and nowhere near a prompt, which is the rule ADR-0004 sets and
 * `src/lib/__tests__/precedent-isolation.test.ts` enforces.
 *
 * The findings table, the missing-evidence questions and the decision controls are later
 * issues. What is here is the campaign as submitted and the precedent section.
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

export default async function CampaignReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const precedents = await retrievePrecedents(campaign, { db });

  return (
    <main>
      <h1>{campaign.title}</h1>
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
    </main>
  );
}
