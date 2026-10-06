import { isDatabaseConfigured } from "../../db/index";
import { Khatam } from "../khatam";
import { createCampaign } from "./actions";

/**
 * The form that puts a campaign in front of the agent. There is no listing: a campaign is
 * reached by its own link and by nothing else.
 */
export const dynamic = "force-dynamic";

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
            DATABASE_URL is not set, so no campaign can be submitted. Set it and reload; the
            suite runs without it.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <SubmissionError reason={error} />

      <h2>Submit a campaign</h2>
      <div className="card">
        <SubmitForm />
      </div>
    </main>
  );
}
