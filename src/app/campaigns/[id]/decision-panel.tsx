import type { DecisionRow, TriageRunRow } from "../../../db/schema";
import { agreementWith } from "../../../lib/decision";
import { Khatam } from "../../khatam";
import { submitDecision } from "../actions";

/**
 * Where the campaign acquires an outcome, which is the only place it can.
 *
 * The reviewer types their own name because this prototype has no authentication. That is
 * stated on the page rather than only in a comment, because a trail whose author is
 * self-reported records who someone said they were, and a person reading the trail should
 * know that about it. A deployment binds the reviewer from the session.
 *
 * This is the one card on the page allowed to feel heavier than the rest. Everything above it
 * is evidence; only what happens here decides anything, and the page should look like that is
 * true.
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

      <div className="decision">
        <Khatam className="decision__mark" size={18} />
        <fieldset className="fieldset">
          <legend>Your decision, which is the one that counts</legend>

          {(Object.keys(ACTION_LABELS) as (keyof typeof ACTION_LABELS)[]).map((action) => (
            <div className="choice" key={action}>
              <input type="radio" id={action} name="action" value={action} required />
              <label htmlFor={action}>{ACTION_LABELS[action]}</label>
            </div>
          ))}

          <div className="field" style={{ marginTop: "1.5rem" }}>
            <label className="field__label" htmlFor="reviewer">
              Your name
            </label>
            <input className="input" id="reviewer" name="reviewer" required />
            <small className="field__hint">
              Typed rather than taken from a session, because this prototype has no
              authentication.
            </small>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="note">
              Why
            </label>
            <textarea className="textarea" id="note" name="note" rows={4} required />
            <small className="field__hint">
              Required. A decision with no reasoning behind it cannot be reviewed later, and the
              database will not store one.
            </small>
          </div>

          <button className="btn" type="submit">
            Record the decision
          </button>
        </fieldset>
      </div>
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
      <p className="measure">
        No decision has been recorded, so this campaign has no outcome. Nothing above is one.
      </p>
    );
  }

  return (
    <ol className="timeline">
      {history.map((decision) => {
        const run = runs.get(decision.triageRunId);
        const agreement = run === undefined ? null : agreementWith(run, decision.action);

        return (
          <li className={`timeline__item timeline__item--${decision.action}`} key={decision.id}>
            <p className="timeline__who tnum">
              <strong>{OUTCOME_LABELS[decision.action]}</strong>
              {` by ${decision.reviewer}, ${moment(decision.decidedAt)}`}
            </p>
            <p className="meta">
              {`Against agent file ${decision.triageRunId}. `}
              {agreement === null ? "That file is no longer readable." : agreement.summary}
            </p>
            <blockquote className="quote">
              <p className="voice-quoted">{decision.note}</p>
            </blockquote>
          </li>
        );
      })}
    </ol>
  );
}
