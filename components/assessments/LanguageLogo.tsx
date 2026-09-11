/**
 * ONE programming language's mark, from `public/logos/languages`.
 *
 * A module of its own because two places show it: the coding round's language
 * picker (`CodingRoundLanguageModal`) and the Coding round card's selected
 * chips on Configure Assessment. The map lives here so a language can never
 * carry one mark in the dialog and another on the card behind it.
 */

/** Logo file per language, named after the FILE and not the label, as
 *  `public/logos/languages/README.md` requires (`cplusplus.svg` for C++,
 *  `csharp.svg` for C#). A language with no file falls back to a lettered
 *  tile, so adding one to COMPILABLE_LANGUAGES before its mark arrives
 *  degrades to a plain tile instead of a broken image. */
export const LANGUAGE_LOGOS: Record<string, string> = {
  Python: 'python',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  Java: 'java',
  C: 'c',
  'C++': 'cplusplus',
  'C#': 'csharp',
  Go: 'go',
  Rust: 'rust',
  Ruby: 'ruby',
  PHP: 'php',
  Kotlin: 'kotlin',
  Swift: 'swift',
};

/** `md` is the picker's card and chip size; `sm` is the size that sits inside
 *  a text-xs pill without stretching it out of shape. Two named steps rather
 *  than a free className, so every mark in the app is one of two sizes. */
const SIZES = {
  sm: { box: 'w-4 h-4', tile: 'rounded text-[8px]', letters: 1 },
  md: { box: 'w-7 h-7', tile: 'rounded-lg text-[11px]', letters: 2 },
} as const;

export default function LanguageLogo({
  language,
  size = 'md',
}: {
  language: string;
  size?: keyof typeof SIZES;
}) {
  const { box, tile, letters } = SIZES[size];
  const file = LANGUAGE_LOGOS[language];

  if (!file) {
    return (
      <span
        aria-hidden="true"
        className={`${box} ${tile} flex-shrink-0 bg-slate-100 text-gray-500 font-semibold flex items-center justify-center`}
      >
        {language.slice(0, letters)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/logos/languages/${file}.svg`}
      alt=""
      aria-hidden="true"
      className={`${box} flex-shrink-0 object-contain`}
    />
  );
}
