/**
 * The eight-pointed star, used as the product mark and as a section glyph.
 *
 * Eight points for the eight categories of recipient in Qur'an 9:60, which is why it is here
 * at all: it counts the thing the whole file is organised around. Drawn as the compound of two
 * squares, so the geometry is the traditional one rather than an approximation of it.
 *
 * Always decorative to a screen reader. Every place it appears, the words beside it already say
 * what it marks.
 */
const OCTAGRAM =
  "12 1 15.22 4.22 19.78 4.22 19.78 8.78 23 12 19.78 15.22 19.78 19.78 15.22 19.78 " +
  "12 23 8.78 19.78 4.22 19.78 4.22 15.22 1 12 4.22 8.78 4.22 4.22 8.78 4.22";

export function Khatam({
  size = 16,
  outline = false,
  className,
}: {
  size?: number;
  outline?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <polygon
        fill={outline ? "none" : "currentColor"}
        points={OCTAGRAM}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={outline ? 1 : 0}
      />
    </svg>
  );
}
