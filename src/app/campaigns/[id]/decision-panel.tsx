import type { DecisionRow, TriageRunRow } from "../../../db/schema";
import { agreementWith } from "../../../lib/decision";
import { submitDecision } from "../actions";

/**
 * Where the campaign acquires an outcome, which is the only place it can.
 *
 * The reviewer types their own name because this prototype has no authentication. That is
 * stated on the page rather than only in a comment, because a trail whose author is
 * self-reported records who someone said they were, and a person reading the trail should
 * know that about it. A deployment binds the reviewer from the session.
 */

const ACTION_LABELS = {
  approve: "Approve",
  request_info: "Request information from the organizer",
  escalate: "Escalate to someone with more standing",
} as const;

const OUTCOME_LABELS = {
  approve: "Approved",
  request_info: "Information requested",
  escalate: "Escalated",
} as const;

function moment(at: Date): string {
  return `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function DecisionForm({ campaignId, run }: { campaignId: string; run: TriageRunRow }) {
  return (
    <form action={submitDecision}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="triageRunId" value={run.id} />

      <fieldset style={{ border: "1px solid #ccc", padding: "0.75rem" }}>
        <legend>Your decision, which is the one that counts</legend>

        {(Object.keys(ACTION_LABELS) as (keyof typeof ACTION_LABELS)[]).map((action) => (
          <p key={action} style={{ margin: "0.25rem 0" }}>
            <input type="radio" id={action} name="action" value={action} required />{" "}
            <label htmlFor={action}>{ACTION_LABELS[action]}</label>
          </p>
        ))}

        <p>
          <label htmlFor="reviewer">Your name</label>
          <br />
          <input id="reviewer" name="reviewer" required />
          <br />
          <small>
            Typed rather than taken from a session, because this prototype has no
            authentication.
          </small>
        </p>

        <p>
          <label htmlFor="note">Why</label>
          <br />
          <textarea id="note" name="note" rows={4} required style={{ width: "100%" }} />
          <br />
          <small>
            Required. A decision with no reasoning behind it cannot be reviewed later, and the
            database will not store one.
          </small>
        </p>

        <p>
          <button type="submit">Record the decision</button>
        </p>
      </fieldset>
    </form>
  );
}

/**
 * Every decision recorded about this campaign, and whether each went the way the agent
 * pointed.
 *
 * Agreement is computed here, against the run each decision names, rather than read from a
 * column. A decision taken against an older file is measured against that file, so the trail
 * does not restate history every time the pipeline runs again.
 */
export function AuditTrail({
  history,
  runs,
}: {
  history: readonly DecisionRow[];
  runs: ReadonlyMap<string, TriageRunRow>;
}) {
  if (history.length === 0) {
    return (
      <p>
        No decision has been recorded, so this campaign has no outcome. Nothing above is one.
      </p>
    );
  }

  return (
    <ol>
      {history.map((decision) => {
        const run = runs.get(decision.triageRunId);
        const agreement = run === undefined ? null : agreementWith(run, decision.action);

        return (
          <li key={decision.id} style={{ margin: "0.75rem 0" }}>
            <p style={{ margin: 0 }}>
              <strong>{OUTCOME_LABELS[decision.action]}</strong>
              {` by ${decision.reviewer}, ${moment(decision.decidedAt)}`}
            </p>
            <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
              {`Against agent file ${decision.triageRunId}. `}
              {agreement === null ? "That file is no longer readable." : agreement.summary}
            </p>
            <blockquote style={{ margin: 0, paddingLeft: "0.75rem", borderLeft: "3px solid #ccc" }}>
              <p style={{ margin: 0 }}>{decision.note}</p>
            </blockquote>
          </li>
        );
      })}
    </ol>
  );
}
