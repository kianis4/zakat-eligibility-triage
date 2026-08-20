/**
 * The case file's contents, listed down the side of it.
 *
 * A reviewer working a queue arrives wanting two facts before anything else: did the pipeline
 * refuse, and has anyone decided this yet. Both are dots here, at the top of the page and still
 * there at the bottom of it, so neither answer costs a scroll.
 *
 * Every label is the heading of the section it points at, verbatim. A rail that paraphrased its
 * own page would be one more thing to keep true.
 */
type RailItem = {
  readonly href: string;
  readonly label: string;
  readonly dot?: "yes" | "unknown";
};

export function CaseRail({
  hasRun,
  refused,
  decided,
}: {
  hasRun: boolean;
  refused: boolean;
  decided: boolean;
}) {
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
  items.push({ href: "#decision", label: "Decision" });
  items.push({
    href: "#audit-trail",
    label: "Audit trail",
    ...(decided ? { dot: "yes" as const } : {}),
  });

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
