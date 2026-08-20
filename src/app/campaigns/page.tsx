import Link from "next/link";

import { getDatabase, isDatabaseConfigured } from "../../db/index";
import { campaignQueue, type QueueEntry } from "../../lib/decision";
import { Khatam } from "../khatam";
import { createCampaign } from "./actions";

/**
 * The reviewer's queue, and the form that puts a campaign into it.
 *
 * What the queue shows about a campaign is whether the agent has read it and whether a human
 * has decided it, and those are two separate columns because they are two separate things. A
 * campaign the pipeline finished an hour ago is not thereby decided, and this page has no way
 * to render it as though it were: the outcome column reads a decision row or shows nothing
 * (ADR-0008).
 *
 * The two columns are pills rather than sentences so the difference survives a scan down the
 * page, and the pill carries its own words in every case: nothing here is legible by colour
 * alone.
 */
export const dynamic = "force-dynamic";

const OUTCOME_LABELS = {
  approve: "Approved",
  request_info: "Information requested",
  escalate: "Escalated",
} as const;

const OUTCOME_TONES = {
  approve: "pill--yes",
  request_info: "pill--unknown",
  escalate: "pill--quiet",
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
    <p className="alert" role="alert">
      {reason}
    </p>
  );
}

function QueueRow({ entry }: { entry: QueueEntry }) {
  return (
    <tr>
      <td>
        <Link className="queue__title" href={`/campaigns/${encodeURIComponent(entry.id)}`}>
          {entry.title}
        </Link>
      </td>
      <td className="queue__meta tnum">{day(entry.createdAt)}</td>
      <td>
        <span className={`pill ${entry.hasTriageRun ? "pill--yes" : "pill--no"}`}>
          {entry.hasTriageRun ? "Read by the agent" : "Not read yet"}
        </span>
      </td>
      <td>
        {entry.outcome === null ? (
          <span className="pill pill--no">No decision recorded</span>
        ) : (
          <span className={`pill ${OUTCOME_TONES[entry.outcome]}`}>
            {OUTCOME_LABELS[entry.outcome]}
          </span>
        )}
      </td>
    </tr>
  );
}

function SubmitForm() {
  return (
    <form action={createCampaign}>
      <div className="field-grid">
        <div className="field field--wide">
          <label className="field__label" htmlFor="title">
            Title
          </label>
          <input className="input" id="title" name="title" required />
        </div>

        <div className="field field--wide">
          <label className="field__label" htmlFor="story">
            Story, in the organizer&apos;s own words
          </label>
          <textarea className="textarea" id="story" name="story" required rows={8} />
        </div>

        <div className="field field--wide">
          <label className="field__label" htmlFor="category">
            Platform category, as the organizer selected it
          </label>
          <input className="input" id="category" name="category" required />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="goalAmount">
            Stated goal
          </label>
          <input
            className="input"
            id="goalAmount"
            min="0"
            name="goalAmount"
            required
            step="0.01"
            type="number"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="currency">
            Currency
          </label>
          <input className="input" id="currency" name="currency" required size={5} />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="organizerName">
            Organizer
          </label>
          <input className="input" id="organizerName" name="organizerName" required />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="organizerLocation">
            Organizer location
          </label>
          <input className="input" id="organizerLocation" name="organizerLocation" required />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="organizerRelationshipToBeneficiary">
            Declared relationship to the beneficiary, if any
          </label>
          <input
            className="input"
            id="organizerRelationshipToBeneficiary"
            name="organizerRelationshipToBeneficiary"
          />
        </div>
      </div>

      <button className="btn" type="submit">
        Submit the campaign
      </button>
    </form>
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
        <div className="state">
          <Khatam className="state__mark" outline size={40} />
          <h1>Database not configured</h1>
          <SubmissionError reason={error} />
          <p>
            DATABASE_URL is not set, so there is no queue to read and no campaign can be
            submitted. Set it and reload; the suite runs without it.
          </p>
        </div>
      </main>
    );
  }

  const queue = await campaignQueue(getDatabase());

  return (
    <main>
      <h1>Campaigns</h1>
      <SubmissionError reason={error} />

      <p className="measure">
        Read by the agent means a triage file exists. It does not mean the campaign has an
        outcome. Only a recorded human decision does that.
      </p>

      {queue.length === 0 ? (
        <div className="state">
          <Khatam className="state__mark" outline size={40} />
          <p>No campaigns have been submitted yet.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="queue">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Submitted</th>
                <th>Agent file</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((entry) => (
                <QueueRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Submit a campaign</h2>
      <div className="card">
        <SubmitForm />
      </div>
    </main>
  );
}
