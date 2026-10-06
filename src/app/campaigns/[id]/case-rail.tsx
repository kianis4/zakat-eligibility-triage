/**
 * The case file's contents, listed down the side of it.
 *
 * A reader arrives wanting one fact before anything else: did the pipeline refuse. It is a dot
 * here, at the top of the page and still there at the bottom of it, so the answer costs no
 * scroll.
 *
 * Every label is the heading of the section it points at, verbatim. A rail that paraphrased its
 * own page would be one more thing to keep true.
 */
type RailItem = {
  readonly href: string;
  readonly label: string;
  readonly dot?: "unknown";
};

export function CaseRail({ hasRun, refused }: { hasRun: boolean; refused: boolean }) {
  const items: RailItem[] = [
    { href: "#story", label: "Campaign story" },
    { href: "#agent-file", label: "The agent's file" },
  ];

  if (hasRun) {
    items.push({ href: "#refusal", label: "Refusal", ...(refused ? { dot: "unknown" } : {}) });
    items.push({ href: "#findings", label: "What the text says about each category" });
    items.push({ href: "#questions", label: "What to ask the organizer" });
  }

  items.push({ href: "#precedent", label: "Precedent" });

  return (
    <nav aria-label="Sections" className="rail">
      <ol>
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href}>
              <span className={item.dot === undefined ? "rail__spacer" : `dot dot--${item.dot}`} />
              <span className="rail__label">{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
