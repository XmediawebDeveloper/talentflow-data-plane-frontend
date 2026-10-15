/**
 * A skill's or tool's own mark — React, Spring, Docker, AWS, LinkedIn… — for
 * the Resume View page's skill badges and social links.
 *
 * Programming languages use the coding-round picker's files
 * (`public/logos/languages`, see LanguageLogo); everything else is
 * `public/logos/skills` (devicon, MIT — see its README). Local files, not a
 * CDN, for the same reason as those. A skill with no mark shows none: the
 * badge stays plain text rather than gaining a lettered tile.
 */

const LANGUAGE = (file: string) => `/logos/languages/${file}.svg`;
const SKILL = (file: string) => `/logos/skills/${file}.svg`;

/** Each mark and the skill names that mean it, written as `normalize` leaves
 *  them (lower case; letters, digits, `+` and `#` only). */
const MARKS: [string, string[]][] = [
  [LANGUAGE('python'), ['python', 'python3']],
  [LANGUAGE('javascript'), ['javascript', 'js', 'es6']],
  [LANGUAGE('typescript'), ['typescript', 'ts']],
  [LANGUAGE('java'), ['java', 'corejava', 'java8', 'java11', 'java17', 'java21']],
  [LANGUAGE('c'), ['c', 'clanguage', 'cprogramming']],
  [LANGUAGE('cplusplus'), ['c++', 'cpp', 'cplusplus']],
  [LANGUAGE('csharp'), ['c#', 'csharp']],
  [LANGUAGE('go'), ['go', 'golang']],
  [LANGUAGE('rust'), ['rust']],
  [LANGUAGE('ruby'), ['ruby']],
  [LANGUAGE('php'), ['php']],
  [LANGUAGE('kotlin'), ['kotlin']],
  [LANGUAGE('swift'), ['swift']],
  [SKILL('react'), ['react', 'reactjs', 'reactnative']],
  [SKILL('angular'), ['angular', 'angularjs']],
  [SKILL('vuejs'), ['vue', 'vuejs']],
  [SKILL('nodejs'), ['node', 'nodejs']],
  [SKILL('express'), ['express', 'expressjs']],
  [SKILL('nextjs'), ['next', 'nextjs']],
  [SKILL('html5'), ['html', 'html5']],
  [SKILL('css3'), ['css', 'css3']],
  [SKILL('sass'), ['sass', 'scss']],
  [SKILL('tailwindcss'), ['tailwind', 'tailwindcss']],
  [SKILL('bootstrap'), ['bootstrap']],
  [SKILL('jquery'), ['jquery']],
  [SKILL('redux'), ['redux']],
  [SKILL('webpack'), ['webpack']],
  [SKILL('spring'), ['spring', 'springboot', 'springframework', 'springmvc']],
  [SKILL('django'), ['django']],
  [SKILL('flask'), ['flask']],
  [SKILL('fastapi'), ['fastapi']],
  [SKILL('dotnetcore'), ['net', 'dotnet', 'netcore', 'dotnetcore', 'aspnet', 'aspnetcore']],
  [SKILL('laravel'), ['laravel']],
  [SKILL('hibernate'), ['hibernate']],
  [SKILL('docker'), ['docker']],
  [SKILL('kubernetes'), ['kubernetes', 'k8s']],
  [SKILL('amazonwebservices'), ['aws', 'amazonwebservices']],
  [SKILL('azure'), ['azure', 'microsoftazure']],
  [SKILL('googlecloud'), ['gcp', 'googlecloud', 'googlecloudplatform']],
  [SKILL('git'), ['git']],
  [SKILL('github'), ['github']],
  [SKILL('gitlab'), ['gitlab']],
  [SKILL('jenkins'), ['jenkins']],
  [SKILL('linux'), ['linux']],
  [SKILL('ubuntu'), ['ubuntu']],
  [SKILL('bash'), ['bash', 'shell', 'shellscripting']],
  [SKILL('nginx'), ['nginx']],
  [SKILL('mysql'), ['mysql']],
  [SKILL('postgresql'), ['postgresql', 'postgres']],
  [SKILL('mongodb'), ['mongodb', 'mongo']],
  [SKILL('redis'), ['redis']],
  [SKILL('oracle'), ['oracle', 'oracledb', 'oracledatabase']],
  [SKILL('microsoftsqlserver'), ['sqlserver', 'mssql', 'mssqlserver', 'microsoftsqlserver']],
  [SKILL('firebase'), ['firebase']],
  [SKILL('graphql'), ['graphql']],
  [SKILL('jira'), ['jira']],
  [SKILL('figma'), ['figma']],
  [SKILL('apachekafka'), ['kafka', 'apachekafka']],
  [SKILL('terraform'), ['terraform']],
  [SKILL('android'), ['android']],
  [SKILL('flutter'), ['flutter']],
  [SKILL('dart'), ['dart']],
  [SKILL('scala'), ['scala']],
  [SKILL('r'), ['r']],
  [SKILL('maven'), ['maven']],
  [SKILL('gradle'), ['gradle']],
  [SKILL('selenium'), ['selenium']],
  [SKILL('pandas'), ['pandas']],
  [SKILL('numpy'), ['numpy']],
  [SKILL('tensorflow'), ['tensorflow']],
  [SKILL('pytorch'), ['pytorch']],
  [SKILL('swagger'), ['swagger']],
  [SKILL('postman'), ['postman']],
  [SKILL('elasticsearch'), ['elasticsearch']],
  [SKILL('linkedin'), ['linkedin']],
];

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9+#]/g, '');

const BY_NAME: Record<string, string> = Object.fromEntries(
  MARKS.flatMap(([src, names]) => names.map((n) => [n, src] as const)),
);

/** The mark's path for a skill name, or null when it has none. Whole-name
 *  matches only, so "JavaScript" is never read as "Java". */
export const skillLogoSrc = (name: string): string | null => BY_NAME[normalize(name)] ?? null;

export default function SkillLogo({ name, className = 'w-3.5 h-3.5' }: { name: string; className?: string }) {
  const src = skillLogoSrc(name);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" aria-hidden="true" className={`${className} flex-shrink-0 object-contain`} />
  );
}
