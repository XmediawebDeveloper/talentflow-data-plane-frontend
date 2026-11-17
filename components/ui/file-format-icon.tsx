/**
 * Folded-corner document glyph for a file format — a real file shape (not a
 * generic Lucide icon) so PDF/DOCX/DOC read at a glance the way OS file
 * pickers render them, in their conventional colors (PDF red, Word blue).
 *
 * Moved here unchanged from the upload modal's accepted-formats chips so the
 * JD download picker can show the same format icons. `className` sets the size
 * only; it defaults to the chips' 14px.
 */
export default function FileFormatIcon({
  color,
  accent,
  label,
  className = 'h-3.5 w-3.5',
}: {
  color: string;
  accent: string;
  label: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} aria-hidden="true">
      <path d="M5 2h9l5 5v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill={color} />
      <path d="M14 2v4a1 1 0 0 0 1 1h4" fill={accent} />
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        fill="var(--raw-ffffff)"
      >
        {label}
      </text>
    </svg>
  );
}
