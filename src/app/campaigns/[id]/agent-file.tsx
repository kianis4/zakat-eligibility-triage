import type { TriageRunRow } from "../../../db/schema";
import { CROSS_CUTTING_RESTRICTIONS, RECIPIENT_CATEGORIES } from "../../../lib/categories";
import { audienceOf, type EscalationReason } from "../../../lib/escalation";
import type { Citation, ScholarlyDifferenceReference } from "../../../lib/mapping";
import { Attributed } from "./provenance";

/**
 * The agent's file, rendered as evidence rather than as an answer.
 *
 * Nothing on this page is an outcome, and the wording is chosen so that nothing reads like
 * one. A category is supported by the text or it is not; the campaign is neither, and the
 * donor reading the file is the one who decides whether to give.
 *
 * The layout carries the same argument the wording does. The questions come before the
 * findings because they are what the donor acts on, sorted by who can answer them, and the
 * summary strip exists so a reader can see all eight categories before reading any of them.
 */

/** The restrictions that run between a particular donor and recipient, which only the donor can check. */
const DONOR_RESTRICTIONS = CROSS_CUTTING_RESTRICTIONS.filter(
  (restriction) => restriction.whereItBinds === "donor",
);

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

/**
 * One refusal and the spans of story that raised it, filed under whoever can answer it.
 */
function Reason({ reason }: { reason: EscalationReason }) {
  return (
    <div className="attention__reason">
      <p className="attention__chip">{reason.kind.replace(/_/g, " ")}</p>
      <Attributed kind="model">
        <p className="attention__question">{reason.question}</p>
      </Attributed>
      {reason.citations.map((citation) => (
        <Quoted key={`${citation.start}-${citation.end}`} citation={citation} tone="refusal" />
      ))}
    </div>
  );
}

export function AgentFile({ run }: { run: TriageRunRow }) {
  const reasons = run.escalation.escalate ? run.escalation.reasons : [];
  const forOrganizer = reasons.filter((reason) => audienceOf(reason.kind) === "organizer");
  const forScholar = reasons.filter((reason) => audienceOf(reason.kind) === "scholar");

  return (
    <section>
      <p className="meta">
        {`Read by ${run.model} on ${run.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC, against policy ${run.policyVersion}. `}
        This file decides nothing.
      </p>

      <h3 className="subsection" id="refusal">Refusal</h3>
      {run.escalation.escalate ? (
        <div className="attention">
          <p>
            The pipeline refused to triage this campaign. The questions below are why, sorted by
            who can answer them.
          </p>
        </div>
      ) : (
        <div className="calm">
          <p>The pipeline did not refuse.</p>
        </div>
      )}

      <h3 className="subsection" id="ask-organizer">Questions to ask the organizer</h3>
      {forOrganizer.length === 0 && run.missingEvidence.questions.length === 0 ? (
        <p>Nothing was left unresolved for want of a fact the organizer could supply.</p>
      ) : (
        <>
          {forOrganizer.length === 0 ? null : (
            <div className="attention">
              {forOrganizer.map((reason, index) => (
                <Reason key={`${reason.kind}-${index}`} reason={reason} />
              ))}
            </div>
          )}
          {run.missingEvidence.questions.length === 0 ? null : (
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
        </>
      )}

      <h3 className="subsection" id="ask-scholar">Questions to take to a scholar you trust</h3>
      {forScholar.length === 0 ? (
        <p>The text put this campaign inside no recorded disagreement between scholars.</p>
      ) : (
        <div className="attention">
          {forScholar.map((reason, index) => (
            <Reason key={`${reason.kind}-${index}`} reason={reason} />
          ))}
        </div>
      )}

      <h3 className="subsection" id="only-you">What only you can check</h3>
      {DONOR_RESTRICTIONS.map((restriction) => (
        <Attributed kind="corpus" key={restriction.id}>
          <p style={{ margin: 0 }}>{restriction.summary}</p>
        </Attributed>
      ))}

      <h3 className="subsection" id="findings">What the text says about each category</h3>
      <CategoryStrip run={run} />
      {RECIPIENT_CATEGORIES.map((category) => (
        <Finding key={category.id} run={run} category={category} />
      ))}
    </section>
  );
}
