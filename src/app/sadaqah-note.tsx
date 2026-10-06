/**
 * The scope of everything the check says, stated where the donor reads it.
 *
 * The eight categories restrict zakat and nothing else. A campaign the text supports no
 * category for may still be a good home for voluntary charity, and a donor should not leave
 * the page thinking otherwise. The sources are under "Cross-cutting recipient restrictions" in
 * section 2 of docs/RESEARCH.md.
 */
export function SadaqahNote() {
  return (
    <div className="card card--tint measure">
      <p style={{ margin: 0 }}>
        The eight categories restrict zakat only. Sadaqah, voluntary charity, is not limited to
        them, so a campaign this check finds little support for may still be a fine place for your
        sadaqah.
      </p>
    </div>
  );
}
