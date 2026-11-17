const NON_LATIN_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0900-\u097F\u0400-\u04FF\u0E00-\u0E7F\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F]/u;
const LATIN_ACCENT_PATTERN = /[À-ÖØ-öø-ÿĀ-ž]/u;
const LATIN_TOKEN_PATTERN = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]+/gu;
const NON_ENGLISH_LATIN_TOKENS = new Set([
  'experiencia', 'responsabilidades', 'requisitos', 'conocimientos',
  'desarrollador', 'desarrollo', 'ingeniero', 'habilidades', 'trabajo',
  'salario', 'ofrecemos', 'modalidad', 'presencial', 'hibrida', 'remoto',
  'carrera', 'crecimiento', 'equipo', 'aplicaciones', 'nube', 'segun',
  'anos', 'desenvolvedor', 'desenvolvimento', 'conhecimentos', 'trabalho',
  'hibrido', 'equipe', 'developpeur', 'developpement', 'responsabilites',
  'competences', 'salaire', 'travail', 'poste', 'entwickler', 'entwicklung',
  'kenntnisse', 'aufgaben', 'anforderungen', 'gehalt', 'arbeit',
  'erfahrung', 'sviluppatore', 'sviluppo', 'responsabilita', 'stipendio',
  'lavoro', 'competenze', 'esperienza',
]);

const normalizeLatinToken = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const isEnglishOnlyText = (value: string | null | undefined): boolean => {
  const text = String(value || '').trim();
  if (!text) {
    return true;
  }

  if (NON_LATIN_PATTERN.test(text)) {
    return false;
  }

  if (LATIN_ACCENT_PATTERN.test(text)) {
    return false;
  }

  const tokens = Array.from(
    text.matchAll(LATIN_TOKEN_PATTERN),
    (match) => normalizeLatinToken(match[0])
  );

  if (tokens.length === 0) {
    return true;
  }

  const nonEnglishMatches = tokens.filter((token) => NON_ENGLISH_LATIN_TOKENS.has(token)).length;
  if (tokens.length <= 3) {
    return nonEnglishMatches === 0;
  }

  return nonEnglishMatches < 2 && (nonEnglishMatches / tokens.length) < 0.2;
};
