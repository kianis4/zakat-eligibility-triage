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
 *
 * The layout carries the same argument the wording does. The refusal is the loudest thing on
 * the page because the question it raises is the product, and the summary strip exists so a
 * reviewer can see all eight categories before reading any of them.
 */

const FINDING_LABELS = {
  supported: "Supported by the text",
  not_supported: "Not supported by the text",
  insufficient_evidence: "Not enough in the text to tell",
} as const;

const FINDING_TONES = {
  supported: "yes",
  not_supported: "no",
  insufficient_evidence: "unknown",
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

/**
 * A cited span, marked the way a person marks a document they are working through.
 *
 * The quote is set in the organizer's serif and highlighted, so the eye lands on the words the
 * pipeline actually took rather than on the apparatus around them. Amber inside a refusal, to
 * keep one attention colour running through that card.
 */
function Quoted({ citation, tone = "campaign" }: { citation: Citation; tone?: "campaign" | "refusal" }) {
  return (
    <Attributed kind="campaign">
      <blockquote className="quote">
        <p className="voice-organizer">
          <span className={tone === "refusal" ? "marker marker--amber" : "marker"}>
            {citation.quote}
          </span>
        </p>
        <footer className="quote__offsets tnum">
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
    <div className="difference">
      <p className="meta">
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

/**
 * All eight categories at once, before any one of them is read.
 *
 * This is the only place on the page where the whole mapping is visible without scrolling, and
 * each tile jumps to the finding it summarises. The dot is a second encoding of a status the
 * tile already spells out, never the only one.
 */
function CategoryStrip({ run }: { run: TriageRunRow }) {
  return (
    <ul className="strip">
      {RECIPIENT_CATEGORIES.map((category) => {
        const finding = run.mapping.categories[category.id];

        if (finding === undefined) {
          return null;
        }

        return (
          <li key={category.id}>
            <a href={`#finding-${category.id}`}>
              <span className="strip__name">{category.id}</span>
              <span className="strip__status">
                <span className={`dot dot--${FINDING_TONES[finding.status]}`} />
                {FINDING_LABELS[finding.status]}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function Finding({ run, category }: { run: TriageRunRow; category: (typeof RECIPIENT_CATEGORIES)[number] }) {
  const finding = run.mapping.categories[category.id];

  if (finding === undefined) {
    return null;
  }

  return (
    <article className="finding" id={`finding-${category.id}`}>
      <div className="finding__header">
        <h3 className="finding__title">{`${category.id} (${category.gloss})`}</h3>
        <span className={`pill pill--${FINDING_TONES[finding.status]}`}>
          {FINDING_LABELS[finding.status]}
        </span>
      </div>

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
      <p className="meta">
        {`Read by ${run.model} on ${run.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC, against policy ${run.policyVersion}. `}
        This file decides nothing.
      </p>

      <h3 className="subsection" id="refusal">Refusal</h3>
      {run.escalation.escalate ? (
        <div className="attention">
          <p>The pipeline refused to triage this campaign and put these questions to you.</p>
          <p className="meta">{deliveryLabel(run.slackDelivery)}</p>
          {run.escalation.reasons.map((reason, index) => (
            <div className="attention__reason" key={`${reason.kind}-${index}`}>
              <p className="attention__chip">{reason.kind.replace(/_/g, " ")}</p>
              <Attributed kind="model">
                <p className="attention__question">{reason.question}</p>
              </Attributed>
              {reason.citations.map((citation) => (
                <Quoted key={`${citation.start}-${citation.end}`} citation={citation} tone="refusal" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="calm">
          <p>The pipeline did not refuse. {deliveryLabel(run.slackDelivery)}</p>
        </div>
      )}

      <h3 className="subsection" id="findings">What the text says about each category</h3>
      <CategoryStrip run={run} />
      {RECIPIENT_CATEGORIES.map((category) => (
        <Finding key={category.id} run={run} category={category} />
      ))}

      <h3 className="subsection" id="questions">What to ask the organizer</h3>
      {run.missingEvidence.questions.length === 0 ? (
        <p>Nothing was left unresolved for want of a fact the organizer could supply.</p>
      ) : (
        <ol className="questions">
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
