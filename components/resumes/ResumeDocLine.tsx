/**
 * One line of a resume's extracted text, as the resume preview popups render it
 * (CandidateScoringDetailPage's version preview, ResumeTextPreviewModal). Styles:
 * `.tf-resume-*` in app/globals.css.
 *
 * - Bullet lines ("• …", "- …", "* …") drop their typed marker for a drawn one with
 *   a hanging indent, so wrapped text lines up under the first word.
 * - Lines of "|"-separated parts (contact details, a headline) render each part as
 *   its own item that wraps whole, instead of "|" characters dangling at line ends.
 */
const BULLET = /^[•\-*]\s?/;

function parts(text: string): string[] {
  return text.split('|').map((p) => p.trim()).filter(Boolean);
}

/** The line under the candidate's name. */
export function ResumeHeadline({ text }: { text: string }) {
  const items = parts(text);
  return (
    <p className="tf-resume-headline">
      {items.length > 1 ? items.map((p, i) => <span key={i} className="tf-resume-part">{p}</span>) : text}
    </p>
  );
}

/** Any other body line. */
export function ResumeLine({ text }: { text: string }) {
  if (BULLET.test(text)) {
    return <p className="tf-resume-line tf-resume-bullet">{text.replace(BULLET, '')}</p>;
  }
  const items = parts(text);
  if (items.length > 1) {
    return (
      <p className="tf-resume-line tf-resume-parts">
        {items.map((p, i) => <span key={i} className="tf-resume-part">{p}</span>)}
      </p>
    );
  }
  return <p className="tf-resume-line">{text}</p>;
}
