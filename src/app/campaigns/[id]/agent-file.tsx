import type { TriageRunRow } from "../../../db/schema";
import { RECIPIENT_CATEGORIES } from "../../../lib/categories";
import type { Citation, ScholarlyDifferenceReference } from "../../../lib/mapping";
import { Attributed } from "./provenance";

/**
 * The agent's file, rendered as evidence rather than as an answer.
 *
 * Nothing on this page is an outcome, and the wording is chosen so that nothing reads like
 * one. A category is supported by the text or it is not; the campaign is neither, until a
 * human records a decision (ADR-0008).
 */

const FINDING_LABELS = {
  supported: "Supported by the text",
  not_supported: "Not supported by the text",
  insufficient_evidence: "Not enough in the text to tell",
} as const;

const DELIVERY_LABELS: Record<string, string> = {
  delivered: "Posted to the reviewer channel.",
  not_configured: "NOT DELIVERED. No Slack webhook is configured, so nobody was notified.",
};

function deliveryLabel(delivery: string | null): string {
  if (delivery === null) {
    return "Nothing to deliver: the pipeline did not refuse.";
  }

  return (
    DELIVERY_LABELS[delivery] ??
    `NOT DELIVERED. The post to the reviewer channel failed (${delivery}), so nobody was notified.`
  );
}

function Quoted({ citation }: { citation: Citation }) {
  return (
    <Attributed kind="campaign">
      <blockquote style={{ margin: 0, paddingLeft: "0.75rem", borderLeft: "3px solid #99a" }}>
        <p style={{ margin: 0 }}>{citation.quote}</p>
        <footer style={{ fontSize: "0.8rem" }}>
          {`characters ${citation.start} to ${citation.end} of the story`}
        </footer>
      </blockquote>
    </Attributed>
  );
}

/**
 * The recorded disagreement a finding sits inside, and the model's sentence about it.
 *
 * The two travel under separate labels because they have separate authors. The entry is shown
 * with the id it was selected by, so a reader can check it against the corpus rather than
 * taking the page's word for it.
 */
function ScholarlyDifference({ difference }: { difference: ScholarlyDifferenceReference }) {
  return (
    <div style={{ margin: "0.5rem 0", padding: "0.5rem", background: "#fafafa" }}>
      <p style={{ margin: 0, fontSize: "0.85rem" }}>
        {`Recognised scholars differ on ${difference.entry.topic} (${difference.entry.id})`}
      </p>
      <Attributed kind="corpus">
        <p style={{ margin: 0 }}>{difference.entry.summary}</p>
      </Attributed>
      <Attributed kind="model">
        <p style={{ margin: 0 }}>{difference.whyThisApplies}</p>
      </Attributed>
    </div>
  );
}

function Finding({ run, category }: { run: TriageRunRow; category: (typeof RECIPIENT_CATEGORIES)[number] }) {
  const finding = run.mapping.categories[category.id];

  if (finding === undefined) {
    return null;
  }

  return (
    <article style={{ borderTop: "1px solid #ddd", padding: "0.75rem 0" }}>
      <h3 style={{ margin: 0, fontSize: "1rem" }}>
        {`${category.id} (${category.gloss})`}
      </h3>
      <p style={{ margin: "0.25rem 0", fontWeight: 600 }}>{FINDING_LABELS[finding.status]}</p>

      <Attributed kind="model">
        <p style={{ margin: 0 }}>{finding.rationale}</p>
      </Attributed>

      {finding.status === "supported"
        ? finding.citations.map((citation) => (
            <Quoted key={`${citation.start}-${citation.end}`} citation={citation} />
          ))
        : null}

      {finding.status === "insufficient_evidence" ? (
        <>
          <Attributed kind="model">
            <p style={{ margin: 0 }}>{`Missing: ${finding.missingFact}`}</p>
          </Attributed>
          <Attributed kind="model">
            <p style={{ margin: 0 }}>{`Ask the organizer: ${finding.questionForOrganizer}`}</p>
          </Attributed>
        </>
      ) : null}

      {finding.scholarlyDifference === undefined ? null : (
        <ScholarlyDifference difference={finding.scholarlyDifference} />
      )}
    </article>
  );
}

export function AgentFile({ run }: { run: TriageRunRow }) {
  return (
    <section>
      <p style={{ fontSize: "0.9rem" }}>
        {`Read by ${run.model} on ${run.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC, against policy ${run.policyVersion}. `}
        This file decides nothing.
      </p>

      <h3>Refusal</h3>
      {run.escalation.escalate ? (
        <div>
          <p style={{ margin: "0.25rem 0" }}>
            The pipeline refused to triage this campaign and put these questions to you.
          </p>
          <p style={{ margin: "0.25rem 0" }}>{deliveryLabel(run.slackDelivery)}</p>
          {run.escalation.reasons.map((reason, index) => (
            <div key={`${reason.kind}-${index}`} style={{ margin: "0.5rem 0" }}>
              <p style={{ margin: 0, fontSize: "0.85rem" }}>{reason.kind.replace(/_/g, " ")}</p>
              <Attributed kind="model">
                <p style={{ margin: 0 }}>{reason.question}</p>
              </Attributed>
              {reason.citations.map((citation) => (
                <Quoted key={`${citation.start}-${citation.end}`} citation={citation} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p>The pipeline did not refuse. {deliveryLabel(run.slackDelivery)}</p>
      )}

      <h3>What the text says about each category</h3>
      {RECIPIENT_CATEGORIES.map((category) => (
        <Finding key={category.id} run={run} category={category} />
      ))}

      <h3>What to ask the organizer</h3>
      {run.missingEvidence.questions.length === 0 ? (
        <p>Nothing was left unresolved for want of a fact the organizer could supply.</p>
      ) : (
        <ol>
          {run.missingEvidence.questions.map((question) => (
            <li key={question}>
              <Attributed kind="model">
                <span>{question}</span>
              </Attributed>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
