import type { ReactNode } from "react";

/**
 * Who wrote the words the reviewer is reading.
 *
 * The file on this page mixes three kinds of text, and they carry different authority.
 * ADR-0007 turns on a residual its schema guard cannot close: a model can state what a source
 * says in its own words, with no quotation mark and no verse number to match on, and that
 * sentence reads to a person exactly like a quotation. The answer there is that model prose is
 * always rendered as model prose. This is where that happens.
 *
 * Three labels, applied to the containing block rather than to a phrase, because a reader
 * scanning a findings table needs to know which kind of text they are in without inspecting
 * anything. The chip colours follow the same semantics as the status pills, and the label text
 * is on every chip, so the distinction never rests on colour.
 */
export type Provenance = "model" | "corpus" | "campaign";

const BADGES: Record<Provenance, { label: string; tone: string }> = {
  model: { label: "MODEL PROSE", tone: "chip--model" },
  corpus: { label: "CORPUS TEXT", tone: "chip--corpus" },
  campaign: { label: "CAMPAIGN QUOTE", tone: "chip--campaign" },
};

export function Badge({ kind }: { kind: Provenance }) {
  const badge = BADGES[kind];

  return <span className={`chip ${badge.tone}`}>{badge.label}</span>;
}

/**
 * A block of text with its authorship stated beside it.
 *
 * Composite text takes the `model` label. The escalation questions are assembled from a
 * corpus entry and a sentence the model wrote, and labelling the whole thing as model prose
 * is the direction that cannot mislead: it never lends a model's sentence the authority of
 * the recorded source, and the corpus text it also contains loses nothing by being read
 * carefully.
 */
export function Attributed({ kind, children }: { kind: Provenance; children: ReactNode }) {
  return (
    <div className="attributed">
      <Badge kind={kind} />
      <div>{children}</div>
    </div>
  );
}

export function ProvenanceLegend() {
  return (
    <ul className="legend">
      <li>
        <Badge kind="model" />
        <span>
          written by the model in its own words. Not a quotation of any source, and not to be
          read as one.
        </span>
      </li>
      <li>
        <Badge kind="corpus" />
        <span>
          recorded reference data, human-authored and versioned, shown word for word under the
          id it is stored by.
        </span>
      </li>
      <li>
        <Badge kind="campaign" />
        <span>
          a verbatim span of the organizer&apos;s own story, with the offsets it occupies.
        </span>
      </li>
    </ul>
  );
}
