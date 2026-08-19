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
 * anything.
 */
export type Provenance = "model" | "corpus" | "campaign";

const BADGES: Record<Provenance, { label: string; background: string }> = {
  model: { label: "MODEL PROSE", background: "#f3e8c8" },
  corpus: { label: "CORPUS TEXT", background: "#dbe7d8" },
  campaign: { label: "CAMPAIGN QUOTE", background: "#dde3ee" },
};

export function Badge({ kind }: { kind: Provenance }) {
  const badge = BADGES[kind];

  return (
    <span
      style={{
        background: badge.background,
        border: "1px solid #999",
        borderRadius: "2px",
        fontSize: "0.7rem",
        letterSpacing: "0.04em",
        padding: "0.05rem 0.3rem",
        whiteSpace: "nowrap",
      }}
    >
      {badge.label}
    </span>
  );
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
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", margin: "0.35rem 0" }}>
      <Badge kind={kind} />
      <div>{children}</div>
    </div>
  );
}

export function ProvenanceLegend() {
  return (
    <ul style={{ listStyle: "none", padding: 0, fontSize: "0.9rem" }}>
      <li style={{ margin: "0.25rem 0" }}>
        <Badge kind="model" /> written by the model in its own words. Not a quotation of any
        source, and not to be read as one.
      </li>
      <li style={{ margin: "0.25rem 0" }}>
        <Badge kind="corpus" /> recorded reference data, human-authored and versioned, shown
        word for word under the id it is stored by.
      </li>
      <li style={{ margin: "0.25rem 0" }}>
        <Badge kind="campaign" /> a verbatim span of the organizer&apos;s own story, with the
        offsets it occupies.
      </li>
    </ul>
  );
}
