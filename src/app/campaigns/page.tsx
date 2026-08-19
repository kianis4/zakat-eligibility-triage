import Link from "next/link";

import { getDatabase, isDatabaseConfigured } from "../../db/index";
import { campaignQueue, type QueueEntry } from "../../lib/decision";
import { createCampaign } from "./actions";

/**
 * The reviewer's queue, and the form that puts a campaign into it.
 *
 * What the queue shows about a campaign is whether the agent has read it and whether a human
 * has decided it, and those are two separate columns because they are two separate things. A
 * campaign the pipeline finished an hour ago is not thereby decided, and this page has no way
 * to render it as though it were: the outcome column reads a decision row or shows nothing
 * (ADR-0008).
 */
export const dynamic = "force-dynamic";

const OUTCOME_LABELS = {
  approve: "Approved",
  request_info: "Information requested",
  escalate: "Escalated",
} as const;

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Why the last submission bounced, carried back on the query string.
 *
 * It renders in the unconfigured state as well, because a submission can be rejected by the
 * schema before anything reaches a database, and a reviewer who fixed the field they were
 * told about is better off than one who was told the database is missing.
 */
function SubmissionError({ reason }: { reason: string | undefined }) {
  if (reason === undefined) {
    return null;
  }

  return (
    <p role="alert" style={{ border: "1px solid #b00", padding: "0.5rem 0.75rem" }}>
      {reason}
    </p>
  );
}

function QueueRow({ entry }: { entry: QueueEntry }) {
  return (
    <tr>
      <td style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>
        <Link href={`/campaigns/${encodeURIComponent(entry.id)}`}>{entry.title}</Link>
      </td>
      <td style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>{day(entry.createdAt)}</td>
      <td style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>
        {entry.hasTriageRun ? "Read by the agent" : "Not read yet"}
      </td>
      <td style={{ padding: "0.4rem 0" }}>
        {entry.outcome === null ? "No decision recorded" : OUTCOME_LABELS[entry.outcome]}
      </td>
    </tr>
  );
}

export default async function CampaignQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <main>
        <h1>Database not configured</h1>
        <SubmissionError reason={error} />
        <p>
          DATABASE_URL is not set, so there is no queue to read and no campaign can be
          submitted. Set it and reload; the suite runs without it.
        </p>
      </main>
    );
  }

  const queue = await campaignQueue(getDatabase());

  return (
    <main>
      <h1>Campaigns</h1>
      <SubmissionError reason={error} />

      <p>
        Read by the agent means a triage file exists. It does not mean the campaign has an
        outcome. Only a recorded human decision does that.
      </p>

      {queue.length === 0 ? (
        <p>No campaigns have been submitted yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>Campaign</th>
              <th style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>Submitted</th>
              <th style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>Agent file</th>
              <th style={{ padding: "0.4rem 0" }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((entry) => (
              <QueueRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      )}

      <h2>Submit a campaign</h2>
      <form action={createCampaign}>
        <p>
          <label htmlFor="title">Title</label>
          <br />
          <input id="title" name="title" required style={{ width: "100%" }} />
        </p>
        <p>
          <label htmlFor="story">Story, in the organizer&apos;s own words</label>
          <br />
          <textarea id="story" name="story" required rows={8} style={{ width: "100%" }} />
        </p>
        <p>
          <label htmlFor="category">Platform category, as the organizer selected it</label>
          <br />
          <input id="category" name="category" required />
        </p>
        <p>
          <label htmlFor="goalAmount">Stated goal</label>
          <br />
          <input id="goalAmount" name="goalAmount" type="number" step="0.01" min="0" required />
          {" "}
          <label htmlFor="currency">Currency</label>{" "}
          <input id="currency" name="currency" size={5} required />
        </p>
        <p>
          <label htmlFor="organizerName">Organizer</label>
          <br />
          <input id="organizerName" name="organizerName" required />
        </p>
        <p>
          <label htmlFor="organizerLocation">Organizer location</label>
          <br />
          <input id="organizerLocation" name="organizerLocation" required />
        </p>
        <p>
          <label htmlFor="organizerRelationshipToBeneficiary">
            Declared relationship to the beneficiary, if any
          </label>
          <br />
          <input
            id="organizerRelationshipToBeneficiary"
            name="organizerRelationshipToBeneficiary"
          />
        </p>
        <p>
          <button type="submit">Submit the campaign</button>
        </p>
      </form>
    </main>
  );
}
