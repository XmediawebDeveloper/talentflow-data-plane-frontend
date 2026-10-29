'use client';

import { Wand2, FileText, Copy, Download, Save, ChevronRight, ChevronDown, Plus, X, Edit2, CheckCircle, CheckCircle2, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Info, Eye, Pencil, Lightbulb, Briefcase, MapPin, NotebookPen, ClipboardCheck, Clock, Building2, Wallet, Circle, ArrowLeftRight, Users, Lock, AlertTriangle, AlertCircle, Cloud, CloudOff, Loader2, Sparkles } from 'lucide-react';
import LeaveJDDialog from '@/components/jobs/LeaveJDDialog';
import SuccessAnimation from '@/components/ui/success-animation';
import ReactMarkdown, { type Components } from 'react-markdown';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import PublishedSummaryCard, { PublishedActions } from '@/components/ui/published-summary-card';
import FileFormatIcon from '@/components/ui/file-format-icon';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useDrag, useDrop } from 'react-dnd';
import { STEP2_CARD_CLASS, STEP2_SECTION_TONES, Step2SectionHeader } from '@/components/jobs/Step2Section';
import {
  ExtractedSummaryCard, SummarySectionHeading, SummaryItemList, SummaryYesNo,
  SUMMARY_FIELD_LABEL, SUMMARY_FIELD_VALUE, SUMMARY_EMPTY_VALUE, SUMMARY_TILE,
} from '@/components/jobs/ExtractedDataSummary';
import { Job } from '@/lib/types/types';
import { toast } from '@/components/ui/enhanced-toast';
import { jdService, masterDataService, ExperienceLevel, EducationLevel, IndustryType } from '@/lib/services';
import type { IndustryValidationResponse } from '@/lib/services/jdService';
import type { JDCreate, JDMergeTrailEntry, JDResponse } from '@/lib/services/jdService';
import { useQuotaCheck } from '@/lib/hooks/useQuotaCheck';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { normalizeManualJDToMarkdown, stripEmptyCertificationSections } from '@/lib/utils/jdMarkdown';
import { convertSalaryAmount, formatSalaryRange, getSalaryCurrencySymbol, normalizeSalaryCurrency, parseSalaryInput } from '@/lib/utils/salary';
import { setConfiguredExperienceLevels } from '@/lib/utils/jobExperience';
import { getExchangeRate } from '@/lib/services/exchangeRateService';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import FilterSelect from '@/components/ui/filter-select';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import { PageSkeleton } from '@/components/ui/skeleton';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { isForcedNavigation } from '@/lib/utils/forcedNavigation';
import { clearFreshDraftVersion, isFreshDraftVersion } from '@/lib/utils/jdDraftVersion';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { formatJobSubject } from '@/lib/utils/jobOpeningDisplay';

type CreationMode = 'ai' | 'manual';
type Step = 'create' | 'extract' | 'review';

interface USStateOption {
  name: string;
  isoCode: string;
}

// Validation constants
const VALIDATION = {
  JOB_TITLE: { min: 2, max: 100 },
  AI_PROMPT: { min: 30, max: 1500 },
  MANUAL_JD: { min: 1000, max: 10000 },
  ASSESSMENT_GUIDANCE: { min: 10, max: 100 },
};

// Validation helper functions
const getCharCountColor = (current: number, min: number, max: number): string => {
  if (current < min) return 'text-orange-500';
  if (current > max) return 'text-destructive';
  return 'text-success';
};

const isValidLength = (value: string, min: number, max: number): boolean => {
  const len = value.trim().length;
  return len >= min && len <= max;
};

const containsMeaningfulText = (text: string): boolean => {
  if (!text || !text.trim()) return false;
  // Remove all special characters, keeping only letters, numbers, and spaces
  const cleanedText = text.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  // Split into words that are at least 2 characters long
  const meaningfulWords = cleanedText.split(/\s+/).filter(word => word.length >= 2);
  // Require at least 3 meaningful words for a valid JD
  return meaningfulWords.length >= 3;
};

const jdMarkdownComponents: Components = {
  table: (props) => (
    <div className="table-responsive my-4 tf-table-shell">
      <table {...props} />
    </div>
  ),
};

const getDisplayJDMarkdown = (text: string, mode: CreationMode): string => {
  const normalized = mode === 'manual' ? normalizeManualJDToMarkdown(text) : text;
  return stripEmptyCertificationSections(normalized);
};

// Detects SOURCE CODE pasted into a JD field.
//
// Deliberately narrow. Every pattern here must be something that CANNOT occur in
// ordinary job-description prose in ANY industry. TalentFlow serves all industries,
// and this guard sits on the very first screen (AI prompt + manual JD paste) where a
// false positive hard-blocks the recruiter with no workaround - so it errs toward
// letting text through. A stray line of code that slips past is cosmetic; a wrongly
// rejected job description is a dead end.
//
// The previous version leaned on broad heuristics plus an IT-term whitelist to
// compensate for them, and false-blocked real non-IT job descriptions:
//
//   "tolerance <= 0.05 mm and temperature >= 200 C"       (manufacturing) - [=!<>]{2,3}
//   "Ensure delivery TAT <= 24 hrs"                       (logistics)     - [=!<>]{2,3}
//   "food cost <= 30%"                                    (hospitality)   - [=!<>]{2,3}
//   "Maintain pH >= 7.0; operate autoclave (121 C)"       (lab)           - [=!<>]{2,3}
//   "Prepare P.L (profit and loss) statements"            (finance)       - \w+\.\w+\s*\(
//   "Shifts: (6:00-14:00); (14:00-22:00); rotational"     (shift work)    - specialCharRatio
//   "property listings, to let and lease agreements"      (real estate)   - \blet\b
//   "product return and exchange; process refunds"        (retail)        - \breturn\s+[^;]+;
//   "Key function includes (but is not limited to) ..."   (any JD)        - \bfunction\s+\w+\s*\(
//
// Two more (`^\s*package\s+\w+` vs "Package handling", `^\s*import ...$` vs an
// "Import Documentation" heading) only escaped because those regexes happen to lack
// the `i` flag - too fragile to rely on, so both are tightened below to require the
// dotted-path + semicolon syntax that makes them unambiguous.
//
// The whitelist is gone too. It was not merely redundant: it replaced bare substrings
// ('go', 'net', 'c ', 'asp', 'api') case-insensitively, so "Manage cargo goods across
// the network" became "Manage ar   ods across the  work" - mangling ordinary words and
// shortening the text, which nudged up the very special-character ratio it was meant to
// protect against. With the ambiguous patterns removed there is nothing left for it to
// protect: no remaining pattern can fire on a technology name.
const containsCodePatterns = (text: string): boolean => {
  if (!text || !text.trim()) return false;

  const lowerText = text.toLowerCase();

  // Literal tokens that only ever appear in source code.
  const codeKeywords = [
    'console.log', 'printf(', 'println(', 'cout <<', 'system.out.print',
    '<?php', '#!/bin', '__init__', 'public static void', 'std::',
    '});', '};',
  ];
  if (codeKeywords.some(keyword => lowerText.includes(keyword))) return true;

  // Structural patterns. Each requires enough surrounding syntax to be unambiguous -
  // a bare keyword is never enough, because "function", "return", "import", "package"
  // and "class" are all ordinary job-description words.
  const codePatterns = [
    /\bdef\s+\w+\s*\(/,                          // Python:  def foo(
    /\bfunction\s+\w+\s*\([^)]*\)\s*\{/,         // JS:      function foo(a) {
    /\(\s*\w*\s*\)\s*=>/,                        // JS:      (a) =>
    /\w+\s*\(\s*\w*\s*\)\s*\{/,                  //          foo() {
    /\bclass\s+\w+\s*\{/,                        //          class Foo {
    /^\s*from\s+[\w.]+\s+import\s+/m,            // Python:  from x import y
    /^\s*import\s+.+\s+from\s+['"][^'"]+['"]/m,  // ES:      import x from 'y'
    /^\s*import\s+\w+(?:\.[\w*]+)+\s*;/m,        // Java:    import a.b.C;
    /^\s*package\s+\w+(?:\.\w+)+\s*;/m,          // Java:    package a.b.c;
    /^\s*#include\s*[<"]/m,                      // C/C++:   #include <x>
    /\$[a-zA-Z_]\w*\s*=[^=]/,                    // PHP:     $var =
  ];

  return codePatterns.some(pattern => pattern.test(text));
};

const nonLatinPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0900-\u097F\u0400-\u04FF\u0E00-\u0E7F\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F]/u;
const latinAccentPattern = /[À-ÖØ-öø-ÿĀ-ž]/u;
const latinTokenPattern = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]+/gu;
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

const TITLE_ROLE_HEADWORDS = new Set([
  'engineer', 'developer', 'analyst', 'manager', 'architect', 'consultant',
  'designer', 'administrator', 'specialist', 'scientist', 'technician',
  'coordinator', 'director', 'officer', 'executive', 'recruiter', 'tester',
  'strategist', 'writer', 'editor', 'accountant', 'auditor', 'lawyer',
  'attorney', 'nurse', 'doctor', 'physician', 'surgeon', 'pharmacist',
  'therapist', 'iconologist', 'teacher', 'professor', 'lecturer', 'tutor',
  'trainer', 'instructor', 'owner', 'master', 'representative', 'supervisor',
  'advisor', 'adviser', 'operator', 'planner', 'agent', 'associate',
  'assistant', 'controller', 'producer', 'marketer', 'salesperson',
  'president', 'ceo', 'cto', 'cfo', 'coo', 'cio', 'cmo',
]);

const TITLE_ROLE_GENERIC_MODIFIERS = new Set([
  'senior', 'junior', 'lead', 'principal', 'staff', 'expert', 'chief',
  'associate', 'assistant', 'intern', 'trainee',
  'entry', 'entry-level', 'entrylevel', 'fresher',
  'mid', 'mid-level', 'midlevel', 'intermediate',
]);

const PLACEHOLDER_TOKENS = new Set([
  'asdf', 'asdfg', 'asdfgh', 'asdfghj', 'qwerty', 'qwertyuiop', 'zxcv',
  'zxcvb', 'zxcvbn', 'lorem', 'ipsum', 'foobar', 'placeholder',
]);

const PROMPT_DETAIL_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at',
  'with', 'role', 'job', 'position', 'details', 'description', 'candidate',
  'need', 'needs', 'required', 'requirement', 'requirements', 'must', 'have',
  'years', 'year', 'yrs', 'experience', 'exp',
]);

const EXCLUSIVE_SENIORITY_BUCKETS = {
  junior: new Set(['junior', 'entry', 'entry-level', 'entrylevel', 'fresher', 'trainee', 'intern']),
  mid: new Set(['mid', 'mid-level', 'midlevel', 'intermediate']),
  senior: new Set(['senior']),
} as const;

const REPEATED_TEXT_MIN_UNIT_CHARS = 12;

const TITLE_WORK_MODE_PATTERN = /\b(?:remote|hybrid|on[\s-]?site|work\s+from\s+home|wfh|field[\s-]?based)\b/i;
const TITLE_JOB_TYPE_PATTERN = /\b(?:full[\s-]?time|part[\s-]?time|internship|temporary|permanent|contractual)\b/i;
const TITLE_VACANCY_PATTERN = /\b(?:hiring\s+\d+|(?:no\.?\s+of\s+)?vacanc(?:y|ies)\s*:?\s*\d+|(?:no\.?\s+of\s+)?openings?\s*:?\s*\d+|\d+\s+positions?\s+available)\b/i;
const TITLE_SALARY_PATTERN = /(?:₹|\$|USD\b|INR\b|Rs\.?)\s*\d|(?:\d[\d,.\s]*\s*(?:lpa|lakhs?|lakh|per\s*annum|per\s*month|per\s*year|ctc|package|k\b|m\b))|(?:(?:salary|sal|compensation|ctc|package|pay|remuneration)\s*(?:is|of|from|:|\s)\s*(?:₹|\$|USD\b|INR\b|Rs\.?)?\s*\d)/i;

/** Extraction's job_type vocabulary is wider than this form's Employment Type list: the
 *  backend also returns `permanent`, which no <option> here carries. An unmatched value
 *  leaves the select rendering BLANK, so the recruiter sees an empty required-looking
 *  field on a JD that plainly said what it was - and "permanent" is how a large share of
 *  JDs outside software describe a full-time job. Anything else unrecognised falls back
 *  to the form's own default rather than blanking the control. */
const EMPLOYMENT_TYPE_OPTIONS = ['full_time', 'part_time', 'contract', 'internship', 'temporary'] as const;
const normalizeExtractedEmploymentType = (
  value: unknown,
): ExtractedData['employmentType'] | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const code = value.trim().toLowerCase();
  if (code === 'permanent') return 'full_time';
  return (EMPLOYMENT_TYPE_OPTIONS as readonly string[]).includes(code)
    ? (code as ExtractedData['employmentType'])
    : undefined;
};

/** JD22 - which Additional Details text survives an extraction.
 *
 *  `current`  what is in the box right now
 *  `lastAutoFilled`  what extraction last put there (see extractionFilledAdditionalDetails)
 *  `incoming`  what this extraction produced
 *
 *  Hand-written text always wins; extraction's own leftovers never do. The two are told
 *  apart by comparing against what extraction last wrote, so re-extracting the SAME JD
 *  still cannot overwrite a sentence the recruiter typed, while extracting a DIFFERENT
 *  JD no longer inherits the previous one's shift timings. */
const resolveAdditionalDetails = (
  current: string | undefined,
  lastAutoFilled: string,
  incoming: string | undefined,
): string => {
  const currentText = current ?? '';
  if (!currentText.trim()) return incoming || '';
  // Untouched since extraction wrote it -> it is not the recruiter's, so it can be replaced.
  if (currentText === lastAutoFilled) return incoming || '';
  return currentText;
};

const roleTokenPattern = /[A-Za-z][A-Za-z0-9#+./-]*/g;

const normalizeRoleToken = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9#+./-]/g, '').trim();

const extractRoleTokens = (text: string): string[] =>
  Array.from(text.matchAll(roleTokenPattern), (match) => normalizeRoleToken(match[0])).filter(Boolean);

const detectTitleMetadataMarkers = (value: string): string[] => {
  const markers: string[] = [];
  if (TITLE_WORK_MODE_PATTERN.test(value)) {
    markers.push('work mode');
  }
  if (TITLE_JOB_TYPE_PATTERN.test(value)) {
    markers.push('job type');
  }
  if (TITLE_SALARY_PATTERN.test(value)) {
    markers.push('salary');
  }
  if (TITLE_VACANCY_PATTERN.test(value)) {
    markers.push('vacancy details');
  }
  return markers;
};

const extractSeniorityBuckets = (tokens: string[]): string[] =>
  Object.entries(EXCLUSIVE_SENIORITY_BUCKETS)
    .filter(([, bucketTokens]) => tokens.some((token) => bucketTokens.has(token)))
    .map(([bucket]) => bucket);

const compactRepetitionText = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const hasRepeatedCompactSequence = (value: string, minUnitChars = REPEATED_TEXT_MIN_UNIT_CHARS): boolean => {
  const compact = compactRepetitionText(value);
  if (compact.length < minUnitChars * 2) {
    return false;
  }

  return new RegExp(`(.{${minUnitChars},}?)\\1+`).test(compact);
};

const countNonGenericRoleHeads = (tokens: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  tokens.forEach((token) => {
    if (TITLE_ROLE_GENERIC_MODIFIERS.has(token) || !isRoleHeadToken(token)) {
      return;
    }
    counts.set(token, (counts.get(token) || 0) + 1);
  });
  return counts;
};

const isPlaceholderLikeToken = (token: string): boolean => {
  const normalized = normalizeRoleToken(token);
  if (!normalized) {
    return false;
  }

  return PLACEHOLDER_TOKENS.has(normalized) || (normalized.length >= 4 && new Set(normalized).size === 1);
};

const isRoleHeadToken = (token: string): boolean =>
  TITLE_ROLE_HEADWORDS.has(token) || token.endsWith('ologist');

const getJobTitleValidationError = (value: string): string => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  if (trimmedValue.length < VALIDATION.JOB_TITLE.min) {
    return '';
  }

  if (!isEnglishOnly(trimmedValue)) {
    return JOB_TITLE_ENGLISH_ONLY_MESSAGE;
  }

  if (hasRepeatedCompactSequence(trimmedValue)) {
    return 'Job title contains repeated text. Please enter one clear job title only.';
  }

  const metadataMarkers = detectTitleMetadataMarkers(trimmedValue);
  if (metadataMarkers.length > 0) {
    return `Job title should contain only the role name. Remove ${metadataMarkers.join(', ')} from the title and keep those details in the JD fields instead.`;
  }

  return '';
};

const getAIPromptValidationError = (value: string): string => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  if (trimmedValue.length < VALIDATION.AI_PROMPT.min) {
    return '';
  }

  const tokens = extractRoleTokens(trimmedValue);
  if (tokens.length === 0) {
    return '';
  }

  if (hasRepeatedCompactSequence(trimmedValue)) {
    return 'AI prompt contains repeated text. Please describe the role once and add real details like skills, experience, location, salary, or responsibilities.';
  }

  const seniorityBuckets = extractSeniorityBuckets(tokens);
  const detailTokens = tokens.filter(
    (token) => !PROMPT_DETAIL_STOPWORDS.has(token) && !TITLE_ROLE_GENERIC_MODIFIERS.has(token)
  );
  const distinctDetailCount = new Set(detailTokens).size;

  if (seniorityBuckets.length > 1 && distinctDetailCount < 6) {
    return 'AI prompt contains conflicting seniority levels. Please choose only one level and describe the actual role requirements.';
  }

  const roleHeadCounts = countNonGenericRoleHeads(tokens);
  const dominantRoleHeadCount = Math.max(0, ...Array.from(roleHeadCounts.values()));
  if (dominantRoleHeadCount >= 2 && distinctDetailCount < 6) {
    return 'AI prompt repeats the job role too many times. Please describe the role once and add real details like skills, experience, location, salary, or responsibilities.';
  }

  const placeholderTokens = tokens.filter((token) => isPlaceholderLikeToken(token));
  if (placeholderTokens.length === 0) {
    return '';
  }

  const placeholderFilteredDetailTokens = tokens.filter(
    (token) => !PROMPT_DETAIL_STOPWORDS.has(token) && !isPlaceholderLikeToken(token)
  );
  const distinctPlaceholderDetailCount = new Set(placeholderFilteredDetailTokens).size;
  const tokenCounts = new Map<string, number>();

  tokens.forEach((token) => {
    tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  });

  let mostCommonToken = '';
  let mostCommonCount = 0;
  tokenCounts.forEach((count, token) => {
    if (count > mostCommonCount) {
      mostCommonToken = token;
      mostCommonCount = count;
    }
  });

  if (
    (placeholderTokens.length >= 2 && distinctPlaceholderDetailCount < 4) ||
    (
      isPlaceholderLikeToken(mostCommonToken) &&
      mostCommonCount >= 2 &&
      (mostCommonCount / tokens.length) >= 0.3 &&
      distinctPlaceholderDetailCount < 4
    )
  ) {
    return 'AI prompt contains repetitive placeholder text. Please describe actual skills, experience, salary, location, or responsibilities.';
  }

  return '';
};

const hasNonEnglishLatinMarkers = (text: string): boolean => {
  if (latinAccentPattern.test(text)) {
    return true;
  }

  const tokens = Array.from(text.matchAll(latinTokenPattern), (match) => normalizeLatinToken(match[0]));
  if (tokens.length === 0) {
    return false;
  }

  const nonEnglishMatches = tokens.filter((token) => NON_ENGLISH_LATIN_TOKENS.has(token)).length;
  if (tokens.length <= 3) {
    return nonEnglishMatches >= 1;
  }

  return nonEnglishMatches >= 2 || (nonEnglishMatches / tokens.length) >= 0.2;
};

const isEnglishOnly = (text: string): boolean => {
  if (!text || !text.trim()) return true;
  if (nonLatinPattern.test(text)) {
    return false;
  }
  return !hasNonEnglishLatinMarkers(text);
};

// Heads-up only: the backend already swap-corrects an inverted "Minimum Salary: X /
// Maximum Salary: Y" pair before it ever reaches the AI, so this never blocks
// generation - it just tells the recruiter their typed figures look swapped before
// they submit.
const detectInvertedLabelledSalary = (text: string): boolean => {
  const minMatch = text.match(/minimum\s*salary\s*[:\-]?\s*([\d.,]+)/i);
  const maxMatch = text.match(/maximum\s*salary\s*[:\-]?\s*([\d.,]+)/i);
  if (!minMatch || !maxMatch) {
    return false;
  }
  const minVal = parseFloat(minMatch[1].replace(/,/g, ''));
  const maxVal = parseFloat(maxMatch[1].replace(/,/g, ''));
  if (Number.isNaN(minVal) || Number.isNaN(maxVal)) {
    return false;
  }
  return minVal > maxVal;
};

const JOB_TITLE_ENGLISH_ONLY_MESSAGE = 'Job title must be written in English only. Other languages are not supported.';

const showJobTitleValidationToast = (validationError: string): void => {
  toast.error({
    title: validationError === JOB_TITLE_ENGLISH_ONLY_MESSAGE ? 'English Only' : 'Invalid Job Title',
    description: validationError,
  });
};

const fetchJobTitleValidationError = async (value: string): Promise<string> => {
  const response = await jdService.validateTitle(value);
  if (response.is_valid) {
    return '';
  }
  return response.error || 'Please enter a real job title such as "Java Developer" or "HR Executive".';
};

const validateEnglishOnlyExtractedValue = (value: string, fieldLabel: string): boolean => {
  if (isEnglishOnly(value)) {
    return true;
  }

  toast.error({
    title: 'English only',
    description: `${fieldLabel} must be written in English only. Other languages are not supported.`,
  });
  return false;
};

const validateEnglishOnlyExtractedList = (values: string[], fieldLabel: string): boolean => {
  const invalidValue = values.find((value) => value.trim() && !isEnglishOnly(value));
  if (!invalidValue) {
    return true;
  }

  toast.error({
    title: 'English only',
    description: `${fieldLabel} must be written in English only. Other languages are not supported.`,
  });
  return false;
};

const applyEnglishOnlyInputChange = (
  value: string,
  fieldLabel: string,
  onValid: (nextValue: string) => void,
): boolean => {
  if (value && !validateEnglishOnlyExtractedValue(value, fieldLabel)) {
    return false;
  }

  onValid(value);
  return true;
};

const isPromptConflictMessage = (message: string): boolean =>
  /conflicts with the job title|different role|change the job title/i.test(message);

// ---------------------------------------------------------------------------
// Duplicate detection across the four requirement lists
// (Must-Have Skills, Nice-to-Have Skills, Must-Have Comments, Nice-to-Have Comments).
// A given requirement is only allowed to exist ONCE anywhere across all four.
// ---------------------------------------------------------------------------
type DuplicateListKey =
  | 'mustHaveSkills'
  | 'niceToHaveSkills'
  | 'mustHaveComments'
  | 'niceToHaveComments';

const DUPLICATE_LIST_LABELS: Record<DuplicateListKey, string> = {
  mustHaveSkills: 'Must-Have Skills',
  niceToHaveSkills: 'Nice-to-Have Skills',
  mustHaveComments: 'Must-Have Additional Requirements',
  niceToHaveComments: 'Nice-to-Have Additional Requirements',
};

// Small filler-word list so "Strong expertise in Python" and "Python" compare
// as the same near-exact item. True semantic merging is handled server-side.
const DUPLICATE_STOPWORDS = new Set<string>([
  'a', 'an', 'the', 'of', 'in', 'on', 'with', 'and', 'or', 'to', 'for',
  'is', 'are', 'be', 'using', 'use', 'used', 'strong', 'solid', 'good',
  'experience', 'expertise', 'knowledge', 'proficiency', 'proficient',
  'familiarity', 'familiar', 'skills', 'skill', 'ability', 'hands',
]);

const normalizeForDuplicate = (value: string): string => {
  if (!value) return '';
  // Drop ILLUSTRATIVE parentheticals only ("frameworks (e.g., Django)" == "frameworks").
  // A SUBSTANTIVE parenthetical is part of the requirement's identity and is KEPT:
  // stripping every parenthetical made "Genesys Cloud (Core Contact Center Platform)"
  // and "Genesys Cloud" compare equal, so the descriptive half the JD actually wrote
  // was discarded as a duplicate. Mirrors the backend's _normalize_for_dedup - keep
  // the two in sync.
  const withoutParens = value
    .toLowerCase()
    .replace(/\((?:\s*(?:e\.?g\.?|i\.?e\.?|for example|such as|including)\b).*?\)/g, ' ');
  const tokens = withoutParens
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && !DUPLICATE_STOPWORDS.has(token));
  tokens.sort();
  return tokens.join(' ');
};

interface DuplicateHit {
  listKey: DuplicateListKey;
  existingValue: string;
}

// Returns the first list where `value` already exists (normalized match), or
// null when it is unique. `skip` lets an inline edit ignore its own slot.
const findDuplicateAcrossLists = (
  value: string,
  lists: Record<DuplicateListKey, string[]>,
  skip?: { listKey: DuplicateListKey; index: number },
): DuplicateHit | null => {
  const target = normalizeForDuplicate(value);
  if (!target) return null;

  const order: DuplicateListKey[] = [
    'mustHaveSkills',
    'niceToHaveSkills',
    'mustHaveComments',
    'niceToHaveComments',
  ];

  for (const listKey of order) {
    const items = lists[listKey] || [];
    for (let index = 0; index < items.length; index++) {
      if (skip && skip.listKey === listKey && skip.index === index) continue;
      if (normalizeForDuplicate(items[index]) === target) {
        return { listKey, existingValue: items[index] };
      }
    }
  }
  return null;
};

// Deterministic (no-AI) cross-list de-duplication. Keeps the first occurrence of
// each normalized item, following the priority order below, so every requirement
// survives in exactly one list. Mirrors the backend's _dedupe_exact_across_lists.
const dedupeListsDeterministic = (
  lists: Record<DuplicateListKey, string[]>,
): Record<DuplicateListKey, string[]> => {
  const seen = new Set<string>();
  const result: Record<DuplicateListKey, string[]> = {
    mustHaveSkills: [],
    niceToHaveSkills: [],
    mustHaveComments: [],
    niceToHaveComments: [],
  };
  const order: DuplicateListKey[] = [
    'mustHaveSkills',
    'niceToHaveSkills',
    'mustHaveComments',
    'niceToHaveComments',
  ];
  for (const listKey of order) {
    for (const raw of lists[listKey] || []) {
      const value = (raw ?? '').trim();
      if (!value) continue;
      const norm = normalizeForDuplicate(value);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      result[listKey].push(value);
    }
  }
  return result;
};

// Deterministic (no-AI) de-duplication of a single list. Keeps the first
// occurrence of each normalized item. Used to merge an extraction re-run with
// the previous result without introducing duplicates (see mergeExtractedListField).
const dedupeSingleList = (items: (string | undefined | null)[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items || []) {
    const value = (raw ?? '').trim();
    if (!value) continue;
    const norm = normalizeForDuplicate(value);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    result.push(value);
  }
  return result;
};

// Merge a freshly-extracted requirement list with the previous one instead of
// blindly overwriting it. Each extraction call is an independent run of a
// multi-step LLM pipeline, so a later run can legitimately omit an item an
// earlier run correctly found (a duplicate collapsed differently, a slightly
// different phrasing chosen) - overwriting would silently drop it. Only
// applies during re-extraction of an existing JD (isEditMode); a brand-new
// extraction has nothing worth preserving, so it just takes the new result.
const mergeExtractedListField = (
  previous: string[] | undefined,
  next: string[] | undefined,
  isEditMode: boolean,
): string[] => {
  const newItems = next || [];
  if (!isEditMode) return newItems;
  const prevItems = previous || [];
  if (newItems.length === 0) return prevItems;
  if (prevItems.length === 0) return newItems;
  return dedupeSingleList([...prevItems, ...newItems]);
};

const totalListItems = (lists: Record<DuplicateListKey, string[]>): number =>
  (lists.mustHaveSkills?.length || 0) +
  (lists.niceToHaveSkills?.length || 0) +
  (lists.mustHaveComments?.length || 0) +
  (lists.niceToHaveComments?.length || 0);

interface ExtractedData {
  mustHaveSkills: string[];
  mustHaveComments: string[];
  niceToHaveSkills: string[];
  niceToHaveComments: string[];
  education: string;
  educationRequired: boolean;
  experience: string;
  experienceRequired: boolean;
  /** RS20: Job Hopping toggle. Auto-defaults from `experience` (>= 3 years -> true)
   *  via the useEffect near parseExperienceYearsString, but the recruiter can
   *  override it with the checkbox next to the Experience field. Whatever value
   *  is on screen at save time is what gets sent as job_hopping_enabled -
   *  editing Experience again afterwards recomputes and overwrites it. Optional
   *  so the few places that build a partial ExtractedData literal before the
   *  effect has run don't need to supply it. */
  jobHoppingEnabled?: boolean;
  industryType: string;
  /** The industry proposed for this JD when nothing on the master list fitted -
   *  either coined by extraction or typed by the recruiter after clearing it.
   *
   *  This is a REQUEST, not a code. While it is set, `industryType` still holds
   *  whatever code the JD was filed under (usually 'others'); Step 3 validates the
   *  name against the JD and only then does it become a real industry. Nothing here
   *  may be passed anywhere a master code is expected. */
  industrySuggestedName?: string;
  /** One sentence from extraction saying why it proposed that industry. Shown beside
   *  the suggestion so the recruiter is not asked to approve a bare noun. Cleared with
   *  the suggestion - a reason outliving its name would render under nothing. */
  industrySuggestedReason?: string;
  /** 0-1 fit of `industryType` as extraction judged it. Drives the "check this"
   *  hint; undefined simply means the model did not say. */
  industryConfidence?: number;
  /** True once the recruiter has cleared the model's suggestion and is typing their
   *  own. Kept separate from `industrySuggestedName` being empty, because "cleared it
   *  and typed nothing yet" and "never had a suggestion" look identical otherwise and
   *  only the first should keep the text box open. */
  industryIsCustom?: boolean;
  roleFamily?: string;
  roleFamilyConfidence?: number;
  roleFamilyRaw?: string;
  industryTypeRequired: boolean;
  department: string;
  /** Required recruiter choice, not a plain default-off toggle: null means "not yet
   *  answered" and blocks leaving Step 2 (see getValidationStatus/handlePublish). Only
   *  true/false are valid saved values - null must never reach the save payload. */
  allowOverqualified: boolean | null;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary';
  workModel: 'onsite' | 'remote' | 'hybrid' | 'field_based';
  salaryFrom: string;
  salaryTo: string;
  compensationType: 'hourly' | 'daily' | 'monthly' | 'yearly';
  salaryCurrency: 'INR' | 'USD';
  /** The salary figure/currency as last established by extraction, a loaded draft,
   *  or the recruiter's own typed input - NOT necessarily what salaryFrom/salaryTo/
   *  salaryCurrency currently show, which may be a currency-toggle-derived conversion.
   *  The toggle always converts FROM here, never from whatever is on screen, so an
   *  INR -> USD -> INR round trip restores the exact original figure instead of
   *  compounding FX rounding error on every switch. Typing in either salary box
   *  re-pins this to the currently displayed pair, in the currently displayed
   *  currency - the edited figure becomes the new ground truth. */
  salaryOriginalFrom: string;
  salaryOriginalTo: string;
  salaryOriginalCurrency: 'INR' | 'USD';
  locations: Array<{ city: string; radius: string; radiusKm?: number; isRequired?: boolean; country?: 'IN' | 'US' }>;
  locationsRequired: boolean;
  assessmentGuidance: string;
  /** JD22. Free text ABOUT the job that the recruiter wants the candidate to see -
   *  shift timings, WFO/WFH, and whatever extraction did not pick up. Purely
   *  informational: it is sent as its own field and never folded into the
   *  description, so no scoring, assessment or interview input ever reads it. */
  additionalDetails: string;
  /** Duplicate groups the extraction collapsed. Kept in Step 2 state so a merged skill
   *  can be explained and restored; not persisted - a re-extraction produces a new one. */
  mergeTrail: JDMergeTrailEntry[];
  internalRecruiterComments: string[];
  // JD09: Additional extraction fields
  certifications: string[];
  domainKeywords: string[];
  // Coding assessment fields
  codingRequired: boolean;
  suggestedLanguages: string[];
}

interface EditingJDData {
  id: string;
  job_id?: string;  // Human-readable code like "JD-076"
  current_version?: number;  // publish COUNT of this row - says "republished", not which version
  version_number?: number;   // LINEAGE version (v1, v2, ...) - what every vN badge shows
  /** The editor's working copy (see jd-creation/page.tsx): which draft it belongs to. */
  is_working_copy?: boolean;
  working_copy_of?: string | null;
  title: string;
  description: string;
  status?: 'draft' | 'published' | 'archived' | 'disabled';
  creation_stage: 'create' | 'extract' | 'review';
  creation_method?: 'manual' | 'ai_generated';
  ai_prompt?: string;  // Original AI prompt used to generate JD
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  education_requirements?: { degree?: string };
  // Required/Essential toggles. These decide which criteria the scoring engine
  // treats as Essential (60% block) rather than Preferred, so reopening a JD has
  // to restore them - see the hydration block below.
  experience_mandatory?: boolean;
  /** Computed server-side from the JD TEXT: does it invite freshers? Paired with a
   *  stated minimum that is a contradiction the recruiter has to settle - see the
   *  Experience block in Step 2. Never stored; derived on every read. */
  experience_welcomes_freshers?: boolean;
  education_mandatory?: boolean;
  industry_mandatory?: boolean;
  location_mandatory?: boolean;
  experience_min?: number;
  experience_max?: number;
  industry_type?: string;
  /** The free-text industry saved from Step 2 when nothing on the master list fitted
   *  (job_descriptions.raw_industry). Reopening a draft has to give it back, or the
   *  recruiter's own words are silently replaced by the code it was filed under. */
  industry_suggested_name?: string | null;
  role_family?: string;
  role_family_confidence?: number;
  department?: string;
  salary_min?: number;
  salary_max?: number;
  compensation_type?: string;
  employment_type?: string;
  remote_type?: string;
  assessment_guidance?: string;
  internal_comments?: string;
  /** JD22 - see ExtractedData.additionalDetails. Both editingJD mappings (this
   *  component's and jd-creation/page.tsx's) must forward it, or editing a JD silently
   *  drops what the recruiter wrote. */
  additional_details?: string;
  must_have_comments?: string[];
  nice_to_have_comments?: string[];
  certifications?: string[];
  domain_keywords?: string[];
  // Stored skill groups (which extracted wordings were folded into which skill),
  // read back into `mergeTrail` when a saved JD is reopened in Step 2.
  skill_merge_trail?: JDMergeTrailEntry[];
  allow_overqualified?: boolean;
  locations?: Array<{ city: string; state?: string; country?: string; radius_km?: number; is_required?: boolean }>;
  salary_currency?: 'INR' | 'USD' | string;
  // Seniority level extracted from JD body (e.g. "entry" | "senior") — surfaced
  // by the AI extraction step so the review UI can re-edit it before save.
  job_level?: string;
}

interface JDCreationProps {
  onBack?: () => void;
  selectedJob?: Job | null;
  onPublish?: (job: Job) => void;
  editingJD?: EditingJDData | null;  // JD data when editing a draft
  isJDInUse?: boolean;  // Whether JD is used in scoring/assessment/AI match
  jdUsageMessage?: string;  // Message explaining why JD can't be edited
  /** The job title is fixed: this job (or, for a new version, an earlier
   *  version of it) has already been used for resume scoring, assessments,
   *  AI Talent Match or AI Interviews. Only the title is locked. */
  isTitleLocked?: boolean;
  titleLockedMessage?: string;
  breadcrumbItems?: BreadcrumbCrumb[];  // Optional breadcrumb shown above the header
  /** Which workflow the host opened: Step 1 reads "Create JD" (a new job),
   *  "Edit JD" (an existing job), "New Version" (a job version just created)
   *  or "Edit New Version" (that version's draft, reopened). */
  jdWorkflow?: 'create' | 'edit' | 'new-version' | 'edit-new-version';
  /**
   * Reports which of the FOUR displayed steps the recruiter is on (1-4), so the
   * host page can name its breadcrumb leaf after it.
   *
   * Push, not pull: the internal `step` is mirrored into `?stage=` with
   * `history.replaceState`, which deliberately bypasses the Next router — so
   * `useSearchParams` in the page never re-renders on it and could only ever
   * read a stale stage. This callback is the only live source.
   *
   * Report-only. It never influences the flow, and nothing here reads back
   * whatever the host does with it.
   */
  onStepChange?: (displayStep: 1 | 2 | 3 | 4) => void;
  // FIX-003: Props for embedded mode in sheet/modal
  editingJDId?: string | null;  // JD ID to fetch and edit
  onClose?: () => void;  // Callback when closed
  onSuccess?: (jdId?: string) => void;  // Callback on successful create/update (with optional JD ID)
  isEmbedded?: boolean;  // Flag to indicate embedded mode
}

/**
 * Has extraction ALREADY produced structured data for this JD?
 *
 * Answered from the persisted record, never from `creation_stage`. Three places used
 * `creation_stage !== 'create'` as a stand-in for this question, and all three were
 * defeated the same way: jd-creation/page.tsx builds the editing object with
 * `creation_stage: stageFromUrl || editingJD.creation_stage`, so opening a JD with
 * `?stage=create` in the link REWRITES the stage to 'create' no matter what is stored.
 *
 * That is how a draft another recruiter had already taken through Step 2 lost every
 * no-change-no-LLM guard at once - the skip in handleNext, the lastExtractedJD
 * hydration, and the load of the extracted data itself - and re-ran the extraction LLM
 * on a JD nobody had edited, spending a call and risking a different answer for
 * identical text.
 *
 * The two ideas are genuinely separate: creation_stage says WHICH STEP TO SHOW (and the
 * URL may legitimately override that), while this says WHETHER THERE IS ANYTHING TO
 * RE-EXTRACT. Only the persisted output can answer the second one.
 */
const jdHasPersistedExtraction = (jd?: EditingJDData | null): boolean => Boolean(
  jd && (
    jd.experience_min != null ||
    jd.experience_max != null ||
    (jd.must_have_skills?.length || 0) > 0 ||
    (jd.must_have_comments?.length || 0) > 0 ||
    (jd.nice_to_have_skills?.length || 0) > 0 ||
    (jd.nice_to_have_comments?.length || 0) > 0 ||
    jd.education_requirements?.degree ||
    jd.industry_type
  )
);

/**
 * Serialise Step-2 data for change detection, with object keys in a stable order.
 *
 * Plain JSON.stringify is key-ORDER sensitive, and the two objects being compared are
 * built differently: the extraction path writes a fresh `{...}` literal, while the
 * post-reformat path spreads (`{...extractedData, <lists>}`) and the load path builds up
 * through `setExtractedData(prev => ...)`. Identical values could therefore serialise
 * differently and read as "changed", spending an LLM reformat on data nobody touched.
 */
const serializeStep2 = (value: unknown): string =>
  JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );

/**
 * What Step 3's formatted output was built from: the Step-2 data AND the job title.
 *
 * The title has to be in here even though it is not part of ExtractedData. It is separate
 * state, but the reformat writes it into the description as the H1 heading, so a
 * title-only Step-1 edit re-extracts to an IDENTICAL ExtractedData - and without the
 * title in the fingerprint, nothing would mark Step 3 stale and the published JD would
 * keep its old heading.
 */
const step2Fingerprint = (data: unknown, jobTitle: string): string =>
  serializeStep2({ jobTitle: (jobTitle || '').trim(), data });

// How many items a skills / additional-requirements list shows before the rest
// collapse behind a "+N skills" / "+N requirements" toggle.
const SKILL_PREVIEW_LIMIT = 5;

// The visibility badges beside Step 2's section headings — one lucide glyph and
// a label, on the project's semantic tokens. Private (internal notes) is the
// warning tone; Visible to candidates is the success tone the Job Details
// page's Additional Details badge already uses.
const PRIVATE_BADGE_CLASS =
  'inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-warning-strong bg-warning-subtle border border-warning-line px-2 py-0.5 rounded';
const CANDIDATE_VISIBLE_BADGE_CLASS =
  'inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-success bg-success-subtle border border-success-line px-2 py-0.5 rounded';

// Step 2's section card (STEP2_CARD_CLASS), section tones and header are
// shared with Job Details: components/jobs/Step2Section.
// Step 2's required fields in the order they sit on the page - Next scrolls to
// the first one that is missing. Each field's block carries a matching
// `data-step2-field`.
const STEP2_REQUIRED_MESSAGES = {
  mustHaveSkills: 'At least one must-have skill required',
  experience: 'Experience is required',
  industryType: 'Industry Type is required',
} as const;
const STEP2_REQUIRED_FIELD_ORDER = [
  'mustHaveSkills', 'experience', 'industryType', 'salaryRange', 'allowOverqualified', 'locations',
] as const;
// A field group inside a Step 2 section card. Framed from sm only: on a phone a
// bordered, padded box inside the bordered, padded card was card-in-card and
// squeezed the inputs by another 26px; there the groups are just spaced apart.
const STEP2_PANEL_CLASS =
  'min-w-0 sm:rounded-lg sm:border sm:border-gray-100 sm:dark:border-slate-700/60 sm:p-4';

/**
 * Where a phrase from the "possibly missed" panel can go.
 *
 * All FOUR lists, not just the two skills ones. The panel used to offer Must-Have and
 * Nice-to-Have Skills only, and the phrases it reports are frequently not skills at all -
 * "Team Player: Ability to work collaboratively within a team environment" is a
 * requirement sentence, and a recruiter who wanted it in Additional Requirements had to
 * retype it into the column's own Add box and dismiss the chip, which is the retyping the
 * panel exists to save.
 */
const MISSED_TARGETS = [
  { category: 'mustHaveSkills', listKey: 'must_have_skills', label: 'Must-Have Skills' },
  { category: 'niceToHaveSkills', listKey: 'nice_to_have_skills', label: 'Nice-to-Have Skills' },
  { category: 'mustHaveComments', listKey: 'must_have_comments', label: 'Must-Have Additional Requirements' },
  { category: 'niceToHaveComments', listKey: 'nice_to_have_comments', label: 'Nice-to-Have Additional Requirements' },
] as const;

type MissedTarget = (typeof MISSED_TARGETS)[number]['category'];

// How many JD lines the "possibly missed" panel shows before folding the rest away. The
// panel is a warning, not a worklist: past a handful of lines it stops being read at all.
const MISSED_SOURCE_PREVIEW = 4;

// The child kinds that EXPLAIN something rather than record a merge: a skill whose
// wording is shorter than the JD's, a skill the JD listed in both sections, and (JD24)
// what the JD SAYS about a skill - "executed more than 3,000 test cases", "1 million
// users", "5 years". That last one is context, not a second skill and not by itself a
// requirement; "Add" promotes it into Additional Requirements when the recruiter decides
// it must be one.
const NOTE_KINDS: ReadonlyArray<string> = [
  'narrowed-from-jd-wording', 'cross-list-priority', 'context-from-jd',
];

/** Per-child kind and the counts the badge shows. The kind is read PER CHILD because
 *  one item can hold a note beside a genuine merge, and each offers a different action.
 *  Groups saved before per-child kinds existed fall back to the entry-level `source`. */
const trailCounts = (entry?: JDMergeTrailEntry) => {
  const kindOf = (i: number) => entry?.sources?.[i] ?? entry?.source;
  const total = entry?.removed?.length || 0;
  const notes = (entry?.removed || []).filter((_, i) => NOTE_KINDS.includes(kindOf(i) || '')).length;
  return { kindOf, total, notes, merges: total - notes };
};

/**
 * A child whose wording is ON SCREEN is not a group any more.
 *
 * "Add" promotes a wording into a list, "Use JD wording" renames a skill to its child's
 * text, and both used to DELETE the child from the trail - which made them one-way: the
 * recruiter who deleted the line they had just created had nothing left to bring it back,
 * and the wording reappeared only after a reload, because the reload re-read the stored
 * trail. So nothing is deleted now; a child is simply not rendered while its text sits in
 * one of the four lists. Delete that line and the child - with its Add button - is back.
 *
 * The same rule decides what is SAVED: `_consolidate_merge_trail` on the backend drops
 * "any wording that is present in a list after all", so the screen and the stored trail
 * agree without either side having to remember a promotion.
 *
 * Returns undefined when nothing is left to show, so callers can skip the badge entirely.
 */
const visibleTrailEntry = (
  entry: JDMergeTrailEntry | undefined, onScreen: Set<string>,
): JDMergeTrailEntry | undefined => {
  if (!entry) return undefined;
  const norm = (t: string) => t.trim().toLowerCase();
  // A cross-list note names the SAME text as its parent on purpose ("the JD listed this
  // in the other section too"), so the on-screen test would delete every one of them.
  const kindOf = (i: number) => entry.sources?.[i] ?? entry.source;
  const keep = entry.removed.map(
    (rm, i) => kindOf(i) === 'cross-list-priority' || !onScreen.has(norm(rm)),
  );
  if (keep.every(Boolean)) return entry;
  if (!keep.some(Boolean)) return undefined;
  const pick = <T,>(arr?: T[]) => (arr ? arr.filter((_, i) => keep[i]) : arr);
  return {
    ...entry,
    removed: entry.removed.filter((_, i) => keep[i]),
    reasons: entry.reasons.filter((_, i) => keep[i]),
    removed_sources: pick(entry.removed_sources),
    restore_lists: pick(entry.restore_lists),
    sources: pick(entry.sources),
  };
};

/**
 * Sentence-case a line that is about to become a list item.
 *
 * The twin of `_sentence_case` in the backend's openai_service.py, and it exists for the
 * same reason: the phrases the JD hands us are FRAGMENTS of its sentences - "conducting
 * test case reviews", "demonstrating a strong understanding of testing methodologies",
 * "executed more than 3,000 test cases" - so anything promoted out of the "possibly
 * missed" panel or out of a group arrived in the recruiter's list starting lower-case.
 *
 * Only the first character, and only when it is a lower-case letter. A first word that
 * already carries a capital is deliberate and is left alone: "iOS development",
 * "eCommerce migrations", "jQuery plugins".
 */
const sentenceCase = (text: string): string => {
  const t = (text || '').trimStart();
  if (!t || !/^[a-z]/.test(t)) return text;
  const firstWord = t.split(' ')[0];
  if (/[A-Z]/.test(firstWord.slice(1))) return text;
  return text.slice(0, text.length - t.length) + t[0].toUpperCase() + t.slice(1);
};

/**
 * The same rule, but SKILL names get a guard: a one-word skill is a name, and plenty of
 * real ones are lower-case on purpose - "npm", "nginx", "pandas", "kubectl". Capitalising
 * those would be wrong in a way the recruiter cannot undo by retyping, since extraction
 * would keep re-supplying the lower-case form. A multi-word phrase in a skills list is a
 * fragment of a sentence ("conducting test case reviews"), so it is safe.
 *
 * Requirement lines are sentences by definition and are always capitalised.
 */
const sentenceCaseForList = (text: string, listKey: string): string => {
  if (listKey.endsWith('_comments')) return sentenceCase(text);
  return text.trim().includes(' ') ? sentenceCase(text) : text;
};

/**
 * Keep the tree attached to its item when the recruiter RENAMES, MOVES or DELETES one.
 *
 * A group is found by (list, survivor text), so any edit to that pair orphans it: the
 * children vanish from the screen, and the next save stores a trail pointing at an item
 * that no longer exists. Renaming "Docker" or dragging it to Nice-to-Have silently took
 * its notes with it, and deleting it dropped the JD wordings it had absorbed with nothing
 * left to say they were ever there.
 */
const trailAfterRename = (
  trail: JDMergeTrailEntry[], listKey: string, from: string, to: string,
): JDMergeTrailEntry[] => trail.map(
  e => (e.list === listKey && e.survivor === from ? { ...e, survivor: to } : e),
);

const trailAfterMove = (
  trail: JDMergeTrailEntry[], item: string, fromList: string, toList: string,
): JDMergeTrailEntry[] => trail.map(e => {
  if (e.list !== fromList || e.survivor !== item) return e;
  return {
    ...e,
    list: toList as JDMergeTrailEntry['list'],
    // A child restored "to the survivor's own list" has to follow it; one that names a
    // DIFFERENT list (a requirement sentence folded into a skill) keeps its own target.
    restore_lists: (e.restore_lists || []).map(r => (r === fromList ? toList : r)),
  };
});

/**
 * Deleting an item drops its group - but NOT the wordings inside it. Each becomes a
 * "possibly missed" entry, the one kind of note that belongs to no item, so a wording the
 * JD actually contains is still reported instead of disappearing with the row.
 * Cross-list notes are the exception: they only ever said "the JD listed this skill in
 * both sections", which stops being true the moment the skill is gone.
 */
const trailAfterRemoval = (
  trail: JDMergeTrailEntry[], listKey: string, item: string,
): JDMergeTrailEntry[] => {
  const out: JDMergeTrailEntry[] = [];
  for (const e of trail) {
    if (e.list !== listKey || e.survivor !== item) {
      out.push(e);
      continue;
    }
    e.removed.forEach((rm, i) => {
      const kind = e.sources?.[i] ?? e.source;
      if (kind === 'cross-list-priority') return;
      out.push({
        survivor: '',
        removed: [rm],
        reasons: [`The JD asks for "${rm}", and it is not in any list. Add it if it matters for this role.`],
        removed_sources: [e.removed_sources?.[i] ?? null],
        restore_lists: [e.restore_lists?.[i] ?? e.list],
        sources: ['possibly-missed'],
        survivor_source: null,
        list: e.list,
        kind: e.kind,
        source: 'possibly-missed',
      });
    });
  }
  return out;
};

/** "2 grouped · 1 note" - named for what it holds. A bare "1 grouped" on a note that
 *  explains a shortened wording read as though something had been merged AWAY, the
 *  opposite of what the note says, so recruiters did not notice an explanation was there. */
const trailBadgeLabel = (merges: number, notes: number) => [
  merges > 0 ? `${merges} grouped` : null,
  notes > 0 ? `${notes} ${notes === 1 ? 'note' : 'notes'}` : null,
].filter(Boolean).join(' · ');

interface TrailChildrenProps {
  entry: JDMergeTrailEntry;
  /** The skill or requirement the children hang off. */
  parentText: string;
  readOnly: boolean;
  onPromote?: (survivor: string, removed: string) => void;
  /** Replace the parent's text with the JD's own wording (narrowing notes only). */
  onUseJdWording?: (jdWording: string) => void;
}

/**
 * The children of one skill or requirement: wordings folded into it, and notes that
 * explain how it differs from the JD. Shared by the skills lists AND the Additional
 * Requirements lists - requirement groups used to be filtered out of Step 2 entirely,
 * and because the filtered list is what gets saved, they were discarded as well. A
 * merge nobody can see is exactly the silent deletion this tree exists to prevent.
 */
const TrailChildren = ({ entry, parentText, readOnly, onPromote, onUseJdWording }: TrailChildrenProps) => {
  const { kindOf } = trailCounts(entry);
  return (
    <div className="px-2.5 pb-2 pl-7">
      {entry.removed.map((rm, i) => {
        const isCrossListNote = kindOf(i) === 'cross-list-priority';
        const isNarrowingNote = kindOf(i) === 'narrowed-from-jd-wording';
        return (
          <div key={`${rm}-${i}`} className="flex items-start gap-1.5 pt-1.5 text-left">
            <span className="select-none text-gray-300 dark:text-slate-600 text-xs leading-5 font-mono flex-shrink-0">
              └──
            </span>
            <div className="min-w-0 flex-1">
              {/* A cross-list note names the SAME text as its parent - it says "the JD
                  listed this in the other section too", not "here is another wording".
                  Echoing the name back would read as a duplicate, and an Add button
                  would create the very duplicate the precedence rule exists to prevent. */}
              {!isCrossListNote && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-600 dark:text-slate-400 break-words" title={rm}>
                    {rm}
                  </span>
                  {!readOnly && onPromote && !isNarrowingNote && (
                    <button
                      type="button"
                      onClick={() => onPromote(entry.survivor, rm)}
                      className="inline-flex items-center gap-0.5 text-2xs font-medium text-brand-blue hover:underline flex-shrink-0"
                      title={`Track "${rm}" on its own instead of as part of "${parentText}"`}
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  )}
                  {/* A narrowing note's child is the JD's OWN wording, not a second
                      item - so the action REPLACES the parent's text. Adding it would
                      put "Docker" beside "Docker containerization", the duplicate the
                      extraction was right to avoid. */}
                  {!readOnly && onUseJdWording && isNarrowingNote && (
                    <button
                      type="button"
                      onClick={() => onUseJdWording(rm)}
                      className="inline-flex items-center gap-0.5 text-2xs font-medium text-brand-blue hover:underline flex-shrink-0"
                      title={`Rename to the JD's wording: "${rm}"`}
                    >
                      Use JD wording
                    </button>
                  )}
                </div>
              )}
              {/* The reason and the JD line are what make this checkable rather than
                  something to take on trust. */}
              <p className="text-2xs text-gray-500 dark:text-slate-500 leading-snug mt-0.5">
                {entry.reasons?.[i]}
              </p>
              {entry.removed_sources?.[i] && (
                <p className="text-2xs text-gray-400 dark:text-slate-600 italic leading-snug break-words">
                  From the JD: &ldquo;{entry.removed_sources[i]}&rdquo;
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** The badge button that shows / hides a TrailChildren block. */
const TrailBadge = ({ entry, open, onToggle }: { entry?: JDMergeTrailEntry; open: boolean; onToggle: () => void }) => {
  const { total, notes, merges } = trailCounts(entry);
  if (total === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex-shrink-0 text-2xs leading-none px-1.5 py-1 rounded-full bg-warning-subtle text-warning border border-warning-line hover:bg-warning-subtle transition-colors"
      title={open ? 'Hide the details' : 'Show how this differs from the JD wording'}
      aria-expanded={open}
    >
      {trailBadgeLabel(merges, notes)}
    </button>
  );
};

interface DraggableSkillProps {
  skill: string;
  index: number;
  category: 'mustHaveSkills' | 'niceToHaveSkills';
  onMove: (skill: string, from: 'mustHaveSkills' | 'niceToHaveSkills', to: 'mustHaveSkills' | 'niceToHaveSkills') => void;
  onRemove: (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number) => void;
  onStartEdit: (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number, value: string) => void;
  isEditing: boolean;
  editingValue: string;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  readOnly?: boolean;
  /** Set when other wordings from the JD were grouped under this skill at extraction. */
  mergedInto?: JDMergeTrailEntry;
  onRestoreMerged?: (survivor: string, removed: string) => void;
  /** Replace this skill's text with the JD's own longer wording (narrowing notes). */
  onUseJdWording?: (
    category: 'mustHaveSkills' | 'niceToHaveSkills', index: number, jdWording: string,
  ) => void;
}

/**
 * Drag-and-drop position handling for one skills / requirements list.
 *
 * The LIST is the drop target, not each card: it measures every card against
 * the pointer, so a drop on a card, in the gap between two cards, or below
 * the last one all resolve to one exact insert index - the number of cards
 * whose midpoint is above the pointer. The same calculation draws the
 * insertion line and performs the drop, so the line is where the item lands.
 *
 * `type` keeps the two flows apart: a SKILL never lands in a requirements
 * list (COMMENT) or the other way round. Same-list drops reorder; a drop that
 * would leave the item where it already is shows no line and does nothing.
 * Cards are found by their `data-dnd-index` (their real index in the list,
 * so a list folded behind "+N more" still inserts at the right position).
 */
function useListDropTarget<C extends string, T extends { category: C; index: number }>(
  type: 'SKILL' | 'COMMENT',
  category: C,
  onDrop: (item: T, insertIndex: number) => void,
) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [lineTop, setLineTop] = useState<number | null>(null);

  const locate = (clientY: number | undefined): { index: number; top: number | null } => {
    const list = listRef.current;
    const cards = list ? Array.from(list.querySelectorAll<HTMLElement>(':scope > [data-dnd-index]')) : [];
    if (!list || cards.length === 0 || clientY == null) return { index: 0, top: null };
    // Line offsets are relative to the list's padding box (inside its border).
    const origin = list.getBoundingClientRect().top + list.clientTop;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        // Centred in the 8px `space-y-2` gap above this card.
        return { index: Number(card.dataset.dndIndex), top: rect.top - origin - 5 };
      }
    }
    const last = cards[cards.length - 1];
    const rect = last.getBoundingClientRect();
    return { index: Number(last.dataset.dndIndex) + 1, top: rect.bottom - origin + 3 };
  };

  const isNoOp = (item: T, index: number) =>
    item.category === category && (index === item.index || index === item.index + 1);

  const [{ isOver, fromOtherList }, drop] = useDrop<T, unknown, { isOver: boolean; fromOtherList: boolean }>(() => ({
    accept: type,
    hover: (item, monitor) => {
      const { index, top } = locate(monitor.getClientOffset()?.y);
      const next = isNoOp(item, index) ? null : top;
      setLineTop((prev) => (prev === next ? prev : next));
    },
    drop: (item, monitor) => {
      const { index } = locate(monitor.getClientOffset()?.y);
      if (!isNoOp(item, index)) onDrop(item, index);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      fromOtherList: monitor.getItem<T | null>()?.category !== category,
    }),
  }), [type, category, onDrop]);

  const setListRef = (node: HTMLDivElement | null) => {
    listRef.current = node;
    drop(node);
  };
  return { setListRef, isOver, fromOtherList, lineTop: isOver ? lineTop : null };
}

/** The insertion line. Rendered LAST in the list so `space-y-2` spacing on the
 *  cards is untouched; absolutely positioned, so it never moves a card. */
const ListInsertLine = ({ top }: { top: number | null }) =>
  top == null ? null : (
    <span
      aria-hidden
      style={{ top }}
      className="pointer-events-none absolute left-0 right-0 h-0.5 rounded-full bg-brand-blue"
    />
  );

const DraggableSkill = ({
  skill,
  index,
  category,
  onMove,
  onRemove,
  onStartEdit,
  isEditing,
  editingValue,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  readOnly = false,
  mergedInto,
  onRestoreMerged,
  onUseJdWording,
}: DraggableSkillProps) => {
  // Grouped wordings start EXPANDED. Collapsed-by-default was the old badge, and it
  // reproduced the problem it was meant to solve: a recruiter scanning the list saw the
  // skill count they expected and no reason to click anything, so a wrongly grouped skill
  // stayed invisible. Showing the tree costs one line per group and makes the question
  // ("is this really the same skill?") impossible to miss.
  const [showMerged, setShowMerged] = useState(true);
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'SKILL',
    item: { skill, category, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [skill, category, index]);

  const isMustHave = category === 'mustHaveSkills';
  // One colour treatment for every skill / requirement card: the Must-Have
  // Skills card's.
  const tickColor = 'text-success';
  const groupedCount = mergedInto?.removed?.length || 0;

  return (
    <div
      ref={dragPreview as unknown as React.Ref<HTMLDivElement>}
      data-dnd-index={index}
      className={`bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg group transition-opacity ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
    <div className="flex items-center justify-between p-2.5">
      {isEditing ? (
        <>
          <input
            type="text"
            value={editingValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="flex-1 px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-sm text-black focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
            autoFocus
          />
          <div className="flex gap-1 ml-2">
            <button
              onClick={onSaveEdit}
              className="text-success hover:text-success px-2"
              aria-label="Save" title="Save"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={onCancelEdit}
              className="text-destructive hover:text-destructive"
              aria-label="Cancel" title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {!readOnly && (
              <div
                ref={drag as unknown as React.Ref<HTMLDivElement>}
                className="cursor-move opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 flex-shrink-0"
                title="Drag to move"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            <CheckCircle className={`w-4 h-4 ${tickColor} flex-shrink-0`} />
            <span
              className={`text-sm text-gray-700 dark:text-slate-300 min-w-0 truncate ${readOnly ? '' : 'cursor-pointer hover:text-gray-900'}`}
              onClick={() => !readOnly && onStartEdit(category, index, skill)}
              title={skill}
            >
              {skill}
            </span>
            <TrailBadge entry={mergedInto} open={showMerged} onToggle={() => setShowMerged(v => !v)} />
          </div>
          {!readOnly && (
            <div className="flex gap-1">
              <button
                onClick={() => onStartEdit(category, index, skill)}
                className="text-gray-400 hover:text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Edit" title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onMove(skill, category, isMustHave ? 'niceToHaveSkills' : 'mustHaveSkills')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                aria-label={isMustHave ? 'Move to Nice-to-Have' : 'Convert to Must-Have'}
                title={isMustHave ? 'Move to Nice-to-Have' : 'Convert to Must-Have'}
              >
                {isMustHave ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => onRemove(category, index)}
                className="text-destructive hover:text-destructive"
                aria-label="Delete" title="Delete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>

      {/* THE GROUPED WORDINGS, drawn as what they are: this skill, and the other names
          the JD used for it. Extraction used to DELETE these, which is why skills
          appeared to go missing between Step 1 and Step 2 - the recruiter had no way to
          tell a wording that was folded in from one that was never read at all. Nothing
          is removed now; it is filed here with the evidence for the decision, and "Add"
          takes it back out as a skill of its own if the grouping was wrong. */}
      {groupedCount > 0 && showMerged && (
        <TrailChildren
          entry={mergedInto!}
          parentText={skill}
          readOnly={readOnly}
          onPromote={onRestoreMerged}
          onUseJdWording={onUseJdWording ? (w) => onUseJdWording(category, index, w) : undefined}
        />
      )}
    </div>
  );
};

type SkillDragItem = { skill: string; category: 'mustHaveSkills' | 'niceToHaveSkills'; index: number };

interface DroppableSkillsContainerProps {
  category: 'mustHaveSkills' | 'niceToHaveSkills';
  /** A skill was dropped; `insertIndex` is its exact position in this list. */
  onDrop: (item: SkillDragItem, insertIndex: number) => void;
  children: React.ReactNode;
}

const DroppableSkillsContainer = ({ category, onDrop, children }: DroppableSkillsContainerProps) => {
  const { setListRef, isOver, fromOtherList, lineTop } = useListDropTarget<SkillDragItem['category'], SkillDragItem>('SKILL', category, onDrop);
  // The existing dashed highlight marks a list receiving from the other list;
  // a reorder within the list shows only the insertion line.
  const isActive = isOver && fromOtherList;

  return (
    <div
      ref={setListRef}
      className={`relative space-y-2 min-h-[100px] py-2 rounded-lg border-2 border-dashed transition-all ${
        isActive
          ? 'border-destructive-line bg-destructive-subtle'
          : 'border-transparent'
      }`}
    >
      {children}
      <ListInsertLine top={lineTop} />
    </div>
  );
};

// Comment Drag & Drop Components
interface DraggableCommentProps {
  comment: string;
  index: number;
  category: 'mustHaveComments' | 'niceToHaveComments';
  onMove: (comment: string, from: 'mustHaveComments' | 'niceToHaveComments', to: 'mustHaveComments' | 'niceToHaveComments') => void;
  onRemove: (category: 'mustHaveComments' | 'niceToHaveComments', index: number) => void;
  onStartEdit: (category: 'mustHaveComments' | 'niceToHaveComments', index: number, value: string) => void;
  isEditing: boolean;
  editingValue: string;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  readOnly?: boolean;
  /** Set when other wordings were grouped under this requirement, or a note explains it. */
  mergedInto?: JDMergeTrailEntry;
  onRestoreMerged?: (survivor: string, removed: string) => void;
}

const DraggableComment = ({
  comment,
  index,
  category,
  onMove,
  onRemove,
  onStartEdit,
  isEditing,
  editingValue,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  readOnly = false,
  mergedInto,
  onRestoreMerged,
}: DraggableCommentProps) => {
  // Open by default for the same reason as the skills tree: a collapsed badge is easy to
  // scroll past, and the whole point is that the recruiter notices.
  const [showMerged, setShowMerged] = useState(true);
  const hasTrail = (mergedInto?.removed?.length || 0) > 0;
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'COMMENT',
    item: { comment, category, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [comment, category, index]);

  const isMustHave = category === 'mustHaveComments';
  // Same surface and tick as the Must-Have Skills card, for both lists.
  const bgColor = 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700';
  const iconColor = 'text-success';

  return (
    <div
      ref={dragPreview as unknown as React.Ref<HTMLDivElement>}
      data-dnd-index={index}
      className={`${bgColor} border rounded-lg group transition-opacity ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
    <div className="flex items-center justify-between p-2.5">
      {isEditing ? (
        <>
          <input
            type="text"
            value={editingValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="flex-1 px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-sm text-black focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
            autoFocus
          />
          <div className="flex gap-1 ml-2">
            <button
              onClick={onSaveEdit}
              className="text-success hover:text-success px-2"
              aria-label="Save" title="Save"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={onCancelEdit}
              className="text-destructive hover:text-destructive"
              aria-label="Cancel" title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-1">
            {!readOnly && (
              <div
                ref={drag as unknown as React.Ref<HTMLDivElement>}
                className="cursor-move opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-slate-500 hover:text-gray-600"
                title="Drag to move"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            <CheckCircle2 className={`w-4 h-4 ${iconColor} flex-shrink-0`} />
            <span
              className={`text-sm text-gray-700 dark:text-slate-300 flex-1 ${readOnly ? '' : 'cursor-pointer hover:text-gray-900'}`}
              onClick={() => !readOnly && onStartEdit(category, index, comment)}
              title={readOnly ? '' : 'Click to edit'}
            >
              {comment}
            </span>
            <TrailBadge entry={mergedInto} open={showMerged} onToggle={() => setShowMerged(v => !v)} />
          </div>
          {!readOnly && (
            <div className="flex gap-1">
              <button
                onClick={() => onStartEdit(category, index, comment)}
                className="text-gray-400 hover:text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Edit" title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onMove(comment, category, isMustHave ? 'niceToHaveComments' : 'mustHaveComments')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                aria-label={isMustHave ? 'Move to Nice-to-Have' : 'Convert to Must-Have'}
                title={isMustHave ? 'Move to Nice-to-Have' : 'Convert to Must-Have'}
              >
                {/* DOWN and UP, not right and left.
                    The two Additional Requirements lists are stacked one above
                    the other in a single `space-y-6` column — at every
                    breakpoint, so this is not a desktop-only assumption — and a
                    sideways arrow pointed at the empty gutter rather than at
                    the list the item actually travels to. The skills lists
                    above ARE side by side, which is why they keep left/right. */}
                {isMustHave ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => onRemove(category, index)}
                className="text-destructive hover:text-destructive"
                aria-label="Delete" title="Delete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
      {hasTrail && showMerged && (
        <TrailChildren
          entry={mergedInto!}
          parentText={comment}
          readOnly={readOnly}
          onPromote={onRestoreMerged}
        />
      )}
    </div>
  );
};

type CommentDragItem = { comment: string; category: 'mustHaveComments' | 'niceToHaveComments'; index: number };

interface DroppableCommentsContainerProps {
  category: 'mustHaveComments' | 'niceToHaveComments';
  /** A requirement was dropped; `insertIndex` is its exact position in this list. */
  onDrop: (item: CommentDragItem, insertIndex: number) => void;
  children: React.ReactNode;
}

const DroppableCommentsContainer = ({ category, onDrop, children }: DroppableCommentsContainerProps) => {
  const { setListRef, isOver, fromOtherList, lineTop } = useListDropTarget<CommentDragItem['category'], CommentDragItem>('COMMENT', category, onDrop);
  const isActive = isOver && fromOtherList;

  return (
    <div
      ref={setListRef}
      className={`relative space-y-2 min-h-[100px] py-2 rounded-lg border-2 border-dashed transition-all ${
        isActive
          ? 'border-destructive-line bg-destructive-subtle'
          : 'border-transparent'
      }`}
    >
      {children}
      <ListInsertLine top={lineTop} />
    </div>
  );
};

// Fallback master data in case API fails or returns empty. MUST stay in sync
// with the real experience_levels master table (see MasterDataService) — a
// mismatched boundary here creates a years-value that falls in a GAP between
// two fallback buckets (e.g. the old 2-3/4-7 split left 3-4 uncovered), which
// makes bucket-matching logic fall through to its "no containing range"
// branch and pick the wrong level for perfectly valid years like 3.5.
// Mirrors MAX_EXPERIENCE_YEARS in the backend's openai_service.py. Keep the two in sync:
// the recruiter is blocked here with a visible error, and extraction drops anything above
// this there, so no path can store an impossible requirement.
const MAX_EXPERIENCE_YEARS = 50;

const FALLBACK_EXPERIENCE_LEVELS: ExperienceLevel[] = [
  { id: 1, code: 'entry', label: 'Entry Level (0-2 Years)', min_years: 0, max_years: 2, sort_order: 1, is_active: true },
  { id: 2, code: 'junior', label: 'Junior Level (2-4 Years)', min_years: 2, max_years: 4, sort_order: 2, is_active: true },
  { id: 3, code: 'mid', label: 'Mid Level (5-7 Years)', min_years: 5, max_years: 7, sort_order: 3, is_active: true },
  { id: 4, code: 'senior', label: 'Senior Level (7-10 Years)', min_years: 7, max_years: 10, sort_order: 4, is_active: true },
  { id: 5, code: 'architect', label: 'Architect Level (10+ Years)', min_years: 10, max_years: null, sort_order: 5, is_active: true },
  { id: 6, code: 'management', label: 'Management Level (10+ Years)', min_years: 10, max_years: null, sort_order: 6, is_active: true },
];

// Mirrors master_education_levels (see MASTER_EDUCATION_LEVELS_SEED in the backend's
// migrations.py). Used only until master data loads. 'high_school' was added 2026-08-14:
// extraction could already emit it but no master row existed, so it fell through to
// "Other" - which broke every non-degree role (retail, hospitality, security, drivers,
// warehouse, field staff). Keep this list in sync with the backend seed.
const FALLBACK_EDUCATION_LEVELS: EducationLevel[] = [
  { id: 1, code: 'high_school', label: 'High School', level: 1, sort_order: 1, is_active: true },
  { id: 2, code: 'diploma', label: 'Diploma', level: 2, sort_order: 2, is_active: true },
  { id: 3, code: 'associate', label: 'Associate Degree', level: 3, sort_order: 3, is_active: true },
  { id: 4, code: 'bachelors', label: "Bachelor's Degree", level: 4, sort_order: 4, is_active: true },
  { id: 5, code: 'masters', label: "Master's Degree", level: 5, sort_order: 5, is_active: true },
  { id: 6, code: 'doctorate', label: 'Doctorate / PhD', level: 6, sort_order: 6, is_active: true },
  { id: 7, code: 'none', label: 'No Formal Education', level: 0, sort_order: 7, is_active: true },
  { id: 8, code: 'others', label: 'Other', level: 0, sort_order: 8, is_active: true },
];

const FALLBACK_INDUSTRY_TYPES: IndustryType[] = [
  { id: 1, code: 'agriculture', label: 'Agriculture', description: null, sort_order: 1, is_active: true, created_at: '', updated_at: '' },
  { id: 2, code: 'forestry', label: 'Forestry', description: null, sort_order: 2, is_active: true, created_at: '', updated_at: '' },
  { id: 3, code: 'fishing', label: 'Fishing', description: null, sort_order: 3, is_active: true, created_at: '', updated_at: '' },
  { id: 4, code: 'mining', label: 'Mining', description: null, sort_order: 4, is_active: true, created_at: '', updated_at: '' },
  { id: 5, code: 'oil_gas', label: 'Oil and Gas Extraction', description: null, sort_order: 5, is_active: true, created_at: '', updated_at: '' },
  { id: 6, code: 'manufacturing', label: 'Manufacturing', description: null, sort_order: 6, is_active: true, created_at: '', updated_at: '' },
  { id: 7, code: 'construction', label: 'Construction', description: null, sort_order: 7, is_active: true, created_at: '', updated_at: '' },
  { id: 8, code: 'textiles', label: 'Textiles and Apparel', description: null, sort_order: 8, is_active: true, created_at: '', updated_at: '' },
  { id: 9, code: 'food_processing', label: 'Food and Beverage Processing', description: null, sort_order: 9, is_active: true, created_at: '', updated_at: '' },
  { id: 10, code: 'chemical', label: 'Chemical Production', description: null, sort_order: 10, is_active: true, created_at: '', updated_at: '' },
  { id: 11, code: 'steel', label: 'Steel and Metalworking', description: null, sort_order: 11, is_active: true, created_at: '', updated_at: '' },
  { id: 12, code: 'energy', label: 'Energy Production', description: null, sort_order: 12, is_active: true, created_at: '', updated_at: '' },
  { id: 13, code: 'retail_wholesale', label: 'Retail and Wholesale Trade', description: null, sort_order: 13, is_active: true, created_at: '', updated_at: '' },
  { id: 14, code: 'transportation', label: 'Transportation and Logistics', description: null, sort_order: 14, is_active: true, created_at: '', updated_at: '' },
  { id: 15, code: 'tourism_and_hospitality', label: 'Tourism and Hospitality', description: null, sort_order: 15, is_active: true, created_at: '', updated_at: '' },
  { id: 16, code: 'healthcare_and_medical', label: 'Healthcare and Medical Services', description: null, sort_order: 16, is_active: true, created_at: '', updated_at: '' },
  { id: 17, code: 'financial', label: 'Financial Services', description: null, sort_order: 17, is_active: true, created_at: '', updated_at: '' },
  { id: 18, code: 'education', label: 'Education and Training', description: null, sort_order: 18, is_active: true, created_at: '', updated_at: '' },
  { id: 19, code: 'media', label: 'Entertainment and Media', description: null, sort_order: 19, is_active: true, created_at: '', updated_at: '' },
  { id: 20, code: 'real_estate_and_property_manage', label: 'Real Estate and Property Management', description: null, sort_order: 20, is_active: true, created_at: '', updated_at: '' },
  { id: 21, code: 'legal', label: 'Legal Services', description: null, sort_order: 21, is_active: true, created_at: '', updated_at: '' },
  { id: 22, code: 'telecom', label: 'Telecommunications', description: null, sort_order: 22, is_active: true, created_at: '', updated_at: '' },
  { id: 23, code: 'consulting', label: 'Professional Services', description: null, sort_order: 23, is_active: true, created_at: '', updated_at: '' },
  { id: 24, code: 'information_technology', label: 'Information Technology', description: null, sort_order: 24, is_active: true, created_at: '', updated_at: '' },
  { id: 25, code: 'research', label: 'Research and Development', description: null, sort_order: 25, is_active: true, created_at: '', updated_at: '' },
  { id: 26, code: 'biotech', label: 'Biotechnology', description: null, sort_order: 26, is_active: true, created_at: '', updated_at: '' },
  { id: 27, code: 'environment', label: 'Environmental Services', description: null, sort_order: 27, is_active: true, created_at: '', updated_at: '' },
  { id: 28, code: 'aerospace_and_defense', label: 'Aerospace and Defense', description: null, sort_order: 28, is_active: true, created_at: '', updated_at: '' },
  { id: 29, code: 'defense', label: 'Defense', description: null, sort_order: 29, is_active: true, created_at: '', updated_at: '' },
  { id: 30, code: 'ecommerce', label: 'E-commerce', description: null, sort_order: 30, is_active: true, created_at: '', updated_at: '' },
  { id: 31, code: 'government_and_public_administrator', label: 'Government and Public Administration', description: null, sort_order: 31, is_active: true, created_at: '', updated_at: '' },
  { id: 32, code: 'nonprofit_charitable_organization', label: 'Non-Profit and Charitable Organizations', description: null, sort_order: 32, is_active: true, created_at: '', updated_at: '' },
  { id: 33, code: 'artificial_inteligence', label: 'Artificial Intelligence', description: null, sort_order: 33, is_active: true, created_at: '', updated_at: '' },
  { id: 34, code: 'blockchain_and_cryptocurrency', label: 'Blockchain and Cryptocurrency', description: null, sort_order: 34, is_active: true, created_at: '', updated_at: '' },
  { id: 35, code: 'electric_vehicles', label: 'Electric Vehicles', description: null, sort_order: 35, is_active: true, created_at: '', updated_at: '' },
  { id: 36, code: 'space', label: 'Space Exploration', description: null, sort_order: 36, is_active: true, created_at: '', updated_at: '' },
  { id: 37, code: 'cybersecurity', label: 'Cybersecurity', description: null, sort_order: 37, is_active: true, created_at: '', updated_at: '' },
  { id: 38, code: 'green_technology', label: 'Green Technology and Sustainability', description: null, sort_order: 38, is_active: true, created_at: '', updated_at: '' },
  { id: 39, code: 'others', label: 'Others', description: null, sort_order: 99, is_active: true, created_at: '', updated_at: '' },
];

/** The industry half of every save payload, in one place.
 *
 *  Two fields leave together and must agree, which is exactly the kind of pairing that
 *  drifts when it is spelled out at five call sites: the code the JD is filed under,
 *  and the free-text name proposed for it. The sentinel never leaves the browser — a
 *  pending industry is saved as `others` plus the name, so a JD abandoned at Step 2
 *  reloads exactly as the recruiter left it, and nothing downstream is handed a code
 *  that no master table contains.
 *
 *  Returns `undefined` for a name that was never proposed, and `null` to CLEAR one the
 *  recruiter has withdrawn — `undefined` would be dropped by JSON.stringify and the
 *  backend's exclude_unset PATCH would keep the stale value, the same trap the salary
 *  bounds document below. */
const buildIndustryPayload = (data: Pick<ExtractedData, 'industryType' | 'industrySuggestedName'>) => {
  const suggested = data.industrySuggestedName?.trim() || '';
  const isPending = data.industryType === PENDING_INDUSTRY_VALUE;
  return {
    industry_type: isPending ? 'others' : (data.industryType || undefined),
    industry_suggested_name: suggested || null,
  };
};

/** `industryType` while the chosen industry is a NAME awaiting Step 3, not a code.
 *
 *  A pending industry has no master row, so there is no code to put here. Leaving the
 *  field empty would read as "not answered yet" and block Step 2; inventing a slug
 *  here would put a code on the JD that no table contains. The sentinel is neither: it
 *  satisfies every "has the recruiter chosen something?" check, and is deliberately
 *  not a plausible code, so anything that tries to resolve it as one fails loudly
 *  rather than silently filing the JD under a fiction. It is swapped for the real code
 *  at Step 3 and must never reach the save payload — see buildIndustryPayload. */
const PENDING_INDUSTRY_VALUE = '__pending_new_industry__';

/* Trigger classes that keep FilterSelect matching the step-2 form fields. */
const JD_FIELD_SELECT_CLASS = 'w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg';

/* India state filter options for the location picker. */
const IN_LOCATION_STATE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Delhi NCR', label: 'Delhi NCR' },
  { value: 'Andaman And Nicobar Islands', label: 'Andaman And Nicobar Islands' },
  { value: 'Andhra Pradesh', label: 'Andhra Pradesh' },
  { value: 'Arunachal Pradesh', label: 'Arunachal Pradesh' },
  { value: 'Assam', label: 'Assam' },
  { value: 'Bihar', label: 'Bihar' },
  { value: 'Chandigarh', label: 'Chandigarh' },
  { value: 'Chhattisgarh', label: 'Chhattisgarh' },
  { value: 'Delhi', label: 'Delhi' },
  { value: 'Goa', label: 'Goa' },
  { value: 'Gujarat', label: 'Gujarat' },
  { value: 'Haryana', label: 'Haryana' },
  { value: 'Himachal Pradesh', label: 'Himachal Pradesh' },
  { value: 'Jammu And Kashmir', label: 'Jammu And Kashmir' },
  { value: 'Jharkhand', label: 'Jharkhand' },
  { value: 'Karnataka', label: 'Karnataka' },
  { value: 'Kerala', label: 'Kerala' },
  { value: 'Ladakh', label: 'Ladakh' },
  { value: 'Lakshadweep', label: 'Lakshadweep' },
  { value: 'Madhya Pradesh', label: 'Madhya Pradesh' },
  { value: 'Maharashtra', label: 'Maharashtra' },
  { value: 'Manipur', label: 'Manipur' },
  { value: 'Meghalaya', label: 'Meghalaya' },
  { value: 'Mizoram', label: 'Mizoram' },
  { value: 'Nagaland', label: 'Nagaland' },
  { value: 'Odisha', label: 'Odisha' },
  { value: 'Puducherry', label: 'Puducherry' },
  { value: 'Punjab', label: 'Punjab' },
  { value: 'Rajasthan', label: 'Rajasthan' },
  { value: 'Sikkim', label: 'Sikkim' },
  { value: 'Tamil Nadu', label: 'Tamil Nadu' },
  { value: 'Telangana', label: 'Telangana' },
  { value: 'The Dadra And Nagar Haveli And Daman And Diu', label: 'The Dadra And Nagar Haveli And Daman And Diu' },
  { value: 'Tripura', label: 'Tripura' },
  { value: 'Uttar Pradesh', label: 'Uttar Pradesh' },
  { value: 'Uttarakhand', label: 'Uttarakhand' },
  { value: 'West Bengal', label: 'West Bengal' },
  { value: 'Remote', label: 'Remote/Hybrid' },
];

/* India city options for the location picker, grouped by the state filter that shows them. */
const IN_LOCATION_CITY_GROUPS: { state: string; options: { value: string; label: string }[] }[] = [
  {
    state: 'Delhi NCR',
    options: [
      { value: 'Delhi NCR', label: 'Delhi NCR (All)' },
      { value: 'New Delhi, Delhi', label: 'New Delhi' },
      { value: 'Gurugram, Haryana', label: 'Gurugram (Gurgaon)' },
      { value: 'Gautam Buddha Nagar, Uttar Pradesh', label: 'Noida / Greater Noida' },
      { value: 'Ghaziabad, Uttar Pradesh', label: 'Ghaziabad' },
      { value: 'Faridabad, Haryana', label: 'Faridabad' },
    ],
  },
  {
    state: 'Andaman And Nicobar Islands',
    options: [
      { value: 'Nicobars, Andaman And Nicobar Islands', label: 'Nicobars' },
      { value: 'North And Middle Andaman, Andaman And Nicobar Islands', label: 'North And Middle Andaman' },
      { value: 'South Andamans, Andaman And Nicobar Islands', label: 'South Andamans' },
    ],
  },
  {
    state: 'Andhra Pradesh',
    options: [
      { value: 'Anantapur, Andhra Pradesh', label: 'Anantapur' },
      { value: 'Chittoor, Andhra Pradesh', label: 'Chittoor' },
      { value: 'East Godavari, Andhra Pradesh', label: 'East Godavari' },
      { value: 'Guntur, Andhra Pradesh', label: 'Guntur' },
      { value: 'Krishna, Andhra Pradesh', label: 'Krishna' },
      { value: 'Kurnool, Andhra Pradesh', label: 'Kurnool' },
      { value: 'Prakasam, Andhra Pradesh', label: 'Prakasam' },
      { value: 'Spsr Nellore, Andhra Pradesh', label: 'Spsr Nellore' },
      { value: 'Srikakulam, Andhra Pradesh', label: 'Srikakulam' },
      { value: 'Visakhapatanam, Andhra Pradesh', label: 'Visakhapatanam' },
      { value: 'Vizianagaram, Andhra Pradesh', label: 'Vizianagaram' },
      { value: 'West Godavari, Andhra Pradesh', label: 'West Godavari' },
      { value: 'Y.S.R., Andhra Pradesh', label: 'Y.S.R.' },
    ],
  },
  {
    state: 'Arunachal Pradesh',
    options: [
      { value: 'Anjaw, Arunachal Pradesh', label: 'Anjaw' },
      { value: 'Changlang, Arunachal Pradesh', label: 'Changlang' },
      { value: 'Dibang Valley, Arunachal Pradesh', label: 'Dibang Valley' },
      { value: 'East Kameng, Arunachal Pradesh', label: 'East Kameng' },
      { value: 'East Siang, Arunachal Pradesh', label: 'East Siang' },
      { value: 'Kamle, Arunachal Pradesh', label: 'Kamle' },
      { value: 'Kra Daadi, Arunachal Pradesh', label: 'Kra Daadi' },
      { value: 'Kurung Kumey, Arunachal Pradesh', label: 'Kurung Kumey' },
      { value: 'Leparada, Arunachal Pradesh', label: 'Leparada' },
      { value: 'Lohit, Arunachal Pradesh', label: 'Lohit' },
      { value: 'Longding, Arunachal Pradesh', label: 'Longding' },
      { value: 'Lower Dibang Valley, Arunachal Pradesh', label: 'Lower Dibang Valley' },
      { value: 'Lower Siang, Arunachal Pradesh', label: 'Lower Siang' },
      { value: 'Lower Subansiri, Arunachal Pradesh', label: 'Lower Subansiri' },
      { value: 'Namsai, Arunachal Pradesh', label: 'Namsai' },
      { value: 'Pakke Kessang, Arunachal Pradesh', label: 'Pakke Kessang' },
      { value: 'Papum Pare, Arunachal Pradesh', label: 'Papum Pare' },
      { value: 'Shi Yomi, Arunachal Pradesh', label: 'Shi Yomi' },
      { value: 'Siang, Arunachal Pradesh', label: 'Siang' },
      { value: 'Tawang, Arunachal Pradesh', label: 'Tawang' },
      { value: 'Tirap, Arunachal Pradesh', label: 'Tirap' },
      { value: 'Upper Siang, Arunachal Pradesh', label: 'Upper Siang' },
      { value: 'Upper Subansiri, Arunachal Pradesh', label: 'Upper Subansiri' },
      { value: 'West Kameng, Arunachal Pradesh', label: 'West Kameng' },
      { value: 'West Siang, Arunachal Pradesh', label: 'West Siang' },
    ],
  },
  {
    state: 'Assam',
    options: [
      { value: 'Baksa, Assam', label: 'Baksa' },
      { value: 'Barpeta, Assam', label: 'Barpeta' },
      { value: 'Biswanath, Assam', label: 'Biswanath' },
      { value: 'Bongaigaon, Assam', label: 'Bongaigaon' },
      { value: 'Cachar, Assam', label: 'Cachar' },
      { value: 'Charaideo, Assam', label: 'Charaideo' },
      { value: 'Chirang, Assam', label: 'Chirang' },
      { value: 'Darrang, Assam', label: 'Darrang' },
      { value: 'Dhemaji, Assam', label: 'Dhemaji' },
      { value: 'Dhubri, Assam', label: 'Dhubri' },
      { value: 'Dibrugarh, Assam', label: 'Dibrugarh' },
      { value: 'Dima Hasao, Assam', label: 'Dima Hasao' },
      { value: 'Goalpara, Assam', label: 'Goalpara' },
      { value: 'Golaghat, Assam', label: 'Golaghat' },
      { value: 'Hailakandi, Assam', label: 'Hailakandi' },
      { value: 'Hojai, Assam', label: 'Hojai' },
      { value: 'Jorhat, Assam', label: 'Jorhat' },
      { value: 'Kamrup, Assam', label: 'Kamrup' },
      { value: 'Kamrup Metro, Assam', label: 'Kamrup Metro' },
      { value: 'Karbi Anglong, Assam', label: 'Karbi Anglong' },
      { value: 'Karimganj, Assam', label: 'Karimganj' },
      { value: 'Kokrajhar, Assam', label: 'Kokrajhar' },
      { value: 'Lakhimpur, Assam', label: 'Lakhimpur' },
      { value: 'Majuli, Assam', label: 'Majuli' },
      { value: 'Marigaon, Assam', label: 'Marigaon' },
      { value: 'Nagaon, Assam', label: 'Nagaon' },
      { value: 'Nalbari, Assam', label: 'Nalbari' },
      { value: 'Sivasagar, Assam', label: 'Sivasagar' },
      { value: 'Sonitpur, Assam', label: 'Sonitpur' },
      { value: 'South Salmara Mancachar, Assam', label: 'South Salmara Mancachar' },
      { value: 'Tinsukia, Assam', label: 'Tinsukia' },
      { value: 'Udalguri, Assam', label: 'Udalguri' },
      { value: 'West Karbi Anglong, Assam', label: 'West Karbi Anglong' },
    ],
  },
  {
    state: 'Bihar',
    options: [
      { value: 'Araria, Bihar', label: 'Araria' },
      { value: 'Arwal, Bihar', label: 'Arwal' },
      { value: 'Aurangabad, Bihar', label: 'Aurangabad' },
      { value: 'Banka, Bihar', label: 'Banka' },
      { value: 'Begusarai, Bihar', label: 'Begusarai' },
      { value: 'Bhagalpur, Bihar', label: 'Bhagalpur' },
      { value: 'Bhojpur, Bihar', label: 'Bhojpur' },
      { value: 'Buxar, Bihar', label: 'Buxar' },
      { value: 'Darbhanga, Bihar', label: 'Darbhanga' },
      { value: 'Gaya, Bihar', label: 'Gaya' },
      { value: 'Gopalganj, Bihar', label: 'Gopalganj' },
      { value: 'Jamui, Bihar', label: 'Jamui' },
      { value: 'Jehanabad, Bihar', label: 'Jehanabad' },
      { value: 'Kaimur (Bhabua), Bihar', label: 'Kaimur (Bhabua)' },
      { value: 'Katihar, Bihar', label: 'Katihar' },
      { value: 'Khagaria, Bihar', label: 'Khagaria' },
      { value: 'Kishanganj, Bihar', label: 'Kishanganj' },
      { value: 'Lakhisarai, Bihar', label: 'Lakhisarai' },
      { value: 'Madhepura, Bihar', label: 'Madhepura' },
      { value: 'Madhubani, Bihar', label: 'Madhubani' },
      { value: 'Munger, Bihar', label: 'Munger' },
      { value: 'Muzaffarpur, Bihar', label: 'Muzaffarpur' },
      { value: 'Nalanda, Bihar', label: 'Nalanda' },
      { value: 'Nawada, Bihar', label: 'Nawada' },
      { value: 'Pashchim Champaran, Bihar', label: 'Pashchim Champaran' },
      { value: 'Patna, Bihar', label: 'Patna' },
      { value: 'Purbi Champaran, Bihar', label: 'Purbi Champaran' },
      { value: 'Purnia, Bihar', label: 'Purnia' },
      { value: 'Rohtas, Bihar', label: 'Rohtas' },
      { value: 'Saharsa, Bihar', label: 'Saharsa' },
      { value: 'Samastipur, Bihar', label: 'Samastipur' },
      { value: 'Saran, Bihar', label: 'Saran' },
      { value: 'Sheikhpura, Bihar', label: 'Sheikhpura' },
      { value: 'Sheohar, Bihar', label: 'Sheohar' },
      { value: 'Sitamarhi, Bihar', label: 'Sitamarhi' },
      { value: 'Siwan, Bihar', label: 'Siwan' },
      { value: 'Supaul, Bihar', label: 'Supaul' },
      { value: 'Vaishali, Bihar', label: 'Vaishali' },
    ],
  },
  {
    state: 'Chandigarh',
    options: [
      { value: 'Chandigarh, Chandigarh', label: 'Chandigarh' },
    ],
  },
  {
    state: 'Chhattisgarh',
    options: [
      { value: 'Balod, Chhattisgarh', label: 'Balod' },
      { value: 'Baloda Bazar, Chhattisgarh', label: 'Baloda Bazar' },
      { value: 'Balrampur, Chhattisgarh', label: 'Balrampur' },
      { value: 'Bastar, Chhattisgarh', label: 'Bastar' },
      { value: 'Bemetara, Chhattisgarh', label: 'Bemetara' },
      { value: 'Bijapur, Chhattisgarh', label: 'Bijapur' },
      { value: 'Bilaspur, Chhattisgarh', label: 'Bilaspur' },
      { value: 'Dantewada, Chhattisgarh', label: 'Dantewada' },
      { value: 'Dhamtari, Chhattisgarh', label: 'Dhamtari' },
      { value: 'Durg, Chhattisgarh', label: 'Durg' },
      { value: 'Gariyaband, Chhattisgarh', label: 'Gariyaband' },
      { value: 'Gaurella Pendra Marwahi, Chhattisgarh', label: 'Gaurella Pendra Marwahi' },
      { value: 'Janjgir-Champa, Chhattisgarh', label: 'Janjgir-Champa' },
      { value: 'Jashpur, Chhattisgarh', label: 'Jashpur' },
      { value: 'Kabirdham, Chhattisgarh', label: 'Kabirdham' },
      { value: 'Kanker, Chhattisgarh', label: 'Kanker' },
      { value: 'Kondagaon, Chhattisgarh', label: 'Kondagaon' },
      { value: 'Korba, Chhattisgarh', label: 'Korba' },
      { value: 'Korea, Chhattisgarh', label: 'Korea' },
      { value: 'Mahasamund, Chhattisgarh', label: 'Mahasamund' },
      { value: 'Mungeli, Chhattisgarh', label: 'Mungeli' },
      { value: 'Narayanpur, Chhattisgarh', label: 'Narayanpur' },
      { value: 'Raigarh, Chhattisgarh', label: 'Raigarh' },
      { value: 'Raipur, Chhattisgarh', label: 'Raipur' },
      { value: 'Rajnandgaon, Chhattisgarh', label: 'Rajnandgaon' },
      { value: 'Sukma, Chhattisgarh', label: 'Sukma' },
      { value: 'Surajpur, Chhattisgarh', label: 'Surajpur' },
      { value: 'Surguja, Chhattisgarh', label: 'Surguja' },
    ],
  },
  {
    state: 'Delhi',
    options: [
      { value: 'Central, Delhi', label: 'Central' },
      { value: 'East, Delhi', label: 'East' },
      { value: 'New Delhi, Delhi', label: 'New Delhi' },
      { value: 'North, Delhi', label: 'North' },
      { value: 'North East, Delhi', label: 'North East' },
      { value: 'North West, Delhi', label: 'North West' },
      { value: 'Shahdara, Delhi', label: 'Shahdara' },
      { value: 'South, Delhi', label: 'South' },
      { value: 'South East, Delhi', label: 'South East' },
      { value: 'South West, Delhi', label: 'South West' },
      { value: 'West, Delhi', label: 'West' },
    ],
  },
  {
    state: 'Goa',
    options: [
      { value: 'North Goa, Goa', label: 'North Goa' },
      { value: 'South Goa, Goa', label: 'South Goa' },
    ],
  },
  {
    state: 'Gujarat',
    options: [
      { value: 'Ahmadabad, Gujarat', label: 'Ahmadabad' },
      { value: 'Amreli, Gujarat', label: 'Amreli' },
      { value: 'Anand, Gujarat', label: 'Anand' },
      { value: 'Arvalli, Gujarat', label: 'Arvalli' },
      { value: 'Banas Kantha, Gujarat', label: 'Banas Kantha' },
      { value: 'Bharuch, Gujarat', label: 'Bharuch' },
      { value: 'Bhavnagar, Gujarat', label: 'Bhavnagar' },
      { value: 'Botad, Gujarat', label: 'Botad' },
      { value: 'Chhotaudepur, Gujarat', label: 'Chhotaudepur' },
      { value: 'Dang, Gujarat', label: 'Dang' },
      { value: 'Devbhumi Dwarka, Gujarat', label: 'Devbhumi Dwarka' },
      { value: 'Dohad, Gujarat', label: 'Dohad' },
      { value: 'Gandhinagar, Gujarat', label: 'Gandhinagar' },
      { value: 'Gir Somnath, Gujarat', label: 'Gir Somnath' },
      { value: 'Jamnagar, Gujarat', label: 'Jamnagar' },
      { value: 'Junagadh, Gujarat', label: 'Junagadh' },
      { value: 'Kachchh, Gujarat', label: 'Kachchh' },
      { value: 'Kheda, Gujarat', label: 'Kheda' },
      { value: 'Mahesana, Gujarat', label: 'Mahesana' },
      { value: 'Mahisagar, Gujarat', label: 'Mahisagar' },
      { value: 'Morbi, Gujarat', label: 'Morbi' },
      { value: 'Narmada, Gujarat', label: 'Narmada' },
      { value: 'Navsari, Gujarat', label: 'Navsari' },
      { value: 'Panch Mahals, Gujarat', label: 'Panch Mahals' },
      { value: 'Patan, Gujarat', label: 'Patan' },
      { value: 'Porbandar, Gujarat', label: 'Porbandar' },
      { value: 'Rajkot, Gujarat', label: 'Rajkot' },
      { value: 'Sabar Kantha, Gujarat', label: 'Sabar Kantha' },
      { value: 'Surat, Gujarat', label: 'Surat' },
      { value: 'Surendranagar, Gujarat', label: 'Surendranagar' },
      { value: 'Tapi, Gujarat', label: 'Tapi' },
      { value: 'Vadodara, Gujarat', label: 'Vadodara' },
      { value: 'Valsad, Gujarat', label: 'Valsad' },
    ],
  },
  {
    state: 'Haryana',
    options: [
      { value: 'Ambala, Haryana', label: 'Ambala' },
      { value: 'Bhiwani, Haryana', label: 'Bhiwani' },
      { value: 'Charki Dadri, Haryana', label: 'Charki Dadri' },
      { value: 'Faridabad, Haryana', label: 'Faridabad' },
      { value: 'Fatehabad, Haryana', label: 'Fatehabad' },
      { value: 'Gurugram, Haryana', label: 'Gurugram' },
      { value: 'Hisar, Haryana', label: 'Hisar' },
      { value: 'Jhajjar, Haryana', label: 'Jhajjar' },
      { value: 'Jind, Haryana', label: 'Jind' },
      { value: 'Kaithal, Haryana', label: 'Kaithal' },
      { value: 'Karnal, Haryana', label: 'Karnal' },
      { value: 'Kurukshetra, Haryana', label: 'Kurukshetra' },
      { value: 'Mahendragarh, Haryana', label: 'Mahendragarh' },
      { value: 'Nuh, Haryana', label: 'Nuh' },
      { value: 'Palwal, Haryana', label: 'Palwal' },
      { value: 'Panchkula, Haryana', label: 'Panchkula' },
      { value: 'Panipat, Haryana', label: 'Panipat' },
      { value: 'Rewari, Haryana', label: 'Rewari' },
      { value: 'Rohtak, Haryana', label: 'Rohtak' },
      { value: 'Sirsa, Haryana', label: 'Sirsa' },
      { value: 'Sonipat, Haryana', label: 'Sonipat' },
      { value: 'Yamunanagar, Haryana', label: 'Yamunanagar' },
    ],
  },
  {
    state: 'Himachal Pradesh',
    options: [
      { value: 'Bilaspur, Himachal Pradesh', label: 'Bilaspur' },
      { value: 'Chamba, Himachal Pradesh', label: 'Chamba' },
      { value: 'Hamirpur, Himachal Pradesh', label: 'Hamirpur' },
      { value: 'Kangra, Himachal Pradesh', label: 'Kangra' },
      { value: 'Kinnaur, Himachal Pradesh', label: 'Kinnaur' },
      { value: 'Kullu, Himachal Pradesh', label: 'Kullu' },
      { value: 'Lahul And Spiti, Himachal Pradesh', label: 'Lahul And Spiti' },
      { value: 'Mandi, Himachal Pradesh', label: 'Mandi' },
      { value: 'Shimla, Himachal Pradesh', label: 'Shimla' },
      { value: 'Sirmaur, Himachal Pradesh', label: 'Sirmaur' },
      { value: 'Solan, Himachal Pradesh', label: 'Solan' },
      { value: 'Una, Himachal Pradesh', label: 'Una' },
    ],
  },
  {
    state: 'Jammu And Kashmir',
    options: [
      { value: 'Anantnag, Jammu And Kashmir', label: 'Anantnag' },
      { value: 'Bandipora, Jammu And Kashmir', label: 'Bandipora' },
      { value: 'Baramulla, Jammu And Kashmir', label: 'Baramulla' },
      { value: 'Budgam, Jammu And Kashmir', label: 'Budgam' },
      { value: 'Doda, Jammu And Kashmir', label: 'Doda' },
      { value: 'Ganderbal, Jammu And Kashmir', label: 'Ganderbal' },
      { value: 'Jammu, Jammu And Kashmir', label: 'Jammu' },
      { value: 'Kathua, Jammu And Kashmir', label: 'Kathua' },
      { value: 'Kishtwar, Jammu And Kashmir', label: 'Kishtwar' },
      { value: 'Kulgam, Jammu And Kashmir', label: 'Kulgam' },
      { value: 'Kupwara, Jammu And Kashmir', label: 'Kupwara' },
      { value: 'Poonch, Jammu And Kashmir', label: 'Poonch' },
      { value: 'Pulwama, Jammu And Kashmir', label: 'Pulwama' },
      { value: 'Rajouri, Jammu And Kashmir', label: 'Rajouri' },
      { value: 'Ramban, Jammu And Kashmir', label: 'Ramban' },
      { value: 'Reasi, Jammu And Kashmir', label: 'Reasi' },
      { value: 'Samba, Jammu And Kashmir', label: 'Samba' },
      { value: 'Shopian, Jammu And Kashmir', label: 'Shopian' },
      { value: 'Srinagar, Jammu And Kashmir', label: 'Srinagar' },
      { value: 'Udhampur, Jammu And Kashmir', label: 'Udhampur' },
    ],
  },
  {
    state: 'Jharkhand',
    options: [
      { value: 'Bokaro, Jharkhand', label: 'Bokaro' },
      { value: 'Chatra, Jharkhand', label: 'Chatra' },
      { value: 'Deoghar, Jharkhand', label: 'Deoghar' },
      { value: 'Dhanbad, Jharkhand', label: 'Dhanbad' },
      { value: 'Dumka, Jharkhand', label: 'Dumka' },
      { value: 'East Singhbum, Jharkhand', label: 'East Singhbum' },
      { value: 'Garhwa, Jharkhand', label: 'Garhwa' },
      { value: 'Giridih, Jharkhand', label: 'Giridih' },
      { value: 'Godda, Jharkhand', label: 'Godda' },
      { value: 'Gumla, Jharkhand', label: 'Gumla' },
      { value: 'Hazaribagh, Jharkhand', label: 'Hazaribagh' },
      { value: 'Jamtara, Jharkhand', label: 'Jamtara' },
      { value: 'Khunti, Jharkhand', label: 'Khunti' },
      { value: 'Koderma, Jharkhand', label: 'Koderma' },
      { value: 'Latehar, Jharkhand', label: 'Latehar' },
      { value: 'Lohardaga, Jharkhand', label: 'Lohardaga' },
      { value: 'Pakur, Jharkhand', label: 'Pakur' },
      { value: 'Palamu, Jharkhand', label: 'Palamu' },
      { value: 'Ramgarh, Jharkhand', label: 'Ramgarh' },
      { value: 'Ranchi, Jharkhand', label: 'Ranchi' },
      { value: 'Sahebganj, Jharkhand', label: 'Sahebganj' },
      { value: 'Saraikela Kharsawan, Jharkhand', label: 'Saraikela Kharsawan' },
      { value: 'Simdega, Jharkhand', label: 'Simdega' },
      { value: 'West Singhbhum, Jharkhand', label: 'West Singhbhum' },
    ],
  },
  {
    state: 'Karnataka',
    options: [
      { value: 'Bagalkote, Karnataka', label: 'Bagalkote' },
      { value: 'Ballari, Karnataka', label: 'Ballari' },
      { value: 'Belagavi, Karnataka', label: 'Belagavi' },
      { value: 'Bengaluru Rural, Karnataka', label: 'Bengaluru Rural' },
      { value: 'Bengaluru Urban, Karnataka', label: 'Bengaluru Urban' },
      { value: 'Bidar, Karnataka', label: 'Bidar' },
      { value: 'Chamarajanagara, Karnataka', label: 'Chamarajanagara' },
      { value: 'Chikkaballapura, Karnataka', label: 'Chikkaballapura' },
      { value: 'Chikkamagaluru, Karnataka', label: 'Chikkamagaluru' },
      { value: 'Chitradurga, Karnataka', label: 'Chitradurga' },
      { value: 'Dakshina Kannada, Karnataka', label: 'Dakshina Kannada' },
      { value: 'Davangere, Karnataka', label: 'Davangere' },
      { value: 'Dharwad, Karnataka', label: 'Dharwad' },
      { value: 'Gadag, Karnataka', label: 'Gadag' },
      { value: 'Hassan, Karnataka', label: 'Hassan' },
      { value: 'Haveri, Karnataka', label: 'Haveri' },
      { value: 'Kalaburagi, Karnataka', label: 'Kalaburagi' },
      { value: 'Kodagu, Karnataka', label: 'Kodagu' },
      { value: 'Kolar, Karnataka', label: 'Kolar' },
      { value: 'Koppal, Karnataka', label: 'Koppal' },
      { value: 'Mandya, Karnataka', label: 'Mandya' },
      { value: 'Mysuru, Karnataka', label: 'Mysuru' },
      { value: 'Raichur, Karnataka', label: 'Raichur' },
      { value: 'Ramanagara, Karnataka', label: 'Ramanagara' },
      { value: 'Shivamogga, Karnataka', label: 'Shivamogga' },
      { value: 'Tumakuru, Karnataka', label: 'Tumakuru' },
      { value: 'Udupi, Karnataka', label: 'Udupi' },
      { value: 'Uttara Kannada, Karnataka', label: 'Uttara Kannada' },
      { value: 'Vijayapura, Karnataka', label: 'Vijayapura' },
      { value: 'Yadgir, Karnataka', label: 'Yadgir' },
    ],
  },
  {
    state: 'Kerala',
    options: [
      { value: 'Alappuzha, Kerala', label: 'Alappuzha' },
      { value: 'Ernakulam, Kerala', label: 'Ernakulam' },
      { value: 'Idukki, Kerala', label: 'Idukki' },
      { value: 'Kannur, Kerala', label: 'Kannur' },
      { value: 'Kasaragod, Kerala', label: 'Kasaragod' },
      { value: 'Kollam, Kerala', label: 'Kollam' },
      { value: 'Kottayam, Kerala', label: 'Kottayam' },
      { value: 'Kozhikode, Kerala', label: 'Kozhikode' },
      { value: 'Malappuram, Kerala', label: 'Malappuram' },
      { value: 'Palakkad, Kerala', label: 'Palakkad' },
      { value: 'Pathanamthitta, Kerala', label: 'Pathanamthitta' },
      { value: 'Thiruvananthapuram, Kerala', label: 'Thiruvananthapuram' },
      { value: 'Thrissur, Kerala', label: 'Thrissur' },
      { value: 'Wayanad, Kerala', label: 'Wayanad' },
    ],
  },
  {
    state: 'Ladakh',
    options: [
      { value: 'Kargil, Ladakh', label: 'Kargil' },
      { value: 'Leh Ladakh, Ladakh', label: 'Leh Ladakh' },
    ],
  },
  {
    state: 'Lakshadweep',
    options: [
      { value: 'Lakshadweep District, Lakshadweep', label: 'Lakshadweep District' },
    ],
  },
  {
    state: 'Madhya Pradesh',
    options: [
      { value: 'Agar Malwa, Madhya Pradesh', label: 'Agar Malwa' },
      { value: 'Alirajpur, Madhya Pradesh', label: 'Alirajpur' },
      { value: 'Anuppur, Madhya Pradesh', label: 'Anuppur' },
      { value: 'Ashoknagar, Madhya Pradesh', label: 'Ashoknagar' },
      { value: 'Balaghat, Madhya Pradesh', label: 'Balaghat' },
      { value: 'Barwani, Madhya Pradesh', label: 'Barwani' },
      { value: 'Betul, Madhya Pradesh', label: 'Betul' },
      { value: 'Bhind, Madhya Pradesh', label: 'Bhind' },
      { value: 'Bhopal, Madhya Pradesh', label: 'Bhopal' },
      { value: 'Burhanpur, Madhya Pradesh', label: 'Burhanpur' },
      { value: 'Chhatarpur, Madhya Pradesh', label: 'Chhatarpur' },
      { value: 'Chhindwara, Madhya Pradesh', label: 'Chhindwara' },
      { value: 'Damoh, Madhya Pradesh', label: 'Damoh' },
      { value: 'Datia, Madhya Pradesh', label: 'Datia' },
      { value: 'Dewas, Madhya Pradesh', label: 'Dewas' },
      { value: 'Dhar, Madhya Pradesh', label: 'Dhar' },
      { value: 'Dindori, Madhya Pradesh', label: 'Dindori' },
      { value: 'East Nimar, Madhya Pradesh', label: 'East Nimar' },
      { value: 'Guna, Madhya Pradesh', label: 'Guna' },
      { value: 'Gwalior, Madhya Pradesh', label: 'Gwalior' },
      { value: 'Harda, Madhya Pradesh', label: 'Harda' },
      { value: 'Hoshangabad, Madhya Pradesh', label: 'Hoshangabad' },
      { value: 'Indore, Madhya Pradesh', label: 'Indore' },
      { value: 'Jabalpur, Madhya Pradesh', label: 'Jabalpur' },
      { value: 'Jhabua, Madhya Pradesh', label: 'Jhabua' },
      { value: 'Katni, Madhya Pradesh', label: 'Katni' },
      { value: 'Khargone, Madhya Pradesh', label: 'Khargone' },
      { value: 'Mandla, Madhya Pradesh', label: 'Mandla' },
      { value: 'Mandsaur, Madhya Pradesh', label: 'Mandsaur' },
      { value: 'Morena, Madhya Pradesh', label: 'Morena' },
      { value: 'Narsinghpur, Madhya Pradesh', label: 'Narsinghpur' },
      { value: 'Neemuch, Madhya Pradesh', label: 'Neemuch' },
      { value: 'Niwari, Madhya Pradesh', label: 'Niwari' },
      { value: 'Panna, Madhya Pradesh', label: 'Panna' },
      { value: 'Raisen, Madhya Pradesh', label: 'Raisen' },
      { value: 'Rajgarh, Madhya Pradesh', label: 'Rajgarh' },
      { value: 'Ratlam, Madhya Pradesh', label: 'Ratlam' },
      { value: 'Rewa, Madhya Pradesh', label: 'Rewa' },
      { value: 'Sagar, Madhya Pradesh', label: 'Sagar' },
      { value: 'Satna, Madhya Pradesh', label: 'Satna' },
      { value: 'Sehore, Madhya Pradesh', label: 'Sehore' },
      { value: 'Seoni, Madhya Pradesh', label: 'Seoni' },
      { value: 'Shahdol, Madhya Pradesh', label: 'Shahdol' },
      { value: 'Shajapur, Madhya Pradesh', label: 'Shajapur' },
      { value: 'Sheopur, Madhya Pradesh', label: 'Sheopur' },
      { value: 'Shivpuri, Madhya Pradesh', label: 'Shivpuri' },
      { value: 'Sidhi, Madhya Pradesh', label: 'Sidhi' },
      { value: 'Singrauli, Madhya Pradesh', label: 'Singrauli' },
      { value: 'Tikamgarh, Madhya Pradesh', label: 'Tikamgarh' },
      { value: 'Ujjain, Madhya Pradesh', label: 'Ujjain' },
      { value: 'Umaria, Madhya Pradesh', label: 'Umaria' },
      { value: 'Vidisha, Madhya Pradesh', label: 'Vidisha' },
    ],
  },
  {
    state: 'Maharashtra',
    options: [
      { value: 'Ahmednagar, Maharashtra', label: 'Ahmednagar' },
      { value: 'Akola, Maharashtra', label: 'Akola' },
      { value: 'Amravati, Maharashtra', label: 'Amravati' },
      { value: 'Aurangabad, Maharashtra', label: 'Aurangabad' },
      { value: 'Beed, Maharashtra', label: 'Beed' },
      { value: 'Bhandara, Maharashtra', label: 'Bhandara' },
      { value: 'Buldhana, Maharashtra', label: 'Buldhana' },
      { value: 'Chandrapur, Maharashtra', label: 'Chandrapur' },
      { value: 'Dhule, Maharashtra', label: 'Dhule' },
      { value: 'Gadchiroli, Maharashtra', label: 'Gadchiroli' },
      { value: 'Gondia, Maharashtra', label: 'Gondia' },
      { value: 'Hingoli, Maharashtra', label: 'Hingoli' },
      { value: 'Jalgaon, Maharashtra', label: 'Jalgaon' },
      { value: 'Jalna, Maharashtra', label: 'Jalna' },
      { value: 'Kolhapur, Maharashtra', label: 'Kolhapur' },
      { value: 'Latur, Maharashtra', label: 'Latur' },
      { value: 'Mumbai, Maharashtra', label: 'Mumbai' },
      { value: 'Mumbai Suburban, Maharashtra', label: 'Mumbai Suburban' },
      { value: 'Nagpur, Maharashtra', label: 'Nagpur' },
      { value: 'Nanded, Maharashtra', label: 'Nanded' },
      { value: 'Nandurbar, Maharashtra', label: 'Nandurbar' },
      { value: 'Nashik, Maharashtra', label: 'Nashik' },
      { value: 'Osmanabad, Maharashtra', label: 'Osmanabad' },
      { value: 'Palghar, Maharashtra', label: 'Palghar' },
      { value: 'Parbhani, Maharashtra', label: 'Parbhani' },
      { value: 'Pune, Maharashtra', label: 'Pune' },
      { value: 'Raigad, Maharashtra', label: 'Raigad' },
      { value: 'Ratnagiri, Maharashtra', label: 'Ratnagiri' },
      { value: 'Sangli, Maharashtra', label: 'Sangli' },
      { value: 'Satara, Maharashtra', label: 'Satara' },
      { value: 'Sindhudurg, Maharashtra', label: 'Sindhudurg' },
      { value: 'Solapur, Maharashtra', label: 'Solapur' },
      { value: 'Thane, Maharashtra', label: 'Thane' },
      { value: 'Wardha, Maharashtra', label: 'Wardha' },
      { value: 'Washim, Maharashtra', label: 'Washim' },
      { value: 'Yavatmal, Maharashtra', label: 'Yavatmal' },
    ],
  },
  {
    state: 'Manipur',
    options: [
      { value: 'Bishnupur, Manipur', label: 'Bishnupur' },
      { value: 'Chandel, Manipur', label: 'Chandel' },
      { value: 'Churachandpur, Manipur', label: 'Churachandpur' },
      { value: 'Imphal East, Manipur', label: 'Imphal East' },
      { value: 'Imphal West, Manipur', label: 'Imphal West' },
      { value: 'Jiribam, Manipur', label: 'Jiribam' },
      { value: 'Kakching, Manipur', label: 'Kakching' },
      { value: 'Kamjong, Manipur', label: 'Kamjong' },
      { value: 'Kangpokpi, Manipur', label: 'Kangpokpi' },
      { value: 'Noney, Manipur', label: 'Noney' },
      { value: 'Pherzawl, Manipur', label: 'Pherzawl' },
      { value: 'Senapati, Manipur', label: 'Senapati' },
      { value: 'Tamenglong, Manipur', label: 'Tamenglong' },
      { value: 'Tengnoupal, Manipur', label: 'Tengnoupal' },
      { value: 'Thoubal, Manipur', label: 'Thoubal' },
      { value: 'Ukhrul, Manipur', label: 'Ukhrul' },
    ],
  },
  {
    state: 'Meghalaya',
    options: [
      { value: 'East Garo Hills, Meghalaya', label: 'East Garo Hills' },
      { value: 'East Jaintia Hills, Meghalaya', label: 'East Jaintia Hills' },
      { value: 'East Khasi Hills, Meghalaya', label: 'East Khasi Hills' },
      { value: 'North Garo Hills, Meghalaya', label: 'North Garo Hills' },
      { value: 'Ri Bhoi, Meghalaya', label: 'Ri Bhoi' },
      { value: 'South Garo Hills, Meghalaya', label: 'South Garo Hills' },
      { value: 'South West Garo Hills, Meghalaya', label: 'South West Garo Hills' },
      { value: 'South West Khasi Hills, Meghalaya', label: 'South West Khasi Hills' },
      { value: 'West Garo Hills, Meghalaya', label: 'West Garo Hills' },
      { value: 'West Jaintia Hills, Meghalaya', label: 'West Jaintia Hills' },
      { value: 'West Khasi Hills, Meghalaya', label: 'West Khasi Hills' },
    ],
  },
  {
    state: 'Mizoram',
    options: [
      { value: 'Aizawl, Mizoram', label: 'Aizawl' },
      { value: 'Champhai, Mizoram', label: 'Champhai' },
      { value: 'Hnahthial, Mizoram', label: 'Hnahthial' },
      { value: 'Khawzawl, Mizoram', label: 'Khawzawl' },
      { value: 'Kolasib, Mizoram', label: 'Kolasib' },
      { value: 'Lawngtlai, Mizoram', label: 'Lawngtlai' },
      { value: 'Lunglei, Mizoram', label: 'Lunglei' },
      { value: 'Mamit, Mizoram', label: 'Mamit' },
      { value: 'Saiha, Mizoram', label: 'Saiha' },
      { value: 'Saitual, Mizoram', label: 'Saitual' },
      { value: 'Serchhip, Mizoram', label: 'Serchhip' },
    ],
  },
  {
    state: 'Nagaland',
    options: [
      { value: 'Dimapur, Nagaland', label: 'Dimapur' },
      { value: 'Kiphire, Nagaland', label: 'Kiphire' },
      { value: 'Kohima, Nagaland', label: 'Kohima' },
      { value: 'Longleng, Nagaland', label: 'Longleng' },
      { value: 'Mokokchung, Nagaland', label: 'Mokokchung' },
      { value: 'Mon, Nagaland', label: 'Mon' },
      { value: 'Noklak, Nagaland', label: 'Noklak' },
      { value: 'Peren, Nagaland', label: 'Peren' },
      { value: 'Phek, Nagaland', label: 'Phek' },
      { value: 'Tuensang, Nagaland', label: 'Tuensang' },
      { value: 'Wokha, Nagaland', label: 'Wokha' },
      { value: 'Zunheboto, Nagaland', label: 'Zunheboto' },
    ],
  },
  {
    state: 'Odisha',
    options: [
      { value: 'Anugul, Odisha', label: 'Anugul' },
      { value: 'Balangir, Odisha', label: 'Balangir' },
      { value: 'Baleshwar, Odisha', label: 'Baleshwar' },
      { value: 'Bargarh, Odisha', label: 'Bargarh' },
      { value: 'Bhadrak, Odisha', label: 'Bhadrak' },
      { value: 'Boudh, Odisha', label: 'Boudh' },
      { value: 'Cuttack, Odisha', label: 'Cuttack' },
      { value: 'Deogarh, Odisha', label: 'Deogarh' },
      { value: 'Dhenkanal, Odisha', label: 'Dhenkanal' },
      { value: 'Gajapati, Odisha', label: 'Gajapati' },
      { value: 'Ganjam, Odisha', label: 'Ganjam' },
      { value: 'Jagatsinghapur, Odisha', label: 'Jagatsinghapur' },
      { value: 'Jajapur, Odisha', label: 'Jajapur' },
      { value: 'Jharsuguda, Odisha', label: 'Jharsuguda' },
      { value: 'Kalahandi, Odisha', label: 'Kalahandi' },
      { value: 'Kandhamal, Odisha', label: 'Kandhamal' },
      { value: 'Kendrapara, Odisha', label: 'Kendrapara' },
      { value: 'Kendujhar, Odisha', label: 'Kendujhar' },
      { value: 'Khordha, Odisha', label: 'Khordha' },
      { value: 'Koraput, Odisha', label: 'Koraput' },
      { value: 'Malkangiri, Odisha', label: 'Malkangiri' },
      { value: 'Mayurbhanj, Odisha', label: 'Mayurbhanj' },
      { value: 'Nabarangpur, Odisha', label: 'Nabarangpur' },
      { value: 'Nayagarh, Odisha', label: 'Nayagarh' },
      { value: 'Nuapada, Odisha', label: 'Nuapada' },
      { value: 'Puri, Odisha', label: 'Puri' },
      { value: 'Rayagada, Odisha', label: 'Rayagada' },
      { value: 'Sambalpur, Odisha', label: 'Sambalpur' },
      { value: 'Sonepur, Odisha', label: 'Sonepur' },
      { value: 'Sundargarh, Odisha', label: 'Sundargarh' },
    ],
  },
  {
    state: 'Puducherry',
    options: [
      { value: 'Karaikal, Puducherry', label: 'Karaikal' },
      { value: 'Mahe, Puducherry', label: 'Mahe' },
      { value: 'Pondicherry, Puducherry', label: 'Pondicherry' },
      { value: 'Yanam, Puducherry', label: 'Yanam' },
    ],
  },
  {
    state: 'Punjab',
    options: [
      { value: 'Amritsar, Punjab', label: 'Amritsar' },
      { value: 'Barnala, Punjab', label: 'Barnala' },
      { value: 'Bathinda, Punjab', label: 'Bathinda' },
      { value: 'Faridkot, Punjab', label: 'Faridkot' },
      { value: 'Fatehgarh Sahib, Punjab', label: 'Fatehgarh Sahib' },
      { value: 'Fazilka, Punjab', label: 'Fazilka' },
      { value: 'Firozepur, Punjab', label: 'Firozepur' },
      { value: 'Gurdaspur, Punjab', label: 'Gurdaspur' },
      { value: 'Hoshiarpur, Punjab', label: 'Hoshiarpur' },
      { value: 'Jalandhar, Punjab', label: 'Jalandhar' },
      { value: 'Kapurthala, Punjab', label: 'Kapurthala' },
      { value: 'Ludhiana, Punjab', label: 'Ludhiana' },
      { value: 'Malerkotla, Punjab', label: 'Malerkotla' },
      { value: 'Mansa, Punjab', label: 'Mansa' },
      { value: 'Moga, Punjab', label: 'Moga' },
      { value: 'Pathankot, Punjab', label: 'Pathankot' },
      { value: 'Patiala, Punjab', label: 'Patiala' },
      { value: 'Rupnagar, Punjab', label: 'Rupnagar' },
      { value: 'S.A.S Nagar, Punjab', label: 'S.A.S Nagar' },
      { value: 'Sangrur, Punjab', label: 'Sangrur' },
      { value: 'Shahid Bhagat Singh Nagar, Punjab', label: 'Shahid Bhagat Singh Nagar' },
      { value: 'Sri Muktsar Sahib, Punjab', label: 'Sri Muktsar Sahib' },
      { value: 'Tarn Taran, Punjab', label: 'Tarn Taran' },
    ],
  },
  {
    state: 'Rajasthan',
    options: [
      { value: 'Ajmer, Rajasthan', label: 'Ajmer' },
      { value: 'Alwar, Rajasthan', label: 'Alwar' },
      { value: 'Banswara, Rajasthan', label: 'Banswara' },
      { value: 'Baran, Rajasthan', label: 'Baran' },
      { value: 'Barmer, Rajasthan', label: 'Barmer' },
      { value: 'Bharatpur, Rajasthan', label: 'Bharatpur' },
      { value: 'Bhilwara, Rajasthan', label: 'Bhilwara' },
      { value: 'Bikaner, Rajasthan', label: 'Bikaner' },
      { value: 'Bundi, Rajasthan', label: 'Bundi' },
      { value: 'Chittorgarh, Rajasthan', label: 'Chittorgarh' },
      { value: 'Churu, Rajasthan', label: 'Churu' },
      { value: 'Dausa, Rajasthan', label: 'Dausa' },
      { value: 'Dholpur, Rajasthan', label: 'Dholpur' },
      { value: 'Dungarpur, Rajasthan', label: 'Dungarpur' },
      { value: 'Ganganagar, Rajasthan', label: 'Ganganagar' },
      { value: 'Hanumangarh, Rajasthan', label: 'Hanumangarh' },
      { value: 'Jaipur, Rajasthan', label: 'Jaipur' },
      { value: 'Jaisalmer, Rajasthan', label: 'Jaisalmer' },
      { value: 'Jalore, Rajasthan', label: 'Jalore' },
      { value: 'Jhalawar, Rajasthan', label: 'Jhalawar' },
      { value: 'Jhunjhunu, Rajasthan', label: 'Jhunjhunu' },
      { value: 'Jodhpur, Rajasthan', label: 'Jodhpur' },
      { value: 'Karauli, Rajasthan', label: 'Karauli' },
      { value: 'Kota, Rajasthan', label: 'Kota' },
      { value: 'Nagaur, Rajasthan', label: 'Nagaur' },
      { value: 'Pali, Rajasthan', label: 'Pali' },
      { value: 'Pratapgarh, Rajasthan', label: 'Pratapgarh' },
      { value: 'Rajsamand, Rajasthan', label: 'Rajsamand' },
      { value: 'Sawai Madhopur, Rajasthan', label: 'Sawai Madhopur' },
      { value: 'Sikar, Rajasthan', label: 'Sikar' },
      { value: 'Sirohi, Rajasthan', label: 'Sirohi' },
      { value: 'Tonk, Rajasthan', label: 'Tonk' },
      { value: 'Udaipur, Rajasthan', label: 'Udaipur' },
    ],
  },
  {
    state: 'Sikkim',
    options: [
      { value: 'East District, Sikkim', label: 'East District' },
      { value: 'North District, Sikkim', label: 'North District' },
      { value: 'South District, Sikkim', label: 'South District' },
      { value: 'West District, Sikkim', label: 'West District' },
    ],
  },
  {
    state: 'Tamil Nadu',
    options: [
      { value: 'Ariyalur, Tamil Nadu', label: 'Ariyalur' },
      { value: 'Chengalpattu, Tamil Nadu', label: 'Chengalpattu' },
      { value: 'Chennai, Tamil Nadu', label: 'Chennai' },
      { value: 'Coimbatore, Tamil Nadu', label: 'Coimbatore' },
      { value: 'Cuddalore, Tamil Nadu', label: 'Cuddalore' },
      { value: 'Dharmapuri, Tamil Nadu', label: 'Dharmapuri' },
      { value: 'Dindigul, Tamil Nadu', label: 'Dindigul' },
      { value: 'Erode, Tamil Nadu', label: 'Erode' },
      { value: 'Kallakurichi, Tamil Nadu', label: 'Kallakurichi' },
      { value: 'Kanchipuram, Tamil Nadu', label: 'Kanchipuram' },
      { value: 'Kanniyakumari, Tamil Nadu', label: 'Kanniyakumari' },
      { value: 'Karur, Tamil Nadu', label: 'Karur' },
      { value: 'Krishnagiri, Tamil Nadu', label: 'Krishnagiri' },
      { value: 'Madurai, Tamil Nadu', label: 'Madurai' },
      { value: 'Mayiladuthurai, Tamil Nadu', label: 'Mayiladuthurai' },
      { value: 'Nagapattinam, Tamil Nadu', label: 'Nagapattinam' },
      { value: 'Namakkal, Tamil Nadu', label: 'Namakkal' },
      { value: 'Perambalur, Tamil Nadu', label: 'Perambalur' },
      { value: 'Pudukkottai, Tamil Nadu', label: 'Pudukkottai' },
      { value: 'Ramanathapuram, Tamil Nadu', label: 'Ramanathapuram' },
      { value: 'Ranipet, Tamil Nadu', label: 'Ranipet' },
      { value: 'Salem, Tamil Nadu', label: 'Salem' },
      { value: 'Sivaganga, Tamil Nadu', label: 'Sivaganga' },
      { value: 'Tenkasi, Tamil Nadu', label: 'Tenkasi' },
      { value: 'Thanjavur, Tamil Nadu', label: 'Thanjavur' },
      { value: 'The Nilgiris, Tamil Nadu', label: 'The Nilgiris' },
      { value: 'Theni, Tamil Nadu', label: 'Theni' },
      { value: 'Thiruvallur, Tamil Nadu', label: 'Thiruvallur' },
      { value: 'Thiruvarur, Tamil Nadu', label: 'Thiruvarur' },
      { value: 'Tiruchirappalli, Tamil Nadu', label: 'Tiruchirappalli' },
      { value: 'Tirunelveli, Tamil Nadu', label: 'Tirunelveli' },
      { value: 'Tirupathur, Tamil Nadu', label: 'Tirupathur' },
      { value: 'Tiruppur, Tamil Nadu', label: 'Tiruppur' },
      { value: 'Tiruvannamalai, Tamil Nadu', label: 'Tiruvannamalai' },
      { value: 'Tuticorin, Tamil Nadu', label: 'Tuticorin' },
      { value: 'Vellore, Tamil Nadu', label: 'Vellore' },
      { value: 'Villupuram, Tamil Nadu', label: 'Villupuram' },
      { value: 'Virudhunagar, Tamil Nadu', label: 'Virudhunagar' },
    ],
  },
  {
    state: 'Telangana',
    options: [
      { value: 'Adilabad, Telangana', label: 'Adilabad' },
      { value: 'Bhadradri Kothagudem, Telangana', label: 'Bhadradri Kothagudem' },
      { value: 'Hyderabad, Telangana', label: 'Hyderabad' },
      { value: 'Jagitial, Telangana', label: 'Jagitial' },
      { value: 'Jangoan, Telangana', label: 'Jangoan' },
      { value: 'Jayashankar Bhupalapally, Telangana', label: 'Jayashankar Bhupalapally' },
      { value: 'Jogulamba Gadwal, Telangana', label: 'Jogulamba Gadwal' },
      { value: 'Kamareddy, Telangana', label: 'Kamareddy' },
      { value: 'Karimnagar, Telangana', label: 'Karimnagar' },
      { value: 'Khammam, Telangana', label: 'Khammam' },
      { value: 'Kumuram Bheem Asifabad, Telangana', label: 'Kumuram Bheem Asifabad' },
      { value: 'Mahabubabad, Telangana', label: 'Mahabubabad' },
      { value: 'Mahabubnagar, Telangana', label: 'Mahabubnagar' },
      { value: 'Mancherial, Telangana', label: 'Mancherial' },
      { value: 'Medak, Telangana', label: 'Medak' },
      { value: 'Medchal Malkajgiri, Telangana', label: 'Medchal Malkajgiri' },
      { value: 'Mulugu, Telangana', label: 'Mulugu' },
      { value: 'Nagarkurnool, Telangana', label: 'Nagarkurnool' },
      { value: 'Nalgonda, Telangana', label: 'Nalgonda' },
      { value: 'Narayanpet, Telangana', label: 'Narayanpet' },
      { value: 'Nirmal, Telangana', label: 'Nirmal' },
      { value: 'Nizamabad, Telangana', label: 'Nizamabad' },
      { value: 'Peddapalli, Telangana', label: 'Peddapalli' },
      { value: 'Rajanna Sircilla, Telangana', label: 'Rajanna Sircilla' },
      { value: 'Ranga Reddy, Telangana', label: 'Ranga Reddy' },
      { value: 'Sangareddy, Telangana', label: 'Sangareddy' },
      { value: 'Siddipet, Telangana', label: 'Siddipet' },
      { value: 'Suryapet, Telangana', label: 'Suryapet' },
      { value: 'Vikarabad, Telangana', label: 'Vikarabad' },
      { value: 'Wanaparthy, Telangana', label: 'Wanaparthy' },
      { value: 'Warangal Rural, Telangana', label: 'Warangal Rural' },
      { value: 'Warangal Urban, Telangana', label: 'Warangal Urban' },
      { value: 'Yadadri Bhuvanagiri, Telangana', label: 'Yadadri Bhuvanagiri' },
    ],
  },
  {
    state: 'The Dadra And Nagar Haveli And Daman And Diu',
    options: [
      { value: 'Dadra And Nagar Haveli, The Dadra And Nagar Haveli And Daman And Diu', label: 'Dadra And Nagar Haveli' },
      { value: 'Daman, The Dadra And Nagar Haveli And Daman And Diu', label: 'Daman' },
      { value: 'Diu, The Dadra And Nagar Haveli And Daman And Diu', label: 'Diu' },
    ],
  },
  {
    state: 'Tripura',
    options: [
      { value: 'Dhalai, Tripura', label: 'Dhalai' },
      { value: 'Gomati, Tripura', label: 'Gomati' },
      { value: 'Khowai, Tripura', label: 'Khowai' },
      { value: 'North Tripura, Tripura', label: 'North Tripura' },
      { value: 'Sepahijala, Tripura', label: 'Sepahijala' },
      { value: 'South Tripura, Tripura', label: 'South Tripura' },
      { value: 'Unakoti, Tripura', label: 'Unakoti' },
      { value: 'West Tripura, Tripura', label: 'West Tripura' },
    ],
  },
  {
    state: 'Uttar Pradesh',
    options: [
      { value: 'Agra, Uttar Pradesh', label: 'Agra' },
      { value: 'Aligarh, Uttar Pradesh', label: 'Aligarh' },
      { value: 'Ambedkar Nagar, Uttar Pradesh', label: 'Ambedkar Nagar' },
      { value: 'Amethi, Uttar Pradesh', label: 'Amethi' },
      { value: 'Amroha, Uttar Pradesh', label: 'Amroha' },
      { value: 'Auraiya, Uttar Pradesh', label: 'Auraiya' },
      { value: 'Ayodhya, Uttar Pradesh', label: 'Ayodhya' },
      { value: 'Azamgarh, Uttar Pradesh', label: 'Azamgarh' },
      { value: 'Baghpat, Uttar Pradesh', label: 'Baghpat' },
      { value: 'Bahraich, Uttar Pradesh', label: 'Bahraich' },
      { value: 'Ballia, Uttar Pradesh', label: 'Ballia' },
      { value: 'Balrampur, Uttar Pradesh', label: 'Balrampur' },
      { value: 'Banda, Uttar Pradesh', label: 'Banda' },
      { value: 'Barabanki, Uttar Pradesh', label: 'Barabanki' },
      { value: 'Bareilly, Uttar Pradesh', label: 'Bareilly' },
      { value: 'Basti, Uttar Pradesh', label: 'Basti' },
      { value: 'Bhadohi, Uttar Pradesh', label: 'Bhadohi' },
      { value: 'Bijnor, Uttar Pradesh', label: 'Bijnor' },
      { value: 'Budaun, Uttar Pradesh', label: 'Budaun' },
      { value: 'Bulandshahr, Uttar Pradesh', label: 'Bulandshahr' },
      { value: 'Chandauli, Uttar Pradesh', label: 'Chandauli' },
      { value: 'Chitrakoot, Uttar Pradesh', label: 'Chitrakoot' },
      { value: 'Deoria, Uttar Pradesh', label: 'Deoria' },
      { value: 'Etah, Uttar Pradesh', label: 'Etah' },
      { value: 'Etawah, Uttar Pradesh', label: 'Etawah' },
      { value: 'Farrukhabad, Uttar Pradesh', label: 'Farrukhabad' },
      { value: 'Fatehpur, Uttar Pradesh', label: 'Fatehpur' },
      { value: 'Firozabad, Uttar Pradesh', label: 'Firozabad' },
      { value: 'Gautam Buddha Nagar, Uttar Pradesh', label: 'Gautam Buddha Nagar' },
      { value: 'Ghaziabad, Uttar Pradesh', label: 'Ghaziabad' },
      { value: 'Ghazipur, Uttar Pradesh', label: 'Ghazipur' },
      { value: 'Gonda, Uttar Pradesh', label: 'Gonda' },
      { value: 'Gorakhpur, Uttar Pradesh', label: 'Gorakhpur' },
      { value: 'Hamirpur, Uttar Pradesh', label: 'Hamirpur' },
      { value: 'Hapur, Uttar Pradesh', label: 'Hapur' },
      { value: 'Hardoi, Uttar Pradesh', label: 'Hardoi' },
      { value: 'Hathras, Uttar Pradesh', label: 'Hathras' },
      { value: 'Jalaun, Uttar Pradesh', label: 'Jalaun' },
      { value: 'Jaunpur, Uttar Pradesh', label: 'Jaunpur' },
      { value: 'Jhansi, Uttar Pradesh', label: 'Jhansi' },
      { value: 'Kannauj, Uttar Pradesh', label: 'Kannauj' },
      { value: 'Kanpur Dehat, Uttar Pradesh', label: 'Kanpur Dehat' },
      { value: 'Kanpur Nagar, Uttar Pradesh', label: 'Kanpur Nagar' },
      { value: 'Kasganj, Uttar Pradesh', label: 'Kasganj' },
      { value: 'Kaushambi, Uttar Pradesh', label: 'Kaushambi' },
      { value: 'Kheri, Uttar Pradesh', label: 'Kheri' },
      { value: 'Kushi Nagar, Uttar Pradesh', label: 'Kushi Nagar' },
      { value: 'Lalitpur, Uttar Pradesh', label: 'Lalitpur' },
      { value: 'Lucknow, Uttar Pradesh', label: 'Lucknow' },
      { value: 'Maharajganj, Uttar Pradesh', label: 'Maharajganj' },
      { value: 'Mahoba, Uttar Pradesh', label: 'Mahoba' },
      { value: 'Mainpuri, Uttar Pradesh', label: 'Mainpuri' },
      { value: 'Mathura, Uttar Pradesh', label: 'Mathura' },
      { value: 'Mau, Uttar Pradesh', label: 'Mau' },
      { value: 'Meerut, Uttar Pradesh', label: 'Meerut' },
      { value: 'Mirzapur, Uttar Pradesh', label: 'Mirzapur' },
      { value: 'Moradabad, Uttar Pradesh', label: 'Moradabad' },
      { value: 'Muzaffarnagar, Uttar Pradesh', label: 'Muzaffarnagar' },
      { value: 'Pilibhit, Uttar Pradesh', label: 'Pilibhit' },
      { value: 'Pratapgarh, Uttar Pradesh', label: 'Pratapgarh' },
      { value: 'Prayagraj, Uttar Pradesh', label: 'Prayagraj' },
      { value: 'Rae Bareli, Uttar Pradesh', label: 'Rae Bareli' },
      { value: 'Rampur, Uttar Pradesh', label: 'Rampur' },
      { value: 'Saharanpur, Uttar Pradesh', label: 'Saharanpur' },
      { value: 'Sambhal, Uttar Pradesh', label: 'Sambhal' },
      { value: 'Sant Kabeer Nagar, Uttar Pradesh', label: 'Sant Kabeer Nagar' },
      { value: 'Shahjahanpur, Uttar Pradesh', label: 'Shahjahanpur' },
      { value: 'Shamli, Uttar Pradesh', label: 'Shamli' },
      { value: 'Shravasti, Uttar Pradesh', label: 'Shravasti' },
      { value: 'Siddharth Nagar, Uttar Pradesh', label: 'Siddharth Nagar' },
      { value: 'Sitapur, Uttar Pradesh', label: 'Sitapur' },
      { value: 'Sonbhadra, Uttar Pradesh', label: 'Sonbhadra' },
      { value: 'Sultanpur, Uttar Pradesh', label: 'Sultanpur' },
      { value: 'Unnao, Uttar Pradesh', label: 'Unnao' },
      { value: 'Varanasi, Uttar Pradesh', label: 'Varanasi' },
    ],
  },
  {
    state: 'Uttarakhand',
    options: [
      { value: 'Almora, Uttarakhand', label: 'Almora' },
      { value: 'Bageshwar, Uttarakhand', label: 'Bageshwar' },
      { value: 'Chamoli, Uttarakhand', label: 'Chamoli' },
      { value: 'Champawat, Uttarakhand', label: 'Champawat' },
      { value: 'Dehradun, Uttarakhand', label: 'Dehradun' },
      { value: 'Haridwar, Uttarakhand', label: 'Haridwar' },
      { value: 'Nainital, Uttarakhand', label: 'Nainital' },
      { value: 'Pauri Garhwal, Uttarakhand', label: 'Pauri Garhwal' },
      { value: 'Pithoragarh, Uttarakhand', label: 'Pithoragarh' },
      { value: 'Rudra Prayag, Uttarakhand', label: 'Rudra Prayag' },
      { value: 'Tehri Garhwal, Uttarakhand', label: 'Tehri Garhwal' },
      { value: 'Udam Singh Nagar, Uttarakhand', label: 'Udam Singh Nagar' },
      { value: 'Uttar Kashi, Uttarakhand', label: 'Uttar Kashi' },
    ],
  },
  {
    state: 'West Bengal',
    options: [
      { value: '24 Paraganas North, West Bengal', label: '24 Paraganas North' },
      { value: '24 Paraganas South, West Bengal', label: '24 Paraganas South' },
      { value: 'Alipurduar, West Bengal', label: 'Alipurduar' },
      { value: 'Bankura, West Bengal', label: 'Bankura' },
      { value: 'Birbhum, West Bengal', label: 'Birbhum' },
      { value: 'Coochbehar, West Bengal', label: 'Coochbehar' },
      { value: 'Darjeeling, West Bengal', label: 'Darjeeling' },
      { value: 'Dinajpur Dakshin, West Bengal', label: 'Dinajpur Dakshin' },
      { value: 'Dinajpur Uttar, West Bengal', label: 'Dinajpur Uttar' },
      { value: 'Hooghly, West Bengal', label: 'Hooghly' },
      { value: 'Howrah, West Bengal', label: 'Howrah' },
      { value: 'Jalpaiguri, West Bengal', label: 'Jalpaiguri' },
      { value: 'Jhargram, West Bengal', label: 'Jhargram' },
      { value: 'Kalimpong, West Bengal', label: 'Kalimpong' },
      { value: 'Kolkata, West Bengal', label: 'Kolkata' },
      { value: 'Maldah, West Bengal', label: 'Maldah' },
      { value: 'Medinipur East, West Bengal', label: 'Medinipur East' },
      { value: 'Medinipur West, West Bengal', label: 'Medinipur West' },
      { value: 'Murshidabad, West Bengal', label: 'Murshidabad' },
      { value: 'Nadia, West Bengal', label: 'Nadia' },
      { value: 'Paschim Bardhaman, West Bengal', label: 'Paschim Bardhaman' },
      { value: 'Purba Bardhaman, West Bengal', label: 'Purba Bardhaman' },
      { value: 'Purulia, West Bengal', label: 'Purulia' },
    ],
  },
  {
    state: 'Remote',
    options: [
      { value: 'Remote - India', label: 'Remote - India' },
      { value: 'Remote - Anywhere', label: 'Remote - Anywhere' },
      { value: 'Hybrid - Flexible', label: 'Hybrid - Flexible' },
    ],
  },
];

/** Below this, extraction is telling us its own answer is a stretch. Surfaced as a
 *  hint next to the field rather than a block: a weak match is still an answer, and
 *  the recruiter is the one who can tell whether it is the right one. */
const LOW_INDUSTRY_CONFIDENCE = 0.5;

/** The JD text the browser's leave-prompt compares against the last save. */
function jdContentKey(title: string, aiPrompt: string, manualJD: string, generatedJD: string): string {
  return JSON.stringify([title.trim(), aiPrompt.trim(), manualJD.trim(), generatedJD.trim()]);
}

/* The update that puts a JD back exactly as a saved copy of it (the leave
   prompt's checkpoint). The backend PATCHes with exclude_unset, so a column the
   copy left empty must be sent as an explicit null or the edit made since would
   survive. Lists are always present on a JDResponse, so they need no null. */
const RESTORABLE_JD_FIELDS = [
  'title', 'description', 'employment_type', 'remote_type', 'must_have_skills', 'nice_to_have_skills',
  'certifications', 'domain_keywords', 'salary_currency', 'compensation_type', 'must_have_comments',
  'nice_to_have_comments', 'skill_merge_trail', 'coding_required', 'supported_languages',
  'allow_overqualified', 'job_hopping_enabled', 'creation_stage', 'creation_method', 'locations',
  'experience_mandatory', 'education_mandatory', 'industry_mandatory', 'location_mandatory',
] as const satisfies readonly (keyof JDCreate)[];
const NULLABLE_RESTORABLE_JD_FIELDS = [
  'department', 'location', 'education_requirements', 'experience_min', 'experience_max', 'job_level',
  'industry_type', 'industry_suggested_name', 'role_family', 'role_family_confidence', 'salary_min',
  'salary_max', 'assessment_guidance', 'internal_comments', 'additional_details', 'ai_prompt',
] as const satisfies readonly (keyof JDCreate)[];

function buildRestorePayload(jd: JDResponse): Partial<JDCreate> {
  const payload: Record<string, unknown> = {};
  for (const field of RESTORABLE_JD_FIELDS) {
    if (jd[field] !== undefined && jd[field] !== null) payload[field] = jd[field];
  }
  for (const field of NULLABLE_RESTORABLE_JD_FIELDS) {
    payload[field] = jd[field] ?? null;
  }
  return payload as Partial<JDCreate>;
}

export default function JDCreation({ onBack, selectedJob, onPublish, editingJD, isJDInUse = false, jdUsageMessage, isTitleLocked = false, titleLockedMessage, breadcrumbItems, onStepChange, editingJDId, onClose, onSuccess, isEmbedded, jdWorkflow = 'create' }: JDCreationProps = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<CreationMode>('ai');
  const [step, setStep] = useState<Step>(editingJD?.creation_stage || 'create');
  // Mirror of `step` for use inside async callbacks (streaming generation
  // completes after the user may have already advanced past Step 1).
  const stepRef = useRef<Step>(step);
  useEffect(() => { stepRef.current = step; }, [step]);
  const ensureJDCreationUrl = (jdId: string, creationStage: Step) => {
    if (typeof window === 'undefined') return;

    // Editing a draft through its working copy: the URL keeps naming the DRAFT, so a
    // refresh reopens it (and resumes the copy) instead of addressing the copy.
    if (editingCopyOf && jdId === editingId) jdId = editingCopyOf;

    const params = new URLSearchParams(window.location.search);
    const currentId = params.get('id');
    const currentStage = params.get('stage');

    if (currentId === jdId && currentStage === creationStage) return;

    params.set('id', jdId);
    params.set('stage', creationStage);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    console.log('[TalentFlow] URL updated with JD progress:', { jdId, creationStage });
  };

  // ── The URL's `stage` MIRRORS the current step; it never leads it ──────────
  //
  // This is what makes a refresh land on the step the user is actually on.
  //
  // `?stage=` used to be written in exactly two places - `handleNext` (extract)
  // and `handlePublish` (review) - i.e. only ever when moving FORWARD. Going
  // back is six plain `setStep` calls (the Step-2 "Back" button and the five
  // "Edit" links on Step 3) and none of them touched the URL. So the param
  // recorded the FURTHEST step reached, not the current one.
  //
  // `app/(dashboard)/recruitment/jd-creation/page.tsx` then resolves the stage
  // as `stageFromUrl || editingJD.creation_stage`, giving that stale param
  // precedence over the stored stage. The result was a page number that moved
  // on its own:
  //
  //     Step 1 -> Next -> Step 2 (URL now stage=extract)
  //             -> Back -> Step 1 (URL still stage=extract)
  //             -> REFRESH -> Step 2          <- nobody clicked anything
  //
  // Same one step later: reach Review, click any "Edit" link back to Step 2,
  // refresh, and the page returns to Review.
  //
  // Mirroring the step here fixes it at the source and covers every way the
  // step can change - the six existing backward transitions and any added
  // later - instead of bolting a URL write onto each button and waiting for
  // the next one to be forgotten.
  //
  // Direction matters: this effect reads `step` and writes the URL. It never
  // calls `setStep`, so it cannot advance anything - it only records where the
  // user already is. It is also a no-op until the JD has an id, because there
  // is nothing to come back to before then.
  // Only an actual step CHANGE is mirrored; the mount value never is.
  // `editingJD` is fetched, so on a reload this component mounts before it
  // arrives and `step` initialises to its 'create' default. Writing THAT to the
  // URL would overwrite the `?stage=review` the user reloaded on, and since the
  // page resolves the stage as `stageFromUrl || stored`, it would strand them
  // on Step 1 - the opposite bug. Comparing against the last mirrored value
  // (rather than a "have we run yet" flag) also makes the effect a no-op on any
  // re-run where the step did not move, including React's double-invoked mount
  // effects should StrictMode ever be turned on.
  const lastMirroredStepRef = useRef<Step>(step);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (lastMirroredStepRef.current === step) return;
    lastMirroredStepRef.current = step;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('id')) return;
    if (params.get('stage') === step) return;
    params.set('stage', step);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    console.log('[TalentFlow] URL stage synced to current step:', step);
  }, [step]);

  // Guards against one click being executed twice. Both handlers below await
  // `ensureValidJobTitle` (a network call) before they set any "in flight"
  // state, and a `disabled` prop only takes effect after React re-renders - so
  // a double-click, or a click plus a stray keyboard activation, could enter
  // either handler a second time and advance the step twice. A ref flips
  // synchronously, so the second entry sees it on the very same tick.
  const isAdvancingRef = useRef(false);

  // Determine if we're editing a draft or a published JD
  // Draft JD: can be updated directly (editingId is set)
  // Published JD: can also be updated directly (editingId is set) - creates a new version on publish
  // FIX-003: Use effectiveEditingJD (loaded or prop data) - computed below after loading

  // If editing a draft or published JD, we can update it directly.
  const [editingId, setEditingId] = useState<string | null>(null);
  // true when editingId was loaded from an existing JD (not created fresh in this session)
  const [isPreExistingDraft, setIsPreExistingDraft] = useState(false);
  /* Discard vs Save as Draft. The Create step autosaves in the background and
     moving on to Extract saves too, so a brand-new job already has a draft
     record before the user has chosen anything. Discard must remove that
     record — but only one this visit created (not a draft opened from the
     list) and only while the user has not saved it themselves. */
  const userSavedDraftRef = useRef(false);
  // Read by the AI-generation callbacks, which close over an older render.
  const titleLockedRef = useRef(isTitleLocked || isJDInUse);
  useEffect(() => {
    titleLockedRef.current = isTitleLocked || isJDInUse;
  }, [isTitleLocked, isJDInUse]);
  // Set once Discard is chosen, so an autosave already in flight cannot
  // leave a fresh draft behind after the user has left.
  const discardedRef = useRef(false);
  // The record THIS mount created (autosave or a step save). Once its `id=` lands in
  // the URL the parent re-fetches it and hands it back as `editingJD`, and the effect
  // below used to read that as "a draft opened from the list" - so the leave prompt's
  // Discard only reverted fields and the never-wanted draft stayed under Draft.
  const createdInSessionIdRef = useRef<string | null>(null);
  // A draft version forked from a published JD for this visit (see below).
  const freshForkIdRef = useRef<string | null>(null);
  // A NEW JD's working copy created in this visit and not yet saved: it has no JD
  // ID and is hidden from every list until Save as Draft / Publish commits it.
  const [unsavedNewCopyId, setUnsavedNewCopyId] = useState<string | null>(null);
  /* What "Discard current changes" in the leave prompt goes back to: the server's
     copy of the JD at the last point the recruiter can return to - as opened (an
     existing JD), the last step save (a job created in this visit), or their last
     Save as Draft. `label` finishes the prompt's sentence "go back to ...". */
  const leaveCheckpointRef = useRef<{ jd: JDResponse; label: string } | null>(null);
  // The part of the checkpoint the leave prompt renders (refs cannot be read
  // during render under this eslint config).
  const [leaveCheckpointMeta, setLeaveCheckpointMeta] = useState<{ label: string; jobCode: string | null; status: string; versionNumber: number; isFreshFork?: boolean } | null>(null);
  // Step-1 text as of that checkpoint; compared with the live text to tell
  // whether an existing JD has actually been edited.
  const checkpointContentKeyRef = useRef<string | null>(null);
  // Step 2 edits are written to the DB as they happen; this records that any
  // happened since the checkpoint.
  const editedSinceCheckpointRef = useRef(false);
  // Render-side mirrors of the two above, for the Save as Draft button: Step-1
  // text as of the checkpoint, and whether Step 2 was edited since.
  const [checkpointContentKey, setCheckpointContentKey] = useState<string | null>(null);
  const [step2EditedSinceCheckpoint, setStep2EditedSinceCheckpoint] = useState(false);
  // sourceJdId tracks the original JD for reference
  const [sourceJdId, setSourceJdId] = useState<string | null>(null);

  // FIX-003: State for loading JD in embedded mode
  const [loadingJD, setLoadingJD] = useState(false);
  const [loadedJDData, setLoadedJDData] = useState<EditingJDData | null>(null);

  // FIX-003: Fetch JD when editingJDId is provided (embedded mode)
  useEffect(() => {
    if (editingJDId && isEmbedded) {
      const fetchJD = async () => {
        setLoadingJD(true);
        try {
          const jd = await jdService.get(editingJDId);
          const jdData: EditingJDData = {
            id: jd.id,
            job_id: jd.job_id,
            current_version: jd.current_version,
            version_number: jd.version_number,
            title: jd.title,
            description: jd.description,
            status: jd.status,
            creation_stage: jd.creation_stage || 'create',
            creation_method: jd.creation_method,
            ai_prompt: jd.ai_prompt,
            must_have_skills: jd.must_have_skills,
            nice_to_have_skills: jd.nice_to_have_skills,
            education_requirements: jd.education_requirements,
            experience_min: jd.experience_min,
            experience_max: jd.experience_max,
            // The Required/Preferred ticks. Step 2 hydrates its four checkboxes from
            // these, and NEITHER mapping forwarded them: every reopen of a JD read
            // `undefined`, fell back to false, and un-ticked all four - silently demoting
            // Essential criteria to Preferred on the next save. The reader was fixed once
            // before (see the hydration block's comment, "read them"); the mappings that
            // feed it were not, so there was nothing to read.
            experience_mandatory: jd.experience_mandatory,
            education_mandatory: jd.education_mandatory,
            industry_mandatory: jd.industry_mandatory,
            location_mandatory: jd.location_mandatory,
            // Why the experience tick may be OFF on a JD that states a minimum: the text
            // also invites freshers. Computed server-side on every read; Step 2 uses it to
            // explain the box and to ask before it is ticked back on.
            experience_welcomes_freshers: jd.experience_welcomes_freshers,
            industry_type: jd.industry_type,
            // The free-text industry from Step 2. Dropping it here would reopen the
            // draft showing only the code the JD was filed under (usually "Others"),
            // silently discarding the industry the recruiter actually proposed.
            industry_suggested_name: jd.industry_suggested_name,
            // See the note in jd-creation/page.tsx - BOTH mappings must forward this.
            role_family: jd.role_family,
            role_family_confidence: jd.role_family_confidence,
            salary_min: jd.salary_min,
            salary_max: jd.salary_max,
            compensation_type: jd.compensation_type,
            job_level: jd.job_level,
            employment_type: jd.employment_type,
            remote_type: jd.remote_type,
            assessment_guidance: jd.assessment_guidance,
            internal_comments: jd.internal_comments,
            additional_details: jd.additional_details,
            must_have_comments: jd.must_have_comments,
            nice_to_have_comments: jd.nice_to_have_comments,
            // Skill groups + notes. See the note in jd-creation/page.tsx - BOTH
            // mappings must forward this, or Step 2 hydrates an empty trail and the
            // next save clears the stored groups.
            skill_merge_trail: jd.skill_merge_trail,
            department: jd.department,
            certifications: jd.certifications,
            domain_keywords: jd.domain_keywords,
            allow_overqualified: jd.allow_overqualified,
            locations: jd.locations?.map(loc => ({
              city: loc.city || '',
              radius_km: loc.radius_km,
              is_required: loc.is_required,
            })),
          };
          setLoadedJDData(jdData);
        } catch (error) {
          console.error('[JDCreation] Failed to fetch JD:', error);
          toast.error('Failed to load JD');
        } finally {
          setLoadingJD(false);
        }
      };
      fetchJD();
    }
  }, [editingJDId, isEmbedded]);

  // Use loaded JD data or prop data
  const effectiveEditingJD = loadedJDData || editingJD;

  // FIX-003: Computed values for editing state
  const isEditingDraft = effectiveEditingJD?.status === 'draft';
  const isEditingPublished = effectiveEditingJD?.status === 'published';
  // Editing an existing draft through its working copy: that draft's id.
  const editingCopyOf: string | null =
    effectiveEditingJD?.is_working_copy && effectiveEditingJD.id === editingId
      ? (effectiveEditingJD.working_copy_of ?? null)
      : null;
  // A new JD that has never been saved (its working copy, from this visit or
  // reopened by a refresh): Discard leaves nothing behind and Delete has nothing to do.
  const isUnsavedNewCopy = !!editingId && (
    unsavedNewCopyId === editingId
    || (effectiveEditingJD?.id === editingId && !!effectiveEditingJD?.is_working_copy && !effectiveEditingJD?.working_copy_of)
  );

  // Set editingId when component mounts or editingJD changes
  useEffect(() => {
    if (effectiveEditingJD) {
      console.log('[DEBUG] editingJD received:', { id: effectiveEditingJD.id, status: effectiveEditingJD.status });
      if (effectiveEditingJD.status === 'draft') {
        // Editing a draft - update it directly
        setEditingId(effectiveEditingJD.id);
        // The draft this visit created, handed back by the parent's re-fetch, is
        // not one the recruiter opened - Discard must still be able to delete it.
        setIsPreExistingDraft(effectiveEditingJD.id !== createdInSessionIdRef.current);
        setSourceJdId(null);
        console.log('[DEBUG] Setting editingId for draft:', effectiveEditingJD.id);
      } else if (effectiveEditingJD.status === 'published') {
        // Editing published JD - update it directly (creates new version on republish)
        setEditingId(effectiveEditingJD.id);
        setIsPreExistingDraft(true);
        setSourceJdId(effectiveEditingJD.id);
        console.log('[DEBUG] Setting editingId for published:', effectiveEditingJD.id);
      }
    }
  }, [effectiveEditingJD]);

  // Quota check for max_jobs
  const { checkQuota, status: quotaStatus, canProceed: hasQuota, isChecking: isCheckingQuota, quotaError } = useQuotaCheck();
  const [quotaChecked, setQuotaChecked] = useState(false);

  // Step 1: Create JD
  const [jobTitle, setJobTitle] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [manualJD, setManualJD] = useState('');
  const [generatedJD, setGeneratedJD] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditingJD, setIsEditingJD] = useState(false);

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);

  // Step 2: Extracted Data
  const [extractedData, setExtractedData] = useState<ExtractedData>({
    mustHaveSkills: [],
    mustHaveComments: [],
    niceToHaveSkills: [],
    niceToHaveComments: [],
    education: '',
    educationRequired: false,
    experience: '',
    experienceRequired: false,
    jobHoppingEnabled: false,
    industryType: '',
    industrySuggestedName: undefined,
    industrySuggestedReason: undefined,
    industryConfidence: undefined,
    industryIsCustom: false,
    roleFamily: undefined,
    roleFamilyConfidence: undefined,
    roleFamilyRaw: undefined,
    industryTypeRequired: false,
    department: '',
    allowOverqualified: null,
    employmentType: 'full_time',
    workModel: 'onsite',
    salaryFrom: '',
    salaryTo: '',
    compensationType: 'yearly',
    salaryCurrency: 'INR',
    salaryOriginalFrom: '',
    salaryOriginalTo: '',
    salaryOriginalCurrency: 'INR',
    locations: [],
    locationsRequired: false,
    assessmentGuidance: '',
    additionalDetails: '',
    mergeTrail: [],
    internalRecruiterComments: [],
    // JD09: Certifications and Domain Keywords
    certifications: [],
    domainKeywords: [],
    // Coding assessment fields
    codingRequired: false,
    suggestedLanguages: [],
  });
  const [experienceYearsExplicit, setExperienceYearsExplicit] = useState(false);
  // WORDS FIRST. The level code the JD's own words name - "Senior Backend Developer",
  // "we are seeking a junior analyst" - as decided by the backend at extraction
  // (experience_level_source 'title' / 'text'). While set, it IS the persisted
  // job_level whatever the From/To years say; the years are only mapped to a level
  // when this is empty. Cleared by an extraction that finds no grade word.
  const [experienceLevelWord, setExperienceLevelWord] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newCertification, setNewCertification] = useState('');
  const [newDomainKeyword, setNewDomainKeyword] = useState('');
  const [newLocation, setNewLocation] = useState({ city: '', radius: '50' });
  const [newCodingLanguage, setNewCodingLanguage] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [locationStateFilter, setLocationStateFilter] = useState<string>('all');
  const [locationCountry, setLocationCountry] = useState<'IN' | 'US'>('IN');
  const [usStates, setUsStates] = useState<USStateOption[]>([]);
  const [usCitiesByState, setUsCitiesByState] = useState<Record<string, string[]>>({});
  const [isLoadingUsLocations, setIsLoadingUsLocations] = useState(false);
  
  // Long skill and additional-requirement lists are collapsed to the first
  // SKILL_PREVIEW_LIMIT entries so one column can't push the others off the
  // fold; the rest sit behind a "+N skills" / "+N requirements" toggle, per list.
  const [expandedSkillCategories, setExpandedSkillCategories] = useState<{
    mustHaveSkills: boolean;
    niceToHaveSkills: boolean;
    mustHaveComments: boolean;
    niceToHaveComments: boolean;
  }>({ mustHaveSkills: false, niceToHaveSkills: false, mustHaveComments: false, niceToHaveComments: false });

  const toggleSkillCategory = (category: 'mustHaveSkills' | 'niceToHaveSkills' | 'mustHaveComments' | 'niceToHaveComments') =>
    setExpandedSkillCategories(prev => ({ ...prev, [category]: !prev[category] }));

  // Inline editing states
  const [editingSkillIndex, setEditingSkillIndex] = useState<{ category: 'mustHaveSkills' | 'niceToHaveSkills'; index: number } | null>(null);
  const [editingSkillValue, setEditingSkillValue] = useState('');
  const [editingCommentIndex, setEditingCommentIndex] = useState<number | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');
  const [editingNiceCommentIndex, setEditingNiceCommentIndex] = useState<number | null>(null);
  const [editingNiceCommentValue, setEditingNiceCommentValue] = useState('');
  const [editingRecruiterCommentIndex, setEditingRecruiterCommentIndex] = useState<number | null>(null);
  const [editingRecruiterCommentValue, setEditingRecruiterCommentValue] = useState('');
  const [newRecruiterComment, setNewRecruiterComment] = useState('');
  const [showDragTips, setShowDragTips] = useState(true);
  /** The missed panel shows a few source lines and folds the rest away. */
  const [showAllMissed, setShowAllMissed] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedJdId, setPublishedJdId] = useState<string | null>(null);
  const [publishedJobCode, setPublishedJobCode] = useState<string | null>(null);

  /* ---- The FOUR steps the recruiter sees --------------------------------------
     Derived from the two pieces of state that already drive this flow. It is
     deliberately NOT a fourth value on `Step`, which stays
     'create' | 'extract' | 'review':

       `Step` is persisted as the JD's `creation_stage`, mirrored into `?stage=`,
       and read back on reload to decide which screen to restore. Adding a
       'publish' member would mean touching every transition, the stored records
       already carrying the old three, and the URL contract — all to change a
       caption.

     And it would misdescribe the flow. Publish is not a step the recruiter
     navigates TO; it is what Step 3 DOES. `step === 'review'` already renders
     two different screens off `isPublished` — the review form, then the success
     screen — so the fourth step is simply the third having succeeded, which is
     exactly what this reads.

     Consequence worth knowing: Step 4 is only ever "current"; it is never
     "completed", because publishing ends the flow and the host navigates away. */
  const displayStep: 1 | 2 | 3 | 4 =
    step === 'create' ? 1
      : step === 'extract' ? 2
        : isPublished ? 4
          : 3;

  /* Reported to the host so its breadcrumb can name the current step. In an
     effect, not during render: `onStepChange` sets state in the parent, and
     doing that mid-render is what React warns about. */
  useEffect(() => {
    onStepChange?.(displayStep);
  }, [displayStep, onStepChange]);

  useEffect(() => {
    if (locationCountry !== 'US' || usStates.length > 0 || isLoadingUsLocations) {
      return;
    }

    let cancelled = false;

    const loadUSLocations = async () => {
      setIsLoadingUsLocations(true);

      try {
        const { State, City } = await import('country-state-city');
        const states = State.getStatesOfCountry('US').map((state) => ({
          name: state.name,
          isoCode: state.isoCode,
        }));
        const citiesByState = Object.fromEntries(
          states.map((state) => [
            state.isoCode,
            City.getCitiesOfState('US', state.isoCode).map((city) => city.name),
          ])
        );

        if (!cancelled) {
          setUsStates(states);
          setUsCitiesByState(citiesByState);
        }
      } catch (error) {
        console.error('[JD-CREATION] Failed to load US location data:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingUsLocations(false);
        }
      }
    };

    loadUSLocations();

    return () => {
      cancelled = true;
    };
  }, [isLoadingUsLocations, locationCountry, usStates.length]);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  // The published JD's LINEAGE version (v1, v2, ...) - what the Published
  // screen's version badge shows. `publishedVersion` above is the row's publish
  // COUNT (current_version), which only says whether this was a republish: a new
  // version is its own JD row, so its first publish is count 1 even when it is v2.
  const [publishedVersionNumber, setPublishedVersionNumber] = useState<number | null>(null);
  // Step 3's version badge, for when the loaded record does not carry its own
  // `version_number`: the lineage endpoint's entry for this row, keyed by id so a
  // different JD never shows another's number.
  const [reviewLineageVersion, setReviewLineageVersion] = useState<{ id: string; version: number } | null>(null);
  const [extractedDataModified, setExtractedDataModified] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showExtractedSummary, setShowExtractedSummary] = useState(false);
  // Step 3's Download format picker (Text / DOCX / PDF).
  const [showDownloadFormatDialog, setShowDownloadFormatDialog] = useState(false);

  // Track if we've loaded from editingJD to prevent re-initialization on re-renders
  const hasLoadedFromEditingJD = useRef(false);

  // The single scroll container wraps all steps. Since it stays mounted across
  // step changes, its scroll position is retained — so moving to the next step
  // would otherwise leave the view scrolled down where the Next button was.
  // We reset it to the top whenever the step changes.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll the step container back to the top whenever the step changes so each
  // step (create / extract / review) opens from the top instead of wherever the
  // previous step's Next button left the scroll position.
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

  // Track original values from last extraction to skip re-extraction if unchanged
  const [lastExtractedJD, setLastExtractedJD] = useState<string>('');

  // Track if we've already formatted for review to skip re-formatting if no changes
  const [hasFormattedForReview, setHasFormattedForReview] = useState(false);

  // Snapshot of extractedData when entering step 2 — used to detect actual changes via data comparison
  const step2DataSnapshot = useRef<string>('');

  /**
   * Step 3's formatted output is stale because Step 2 was RE-EXTRACTED under it.
   *
   * The steps form a chain: editing Step 1 invalidates Step 2 (so extraction re-runs),
   * and new Step-2 data invalidates Step 3 (so the reformat must re-run). Only the first
   * half of that was implemented. `extractedDataModified` means "the recruiter hand-edited
   * Step 2", and a fresh extraction explicitly resets it to false - correctly, since the
   * recruiter edited nothing - while `step2DataSnapshot` was ALSO overwritten with the
   * new extraction on the same line. Both signals that feed `shouldReformat` were
   * therefore cleared by the very extraction that made the data new, so Step 3 kept
   * rendering a description built from the PREVIOUS Step-2 data, and the de-duplication
   * pass folded into that same call never ran either.
   *
   * A separate ref rather than reusing `extractedDataModified`: that flag also drives
   * `preserveUserEdits` and the "AI reformat" banner, which really do mean "the human
   * changed something".
   *
   * Set only when the new extraction DIFFERS from what Step 3 was last built from, so a
   * Step-1 edit that happens to re-extract identically costs no LLM call.
   */
  const extractionInvalidatedFormat = useRef(false);
  // Baseline of Step-1 content captured when an existing JD is loaded for editing.
  // Lets handleNext / handleConfirmPublish detect "no changes since load" and skip
  // the extraction / reformat LLM calls on a no-op edit pass-through.
  const stage1LoadBaseline = useRef<{ jobTitle: string; aiPrompt: string; generatedJD: string; manualJD: string } | null>(null);
  // Tracks which creation mode produced the CURRENT extractedData. If the user
  // switches AI<->Manual and re-extracts, the source content is fundamentally
  // different, so the extraction must NOT preserve the previous mode's values
  // (that caused old AI-generated data to linger after switching to Manual).
  const lastExtractionSourceMode = useRef<CreationMode | null>(null);

  // Validation errors for inline display
  const [validationErrors, setValidationErrors] = useState<{
    mustHaveSkills?: string;
    mustHaveComments?: string;
    education?: string;
    experience?: string;
    industryType?: string;
    salaryRange?: string;
    allowOverqualified?: string;
    locations?: string;
  }>({});
  // Loading/error state for the salary currency toggle's exchange-rate fetch
  // (GET /jd/exchange-rate). Kept separate from validationErrors since this is
  // an infrastructure failure, not a bad input - see handleSalaryCurrencyChange.
  const [isFetchingExchangeRate, setIsFetchingExchangeRate] = useState(false);
  const [exchangeRateError, setExchangeRateError] = useState<string | null>(null);
  const [jobTitleServerValidationError, setJobTitleServerValidationError] = useState('');
  const [jobTitleServerValidatedValue, setJobTitleServerValidatedValue] = useState('');
  const [isJobTitleValidating, setIsJobTitleValidating] = useState(false);
  const jobTitleValidationRequestIdRef = useRef(0);
  const jobTitleValidationCacheRef = useRef(new Map<string, string>());

  const getResolvedJobTitleValidationError = (value: string): string => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return '';
    }

    // Temporarily bypass semantic job title validation and let AI generation handle it.
    // const localValidationError = getJobTitleValidationError(trimmedValue);
    // if (localValidationError) {
    //   return localValidationError;
    // }
    //
    // if (trimmedValue === jobTitleServerValidatedValue) {
    //   return jobTitleServerValidationError;
    // }
    //
    // return jobTitleValidationCacheRef.current.get(trimmedValue) || '';
    return '';
  };

  const ensureValidJobTitle = async (value: string): Promise<boolean> => {
    const trimmedValue = value.trim();
    // Temporarily bypass semantic job title validation and let AI generation handle it.
    // const localValidationError = getJobTitleValidationError(trimmedValue);
    // if (!trimmedValue || localValidationError) {
    //   if (localValidationError) {
    //     showJobTitleValidationToast(localValidationError);
    //   }
    //   return false;
    // }
    //
    // const cachedValidationError = jobTitleValidationCacheRef.current.get(trimmedValue);
    // if (cachedValidationError !== undefined) {
    //   setJobTitleServerValidatedValue(trimmedValue);
    //   setJobTitleServerValidationError(cachedValidationError);
    //   if (cachedValidationError) {
    //     showJobTitleValidationToast(cachedValidationError);
    //     return false;
    //   }
    //   return true;
    // }
    //
    // const requestId = jobTitleValidationRequestIdRef.current + 1;
    // jobTitleValidationRequestIdRef.current = requestId;
    // setIsJobTitleValidating(true);
    //
    // try {
    //   const remoteValidationError = await fetchJobTitleValidationError(trimmedValue);
    //   jobTitleValidationCacheRef.current.set(trimmedValue, remoteValidationError);
    //
    //   if (jobTitleValidationRequestIdRef.current === requestId) {
    //     setJobTitleServerValidatedValue(trimmedValue);
    //     setJobTitleServerValidationError(remoteValidationError);
    //   }
    //
    //   if (remoteValidationError) {
    //     showJobTitleValidationToast(remoteValidationError);
    //     return false;
    //   }
    //
    //   return true;
    // } catch (error) {
    //   console.error('[JD-CREATION] Failed to validate job title with backend:', error);
    //
    //   if (jobTitleValidationRequestIdRef.current === requestId) {
    //     setJobTitleServerValidatedValue('');
    //     setJobTitleServerValidationError('');
    //   }
    //
    //   return true;
    // } finally {
    //   if (jobTitleValidationRequestIdRef.current === requestId) {
    //     setIsJobTitleValidating(false);
    //   }
    // }
    return Boolean(trimmedValue);
  };

  useEffect(() => {
    // Temporarily disable background job title validation and let AI generation handle it.
    // const trimmedJobTitle = jobTitle.trim();
    // const localValidationError = getJobTitleValidationError(trimmedJobTitle);
    // jobTitleValidationRequestIdRef.current += 1;
    // const requestId = jobTitleValidationRequestIdRef.current;
    //
    // if (!trimmedJobTitle || trimmedJobTitle.length < VALIDATION.JOB_TITLE.min || localValidationError) {
    //   setJobTitleServerValidatedValue('');
    //   setJobTitleServerValidationError('');
    //   setIsJobTitleValidating(false);
    //   return;
    // }
    //
    // const cachedValidationError = jobTitleValidationCacheRef.current.get(trimmedJobTitle);
    // if (cachedValidationError !== undefined) {
    //   setJobTitleServerValidatedValue(trimmedJobTitle);
    //   setJobTitleServerValidationError(cachedValidationError);
    //   setIsJobTitleValidating(false);
    //   return;
    // }
    //
    // setJobTitleServerValidatedValue('');
    // setJobTitleServerValidationError('');
    //
    // const validationTimer = window.setTimeout(async () => {
    //   setIsJobTitleValidating(true);
    //
    //   try {
    //     const remoteValidationError = await fetchJobTitleValidationError(trimmedJobTitle);
    //     jobTitleValidationCacheRef.current.set(trimmedJobTitle, remoteValidationError);
    //
    //     if (jobTitleValidationRequestIdRef.current === requestId) {
    //       setJobTitleServerValidatedValue(trimmedJobTitle);
    //       setJobTitleServerValidationError(remoteValidationError);
    //     }
    //   } catch (error) {
    //     console.error('[JD-CREATION] Background job title validation failed:', error);
    //
    //     if (jobTitleValidationRequestIdRef.current === requestId) {
    //       setJobTitleServerValidatedValue('');
    //       setJobTitleServerValidationError('');
    //     }
    //   } finally {
    //     if (jobTitleValidationRequestIdRef.current === requestId) {
    //       setIsJobTitleValidating(false);
    //     }
    //   }
    // }, 300);
    //
    // return () => window.clearTimeout(validationTimer);
    setJobTitleServerValidatedValue('');
    setJobTitleServerValidationError('');
    setIsJobTitleValidating(false);
  }, [jobTitle]);

  // Sanitize a salary number from backend/extraction: if > 8 digits (>99999999), clear it
  // Renders an extracted salary into the Step 2 input. Math.trunc() here was the last
  // of the four places a fractional rate was being floored: even once the backend
  // returned 20.34, the box showed 20, and saving that wrote 20 back. Cents are kept and
  // a whole amount still shows as a whole number ("120000", not "120000.00").
  //
  // The 8-digit ceiling is a product rule, not a column limit - validateSalaryRange()
  // shows the recruiter the matching "cannot exceed ₹9,99,99,999" message - so it is
  // applied to the rounded value and left as it was.
  const sanitizeExtractedSalary = (val: number | string | null | undefined): string => {
    if (val == null || val === '') return '';
    const numeric = Number(val);
    if (!Number.isFinite(numeric)) return '';
    const rounded = Math.round(numeric * 100) / 100;
    if (rounded > 99999999) return '';
    return String(rounded);
  };

  // Helper function to parse salary value (handles LPA, L, K, commas, ₹)
  const parseSalaryValue = (value: string): number | null => {
    if (!value || value.trim() === '') return null;

    // Remove ₹, Rs, commas, spaces
    let cleaned = value.replace(/[₹,\s]/g, '').replace(/Rs\.?/gi, '').trim();

    // Handle LPA (Lakhs Per Annum) - multiply by 100000
    if (/lpa$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/lpa$/i, ''));
      return isNaN(num) ? null : num * 100000;
    }

    // Handle L or Lakhs - multiply by 100000
    if (/l(akhs?)?$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/l(akhs?)?$/i, ''));
      return isNaN(num) ? null : num * 100000;
    }

    // Handle K or thousands - multiply by 1000
    if (/k$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/k$/i, ''));
      return isNaN(num) ? null : num * 1000;
    }

    // Handle Cr or Crores - multiply by 10000000
    if (/cr(ores?)?$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/cr(ores?)?$/i, ''));
      return isNaN(num) ? null : num * 10000000;
    }

    // Plain number
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  // Validate salary range
  //
  // JD-21: ONE bound is a complete answer. A floor with no ceiling ("10 LPA+") and a
  // ceiling with no floor ("Up to 10 LPA") are both things a real posting says, so
  // neither is an error any more. This used to return 'Enter the maximum salary to
  // complete the range.' / 'Enter the minimum salary to complete the range.', and
  // because the publish check folds this message into missingFields, a recruiter who
  // genuinely only had a floor could not publish at all - the only way past it was to
  // invent the other number, which is exactly the fabricated figure we must not store.
  //
  // What still fails: an out-of-range magnitude on EITHER side, and a max below the
  // min. The 8-digit ceiling is a product rule (see the input onChange handlers, which
  // cap typing at 8 whole-currency digits); it is checked on both bounds now that each
  // one can stand alone - previously only `to` was reachable with the other side empty.
  const validateSalaryRange = (from: string, to: string): string | undefined => {
    const minSalary = parseSalaryValue(from);
    const maxSalary = parseSalaryValue(to);

    // If both are empty, no error. An unstated salary stays unstated.
    if (minSalary === null && maxSalary === null) return undefined;

    if (minSalary !== null && minSalary > 99999999) {
      return 'Minimum salary cannot exceed ₹9,99,99,999 (8 digits)';
    }

    if (maxSalary !== null && maxSalary > 99999999) {
      return 'Maximum salary cannot exceed ₹9,99,99,999 (8 digits)';
    }

    // Only meaningful when both bounds exist - a lone bound has nothing to contradict.
    if (minSalary !== null && maxSalary !== null && minSalary > maxSalary) {
      return 'Maximum salary cannot be less than minimum salary.';
    }

    return undefined;
  };

  /**
   * Switches the displayed salary currency on the extraction page. Always converts
   * FROM extractedData.salaryOriginal{From,To,Currency} - never from whatever is
   * currently displayed - so an INR -> USD -> INR round trip restores the exact
   * original figures instead of compounding FX rounding error on every toggle.
   *
   * Switching back to the original currency is instant and needs no network call:
   * there is nothing to convert, the original figures are just restored verbatim.
   * Switching away from it fetches a live rate (lib/services/exchangeRateService,
   * itself cached) and converts from the original amount. On failure, the currency
   * selection is left unchanged and an inline error is shown - never a silently
   * unconverted amount.
   */
  const handleSalaryCurrencyChange = async (targetCurrency: 'INR' | 'USD') => {
    if (extractedData.salaryCurrency === targetCurrency) return;
    setExchangeRateError(null);

    const { salaryOriginalFrom, salaryOriginalTo, salaryOriginalCurrency } = extractedData;

    if (targetCurrency === salaryOriginalCurrency) {
      setExtractedData(prev => ({
        ...prev,
        salaryCurrency: targetCurrency,
        salaryFrom: prev.salaryOriginalFrom,
        salaryTo: prev.salaryOriginalTo,
      }));
      setValidationErrors(prev => ({
        ...prev,
        salaryRange: validateSalaryRange(salaryOriginalFrom || '', salaryOriginalTo || ''),
      }));
      markExtractedDataModified();
      return;
    }

    setIsFetchingExchangeRate(true);
    try {
      const { rate } = await getExchangeRate(salaryOriginalCurrency, targetCurrency);
      const salaryFrom = convertSalaryAmount(salaryOriginalFrom, rate);
      const salaryTo = convertSalaryAmount(salaryOriginalTo, rate);
      setExtractedData(prev => ({ ...prev, salaryCurrency: targetCurrency, salaryFrom, salaryTo }));
      setValidationErrors(prev => ({ ...prev, salaryRange: validateSalaryRange(salaryFrom, salaryTo) }));
      markExtractedDataModified();
    } catch (err) {
      setExchangeRateError(
        err instanceof Error ? err.message : 'Could not fetch the exchange rate. Please try again.'
      );
    } finally {
      setIsFetchingExchangeRate(false);
    }
  };

  /**
   * Promote a grouped wording to a skill of its own ("Add" on a tree child).
   *
   * The recruiter is the authority on whether two wordings name one skill. Extraction
   * groups what it judges to be the same skill and shows its evidence; this is the
   * disagree button, and it is why the grouping can be shown as a decision rather than
   * presented as a fact.
   *
   * It lands in the SURVIVOR's list rather than wherever it was originally extracted
   * from: that is the list the recruiter is looking at, and the two were judged the same
   * skill. Dragging it across afterwards is one gesture.
   *
   * The wording leaves the group as it goes - a tree child sitting next to an identical
   * top-level skill would read as the skill being counted twice. When the last child
   * leaves, the group disappears with it.
   */
  /**
   * Adopt the JD's own longer wording for a skill ("Use JD wording" on a narrowing note).
   *
   * The counterpart to promoting a grouped skill, and deliberately a REPLACE rather than
   * an add: the note's child is not a second skill, it is the same skill as the JD
   * happened to phrase it. Adding it would put "Docker" and "Docker containerization"
   * side by side - the duplicate the extraction was right to avoid.
   *
   * The note is dropped once used, because the skill now IS the JD's wording and there
   * is no longer a difference to explain.
   */
  /** Every wording currently in one of the four lists, lower-cased. What `Add` and
   *  `Use JD wording` produce lands here, which is how the tree knows a child has been
   *  taken out of its group - and how deleting that line puts it straight back. */
  const onScreenWordings = useMemo(() => new Set([
    ...(extractedData.mustHaveSkills || []),
    ...(extractedData.niceToHaveSkills || []),
    ...(extractedData.mustHaveComments || []),
    ...(extractedData.niceToHaveComments || []),
  ].map(t => String(t).trim().toLowerCase())), [
    extractedData.mustHaveSkills, extractedData.niceToHaveSkills,
    extractedData.mustHaveComments, extractedData.niceToHaveComments,
  ]);

  const handleUseJdWording = (
    category: 'mustHaveSkills' | 'niceToHaveSkills', index: number, jdWording: string,
  ) => {
    setExtractedData(prev => {
      const list = [...(prev[category] || [])];
      const current = list[index];
      if (current === undefined) return prev;
      list[index] = jdWording;
      const listKey = category === 'mustHaveSkills' ? 'must_have_skills' : 'nice_to_have_skills';
      const nextTrail = prev.mergeTrail
        .map(e => {
          if (e.survivor !== current || e.list !== listKey) return e;
          // Remove only the NARROWING child: the skill now IS the JD's wording, so there
          // is no difference left to explain. Any genuine merge under the same skill
          // stays - and is re-pointed at the new name, or it would be orphaned (the
          // tree finds a group by the text of the skill it is drawing).
          // Only the SURVIVOR changes. The narrowing child used to be stripped here;
          // now it stays and simply stops being rendered, because the skill it quotes is
          // the skill itself - `visibleTrailEntry` hides any child whose wording is on
          // screen. Renaming the skill back therefore brings the note back, instead of
          // leaving the recruiter with a skill that has silently lost its explanation.
          return { ...e, survivor: jdWording };
        })
        .filter(e => e.removed.length > 0);
      return {
        ...prev,
        [category]: list,
        mergeTrail: nextTrail,
      };
    });
    markExtractedDataModified();
    toast.success({
      title: 'Using the JD wording',
      description: `This skill now reads "${jdWording}", exactly as the job description wrote it.`,
    });
  };

  /**
   * What the collapsed tail of a skills list is hiding, for the "+N more" button.
   * Notes on skills past the preview limit were invisible until the recruiter happened to
   * expand the list - on a 21-skill JD the Docker and Kubernetes notes sat at positions
   * 16 and 17 with nothing on screen to say they existed.
   */
  const hiddenTrailLabel = (category: 'mustHaveSkills' | 'niceToHaveSkills' | 'mustHaveComments' | 'niceToHaveComments') => {
    const listKey = {
      mustHaveSkills: 'must_have_skills',
      niceToHaveSkills: 'nice_to_have_skills',
      mustHaveComments: 'must_have_comments',
      niceToHaveComments: 'nice_to_have_comments',
    }[category];
    const hidden = new Set((extractedData[category] || []).slice(SKILL_PREVIEW_LIMIT));
    let merges = 0;
    let notes = 0;
    for (const raw of extractedData.mergeTrail || []) {
      if (raw.list !== listKey || !hidden.has(raw.survivor)) continue;
      const e = visibleTrailEntry(raw, onScreenWordings);
      if (!e) continue;
      const c = trailCounts(e);
      merges += c.merges;
      notes += c.notes;
    }
    const detail = trailBadgeLabel(merges, notes);
    return detail ? ` · ${detail}` : '';
  };

  /**
   * A JD phrase that landed in no list ("possibly missed"): add it as a skill, or dismiss
   * the flag.
   *
   * DISMISS deletes the entry - the recruiter has judged the phrase irrelevant, and it
   * must not come back. ADD leaves it in place: the flag stops showing because the phrase
   * is now in a list (`visibleTrailEntry`), so deleting that skill puts the flag back
   * rather than losing the JD's phrase for good.
   */
  const handleResolvePossiblyMissed = (
    phrase: string,
    target: MissedTarget | null,
  ) => {
    const destination = MISSED_TARGETS.find(t => t.category === target);
    setExtractedData(prev => {
      if (!target || !destination) {
        return {
          ...prev,
          mergeTrail: prev.mergeTrail.filter(
            e => !(e.source === 'possibly-missed' && e.removed[0] === phrase),
          ),
        };
      }
      const already = (prev[target] || []).some(
        sk => sk.trim().toLowerCase() === phrase.trim().toLowerCase(),
      );
      // The phrase is a fragment of the JD's sentence, so it starts lower-case; it is
      // becoming a list item now, and those read as lines.
      const added = sentenceCaseForList(phrase, destination.listKey);
      return {
        ...prev,
        [target]: already ? prev[target] : [...(prev[target] || []), added],
      };
    });
    markExtractedDataModified();
    if (destination) {
      toast.success({
        title: 'Added to the JD',
        description: `"${phrase}" is now in ${destination.label}.`,
      });
    }
  };

  const handlePromoteGroupedSkill = (survivor: string, removed: string) => {
    // Where this wording goes back to. Usually the survivor's own list; a requirement
    // SENTENCE folded into the skills that cover it goes back to its comments list
    // instead, or a whole sentence would land among the short skill names.
    const LIST_TO_CATEGORY: Record<string, keyof Pick<ExtractedData,
      'mustHaveSkills' | 'niceToHaveSkills' | 'mustHaveComments' | 'niceToHaveComments'>> = {
      must_have_skills: 'mustHaveSkills',
      nice_to_have_skills: 'niceToHaveSkills',
      must_have_comments: 'mustHaveComments',
      nice_to_have_comments: 'niceToHaveComments',
    };
    let landedIn: string = 'skill';
    setExtractedData(prev => {
      const entry = prev.mergeTrail.find(
        e => e.survivor === survivor && e.removed.includes(removed)
      );
      if (!entry) return prev;
      const nextIdx = entry.removed.indexOf(removed);
      const category =
        LIST_TO_CATEGORY[entry.restore_lists?.[nextIdx] || entry.list] || 'mustHaveSkills';
      landedIn = category.endsWith('Comments') ? 'requirement' : 'skill';
      const already = (prev[category] || []).some(
        sk => sk.trim().toLowerCase() === removed.trim().toLowerCase()
      );
      // The child STAYS in the trail. It used to be stripped here, which made "Add" a
      // one-way door: deleting the line it created left nothing to put it back, and the
      // wording only reappeared after a reload (which re-read the stored trail). What
      // decides whether a child is offered is not a flag but the LIST ITSELF - a wording
      // that is on screen is not a group any more, and one that is deleted becomes one
      // again. `visibleTrailEntry` below applies that rule when rendering, and the
      // backend applies the same one in `_consolidate_merge_trail` when saving.
      const added = sentenceCaseForList(removed, entry.restore_lists?.[nextIdx] || entry.list);
      return {
        ...prev,
        [category]: already ? prev[category] : [...(prev[category] || []), added],
      };
    });
    markExtractedDataModified();
    toast.success({
      title: `Added as a separate ${landedIn}`,
      description: `"${removed}" is now tracked on its own instead of as part of "${survivor}".`,
    });
  };

  // Helper: mark extracted data as modified AND reset formatted flag so AI reformatting triggers
  const markExtractedDataModified = () => {
    editedSinceCheckpointRef.current = true;
    setStep2EditedSinceCheckpoint(true);
    if (freshForkIdRef.current) clearFreshDraftVersion(freshForkIdRef.current);
    setExtractedDataModified(true);
    setHasFormattedForReview(false);
  };

  /* ── Industry not on the master list ──────────────────────────────────────────
     The recruiter can accept the industry extraction proposed, or clear it and type
     their own. Either way the value is a NAME, not a code, so `industryType` holds
     PENDING_INDUSTRY_VALUE until Step 3 validates the name and creates the real
     master row. The sentinel exists so that everything which reads `industryType`
     ("is a value chosen?", "which option is selected?") keeps working, while
     anything that resolves it as a code fails loudly instead of quietly writing an
     invented code onto the JD. */
  const handleAddSuggestedIndustry = () => {
    setExtractedData(prev => ({
      ...prev,
      industryType: prev.industrySuggestedName?.trim() ? PENDING_INDUSTRY_VALUE : prev.industryType,
      industryIsCustom: false,
    }));
    markExtractedDataModified();
    setValidationErrors(prev => ({ ...prev, industryType: undefined }));
  };

  /* Clearing drops extraction's rationale with its name — a reason that outlived the
     name it explained would render under whatever the recruiter typed next. Also
     resets `industryType`, because the code the JD was filed under was only ever a
     placeholder for the industry now being replaced. */
  const handleClearSuggestedIndustry = () => {
    setExtractedData(prev => ({
      ...prev,
      industrySuggestedName: '',
      industrySuggestedReason: undefined,
      industryIsCustom: true,
      industryType: prev.industryType === PENDING_INDUSTRY_VALUE ? '' : prev.industryType,
    }));
    markExtractedDataModified();
  };

  const handleCustomIndustryChange = (typed: string) => {
    setExtractedData(prev => ({
      ...prev,
      industrySuggestedName: typed,
      industrySuggestedReason: undefined,
      industryType: typed.trim() ? PENDING_INDUSTRY_VALUE : '',
    }));
    markExtractedDataModified();
    if (typed.trim()) {
      setValidationErrors(prev => ({ ...prev, industryType: undefined }));
    }
  };

  /* Back to the dropdown. The typed name goes with it: leaving it behind would save a
     raw_industry the recruiter has just decided against, and Step 3 would then ask
     them to confirm an industry they are no longer proposing. */
  const handleCancelCustomIndustry = () => {
    setExtractedData(prev => ({
      ...prev,
      industrySuggestedName: undefined,
      industrySuggestedReason: undefined,
      industryIsCustom: false,
      industryType: prev.industryType === PENDING_INDUSTRY_VALUE ? '' : prev.industryType,
    }));
    markExtractedDataModified();
  };

  /* ── Step 3's verdict on a proposed industry ──────────────────────────────────
     Once the gate has settled on a real code - created, adopted, or insisted upon -
     the sentinel is replaced with it. A row the master list did not have a minute
     ago also needs a local option, or the select would fall blank and
     getIndustryLabel would print the code: the backend row exists but this page's
     copy of the list predates it. Inactive on purpose - see activate_pending_industry. */
  const applyResolvedIndustryCode = (code: string, label: string | null | undefined, keepName: boolean) => {
    setIndustryTypes(prev => prev.some(t => t.code === code) ? prev : [
      ...prev,
      {
        id: -Date.now(),
        code,
        label: label || code,
        description: null,
        sort_order: 98,
        is_active: false,
        created_at: '',
        updated_at: '',
      },
    ]);
    setExtractedData(prev => ({
      ...prev,
      industryType: code,
      industrySuggestedName: keepName ? prev.industrySuggestedName : undefined,
      industrySuggestedReason: undefined,
      industryIsCustom: false,
    }));
    markExtractedDataModified();
  };

  /* "Use the one you already have." The proposal is withdrawn with it: saving the
     name as raw_industry would keep proposing an industry the recruiter just
     declined, on every reopen. */
  const handleIndustryGateUseExisting = () => {
    if (!industryGate?.industry_type) return;
    applyResolvedIndustryCode(industryGate.industry_type, industryGate.industry_label, false);
    setIndustryGate(null);
    void advanceToReviewStep();
  };

  /* "Add mine anyway." The recruiter has read the warning; the gate asks, it does
     not block. Force skips the model - it has already given its answer - and mints
     the row, and the review step resumes exactly where it stopped. */
  const handleIndustryGateInsist = async () => {
    const name = extractedData.industrySuggestedName?.trim();
    if (!editingId || !name) return;
    setIsResolvingIndustryGate(true);
    try {
      const result = await jdService.validateIndustry(editingId, name, {
        force: true,
        source: extractedData.industryIsCustom ? 'manual' : 'suggested',
      });
      if (result.outcome === 'created' && result.industry_type) {
        applyResolvedIndustryCode(result.industry_type, result.industry_label || name, true);
        setIndustryGate(null);
        void advanceToReviewStep();
      } else {
        setIndustryGate(result);
      }
    } catch (error) {
      toast.error({
        title: 'Could not add the industry',
        description: friendlyErrorMessage(error, "Please try again."),
      });
    } finally {
      setIsResolvingIndustryGate(false);
    }
  };

  // Track if user has proceeded to extract stage (to disable regenerate button)
  const [hasProceededToExtract, setHasProceededToExtract] = useState(false);

  // Track if user has proceeded to review stage (to make Stage 2 fields read-only)
  const [hasProceededToReview, setHasProceededToReview] = useState(false);

  // Track original Stage 1 values to detect modifications after returning from review
  const [originalStage1Values, setOriginalStage1Values] = useState<{
    jobTitle: string;
    aiPrompt: string;
    generatedJD: string;
    manualJD: string;
  } | null>(null);

  // Save to draft state
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);

  // JD06: Autosave state
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastAutosaveTime, setLastAutosaveTime] = useState<Date | null>(null);

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // What the BROWSER's "Leave site? Changes you made may not be saved" prompt
  // keys on. `hasUnsavedChanges` above only means "the user has entered
  // something" — it is never cleared by autosave on purpose (it also drives the
  // in-app Unsaved Changes dialog and Cancel's delete-the-draft rule). The tab-
  // close prompt instead compares the JD text with what was last saved
  // (loaded draft, autosave, Save as Draft, step saves), so it only fires when
  // there is something genuinely unsaved.
  const currentContentKeyRef = useRef('');
  const savedContentKeyRef = useRef<string | null>(null);
  const markLoadedContentSavedRef = useRef(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  // True when the dialog was raised by the browser Back/Forward buttons rather
  // than an in-app link click, so its resolution has no `pendingNavigation`
  // URL to push and must instead unwind the history trap set up below.
  const [isPendingBackNavigation, setIsPendingBackNavigation] = useState(false);
  // Which leave-prompt action is in flight (its button shows the spinner).
  const [leaveBusy, setLeaveBusy] = useState<'save' | 'discard' | 'delete' | null>(null);
  // Set by the hydration effect when the loaded JD is one the recruiter opened,
  // so the change-tracking effect adopts the loaded text as the checkpoint text.
  const adoptLoadedKeyAsCheckpointRef = useRef(false);

  const setLeaveCheckpoint = (jd: JDResponse, label: string) => {
    leaveCheckpointRef.current = { jd, label };
    setLeaveCheckpointMeta({ label, jobCode: jd.job_id ?? null, status: jd.status, versionNumber: jd.version_number ?? 1 });
    checkpointContentKeyRef.current = currentContentKeyRef.current;
    editedSinceCheckpointRef.current = false;
    setCheckpointContentKey(currentContentKeyRef.current);
    setStep2EditedSinceCheckpoint(false);
  };
  // A step save is a checkpoint only for a job created in this visit — it has
  // no "as opened" version to return to. An existing JD keeps the version the
  // recruiter opened: clicking Next is not a decision to keep the edits.
  const markStepSaveCheckpoint = (jd: JDResponse | undefined, label: string) => {
    if (!jd || jd.id !== createdInSessionIdRef.current) return;
    setLeaveCheckpoint(jd, label);
  };

  // Cancel JD creation state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  /* Does the JD text invite freshers? Decided by the backend
     (`openai_service.jd_welcomes_freshers`), which is the only copy of the rule -
     read here from the extraction response and from the JD on reload, never
     re-derived in TypeScript.

     Kept out of `extractedData` deliberately: that object is what Step 2 SAVES, and
     this is a fact about the JD text, not a field the recruiter edits. */
  const [jdWelcomesFreshers, setJdWelcomesFreshers] = useState(false);
  /* Raised when the recruiter ticks "Required field" on a JD that both states a
     minimum and welcomes freshers. Holds nothing but the fact that the tick is
     pending confirmation - see the dialog at the end of this file. */
  const [showExperienceContradictionDialog, setShowExperienceContradictionDialog] = useState(false);

  /* Step 3's answer about an industry the master list does not carry, while the
     recruiter decides what to do with it. Only `duplicate` and `contradiction` land
     here - `created` needs no decision and never opens a dialog. Null = no question
     pending. Same asks-does-not-block contract as the experience dialog above. */
  const [industryGate, setIndustryGate] = useState<IndustryValidationResponse | null>(null);
  const [isResolvingIndustryGate, setIsResolvingIndustryGate] = useState(false);
  /* Always the CURRENT advanceToReviewStep. The gate resolves an industry by
     updating state and then re-running the transition; the closure that started the
     transition still holds the old extractedData (sentinel and all), so it must
     re-enter through a fresh closure, not call itself. */
  const advanceToReviewStepRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    advanceToReviewStepRef.current = advanceToReviewStep;
  });

  // Master data state - initialized with fallback data so dropdowns work immediately
  const [experienceLevels, setExperienceLevels] = useState<ExperienceLevel[]>(FALLBACK_EXPERIENCE_LEVELS);
  const [educationLevels, setEducationLevels] = useState<EducationLevel[]>(FALLBACK_EDUCATION_LEVELS);
  const [industryTypes, setIndustryTypes] = useState<IndustryType[]>(FALLBACK_INDUSTRY_TYPES);
  const [masterDataLoading, setMasterDataLoading] = useState(false);  // Set to false since we have fallback data
  const [showCustomExperienceInput, setShowCustomExperienceInput] = useState(false);

  // TRUE for the duration of one extraction that must REPLACE everything, not merge.
  //
  // Reaching the extraction call at all means Step 1 changed (or we have no baseline):
  // every "nothing changed" path in handleNext returns early before it. So whatever is
  // currently in Step 2 was derived from DIFFERENT Step 1 content and is stale by
  // definition - the JD text, the title or the prompt no longer matches it.
  //
  // Without this, two preservation rules silently kept that stale data:
  //   isEditMode        -> merged old list values in when the new extraction returned fewer
  //   preserveUserEdits -> DISCARDED the new extraction outright if the recruiter had
  //                        edited anything in Step 2 (extractedDataModified)
  // So a recruiter who edited Step 2, went back, rewrote the JD and pressed Next got the
  // OLD requirements against the NEW description. Applies to every state - new, draft,
  // published edit and version fork - because all four run through this same call.
  const forceFreshExtraction = useRef(false);

  // JD22 - the last Additional Details value EXTRACTION put in the box, so a later
  // extraction can tell its own leftovers from something a person typed.
  //
  // The rule "the recruiter's text always wins, extraction only fills an empty box"
  // protects hand-written text, but with nothing recording where the current text came
  // from it also protected the PREVIOUS JD's auto-filled text: uploading JD A and then
  // JD B left A's shift timings sitting in B's box, and B's own were discarded as the
  // loser of a conflict that never involved a human. Comparing against this ref keeps
  // both halves honest - text that differs from what extraction last wrote was touched
  // by the recruiter and is untouchable; text that matches is extraction's own and may
  // be replaced by a newer extraction.
  const extractionFilledAdditionalDetails = useRef('');

  // What the recruiter is CURRENTLY typing in the experience From/To boxes, before it
  // is normalized. null = not editing, so the boxes show the canonical stored value.
  //
  // Why this exists: the stored value is a canonical string ("7+ Years", "4-7 Years")
  // that is re-parsed on every render, and the parser applies Math.min/Math.max to put
  // the bounds in order. That ran on EVERY KEYSTROKE, so an incomplete number was
  // treated as final. Starting from min=7 and typing "10" into the To box:
  //     "1"   -> "7-1 Years"  -> parser swaps -> From=1, To=7
  //     "0"   -> continues from the SWAPPED values -> From=1, To=10
  // The recruiter's 7 was destroyed and the digits they typed landed in the wrong box.
  // Holding the raw text while focused, and normalizing once on blur, fixes it.
  const [experienceDraft, setExperienceDraft] = useState<{ from: string; to: string } | null>(null);

  // Fetch master data on mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const data = await masterDataService.getAll();
        console.log('[TalentFlow] Master data loaded:', {
          education_levels: data.education_levels?.map(e => e.code),
          experience_levels: data.experience_levels?.map(e => e.code),
          industry_types: data.industry_types?.length
        });

        // Use API data if available, otherwise use fallback
        const resolvedExperienceLevels = data.experience_levels?.length > 0 ? data.experience_levels : FALLBACK_EXPERIENCE_LEVELS;
        setExperienceLevels(resolvedExperienceLevels);
        setEducationLevels(data.education_levels?.length > 0 ? data.education_levels : FALLBACK_EDUCATION_LEVELS);
        setIndustryTypes(data.industry_types?.length > 0 ? data.industry_types : FALLBACK_INDUSTRY_TYPES);
        // So the experience badge shown later on this same JD (summary card,
        // published view) resolves its word against Configuration right away,
        // not just the hardcoded standard-level dictionary.
        setConfiguredExperienceLevels(resolvedExperienceLevels);

        if (!data.experience_levels?.length) {
          console.log('[TalentFlow] No experience levels from API, using fallback');
        }
      } catch (error) {
        console.log('[TalentFlow] Failed to fetch master data, using fallback:', error);
        // Use fallback data on error
        setExperienceLevels(FALLBACK_EXPERIENCE_LEVELS);
        setEducationLevels(FALLBACK_EDUCATION_LEVELS);
        setIndustryTypes(FALLBACK_INDUSTRY_TYPES);
      } finally {
        setMasterDataLoading(false);
      }
    };

    fetchMasterData();
  }, []);

  const getExperienceLevelByCode = (value?: string | null): ExperienceLevel | undefined => {
    const normalized = value?.trim() || '';
    if (!normalized) return undefined;
    return experienceLevels.find((level) => level.code === normalized);
  };

  // Mirrors the backend's _fold_months_into_years(). "7 years 6 months" is ONE figure
  // (7.5), not a 7 with a stray 6. The months must sit IMMEDIATELY after the years so an
  // unrelated later duration is never absorbed, and only a sub-year remainder folds -
  // "5 years, 18 months of which in leadership" is a separate duration, not a fraction.
  //
  // It ALSO converts a MIXED-UNIT range, where one bound is in months and the other in
  // years: "6 months to 1 year" becomes "0.5 to 1 years". Without this the months bound
  // was invisible to every pattern below - the year figure matched as a lone single
  // figure, so "6 months to 1 year" became a MINIMUM of 1 year and the six-month floor
  // vanished, turning a capped 0.5-1 band into an open-ended "1+ years". Entry-level
  // requirements are routinely written this way across industries: "6 months to 1 year"
  // (retail, hospitality, warehouse), "6 months to 2 years" (drivers, security, care
  // assistants), "3 months to 1 year" (internships, apprenticeships).
  const foldMonthsIntoYears = (text: string): string => {
    // ORDER IS LOAD-BEARING: fold "N years M months" FIRST, or the mixed-unit passes
    // below would find the "6 months to 5 years" inside "2 years 6 months to 5 years"
    // and tear that phrase apart.
    let out = text.replace(
      /(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:,\s*)?(?:and\s+)?(\d{1,2})\s*(?:months?|mos?\b)/gi,
      (whole, y: string, m: string) => {
        const months = Number(m);
        if (months <= 0 || months >= 12) return whole;
        return `${Number((Number(y) + months / 12).toFixed(1))} years`;
      },
    );

    // Only a genuine range separator is accepted ("to", "-", en/em dash) and never
    // "and" - "2 years and 6 months" is ONE figure, already folded above, so letting
    // "and" through would turn it into a nonsensical 2-to-0.5 range.
    // ONE decimal place, matching the DECIMAL(4,1) column and the backend's
    // _months_to_years(). At 2 decimals the frontend produced 0.25 for "3 months"
    // while the column can only hold 0.3, so the value changed under the recruiter
    // on save-and-reload. Keep in sync with _MONTHS_YEARS_DECIMALS in the backend.
    const toYearsText = (n: number) => Number((n / 12).toFixed(1));
    out = out.replace(
      /(\d{1,3})\s*(?:months?|mos?)\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?)/gi,
      (_whole, mo: string, yr: string) => `${toYearsText(Number(mo))} to ${Number(yr)} years`,
    );
    // The reverse order ("1 year to 18 months"): without this the 18-month upper bound
    // is lost and the requirement becomes an open-ended "1+".
    out = out.replace(
      /(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:-|–|—|to)\s*(\d{1,3})\s*(?:months?|mos?)/gi,
      (_whole, yr: string, mo: string) => `${Number(yr)} to ${toYearsText(Number(mo))} years`,
    );
    return out;
  };

  const inferExperienceRangeFromCustomValue = (value?: string | null): { experienceMin?: number; experienceMax?: number } => {
    // Fold "N years M months" BEFORE any pattern below sees the text.
    const normalized = foldMonthsIntoYears(value?.toLowerCase().trim() || '');
    if (!normalized) return {};

    // Mirrors the backend's _EXP_RANGE_RE. The optional `\+?` and unit word after the
    // FIRST number let "5+ years to 8 years" / "5 years to 8 years" / "5+ to 8 years"
    // match as ONE range. Without them the match died at the first number, fell through
    // to the `plusMatch` branch below, and returned min=5 with NO max - dropping the
    // upper bound the recruiter typed. Keep in sync with the backend regex.
    // The unit after the SECOND number is MANDATORY, mirroring the backend's
    // _EXP_RANGE_RE. Without it this matched any "A to B" pair: "Manage a team of 5-8
    // people" became 5-8 years, and "12 to 24 months" became 12-24 YEARS. The unit
    // before the connector stays optional so "5+ years to 8 years" still matches.
    const rangeMatch = normalized.match(/(\d{1,2}(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)?\s*(?:-|to|–)\s*(\d{1,2}(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/);
    if (rangeMatch) {
      const first = Number(rangeMatch[1]);
      const second = Number(rangeMatch[2]);
      if (!Number.isNaN(first) && !Number.isNaN(second)) {
        return {
          experienceMin: Math.min(first, second),
          experienceMax: Math.max(first, second),
        };
      }
    }

    // A stated CEILING, before the floor branches below. Mirrors the backend's
    // _EXP_CEILING_RE - keep the two in sync.
    //
    // Reported 2026-09-24: "Upto 6 years" fell through to `singleMatch` and came back
    // as experienceMin: 6, so Step 2 put the recruiter's MAXIMUM in the From box and
    // left To empty. That also drove the second half of the report - with no To value
    // `experienceHasCeiling` is false, so "Allow Overqualified" was forced to Yes and
    // No was greyed out, on a JD that had stated an upper bound all along.
    //
    // Returns only experienceMax: the JD stated no floor, so From stays empty.
    const ceilingMatch = normalized.match(
      /(?:(?:up\s*to|upto|at\s+most|no\s+more\s+than|not\s+more\s+than|maximum|max\.?|less\s+than|under|below|fewer\s+than)\s*(?:of\s+)?(?:experience\s*)?:?\s*(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?)\b|(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:or\s+(?:less|fewer|below)|maximum|max\.?)\b)/
    );
    if (ceilingMatch) {
      const years = Number(ceilingMatch[1] ?? ceilingMatch[2]);
      if (!Number.isNaN(years)) {
        return { experienceMax: years };
      }
    }

    const plusMatch = normalized.match(/(\d{1,2}(?:\.\d+)?)\s*(?:\+|plus|or more|and above)/);
    if (plusMatch) {
      const years = Number(plusMatch[1]);
      if (!Number.isNaN(years)) {
        return { experienceMin: years };
      }
    }

    // Unit required, mirroring the backend. Without it "minimum 6 months" matched
    // "minimum 6" and returned SIX YEARS.
    const minimumMatch = normalized.match(/(?:minimum|min\.?|at least)\s*(?:of\s*)?(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?)\b/);
    if (minimumMatch) {
      const years = Number(minimumMatch[1]);
      if (!Number.isNaN(years)) {
        return { experienceMin: years };
      }
    }

    const singleMatch = normalized.match(/(\d{1,2}(?:\.\d+)?)\s*(?:years?|yrs?)/);
    if (singleMatch) {
      const years = Number(singleMatch[1]);
      if (!Number.isNaN(years)) {
        return { experienceMin: years };
      }
    }

    // MONTHS-ONLY fallback, mirroring the backend's _months_only_range(). Reached only
    // when the text states no YEAR figure at all, so months can never dilute a stated
    // year. Without this, "6 months of experience" parsed to nothing, the level was left
    // to a guess, and the field came back as a whole band ("2 to 4 years") that the JD
    // never asked for. Months-only requirements are normal outside office hiring:
    // "18 months clinical" (nursing), "12 to 24 months" (apprenticeships, trades),
    // "6 months" (hospitality, retail, warehouse).
    const monthRange = normalized.match(/(\d{1,3})\s*(?:months?)?\s*(?:-|to|\u2013)\s*(\d{1,3})\s*months?/);
    if (monthRange) {
      const lo = Number(monthRange[1]) / 12;
      const hi = Number(monthRange[2]) / 12;
      if (!Number.isNaN(lo) && !Number.isNaN(hi)) {
        return {
          experienceMin: Number(Math.min(lo, hi).toFixed(1)),
          experienceMax: Number(Math.max(lo, hi).toFixed(1)),
        };
      }
    }

    const monthsOnly = normalized.match(/(\d{1,3})\s*months?/);
    if (monthsOnly) {
      const years = Number(monthsOnly[1]) / 12;
      if (!Number.isNaN(years)) {
        return { experienceMin: Number(years.toFixed(1)) };
      }
    }

    return {};
  };

  // ── NUMBERS-FIRST experience helpers ──────────────────────────────────────
  // The experience field stores the recruiter's ACTUAL years as a canonical
  // "From-To Years" string ("4-7 Years", "7+ Years") instead of a fixed level
  // bucket. These helpers convert between that string and raw numbers, and
  // derive a level CODE from the numbers so downstream screens/scoring that read
  // job_level keep working unchanged.
  const buildExperienceYearsString = (min?: number | null, max?: number | null): string => {
    const hasMin = min !== null && min !== undefined && !Number.isNaN(Number(min));
    const hasMax = max !== null && max !== undefined && !Number.isNaN(Number(max));
    if (hasMin && hasMax) return `${Number(min)}-${Number(max)} Years`;
    if (hasMin) return `${Number(min)}+ Years`;
    if (hasMax) return `0-${Number(max)} Years`;
    return '';
  };

  const parseExperienceYearsString = (value?: string | null): { from: string; to: string } => {
    const range = inferExperienceRangeFromCustomValue(value || '');
    return {
      from: range.experienceMin !== undefined ? String(range.experienceMin) : '',
      to: range.experienceMax !== undefined ? String(range.experienceMax) : '',
    };
  };

  /* The contradiction itself: the JD invites freshers AND states a minimum above
     zero. Both halves are needed - a fresher JD with "0-2 years" says the same thing
     twice and is no contradiction at all - and the minimum is read from the box the
     recruiter can edit, so correcting From to 0 clears the warning on the spot. */
  const experienceContradiction = (() => {
    if (!jdWelcomesFreshers) return false;
    const { from } = parseExperienceYearsString(extractedData.experience);
    const years = Number((from ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(years) && years > 0;
  })();

  // RS20: Job Hopping auto-default, kept in sync with the backend's
  // app/utils/job_hopping.py (same >= 3 years rule, same numeric-only
  // comparison - no string/regex parsing, so it can't hit the decimal-parsing
  // bug the old backend skip logic had). Recomputes live whenever the
  // recruiter changes Experience, which is "always live-recompute": the
  // checkbox below reflects the current experience-derived default unless the
  // recruiter clicks it, and clicking it only holds until Experience next
  // changes - there is no separate persisted "manual override" state.
  const jobHoppingAutoDefault = (() => {
    const { from, to } = parseExperienceYearsString(extractedData.experience);
    const min = from === '' ? 0 : Number(from);
    const max = to === '' ? 0 : Number(to);
    return Math.max(min, max) >= 3;
  })();

  useEffect(() => {
    setExtractedData(prev =>
      prev.jobHoppingEnabled === jobHoppingAutoDefault
        ? prev
        : { ...prev, jobHoppingEnabled: jobHoppingAutoDefault }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedData.experience]);

  // "Allow Overqualified Candidates = No" needs a CEILING to exceed. A floor-only
  // requirement ("5+ years") has no upper bound, so nothing can significantly
  // exceed it, yet the scorer's No-branch told the model to penalise "roughly
  // double the upper bound, or a clearly senior candidate against a mid-level JD"
  // and the model fell back on the level word alone - a Senior Backend Developer
  // was rejected as overqualified for a "5+ years" Senior Backend Developer JD.
  // Recruiter decision 2026-09-23: with no To value the choice is forced to Yes
  // and No is disabled; with both From and To the recruiter picks. The backend
  // stores and scores the same way (app/utils/overqualified.py), so a row saved
  // before this rule is scored as Yes too.
  const experienceHasCeiling = (() => {
    const { to } = parseExperienceYearsString(extractedData.experience);
    const ceiling = Number((to ?? '').replace(/[^0-9.]/g, ''));
    return to !== '' && Number.isFinite(ceiling) && ceiling > 0;
  })();

  useEffect(() => {
    if (experienceHasCeiling) return;
    setExtractedData(prev =>
      prev.allowOverqualified === true ? prev : { ...prev, allowOverqualified: true }
    );
    setValidationErrors(prev => (prev.allowOverqualified ? { ...prev, allowOverqualified: undefined } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceHasCeiling]);

  // A Step 2 required-field error goes as soon as its field satisfies the same
  // rule Next checks - one place, so it clears however the field got filled.
  // Only the "is required" messages Next sets: Experience also carries its own
  // range / English-only errors, which their own handlers manage.
  useEffect(() => {
    setValidationErrors(prev => {
      const next = { ...prev };
      if (prev.mustHaveSkills === STEP2_REQUIRED_MESSAGES.mustHaveSkills && (extractedData.mustHaveSkills?.length ?? 0) > 0) next.mustHaveSkills = undefined;
      if (prev.experience === STEP2_REQUIRED_MESSAGES.experience && extractedData.experience?.trim()) next.experience = undefined;
      if (prev.industryType === STEP2_REQUIRED_MESSAGES.industryType && extractedData.industryType?.trim()) next.industryType = undefined;
      if (prev.locations && (!extractedData.locationsRequired || (extractedData.locations?.length ?? 0) > 0)) next.locations = undefined;
      if (prev.allowOverqualified
          && (!experienceHasCeiling || (extractedData.allowOverqualified !== null && extractedData.allowOverqualified !== undefined))) {
        next.allowOverqualified = undefined;
      }
      const changed = (Object.keys(prev) as Array<keyof typeof prev>).some(k => prev[k] !== next[k]);
      return changed ? next : prev;
    });
  }, [
    extractedData.mustHaveSkills,
    extractedData.experience,
    extractedData.industryType,
    extractedData.locations,
    extractedData.locationsRequired,
    extractedData.allowOverqualified,
    experienceHasCeiling,
  ]);

  const deriveExperienceCodeFromYears = (min?: number | null, max?: number | null): string => {
    const hasMin = min !== null && min !== undefined && !Number.isNaN(Number(min));
    const hasMax = max !== null && max !== undefined && !Number.isNaN(Number(max));
    const minVal = hasMin ? Number(min) : null;
    const maxVal = hasMax ? Number(max) : null;
    const value = minVal ?? maxVal;
    if (value === null) return '';
    const levels = experienceLevels || [];
    if (levels.length) {
      const lo = (l: ExperienceLevel) => l.min_years ?? 0;
      const hi = (l: ExperienceLevel) => (l.max_years == null ? Number.POSITIVE_INFINITY : l.max_years);
      const width = (l: ExperienceLevel) => hi(l) - lo(l);

      // When BOTH bounds are known, a band that contains the WHOLE entered range
      // wins over one that only happens to contain a single edge of it. Without
      // this, a range that exactly equals a configured band's own years (e.g.
      // 2-4, Junior's band) tied on width against the band it merely borders
      // (Entry's 0-2, sharing the boundary at 2) and the tie-break below kept
      // whichever came first in the list - mislabelling Junior's own range as
      // Entry Level.
      if (minVal !== null && maxVal !== null) {
        const fullyContaining = levels.filter((l) => minVal >= lo(l) && maxVal <= hi(l));
        if (fullyContaining.length) {
          fullyContaining.sort((a, b) => width(a) - width(b) || lo(b) - lo(a));
          return fullyContaining[0].code;
        }
      }

      const containing = levels.filter((l) => value >= lo(l) && value <= hi(l));
      if (containing.length) {
        containing.sort((a, b) => width(a) - width(b));
        return containing[0].code;
      }
      const byMin = [...levels].sort((a, b) => lo(b) - lo(a));
      if (byMin.length) return byMin[0].code;
    }
    // Fallback thresholds when master levels are unavailable.
    if (value >= 7) return 'senior';
    if (value >= 5) return 'mid';
    if (value >= 2) return 'junior';
    return 'entry';
  };

  /**
   * Does the job title name a seniority grade at all?
   *
   * Only asked to decide whether the lowest-level default below is safe. The backend
   * (infer_experience_level_from_title) owns the real mapping and returns an EMPTY level
   * for a title whose signals disagree - "Senior Construction Manager" is both senior
   * and management, so it refuses to pick and leaves the field for the recruiter. That
   * empty answer would otherwise land here and be filled with Entry Level (0-2 years),
   * turning "we could not tell" into the most junior band on the list - a worse guess
   * than the one the backend just declined to make.
   *
   * Deliberately a coarse "is any grade mentioned" test, NOT a copy of the backend's
   * table: it never has to say WHICH grade, so it cannot drift into disagreeing with it.
   */
  const TITLE_MENTIONS_SENIORITY =
    /(?:senior|sr\.?|lead|principal|staff|chief|head|director|manager|supervisor|foreman|matron|architect|mid[\s-]?level|intermediate|experienced|junior|jr\.?|associate|assistant|intern|trainee|apprentice|graduate|fresher|entry[\s-]?level|vice\s+president|managing\s+director)/i;

  // NO DEFAULTS (recruiter decision 2026-09-23): a JD that states neither years nor a
  // grade word gets an EMPTY experience, never the lowest master band. The master
  // bands exist to map a level word to years, not to stand in for something the JD
  // never said - a defaulted "Entry Level (0-2)" was persisted as job_level and the
  // scorer then judged every candidate against a requirement nobody wrote. Experience
  // is a required Step 2 field, so the recruiter types the real years instead.
  // `_skillCount` stays in the signature for the callers; it no longer changes the
  // outcome (the old rule only used it to decide WHEN to default).
  const applyExperienceFallback = (mapped: string, _skillCount: number): string => mapped;

  const resolveExperiencePayload = (value?: string | null) => {
    const normalized = value?.trim() || '';
    if (!normalized) {
      return {
        jobLevel: undefined,
        experienceMin: undefined,
        experienceMax: undefined,
        isCustom: false,
      };
    }

    const experienceLevel = getExperienceLevelByCode(normalized);
    if (experienceLevel) {
      return {
        jobLevel: experienceLevel.code,
        experienceMin: experienceLevel.min_years ?? undefined,
        experienceMax: experienceLevel.max_years ?? undefined,
        isCustom: false,
      };
    }

    const { experienceMin, experienceMax } = inferExperienceRangeFromCustomValue(normalized);
    // Derive a level CODE from the raw years so downstream consumers that read
    // job_level (scoring, interview, list/badge screens) keep working; keep the
    // raw text only if no master level maps to the number.
    const derivedCode = deriveExperienceCodeFromYears(experienceMin, experienceMax);
    return {
      jobLevel: derivedCode || normalized,
      experienceMin,
      experienceMax,
      isCustom: true,
    };
  };

  /**
   * The level code a fresh extraction's WORDS settled, or '' when the level was
   * derived from the years (or nothing was found). Only the backend decides this -
   * app/utils/experience_level_words.py is the one copy of the rule - so this reads
   * its answer and checks the code exists in the tenant's master levels.
   */
  const levelWordFromParams = (params: {
    experience_level?: string | null;
    experience_level_source?: string | null;
  }): string => {
    if (params.experience_level_source !== 'title' && params.experience_level_source !== 'text') return '';
    const code = (params.experience_level || '').trim();
    return code && getExperienceLevelByCode(code) ? code : '';
  };

  const resolvePersistedExperiencePayload = (
    value?: string | null,
    yearsWereExplicit: boolean = experienceYearsExplicit,
    levelWord: string = experienceLevelWord
  ) => {
    const payload = resolveExperiencePayload(value);
    // Only years the JD or the recruiter STATED are persisted. This used to also
    // persist any parsable "custom" years string, which included the From/To that
    // a level word prefills from the master band ("Senior" -> "7-10 Years"): the
    // band's numbers reached experience_min/max and the scorer judged candidates
    // against "Senior Level (7-10 years)" for a JD that only ever said "Senior".
    // `yearsWereExplicit` is set by every path that knows where the years came
    // from (extraction, generation, the From/To boxes, reopening a saved JD).
    const shouldPersistYears = yearsWereExplicit;
    // WORDS FIRST, then the JD's own years, then NOTHING. A grade the JD names is the
    // level whatever the boxes say. Without one, the level is mapped from years the
    // JD (or the recruiter) actually stated. Years that were only prefilled from a
    // master band - a level word's From/To, shown so the boxes are not blank - are
    // not the JD's values, so they persist no level either: scoring must run on the
    // given JD only, never on our defaults.
    const persistedJobLevel = levelWord
      || (shouldPersistYears ? payload.jobLevel : undefined);

    // Use `null` (never `undefined`) for "no value" here: this is the payload
    // that gets JSON-serialized straight into the save request. A `null` key
    // survives JSON.stringify and tells the backend's exclude_unset PATCH to
    // clear the column; an `undefined` key gets dropped from the request body
    // entirely, so the backend never sees the field and leaves whatever value
    // was already persisted from an earlier save untouched. That mismatch is
    // exactly what let a stale experience_max from a previous extraction
    // survive a refresh after a later extraction correctly found no max.
    return {
      ...payload,
      jobLevel: persistedJobLevel,
      experienceMin: shouldPersistYears ? (payload.experienceMin ?? null) : null,
      experienceMax: shouldPersistYears ? (payload.experienceMax ?? null) : null,
      yearsWereExplicit: shouldPersistYears,
    };
  };

  const mapExtractedExperienceValue = (
    params: {
      experience_min?: number | string | null;
      experience_max?: number | string | null;
      experience_level?: string | null;
      job_level?: string | null;
    },
    jdText: string
  ): string => {
    let experienceValue = '';

    const expMin = params.experience_min !== null && params.experience_min !== undefined
      ? Number(params.experience_min)
      : null;
    const expMax = params.experience_max !== null && params.experience_max !== undefined
      ? Number(params.experience_max)
      : null;

    const hasExpMin = expMin !== null && !Number.isNaN(expMin);
    const hasExpMax = expMax !== null && !Number.isNaN(expMax);

    const mapToExperienceCode = (min: number, max: number | null, text: string): string => {
      if (min >= 10 || (max && max >= 10)) {
        const jdLower = text.toLowerCase();
        const isArchitect = jdLower.includes('architect')
          || jdLower.includes('system design')
          || jdLower.includes('architecture')
          || jdLower.includes('technical design')
          || jdLower.includes('solution design');
        const isManagement = jdLower.includes('management')
          || jdLower.includes('leadership')
          || jdLower.includes('strategic planning')
          || jdLower.includes('team lead')
          || jdLower.includes('director')
          || jdLower.includes('head of');

        if (isArchitect && !isManagement) return 'architect';
        if (isManagement) return 'management';
        return 'senior';
      }

      if (min >= 7 || (max && max >= 7 && min >= 5)) return 'senior';
      if (min >= 5 || (max && max >= 7 && min >= 4)) return 'mid';
      if (min >= 2 || (max && max >= 4 && min >= 1)) return 'junior';
      return 'entry';
    };

    // Disambiguate overlapping open-ended (10+) levels like Architect vs Management
    // using JD keywords, against whatever master levels tie.
    const disambiguateSeniorLevel = (candidates: ExperienceLevel[], text: string): string => {
      const t = (text || '').toLowerCase();
      const isArchitect = t.includes('architect') || t.includes('architecture') || t.includes('system design') || t.includes('technical design') || t.includes('solution design');
      const isManagement = t.includes('management') || t.includes('leadership') || t.includes('strategic planning') || t.includes('team lead') || t.includes('director') || t.includes('head of');
      const find = (kw: string) => candidates.find(l => `${l.code} ${l.label}`.toLowerCase().includes(kw));
      if (isArchitect && !isManagement) { const a = find('architect'); if (a) return a.code; }
      if (isManagement) { const m = find('manage'); if (m) return m.code; }
      const s = find('senior'); if (s) return s.code;
      return candidates[0].code;
    };

    // DYNAMIC: snap the extracted years to the MASTER experience level whose
    // [min_years, max_years] range contains the value. Tightest range wins, so a
    // custom "Fresher (0-0)" level is chosen over "Entry Level (0-2)" for 0 years.
    // Adding/renaming a level in the master table is reflected here automatically.
    const matchExperienceCodeByYears = (min: number | null, max: number | null, text: string): string => {
      const levels = experienceLevels || [];
      if (!levels.length) return '';
      const hasMin = min != null && !Number.isNaN(min);
      const hasMax = max != null && !Number.isNaN(max);
      const value = hasMin ? min : (hasMax ? max : null);
      if (value == null) return '';
      const rangeOf = (l: ExperienceLevel) => ({ lo: l.min_years ?? 0, hi: l.max_years == null ? Number.POSITIVE_INFINITY : l.max_years });

      // A band that contains the ENTIRE extracted range wins outright over one that
      // merely contains a single edge of it. Without this, an extracted "2-4 years"
      // (Junior's own configured band) tied on width against Entry's 0-2 - which only
      // shares the boundary at 2 - and the lowest-floor tie-break below picked Entry,
      // mislabelling Junior's own range as Entry Level.
      if (hasMin && hasMax) {
        const fullyContaining = levels.filter(l => { const { lo, hi } = rangeOf(l); return min! >= lo && max! <= hi; });
        if (fullyContaining.length) {
          fullyContaining.sort((a, b) => {
            const ra = rangeOf(a); const rb = rangeOf(b);
            const wa = ra.hi - ra.lo; const wb = rb.hi - rb.lo;
            if (wa !== wb) return wa - wb;
            return rb.lo - ra.lo;              // on a tie, the band this range actually starts at
          });
          const r0 = rangeOf(fullyContaining[0]);
          const tied = fullyContaining.filter(l => { const r = rangeOf(l); return (r.hi - r.lo) === (r0.hi - r0.lo) && r.lo === r0.lo; });
          return tied.length > 1 ? disambiguateSeniorLevel(tied, text) : fullyContaining[0].code;
        }
      }

      let candidates = levels.filter(l => { const { lo, hi } = rangeOf(l); return value >= lo && value <= hi; });
      if (candidates.length === 0) {
        // Above every finite range → the highest level(s) (greatest min_years).
        const byMin = [...levels].sort((a, b) => (b.min_years ?? 0) - (a.min_years ?? 0));
        const topMin = byMin[0].min_years ?? 0;
        const top = byMin.filter(l => (l.min_years ?? 0) === topMin);
        return top.length > 1 ? disambiguateSeniorLevel(top, text) : byMin[0].code;
      }
      if (candidates.length > 1) {
        candidates = [...candidates].sort((a, b) => {
          const ra = rangeOf(a); const rb = rangeOf(b);
          const wa = ra.hi - ra.lo; const wb = rb.hi - rb.lo;
          if (wa !== wb) return wa - wb;         // tightest range first
          return ra.lo - rb.lo;                  // then lowest floor
        });
        const r0 = rangeOf(candidates[0]);
        const tied = candidates.filter(l => { const r = rangeOf(l); return (r.hi - r.lo) === (r0.hi - r0.lo) && r.lo === r0.lo; });
        if (tied.length > 1) return disambiguateSeniorLevel(tied, text);
      }
      return candidates[0].code;
    };

    // DYNAMIC: match an extracted level WORD (e.g. "senior", "fresher") to a master
    // level by code or label. Falls through to the legacy alias map below.
    const matchExperienceCodeByWord = (word: string): string => {
      const levels = experienceLevels || [];
      if (!levels.length || !word) return '';
      const norm = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!norm) return '';
      const exact = levels.find(l => l.code.toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
      if (exact) return exact.code;
      const partial = levels.find(l => {
        const lbl = l.label.toLowerCase().replace(/[^a-z0-9]/g, '');
        const code = l.code.toLowerCase().replace(/[^a-z0-9]/g, '');
        return lbl.includes(norm) || norm.includes(code);
      });
      return partial ? partial.code : '';
    };

    if (hasExpMin || hasExpMax) {
      const min = hasExpMin ? expMin! : 0;
      const max = hasExpMax ? expMax : null;
      // Master-driven range match first; fall back to the hardcoded thresholds.
      experienceValue = matchExperienceCodeByYears(hasExpMin ? min : null, max, jdText)
        || mapToExperienceCode(min, max, jdText);
    }

    const rawExperienceValue = (params.job_level || params.experience_level || '').trim();
    if (!experienceValue && rawExperienceValue) {
      const levelMap: Record<string, string> = {
        entry: 'entry',
        entrylevel: 'entry',
        fresher: 'entry',
        fresh: 'entry',
        noexperience: 'entry',
        graduate: 'entry',
        trainee: 'entry',
        junior: 'junior',
        juniorlevel: 'junior',
        associate: 'junior',
        mid: 'mid',
        midlevel: 'mid',
        intermediate: 'mid',
        experienced: 'mid',
        senior: 'senior',
        seniorlevel: 'senior',
        lead: 'senior',
        teamlead: 'senior',
        principal: 'senior',
        architect: 'architect',
        solutionarchitect: 'architect',
        technicalarchitect: 'architect',
        systemarchitect: 'architect',
        architectlevel: 'architect',
        management: 'management',
        manager: 'management',
        director: 'management',
        head: 'management',
        executive: 'management',
        vp: 'management',
        cto: 'management',
        ceo: 'management',
        managementlevel: 'management',
      };

      const normalizedLevel = rawExperienceValue.toLowerCase().replace(/[^a-z]/g, '');
      // Master-driven word match first; fall back to the hardcoded alias map.
      experienceValue = matchExperienceCodeByWord(rawExperienceValue) || levelMap[normalizedLevel] || '';

      if (!experienceValue) {
        if (normalizedLevel.includes('entry')) experienceValue = 'entry';
        else if (normalizedLevel.includes('junior')) experienceValue = 'junior';
        else if (normalizedLevel.includes('mid')) experienceValue = 'mid';
        else if (normalizedLevel.includes('senior')) experienceValue = 'senior';
        else if (normalizedLevel.includes('architect')) experienceValue = 'architect';
        else if (normalizedLevel.includes('management') || normalizedLevel.includes('manager')) experienceValue = 'management';
      }

      if (!experienceValue) {
        // Could not resolve the level word → let the caller apply its fallback.
        return '';
      }
    }

    // NUMBERS-FIRST OUTPUT: always return a canonical "From-To Years" string.
    // - explicit years in the JD -> use those numbers verbatim
    // - only a level word         -> use the matched master level's From/To years
    if (hasExpMin || hasExpMax) {
      return buildExperienceYearsString(hasExpMin ? expMin : null, hasExpMax ? expMax : null);
    }
    const matchedLevel = getExperienceLevelByCode(experienceValue);
    return matchedLevel ? buildExperienceYearsString(matchedLevel.min_years, matchedLevel.max_years) : '';
  };


  // Check max_jobs quota on mount
  useEffect(() => {
    const checkJobQuota = async () => {
      const canCreate = await checkQuota('max_jobs', 1);
      setQuotaChecked(true);
      if (!canCreate) {
        toast.warning({
          title: 'Job Quota Limit Reached',
          description: 'You have reached your maximum job posting limit. Please upgrade your plan to create more jobs.',
        });
      }
    };
    checkJobQuota();
  }, [checkQuota]);

  // JD06: Autosave as draft when user types (debounced)
  // Works in both AI mode and manual mode during create step
  useEffect(() => {
    if (step !== 'create') return;
    // Paused while the leave prompt is open: the recruiter is deciding what
    // happens to the JD, and a timer save behind the dialog flashed the save
    // status and raced the prompt's own Save as Draft (two creates, two copies).
    // Cancel closes the prompt and re-arms this; Save / Discard / Delete settle
    // the record themselves.
    if (showUnsavedDialog) return;

    // Need at least 1 non-space character in job title
    const trimmedJobTitle = jobTitle.trim();
    if (!trimmedJobTitle) return;
    if (getResolvedJobTitleValidationError(trimmedJobTitle) || isJobTitleValidating) {
      setAutosaveStatus('idle');
      return;
    }

    const autosaveTimer = setTimeout(async () => {
      // Don't autosave if currently saving via another action or already published
      if (isSavingDraft || isPublishing || isPublished || discardedRef.current) return;

      setAutosaveStatus('saving');

      try {
        // Build description based on mode
        // For AI mode: use generated JD, or AI prompt as placeholder, or empty string
        const description = mode === 'ai'
          ? (generatedJD || (aiPrompt ? `[AI Prompt - Pending Generation]\n\n${aiPrompt}` : ''))
          : manualJD;

        const jdData = {
          title: trimmedJobTitle,
          description: description,
          creation_stage: 'create' as const,
          creation_method: (mode === 'ai' ? 'ai_generated' : 'manual') as 'ai_generated' | 'manual',
          ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
        };

        let savedJd;
        if (editingId) {
          // Update existing draft
          savedJd = await jdService.update(editingId, jdData);
        } else {
          // Create new draft
          savedJd = await jdService.create({ ...jdData, as_working_copy: true });
          if (discardedRef.current) {
            // Discarded while this create was in flight — remove it again.
            await jdService.delete(savedJd.id).catch(() => undefined);
            return;
          }
          createdInSessionIdRef.current = savedJd.id;
          setUnsavedNewCopyId(savedJd.id);
          setEditingId(savedJd.id);
        }

        setAutosaveStatus('saved');
        setLastAutosaveTime(new Date());
        // The text this autosave sent is now the saved state (typing during
        // the request leaves the current key different → still prompts).
        savedContentKeyRef.current = jdContentKey(jobTitle, aiPrompt, manualJD, generatedJD);
        // Deliberately NOT clearing hasUnsavedChanges here: this silent
        // background save happens on a timer the user never asked for, so it
        // must not disarm the leave-confirmation guard behind their back. If
        // it did, dismissing the "Unsaved Changes" dialog with X and then
        // trying to leave again a couple of seconds later would silently skip
        // the dialog instead of asking again.

        // Reset status after 3 seconds
        setTimeout(() => {
          setAutosaveStatus('idle');
        }, 3000);
      } catch (error) {
        console.error('[JD06] Autosave failed:', error);
        setAutosaveStatus('error');
        // Reset error status after 5 seconds
        setTimeout(() => {
          setAutosaveStatus('idle');
        }, 5000);
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(autosaveTimer);
  }, [jobTitle, manualJD, aiPrompt, generatedJD, step, mode, editingId, isSavingDraft, isPublishing, isPublished, isJobTitleValidating, showUnsavedDialog]);

  // Track changes for unsaved changes warning
  useEffect(() => {
    if (jobTitle.trim() || aiPrompt.trim() || manualJD.trim() || generatedJD.trim()) {
      setHasUnsavedChanges(true);
    }
    const key = jdContentKey(jobTitle, aiPrompt, manualJD, generatedJD);
    currentContentKeyRef.current = key;
    // A draft just loaded from the server: its content IS the saved state.
    if (markLoadedContentSavedRef.current) {
      markLoadedContentSavedRef.current = false;
      savedContentKeyRef.current = key;
      if (adoptLoadedKeyAsCheckpointRef.current) {
        adoptLoadedKeyAsCheckpointRef.current = false;
        checkpointContentKeyRef.current = key;
      }
    } else if (
      freshForkIdRef.current
      && checkpointContentKeyRef.current !== null
      && key !== checkpointContentKeyRef.current
    ) {
      // Edited: the fork now holds work, so a later reopen must not drop it.
      clearFreshDraftVersion(freshForkIdRef.current);
    }
  }, [jobTitle, aiPrompt, manualJD, generatedJD]);

  // Warn before closing browser tab/window if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // A forced sign-out redirect (session timeout / logout / 401) must not
      // be blocked by "Leave site?" — the session is already gone.
      if (isForcedNavigation()) return;
      // Everything already saved (autosave / Save as Draft / step save) —
      // nothing would be lost, so no "Changes may not be saved" prompt.
      if (currentContentKeyRef.current === savedContentKeyRef.current) return;
      if (hasUnsavedChanges && !isPublished) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isPublished]);

  /* Whether leaving now needs the leave prompt — on EVERY step, Review included.
     A job created in this visit always does until the recruiter saves it
     themselves: it already has a record (and a JD ID) they never asked for, and
     leaving silently is how unwanted drafts piled up under Draft. An existing JD
     (a draft or published JD opened for editing) only when something was actually
     changed since the checkpoint. Before any record exists, only if something was
     typed. Read through a ref by the listeners below, which register once. */
  const needsLeavePrompt = (): boolean => {
    if (isPublished || discardedRef.current) return false;
    if (!editingId) return hasUnsavedChanges;
    if (editingId === createdInSessionIdRef.current && !userSavedDraftRef.current) return true;
    // A new JD's working copy reopened by a refresh: this mount did not create it
    // (createdInSessionIdRef is empty again), but it is still a never-saved new JD,
    // so leaving must keep prompting until the recruiter saves it themselves.
    if (isUnsavedNewCopy && !userSavedDraftRef.current) return true;
    const textChanged = checkpointContentKeyRef.current !== null
      && currentContentKeyRef.current !== checkpointContentKeyRef.current;
    return textChanged || editedSinceCheckpointRef.current;
  };
  const needsLeavePromptRef = useRef(needsLeavePrompt);
  useEffect(() => {
    needsLeavePromptRef.current = needsLeavePrompt;
  });

  /* A draft version forked from a published JD just for this visit (Edit on a
     published JD - see lib/utils/jdDraftVersion.ts). Left untouched it is removed
     again on leave, silently; once edited, Discard removes it and the published
     version is what remains. Detected before the checkpoint effect below. */
  useEffect(() => {
    const id = effectiveEditingJD?.id;
    if (id && effectiveEditingJD?.status === 'draft' && isFreshDraftVersion(id)) {
      freshForkIdRef.current = id;
    }
  }, [effectiveEditingJD?.id, effectiveEditingJD?.status]);
  const isUntouchedFreshFork = (): boolean =>
    !!editingId
    && freshForkIdRef.current === editingId
    && !userSavedDraftRef.current
    && !isPublished
    && !discardedRef.current
    && !needsLeavePrompt();
  const isUntouchedFreshForkRef = useRef(isUntouchedFreshFork);
  useEffect(() => {
    isUntouchedFreshForkRef.current = isUntouchedFreshFork;
  });
  // Removes that untouched fork, then completes the navigation. A failed delete
  // still navigates: the draft is reused the next time this JD is edited.
  const dropUntouchedFork = async () => {
    const id = freshForkIdRef.current;
    if (!id) return;
    discardedRef.current = true;
    setHasUnsavedChanges(false);
    try {
      await jdService.delete(id);
    } catch (error) {
      console.error('[Leave] Could not remove the untouched draft version:', error);
    }
    clearFreshDraftVersion(id);
  };
  const dropUntouchedForkRef = useRef(dropUntouchedFork);
  useEffect(() => {
    dropUntouchedForkRef.current = dropUntouchedFork;
  });

  // The "as opened" checkpoint for an existing JD: the server's full copy, so
  // Discard can put back every field (Step 1 text, Step 2 criteria, stage).
  useEffect(() => {
    const id = effectiveEditingJD?.id;
    if (!id || id === createdInSessionIdRef.current || leaveCheckpointRef.current) return;
    let cancelled = false;
    jdService.get(id)
      .then(jd => {
        if (!cancelled && !leaveCheckpointRef.current) {
          const label = freshForkIdRef.current === id
            ? 'the published version; this new draft version is removed'
            : 'the version you opened';
          leaveCheckpointRef.current = { jd, label };
          setLeaveCheckpointMeta({
            label, jobCode: jd.job_id ?? null, status: jd.status, versionNumber: jd.version_number ?? 1,
            isFreshFork: freshForkIdRef.current === id,
          });
          // The loaded text was adopted as the checkpoint text when it hydrated.
          setCheckpointContentKey(checkpointContentKeyRef.current);
        }
      })
      .catch(error => console.error('[Leave] Could not load the JD checkpoint:', error));
    return () => { cancelled = true; };
  }, [effectiveEditingJD?.id]);

  // Intercept navigation clicks (menu items, breadcrumbs, links) when leaving needs the prompt
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const needsPrompt = needsLeavePromptRef.current();
      const dropFork = !needsPrompt && isUntouchedFreshForkRef.current();
      if (!needsPrompt && !dropFork) {
        return;
      }

      // Find the clicked link/anchor
      let target = e.target as HTMLElement;
      while (target && target !== document.body) {
        if (target.tagName === 'A' || target.getAttribute('role') === 'link') {
          const href = target.getAttribute('href');

          // Check if it's a navigation link (not # anchors or external links)
          if (href && href.startsWith('/') && !href.startsWith('/#')) {
            // Prevent default navigation
            e.preventDefault();
            e.stopPropagation();

            if (dropFork) {
              void dropUntouchedForkRef.current().then(() => router.push(href));
              return;
            }

            // Store the target URL and show dialog
            setIsPendingBackNavigation(false);
            setPendingNavigation(href);
            setShowUnsavedDialog(true);
            return;
          }
        }
        target = target.parentElement as HTMLElement;
      }
    };

    // Attach to document to catch all clicks
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  // Intercept the browser Back/Forward buttons the same way the click
  // handler above intercepts in-app links. A plain `popstate` listener can't
  // "cancel" a back-navigation — the URL/history entry has already changed by
  // the time the event fires — so this plants one extra history entry
  // ("trap") pointing at the current URL. The first Back press only pops that
  // trap (landing back on the same URL, nothing visibly changes yet); we
  // inspect it here and either re-plant the trap and show the same
  // "Unsaved Changes" dialog, or, if there is nothing to lose, replay the
  // Back press once more so the user's original intent goes through.
  //
  // Read via a ref (rather than effect deps) so the trap is planted exactly
  // once for this page visit — re-running this effect on every state change
  // would stack extra trap entries and make the user press Back several
  // times to actually leave.

  useEffect(() => {
    const TRAP_STATE = { __jdCreationBackGuard: true };
    window.history.pushState(TRAP_STATE, '', window.location.href);

    // Set right before a programmatic history.back()/go() call that WE
    // initiated, so the popstate it fires is treated as "already resolved"
    // instead of being re-evaluated as a fresh Back press (which would
    // otherwise replay endlessly).
    let isProgrammaticNavigation = false;

    const handlePopState = () => {
      if (isProgrammaticNavigation) {
        isProgrammaticNavigation = false;
        return;
      }

      if (needsLeavePromptRef.current()) {
        // Cancel the visual back-navigation (there isn't one yet — the trap
        // absorbed it) and re-plant the trap for the next attempt.
        window.history.pushState(TRAP_STATE, '', window.location.href);
        setPendingNavigation(null);
        setIsPendingBackNavigation(true);
        setShowUnsavedDialog(true);
      } else if (isUntouchedFreshForkRef.current()) {
        // An untouched draft version made for this visit: remove it, then go.
        void dropUntouchedForkRef.current().then(() => {
          isProgrammaticNavigation = true;
          window.history.back();
        });
      } else {
        // Nothing to lose — let the user's Back press actually continue past
        // our trap entry to wherever they were really headed.
        isProgrammaticNavigation = true;
        window.history.back();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Cleanup streaming connection on unmount
  useEffect(() => {
    return () => {
      if (isStreaming) {
        console.log('[TalentFlow] Component unmounting, cleaning up streaming');
        setIsStreaming(false);
        setStreamedContent('');
      }
    };
  }, []);

  const handleGenerateJD = async () => {
    const trimmedJobTitle = jobTitle.trim();

    if (!trimmedJobTitle) {
      toast.error({
        title: 'Job Title Required',
        description: 'Please enter a job title before generating the JD.',
      });
      return;
    }

    if (!(await ensureValidJobTitle(trimmedJobTitle))) {
      return;
    }

    // Validate AI prompt before proceeding
    const promptLength = aiPrompt.trim().length;
    if (promptLength < VALIDATION.AI_PROMPT.min) {
      toast.error({
        title: 'AI Prompt Required',
        description: `Please enter at least ${VALIDATION.AI_PROMPT.min} characters in the AI prompt field.`,
      });
      return;
    }
    if (promptLength > VALIDATION.AI_PROMPT.max) {
      toast.error({
        title: 'AI Prompt Too Long',
        description: `AI prompt must be less than ${VALIDATION.AI_PROMPT.max} characters.`,
      });
      return;
    }

    // Validate AI prompt contains meaningful text (not just symbols or garbage)
    if (!containsMeaningfulText(aiPrompt)) {
      toast.error({
        title: 'Please enter a valid AI Prompt',
        description: 'AI prompt must contain meaningful text, not just symbols or special characters.',
      });
      return;
    }

    // Validate AI prompt does not contain code patterns
    if (containsCodePatterns(aiPrompt)) {
      toast.error({
        title: 'Invalid AI Prompt',
        description: 'AI prompt should describe a job role, not contain programming code or technical syntax.',
      });
      return;
    }

    // Validate AI prompt is in English only
    if (!isEnglishOnly(aiPrompt)) {
      toast.error({
        title: 'English Only',
        description: 'AI prompt must be written in English only. Other languages are not supported.',
      });
      return;
    }

    const aiPromptValidationError = getAIPromptValidationError(aiPrompt);
    if (aiPromptValidationError) {
      toast.error({
        title: 'Invalid AI Prompt',
        description: aiPromptValidationError,
      });
      return;
    }

    // JD-21 removed the "Salary Range Required" gate that used to stand here. A prompt
    // stating one figure ("3 LPA") was refused outright with 'Please enter a salary
    // range instead of a single value', which forced the recruiter to make up a second
    // number before the JD could even be generated. A single figure is now a legal
    // answer: extraction files it as the MINIMUM and it displays as "3 LPA+".
    //
    // Deliberately nothing is substituted for the missing bound here or anywhere
    // downstream - a salary the prompt did not state stays null all the way to the JD.

    // Note: Quota check moved to publish action - generation doesn't consume quota
    setIsGenerating(true);
    setIsStreaming(true);
    setStreamedContent('');
    setStreamError(null);
    setGeneratedJD(''); // Clear previous content

    const generationInput = {
      jobTitle: trimmedJobTitle,
      aiPrompt: aiPrompt.trim(),
    };

    // Helper function to process extracted params from generation response
    // This pre-fills step 2 form with salary, skills, etc. extracted by backend
    const processExtractedParams = (params: any, experienceSourceText: string) => {
      console.log('[TalentFlow] Processing extracted params from generation:', params);

      const expValue = applyExperienceFallback(
        mapExtractedExperienceValue(params, experienceSourceText),
        (params.must_have_skills?.length || 0) + (params.nice_to_have_skills?.length || 0)
      );
      const hasExplicitExperienceYears = (
        params.experience_min !== null
        && params.experience_min !== undefined
        && !Number.isNaN(Number(params.experience_min))
      ) || (
        params.experience_max !== null
        && params.experience_max !== undefined
        && !Number.isNaN(Number(params.experience_max))
      );

      // When in edit mode, preserve existing values if extraction returns empty
      // arrays — but NOT when the creation mode changed since the last extraction
      // (switching Manual->AI must not preserve stale Manual-derived data).
      const extractionSourceModeChanged =
        lastExtractionSourceMode.current !== null && lastExtractionSourceMode.current !== mode;
      const isEditMode = !!editingId && !extractionSourceModeChanged
        && !forceFreshExtraction.current;
      const nextExperienceValue = expValue || (isEditMode ? extractedData.experience : '');
      lastExtractionSourceMode.current = mode;

      setShowCustomExperienceInput(Boolean(nextExperienceValue && !getExperienceLevelByCode(nextExperienceValue)));
      setExperienceYearsExplicit(hasExplicitExperienceYears);
      // The grade the JD's words name, if any - the backend's answer, not a re-derivation.
      setExperienceLevelWord(levelWordFromParams(params));

      setExtractedData(prev => {
        // Same deterministic first-render dedupe as the extraction path below - the
        // AI-generation path merges the four lists too, so it can surface the same
        // duplicate rows. No network call, so the no-edit -> no-LLM invariant holds.
        const dedupedLists = dedupeListsDeterministic({
          mustHaveSkills: mergeExtractedListField(prev.mustHaveSkills, params.must_have_skills, isEditMode),
          niceToHaveSkills: mergeExtractedListField(prev.niceToHaveSkills, params.nice_to_have_skills, isEditMode),
          mustHaveComments: mergeExtractedListField(prev.mustHaveComments, params.must_have_comments, isEditMode),
          niceToHaveComments: mergeExtractedListField(prev.niceToHaveComments, params.nice_to_have_comments, isEditMode),
        });
        return {
        ...prev,
        mustHaveSkills: dedupedLists.mustHaveSkills,
        mustHaveComments: dedupedLists.mustHaveComments,
        niceToHaveSkills: dedupedLists.niceToHaveSkills,
        niceToHaveComments: dedupedLists.niceToHaveComments,
        education: params.education_requirements?.degree?.toLowerCase().replace("'s", 's').replace(' ', '-') || (isEditMode ? prev.education : ''),
        experience: expValue || prev.experience,
        industryType: params.industry_type?.toLowerCase() || (isEditMode ? prev.industryType : ''),
        // The generated JD reaches the SAME Step 2 screen as an uploaded one, so it
        // needs the same three fields — without them, an AI-generated JD in an
        // industry the list does not carry silently showed "Others" with no way out,
        // which is the entire defect this work exists to remove.
        industrySuggestedName: params.industry_suggested_name?.trim() || undefined,
        industrySuggestedReason: params.industry_suggested_reason?.trim() || undefined,
        industryConfidence: params.industry_confidence ?? undefined,
        industryIsCustom: false,
        roleFamily: params.role_family || (isEditMode ? prev.roleFamily : undefined),
        roleFamilyConfidence: params.role_family_confidence ?? (isEditMode ? prev.roleFamilyConfidence : undefined),
        roleFamilyRaw: params.role_family_raw || (isEditMode ? prev.roleFamilyRaw : undefined),
        // Extraction's answer WINS, exactly as on the upload/manual path below. These two
        // read `prev` unconditionally, so a generated JD saying "remote, 6-month contract"
        // was still filed as Onsite / Full-time - the two fields the model had just read
        // out of the text were the only ones thrown away. The backend already refuses to
        // invent either (sanitize_extracted_jd_params erases a work_mode or job_type the
        // source text never states), so a value that arrives here is one the JD stated.
        employmentType: normalizeExtractedEmploymentType(params.job_type) || (isEditMode ? prev.employmentType : 'full_time'),
        workModel: (params.work_mode as ExtractedData['workModel']) || (isEditMode ? prev.workModel : 'onsite'),
        // Pre-fill salary from AI extraction
        // A null bound from extraction is an ANSWER - "this JD states no maximum" - not a
        // gap to be papered over with the previous value. Falling back to `prev` here meant
        // a re-extraction could never CLEAR a bound: editing the prompt from "2 LPA upto
        // 7 LPA" down to "2 LPA" re-extracted correctly as min-only, and the stale 7,00,000
        // stayed in the Maximum box (and in the saved JD) forever.
        //
        // Preserved only in edit mode, exactly like workModel/education/industryType above:
        // a FRESH extraction replaces Step 2 (see forceFreshExtraction), so it must be able
        // to replace a bound with nothing.
        //
        // EXCEPT when the backend says salary_mixed_period: true - the JD states a
        // mixed-period salary ("12,000 per month to 4 LPA") and null here is a
        // CONFIDENT answer that no single bound can be stated, not "extraction found
        // nothing." Falling back to `prev` in that case left a stale min/max sitting
        // in the Salary boxes (and, on save, in the JD) for exactly the salaries the
        // backend had deliberately left unbounded.
        salaryFrom: params.salary_min != null
          ? (sanitizeExtractedSalary(params.salary_min) || '')
          : (isEditMode && !params.salary_mixed_period ? (prev.salaryFrom || '') : ''),
        salaryTo: params.salary_max != null
          ? (sanitizeExtractedSalary(params.salary_max) || '')
          : (isEditMode && !params.salary_mixed_period ? (prev.salaryTo || '') : ''),
        salaryCurrency: normalizeSalaryCurrency(params.salary_currency || prev.salaryCurrency),
        // Mirrors salaryFrom/salaryTo/salaryCurrency above exactly - this IS a fresh
        // ground-truth extraction, so the "original" pair starts out identical to what
        // is displayed (no currency toggle has been applied yet).
        salaryOriginalFrom: params.salary_min != null
          ? (sanitizeExtractedSalary(params.salary_min) || '')
          : (isEditMode && !params.salary_mixed_period ? (prev.salaryOriginalFrom || '') : ''),
        salaryOriginalTo: params.salary_max != null
          ? (sanitizeExtractedSalary(params.salary_max) || '')
          : (isEditMode && !params.salary_mixed_period ? (prev.salaryOriginalTo || '') : ''),
        salaryOriginalCurrency: normalizeSalaryCurrency(params.salary_currency || prev.salaryOriginalCurrency),
        compensationType: (params.compensation_type as 'yearly' | 'monthly' | 'hourly' | 'daily') || prev.compensationType || 'yearly',
        // "City, State" when the JD qualified the city, matching how a SAVED JD is loaded
        // (see the load effect) and how the save path re-splits it. Dropping `state` here
        // meant an extracted "Chennai, Tamil Nadu" reached Step 2 as a bare "Chennai" and
        // was persisted with state=null, so it no longer matched the city the recruiter
        // would pick by hand.
        locations: (params.locations || []).length > 0 ? params.locations.map((loc: any) => ({
          city: loc.state ? `${loc.city}, ${loc.state}` : (loc.city || ''),
          radius: loc.radius_km != null ? String(loc.radius_km) : '50'
        })) : (isEditMode ? prev.locations : []),
        allowOverqualified: isEditMode ? prev.allowOverqualified : null,
        // Forced OFF: the 'Requires a hands-on coding assessment' control was removed
        // from JD creation, so nothing can clear a wrongly-extracted true. Leaving it
        // set would let jd_analyzer.validate_for_assessment() block assessment creation
        // ("JD requires coding but no programming languages are specified") with no UI
        // to recover. Languages are cleared for the same reason.
        codingRequired: false,
        suggestedLanguages: [],
        certifications: params.certifications?.length > 0 ? params.certifications : (isEditMode ? prev.certifications : []),
        domainKeywords: params.domain_keywords?.length > 0 ? params.domain_keywords : (isEditMode ? prev.domainKeywords : []),
        // JD22 - whatever the JD says that no other field models (shift timings,
        // WFO/WFH, facilities). What the RECRUITER typed always wins: extraction fills
        // this box only while it is still empty, so re-running extraction can never
        // overwrite a sentence someone wrote by hand.
        additionalDetails: resolveAdditionalDetails(
          prev.additionalDetails,
          extractionFilledAdditionalDetails.current,
          params.additional_details,
        ),
        // Skills only: comment merges rest on judgement, so their reasons are vaguer, and
        // a vague explanation erodes trust faster than none.
        // `skill_merge_trail` is the same data read back from a SAVED JD; `merge_trail`
        // is what a fresh extraction just produced. Reading both means reopening a JD
        // shows the grouping it was created with instead of a list that looks as though
        // nothing was ever grouped.
        // ALL kinds. This used to keep only skill entries, so requirement groups
        // never reached the screen - and since this state is what gets saved, they
        // were also deleted from the JD on the first save.
        mergeTrail: ((params.merge_trail || params.skill_merge_trail || []) as JDMergeTrailEntry[]),
        };
      });

      // Record what extraction just auto-filled, so a LATER extraction can tell this
      // text apart from something the recruiter typed. Set outside the state updater:
      // React may invoke an updater more than once, and a ref write belongs where it
      // runs exactly once per extraction.
      extractionFilledAdditionalDetails.current = params.additional_details || '';

      // Log what was pre-filled and trigger validation
      if (params.salary_min || params.salary_max) {
        console.log('[TalentFlow] Salary pre-filled:', { min: params.salary_min, max: params.salary_max });
        const fromVal = sanitizeExtractedSalary(params.salary_min);
        const toVal = sanitizeExtractedSalary(params.salary_max);
        const error = validateSalaryRange(fromVal, toVal);
        setValidationErrors(prev => ({ ...prev, salaryRange: error }));
      }

      // Generation already extracted these params for THIS exact JD text. Record it
      // as the last-extracted JD so clicking "Next" does NOT run a SECOND extraction
      // that would overwrite these skills/comments with differently-worded results
      // (the surprising "single word" change + "extracted" toast the user saw). If
      // the user edits the JD before Next, jdText won't match and extraction re-runs.
      // Guard: only skip re-extraction when generation actually produced skills, so
      // an empty extraction never strands Step 2 with no skills.
      const generationHasSkills =
        (params.must_have_skills?.length || 0) > 0 ||
        (params.nice_to_have_skills?.length || 0) > 0;
      if (experienceSourceText && experienceSourceText.trim() && generationHasSkills) {
        setLastExtractedJD(experienceSourceText);
      }
    };

    // Fallback function for non-streaming
    const fallbackToNonStreaming = async () => {
      try {
        console.log('[TalentFlow] Falling back to non-streaming API');
        const response = await jdService.generate(generationInput);

        if (response?.description) {
          if (response.title && !titleLockedRef.current) {
            setJobTitle(response.title);
        }
          setGeneratedJD(response.description);

          // Skip re-fill + toast if the user already advanced past Step 1 (same
          // late-completion guard as the streaming path).
          if (stepRef.current !== 'create') {
            console.log('[TalentFlow] Fallback generation completed after user advanced — skipping re-fill + toast');
            return;
          }

          // Pre-fill step 2 form with extracted params (salary, skills, etc.)
          if (response.extracted_params) {
            processExtractedParams(response.extracted_params, response.description);
          }

          toast.success({
            title: 'JD Generated Successfully',
            description: 'AI has created a comprehensive job description.'
          });
        } else {
          throw new Error('No description in response');
        }
      } catch (error) {
        console.error('[TalentFlow] Fallback generation failed:', error);

        // Check if it's a quota error
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
        if (errorMessage.includes('quota') || errorMessage.includes('rate') || errorMessage.includes('insufficient')) {
          toast.error({
            title: 'OpenAI Quota Exceeded',
            description: 'The AI service is temporarily unavailable. Please try again later or contact support.'
          });
        } else if (error instanceof Error && error.message) {
          toast.error({
            title: 'Generation Failed',
            description: friendlyErrorMessage(error, "Please try again."),
          });
        } else {
          toast.error({
            title: 'Generation Failed',
            description: 'Could not generate JD. Please check your connection and try again.'
          });
        }
        throw error;
      }
    };

    try {
      // Try streaming first
      await jdService.generateStream(generationInput, {
        onChunk: (content: string) => {
          // Accumulate markdown chunks progressively and display them
          setStreamedContent((prev) => prev + content);

          // Update the displayed JD content progressively (like ChatGPT)
          setGeneratedJD((prev) => prev + content);
        },
        onTitle: (title: string) => {
          // Update title if provided (never over a locked title)
          if (title && !titleLockedRef.current) {
            setJobTitle(title);
          }
        },
        onTextComplete: () => {
          // Text streaming is done, update button immediately
          console.log('[TalentFlow] Text generation complete');
          setIsStreaming(false);
          setIsGenerating(false);
        },
        onComplete: (response) => {
          // IMPORTANT: Set both isStreaming and isGenerating to false immediately
          // This ensures the button changes from "Generating..." to "Regenerate" right away
          setIsStreaming(false);
          setIsGenerating(false);

          // Then set final content
          if (response?.description) {
            setGeneratedJD(response.description);

            // Job Title names a different tech stack than the AI Prompt's own
            // requirements (e.g. title "Frontend Developer" with "Java, Spring
            // Boot, Microservices" as requirements) - see
            // detect_title_tech_stack_mismatch in openai_service.py. The
            // description itself was still generated with the Job Title kept as
            // the source of truth; this only warns the recruiter to double-check
            // before publishing.
            if (response.role_mismatch_warning) {
              toast.warning({
                title: 'Job Title / Requirements Mismatch',
                description: response.role_mismatch_warning,
              });
            }

            // If the stream finished AFTER the user already advanced past Step 1
            // (e.g. they clicked Next as soon as text streaming completed), do NOT
            // re-fill Step 2 or show a "generated / click Next" toast — the extraction
            // already ran. This was the confusing "JD Generated Successfully" toast
            // appearing on the Extract step.
            if (stepRef.current !== 'create') {
              console.log('[TalentFlow] Generation completed after user advanced past Step 1 — skipping re-fill + toast');
              return;
            }

            // Pre-fill step 2 form with extracted params (salary, skills, etc.)
            // `{}` is truthy in JS, so this must test for CONTENT, not existence.
            // The generation endpoint now deliberately returns an empty params object:
            // the second generation pass that used to produce them was deleted, because
            // Step 1 -> 2 extraction re-derives the same values from this description
            // anyway. Passing `{}` through would blank the Step 2 fields for no reason.
            if (response.extracted_params && Object.keys(response.extracted_params).length > 0) {
              console.log('[TalentFlow] Extracted params from stream:', response.extracted_params);
              processExtractedParams(response.extracted_params, response.description);

              toast.success({
                title: 'JD Generated Successfully',
                description: 'Job details have been auto-filled. Click "Next" to review.',
              });
            } else {
              toast.success({
                title: 'JD Generated Successfully',
                description: 'Click "Next" to add job details.',
              });
            }
          }
        },
        onError: (message: string, errorCode?: string) => {
          console.error('[TalentFlow] Stream error:', message, 'Code:', errorCode);
          setStreamError(message);
          setIsStreaming(false);

          // Handle quota exceeded error - don't fallback, just show error
          if (errorCode === 'QUOTA_EXCEEDED') {
            toast.error({
              title: 'OpenAI Quota Exceeded',
              description: 'The AI service is temporarily unavailable. Please try again later or contact support.',
            });
            setIsGenerating(false);
            return;
          }

          if (isPromptConflictMessage(message)) {
            toast.error({
              title: 'Prompt Conflict',
              description: message,
            });
            setIsGenerating(false);
            return;
          }

          // Fall back to non-streaming for other errors
          fallbackToNonStreaming().catch(() => {
            // Error already handled in fallback function
          });
        }
      });
    } catch (streamErr) {
      console.error('[TalentFlow] Streaming failed, falling back:', streamErr);
      setIsStreaming(false);

      if (streamErr instanceof Error && isPromptConflictMessage(streamErr.message)) {
        toast.error({
          title: 'Prompt Conflict',
          description: friendlyErrorMessage(streamErr, "Please try again."),
        });
        setIsGenerating(false);
        return;
      }

      // Fall back to non-streaming API
      await fallbackToNonStreaming().catch(() => {
        // Error already handled in fallback function
      });
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  };

  // True when every Step-1 field matches what was loaded for an existing JD, i.e.
  // the user opened an existing/published JD to edit but changed nothing in Step 1.
  const isStage1UnchangedFromLoad = (): boolean => {
    const b = stage1LoadBaseline.current;
    if (!b) return false;
    return (
      jobTitle.trim() === b.jobTitle.trim() &&
      aiPrompt.trim() === b.aiPrompt.trim() &&
      generatedJD.trim() === b.generatedJD.trim() &&
      manualJD.trim() === b.manualJD.trim()
    );
  };

  // True once ANY field the extraction step produces has a value. Checking only
  // skills/comments made this false for short JDs that state just an experience
  // requirement (e.g. "...with 3.5 years of experience.") with no explicit skill
  // list, which incorrectly signalled "not yet extracted" and let a page refresh
  // fall through to a fresh (non-deterministic) LLM re-extraction that clobbered
  // an already-correct, already-saved value like experience_min.
  const hasExtractedRequirementData = (): boolean =>
    (extractedData.mustHaveSkills?.length || 0) +
      (extractedData.niceToHaveSkills?.length || 0) +
      (extractedData.mustHaveComments?.length || 0) +
      (extractedData.niceToHaveComments?.length || 0) >
    0 ||
    Boolean(extractedData.experience?.trim()) ||
    Boolean(extractedData.education?.trim()) ||
    Boolean(extractedData.industryType?.trim());

  // The real Step 1 -> Step 2 advance. Reached only through the guarded
  // `handleNext` below, which is what the button is bound to.
  const advanceFromCreateStep = async () => {
    const trimmedJobTitle = jobTitle.trim();
    const jdText = mode === 'ai' ? generatedJD : manualJD;

    if (!trimmedJobTitle) {
      toast.error({
        title: 'Job Title Required',
        description: 'Please enter a valid job title before moving to the next step.',
      });
      return;
    }

    if (!(await ensureValidJobTitle(trimmedJobTitle))) {
      return;
    }

    // Validate JD input is not empty
    if (!jdText || jdText.trim().length < 50) {
      toast.error({
        title: 'Invalid JD',
        description: 'Please provide a valid job description with at least 50 characters.',
      });
      return;
    }

    // Manual JD: enforce a content-length range so there is enough detail for AI
    // extraction, without exceeding what the model handles cleanly. Bounds come
    // from the single source of truth (VALIDATION.MANUAL_JD) that also drives the
    // live character counter, inline hints, and the Next-button disabled state.
    if (mode === 'manual') {
      const manualLength = jdText.trim().length;
      if (manualLength < VALIDATION.MANUAL_JD.min) {
        toast.error({
          title: 'Job Description Too Short',
          description: `Please provide at least ${VALIDATION.MANUAL_JD.min.toLocaleString()} characters for accurate AI processing and skill extraction. Currently ${manualLength.toLocaleString()}.`,
        });
        return;
      }
      if (manualLength > VALIDATION.MANUAL_JD.max) {
        toast.error({
          title: 'Job Description Too Long',
          description: `Please keep the job description under ${VALIDATION.MANUAL_JD.max.toLocaleString()} characters. Currently ${manualLength.toLocaleString()}.`,
        });
        return;
      }
    }

    // Validate JD contains meaningful text (not just symbols or garbage)
    if (!containsMeaningfulText(jdText)) {
      toast.error({
        title: 'Please enter a valid Job Description',
        description: 'JD must contain meaningful text, not just symbols or special characters.',
      });
      return;
    }

    if (mode === 'manual' && containsCodePatterns(jdText)) {
      toast.error({
        title: 'Invalid Job Description',
        description: 'Manual job descriptions must describe a role, not contain source code or programming syntax.',
      });
      return;
    }

    // JD extraction only supports English content, even if an AI-generated JD
    // was later edited by the recruiter.
    if (!isEnglishOnly(jdText)) {
      toast.error({
        title: 'English Only',
        description: mode === 'ai'
          ? 'AI-generated job descriptions must remain in English. Other languages are not supported for extraction.'
          : 'Manual job descriptions must be written in English. Other languages are not supported for extraction.',
      });
      return;
    }

    // Note: Removed code pattern validation here since AI-generated content is trusted
    // Validation only applies to AI prompt input, not the generated JD content

    // EDIT FLOW — NO CHANGE, NO LLM (checked directly against the freshly-fetched
    // DB record, not against any client-side ref/state):
    // Compare the live form values straight to effectiveEditingJD, which is
    // exactly what a page refresh re-fetches. This cannot be defeated by any
    // hydration-timing gap in stage1LoadBaseline/lastExtractedJD/originalStage1Values
    // (those are kept below as a secondary layer) — if the text and title match
    // what's already persisted, and that record already went through extraction,
    // there is nothing new to extract, full stop.
    if (effectiveEditingJD) {
      // Deliberately NOT gated on creation_stage - see jdHasPersistedExtraction.
      const alreadyExtracted = jdHasPersistedExtraction(effectiveEditingJD);
      const textUnchangedFromPersisted =
        jdText.trim() === (effectiveEditingJD.description || '').trim() &&
        trimmedJobTitle === (effectiveEditingJD.title || '').trim();

      if (alreadyExtracted && textUnchangedFromPersisted) {
        console.log('[TalentFlow] JD text/title match the already-extracted persisted record — skipping extraction LLM');
        setHasProceededToExtract(true);
        setStep('extract');
        return;
      }
    }

    // EDIT FLOW — NO CHANGE, NO LLM (secondary check against client-side state):
    // If we loaded an existing JD (draft or published) and the user has not changed
    // ANY Step-1 field since load, and extracted data already exists, skip extraction
    // entirely and go straight to Step 2. This prevents an extraction LLM call when
    // the user just clicks Next through an unchanged Step 1.
    if (effectiveEditingJD && isStage1UnchangedFromLoad() && hasExtractedRequirementData()) {
      console.log('[TalentFlow] Editing existing JD, Step 1 unchanged since load — skipping extraction LLM');
      setHasProceededToExtract(true);
      setStep('extract');
      return;
    }

    // Check if any Stage 1 field has changed since last extraction
    // If user has proceeded to review and comes back to Stage 1:
    // - If ANY field is modified → trigger re-extraction
    // - If NO fields modified → skip extraction, go directly to Stage 2
    const hasStage1FieldsChanged = () => {
      if (!originalStage1Values) {
        console.log('[TalentFlow] No originalStage1Values, need extraction');
        return true; // No original values, need extraction
      }

      const currentJobTitle = jobTitle.trim();
      const currentAiPrompt = aiPrompt.trim();
      const currentGeneratedJD = generatedJD.trim();
      const currentManualJD = manualJD.trim();

      const jobTitleChanged = currentJobTitle !== originalStage1Values.jobTitle.trim();
      const aiPromptChanged = currentAiPrompt !== originalStage1Values.aiPrompt.trim();
      const generatedJDChanged = currentGeneratedJD !== originalStage1Values.generatedJD.trim();
      const manualJDChanged = currentManualJD !== originalStage1Values.manualJD.trim();

      console.log('[TalentFlow] Stage 1 field comparison:', {
        currentJobTitle,
        originalJobTitle: originalStage1Values.jobTitle.trim(),
        jobTitleChanged,
        currentAiPrompt: currentAiPrompt.substring(0, 50),
        originalAiPrompt: originalStage1Values.aiPrompt.trim().substring(0, 50),
        aiPromptChanged,
        currentGeneratedJDLength: currentGeneratedJD.length,
        originalGeneratedJDLength: originalStage1Values.generatedJD.trim().length,
        generatedJDChanged,
        currentManualJDLength: currentManualJD.length,
        originalManualJDLength: originalStage1Values.manualJD.trim().length,
        manualJDChanged
      });

      return jobTitleChanged || aiPromptChanged || generatedJDChanged || manualJDChanged;
    };

    console.log('[TalentFlow] handleNext check:', { hasProceededToReview, hasOriginalStage1Values: !!originalStage1Values });

    // originalStage1Values is populated both right after a fresh extraction and
    // (as of this fix) when an already-extracted draft is loaded/reloaded — so its
    // mere presence, not hasProceededToReview, is the correct "we know the baseline"
    // signal. Gating on hasProceededToReview too used to mean a refresh at the
    // 'extract' stage (hasProceededToReview still false) fell through to the
    // weaker checks below and could trigger an unnecessary re-extraction.
    if (originalStage1Values) {
      if (!hasStage1FieldsChanged()) {
        // No fields modified - skip extraction, go directly to Stage 2
        // Keep current extractedData as-is (user may have deleted items)
        console.log('[TalentFlow] No Stage 1 fields modified since load/extraction, keeping current extractedData');
        setHasProceededToExtract(true);
        setStep('extract');
        return;
      } else {
        // Fields modified - need to re-extract, also reset hasProceededToReview
        console.log('[TalentFlow] Stage 1 fields modified, triggering re-extraction');
        setHasProceededToReview(false); // Reset so Stage 2 becomes editable again
      }
    } else if (lastExtractedJD && jdText.trim() === lastExtractedJD.trim()) {
      // Normal flow: JD unchanged since last extraction - keep current extractedData
      // Don't reload from DB (user may have deleted items)
      console.log('[TalentFlow] JD unchanged, keeping current extractedData and going to step 2');
      setHasProceededToExtract(true);
      setStep('extract');
      return;
    }

    // We only get here when Step 1 changed (or there is no baseline) - every
    // no-change path above has already returned. So this extraction REPLACES Step 2
    // rather than merging into it.
    forceFreshExtraction.current = true;
    setExtractedDataModified(false);
    console.log('[TalentFlow] Step 1 changed - running a FRESH extraction; previous Step 2 data will be replaced');

    setIsExtracting(true);
    setHasProceededToExtract(true); // Disable regenerate button immediately when Next is clicked

    try {
      // Call real API to extract parameters using AI
      console.log('[TalentFlow] Extracting parameters from JD, length:', jdText.length);
      // Attribution for the extraction's LLM API requests, so they are counted
      // under Manual JD Creation or AI JD Creation and never merged. `editingId`
      // is the draft saved at the "create" stage, whose stored creation_method
      // the backend trusts over the mode we send here.
      const params = await jdService.extractParamsFromText(
        jdText,
        trimmedJobTitle,
        mode === 'ai' ? 'ai_generated' : 'manual',
        editingId,
      );

      // Debug: Log API response to see what's being extracted
      console.log('[TalentFlow] Extraction API response:', params);
      console.log('[TalentFlow] Experience values:', {
        experience_min: params.experience_min,
        experience_max: params.experience_max,
        experience_level: params.experience_level
      });
      console.log('[TalentFlow] Mandatory flags from API:', {
        experience_mandatory: params.experience_mandatory,
        education_mandatory: params.education_mandatory,
        industry_mandatory: params.industry_mandatory,
        location_mandatory: params.location_mandatory
      });
      console.log('[TalentFlow] Comments from API:', {
        must_have_comments: params.must_have_comments,
        must_have_comments_length: params.must_have_comments?.length || 0,
        nice_to_have_comments: params.nice_to_have_comments,
        nice_to_have_comments_length: params.nice_to_have_comments?.length || 0
      });
      console.log('[TalentFlow] Will set UI checkboxes:', {
        experienceRequired: params.experience_mandatory || false,
        educationRequired: params.education_mandatory || false,
        industryTypeRequired: params.industry_mandatory || false,
        locationsRequired: params.location_mandatory || false
      });
      console.log('[TalentFlow] Work settings:', {
        work_mode: params.work_mode,
        job_type: params.job_type
      });

      // Convert experience values to numbers (API might return strings)
      const expMin = params.experience_min !== null && params.experience_min !== undefined
        ? Number(params.experience_min)
        : null;
      const expMax = params.experience_max !== null && params.experience_max !== undefined
        ? Number(params.experience_max)
        : null;

      // Check if we have valid numeric experience values
      const hasExpMin = expMin !== null && !isNaN(expMin);
      const hasExpMax = expMax !== null && !isNaN(expMax);

      console.log('[TalentFlow] Experience conversion:', {
        raw_min: params.experience_min,
        raw_max: params.experience_max,
        converted_min: expMin,
        converted_max: expMax,
        hasExpMin,
        hasExpMax
      });

      const experienceValue = applyExperienceFallback(
        mapExtractedExperienceValue(
          {
            experience_min: params.experience_min,
            experience_max: params.experience_max,
            experience_level: params.experience_level,
            job_level: params.job_level,
          },
          jdText
        ),
        (params.must_have_skills?.length || 0) + (params.nice_to_have_skills?.length || 0)
      );

      // Log if still no experience extracted
      if (!experienceValue) {
        console.log('[TalentFlow] No experience extracted, params were:', {
          experience_min: params.experience_min,
          experience_max: params.experience_max,
          experience_level: params.experience_level
        });
      }

      // Map education to dropdown codes: 'diploma', 'associate', 'bachelors', 'masters', 'doctorate', 'none', 'others'
      const mapToEducationCode = (degree: string | undefined): string => {
        if (!degree) return '';
        const normalized = degree.toLowerCase().replace(/[^a-z]/g, '');
        // DYNAMIC: match against the MASTER education levels first (code or label),
        // so any level added/renamed in the master table is honored. Falls back to
        // the legacy alias map below only when master data has no match.
        const masterLevels = educationLevels || [];
        const exactMaster = masterLevels.find(l => l.code.toLowerCase().replace(/[^a-z]/g, '') === normalized);
        if (exactMaster) return exactMaster.code;
        const partialMaster = masterLevels.find(l => {
          const lbl = l.label.toLowerCase().replace(/[^a-z]/g, '');
          return lbl === normalized || lbl.includes(normalized) || normalized.includes(l.code.toLowerCase().replace(/[^a-z]/g, ''));
        });
        if (partialMaster) return partialMaster.code;
        // NOTE: keys must be in NORMALIZED form - `normalized` above has every
        // non-letter stripped, so 'high_school' arrives as 'highschool' and any
        // digit-bearing spelling ('12th') is already unrecognisable. Letter-only keys only.
        const educationMap: Record<string, string> = {
          // Secondary schooling. Previously unmapped, so extraction's 'high_school'
          // fell through to 'others' and displayed as "Other" - the single biggest
          // gap for non-degree roles (retail, hospitality, security, drivers,
          // warehouse, field staff), which are a large share of non-IT hiring.
          'highschool': 'high_school',
          'high': 'high_school',
          'secondary': 'high_school',
          'secondaryschool': 'high_school',
          'seniorsecondary': 'high_school',
          'highersecondary': 'high_school',
          'sslc': 'high_school',
          'ssc': 'high_school',
          'hsc': 'high_school',
          'ged': 'high_school',
          'matriculation': 'high_school',
          'matric': 'high_school',
          // Vocational / trade routes map to Diploma, which extraction previously
          // could not emit at all.
          'iti': 'diploma',
          'polytechnic': 'diploma',
          'vocational': 'diploma',
          'vocationaldiploma': 'diploma',
          'tradecertificate': 'diploma',
          'diploma': 'diploma',
          'associate': 'associate',
          'associatedegree': 'associate',
          'bachelors': 'bachelors',
          'bachelorsdegree': 'bachelors',
          'bachelor': 'bachelors',
          'btech': 'bachelors',
          'be': 'bachelors',
          'bsc': 'bachelors',
          'ba': 'bachelors',
          'masters': 'masters',
          'mastersdegree': 'masters',
          'master': 'masters',
          'mtech': 'masters',
          'me': 'masters',
          'msc': 'masters',
          'mba': 'masters',
          'doctorate': 'doctorate',
          'phd': 'doctorate',
          'doctoral': 'doctorate',
          'none': 'none',
          'noformal': 'none',
          'noformaleducation': 'none',
          // Legacy extraction spelling ('no_education') - previously unmapped, so a
          // JD that explicitly required NO formal education displayed as "Other".
          'noeducation': 'none',
          'noformaleducationrequired': 'none',
          'notrequired': 'none',
          'others': 'others',
          'other': 'others',
          'any': 'others',
        };
        return educationMap[normalized] || 'others';
      };

      let educationValue = mapToEducationCode(params.education_requirements?.degree);
      // No fallback - leave empty if not extracted
      if (!educationValue) {
        console.log('[TalentFlow] No education extracted, leaving empty');
      } else {
        console.log('[TalentFlow] Mapped education:', { degree: params.education_requirements?.degree, code: educationValue });
      }

      // DYNAMIC: valid industry codes come from the MASTER industry types when
      // loaded (so anything added there is honored). The built-in list is only a
      // fallback for when master data hasn't loaded yet.
      const HARDCODED_INDUSTRY_CODES = [
        'agriculture', 'forestry', 'fishing', 'mining', 'oil_gas',
        'manufacturing', 'construction', 'textiles', 'food_processing',
        'chemical', 'steel', 'energy', 'retail_wholesale', 'transportation',
        'tourism_and_hospitality', 'healthcare_and_medical', 'financial',
        'education', 'media', 'real_estate_and_property_manage', 'legal',
        'telecom', 'consulting', 'information_technology', 'research',
        'biotech', 'environment', 'aerospace_and_defense', 'defense',
        'ecommerce', 'government_and_public_administrator',
        'nonprofit_charitable_organization', 'artificial_inteligence',
        'blockchain_and_cryptocurrency', 'electric_vehicles', 'space',
        'cybersecurity', 'green_technology', 'others'
      ];
      const masterIndustryTypes = industryTypes || [];
      const validIndustryCodes = masterIndustryTypes.length
        ? masterIndustryTypes.map(t => t.code)
        : HARDCODED_INDUSTRY_CODES;
      const defaultIndustryCode = validIndustryCodes.includes('others') ? 'others' : (validIndustryCodes[0] || '');
      // Map common variations to valid codes (only used when the alias target
      // actually exists in the current (master) code set).
      const industryMapping: Record<string, string> = {
        'technology': 'information_technology',
        'it': 'information_technology',
        'tech': 'information_technology',
        'software': 'information_technology',
        'finance': 'financial',
        'banking': 'financial',
        'fintech': 'financial',
        'healthcare': 'healthcare_and_medical',
        'medical': 'healthcare_and_medical',
        'pharma': 'healthcare_and_medical',
        'retail': 'retail_wholesale',
        'e_commerce': 'ecommerce',
        'professional_services': 'consulting',
        'advisory': 'consulting',
        'ai': 'artificial_inteligence',
        'artificial_intelligence': 'artificial_inteligence',
        'blockchain': 'blockchain_and_cryptocurrency',
        'crypto': 'blockchain_and_cryptocurrency',
        'government': 'government_and_public_administrator',
        'nonprofit': 'nonprofit_charitable_organization',
        'hospitality': 'tourism_and_hospitality',
        'tourism': 'tourism_and_hospitality',
        'real_estate': 'real_estate_and_property_manage',
        'aerospace': 'aerospace_and_defense',
        'telecommunications': 'telecom',
        'logistics': 'transportation',
        'entertainment': 'media',
      };

      let rawIndustry = params.industry_type?.toLowerCase().replace(/[^a-z_]/g, '_') || '';
      let industryValue = '';

      if (rawIndustry) {
        const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const rawStripped = strip(rawIndustry);
        const aliasTarget = industryMapping[rawIndustry];
        // 1) exact master/valid code, 2) known alias (if target exists in code set),
        // 3) match a master label, 4) default ("others").
        if (validIndustryCodes.includes(rawIndustry)) {
          industryValue = rawIndustry;
        } else if (aliasTarget && validIndustryCodes.includes(aliasTarget)) {
          industryValue = aliasTarget;
        } else {
          const byLabel = masterIndustryTypes.find(t => strip(t.label) === rawStripped);
          // Falling through to "others" is the LAST resort, and it is no longer
          // silent: a code we cannot place is reported here and, when extraction
          // also proposed a name, the recruiter is offered that name under the
          // field instead of being shown a shrug.
          if (!byLabel) {
            console.warn('[TalentFlow] Industry code not in the master list:', rawIndustry);
          }
          industryValue = byLabel ? byLabel.code : defaultIndustryCode;
        }
        console.log('[TalentFlow] Mapped industry:', { raw: params.industry_type, normalized: rawIndustry, code: industryValue });
      } else {
        console.log('[TalentFlow] No industry extracted, leaving empty');
      }

      // The industry extraction proposed because nothing on the master list fitted.
      // The backend has already sanitized it (dropped job titles, sentences, and
      // names for industries we carry under other words), so anything arriving here
      // is a genuine proposal - but it is still only a proposal: it is NOT written
      // into industryType, which keeps the code the JD was filed under until the
      // recruiter presses Add.
      const suggestedIndustry = (params.industry_suggested_name || '').trim();
      const suggestedIndustryReason = (params.industry_suggested_reason || '').trim();
      if (suggestedIndustry) {
        console.log('[TalentFlow] Industry suggestion offered to the recruiter:', {
          name: suggestedIndustry,
          reason: suggestedIndustryReason,
          filedAs: industryValue,
        });
      }

      // When in edit mode, preserve existing values if extraction returns empty arrays
      // This prevents losing manually edited comments/skills when re-extracting.
      // BUT if the creation mode changed since the last extraction (e.g. the user
      // generated via AI, went back, switched to Manual and pasted new content),
      // the source is fundamentally different — treat it as a FRESH extraction so
      // stale prior-mode (AI-generated) data does not linger in the other fields.
      const extractionSourceModeChanged =
        lastExtractionSourceMode.current !== null && lastExtractionSourceMode.current !== mode;
      const isEditMode = !!editingId && !extractionSourceModeChanged
        && !forceFreshExtraction.current;

      // FIX: If user has modified extracted data (deleted/edited skills/comments), preserve their changes
      // Don't let AI extraction overwrite user's manual edits
      // Never preserve Step 2 edits across a Step 1 change: those edits were made
      // against the OLD description, so keeping them would pair old requirements with
      // new JD text - the exact mismatch this flag exists to prevent.
      const preserveUserEdits = isEditMode && extractedDataModified
        && !forceFreshExtraction.current;
      const nextExperienceYearsExplicit = (hasExpMin || hasExpMax)
        || (preserveUserEdits && resolvePersistedExperiencePayload(extractedData.experience).yearsWereExplicit);
      setExperienceYearsExplicit(nextExperienceYearsExplicit);
      // The grade the JD's words name, if any (backend-decided). Computed here, not
      // read back from state, because the save right after extraction needs it
      // before React has re-rendered - same reason nextExperienceYearsExplicit is.
      const nextExperienceLevelWord = levelWordFromParams(params);
      setExperienceLevelWord(nextExperienceLevelWord);

      const extraction: ExtractedData = {
        mustHaveSkills: preserveUserEdits ? extractedData.mustHaveSkills : mergeExtractedListField(extractedData.mustHaveSkills, params.must_have_skills, isEditMode),
        mustHaveComments: preserveUserEdits ? extractedData.mustHaveComments : mergeExtractedListField(extractedData.mustHaveComments, params.must_have_comments, isEditMode),
        niceToHaveSkills: preserveUserEdits ? extractedData.niceToHaveSkills : mergeExtractedListField(extractedData.niceToHaveSkills, params.nice_to_have_skills, isEditMode),
        niceToHaveComments: preserveUserEdits ? extractedData.niceToHaveComments : mergeExtractedListField(extractedData.niceToHaveComments, params.nice_to_have_comments, isEditMode),
        education: educationValue || (isEditMode ? extractedData.education : ''),
        // Use API's mandatory flag for education
        educationRequired: params.education_mandatory || false,
        experience: experienceValue || (isEditMode ? extractedData.experience : ''),
        // Use API's mandatory flag for experience
        experienceRequired: params.experience_mandatory || false,
        // RS20: computed here (not left to the useEffect) because the save right
        // after extraction reads this `extraction` object directly, before state
        // has re-rendered - same reason `experience` above resolves its own
        // fallback instead of reading extractedData.experience blindly.
        jobHoppingEnabled: (() => {
          const resolvedExperience = experienceValue || (isEditMode ? extractedData.experience : '');
          const range = inferExperienceRangeFromCustomValue(resolvedExperience);
          return Math.max(range.experienceMin ?? 0, range.experienceMax ?? 0) >= 3;
        })(),
        industryType: industryValue, // Only from extraction, no fallback - user must select if not extracted
        // A fresh extraction REPLACES any earlier suggestion, including clearing it:
        // the JD text has just been re-read, so a proposal it no longer makes is an
        // answer ("this is a listed industry after all"), not a gap to paper over with
        // the previous run's guess. Same reasoning as the salary bounds below.
        industrySuggestedName: suggestedIndustry || undefined,
        industrySuggestedReason: suggestedIndustryReason || undefined,
        industryConfidence: params.industry_confidence ?? undefined,
        industryIsCustom: false,
        roleFamilyRaw: params.role_family_raw || undefined,
        // Use API's mandatory flag for industry
        industryTypeRequired: params.industry_mandatory || false,
        // Extraction's answer, not a blank. The prompt carries a nine-sector section
        // teaching the model to infer a department ("Nursing", "Site Execution", "Front
        // Office", ...) and it answers well, but this line discarded it unconditionally
        // and every extracted JD saved with department = null. Same edit-mode fallback
        // as the fields around it, so a recruiter's own value is never overwritten.
        department: params.department || (isEditMode ? extractedData.department : ''),
        allowOverqualified: isEditMode ? extractedData.allowOverqualified : null,
        employmentType: normalizeExtractedEmploymentType(params.job_type) || (isEditMode ? extractedData.employmentType : 'full_time'),
        workModel: (params.work_mode as 'onsite' | 'remote' | 'hybrid' | 'field_based') || (isEditMode ? extractedData.workModel : 'onsite'),
        // Pre-fill salary from AI extraction
        // A null bound from extraction is an ANSWER - "this JD states no maximum" - not a
        // gap to be papered over with the previous value. Falling back to `prev` here meant
        // a re-extraction could never CLEAR a bound: editing the prompt from "2 LPA upto
        // 7 LPA" down to "2 LPA" re-extracted correctly as min-only, and the stale 7,00,000
        // stayed in the Maximum box (and in the saved JD) forever.
        //
        // Preserved only in edit mode, exactly like workModel/education/industryType above:
        // a FRESH extraction replaces Step 2 (see forceFreshExtraction), so it must be able
        // to replace a bound with nothing.
        //
        // EXCEPT when the backend says salary_mixed_period: true - the JD states a
        // mixed-period salary ("12,000 per month to 4 LPA") and null here is a
        // CONFIDENT answer that no single bound can be stated, not "extraction found
        // nothing." Falling back to the previous value in that case left a stale
        // min/max sitting in the Salary boxes (and, on save, in the JD) for exactly
        // the salaries the backend had deliberately left unbounded.
        salaryFrom: params.salary_min != null
          ? (sanitizeExtractedSalary(params.salary_min) || '')
          : (isEditMode && !params.salary_mixed_period ? (extractedData.salaryFrom || '') : ''),
        salaryTo: params.salary_max != null
          ? (sanitizeExtractedSalary(params.salary_max) || '')
          : (isEditMode && !params.salary_mixed_period ? (extractedData.salaryTo || '') : ''),
        compensationType: (params.compensation_type as 'yearly' | 'monthly' | 'hourly' | 'daily') || extractedData.compensationType || 'yearly',
        salaryCurrency: normalizeSalaryCurrency(params.salary_currency || extractedData.salaryCurrency),
        // Mirrors salaryFrom/salaryTo/salaryCurrency above - a fresh ground-truth
        // extraction, so "original" starts out identical to what is displayed.
        salaryOriginalFrom: params.salary_min != null
          ? (sanitizeExtractedSalary(params.salary_min) || '')
          : (isEditMode && !params.salary_mixed_period ? (extractedData.salaryOriginalFrom || '') : ''),
        salaryOriginalTo: params.salary_max != null
          ? (sanitizeExtractedSalary(params.salary_max) || '')
          : (isEditMode && !params.salary_mixed_period ? (extractedData.salaryOriginalTo || '') : ''),
        salaryOriginalCurrency: normalizeSalaryCurrency(params.salary_currency || extractedData.salaryOriginalCurrency),
        // "City, State" when the JD qualified the city, matching how a SAVED JD is loaded
        // (see the load effect) and how the save path re-splits it. Dropping `state` here
        // meant an extracted "Chennai, Tamil Nadu" reached Step 2 as a bare "Chennai" and
        // was persisted with state=null, so it no longer matched the city the recruiter
        // would pick by hand.
        locations: (params.locations || []).length > 0 ? params.locations.map((loc: any) => ({
          city: loc.state ? `${loc.city}, ${loc.state}` : (loc.city || ''),
          radius: loc.radius_km != null ? String(loc.radius_km) : '50'  // Use JD-stated radius when extracted, else default
        })) : (isEditMode ? extractedData.locations : []),
        locationsRequired: params.location_mandatory || (isEditMode ? extractedData.locationsRequired : false),
        assessmentGuidance: isEditMode ? extractedData.assessmentGuidance : '',
        // JD22. Extraction now DOES produce this field (the catch-all for anything the
        // structured fields do not model), but what the recruiter typed still wins -
        // it is filled from extraction only while the box is empty. Carrying `prev`
        // over otherwise is also what makes the text survive moving between steps
        // (JD22 req 3).
        additionalDetails: resolveAdditionalDetails(
          extractedData.additionalDetails,
          extractionFilledAdditionalDetails.current,
          params.additional_details,
        ),
        // Both names: a fresh extraction returns `merge_trail`, a saved JD returns the
        // same groups as `skill_merge_trail`. See the other read site for why.
        // ALL kinds. This used to keep only skill entries, so requirement groups
        // never reached the screen - and since this state is what gets saved, they
        // were also deleted from the JD on the first save.
        mergeTrail: ((params.merge_trail || params.skill_merge_trail || []) as JDMergeTrailEntry[]),
        internalRecruiterComments: isEditMode ? extractedData.internalRecruiterComments : [],
        // JD09: Extract certifications and domain keywords
        certifications: params.certifications?.length > 0 ? params.certifications : (isEditMode ? extractedData.certifications : []),
        domainKeywords: params.domain_keywords?.length > 0 ? params.domain_keywords : (isEditMode ? extractedData.domainKeywords : []),
        // Coding assessment fields - extract from AI response
        // Forced OFF: the 'Requires a hands-on coding assessment' control was removed
        // from JD creation, so nothing can clear a wrongly-extracted true. Leaving it
        // set would let jd_analyzer.validate_for_assessment() block assessment creation
        // ("JD requires coding but no programming languages are specified") with no UI
        // to recover. Languages are cleared for the same reason.
        codingRequired: false,
        suggestedLanguages: [],
      };

      // Record what extraction just auto-filled, so a LATER extraction can tell this
      // text apart from something the recruiter typed. See resolveAdditionalDetails.
      extractionFilledAdditionalDetails.current = params.additional_details || '';

      // FIRST-RENDER DE-DUPLICATION.
      // The cross-list dedupe used to run only on the Step 2 -> Step 3 transition, and
      // only when the recruiter had actually edited something (the reformat pass is
      // deliberately gated on "no edits -> no AI call"). So a FRESH extraction with no
      // edits - which is the exact reproduction path in the BUG3 report - rendered
      // whatever the backend returned, duplicates included.
      //
      // This is the DETERMINISTIC pass only (same normalization as the backend's
      // _dedupe_exact_across_lists). It fires no network request, so the
      // "editing a JD with no changes triggers no LLM call" invariant is preserved.
      const dedupedLists = dedupeListsDeterministic({
        mustHaveSkills: extraction.mustHaveSkills || [],
        niceToHaveSkills: extraction.niceToHaveSkills || [],
        mustHaveComments: extraction.mustHaveComments || [],
        niceToHaveComments: extraction.niceToHaveComments || [],
      });
      const removedByFirstRenderDedupe =
        (extraction.mustHaveSkills?.length || 0) + (extraction.niceToHaveSkills?.length || 0) +
        (extraction.mustHaveComments?.length || 0) + (extraction.niceToHaveComments?.length || 0) -
        (dedupedLists.mustHaveSkills.length + dedupedLists.niceToHaveSkills.length +
         dedupedLists.mustHaveComments.length + dedupedLists.niceToHaveComments.length);
      if (removedByFirstRenderDedupe > 0) {
        console.log(`[TalentFlow] First-render dedupe removed ${removedByFirstRenderDedupe} duplicate entr${removedByFirstRenderDedupe === 1 ? 'y' : 'ies'}`);
      }
      extraction.mustHaveSkills = dedupedLists.mustHaveSkills;
      extraction.niceToHaveSkills = dedupedLists.niceToHaveSkills;
      extraction.mustHaveComments = dedupedLists.mustHaveComments;
      extraction.niceToHaveComments = dedupedLists.niceToHaveComments;

      // COUNTRY DEFAULT FROM THE JD, not from a hardcoded home market.
      // `locationCountry` starts at 'IN', so a US job description - "Remote positions
      // are U.S.-based only", salary quoted in USD - still opened the Locations picker
      // on India, and every city list under it was Indian. The recruiter had to notice
      // and switch it manually on every US JD.
      //
      // Extraction deliberately returns no locations (the recruiter picks the city), so
      // the currency the JD quotes its salary in is the signal that IS available, and it
      // is already extracted reliably. Only applied when the user has not picked
      // locations yet, so it can never override a deliberate choice.
      if (extraction.salaryCurrency === 'USD' && (extraction.locations || []).length === 0) {
        setLocationCountry(prev => (prev === 'IN' ? 'US' : prev));
      }

      const extractionExperiencePayload = resolvePersistedExperiencePayload(
        extraction.experience, nextExperienceYearsExplicit, nextExperienceLevelWord
      );
      setShowCustomExperienceInput(Boolean(extraction.experience && extractionExperiencePayload.isCustom));

      console.log('[TalentFlow] Final extracted data being set:', {
        experience: extraction.experience,
        experienceRequired: extraction.experienceRequired,
        education: extraction.education,
        educationRequired: extraction.educationRequired,
        industryType: extraction.industryType,
        industryTypeRequired: extraction.industryTypeRequired,
        mustHaveSkills: (extraction.mustHaveSkills?.length || 0) + ' skills',
        mustHaveComments: (extraction.mustHaveComments?.length || 0) + ' comments',
        niceToHaveSkills: (extraction.niceToHaveSkills?.length || 0) + ' skills',
        niceToHaveComments: (extraction.niceToHaveComments?.length || 0) + ' comments',
        employmentType: extraction.employmentType,
        workModel: extraction.workModel,
        salaryRange: `${extraction.salaryFrom}-${extraction.salaryTo}`,
      });

      console.log('[TalentFlow] Extracted coding fields:', {
        codingRequired: extraction.codingRequired,
        suggestedLanguages: extraction.suggestedLanguages
      });

      console.log('[TalentFlow] Setting extractedData with comments:', {
        mustHaveComments: extraction.mustHaveComments,
        niceToHaveComments: extraction.niceToHaveComments
      });
      setExtractedData(extraction);
      // The backend's answer, not a second implementation of the rule here.
      setJdWelcomesFreshers(Boolean(params.experience_welcomes_freshers));
      lastExtractionSourceMode.current = mode;
      // We now hold the authoritative extracted data in state. Saving below sets
      // the JD id into the URL (ensureJDCreationUrl), which makes the page re-fetch
      // the JD and re-populate `editingJD`. Without this flag, the load effect would
      // then RELOAD from that re-fetched JD a couple seconds later and overwrite the
      // just-extracted data — the reported bug where the Additional Requirements
      // (comments) sections vanished after extraction. Mark as already loaded so
      // that reload is suppressed and the extraction result is preserved.
      hasLoadedFromEditingJD.current = true;
      setExtractedDataModified(false);  // Reset after fresh extraction - no user modifications yet

      // Chain invalidation: this extraction replaced Step 2's data, so Step 3's formatted
      // description (and the de-dupe folded into it) is now built from stale input.
      // Compared BEFORE the snapshot is overwritten - afterwards the difference is gone.
      const nextStep2Snapshot = step2Fingerprint(extraction, trimmedJobTitle);
      if (step2DataSnapshot.current !== '' && step2DataSnapshot.current !== nextStep2Snapshot) {
        extractionInvalidatedFormat.current = true;
        // "Already formatted for review" stops being true the moment the data under it is
        // re-derived. Without this, a draft opened at the review stage (which sets the flag
        // on load) stays suppressed no matter how much the extraction changed.
        setHasFormattedForReview(false);
        console.log('[TalentFlow] Extraction changed Step 2 data - Step 3 will be re-formatted');
      }
      step2DataSnapshot.current = nextStep2Snapshot;  // Snapshot for change detection
      setLastExtractedJD(jdText);  // Track JD text to skip extraction if unchanged on next "Next" click

      // Trigger salary validation so warning shows immediately if only one field is filled
      if (extraction.salaryFrom || extraction.salaryTo) {
        const salaryErr = validateSalaryRange(extraction.salaryFrom || '', extraction.salaryTo || '');
        setValidationErrors(prev => ({ ...prev, salaryRange: salaryErr }));
      }

      // Save original Stage 1 values to detect modifications if user returns from review
      setOriginalStage1Values({
        jobTitle: jobTitle,
        aiPrompt: aiPrompt,
        generatedJD: generatedJD,
        manualJD: manualJD
      });

      console.log('[TalentFlow] Moving to extract step...');
      setStep('extract');

      // Save JD with creation_stage: 'extract' so refresh preserves the stage
      console.log('[TalentFlow] Saving JD with extract stage, editingId:', editingId);
      const jdData = {
        title: trimmedJobTitle,
        description: jdText,
        creation_stage: 'extract' as const,
        creation_method: (mode === 'ai' ? 'ai_generated' : 'manual') as 'ai_generated' | 'manual',
        ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
        must_have_skills: extraction.mustHaveSkills,
        nice_to_have_skills: extraction.niceToHaveSkills,
        must_have_comments: extraction.mustHaveComments,
        nice_to_have_comments: extraction.niceToHaveComments,
        // The groups + notes that go WITH those four lists. This is the first save after
        // extraction, and it was writing the lists without them: the row had the skills
        // and an empty `skill_merge_trail`, so a refresh on Step 2 - before the recruiter
        // ever pressed Next, which is the only save that used to send the trail - showed a
        // flat skill list with nothing grouped and nothing to promote back out. The
        // provenance existed only in the browser's memory until Step 2 was left.
        skill_merge_trail: extraction.mergeTrail || [],
        education_requirements: extraction.education ? { degree: extraction.education } : undefined,
        experience_min: extractionExperiencePayload.experienceMin,
        experience_max: extractionExperiencePayload.experienceMax,
        ...buildIndustryPayload(extraction),
        role_family: extraction.roleFamily || undefined,
        role_family_confidence: extraction.roleFamilyConfidence ?? undefined,
        // `?? null`, never bare undefined - same rule as the experience payload below.
        // parseSalaryInput returns undefined for an empty box, JSON.stringify DROPS an
        // undefined key, and the backend's exclude_unset PATCH then never sees the field
        // and keeps whatever an earlier save wrote. So a JD re-extracted as "up to 5 LPA"
        // (max only) kept its old salary_min forever and carried on rendering a range
        // instead of "Up to Rs 5,00,000". Sending null clears the column.
        salary_min: parseSalaryInput(extraction.salaryFrom) ?? null,
        salary_max: parseSalaryInput(extraction.salaryTo) ?? null,
        compensation_type: extraction.compensationType,
        salary_currency: extraction.salaryCurrency,
        employment_type: extraction.employmentType,
        remote_type: extraction.workModel,
        certifications: extraction.certifications,
        domain_keywords: extraction.domainKeywords,
        // Coding assessment fields
        coding_required: extraction.codingRequired,
        supported_languages: extraction.suggestedLanguages,
        job_level: extractionExperiencePayload.jobLevel,
        locations: (extraction.locations || []).map(loc => ({
          city: loc.city,
          radius_km: parseInt(loc.radius) || 50,
          is_required: extraction.locationsRequired,
          country: loc.country || locationCountry,
        })),
        // Mandatory flags - determines if criteria is Required vs Preferred in scoring
        experience_mandatory: extraction.experienceRequired || false,
        education_mandatory: extraction.educationRequired || false,
        industry_mandatory: extraction.industryTypeRequired || false,
        location_mandatory: extraction.locationsRequired || false,
        // RS20: Job Hopping toggle.
        job_hopping_enabled: extraction.jobHoppingEnabled ?? true,
      };

      console.log('[TalentFlow] Saving JD with coding fields:', {
        coding_required: jdData.coding_required,
        supported_languages: jdData.supported_languages
      });

      try {
        let savedJd;
        let jdId = editingId;
        if (editingId) {
          savedJd = await jdService.update(editingId, jdData);
          console.log('[TalentFlow] JD updated with extract stage, id:', editingId);
        } else {
          savedJd = await jdService.create({ ...jdData, as_working_copy: true });
          jdId = savedJd.id;
          createdInSessionIdRef.current = savedJd.id;
          setUnsavedNewCopyId(savedJd.id);
          setEditingId(savedJd.id);
          console.log('[TalentFlow] JD created with extract stage, new id:', savedJd.id);
        }

        savedContentKeyRef.current = currentContentKeyRef.current;
        markStepSaveCheckpoint(savedJd, 'the version saved when you finished Step 1 (Create)');
        if (jdId) {
          ensureJDCreationUrl(jdId, 'extract');
        }
      } catch (saveError) {
        console.error('[TalentFlow] Failed to save extract stage:', saveError);
        toast.error({
          title: 'Save Failed',
          description: 'Could not save progress. Your work may be lost on refresh.',
        });
      }

      toast.success({
        title: 'Data Extracted',
        description: 'AI has analyzed your JD and extracted key requirements.'
      });
    } catch (error) {
      console.error('[TalentFlow] Extraction failed:', error);

      // Reset hasProceededToExtract so user can try again
      setHasProceededToExtract(false);

      // Show appropriate error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('AI service')) {
        toast.error({
          title: 'AI Service Error',
          description: 'The AI extraction service is currently unavailable. Please try again later.'
        });
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        toast.error({
          title: 'Connection Error',
          description: 'Could not connect to the server. Please check your internet connection.'
        });
      } else {
        toast.error({
          title: 'Extraction Failed',
          description: errorMessage || 'Could not extract parameters from JD. Please try again.',
        });
      }
    } finally {
      setIsExtracting(false);
      // Cleared in `finally`, not only on success: if the extraction call throws, a flag
      // left set would suppress preservation on the NEXT extraction too, silently wiping
      // Step 2 edits that had nothing to do with the failed attempt.
      forceFreshExtraction.current = false;
    }
  };

  // What the Next button is bound to: one click, one advance.
  //
  // The button's `disabled` prop cannot carry this on its own. `disabled` only
  // takes effect after React re-renders, and the advance above awaits
  // `ensureValidJobTitle` (a network round-trip) before it sets `isExtracting`
  // - so a second click landing in that window entered the handler again and
  // ran the whole Step 1 -> Step 2 transition a second time. The ref flips
  // synchronously, so the second entry is rejected on the same tick.
  //
  // `finally` matters: an advance that throws must leave the button usable, or
  // a single failed attempt would strand the user on Step 1 for good.
  const handleNext = async () => {
    if (isAdvancingRef.current) {
      console.log('[TalentFlow] Next ignored — an advance is already in flight');
      return;
    }
    isAdvancingRef.current = true;
    try {
      await advanceFromCreateStep();
    } finally {
      isAdvancingRef.current = false;
    }
  };

  // Blocks a value that already exists in ANY of the four lists (Must/Nice
  // Skills + Comments). Shows a clear toast naming where the duplicate lives.
  // `skip` lets an inline edit ignore the slot it is editing. Returns true when
  // a duplicate was found (i.e. the caller should abort).
  const isDuplicateAcrossLists = (
    value: string,
    skip?: { listKey: DuplicateListKey; index: number },
  ): boolean => {
    const hit = findDuplicateAcrossLists(
      value,
      {
        mustHaveSkills: extractedData.mustHaveSkills || [],
        niceToHaveSkills: extractedData.niceToHaveSkills || [],
        mustHaveComments: extractedData.mustHaveComments || [],
        niceToHaveComments: extractedData.niceToHaveComments || [],
      },
      skip,
    );

    if (!hit) return false;

    toast.error({
      title: 'Already added',
      description: `"${hit.existingValue}" already exists under ${DUPLICATE_LIST_LABELS[hit.listKey]}. Each skill or comment can be added only once across Must-Have and Nice-to-Have lists.`,
    });
    return true;
  };

  const handleAddSkill = async (category: 'mustHaveSkills' | 'niceToHaveSkills') => {
    if (newSkill.trim()) {
      const skillToAdd = newSkill.trim();
      const fieldLabel = category === 'mustHaveSkills' ? 'Must-have skills' : 'Nice-to-have skills';

      if (!validateEnglishOnlyExtractedValue(skillToAdd, fieldLabel)) {
        return;
      }

      if (isDuplicateAcrossLists(skillToAdd)) {
        return;
      }

      console.log('[Add] Adding skill:', skillToAdd, 'to', category);

      // Calculate updated arrays
      const updatedMustHave = category === 'mustHaveSkills'
        ? [...extractedData.mustHaveSkills, skillToAdd]
        : extractedData.mustHaveSkills;
      const updatedNiceToHave = category === 'niceToHaveSkills'
        ? [...extractedData.niceToHaveSkills, skillToAdd]
        : extractedData.niceToHaveSkills;

      setExtractedData(prev => ({
        ...prev,
        mustHaveSkills: updatedMustHave,
        niceToHaveSkills: updatedNiceToHave,
      }));
      setNewSkill('');
      setEditingCategory(null);
      // A new skill appends to the end, which is behind the "+N more" fold on a
      // long list — expand so the recruiter sees what they just added.
      setExpandedSkillCategories(prev => ({ ...prev, [category]: true }));
      markExtractedDataModified();

      // Clear validation error when skill is added
      if (category === 'mustHaveSkills') {
        setValidationErrors(prev => ({ ...prev, mustHaveSkills: undefined }));
      }

      // Save to DB immediately
      if (editingId) {
        try {
          await jdService.update(editingId, {
            must_have_skills: updatedMustHave,
            nice_to_have_skills: updatedNiceToHave,
          });
          console.log('[Add] Skill added and saved to DB successfully:', skillToAdd);
        } catch (error) {
          console.error('[Add] Failed to save skill addition:', error);
          toast.error({
            title: 'Failed to save',
            description: 'Skill was added locally but could not be saved. Please try again.',
          });
        }
      } else {
        console.warn('[Add] editingId is null - skill addition not persisted to DB.');
      }
    }
  };

  const handleRemoveSkill = async (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number) => {
    // Get the skill being deleted for logging
    const deletedSkill = extractedData[category][index];
    console.log('[Delete] Removing skill:', deletedSkill, 'from', category);

    // Update local state immediately
    const updatedMustHave = category === 'mustHaveSkills'
      ? extractedData.mustHaveSkills.filter((_, i) => i !== index)
      : extractedData.mustHaveSkills;
    const updatedNiceToHave = category === 'niceToHaveSkills'
      ? extractedData.niceToHaveSkills.filter((_, i) => i !== index)
      : extractedData.niceToHaveSkills;

    const nextTrail = trailAfterRemoval(
      extractedData.mergeTrail || [],
      category === 'mustHaveSkills' ? 'must_have_skills' : 'nice_to_have_skills',
      deletedSkill,
    );

    const updatedData = {
      ...extractedData,
      mustHaveSkills: updatedMustHave,
      niceToHaveSkills: updatedNiceToHave,
      mergeTrail: nextTrail,
    };
    setExtractedData(updatedData);
    markExtractedDataModified();  // Mark as modified to prevent reload from DB

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          must_have_skills: updatedMustHave,
          nice_to_have_skills: updatedNiceToHave,
          skill_merge_trail: nextTrail,
        });
        console.log('[Delete] Skill deleted and saved to DB successfully:', deletedSkill);
      } catch (error) {
        console.error('[Delete] Failed to save skill deletion:', error);
        toast.error({
          title: 'Failed to save',
          description: 'Skill was removed locally but could not be saved. Please try again.',
        });
      }
    } else {
      // editingId is null - JD hasn't been saved yet
      // This shouldn't happen in Stage 2, but log it for debugging
      console.warn('[Delete] editingId is null - skill deletion not persisted to DB. Will be saved when proceeding to next stage.');
    }
  };

  // `toIndex`: where in the target list to insert (a drag-and-drop).
  // Omitted (the arrow button) appends as before.
  const handleMoveSkill = async (skill: string, from: 'mustHaveSkills' | 'niceToHaveSkills', to: 'mustHaveSkills' | 'niceToHaveSkills', toIndex?: number) => {
    console.log('[Move] Moving skill:', skill, 'from', from, 'to', to, 'at', toIndex);

    // Calculate updated arrays
    const updatedFrom = extractedData[from].filter(s => s !== skill);
    const updatedTo = [...extractedData[to]];
    updatedTo.splice(Math.min(Math.max(toIndex ?? updatedTo.length, 0), updatedTo.length), 0, skill);

    const updatedMustHave = from === 'mustHaveSkills' ? updatedFrom : (to === 'mustHaveSkills' ? updatedTo : extractedData.mustHaveSkills);
    const updatedNiceToHave = from === 'niceToHaveSkills' ? updatedFrom : (to === 'niceToHaveSkills' ? updatedTo : extractedData.niceToHaveSkills);

    const nextTrail = trailAfterMove(
      extractedData.mergeTrail || [], skill,
      from === 'mustHaveSkills' ? 'must_have_skills' : 'nice_to_have_skills',
      to === 'mustHaveSkills' ? 'must_have_skills' : 'nice_to_have_skills',
    );

    setExtractedData(prev => ({
      ...prev,
      mustHaveSkills: updatedMustHave,
      niceToHaveSkills: updatedNiceToHave,
      mergeTrail: nextTrail,
    }));
    markExtractedDataModified();

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          must_have_skills: updatedMustHave,
          nice_to_have_skills: updatedNiceToHave,
          skill_merge_trail: nextTrail,
        });
        console.log('[Move] Skill moved and saved to DB successfully:', skill);
      } catch (error) {
        console.error('[Move] Failed to save skill move:', error);
        toast.error({
          title: 'Failed to save',
          description: 'Skill was moved locally but could not be saved. Please try again.',
        });
      }
    } else {
      console.warn('[Move] editingId is null - skill move not persisted to DB.');
    }
  };

  const handleAddComment = async () => {
    if (newComment.trim()) {
      const commentToAdd = newComment.trim();

      if (!validateEnglishOnlyExtractedValue(commentToAdd, 'Must-have additional requirements')) {
        return;
      }

      if (isDuplicateAcrossLists(commentToAdd)) {
        return;
      }

      // A requirement is a line, so it reads as one whether the recruiter typed it
      // or extraction supplied it.
      const updatedComments = [...extractedData.mustHaveComments, sentenceCase(commentToAdd)];

      setExtractedData(prev => ({
        ...prev,
        mustHaveComments: updatedComments,
      }));
      setNewComment('');
      setEditingCategory(null);
      // Appended past the "+N requirements" fold — expand so it stays in view.
      setExpandedSkillCategories(prev => ({ ...prev, mustHaveComments: true }));
      markExtractedDataModified(); // Mark as modified for regeneration
      // Clear validation error when comment is added
      setValidationErrors(prev => ({ ...prev, mustHaveComments: undefined }));

      // Save to DB immediately
      if (editingId) {
        try {
          await jdService.update(editingId, {
            must_have_comments: updatedComments,
          });
          console.log('[Add] Comment added and saved to DB');
        } catch (error) {
          console.error('[Add] Failed to save comment addition:', error);
        }
      }
    }
  };

  const handleRemoveComment = async (index: number) => {
    // Update local state immediately
    const updatedComments = extractedData.mustHaveComments.filter((_, i) => i !== index);
    setExtractedData(prev => ({
      ...prev,
      mustHaveComments: updatedComments,
    }));
    markExtractedDataModified();  // Mark as modified to prevent reload from DB

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          must_have_comments: updatedComments,
        });
        console.log('[Delete] Comment deleted and saved to DB');
      } catch (error) {
        console.error('[Delete] Failed to save comment deletion:', error);
      }
    }
  };

  // Inline editing handlers
  const handleStartEditSkill = (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number, value: string) => {
    setEditingSkillIndex({ category, index });
    setEditingSkillValue(value);
  };

  const handleSaveEditSkill = async () => {
    if (editingSkillIndex && editingSkillValue.trim()) {
      const { category, index } = editingSkillIndex;
      const newValue = editingSkillValue.trim();
      const fieldLabel = category === 'mustHaveSkills' ? 'Must-have skills' : 'Nice-to-have skills';

      if (!validateEnglishOnlyExtractedValue(newValue, fieldLabel)) {
        return;
      }

      if (isDuplicateAcrossLists(newValue, { listKey: category, index })) {
        return;
      }

      // Calculate updated arrays
      const updatedMustHave = category === 'mustHaveSkills'
        ? extractedData.mustHaveSkills.map((skill, i) => i === index ? newValue : skill)
        : extractedData.mustHaveSkills;
      const updatedNiceToHave = category === 'niceToHaveSkills'
        ? extractedData.niceToHaveSkills.map((skill, i) => i === index ? newValue : skill)
        : extractedData.niceToHaveSkills;

      const listKey = category === 'mustHaveSkills' ? 'must_have_skills' : 'nice_to_have_skills';
      const previousValue = extractedData[category][index];
      const nextTrail = trailAfterRename(
        extractedData.mergeTrail || [], listKey, previousValue, newValue,
      );

      setExtractedData(prev => ({
        ...prev,
        mustHaveSkills: updatedMustHave,
        niceToHaveSkills: updatedNiceToHave,
        mergeTrail: nextTrail,
      }));
      markExtractedDataModified();

      // Save to DB immediately
      if (editingId) {
        try {
          await jdService.update(editingId, {
            must_have_skills: updatedMustHave,
            nice_to_have_skills: updatedNiceToHave,
            skill_merge_trail: nextTrail,
          });
          console.log('[Edit] Skill edited and saved to DB');
        } catch (error) {
          console.error('[Edit] Failed to save skill edit:', error);
        }
      }
    }
    setEditingSkillIndex(null);
    setEditingSkillValue('');
  };

  const handleCancelEditSkill = () => {
    setEditingSkillIndex(null);
    setEditingSkillValue('');
  };

  const handleStartEditComment = (index: number, value: string) => {
    setEditingCommentIndex(index);
    setEditingCommentValue(value);
  };

  const handleSaveEditComment = async () => {
    if (editingCommentIndex !== null && editingCommentValue.trim()) {
      const newValue = editingCommentValue.trim();

      if (!validateEnglishOnlyExtractedValue(newValue, 'Must-have additional requirements')) {
        return;
      }

      if (isDuplicateAcrossLists(newValue, { listKey: 'mustHaveComments', index: editingCommentIndex })) {
        return;
      }

      const updatedComments = extractedData.mustHaveComments.map((comment, i) =>
        i === editingCommentIndex ? newValue : comment
      );

      setExtractedData(prev => ({
        ...prev,
        mustHaveComments: updatedComments,
      }));
      markExtractedDataModified(); // Mark as modified for regeneration

      // Save to DB immediately
      if (editingId) {
        try {
          await jdService.update(editingId, {
            must_have_comments: updatedComments,
          });
          console.log('[Edit] Comment edited and saved to DB');
        } catch (error) {
          console.error('[Edit] Failed to save comment edit:', error);
        }
      }
    }
    setEditingCommentIndex(null);
    setEditingCommentValue('');
  };

  const handleCancelEditComment = () => {
    setEditingCommentIndex(null);
    setEditingCommentValue('');
  };

  // Nice-to-Have Comments handlers
  const handleAddNiceComment = () => {
    if (newComment.trim()) {
      const commentToAdd = newComment.trim();

      if (!validateEnglishOnlyExtractedValue(commentToAdd, 'Nice-to-have additional requirements')) {
        return;
      }

      if (isDuplicateAcrossLists(commentToAdd)) {
        return;
      }

      setExtractedData(prev => ({
        ...prev,
        niceToHaveComments: [...(prev.niceToHaveComments || []), sentenceCase(commentToAdd)],
      }));
      setNewComment('');
      setEditingCategory(null);
      // Appended past the "+N requirements" fold — expand so it stays in view.
      setExpandedSkillCategories(prev => ({ ...prev, niceToHaveComments: true }));
      markExtractedDataModified(); // Mark as modified for regeneration
    }
  };

  const handleRemoveNiceComment = async (index: number) => {
    const updatedComments = (extractedData.niceToHaveComments || []).filter((_, i) => i !== index);
    setExtractedData(prev => ({
      ...prev,
      niceToHaveComments: updatedComments,
    }));
    markExtractedDataModified();  // Mark as modified to prevent reload from DB

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          nice_to_have_comments: updatedComments,
        });
        console.log('[Delete] Nice comment deleted and saved to DB');
      } catch (error) {
        console.error('[Delete] Failed to save nice comment deletion:', error);
      }
    }
  };

  const handleStartEditNiceComment = (index: number, value: string) => {
    setEditingNiceCommentIndex(index);
    setEditingNiceCommentValue(value);
  };

  const handleSaveEditNiceComment = () => {
    if (editingNiceCommentIndex !== null && editingNiceCommentValue.trim()) {
      const newValue = editingNiceCommentValue.trim();

      if (!validateEnglishOnlyExtractedValue(newValue, 'Nice-to-have additional requirements')) {
        return;
      }

      if (isDuplicateAcrossLists(newValue, { listKey: 'niceToHaveComments', index: editingNiceCommentIndex })) {
        return;
      }

      setExtractedData(prev => ({
        ...prev,
        niceToHaveComments: (prev.niceToHaveComments || []).map((comment, i) =>
          i === editingNiceCommentIndex ? newValue : comment
        ),
      }));
      markExtractedDataModified(); // Mark as modified for regeneration
    }
    setEditingNiceCommentIndex(null);
    setEditingNiceCommentValue('');
  };

  const handleCancelEditNiceComment = () => {
    setEditingNiceCommentIndex(null);
    setEditingNiceCommentValue('');
  };

  const handleAddRecruiterComment = () => {
    if (newRecruiterComment.trim()) {
      const commentToAdd = newRecruiterComment.trim();

      if (!validateEnglishOnlyExtractedValue(commentToAdd, 'Internal recruiter notes')) {
        return;
      }

      setExtractedData(prev => ({
        ...prev,
        internalRecruiterComments: [...prev.internalRecruiterComments, commentToAdd],
      }));
      setNewRecruiterComment('');
      setEditingCategory(null);
      markExtractedDataModified();
    }
  };

  const handleRemoveRecruiterComment = async (index: number) => {
    const updatedComments = extractedData.internalRecruiterComments.filter((_, i) => i !== index);
    setExtractedData(prev => ({
      ...prev,
      internalRecruiterComments: updatedComments,
    }));
    markExtractedDataModified();

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          internal_comments: updatedComments.join('\n') || undefined,
        });
        console.log('[Delete] Recruiter comment deleted and saved to DB');
      } catch (error) {
        console.error('[Delete] Failed to save recruiter comment deletion:', error);
      }
    }
  };

  const handleStartEditRecruiterComment = (index: number, value: string) => {
    setEditingRecruiterCommentIndex(index);
    setEditingRecruiterCommentValue(value);
  };

  const handleSaveEditRecruiterComment = () => {
    if (editingRecruiterCommentIndex !== null && editingRecruiterCommentValue.trim()) {
      const newValue = editingRecruiterCommentValue.trim();

      if (!validateEnglishOnlyExtractedValue(newValue, 'Internal recruiter notes')) {
        return;
      }

      setExtractedData(prev => ({
        ...prev,
        internalRecruiterComments: prev.internalRecruiterComments.map((comment, i) =>
          i === editingRecruiterCommentIndex ? newValue : comment
        ),
      }));
      markExtractedDataModified();
    }
    setEditingRecruiterCommentIndex(null);
    setEditingRecruiterCommentValue('');
  };

  const handleCancelEditRecruiterComment = () => {
    setEditingRecruiterCommentIndex(null);
    setEditingRecruiterCommentValue('');
  };

  // Certification handlers
  const handleAddCertification = async () => {
    if (newCertification.trim()) {
      const certToAdd = newCertification.trim();

      if (!validateEnglishOnlyExtractedValue(certToAdd, 'Certifications')) {
        return;
      }

      const updatedCertifications = [...extractedData.certifications, certToAdd];

      setExtractedData(prev => ({
        ...prev,
        certifications: updatedCertifications,
      }));
      setNewCertification('');
      setEditingCategory(null);
      markExtractedDataModified();

      // Save to DB immediately
      if (editingId) {
        try {
          await jdService.update(editingId, {
            certifications: updatedCertifications,
          });
          console.log('[Add] Certification added and saved to DB');
        } catch (error) {
          console.error('[Add] Failed to save certification addition:', error);
        }
      }
    }
  };

  const handleRemoveCertification = async (index: number) => {
    const deletedCert = extractedData.certifications[index];
    const updatedCertifications = extractedData.certifications.filter((_, i) => i !== index);

    setExtractedData(prev => ({
      ...prev,
      certifications: updatedCertifications,
    }));
    markExtractedDataModified();

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          certifications: updatedCertifications,
        });
        console.log('[Delete] Certification deleted and saved to DB:', deletedCert);
      } catch (error) {
        console.error('[Delete] Failed to save certification deletion:', error);
      }
    }
  };

  // Domain Keywords handlers
  const handleAddDomainKeyword = async () => {
    if (newDomainKeyword.trim()) {
      const keywordToAdd = newDomainKeyword.trim();

      if (!validateEnglishOnlyExtractedValue(keywordToAdd, 'Domain keywords')) {
        return;
      }

      const updatedKeywords = [...extractedData.domainKeywords, keywordToAdd];

      setExtractedData(prev => ({
        ...prev,
        domainKeywords: updatedKeywords,
      }));
      setNewDomainKeyword('');
      setEditingCategory(null);
      markExtractedDataModified();

      // Save to DB immediately
      if (editingId) {
        try {
          await jdService.update(editingId, {
            domain_keywords: updatedKeywords,
          });
          console.log('[Add] Domain keyword added and saved to DB');
        } catch (error) {
          console.error('[Add] Failed to save domain keyword addition:', error);
        }
      }
    }
  };

  const handleRemoveDomainKeyword = async (index: number) => {
    const deletedKeyword = extractedData.domainKeywords[index];
    const updatedKeywords = extractedData.domainKeywords.filter((_, i) => i !== index);

    setExtractedData(prev => ({
      ...prev,
      domainKeywords: updatedKeywords,
    }));
    markExtractedDataModified();

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          domain_keywords: updatedKeywords,
        });
        console.log('[Delete] Domain keyword deleted and saved to DB:', deletedKeyword);
      } catch (error) {
        console.error('[Delete] Failed to save domain keyword deletion:', error);
      }
    }
  };

  /* Moves `item` within one list so it ends up at `insertIndex` (an index in
     the list as it was BEFORE the move - what the drop target measured).
     Returns null when it would not move. */
  const reorderWithin = (list: string[], value: string, fromIndex: number, insertIndex: number): string[] | null => {
    const current = list[fromIndex] === value ? fromIndex : list.indexOf(value);
    if (current < 0) return null;
    // Removing the item first shifts every later position up by one.
    const target = current < insertIndex ? insertIndex - 1 : insertIndex;
    if (target === current) return null;
    const next = [...list];
    next.splice(current, 1);
    next.splice(Math.min(Math.max(target, 0), next.length), 0, value);
    return next;
  };

  // A skill dropped at an exact position: across lists it moves there; within
  // its own list it is reordered. Saved the same way as every skill move.
  const handleDropSkill = async (item: { skill: string; category: 'mustHaveSkills' | 'niceToHaveSkills'; index: number }, toCategory: 'mustHaveSkills' | 'niceToHaveSkills', insertIndex: number) => {
    if (item.category !== toCategory) {
      handleMoveSkill(item.skill, item.category, toCategory, insertIndex);
      return;
    }
    const reordered = reorderWithin(extractedData[toCategory], item.skill, item.index, insertIndex);
    if (!reordered) return;
    setExtractedData(prev => ({ ...prev, [toCategory]: reordered }));
    markExtractedDataModified();
    if (editingId) {
      try {
        await jdService.update(editingId, toCategory === 'mustHaveSkills'
          ? { must_have_skills: reordered }
          : { nice_to_have_skills: reordered });
      } catch (error) {
        console.error('[Reorder] Failed to save skill order:', error);
        toast.error({
          title: 'Failed to save',
          description: 'Skill was reordered locally but could not be saved. Please try again.',
        });
      }
    }
  };

  // Comment move/drop handlers for drag and drop
  // `toIndex` as for skills: a drag-and-drop inserts there; omitted appends.
  const handleMoveComment = (comment: string, from: 'mustHaveComments' | 'niceToHaveComments', to: 'mustHaveComments' | 'niceToHaveComments', toIndex?: number) => {
    const insertAt = (list: string[]) => {
      const next = [...list];
      next.splice(Math.min(Math.max(toIndex ?? next.length, 0), next.length), 0, comment);
      return next;
    };
    setExtractedData(prev => ({
      ...prev,
      [from]: (prev[from] || []).filter(c => c !== comment),
      [to]: insertAt(prev[to] || []),
      mergeTrail: trailAfterMove(
        prev.mergeTrail || [], comment,
        from === 'mustHaveComments' ? 'must_have_comments' : 'nice_to_have_comments',
        to === 'mustHaveComments' ? 'must_have_comments' : 'nice_to_have_comments',
      ),
    }));
    markExtractedDataModified();
  };

  // A requirement dropped at an exact position: across lists it moves there;
  // within its own list it is reordered (kept with the step, as moves are).
  const handleDropComment = (item: { comment: string; category: 'mustHaveComments' | 'niceToHaveComments'; index: number }, toCategory: 'mustHaveComments' | 'niceToHaveComments', insertIndex: number) => {
    if (item.category !== toCategory) {
      handleMoveComment(item.comment, item.category, toCategory, insertIndex);
      return;
    }
    const reordered = reorderWithin(extractedData[toCategory] || [], item.comment, item.index, insertIndex);
    if (!reordered) return;
    setExtractedData(prev => ({ ...prev, [toCategory]: reordered }));
    markExtractedDataModified();
  };

  const handleRemoveCommentByCategory = async (category: 'mustHaveComments' | 'niceToHaveComments', index: number) => {
    const updatedComments = (extractedData[category] || []).filter((_, i) => i !== index);
    const nextTrail = trailAfterRemoval(
      extractedData.mergeTrail || [],
      category === 'mustHaveComments' ? 'must_have_comments' : 'nice_to_have_comments',
      (extractedData[category] || [])[index],
    );
    setExtractedData(prev => ({
      ...prev,
      [category]: updatedComments,
      mergeTrail: nextTrail,
    }));
    markExtractedDataModified();  // Mark as modified to prevent reload from DB

    // Save to DB immediately
    if (editingId) {
      try {
        const updateData = category === 'mustHaveComments'
          ? { must_have_comments: updatedComments, skill_merge_trail: nextTrail }
          : { nice_to_have_comments: updatedComments, skill_merge_trail: nextTrail };
        await jdService.update(editingId, updateData);
        console.log(`[Delete] ${category} deleted and saved to DB`);
      } catch (error) {
        console.error(`[Delete] Failed to save ${category} deletion:`, error);
      }
    }
  };

  const handleStartEditCommentByCategory = (category: 'mustHaveComments' | 'niceToHaveComments', index: number, value: string) => {
    if (category === 'mustHaveComments') {
      setEditingCommentIndex(index);
      setEditingCommentValue(value);
    } else {
      setEditingNiceCommentIndex(index);
      setEditingNiceCommentValue(value);
    }
  };

  const handleAddLocation = () => {
    if (newLocation.city.trim()) {
      const cityToAdd = newLocation.city.trim();
      const radiusToAdd = newLocation.radius || '50';

      if (!validateEnglishOnlyExtractedValue(cityToAdd, 'Locations')) {
        return;
      }

      const isDuplicate = extractedData.locations.some(loc =>
        loc.city.trim().toLowerCase() === cityToAdd.toLowerCase() &&
        (loc.country || 'IN') === locationCountry
      );

      if (isDuplicate) {
        setValidationErrors(prev => ({
          ...prev,
          locations: 'This location has already been added',
        }));
        return;
      }

      setValidationErrors(prev => ({ ...prev, locations: undefined }));
      setExtractedData(prev => ({
        ...prev,
        locations: [...prev.locations, {
          city: cityToAdd,
          radius: radiusToAdd,
          country: locationCountry,
        }],
      }));
      setNewLocation({ city: '', radius: '50' });
      setShowLocationMenu(false);
      markExtractedDataModified();
    }
  };

  const handleRemoveLocation = async (index: number) => {
    const updatedLocations = extractedData.locations.filter((_, i) => i !== index);
    setExtractedData(prev => ({
      ...prev,
      locations: updatedLocations,
    }));
    markExtractedDataModified();

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          locations: updatedLocations.map(loc => ({
            city: loc.city,
            radius_km: loc.radiusKm,
            is_required: loc.isRequired,
            country: loc.country || locationCountry,
          })),
        });
        console.log('[Delete] Location deleted and saved to DB');
      } catch (error) {
        console.error('[Delete] Failed to save location deletion:', error);
      }
    }
  };

  const validateExtractionPageEnglishOnlyFields = (): boolean => {
    const customExperienceValue = showCustomExperienceInput ? extractedData.experience.trim() : '';
    if (customExperienceValue && !isEnglishOnly(customExperienceValue)) {
      setValidationErrors(prev => ({
        ...prev,
        experience: 'Custom experience must be written in English only.',
      }));
      toast.error({
        title: 'English only',
        description: 'Custom experience must be written in English only. Other languages are not supported.',
      });
      return false;
    }

    const englishOnlyChecks: Array<{ valid: boolean; fieldLabel: string }> = [
      { valid: validateEnglishOnlyExtractedList(extractedData.mustHaveSkills, 'Must-have skills'), fieldLabel: 'Must-have skills' },
      { valid: validateEnglishOnlyExtractedList(extractedData.niceToHaveSkills, 'Nice-to-have skills'), fieldLabel: 'Nice-to-have skills' },
      { valid: validateEnglishOnlyExtractedList(extractedData.mustHaveComments, 'Must-have additional requirements'), fieldLabel: 'Must-have additional requirements' },
      { valid: validateEnglishOnlyExtractedList(extractedData.niceToHaveComments, 'Nice-to-have additional requirements'), fieldLabel: 'Nice-to-have additional requirements' },
      { valid: validateEnglishOnlyExtractedList(extractedData.internalRecruiterComments, 'Internal recruiter notes'), fieldLabel: 'Internal recruiter notes' },
      { valid: validateEnglishOnlyExtractedList(extractedData.certifications, 'Certifications'), fieldLabel: 'Certifications' },
      { valid: validateEnglishOnlyExtractedList(extractedData.domainKeywords, 'Domain keywords'), fieldLabel: 'Domain keywords' },
      { valid: validateEnglishOnlyExtractedList(extractedData.locations.map(location => location.city), 'Locations'), fieldLabel: 'Locations' },
    ];

    if (extractedData.assessmentGuidance.trim() && !validateEnglishOnlyExtractedValue(extractedData.assessmentGuidance.trim(), 'Assessment guidance')) {
      return false;
    }

    if (extractedData.additionalDetails.trim() && !validateEnglishOnlyExtractedValue(extractedData.additionalDetails.trim(), 'Additional details')) {
      return false;
    }

    return englishOnlyChecks.every(check => check.valid);
  };

  // The real Step 2 -> Review advance. Reached only through the guarded
  // `handlePublish` below, which is what the button is bound to.
  const advanceToReviewStep = async () => {
    const trimmedJobTitle = jobTitle.trim();

    if (!trimmedJobTitle) {
      toast.error({
        title: 'Job Title Required',
        description: 'Please enter a valid job title before continuing.',
      });
      return;
    }

    if (!(await ensureValidJobTitle(trimmedJobTitle))) {
      return;
    }

    if (!validateExtractionPageEnglishOnlyFields()) {
      return;
    }

    // Debug logging for validation
    console.log('[TalentFlow] handlePublish validation check:', {
      education: extractedData.education,
      educationTrimmed: extractedData.education?.trim() || '',
      experience: extractedData.experience,
      experienceTrimmed: extractedData.experience?.trim() || '',
      industryType: extractedData.industryType,
      industryTypeTrimmed: extractedData.industryType?.trim() || '',
    });

    // Validate mandatory fields
    const missingFields: string[] = [];
    const errors: {
      mustHaveSkills?: string;
      mustHaveComments?: string;
      education?: string;
      experience?: string;
      industryType?: string;
      salaryRange?: string;
      locations?: string;
      allowOverqualified?: string;
    } = {};

    // Must have at least one must-have skill
    if (!extractedData.mustHaveSkills || extractedData.mustHaveSkills.length === 0) {
      missingFields.push('At least one Must-Have Skill');
      errors.mustHaveSkills = STEP2_REQUIRED_MESSAGES.mustHaveSkills;
    }

    // Must-Have Comments are optional - no validation required

    // Education is NOT validated here any more: the field was removed from Step 2 and
    // extraction now guarantees it lands in Must-Have or Nice-to-Have Additional
    // Requirements. Blocking publish on a control the recruiter can no longer see would
    // be an unfixable error.

    // Experience is required - check for empty string, null, undefined, or whitespace only
    if (!extractedData.experience || extractedData.experience.trim() === '') {
      missingFields.push('Experience');
      errors.experience = STEP2_REQUIRED_MESSAGES.experience;
    }

    // Industry Type is required - check for empty string, null, undefined, or whitespace only
    if (!extractedData.industryType || extractedData.industryType.trim() === '') {
      missingFields.push('Industry Type');
      errors.industryType = STEP2_REQUIRED_MESSAGES.industryType;
    }

    // Salary range - the same rule getValidationStatus applies.
    const salaryRangeError = validateSalaryRange(extractedData.salaryFrom || '', extractedData.salaryTo || '');
    if (salaryRangeError) {
      missingFields.push('Salary Range - ' + salaryRangeError);
      errors.salaryRange = salaryRangeError;
    }

    // Location validation - if location is marked as required but no locations added, show error
    if (extractedData.locationsRequired && (!extractedData.locations || extractedData.locations.length === 0)) {
      missingFields.push('At least one Location');
      errors.locations = 'Location is marked as required but no locations added';
    }

    // Allow Overqualified Candidates is a required Yes/No choice - the recruiter must
    // pick one before proceeding. null means not yet answered.
    // A floor-only requirement forces Yes (see experienceHasCeiling), so the choice
    // is only required when there is a ceiling for No to mean something.
    if (experienceHasCeiling
        && (extractedData.allowOverqualified === null || extractedData.allowOverqualified === undefined)) {
      missingFields.push('Allow Overqualified Candidates (Yes/No)');
      errors.allowOverqualified = 'Please select Yes or No for Allow Overqualified Candidates';
    }

    // Set validation errors for inline display
    setValidationErrors(errors);

    if (missingFields.length > 0) {
      toast.error({
        title: 'Missing Required Fields',
        description: `Please complete: ${missingFields.join(', ')}`,
      });
      // Bring the FIRST missing field (in page order) into view, once its error
      // has rendered.
      const firstMissing = STEP2_REQUIRED_FIELD_ORDER.find(key => errors[key]);
      if (firstMissing) {
        setTimeout(() => {
          document.querySelector(`[data-step2-field="${firstMissing}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 0);
      }
      return;
    }

    // ── An industry the master list does not carry ────────────────────────────
    // Checked against the JD HERE, before the reformat, and only when the recruiter
    // accepted or typed one: a JD on a listed industry never makes this call, so the
    // no-edit / no-LLM invariant below is untouched. `created` carries on with the
    // real code; anything else is a question for the recruiter (the dialog at the
    // end of this file), and this function stops until they answer - the dialog's
    // buttons call advanceToReviewStep() again with the sentinel already replaced.
    if (extractedData.industryType === PENDING_INDUSTRY_VALUE) {
      const proposedIndustry = extractedData.industrySuggestedName?.trim() || '';
      if (!editingId || !proposedIndustry) {
        toast.error({
          title: 'Industry needs a name',
          description: 'Type the industry this job belongs to, or pick one from the list.',
        });
        return;
      }
      setIsRegenerating(true);
      try {
        // A name the recruiter typed gets the full check; one they merely accepted from
        // our own suggestion does not - a second model opinion on our first had the
        // system arguing with itself in front of them.
        const gate = await jdService.validateIndustry(editingId, proposedIndustry, {
          source: extractedData.industryIsCustom ? 'manual' : 'suggested',
        });
        if (gate.outcome === 'created' && gate.industry_type) {
          applyResolvedIndustryCode(gate.industry_type, gate.industry_label || proposedIndustry, true);
          // Filed under an industry that already existed: say so rather than swap it
          // silently - the recruiter accepted one name and will see another.
          if (gate.message) {
            toast.success({ title: 'Industry set', description: gate.message });
          }
          // Do NOT carry on in this closure: its extractedData still holds the
          // sentinel, and the reformat / save payloads below would file the JD under
          // 'others'. Let the state land, then re-enter through a fresh closure - the
          // gate is skipped on that pass because industryType is now a real code.
          setTimeout(() => { void advanceToReviewStepRef.current?.(); }, 0);
          return;
        } else {
          setIndustryGate(gate);
          return;
        }
      } catch (error) {
        toast.error({
          title: 'Could not check the industry',
          description: friendlyErrorMessage(error, "Please try again."),
        });
        return;
      } finally {
        setIsRegenerating(false);
      }
    }

    // BEFORE going to review, reformat the JD description using AI
    // Only reformat if user actually modified extracted data (skills/comments/fields) in Step 2
    // If no edits were made, skip AI formatting and go directly to review

    // Detect changes via data comparison (bulletproof fallback - works even if a handler misses the flag)
    const dataChanged = step2DataSnapshot.current !== '' && step2Fingerprint(extractedData, jobTitle) !== step2DataSnapshot.current;

    // For manual JD mode: detect if the description lacks markdown formatting
    // (no headers, no line breaks, no bullets, no bold) → force reformat so the
    // published JD isn't a single run-on paragraph.
    const currentDescription = mode === 'ai' ? generatedJD : manualJD;
    const lacksMarkdownFormatting = mode === 'manual' && currentDescription && !(
      /^#{1,6}\s/m.test(currentDescription) ||        // markdown headers
      /\n\n/.test(currentDescription) ||              // paragraph breaks
      /\*\*[^*]+\*\*/.test(currentDescription) ||     // bold text
      /^[-*+]\s/m.test(currentDescription)            // bullet points
    );

    const shouldReformat = (extractedDataModified && !hasFormattedForReview) || dataChanged || lacksMarkdownFormatting || extractionInvalidatedFormat.current;

    console.log('[DEBUG] handlePublish - extractedDataModified:', extractedDataModified, 'hasFormattedForReview:', hasFormattedForReview, 'dataChanged:', dataChanged, 'lacksMarkdownFormatting:', lacksMarkdownFormatting, 'extractionInvalidatedFormat:', extractionInvalidatedFormat.current, 'shouldReformat:', shouldReformat);

    // --- De-duplication is folded into the reformat pass ---
    // IMPORTANT: the AI reformat (which also de-duplicates) must fire ONLY when the
    // user actually changed Step 2 data, i.e. `shouldReformat`. On a no-op edit
    // pass-through (e.g. editing a published JD and clicking Next without changes)
    // we make NO AI call and leave the lists untouched. `clientDeduped` is only used
    // as cleaned input WHEN we reformat; otherwise `finalLists` stays as the loaded
    // lists so nothing is silently mutated or re-saved.
    const baseLists: Record<DuplicateListKey, string[]> = {
      mustHaveSkills: extractedData.mustHaveSkills || [],
      niceToHaveSkills: extractedData.niceToHaveSkills || [],
      mustHaveComments: extractedData.mustHaveComments || [],
      niceToHaveComments: extractedData.niceToHaveComments || [],
    };
    const clientDeduped = dedupeListsDeterministic(baseLists);
    let finalLists: Record<DuplicateListKey, string[]> = baseLists;  // unchanged unless we reformat
    const effectiveReformat = shouldReformat;

    // Track the final description to use (avoiding React state async issues)
    let finalDescription = currentDescription;

    // Reformat with AI ONLY when the user edited something in Step 2 (shouldReformat).
    // The reformat pass also de-duplicates the requirement lists. No edits → no AI call.
    if (effectiveReformat) {
      console.log('[DEBUG] Reformatting/de-duplicating with AI... (shouldReformat:', shouldReformat, ') - triggered only by Step 2 changes');
      setIsRegenerating(true);

      try {
        if (editingId) {
          const persistedExperiencePayload = resolvePersistedExperiencePayload(extractedData.experience);
          const experienceMin = persistedExperiencePayload.experienceMin;
          const experienceMax = persistedExperiencePayload.experienceMax;

          // Convert education to proper format if it's a string
          let educationRequirements = null;
          if (extractedData.education) {
            if (typeof extractedData.education === 'string') {
              educationRequirements = { degree: extractedData.education };
            } else {
              educationRequirements = extractedData.education;
            }
          }

          // Call reformat endpoint with the (client-deduped) lists. The endpoint
          // additionally merges semantically-equivalent items and returns the
          // final, fully de-duplicated lists.
          const reformatParams = {
            must_have_skills: clientDeduped.mustHaveSkills,
            nice_to_have_skills: clientDeduped.niceToHaveSkills,
            must_have_comments: clientDeduped.mustHaveComments,
            nice_to_have_comments: clientDeduped.niceToHaveComments,
            // The groups AS THEY ARE ON SCREEN, so a wording the recruiter promoted out
            // is not re-applied from the older copy stored on the JD. This endpoint
            // dedupes again and folds its own findings into what it receives here.
            skill_merge_trail: extractedData.mergeTrail || [],
            experience_min: experienceMin,
            experience_max: experienceMax,
            // The Required tick AS IT IS ON SCREEN. This rewrite runs BEFORE the Step 2
            // save, so the stored column is a version behind, and the server needs the
            // live answer to know whether the JD may still invite freshers: with
            // experience Essential, that sentence promises what the scorer will refuse.
            // Without this the rewrite reinstated the line the confirm dialog had just
            // removed (reported 2026-09-21, JD-245).
            experience_mandatory: extractedData.experienceRequired,
            job_level: persistedExperiencePayload.jobLevel,
            education_requirements: educationRequirements,
            certifications: extractedData.certifications,
            coding_required: extractedData.codingRequired,
            supported_languages: extractedData.suggestedLanguages,
            salary_min: parseSalaryInput(extractedData.salaryFrom) ?? null,
            salary_max: parseSalaryInput(extractedData.salaryTo) ?? null,
            salary_currency: extractedData.salaryCurrency,
            compensation_type: extractedData.compensationType,
            // JD22. The rewrite deletes anything not handed to it, so without this the
            // regenerated BODY loses every shift / WFO / travel line the recruiter wrote.
            // Sent from Step 2 state rather than left to the stored value, because this
            // call runs BEFORE the save below - the DB copy is a version behind.
            additional_details: extractedData.additionalDetails?.trim()
              ? extractedData.additionalDetails
              : null,
          };

          const reformattedJD = await jdService.reformatWithParams(editingId, reformatParams);

          // Adopt the server's de-duplicated lists (falls back to the cleaned
          // client-deduped input if the response omits any list).
          finalLists = {
            mustHaveSkills: reformattedJD.must_have_skills ?? clientDeduped.mustHaveSkills,
            niceToHaveSkills: reformattedJD.nice_to_have_skills ?? clientDeduped.niceToHaveSkills,
            mustHaveComments: reformattedJD.must_have_comments ?? clientDeduped.mustHaveComments,
            niceToHaveComments: reformattedJD.nice_to_have_comments ?? clientDeduped.niceToHaveComments,
          };

          // Store the reformatted description for saving (React state is async)
          finalDescription = reformattedJD.description;

          // Update the description based on mode
          if (mode === 'ai') {
            setGeneratedJD(reformattedJD.description);
          } else {
            setManualJD(reformattedJD.description);
          }

          const mergedCount = totalListItems(baseLists) - totalListItems(finalLists);
          if (mergedCount > 0) {
            toast.success({
              title: 'Duplicates combined',
              description: `${mergedCount} duplicate ${mergedCount === 1 ? 'entry was' : 'entries were'} merged. Job description has been regenerated.`,
            });
          } else {
            toast.success({
              title: 'JD Reformatted',
              description: 'Job description has been regenerated with your changes.',
            });
          }
        } else if (mode === 'manual') {
          finalDescription = normalizeManualJDToMarkdown(currentDescription);
          setManualJD(finalDescription);
          toast.success({
            title: 'JD Formatted',
            description: 'Preview updated with structured markdown formatting.',
          });
        } else {
          console.error('[DEBUG] Cannot reformat - editingId is null.');
          toast.warning({
            title: 'Cannot Reformat',
            description: 'JD not saved yet. Your changes will be included when saving.',
          });
        }
      } catch (error) {
        console.error('[ERROR] Failed to reformat JD:', error);
        toast.warning({
          title: 'Formatting Warning',
          description: 'Could not reformat JD. Proceeding with current version.',
        });
      } finally {
        setIsRegenerating(false);
      }
    } else {
      console.log('[DEBUG] No modifications in Step 2, skipping AI formatting');
    }

    if (mode === 'manual') {
      const normalizedManualDescription = normalizeManualJDToMarkdown(finalDescription);
      if (normalizedManualDescription && normalizedManualDescription !== finalDescription) {
        finalDescription = normalizedManualDescription;
        setManualJD(normalizedManualDescription);
      }
    }

    // Reflect the de-duplicated lists into the extracted data used by the review
    // UI and the DB save below (setExtractedData is async, so we also keep a local
    // `reviewData` copy to avoid reading stale state).
    const reviewData = {
      ...extractedData,
      mustHaveSkills: finalLists.mustHaveSkills,
      niceToHaveSkills: finalLists.niceToHaveSkills,
      mustHaveComments: finalLists.mustHaveComments,
      niceToHaveComments: finalLists.niceToHaveComments,
    };
    if (effectiveReformat) {
      setExtractedData(reviewData);
    }

    // Go to review step to show the reformatted summary
    setStep('review');
    setHasProceededToReview(true);  // Mark that user has proceeded to review (makes Stage 2 fields read-only)
    setHasFormattedForReview(true);  // Mark as formatted so we can skip on next "Next" click
    step2DataSnapshot.current = step2Fingerprint(reviewData, jobTitle);  // Update snapshot so returning without new edits skips
    extractionInvalidatedFormat.current = false;  // Step 3 now matches the current Step 2 data
    // NOTE: Don't reset extractedDataModified here - it should persist to prevent reloading
    // user's deleted items from DB when navigating back to Stage 1/2
    setValidationErrors({});  // Clear validation errors since all validations passed

    // Save JD with creation_stage: 'review' so refresh preserves the stage
    try {
      const experiencePayload = resolvePersistedExperiencePayload(extractedData.experience);
      const experienceMin = experiencePayload.experienceMin;
      const experienceMax = experiencePayload.experienceMax;

      const jdData = {
        title: trimmedJobTitle,
        description: finalDescription,  // Use finalDescription to avoid React state async issues
        creation_stage: 'review' as const,
        creation_method: (mode === 'ai' ? 'ai_generated' : 'manual') as 'ai_generated' | 'manual',
        ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
        must_have_skills: finalLists.mustHaveSkills,
        nice_to_have_skills: finalLists.niceToHaveSkills,
        must_have_comments: finalLists.mustHaveComments,
        nice_to_have_comments: finalLists.niceToHaveComments,
        // Persisted with the lists they describe: without this the groups lived only in
        // the extraction response, so reopening the JD showed a skill list with no sign
        // that anything had been folded into it and nothing left to promote back out.
        skill_merge_trail: extractedData.mergeTrail || [],
        education_requirements: extractedData.education ? { degree: extractedData.education } : undefined,
        experience_min: experienceMin,
        experience_max: experienceMax,
        ...buildIndustryPayload(extractedData),
        role_family: extractedData.roleFamily || undefined,
        role_family_confidence: extractedData.roleFamilyConfidence ?? undefined,
        salary_min: parseSalaryInput(extractedData.salaryFrom) ?? null,
        salary_max: parseSalaryInput(extractedData.salaryTo) ?? null,
        compensation_type: extractedData.compensationType,
        salary_currency: extractedData.salaryCurrency,
        employment_type: extractedData.employmentType,
        remote_type: extractedData.workModel,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        // JD22. NULL, not undefined, when the box is empty: the backend updates with
        // exclude_unset, so an omitted key leaves the stored text in place and CLEARING
        // the box could never take effect - the recruiter deleted the shift/WFO lines,
        // saved, and every JD view kept showing the old ones.
        additional_details: extractedData.additionalDetails?.trim() ? extractedData.additionalDetails : null,
        allow_overqualified: extractedData.allowOverqualified,
        certifications: extractedData.certifications,
        domain_keywords: extractedData.domainKeywords,
        // Coding assessment fields
        coding_required: extractedData.codingRequired,
        supported_languages: extractedData.suggestedLanguages,
        job_level: experiencePayload.jobLevel,
        locations: (extractedData.locations || []).map(loc => ({
          city: loc.city,
          radius_km: parseInt(loc.radius) || 50,
          is_required: extractedData.locationsRequired,
          country: loc.country || locationCountry,
        })),
        // Mandatory flags - determines if criteria is Required vs Preferred in scoring
        experience_mandatory: extractedData.experienceRequired || false,
        education_mandatory: extractedData.educationRequired || false,
        industry_mandatory: extractedData.industryTypeRequired || false,
        location_mandatory: extractedData.locationsRequired || false,
        // RS20: Job Hopping toggle.
        job_hopping_enabled: extractedData.jobHoppingEnabled ?? true,
      };

      console.log('[TalentFlow] Saving JD at review stage with coding fields:', {
        coding_required: jdData.coding_required,
        supported_languages: jdData.supported_languages
      });

      console.log('[DEBUG] PUBLISH - Mandatory flags being sent:', {
        experience_mandatory: jdData.experience_mandatory,
        education_mandatory: jdData.education_mandatory,
        industry_mandatory: jdData.industry_mandatory,
        location_mandatory: jdData.location_mandatory,
        'extractedData.experienceRequired': extractedData.experienceRequired,
        'extractedData.educationRequired': extractedData.educationRequired,
        'extractedData.industryTypeRequired': extractedData.industryTypeRequired,
        'extractedData.locationsRequired': extractedData.locationsRequired,
      });

      let savedJd;
      let jdId = editingId;
      if (editingId) {
        savedJd = await jdService.update(editingId, jdData);
        console.log('[TalentFlow] JD updated with review stage, id:', editingId);
      } else {
        savedJd = await jdService.create({ ...jdData, as_working_copy: true });
        jdId = savedJd.id;
        createdInSessionIdRef.current = savedJd.id;
        setUnsavedNewCopyId(savedJd.id);
        setEditingId(savedJd.id);
        console.log('[TalentFlow] JD created with review stage:', savedJd.id);
      }

      savedContentKeyRef.current = currentContentKeyRef.current;
      markStepSaveCheckpoint(savedJd, 'the version saved when you finished Step 2 (Extract)');

      // The backend's write-time guard (`JDService._validate_skill_lists_for_write`)
      // can drop a semantic duplicate `reviewData`/`finalLists` above did not catch
      // (e.g. a synonym with no shared token) - `savedJd` is the authoritative,
      // post-dedup list. Without this, Review kept showing the pre-save `reviewData`
      // snapshot set above, so a duplicate the backend DID strip at save time stayed
      // visible on screen until the next full reload.
      setExtractedData(prev => ({
        ...prev,
        mustHaveSkills: savedJd.must_have_skills ?? prev.mustHaveSkills,
        niceToHaveSkills: savedJd.nice_to_have_skills ?? prev.niceToHaveSkills,
        mustHaveComments: savedJd.must_have_comments ?? prev.mustHaveComments,
        niceToHaveComments: savedJd.nice_to_have_comments ?? prev.niceToHaveComments,
      }));

      if (jdId) {
        ensureJDCreationUrl(jdId, 'review');
      }
    } catch (saveError) {
      console.error('[TalentFlow] Failed to save review stage:', saveError);
      toast.error({
        title: 'Save Failed',
        description: 'Could not save progress. Your work may be lost on refresh.',
      });
    }
  };

  // What the Step 2 button is bound to: one click, one advance.
  //
  // Same reasoning as `handleNext` - the advance above awaits
  // `ensureValidJobTitle` before it sets any in-flight state, so a second
  // click could enter it again and move the step to Review twice (running the
  // reformat and the save a second time with it). Guarded synchronously, and
  // released in `finally` so a failure never leaves the button dead.
  const handlePublish = async () => {
    if (isAdvancingRef.current) {
      console.log('[TalentFlow] Publish ignored - an advance is already in flight');
      return;
    }
    isAdvancingRef.current = true;
    try {
      await advanceToReviewStep();
    } finally {
      isAdvancingRef.current = false;
    }
  };

  // Groups selected locations by state so the review step shows e.g.
  // "Haryana: Ambala, Kurukshetra, Fatehabad" instead of flattening every
  // "City, State" pair into one long comma-separated string.
  const groupLocationsByState = (
    locations: Array<{ city: string }>
  ): Array<{ state: string; cities: string[] }> => {
    const order: string[] = [];
    const byState = new Map<string, string[]>();
    locations.forEach(loc => {
      if (!loc.city) return;
      const parts = loc.city.split(',').map(p => p.trim());
      const city = parts[0];
      const state = parts.length > 1 ? parts.slice(1).join(', ') : 'Other';
      if (!byState.has(state)) {
        byState.set(state, []);
        order.push(state);
      }
      byState.get(state)!.push(city);
    });
    return order.map(state => ({ state, cities: byState.get(state)! }));
  };

  // Helper function to get experience label from master data
  const getExperienceLabel = (code: string): string => {
    if (!code) return 'Not specified';
    const normalized = code.trim();
    const level = getExperienceLevelByCode(normalized);
    return level?.label || normalized;
  };

  // Helper function to get industry label from master data
  const getIndustryLabel = (code: string): string => {
    if (!code) return 'Not specified';
    // A pending industry has no master row to look up, and the sentinel is not a code
    // to be prettified either — "Pending New Industry" is what the fallback below
    // would print. Show the name the recruiter is actually proposing.
    if (code === PENDING_INDUSTRY_VALUE) {
      const proposed = extractedData.industrySuggestedName?.trim();
      return proposed ? `${proposed} (new)` : 'Not specified';
    }
    const industry = industryTypes.find(i => i.code === code);
    return industry?.label || code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ');
  };

  // JD12: Compute validation status for review screen
  const getValidationStatus = () => {
    const missingFields: string[] = [];
    const trimmedJobTitle = jobTitle.trim();

    if (!trimmedJobTitle) {
      missingFields.push('Job Title');
    } else if (getResolvedJobTitleValidationError(trimmedJobTitle)) {
      missingFields.push(getResolvedJobTitleValidationError(trimmedJobTitle));
    }

    if (!extractedData.mustHaveSkills || extractedData.mustHaveSkills.length === 0) {
      missingFields.push('At least one Must-Have Skill');
    }

    // Must-Have Comments are optional - no validation required

    // Education is NOT required here any more - the Step 2 control was removed
    // 2026-08-20 and extraction guarantees the requirement lands in Must-Have or
    // Nice-to-Have Additional Requirements. This was the THIRD place blocking on it.

    // Experience is required - check for empty string, null, undefined, or whitespace only
    const experienceValue = extractedData.experience?.trim() || '';
    if (!experienceValue) {
      missingFields.push('Experience');
    }

    // Industry Type is required - check for empty string, null, undefined, or whitespace only
    const industryValue = extractedData.industryType?.trim() || '';
    if (!industryValue) {
      missingFields.push('Industry Type');
    }

    // Allow Overqualified Candidates is a required Yes/No choice, not a default-off
    // toggle - the recruiter must pick one before Step 2 can be left. null is "not
    // yet answered"; true/false are both valid, complete answers.
    if (experienceHasCeiling
        && (extractedData.allowOverqualified === null || extractedData.allowOverqualified === undefined)) {
      missingFields.push('Allow Overqualified Candidates (Yes/No)');
    }

    // Validate salary range
    const salaryError = validateSalaryRange(extractedData.salaryFrom || '', extractedData.salaryTo || '');
    if (salaryError) {
      missingFields.push('Salary Range - ' + salaryError);
    }

    // Debug logging
    console.log('[TalentFlow] Validation check:', {
      experience: experienceValue,
      industryType: industryValue,
      isValid: missingFields.length === 0,
      missingFields
    });

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  };

  const validationStatus = getValidationStatus();

  // The version Step 3 shows: the edited row's LINEAGE version. A new version is
  // its own JD row, so its publish count (`current_version`) reads 1 - or nothing
  // before its first publish - while this reads 2.
  const reviewJdId = effectiveEditingJD?.id || editingId || null;
  const reviewVersionNumber: number | null =
    effectiveEditingJD?.version_number
    ?? (reviewLineageVersion && reviewLineageVersion.id === reviewJdId ? reviewLineageVersion.version : null);

  useEffect(() => {
    if (step !== 'review' || !reviewJdId || effectiveEditingJD?.version_number != null) return;
    if (reviewLineageVersion?.id === reviewJdId) return;
    let cancelled = false;
    jdService.getLineageVersions(reviewJdId)
      .then(lineage => {
        const own = lineage.find(v => v.id === reviewJdId);
        if (!cancelled && own?.version_number != null) {
          setReviewLineageVersion({ id: reviewJdId, version: own.version_number });
        }
      })
      .catch(err => console.error('[TalentFlow] Could not resolve the JD version for Review:', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reviewJdId, effectiveEditingJD?.version_number]);

  /* Step 3's Download, in the format picked in the format dialog. The CONTENT is
     the one the Download button always wrote - built below exactly as it was -
     and only the container differs: a .txt, a .docx (one paragraph per line,
     the way the JD version history writes its Word download) or a .pdf (the
     same lines, wrapped to the page). `docx` and `jspdf` load on demand so
     neither sits in the bundle until someone downloads. */
  const downloadReviewJD = async (format: 'txt' | 'docx' | 'pdf') => {
    const text = mode === 'ai' ? generatedJD : manualJD;
    // The standalone "Education:" line was dropped 2026-08-21 and the Additional
    // Requirements lists added in its place. Education is a line inside those lists
    // now, so this export carries it exactly once - and it carries MHAR/NHAR at all,
    // which it previously omitted entirely.
    const fullContent = [
      jobTitle,
      '',
      text,
      '',
      '--- Skills ---',
      `Must Have: ${extractedData.mustHaveSkills.join(', ')}`,
      `Nice to Have: ${extractedData.niceToHaveSkills.join(', ')}`,
      '',
      '--- Additional Requirements ---',
      `Must Have: ${(extractedData.mustHaveComments || []).join('; ') || 'None'}`,
      `Nice to Have: ${(extractedData.niceToHaveComments || []).join('; ') || 'None'}`,
      '',
      `Experience: ${extractedData.experience}`,
    ].join('\n');
    const baseName = `${jobTitle.replace(/[^a-z0-9]/gi, '_')}_JD`;

    const saveBlob = (blob: Blob, fileName: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    };

    try {
      if (format === 'txt') {
        saveBlob(new Blob([fullContent], { type: 'text/plain' }), `${baseName}.txt`);
        toast.success({ title: 'Downloaded!', description: 'Job description saved as text file' });
        return;
      }

      if (format === 'docx') {
        const { Document, Packer, Paragraph, TextRun } = await import('docx');
        // Blank lines included - an empty paragraph is the spacer Word expects.
        const children = fullContent.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line })] }));
        const blob = await Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }));
        saveBlob(blob, `${baseName}.docx`);
        toast.success({ title: 'Downloaded!', description: 'Job description saved as DOCX file' });
        return;
      }

      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const margin = 15;
      const lineHeight = 5.5;
      const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
      const pageBottom = doc.internal.pageSize.getHeight() - margin;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      let y = margin;
      for (const line of fullContent.split('\n')) {
        const wrapped: string[] = line ? doc.splitTextToSize(line, maxWidth) : [''];
        for (const part of wrapped) {
          if (y + lineHeight > pageBottom) {
            doc.addPage();
            y = margin;
          }
          doc.text(part, margin, y);
          y += lineHeight;
        }
      }
      doc.save(`${baseName}.pdf`);
      toast.success({ title: 'Downloaded!', description: 'Job description saved as PDF file' });
    } catch (error) {
      console.error('[TalentFlow] JD download failed:', error);
      toast.error({ title: 'Download failed', description: 'Could not create the file. Please try again.' });
    }
  };

  // Handle regenerating JD based on modified extracted data
  const handleRegenerateFromExtractedData = async () => {
    const trimmedJobTitle = jobTitle.trim();
    if (!trimmedJobTitle) {
      toast.error({
        title: 'Job Title Required',
        description: 'Please enter a valid job title before regenerating the JD.',
      });
      return;
    }

    if (!(await ensureValidJobTitle(trimmedJobTitle))) {
      return;
    }

    if (!validateExtractionPageEnglishOnlyFields()) {
      return;
    }

    setIsRegenerating(true);

    try {
      // Build a prompt from the extracted data to regenerate the JD
      const skillsText = [
        ...extractedData.mustHaveSkills.map(s => `Must have: ${s}`),
        ...extractedData.niceToHaveSkills.map(s => `Nice to have: ${s}`),
      ].join(', ');

      const requirementsText = [
        extractedData.experience ? `Experience: ${extractedData.experience}` : '',
        extractedData.education ? `Education: ${extractedData.education}` : '',
        extractedData.industryType ? `Industry: ${extractedData.industryType}` : '',
      ].filter(Boolean).join('. ');

      const locationsText = extractedData.locations.length > 0
        ? `Location: ${extractedData.locations.map(l => l.city).join(', ')}`
        : '';

      const regenerateDetailsPrompt = [
        skillsText ? `Skills: ${skillsText}` : '',
        requirementsText,
        locationsText,
      ].filter(Boolean).join('. ') || 'Regenerate the JD using the extracted details.';

      const response = await jdService.generate({
        jobTitle: trimmedJobTitle,
        aiPrompt: regenerateDetailsPrompt,
      });

      if (response?.description) {
        setGeneratedJD(response.description);
        setExtractedDataModified(false);

        toast.success({
          title: 'JD Regenerated',
          description: 'Job description has been updated based on your changes.'
        });
      }
    } catch (error) {
      console.error('[TalentFlow] Regeneration failed:', error);
      toast.error({
        title: 'Regeneration Failed',
        description: 'Could not regenerate JD. Please try again.'
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleConfirmPublish = async () => {
    const trimmedJobTitle = jobTitle.trim();
    console.log('[DEBUG] handleConfirmPublish called');

    if (!trimmedJobTitle) {
      toast.error({
        title: 'Job Title Required',
        description: 'Please enter a valid job title before publishing.',
      });
      return;
    }

    if (!(await ensureValidJobTitle(trimmedJobTitle))) {
      return;
    }

    if (!validateExtractionPageEnglishOnlyFields()) {
      return;
    }

    setIsPublishing(true);

    try {
      const experiencePayload = resolvePersistedExperiencePayload(extractedData.experience);
      const experienceMin = experiencePayload.experienceMin;
      const experienceMax = experiencePayload.experienceMax;

      // For manual JD mode: detect if the description lacks markdown formatting
      // (e.g., user resumed an existing draft and went straight to step 3 publish).
      // Reformat with AI so the published JD isn't a single run-on paragraph.
      // MODE-AWARE. This used to be `generatedJD || manualJD`, which silently
      // published stale text for every MANUAL JD that was edited after publishing.
      //
      // The load effect hydrates `generatedJD` from the stored description for EVERY JD
      // regardless of creation_method, so on a manual JD it holds the PREVIOUS version's
      // body. Meanwhile the Step 2 -> Step 3 reformat is mode-aware and writes the
      // regenerated text to `manualJD`. So `generatedJD || manualJD` preferred the stale
      // copy over the fresh one.
      //
      // Reported 2026-08-14: a manual JD published at "4 to 7 years" was edited to
      // "8 to 12 years", a new version was created, Step 3 previewed the regenerated body
      // correctly (the preview reads mode-aware state) - and then Publish wrote the OLD
      // v1 body. The badge showed "Senior (8-12 years)" because the structured fields come
      // from extractedData, so the record and the text a candidate reads disagreed.
      let publishDescription = (mode === 'ai' ? generatedJD : manualJD) || generatedJD || manualJD;
      const lacksMarkdownFormatting = mode === 'manual' && publishDescription && !(
        /^#{1,6}\s/m.test(publishDescription) ||      // markdown headers
        /\n\n/.test(publishDescription) ||            // paragraph breaks
        /\*\*[^*]+\*\*/.test(publishDescription) ||   // bold text
        /^[-*+]\s/m.test(publishDescription)          // bullet points
      );

      // NO CHANGE, NO LLM: when republishing an existing JD that the user did not
      // change (Step 1 unchanged since load AND no Step 2 edits), never call the
      // reformat LLM here — publish the description exactly as it is.
      const contentChangedSinceLoad = extractedDataModified || !isStage1UnchangedFromLoad();

      if (lacksMarkdownFormatting && editingId && contentChangedSinceLoad) {
        console.log('[DEBUG] handleConfirmPublish - manual JD lacks formatting, reformatting before publish');
        try {
          const reformatParams = {
            must_have_skills: extractedData.mustHaveSkills,
            nice_to_have_skills: extractedData.niceToHaveSkills,
            must_have_comments: extractedData.mustHaveComments || [],
            nice_to_have_comments: extractedData.niceToHaveComments || [],
            skill_merge_trail: extractedData.mergeTrail || [],
            experience_min: experienceMin,
            experience_max: experienceMax,
            job_level: experiencePayload.jobLevel,
            education_requirements: extractedData.education
              ? (typeof extractedData.education === 'string' ? { degree: extractedData.education } : extractedData.education)
              : null,
            certifications: extractedData.certifications,
            coding_required: extractedData.codingRequired,
            supported_languages: extractedData.suggestedLanguages,
            salary_min: parseSalaryInput(extractedData.salaryFrom) ?? null,
            salary_max: parseSalaryInput(extractedData.salaryTo) ?? null,
            salary_currency: extractedData.salaryCurrency,
            compensation_type: extractedData.compensationType,
            // JD22. The rewrite deletes anything not handed to it, so without this the
            // regenerated BODY loses every shift / WFO / travel line the recruiter wrote.
            // Sent from Step 2 state rather than left to the stored value, because this
            // call runs BEFORE the save below - the DB copy is a version behind.
            additional_details: extractedData.additionalDetails?.trim()
              ? extractedData.additionalDetails
              : null,
          };
          const reformattedJD = await jdService.reformatWithParams(editingId, reformatParams);
          publishDescription = reformattedJD.description;
          setManualJD(reformattedJD.description);
          console.log('[DEBUG] Manual JD reformatted successfully before publish');
        } catch (reformatErr) {
          console.error('[ERROR] Failed to reformat before publish, proceeding with raw text:', reformatErr);
        }
      } else if (lacksMarkdownFormatting && mode === 'manual') {
        publishDescription = normalizeManualJDToMarkdown(publishDescription);
        setManualJD(publishDescription);
      }

      if (mode === 'manual') {
        publishDescription = normalizeManualJDToMarkdown(publishDescription);
        setManualJD(publishDescription);
      }

      // Build the JD data for backend
      const jdData = {
        title: trimmedJobTitle,
        description: publishDescription,
        department: extractedData.department || '',
        location: extractedData.locations.length > 0
          ? extractedData.locations[0].city
          : '',
        employment_type: extractedData.employmentType,
        remote_type: extractedData.workModel,
        must_have_skills: extractedData.mustHaveSkills,
        nice_to_have_skills: extractedData.niceToHaveSkills,
        education_requirements: extractedData.education ? { degree: extractedData.education } : undefined,
        experience_min: experienceMin,
        experience_max: experienceMax,
        ...buildIndustryPayload(extractedData),
        role_family: extractedData.roleFamily || undefined,
        role_family_confidence: extractedData.roleFamilyConfidence ?? undefined,
        salary_min: parseSalaryInput(extractedData.salaryFrom) ?? null,
        salary_max: parseSalaryInput(extractedData.salaryTo) ?? null,
        compensation_type: extractedData.compensationType,
        salary_currency: extractedData.salaryCurrency,
        job_level: experiencePayload.jobLevel,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        // JD22. NULL, not undefined, when the box is empty: the backend updates with
        // exclude_unset, so an omitted key leaves the stored text in place and CLEARING
        // the box could never take effect - the recruiter deleted the shift/WFO lines,
        // saved, and every JD view kept showing the old ones.
        additional_details: extractedData.additionalDetails?.trim() ? extractedData.additionalDetails : null,
        internal_comments: extractedData.internalRecruiterComments.join('\n') || undefined,
        must_have_comments: extractedData.mustHaveComments,
        nice_to_have_comments: extractedData.niceToHaveComments,
        skill_merge_trail: extractedData.mergeTrail || [],
        allow_overqualified: extractedData.allowOverqualified,
        // JD11: Include certifications and domain_keywords in data sync
        certifications: extractedData.certifications,
        domain_keywords: extractedData.domainKeywords,
        locations: extractedData.locations.map(loc => {
          // Parse "City, State" format
          const parts = loc.city.split(', ');
          return {
            city: parts[0],
            state: parts[1] || null,
            country: loc.country || locationCountry,
            radius_km: parseInt(loc.radius) || 50,
            is_required: extractedData.locationsRequired,
          };
        }),
        creation_method: (mode === 'ai' ? 'ai_generated' : 'manual') as 'ai_generated' | 'manual',
        ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
        // Mandatory flags - determines if criteria is Required vs Preferred in scoring
        experience_mandatory: extractedData.experienceRequired || false,
        education_mandatory: extractedData.educationRequired || false,
        industry_mandatory: extractedData.industryTypeRequired || false,
        location_mandatory: extractedData.locationsRequired || false,
        // RS20: Job Hopping toggle.
        job_hopping_enabled: extractedData.jobHoppingEnabled ?? true,
      };

      console.log('[DEBUG] handleConfirmPublish - editingId:', editingId, 'isEditingDraft:', isEditingDraft);

      let jdToPublish;
      if (editingId) {
        // Editing a draft - update it first, then publish
        console.log('[DEBUG] Updating existing draft with ID:', editingId);
        jdToPublish = await jdService.update(editingId, jdData);
        console.log('[DEBUG] Draft updated successfully:', jdToPublish.id);
      } else {
        // New JD or creating from published - create new
        console.log('[DEBUG] Creating new JD');
        jdToPublish = await jdService.create({ ...jdData, as_working_copy: true });
        console.log('[DEBUG] JD created successfully:', jdToPublish.id);
      }

      console.log('[DEBUG] Calling jdService.publish for ID:', jdToPublish.id);

      // Publish the JD
      const publishedJd = await jdService.publish(jdToPublish.id);
      console.log('[DEBUG] JD published successfully:', publishedJd.id);

      // Usage tracking is now handled by the backend publish endpoint
      // which calls the external usage API (talentflowapi.mo.vc)

      setIsPublishing(false);
      setIsPublished(true);
      if (freshForkIdRef.current) clearFreshDraftVersion(freshForkIdRef.current);
      setPublishedJdId(publishedJd.id);
      setPublishedJobCode(publishedJd.job_id || null);
      setPublishedVersion(publishedJd.current_version || 1);
      // The badge's number comes from the published row itself: its lineage
      // `version_number`. When the publish response does not carry it, the
      // lineage endpoint is asked for THIS row's entry - never the publish count,
      // which reads 1 for a freshly published v2.
      setPublishedVersionNumber(publishedJd.version_number ?? null);
      if (publishedJd.version_number == null) {
        jdService.getLineageVersions(publishedJd.id)
          .then(lineage => {
            const own = lineage.find(v => v.id === publishedJd.id);
            if (own?.version_number != null) setPublishedVersionNumber(own.version_number);
          })
          .catch(err => console.error('[TalentFlow] Could not resolve published version number:', err));
      }

      // Create the job object for UI
      if (onPublish) {
        const newJob = {
          id: publishedJd.id,
          title: trimmedJobTitle,
          department: extractedData.department || '',
          location: extractedData.locations.length > 0
            ? extractedData.locations[0].city
            : '',
          employmentType: 'Full-time',
          postedDate: new Date().toISOString(),
          applicants: 0,
          // Backend / API returns lowercase legacy "active"; the shared Job UI
          // type uses the capitalized "Published" form. Cast preserves the
          // literal at runtime while satisfying the union.
          status: 'active' as unknown as Job['status'],
          description: (mode === 'ai' ? generatedJD : manualJD) || generatedJD || manualJD,
          mustHaveSkills: extractedData.mustHaveSkills,
          niceToHaveSkills: extractedData.niceToHaveSkills,
          education: extractedData.education,
          experience: extractedData.experience,
          salary: extractedData.salaryFrom || extractedData.salaryTo
            ? `${formatSalaryRange({
                min: extractedData.salaryFrom,
                max: extractedData.salaryTo,
                currency: extractedData.salaryCurrency,
              })} (${extractedData.compensationType})`
            : undefined,
        } as unknown as Job;

        console.log('[JDCreation] Calling onPublish with job:', newJob);

        // Call onPublish callback immediately (for assessment redirect)
        onPublish(newJob);

        // Show success toast (but don't block navigation)
        toast.success({
          title: isEditingPublished ? 'Job description republished' : 'Job description published',
          description: isEditingPublished
            ? `${formatJobSubject({ job_id: publishedJd.job_id, title: trimmedJobTitle, versionNumber: publishedJd.version_number })} has been updated and a new version has been saved.`
            : `${formatJobSubject({ job_id: publishedJd.job_id, title: trimmedJobTitle, versionNumber: publishedJd.version_number })} is now live and accepting applications.`,
          action: {
            label: 'View Job',
            onClick: () => {
              toast.info('Opening job details...');
            }
          }
        });
      }

      // FIX-003: Call onSuccess in embedded mode with published JD ID
      if (isEmbedded && onSuccess) {
        onSuccess(publishedJd.id);
      }
    } catch (error) {
      console.error('[ERROR] Failed to publish JD:', error);
      setIsPublishing(false);

      // Check if this is a quota exceeded error
      const quotaError = error && typeof error === 'object' && 'response' in error
        ? error.response?.data?.detail
        : null;

      if (quotaError && (quotaError.error === 'QUOTA_EXHAUSTED' || quotaError.error === 'QUOTA_INSUFFICIENT')) {
        // Use handleQuotaError for quota errors
        handleQuotaError(error, router, 'Failed to publish job description');
      } else {
        // Use regular toast for non-quota errors
        toast.error({
          title: "Couldn't publish job description",
          description: friendlyErrorMessage(error, "Please try again."),
        });
      }
    }
  };

  // Check if there's unsaved data worth saving
  const hasUnsavedData = () => {
    // Need at least 1 non-space character in job title
    return jobTitle.trim().length > 0;
  };

  // Handle back button click - auto save as draft if there's unsaved data
  const handleBackClick = async () => {
    // Prevent multiple clicks from creating multiple JDs
    if (isNavigatingBack || isSavingDraft) {
      console.log('[DEBUG] handleBackClick - already navigating or saving, ignoring click');
      return;
    }

    console.log('[DEBUG] handleBackClick called');
    console.log('[DEBUG] hasUnsavedData:', hasUnsavedData());
    console.log('[DEBUG] mode:', mode, 'jobTitle:', jobTitle, 'aiPrompt:', aiPrompt, 'generatedJD:', generatedJD?.substring(0, 50));
    console.log('[DEBUG] isPublished:', isPublished);

    setIsNavigatingBack(true);

    if (hasUnsavedData() && !isPublished) {
      console.log('[DEBUG] Saving draft before navigating back...');
      // Auto save as draft; navigateAfter=false because we navigate below via onClose/onBack
      await handleSaveDraft(false);
      console.log('[DEBUG] Draft save completed, now navigating back');
    } else {
      console.log('[DEBUG] No unsaved data or already published, skipping save');
    }
    // Always navigate back after saving (or if no unsaved data)
    // FIX-003: In embedded mode, call onClose instead of onBack
    if (isEmbedded && onClose) {
      onClose();
    } else if (onBack) {
      onBack();
    }
  };

  // Actually leaves the page once the dialog is resolved (Save or Discard).
  // A back-triggered dialog has no `pendingNavigation` URL to push — instead
  // it has to unwind the two history entries the popstate guard above put in
  // place (its trap, plus the same-URL entry this page originally loaded on)
  // so the user lands on whatever real page they were trying to reach.
  const resolvePendingNavigation = (targetUrl: string | null) => {
    if (isPendingBackNavigation) {
      window.history.go(-2);
    } else if (targetUrl) {
      router.push(targetUrl);
    }
  };

  /* Save as Draft has nothing to do on an EXISTING JD (opened from the list)
     that has not been changed since it was opened or last saved. A JD created in
     this visit always has something to save. */
  const nothingToSave = isPreExistingDraft
    && checkpointContentKey !== null
    && jdContentKey(jobTitle, aiPrompt, manualJD, generatedJD) === checkpointContentKey
    && !step2EditedSinceCheckpoint;

  // What the leave prompt shows and allows.
  const leaveJobCode = leaveCheckpointMeta?.jobCode ?? effectiveEditingJD?.job_id ?? null;
  const leaveIsPublishedJD = (leaveCheckpointMeta?.status ?? effectiveEditingJD?.status) === 'published';
  /* New-creation flow — a new JD the recruiter has not saved yet (before its
     first autosave there is no record at all; after it, an unsaved working
     copy), or a version made by "New Job Version" in this visit and not yet
     saved. Its leave prompt is Cancel / Discard / Save as Draft only. Keying on
     the record alone made a new JD's prompt change with autosave timing: a
     disabled "Delete this entire JD" before the first autosave, gone after it.
     Editing an existing draft keeps Delete. */
  const isNewCreationLeave = !editingId
    || isUnsavedNewCopy
    || (jdWorkflow === 'new-version' && !userSavedDraftRef.current);
  const leaveDeleteBlockedReason = !editingId
    ? 'Nothing has been saved yet, so there is no JD to delete.'
    : leaveIsPublishedJD
      ? 'A published JD cannot be deleted from here. Use Discard current changes, or manage it from Job Descriptions.'
      : null;

  // Leaves the page once the leave prompt is resolved.
  const finishLeave = () => {
    setShowUnsavedDialog(false);
    setHasUnsavedChanges(false);
    resolvePendingNavigation(pendingNavigation);
    setPendingNavigation(null);
    setIsPendingBackNavigation(false);
  };

  // Leave prompt → "Save as Draft". The same save as the page's own Save as Draft
  // button (current step included, so the draft reopens where the recruiter left
  // off), then leave. Stays on the page if the save fails or is refused (e.g. an
  // empty job title), so nothing is lost by leaving.
  const handleLeaveSave = async () => {
    setLeaveBusy('save');
    try {
      const saved = await handleSaveDraft(false);
      if (saved) finishLeave();
    } finally {
      setLeaveBusy(null);
    }
  };

  // Leave prompt → "Discard current changes". Puts the record back to the
  // checkpoint (as opened / last step save / last Save as Draft) — every field
  // in one write, since Step 1 autosaves and Step 2 writes each edit as it is
  // made, so simply not saving further would undo nothing. With no record yet
  // there is nothing to put back; the recruiter just leaves. Stays on the page
  // if the write fails, rather than leaving with the edits still saved.
  const handleLeaveDiscard = async () => {
    setLeaveBusy('discard');
    // Stops a pending autosave from writing the edits back after the revert.
    discardedRef.current = true;
    try {
      const checkpoint = leaveCheckpointRef.current;
      if (editingId && (editingCopyOf || isUnsavedNewCopy)) {
        // Every edit went to the working copy, so discarding is deleting it: the
        // draft (or, for a new JD, nothing at all) is exactly as it was.
        await jdService.delete(editingId);
      } else if (editingId && freshForkIdRef.current === editingId) {
        // A draft version made for this visit: discarding it means removing it,
        // which leaves the published version exactly as it was.
        await jdService.delete(editingId);
        clearFreshDraftVersion(editingId);
      } else if (editingId && checkpoint) {
        await jdService.update(editingId, buildRestorePayload(checkpoint.jd));
      }
      finishLeave();
    } catch (error) {
      discardedRef.current = false;
      console.error('[Leave] Failed to discard changes:', error);
      toast.error({
        title: 'Could not discard changes',
        description: friendlyErrorMessage(error, "Please try again."),
      });
    } finally {
      setLeaveBusy(null);
    }
  };

  // Leave prompt → "Delete this entire JD". Removes the record, so it never
  // shows under Draft. Stays on the page if the server refuses (e.g. the JD is
  // in use), rather than leaving the recruiter to think it was removed.
  const handleLeaveDelete = async () => {
    if (!editingId) return;
    setLeaveBusy('delete');
    discardedRef.current = true;
    try {
      // Through a working copy, the JD to delete is the draft it belongs to; its
      // copies are removed with it.
      await jdService.delete(editingCopyOf ?? editingId);
      toast.success(`${leaveJobCode ?? 'The JD'} has been deleted`);
      finishLeave();
    } catch (error) {
      discardedRef.current = false;
      console.error('[Leave] Failed to delete the JD:', error);
      toast.error({
        title: 'Could not delete this JD',
        description: friendlyErrorMessage(error, "Please try again."),
      });
    } finally {
      setLeaveBusy(null);
    }
  };

  // Leave prompt → Cancel. Leaves the user exactly where they are — the
  // popstate guard's history trap is left armed, so a subsequent Back press
  // (or another link click) prompts again.
  const handleCancelDialog = () => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
    setIsPendingBackNavigation(false);
  };

  // Handle cancel JD creation - delete draft and navigate away
  const handleCancelJD = () => {
    setShowCancelDialog(true);
  };

  // Confirm cancel and delete JD
  const confirmCancelJD = async () => {
    setIsCancelling(true);
    try {
      // Only delete the draft if:
      // - There's a saved draft (editingId exists)
      // - AND either it was created fresh this session (not pre-existing) OR the user made changes
      const shouldDelete = editingId && (!isPreExistingDraft || hasUnsavedChanges);
      if (shouldDelete) {
        await jdService.delete(editingId!);
        toast.success('JD draft has been deleted');
      }
      // Navigate to job openings
      router.push('/recruitment/job-openings');
    } catch (error) {
      console.error('Failed to delete JD:', error);
      toast.error('Failed to delete JD');
    } finally {
      setIsCancelling(false);
      setShowCancelDialog(false);
    }
  };

  // Save JD as draft
  // navigateAfter: when true (default), navigates to /recruitment/job-openings on success.
  // Callers that already own their own post-save navigation (e.g. the unsaved-changes dialog,
  // or handleBackClick) must pass false to avoid firing two competing router.push() calls.
  // Returns whether the draft actually saved, so callers that navigate
  // afterwards (the unsaved-changes dialog) don't leave the page on a
  // validation failure and silently lose the user's work.
  const handleSaveDraft = async (navigateAfter: boolean = true): Promise<boolean> => {
    const trimmedJobTitle = jobTitle.trim();

    // Validate job title has at least 1 non-space character
    if (!trimmedJobTitle) {
      toast.warning({
        title: 'Cannot save draft',
        description: 'Please enter a job title',
      });
      return false;
    }

    if (!(await ensureValidJobTitle(trimmedJobTitle))) {
      return false;
    }

    if (step !== 'create' && !validateExtractionPageEnglishOnlyFields()) {
      return false;
    }

    setIsSavingDraft(true);

    try {
      const experiencePayload = resolvePersistedExperiencePayload(extractedData.experience);
      const experienceMin = experiencePayload.experienceMin;
      const experienceMax = experiencePayload.experienceMax;

      // Build the JD data for backend
      // For AI mode: use generated JD, or AI prompt as placeholder, or empty string
      // For manual mode: use manual JD
      const descriptionToSave = mode === 'ai'
        ? (generatedJD || (aiPrompt ? `[AI Prompt - Pending Generation]\n\n${aiPrompt}` : ''))
        : manualJD;
      console.log('[DEBUG] handleSaveDraft - descriptionToSave:', descriptionToSave?.substring(0, 100));

      const jdData = {
        title: trimmedJobTitle,
        description: descriptionToSave,
        department: extractedData.department || '',
        location: extractedData.locations.length > 0
          ? extractedData.locations[0].city
          : '',
        employment_type: extractedData.employmentType,
        remote_type: extractedData.workModel,
        must_have_skills: extractedData.mustHaveSkills,
        nice_to_have_skills: extractedData.niceToHaveSkills,
        education_requirements: extractedData.education ? { degree: extractedData.education } : undefined,
        experience_min: experienceMin,
        experience_max: experienceMax,
        ...buildIndustryPayload(extractedData),
        role_family: extractedData.roleFamily || undefined,
        role_family_confidence: extractedData.roleFamilyConfidence ?? undefined,
        salary_min: parseSalaryInput(extractedData.salaryFrom) ?? null,
        salary_max: parseSalaryInput(extractedData.salaryTo) ?? null,
        compensation_type: extractedData.compensationType,
        salary_currency: extractedData.salaryCurrency,
        job_level: experiencePayload.jobLevel,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        // JD22. NULL, not undefined, when the box is empty: the backend updates with
        // exclude_unset, so an omitted key leaves the stored text in place and CLEARING
        // the box could never take effect - the recruiter deleted the shift/WFO lines,
        // saved, and every JD view kept showing the old ones.
        additional_details: extractedData.additionalDetails?.trim() ? extractedData.additionalDetails : null,
        internal_comments: extractedData.internalRecruiterComments.join('\n') || undefined,
        must_have_comments: extractedData.mustHaveComments,
        nice_to_have_comments: extractedData.niceToHaveComments,
        skill_merge_trail: extractedData.mergeTrail || [],
        allow_overqualified: extractedData.allowOverqualified,
        // JD11: Include certifications and domain_keywords in data sync
        certifications: extractedData.certifications,
        domain_keywords: extractedData.domainKeywords,
        creation_stage: step,  // Save the current step so user can continue from here
        locations: extractedData.locations.map(loc => {
          // Parse "City, State" format
          const parts = loc.city.split(', ');
          return {
            city: parts[0],
            state: parts[1] || null,
            country: loc.country || locationCountry,
            radius_km: parseInt(loc.radius) || 50,
            is_required: extractedData.locationsRequired,
          };
        }),
        creation_method: (mode === 'ai' ? 'ai_generated' : 'manual') as 'ai_generated' | 'manual',
        ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
        // Mandatory flags - determines if criteria is Required vs Preferred in scoring
        experience_mandatory: extractedData.experienceRequired || false,
        education_mandatory: extractedData.educationRequired || false,
        industry_mandatory: extractedData.industryTypeRequired || false,
        location_mandatory: extractedData.locationsRequired || false,
        // RS20: Job Hopping toggle.
        job_hopping_enabled: extractedData.jobHoppingEnabled ?? true,
      };

      console.log('[DEBUG] SAVING JD - Mandatory flags being sent:', {
        experience_mandatory: jdData.experience_mandatory,
        education_mandatory: jdData.education_mandatory,
        industry_mandatory: jdData.industry_mandatory,
        location_mandatory: jdData.location_mandatory,
        experienceRequired: extractedData.experienceRequired,
        educationRequired: extractedData.educationRequired,
        industryTypeRequired: extractedData.industryTypeRequired,
        locationsRequired: extractedData.locationsRequired,
      });

      // Update existing JD or create new one
      // Always update the SAME row/version in place when editingId exists —
      // whether it is currently Draft or Published. No forking: the user
      // edits exactly the version they opened, nothing else.
      console.log('[DEBUG] Save draft - editingId:', editingId, 'isEditingDraft:', isEditingDraft, 'isEditingPublished:', isEditingPublished);
      console.log('[DEBUG] jdData being saved:', { title: jdData.title, description: jdData.description?.substring(0, 100), creation_method: jdData.creation_method });
      let savedJd;
      if (editingId) {
        console.log('[DEBUG] Updating existing JD in place:', editingId);
        savedJd = await jdService.update(editingId, jdData);
        console.log('[DEBUG] JD updated:', savedJd.id);
      } else {
        // No editingId at all — genuinely a new JD.
        console.log('[DEBUG] Creating new draft (no editingId)');
        savedJd = await jdService.create({ ...jdData, as_working_copy: true });
        createdInSessionIdRef.current = savedJd.id;
        setEditingId(savedJd.id);  // Track the new ID in case we save again
        console.log('[DEBUG] JD created as draft:', savedJd.id);
      }
      // The editor works on a working copy; Save as Draft is what makes it real -
      // a new JD becomes a draft (and gets its JD ID now), an existing draft gets
      // the copy's content. Editing continues on the real JD from here.
      if (savedJd.is_working_copy) {
        savedJd = await jdService.commitWorkingCopy(savedJd.id);
        setEditingId(savedJd.id);
        setUnsavedNewCopyId(null);
      }

      setIsSavingDraft(false);
      setHasUnsavedChanges(false); // Clear unsaved changes after successful save
      userSavedDraftRef.current = true; // The user kept this draft — Discard must not delete it
      // Saved on purpose: a forked draft version is now an ordinary draft, so
      // Discard reverts it instead of removing it.
      if (freshForkIdRef.current) {
        clearFreshDraftVersion(freshForkIdRef.current);
        freshForkIdRef.current = null;
      }
      savedContentKeyRef.current = currentContentKeyRef.current;
      setLeaveCheckpoint(savedJd, 'your last Save as Draft');

      // The backend silently refuses to move an already-Published JD to Draft
      // via this update path (it only allows Published -> Disabled/Archived),
      // so `savedJd.status` — what actually got persisted — is the only
      // reliable source for this message. Branching on `isEditingPublished`
      // (the status BEFORE the save) claimed "moved to draft" even when the
      // JD stayed Published, which is exactly the false alarm this replaces.
      const actuallyMovedToDraft = isEditingPublished && savedJd.status !== 'published';
      toast.success({
        title: actuallyMovedToDraft ? 'Moved to draft' : 'Draft saved',
        description: actuallyMovedToDraft
          ? `${formatJobSubject({ job_id: savedJd.job_id, title: jobTitle, versionNumber: savedJd.version_number })} has been taken off Published and saved as a draft with your changes.`
          : isEditingPublished
            ? `${formatJobSubject({ job_id: savedJd.job_id, title: jobTitle, versionNumber: savedJd.version_number })} stays Published — your changes have been saved to it.`
            : `${formatJobSubject({ job_id: savedJd.job_id, title: jobTitle, versionNumber: savedJd.version_number })} has been saved as draft.`,
      });

      // Navigate to job openings page after saving draft, unless the caller owns navigation
      if (navigateAfter) {
        router.push('/recruitment/job-openings');
      }
      return true;
    } catch (error) {
      console.error('[ERROR] Failed to save draft:', error);
      setIsSavingDraft(false);
      toast.error({
        title: "Couldn't save draft",
        description: friendlyErrorMessage(error, "Please try again."),
      });
      // Stay on page even on error - let user retry or fix issues
      return false;
    }
  };

  /**
   * The four-step progress bar.
   *
   * Driven by `displayStep` off one array rather than four hand-written blocks:
   * the previous three were already inconsistent with each other (Step 1 had no
   * "pending" branch at all, because with three steps it could never be
   * pending), and a fourth copy is a fourth chance for the active/done/pending
   * rules to drift. Same visual language as before — brand blue for the step
   * you are on, brand cyan with a tick for the ones behind it, grey for the
   * ones ahead.
   *
   * `overflow-x-auto` + `min-w-max`: four labelled steps are wider than a small
   * tablet, and the row must scroll rather than squash the circles or wrap
   * mid-connector. `w-fit mx-auto` keeps it centred whenever it does fit.
   */
  const renderStepIndicator = () => {
    const stepLabels = [
      jdWorkflow === 'new-version' ? 'New Version'
        : jdWorkflow === 'edit-new-version' ? 'Edit New Version'
          : jdWorkflow === 'edit' ? 'Edit JD' : 'Create JD',
      'Extract',
      'Review',
      // Kept from the original: editing a published JD publishes a new version.
      isEditingPublished ? 'Republish' : 'Publish',
    ];

    return (
      /* Scrolls sideways on narrow screens only. `overflow-x: auto` makes the
         browser treat the Y axis as `auto` too, so the current step's pulse
         ring (scales to 2×) and shadow overflowed the 40px row — a vertical
         scrollbar appeared and the ring was clipped. The negative margins +
         equal padding give the scroll box room for them (out to the card's
         border, the same footprint as AI Interview's unclipped indicator)
         without moving the steps, and the Y axis is hidden explicitly. */
      <div className="overflow-x-auto overflow-y-hidden -my-6 py-6 -mx-3 px-3 sm:-mx-5 sm:px-5">
        {/* Phones: labels are hidden, so the four circles fit — the row
            spans the card (`w-full`, no `min-w-max`) and the connectors
            stretch (`flex-1`) to share what is left, so nothing scrolls. */}
        <div className="flex w-fit min-w-max max-sm:w-full max-sm:min-w-0 mx-auto items-center gap-2 sm:gap-4 px-1 sm:px-2">
          {stepLabels.map((label, index) => {
            const stepNumber = index + 1;
            const isCurrent = displayStep === stepNumber;
            const isComplete = displayStep > stepNumber;

            return (
              <Fragment key={label}>
                {/* Connector BEFORE this step — filled once the step behind it
                    is complete, which is the same test as that step's tick.
                    Colours, circle and label styles below are the AI Interview
                    step indicator's (AIInterviewStepIndicator), so both
                    creation flows read as one component. */}
                {index > 0 && (
                  <div
                    className={`w-6 max-sm:w-auto max-sm:flex-1 max-sm:min-w-3 sm:w-12 lg:w-24 h-0.5 rounded-full transition-colors duration-500 ${
                      displayStep > index ? 'bg-brand-blue' : 'bg-gray-200'
                    }`}
                  />
                )}

                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="relative">
                    <div
                      className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full text-sm font-semibold shrink-0 transition-all duration-300 z-10 relative ${
                        isComplete
                          ? 'bg-brand-blue text-white shadow-sm'
                          : isCurrent
                            ? 'bg-gradient-to-br from-brand-blue to-brand-blue-2 text-white shadow-lg shadow-brand-blue/40 ring-2 ring-brand-blue/10'
                            : 'bg-gray-100 text-gray-400 ring-1 ring-gray-200'
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <span className="tabular-nums">{stepNumber}</span>
                      )}
                    </div>
                    {isCurrent && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-full bg-brand-blue/25 tf-step-pulse"
                      />
                    )}
                  </div>
                  <div
                    className={`hidden sm:block text-sm whitespace-nowrap font-medium transition-colors duration-300 ${
                      isCurrent
                        ? 'text-brand-blue-deep'
                        : isComplete
                          ? 'text-gray-700'
                          : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  // Load selected job data if editing
  useEffect(() => {
    if (selectedJob) {
      setJobTitle(selectedJob.title);
    }
  }, [selectedJob]);

  // Load JD data when editing
  // - Draft JD: editingId is already set in useState, so saves will update the same draft
  // - Published JD: editingId is null, so saves will create a new draft
  useEffect(() => {
    if (effectiveEditingJD && !hasLoadedFromEditingJD.current) {
      // Only load from effectiveEditingJD once on initial mount to prevent overwriting user edits
      hasLoadedFromEditingJD.current = true;

      console.log('[TalentFlow] Restoring JD state from effectiveEditingJD:', {
        id: effectiveEditingJD.id,
        title: effectiveEditingJD.title,
        creation_stage: effectiveEditingJD.creation_stage,
        creation_method: effectiveEditingJD.creation_method,
        status: effectiveEditingJD.status
      });

      // The hydrated content is what's saved — adopt it as the baseline on
      // the next content update (see the change-tracking effect).
      markLoadedContentSavedRef.current = true;
      adoptLoadedKeyAsCheckpointRef.current = effectiveEditingJD.id !== createdInSessionIdRef.current;
      // Use functional updates to preserve user edits if they exist
      setJobTitle(prev => prev || effectiveEditingJD.title);
      // Only hydrate the AI-mode buffer for an AI-generated JD. Populating it for a
      // MANUAL JD left a stale copy of the stored description sitting in `generatedJD`,
      // which any `generatedJD || manualJD` expression would then prefer over the live
      // manual text. Manual JDs hydrate `manualJD` a few lines below.
      if (effectiveEditingJD.creation_method !== 'manual') {
        setGeneratedJD(prev => prev || effectiveEditingJD.description);
      }

      // Populate AI prompt field with saved ai_prompt (not description)
      // Only set if current value is empty to avoid overwriting user edits
      if (effectiveEditingJD.creation_method === 'ai_generated') {
        setAiPrompt(prev => prev || effectiveEditingJD.ai_prompt || '');  // Preserve user edits
      } else if (effectiveEditingJD.creation_method === 'manual') {
        setManualJD(prev => prev || effectiveEditingJD.description || '');  // Preserve user edits
      }

      // Capture the Step-1 baseline for change detection on Next (used to skip the
      // extraction LLM when the user edits an existing JD but changes nothing here).
      stage1LoadBaseline.current = {
        jobTitle: effectiveEditingJD.title || '',
        aiPrompt: effectiveEditingJD.ai_prompt || '',
        generatedJD: effectiveEditingJD.description || '',
        manualJD: effectiveEditingJD.creation_method === 'manual' ? (effectiveEditingJD.description || '') : '',
      };

      // Hydrate lastExtractedJD/originalStage1Values from the persisted JD only if
      // extraction has already happened. For drafts saved at 'create' stage, leave
      // them empty so handleNext triggers extraction. This is what lets a page
      // refresh recognize "this JD text was already extracted" instead of forcing
      // a fresh (non-deterministic) LLM call that could return a different value
      // (e.g. overwriting a correctly-saved experience_min of 3.5 with 2) for text
      // that never changed.
      if (jdHasPersistedExtraction(effectiveEditingJD)) {
        setLastExtractedJD(effectiveEditingJD.description || '');
        setOriginalStage1Values({
          jobTitle: effectiveEditingJD.title || '',
          aiPrompt: effectiveEditingJD.ai_prompt || '',
          generatedJD: effectiveEditingJD.description || '',
          manualJD: effectiveEditingJD.creation_method === 'manual' ? (effectiveEditingJD.description || '') : ''
        });
      }

      setStep(effectiveEditingJD.creation_stage);
      console.log('[TalentFlow] Set step to:', effectiveEditingJD.creation_stage);

      // If already at review stage, mark as formatted to skip reformatting on next "Next" click
      // and mark as proceeded to review to make Stage 2 fields read-only
      if (effectiveEditingJD.creation_stage === 'review') {
        setHasFormattedForReview(true);
        setHasProceededToReview(true);
      }

      // Restore the creation mode based on saved creation_method
      if (effectiveEditingJD.creation_method) {
        const loadedMode: CreationMode = effectiveEditingJD.creation_method === 'ai_generated' ? 'ai' : 'manual';
        setMode(loadedMode);
        lastExtractionSourceMode.current = loadedMode;
      }

      // Load extracted data if:
      // 1. We're past the create step (draft JDs), OR
      // 2. It's a published JD (always has data regardless of stage)
      if (jdHasPersistedExtraction(effectiveEditingJD) || effectiveEditingJD.status === 'published') {
        // Calculate actual values first, then set Required based on whether value exists
        const educationValue = effectiveEditingJD.education_requirements?.degree || '';

        // NUMBERS-FIRST: prefill the From/To years from the saved range. For
        // legacy JDs that only stored a level code (job_level) and no numbers,
        // fall back to that level's master From/To range so the boxes still fill.
        let experienceValue = buildExperienceYearsString(
          effectiveEditingJD.experience_min,
          effectiveEditingJD.experience_max
        );
        if (!experienceValue && effectiveEditingJD.job_level) {
          const legacyLevel = getExperienceLevelByCode(effectiveEditingJD.job_level);
          if (legacyLevel) {
            experienceValue = buildExperienceYearsString(legacyLevel.min_years, legacyLevel.max_years);
          }
        }
        const hasPersistedExperienceYears = (
          effectiveEditingJD.experience_min !== null
          && effectiveEditingJD.experience_min !== undefined
        ) || (
          effectiveEditingJD.experience_max !== null
          && effectiveEditingJD.experience_max !== undefined
        );
        // Restore industry type from saved draft
        const industryValue = effectiveEditingJD.industry_type || '';
        setShowCustomExperienceInput(false);
        // Only SAVED years count as explicit. A legacy level-only JD prefills the
        // boxes from the master band (see experienceValue above), and treating that
        // prefill as explicit persisted the band's numbers on the next save.
        setExperienceYearsExplicit(hasPersistedExperienceYears);

        console.log('[DEBUG] Loading effectiveEditingJD data:');
        console.log('[DEBUG] - experience_min from API:', effectiveEditingJD.experience_min);
        console.log('[DEBUG] - experience_max from API:', effectiveEditingJD.experience_max);
        console.log('[DEBUG] - mapped experienceValue:', experienceValue);
        console.log('[DEBUG] - industry_type from API:', effectiveEditingJD.industry_type);
        console.log('[DEBUG] - mapped industryValue:', industryValue);
        console.log('[DEBUG] - nice_to_have_comments from API:', effectiveEditingJD.nice_to_have_comments);
        console.log('[DEBUG] - must_have_comments from API:', effectiveEditingJD.must_have_comments);
        console.log('[DEBUG] - must_have_skills from API:', effectiveEditingJD.must_have_skills);
        console.log('[DEBUG] - nice_to_have_skills from API:', effectiveEditingJD.nice_to_have_skills);

        setExtractedData(prev => {
          const next = {
          ...prev,
          mustHaveSkills: effectiveEditingJD.must_have_skills || [],
          niceToHaveSkills: effectiveEditingJD.nice_to_have_skills || [],
          education: educationValue,
          // BUG29: these three used to be hardcoded `false` here. Reopening a JD that
          // was published with Experience/Education/Industry marked Required showed the
          // toggles OFF, and the next save wrote that back - silently demoting those
          // criteria from Essential (60% block) to Preferred, so Resume Scoring stopped
          // enforcing them. The flags are stored on the JD and returned by the API;
          // read them. `locationsRequired` below always did this correctly, via
          // locations[].is_required, which is why only these three drifted.
          educationRequired: effectiveEditingJD.education_mandatory ?? false,
          experience: experienceValue,
          experienceRequired: effectiveEditingJD.experience_mandatory ?? false,
          industryType: industryValue,
          // Give the recruiter back the industry they typed or accepted. Saved into
          // raw_industry, so it survives a reload even though it is not a code yet.
          industrySuggestedName: effectiveEditingJD.industry_suggested_name || undefined,
          industrySuggestedReason: undefined,
          industryIsCustom: Boolean(effectiveEditingJD.industry_suggested_name),
          industryTypeRequired: effectiveEditingJD.industry_mandatory ?? false,
          department: effectiveEditingJD.department || '',
          salaryFrom: sanitizeExtractedSalary(effectiveEditingJD.salary_min),
          salaryTo: sanitizeExtractedSalary(effectiveEditingJD.salary_max),
          compensationType: (effectiveEditingJD.compensation_type as 'hourly' | 'daily' | 'monthly' | 'yearly') || 'yearly',
          salaryCurrency: normalizeSalaryCurrency(effectiveEditingJD.salary_currency),
          // A loaded draft/saved JD is ground truth - "original" starts out identical
          // to what is displayed, same as a fresh extraction.
          salaryOriginalFrom: sanitizeExtractedSalary(effectiveEditingJD.salary_min),
          salaryOriginalTo: sanitizeExtractedSalary(effectiveEditingJD.salary_max),
          salaryOriginalCurrency: normalizeSalaryCurrency(effectiveEditingJD.salary_currency),
          assessmentGuidance: effectiveEditingJD.assessment_guidance || '',
          additionalDetails: effectiveEditingJD.additional_details || '',
          internalRecruiterComments: effectiveEditingJD.internal_comments ? effectiveEditingJD.internal_comments.split('\n').filter(c => c.trim()) : [],
          mustHaveComments: effectiveEditingJD.must_have_comments || [],
          niceToHaveComments: effectiveEditingJD.nice_to_have_comments || [],
          // The skill groups this JD was saved with. This block hydrates a STORED JD -
          // reopening a draft, or a refresh - and it is a different path from the two
          // that read a fresh extraction result, so omitting it here left `mergeTrail`
          // at its [] initial value: the tree and its Add buttons rendered while the
          // extraction response was still in memory and vanished on the first reload.
          // ALL kinds. This used to keep only skill entries, so requirement groups
          // never reached the screen - and since this state is what gets saved, they
          // were also deleted from the JD on the first save.
          mergeTrail: (effectiveEditingJD.skill_merge_trail || []),
          certifications: effectiveEditingJD.certifications || [],
          domainKeywords: effectiveEditingJD.domain_keywords || [],
          // Preserve the recruiter's actual saved answer; only a JD that genuinely
          // never had this field set (predates the column) falls back to null,
          // which re-triggers the required-choice gate on this edit.
          allowOverqualified: effectiveEditingJD.allow_overqualified ?? null,
          employmentType: (effectiveEditingJD.employment_type as ExtractedData['employmentType']) || 'full_time',
          workModel: (effectiveEditingJD.remote_type as ExtractedData['workModel']) || 'onsite',
          locations: effectiveEditingJD.locations?.map(loc => ({
            // Reconstruct "City, State" format for UI dropdown matching
            city: loc.state ? `${loc.city}, ${loc.state}` : loc.city,
            radius: loc.radius_km?.toString() || '50',
            country: (loc.country === 'US' ? 'US' : 'IN') as 'IN' | 'US',
          })) || [],
          // Prefer the top-level flag: `location_mandatory` is the column Resume
          // Scoring reads to decide whether Location is Essential, so it is the
          // source of truth. The per-location `is_required` is the older shape and
          // stays as the fallback for JDs saved before the column existed.
          locationsRequired:
            effectiveEditingJD.location_mandatory ??
            (effectiveEditingJD.locations?.some(loc => loc.is_required) || false),
          };
          return next;
        });

        // Reopening a JD has to restore the WARNING as well as the tick it explains.
        // Computed server-side on every read, so a JD extracted before this rule
        // existed - or one whose text was edited since - still reports correctly.
        setJdWelcomesFreshers(Boolean(effectiveEditingJD.experience_welcomes_freshers));

        // WORDS FIRST on reopen. The saved level is kept as the word-derived level
        // when the title names a grade, or when the JD saved no years at all (a
        // level-only JD - the level can only have come from its words). Otherwise
        // the level was mapped from the years and must follow them if the recruiter
        // edits the boxes, so nothing is pinned. The backend re-applies the same rule
        // on save (reconcile_job_level_with_words), so this only keeps the client's
        // payload honest - it is not the enforcement.
        const savedLevel = (effectiveEditingJD.job_level || '').trim();
        setExperienceLevelWord(
          savedLevel && getExperienceLevelByCode(savedLevel)
            && (TITLE_MENTIONS_SENIORITY.test(effectiveEditingJD.title || '') || !hasPersistedExperienceYears)
            ? savedLevel
            : ''
        );

        // Sync the standalone country dropdown to the first saved location's country
        const firstCountry = effectiveEditingJD.locations?.[0]?.country;
        if (firstCountry === 'US' || firstCountry === 'IN') {
          setLocationCountry(firstCountry);
        } else if (normalizeSalaryCurrency(effectiveEditingJD.salary_currency) === 'USD') {
          // NO saved location, and the JD quotes its pay in USD -> it is a US role.
          //
          // The same USD inference already existed on the post-generation path, but not
          // here, so re-opening a draft or editing a published JD fell back to the 'IN'
          // initial state: a US job description opened the Locations picker on India with
          // an Indian city list, and the recruiter had to switch it by hand every time.
          // Extraction deliberately returns no locations (the city is the recruiter's
          // choice), so on this path there is nothing else to infer from - which is
          // exactly why the currency signal is needed here rather than only there.
          //
          // Only reached when no location is saved, so it can never override a
          // deliberate choice the recruiter already made.
          setLocationCountry('US');
        }

        console.log('[TalentFlow] Extracted data loaded successfully from database');
      }
    }
  }, [effectiveEditingJD]);

  // Seed the "what Step 3 was last built from" snapshot, once.
  //
  // Also seeds for a LOADED JD that is still showing Step 1, which the `step === 'extract'`
  // condition alone did not cover. That gap mattered: a JD opened with ?stage=create in the
  // link lands on Step 1 (see jdHasPersistedExtraction), so the snapshot stayed empty, and
  // the chain-invalidation check above - which needs a non-empty baseline to compare the
  // fresh extraction against - could never fire. That is the exact flow this was reported
  // on: open a colleague's draft, edit Step 1, and Step 3 never re-formatted.
  useEffect(() => {
    if (step2DataSnapshot.current !== '') return;
    const loadedJDHasData = Boolean(effectiveEditingJD) && hasExtractedRequirementData();
    if (step === 'extract' || loadedJDHasData) {
      step2DataSnapshot.current = step2Fingerprint(extractedData, jobTitle);
    }
  }, [step, extractedData, effectiveEditingJD]);

  // FIX-003: Show loading state when fetching JD in embedded mode
  if (loadingJD) {
    // Same skeleton the route page shows, so only ONE consistent skeleton
    // appears (no flash between a bare form and the full page skeleton).
    return <PageSkeleton variant="form" showStats={false} />;
  }

  const jobTitleValidationError = getResolvedJobTitleValidationError(jobTitle);
  const jobTitleLengthInvalid = jobTitle.length > 0 && !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max);
  const hasJobTitleValidationError = jobTitleLengthInvalid || Boolean(jobTitleValidationError);
  const isJobTitlePendingValidation = (
    jobTitle.trim().length >= VALIDATION.JOB_TITLE.min &&
    !jobTitleValidationError &&
    isJobTitleValidating
  );
  const aiPromptValidationError = getAIPromptValidationError(aiPrompt);
  // Carry whichever module opened JD creation into the follow-up links. Hard-
  // coding only the AI Interview case dropped the origin for every other flow,
  // so "Create Another JD" landed on the plain Dashboard › Job Descriptions
  // trail mid-flow. The trail itself is the source of truth here — the page
  // already resolved it from the URL, and reading it back avoids a second
  // (hydration-unsafe) look at window.location.
  const flowOriginByCrumb: Array<[string, string]> = [
    ['/recruitment/ai-interviews', 'ai-interview'],
    ['/recruitment/assessments', 'assessment'],
    ['/recruitment/resume-scoring', 'resume-scoring'],
  ];
  const flowOrigin = flowOriginByCrumb.find(([href]) =>
    breadcrumbItems?.some(item => item.href === href)
  )?.[1] ?? null;
  const originQuery = flowOrigin ? `from=${flowOrigin}` : '';
  // Names where `onBack` actually lands, which is the flow's own screen rather
  // than the JD list whenever this page was opened mid-flow.
  const backDestinationLabel =
    flowOrigin === 'assessment' ? 'Create AI Assessment'
    : flowOrigin ? 'Select Job Description'
    : 'Go to All Jobs';
  const createAnotherJdUrl = originQuery
    ? `/recruitment/jd-creation?${originQuery}`
    : '/recruitment/jd-creation';
  const viewPublishedJdUrl = publishedJdId
    ? `/recruitment/job-details?id=${publishedJdId}${originQuery ? `&${originQuery}` : ''}`
    : '';

  return (
    <>
      <div ref={scrollContainerRef} className="h-full overflow-x-hidden overflow-y-auto bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px] space-y-4 md:space-y-5">

        {/* Content Card: Breadcrumb + Title + Step Indicator + warning + step content (AI-Generated JD, Manual Input, Job Details, Generated JD) */}
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">

          {/* Breadcrumb. The page title and blurb that used to sit here are
              gone: the breadcrumb leaf now names the current step and the
              indicator below shows all four, so a static heading repeated what
              both of them already said while pushing the actual work further
              down the page. */}
          {breadcrumbItems && breadcrumbItems.length > 0 && (
            <PageBreadcrumb className="mb-4 sm:mb-5" items={breadcrumbItems} />
          )}

          {/* Step Indicator block */}
          <div className="mb-4 sm:mb-6 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-900 px-3 py-3 sm:px-5 sm:py-4">
            {renderStepIndicator()}
          </div>

          {/* Warning banner when JD is in use */}
          {isJDInUse && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-brand-orange/5 ring-1 ring-brand-orange/20 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange-deep mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-brand-orange-deep">This Job Description cannot be edited</p>
                  <p className="text-xs text-gray-700 dark:text-slate-300 mt-1">
                    {jdUsageMessage || 'This job description has been used in Resume Scoring, Assessments, or AI Talent Match and cannot be modified. Please create a new JD instead.'}
                  </p>
                </div>
              </div>
            </div>
          )}


        {/* Step 1: Create JD */}
        {step === 'create' && (
          <>
            {/* Mode Selection */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
              <button
                onClick={() => setMode('ai')}
                className={`flex-1 p-4 sm:p-6 rounded-xl border-2 transition-all ${
                  mode === 'ai'
                    ? 'border-brand-blue/40 bg-brand-blue/5 shadow-md shadow-brand-blue/10'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                }`}
              >
                {/* Icon left; title over description beside it. */}
                <div className="flex items-start gap-2 sm:gap-3 text-left">
                  <Wand2 className={`w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 ${mode === 'ai' ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'}`} />
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-1">
                      AI-Generated JD
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400">
                      Let AI create a professional job description based on your inputs
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('manual')}
                className={`flex-1 p-4 sm:p-6 rounded-xl border-2 transition-all ${
                  mode === 'manual'
                    ? 'border-brand-blue/40 bg-brand-blue/5 shadow-md shadow-brand-blue/10'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                }`}
              >
                {/* Icon left; title over description beside it. */}
                <div className="flex items-start gap-2 sm:gap-3 text-left">
                  <Edit2 className={`w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 ${mode === 'manual' ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'}`} />
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-1">
                      Manual Input
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400">
                      Write or paste your own job description
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Input Form - AI Mode */}
              {mode === 'ai' && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Job Details</h2>
                    {/* JD06: Autosave status indicator for AI mode */}
                    <div className="flex items-center gap-2 text-sm">
                      {autosaveStatus === 'saving' && (
                        <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </span>
                      )}
                      {autosaveStatus === 'error' && (
                        <span className="flex items-center gap-1.5 text-destructive">
                          <CloudOff className="w-4 h-4" />
                          Save failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Job Title<span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        maxLength={VALIDATION.JOB_TITLE.max}
                        placeholder="e.g., Registered Nurse, CNC Machinist, Senior Java Developer"
                        disabled={isJDInUse || isTitleLocked}
                        title={isTitleLocked && !isJDInUse ? titleLockedMessage : undefined}
                        className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black ${
                          isJDInUse || isTitleLocked
                            ? 'bg-gray-100 cursor-not-allowed'
                            : hasJobTitleValidationError
                              ? 'border-destructive-line bg-destructive-subtle'
                              : 'border-gray-200'
                        }`}
                      />
                      {isTitleLocked && !isJDInUse && (
                        <p className="mt-1 text-xs text-warning">
                          {titleLockedMessage || 'The job title cannot be changed because this job is already in use.'}
                        </p>
                      )}
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${hasJobTitleValidationError ? 'text-destructive' : isJobTitlePendingValidation ? 'text-gray-500' : getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length === 0 && `Job Title is required (min ${VALIDATION.JOB_TITLE.min} characters)`}
                          {jobTitle.length > 0 && jobTitleValidationError && jobTitleValidationError}
                          {jobTitle.length > 0 && !jobTitleValidationError && jobTitle.length < VALIDATION.JOB_TITLE.min && `Min ${VALIDATION.JOB_TITLE.min} characters required (${VALIDATION.JOB_TITLE.min - jobTitle.length} more)`}
                          {jobTitle.length >= VALIDATION.JOB_TITLE.min && !jobTitleValidationError && !jobTitleLengthInvalid && isJobTitlePendingValidation && 'Validating job title...'}
                        </p>
                        <p className={`text-xs ${hasJobTitleValidationError ? 'text-destructive' : isJobTitlePendingValidation ? 'text-gray-500' : getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length}/{VALIDATION.JOB_TITLE.max}
                        </p>
                      </div>
                      {/* JD07: Helper text for minimal prompt */}
                      {/* <p className="text-xs text-gray-500 mt-1">
                        Enter a job title or a minimal prompt – AI will generate the full JD
                      </p> */}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        AI Prompt – Quick Job Details <span className="text-destructive">*</span>
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        maxLength={VALIDATION.AI_PROMPT.max}
                        placeholder="Describe the role - responsibilities, must-have skills, experience, location, work mode, salary. e.g., 'Shift supervisor for a 200-bed hospital ward, 5+ years, night rotation, Chennai' or 'Senior full-stack developer with React and Node.js, 5+ years, remote, leading a team of 3'"
                        rows={12}
                        disabled={isJDInUse}
                        className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black placeholder-gray-500 ${
                          isJDInUse
                            ? 'bg-gray-100 cursor-not-allowed'
                            : aiPrompt.trim().length > VALIDATION.AI_PROMPT.max || Boolean(aiPromptValidationError)
                              ? 'border-destructive-line bg-destructive-subtle'
                              : 'border-gray-200'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${aiPromptValidationError || (aiPrompt.trim().length > 0 && aiPrompt.trim().length < VALIDATION.AI_PROMPT.min) ? 'text-destructive' : 'text-gray-500'}`}>
                          {aiPrompt.trim().length === 0 && `Min ${VALIDATION.AI_PROMPT.min} characters required`}
                          {aiPrompt.trim().length > 0 && aiPrompt.trim().length < VALIDATION.AI_PROMPT.min && `${VALIDATION.AI_PROMPT.min - aiPrompt.trim().length} more characters needed`}
                          {aiPrompt.trim().length >= VALIDATION.AI_PROMPT.min && aiPromptValidationError && aiPromptValidationError}
                        </p>
                        <p className={`text-xs ${aiPrompt.trim().length > VALIDATION.AI_PROMPT.max || aiPromptValidationError ? 'text-destructive' : 'text-gray-500'}`}>
                          {aiPrompt.trim().length}/{VALIDATION.AI_PROMPT.max}
                        </p>
                      </div>
                      {detectInvertedLabelledSalary(aiPrompt) && (
                        <div className="flex items-center gap-2 p-3 mt-2 bg-warning-subtle border border-warning-line rounded-lg">
                          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
                          <p className="text-xs text-warning-strong">
                            Minimum Salary looks higher than Maximum Salary - double-check these figures before generating.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Quota Warning */}
                    {quotaChecked && !hasQuota && (
                      <div className="flex items-center gap-2 p-3 bg-destructive-subtle border border-destructive-line rounded-lg mb-4">
                        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-destructive-strong">Job Quota Exceeded</p>
                          <p className="text-xs text-destructive">
                            You have reached your maximum job posting limit.{' '}
                            <a href="/subscription" className="underline font-medium">Upgrade your plan</a> to create more jobs.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Warning when JD is in use */}
                    {isJDInUse && (
                      <div className="mb-4 p-3 sm:p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <div className="flex items-start gap-2 sm:gap-3">
                          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-orange-800">This JD cannot be edited</p>
                            <p className="text-xs text-orange-700 mt-1">
                              {jdUsageMessage || 'This job description has been used in Resume Scoring, Assessments, or AI Talent Match and cannot be modified. Please create a new JD instead.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button
                      variant="primary"
                      onClick={handleGenerateJD}
                      disabled={(() => {
                        const promptLength = aiPrompt.trim().length;

                        return (
                          isJDInUse ||
                          !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max) ||
                          Boolean(jobTitleValidationError) ||
                          isJobTitlePendingValidation ||
                          // Always require AI prompt with min/max length validation (for both generate and regenerate)
                          promptLength < VALIDATION.AI_PROMPT.min ||
                          promptLength > VALIDATION.AI_PROMPT.max ||
                          Boolean(aiPromptValidationError) ||
                          isGenerating ||
                          hasProceededToExtract
                        );
                      })()}
                      className="w-full"
                      icon={<Wand2 className="w-5 h-5" />}
                    >
                      {isGenerating ? (
                        <span className="animate-pulse">Generating with AI...</span>
                      ) : (generatedJD && !generatedJD.startsWith('[AI Prompt - Pending Generation]')) ? (
                        'Regenerate Job Description'
                      ) : (
                        'Generate Job Description'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Manual Input Mode */}
              {mode === 'manual' && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Job Details</h2>
                    {/* JD06: Autosave status indicator */}
                    <div className="flex items-center gap-2 text-sm">
                      {autosaveStatus === 'saving' && (
                        <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </span>
                      )}
                      {autosaveStatus === 'error' && (
                        <span className="flex items-center gap-1.5 text-destructive">
                          <CloudOff className="w-4 h-4" />
                          Save failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Job Title <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        maxLength={VALIDATION.JOB_TITLE.max}
                        placeholder="e.g., Registered Nurse, CNC Machinist, Senior Java Developer"
                        disabled={isJDInUse || isTitleLocked}
                        title={isTitleLocked && !isJDInUse ? titleLockedMessage : undefined}
                        className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black ${
                          isJDInUse || isTitleLocked
                            ? 'bg-gray-100 cursor-not-allowed'
                            : hasJobTitleValidationError
                              ? 'border-destructive-line bg-destructive-subtle'
                              : 'border-gray-200'
                        }`}
                      />
                      {isTitleLocked && !isJDInUse && (
                        <p className="mt-1 text-xs text-warning">
                          {titleLockedMessage || 'The job title cannot be changed because this job is already in use.'}
                        </p>
                      )}
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${hasJobTitleValidationError ? 'text-destructive' : isJobTitlePendingValidation ? 'text-gray-500' : getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length > 0 && jobTitleValidationError && jobTitleValidationError}
                          {jobTitle.length > 0 && !jobTitleValidationError && jobTitle.length < VALIDATION.JOB_TITLE.min && `Min ${VALIDATION.JOB_TITLE.min} characters required`}
                          {jobTitle.length >= VALIDATION.JOB_TITLE.min && !jobTitleValidationError && !jobTitleLengthInvalid && isJobTitlePendingValidation && 'Validating job title...'}
                        </p>
                        <p className={`text-xs ${hasJobTitleValidationError ? 'text-destructive' : isJobTitlePendingValidation ? 'text-gray-500' : getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length}/{VALIDATION.JOB_TITLE.max}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Job Description <span className="text-destructive">*</span>
                      </label>
                      <textarea
                        value={manualJD}
                        onChange={(e) => setManualJD(e.target.value)}
                        maxLength={VALIDATION.MANUAL_JD.max}
                        placeholder="Paste or write your job description here..."
                        rows={20}
                        className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black placeholder-gray-500 ${
                          manualJD.length > 0 && (!isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max) || !containsMeaningfulText(manualJD) || containsCodePatterns(manualJD) || !isEnglishOnly(manualJD))
                            ? 'border-destructive-line bg-destructive-subtle'
                            : 'border-gray-200'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${manualJD.length > 0 && ((isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max) && (!containsMeaningfulText(manualJD) || containsCodePatterns(manualJD) || !isEnglishOnly(manualJD))) || !isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max)) ? 'text-destructive' : getCharCountColor(manualJD.length, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max)}`}>
                          {manualJD.length > 0 && isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max) && !isEnglishOnly(manualJD)
                            ? 'Manual JD must be written in English only'
                            : manualJD.length > 0 && isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max) && containsCodePatterns(manualJD)
                            ? 'Manual JD must describe a job role, not contain source code or programming syntax'
                            : manualJD.length > 0 && isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max) && !containsMeaningfulText(manualJD)
                            ? 'JD must contain meaningful text, not just symbols or special characters'
                            : manualJD.length < VALIDATION.MANUAL_JD.min && manualJD.length > 0 && `Min ${VALIDATION.MANUAL_JD.min} characters required`}
                        </p>
                        <p className={`text-xs ${getCharCountColor(manualJD.length, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max)}`}>
                          {manualJD.length}/{VALIDATION.MANUAL_JD.max}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">
                    {mode === 'ai' ? 'Generated Job Description' : 'Job Description Preview'}
                  </h2>
                  {((mode === 'ai' && generatedJD) || (mode === 'manual' && manualJD)) && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const text = mode === 'ai' ? generatedJD : manualJD;
                          navigator.clipboard.writeText(text);
                          toast.success({ title: 'Copied!', description: 'Job description copied to clipboard' });
                        }}
                        className="px-2"
                        title="Copy to clipboard"
                        aria-label="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const text = mode === 'ai' ? generatedJD : manualJD;
                          const blob = new Blob([`${jobTitle}\n\n${text}`], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${jobTitle.replace(/[^a-z0-9]/gi, '_')}_JD.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast.success({ title: 'Downloaded!', description: 'Job description saved as text file' });
                        }}
                        className="px-2"
                        title="Download as text file"
                        aria-label="Download as text file"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {mode === 'ai' ? (
                  isStreaming ? (
                    // Show streaming content in real-time
                    <div className="relative">
                      <div className="h-[300px] sm:h-[400px] lg:h-[600px] overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 markdown-content">
                        {generatedJD ? (
                          <>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkBreaks]}
                              components={jdMarkdownComponents}
                            >
                              {getDisplayJDMarkdown(generatedJD, 'ai')}
                            </ReactMarkdown>
                            <div className="flex items-center gap-2 mt-4 text-blue-600 border-t pt-4">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm font-medium">Generating...</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                              <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-600 animate-spin" />
                              <p className="text-gray-600 dark:text-slate-400 font-medium">AI is generating your job description...</p>
                              <p className="text-sm text-gray-500 dark:text-slate-500 mt-2">This may take a few seconds</p>
                            </div>
                          </div>
                        )}
                      </div>
                      {streamError && (
                        <div className="flex items-center gap-2 p-3 mt-2 bg-destructive-subtle text-destructive rounded-md border border-destructive-line">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm">{streamError}</span>
                        </div>
                      )}
                    </div>
                  ) : generatedJD ? (
                    <div className="relative">
                      {/* Toggle Edit/View Button */}
                      <div className="absolute top-2 right-2 z-10">
                        <button
                          onClick={() => {
                            if (isJDInUse) {
                              toast.error({
                                title: 'Cannot Edit Job Description',
                                description: jdUsageMessage || 'This job description has been used in Resume Scoring, Assessments, or AI Talent Match and cannot be modified. Please create a new JD instead.'
                              });
                              return;
                            }
                            setIsEditingJD(!isEditingJD);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            isJDInUse
                              ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                              : isEditingJD
                                ? 'bg-brand-blue text-white hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                                : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                          }`}
                          title={isJDInUse ? 'This JD is in use and cannot be edited' : ''}
                        >
                          {isEditingJD ? (
                            <>
                              <Eye className="w-4 h-4" />
                              Preview
                            </>
                          ) : (
                            <>
                              <Pencil className="w-4 h-4" />
                              Edit
                            </>
                          )}
                        </button>
                      </div>

                      {isEditingJD ? (
                        <>
                          <textarea
                            value={generatedJD}
                            onChange={(e) => setGeneratedJD(e.target.value)}
                            readOnly={isJDInUse}
                            className={`w-full h-[300px] sm:h-[400px] lg:h-[600px] px-3 sm:px-4 py-2 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue font-mono text-sm text-black ${
                              generatedJD.length > 0 && !isEnglishOnly(generatedJD)
                                ? 'border-destructive-line bg-destructive-subtle'
                                : 'border-gray-200 dark:border-slate-700'
                            } ${isJDInUse ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed' : ''}`}
                          />
                          {generatedJD.length > 0 && !isEnglishOnly(generatedJD) && (
                            <p className="mt-1 text-xs text-destructive">
                              AI-generated JD must remain in English only before moving to the next step.
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="h-[300px] sm:h-[400px] lg:h-[600px] overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 markdown-content">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkBreaks]}
                            components={jdMarkdownComponents}
                          >
                            {getDisplayJDMarkdown(generatedJD, 'ai')}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] sm:h-[400px] lg:h-[600px] bg-gray-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-700">
                      <div className="text-center">
                        <FileText className="w-10 h-10 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-400 dark:text-slate-500" />
                        <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400 mb-2">No job description generated yet</p>
                        <p className="text-sm text-gray-500 dark:text-slate-500 px-4">
                          Fill in the job details and click &quot;Generate Job Description&quot;
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  manualJD ? (
                    <div className="h-[300px] sm:h-[400px] lg:h-[600px] overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 border border-gray-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={jdMarkdownComponents}
                      >
                        {getDisplayJDMarkdown(manualJD, 'manual')}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] sm:h-[400px] lg:h-[600px] bg-gray-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-700">
                      <div className="text-center">
                        <FileText className="w-10 h-10 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-400 dark:text-slate-500" />
                        <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400 mb-2">Start typing your job description</p>
                        <p className="text-sm text-gray-500 dark:text-slate-500 px-4">
                          Paste or write your JD in the left panel
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Navigation Buttons — full-width Next on a phone, as on Steps 2
                and 3, so the wizard's footer reads the same at every step. */}
            <div className="flex justify-end mt-4 sm:mt-6 [&>button]:w-full sm:[&>button]:w-auto">
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={
                  isStreaming ||
                  isExtracting ||
                  !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max) ||
                  Boolean(jobTitleValidationError) ||
                  isJobTitlePendingValidation ||
                  (mode === 'ai'
                    ? !generatedJD || !containsMeaningfulText(generatedJD) || !isEnglishOnly(generatedJD)
                    : !isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max) || !containsMeaningfulText(manualJD) || containsCodePatterns(manualJD) || !isEnglishOnly(manualJD))
                }
              >
                {isStreaming ? 'Generating...' : isExtracting ? 'Extracting...' : 'Next'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Extract & Modify Skills */}
        {step === 'extract' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Drag & Drop Tips */}
            {showDragTips && (
              <div className="bg-brand-orange/[0.08] border border-brand-orange/20 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 hidden sm:block">
                    <div className="w-8 h-8 rounded-lg bg-brand-orange shadow-sm shadow-brand-orange/25 ring-1 ring-white/10 flex items-center justify-center">
                      <Info className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h3 className="text-xs text-gray-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-brand-orange flex-shrink-0" />
                        Pro Tips
                      </h3>
                      <button
                        onClick={() => setShowDragTips(false)}
                        className="text-brand-blue hover:text-brand-blue-2 text-xs flex items-center gap-1 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                        Dismiss
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-xs text-gray-700 dark:text-slate-300">
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="w-3.5 h-3.5 mt-px text-brand-orange flex-shrink-0" />
                        <div>
                          <strong className="font-semibold">Drag & Drop:</strong> Hover over a skill and grab the grip icon to drag it between Must-Have and Nice-to-Have
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <Edit2 className="w-3.5 h-3.5 mt-px text-brand-orange flex-shrink-0" />
                        <div>
                          <strong className="font-semibold">Click to Edit:</strong> Click on any skill or comment text to edit it inline. Press Enter to save, Escape to cancel
                        </div>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <ArrowLeftRight className="w-3.5 h-3.5 mt-px text-brand-orange flex-shrink-0" />
                        <div>
                          <strong className="font-semibold">Arrow Buttons:</strong> Use arrow buttons to quickly move skills between categories
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Regeneration Notice - Removed Regenerate JD button as per requirement */}
            {extractedDataModified && mode === 'ai' && (
              <div className="bg-brand-blue/5 ring-1 ring-brand-blue/20 rounded-xl p-3 sm:p-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                    <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base text-brand-blue font-medium">Parameters Modified</h4>
                    <p className="text-sm text-gray-700 dark:text-slate-300">
                      You&apos;ve made changes to skills or comments. The JD will be regenerated when you continue to Review.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className={`${STEP2_CARD_CLASS} [&>*:last-child]:mb-0`}>
              {/* Laid out as `Step2SectionHeader` lays out the cards below -
                  icon tile beside a title-over-paragraph column, gap-3, mt-0.5,
                  then mb-4 sm:mb-5 to the content - with this card's own text
                  sizes and colours kept. */}
              <div className="flex items-start gap-3 mb-4 sm:mb-5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${STEP2_SECTION_TONES.blue.tile}`}>
                  <Sparkles className={`w-4 h-4 sm:w-5 sm:h-5 ${STEP2_SECTION_TONES.blue.icon}`} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Extracted Information</h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                    {isRegenerating
                      ? 'Processing... Fields are temporarily read-only.'
                      : 'AI has extracted the following information from your JD. You can modify, add, or remove items.'
                    }
                  </p>
                </div>
              </div>

              {/* Skills & Comments Section - Single Row with 3 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                {/* Column 1: Must-Have Skills */}
                <div data-step2-field="mustHaveSkills">
                  <div className="section-header-row">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Must-Have Skills <span className="text-destructive">*</span> ({extractedData.mustHaveSkills?.length || 0})</h3>
                    {!isRegenerating && (
                      <button
                        onClick={() => setEditingCategory('mustHave')}
                        className="btn-add"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    )}
                  </div>
                  {editingCategory === 'mustHave' && !isRegenerating && (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newSkill}
                        onChange={(e) => applyEnglishOnlyInputChange(e.target.value, 'Must-have skills', setNewSkill)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSkill('mustHaveSkills')}
                        placeholder="Enter skill..."
                        className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                        autoFocus
                      />
                      <Button
                        variant="primary"
                        onClick={() => handleAddSkill('mustHaveSkills')}
                      >
                        Add
                      </Button>
                      {/* Closes the input without adding: the app's icon-only
                          close button (secondary Button, tight padding, X) at the
                          Add button's size, with a tooltip. The typed text is
                          dropped; the list and any validation state are left as
                          they are. */}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setNewSkill('');
                          setEditingCategory(null);
                        }}
                        aria-label="Cancel"
                        title="Cancel"
                        className="px-2.5 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <DroppableSkillsContainer
                    category="mustHaveSkills"
                    onDrop={(item, at) => handleDropSkill(item, 'mustHaveSkills', at)}
                  >
                    {/* The required-skill error as the list's FIRST card: a skill
                        card's shape (rounded-lg, p-2.5, a 28px content row) in
                        the destructive tokens, message centred both ways. */}
                    {validationErrors.mustHaveSkills && (
                      <div
                        role="alert"
                        className="flex items-center justify-center p-2.5 rounded-lg border border-destructive-line bg-destructive-subtle"
                      >
                        <span className="flex items-center justify-center gap-1.5 min-h-7 text-sm text-destructive text-center">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          {validationErrors.mustHaveSkills}
                        </span>
                      </div>
                    )}
                    {/* Sliced from the front so each chip keeps its real index —
                        remove/edit/drag all address the array by position. */}
                    {(expandedSkillCategories.mustHaveSkills
                      ? extractedData.mustHaveSkills
                      : extractedData.mustHaveSkills.slice(0, SKILL_PREVIEW_LIMIT)
                    ).map((skill, index) => (
                      <DraggableSkill
                        key={index}
                        skill={skill}
                        index={index}
                        category="mustHaveSkills"
                        mergedInto={visibleTrailEntry(extractedData.mergeTrail?.find(
                          e => e.list === 'must_have_skills' && e.survivor === skill
                        ), onScreenWordings)}
                        onRestoreMerged={handlePromoteGroupedSkill}
                        onUseJdWording={handleUseJdWording}
                        onMove={handleMoveSkill}
                        onRemove={handleRemoveSkill}
                        onStartEdit={handleStartEditSkill}
                        isEditing={editingSkillIndex?.category === 'mustHaveSkills' && editingSkillIndex?.index === index}
                        editingValue={editingSkillValue}
                        onEditChange={(value) => applyEnglishOnlyInputChange(value, 'Must-have skills', setEditingSkillValue)}
                        onSaveEdit={handleSaveEditSkill}
                        onCancelEdit={handleCancelEditSkill}
                        readOnly={isRegenerating}
                      />
                    ))}
                  </DroppableSkillsContainer>
                  {extractedData.mustHaveSkills.length > SKILL_PREVIEW_LIMIT && (
                    <button
                      type="button"
                      onClick={() => toggleSkillCategory('mustHaveSkills')}
                      className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 rounded-lg hover:bg-brand-blue/10 transition-colors"
                    >
                      {expandedSkillCategories.mustHaveSkills
                        ? 'Show less'
                        : `+${extractedData.mustHaveSkills.length - SKILL_PREVIEW_LIMIT} skills${hiddenTrailLabel('mustHaveSkills')}`}
                    </button>
                  )}
                </div>

                {/* Column 2: Nice-to-Have Skills */}
                <div>
                  <div className="section-header-row">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Nice-to-Have Skills ({extractedData.niceToHaveSkills?.length || 0})</h3>
                    {!isRegenerating && (
                      <button
                        onClick={() => setEditingCategory('niceToHave')}
                        className="btn-add"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    )}
                  </div>
                  {editingCategory === 'niceToHave' && !isRegenerating && (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newSkill}
                        onChange={(e) => applyEnglishOnlyInputChange(e.target.value, 'Nice-to-have skills', setNewSkill)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSkill('niceToHaveSkills')}
                        placeholder="Enter skill..."
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                        autoFocus
                      />
                      <Button
                        variant="primary"
                        onClick={() => handleAddSkill('niceToHaveSkills')}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                  <DroppableSkillsContainer
                    category="niceToHaveSkills"
                    onDrop={(item, at) => handleDropSkill(item, 'niceToHaveSkills', at)}
                  >
                    {(expandedSkillCategories.niceToHaveSkills
                      ? extractedData.niceToHaveSkills
                      : extractedData.niceToHaveSkills.slice(0, SKILL_PREVIEW_LIMIT)
                    ).map((skill, index) => (
                      <DraggableSkill
                        key={index}
                        skill={skill}
                        index={index}
                        category="niceToHaveSkills"
                        mergedInto={visibleTrailEntry(extractedData.mergeTrail?.find(
                          e => e.list === 'nice_to_have_skills' && e.survivor === skill
                        ), onScreenWordings)}
                        onRestoreMerged={handlePromoteGroupedSkill}
                        onUseJdWording={handleUseJdWording}
                        onMove={handleMoveSkill}
                        onRemove={handleRemoveSkill}
                        onStartEdit={handleStartEditSkill}
                        isEditing={editingSkillIndex?.category === 'niceToHaveSkills' && editingSkillIndex?.index === index}
                        editingValue={editingSkillValue}
                        onEditChange={(value) => applyEnglishOnlyInputChange(value, 'Nice-to-have skills', setEditingSkillValue)}
                        onSaveEdit={handleSaveEditSkill}
                        onCancelEdit={handleCancelEditSkill}
                        readOnly={isRegenerating}
                      />
                    ))}
                  </DroppableSkillsContainer>
                  {extractedData.niceToHaveSkills.length > SKILL_PREVIEW_LIMIT && (
                    <button
                      type="button"
                      onClick={() => toggleSkillCategory('niceToHaveSkills')}
                      className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 rounded-lg hover:bg-brand-blue/10 transition-colors"
                    >
                      {expandedSkillCategories.niceToHaveSkills
                        ? 'Show less'
                        : `+${extractedData.niceToHaveSkills.length - SKILL_PREVIEW_LIMIT} skills${hiddenTrailLabel('niceToHaveSkills')}`}
                    </button>
                  )}
                </div>

                {/* Column 3: Comments (Split - Must-Have on top, Nice-to-Have below) */}
                <div className="space-y-6">
                  {/* Must-Have Comments */}
                  <div>
                    <div className="section-header-row">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Must-Have Additional Requirements ({extractedData.mustHaveComments?.length || 0})</h3>
                      {!isRegenerating && (
                        <button
                          onClick={() => setEditingCategory('comments')}
                          className="btn-add"
                        >
                          <Plus className="w-4 h-4" />
                          Add
                        </button>
                      )}
                    </div>
                    {editingCategory === 'comments' && !isRegenerating && (
                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          value={newComment}
                          onChange={(e) => applyEnglishOnlyInputChange(e.target.value, 'Must-have additional requirements', setNewComment)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                          placeholder="Enter additional requirement..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                          autoFocus
                        />
                        <Button
                          variant="primary"
                          onClick={handleAddComment}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                    <DroppableCommentsContainer
                      category="mustHaveComments"
                      onDrop={(item, at) => handleDropComment(item, 'mustHaveComments', at)}
                    >
                      {/* Sliced from the front so each item keeps its real index —
                          remove/edit/drag all address the array by position. */}
                      {(expandedSkillCategories.mustHaveComments
                        ? extractedData.mustHaveComments
                        : extractedData.mustHaveComments.slice(0, SKILL_PREVIEW_LIMIT)
                      ).map((comment, index) => (
                        <DraggableComment
                          key={index}
                          comment={comment}
                          index={index}
                          category="mustHaveComments"
                          mergedInto={visibleTrailEntry(extractedData.mergeTrail?.find(
                            e => e.list === 'must_have_comments' && e.survivor === comment
                          ), onScreenWordings)}
                          onRestoreMerged={handlePromoteGroupedSkill}
                          onMove={handleMoveComment}
                          onRemove={handleRemoveCommentByCategory}
                          onStartEdit={handleStartEditCommentByCategory}
                          isEditing={editingCommentIndex === index}
                          editingValue={editingCommentValue}
                          onEditChange={(value) => applyEnglishOnlyInputChange(value, 'Must-have additional requirements', setEditingCommentValue)}
                          onSaveEdit={handleSaveEditComment}
                          onCancelEdit={handleCancelEditComment}
                          readOnly={isRegenerating}
                        />
                      ))}
                    </DroppableCommentsContainer>
                    {extractedData.mustHaveComments.length > SKILL_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        onClick={() => toggleSkillCategory('mustHaveComments')}
                        className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 rounded-lg hover:bg-brand-blue/10 transition-colors"
                      >
                        {expandedSkillCategories.mustHaveComments
                          ? 'Show less'
                          : `+${extractedData.mustHaveComments.length - SKILL_PREVIEW_LIMIT} requirements${hiddenTrailLabel('mustHaveComments')}`}
                      </button>
                    )}
                    {validationErrors.mustHaveComments && (
                      <p className="text-destructive text-sm mt-2 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {validationErrors.mustHaveComments}
                      </p>
                    )}
                  </div>

                  {/* Nice-to-Have Comments */}
                  <div>
                    {(() => { console.log('[DEBUG] Rendering Nice-to-Have Comments, count:', extractedData.niceToHaveComments?.length, 'data:', extractedData.niceToHaveComments); return null; })()}
                    <div className="section-header-row">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Nice-to-Have Additional Requirements ({extractedData.niceToHaveComments?.length || 0})</h3>
                      {!isRegenerating && (
                        <button
                          onClick={() => setEditingCategory('nice-comments')}
                          className="btn-add"
                        >
                          <Plus className="w-4 h-4" />
                          Add
                        </button>
                      )}
                    </div>
                    {editingCategory === 'nice-comments' && !isRegenerating && (
                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          value={newComment}
                          onChange={(e) => applyEnglishOnlyInputChange(e.target.value, 'Nice-to-have additional requirements', setNewComment)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddNiceComment()}
                          placeholder="Enter nice-to-have additional requirement..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                          autoFocus
                        />
                        <Button
                          variant="primary"
                          onClick={handleAddNiceComment}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                    <DroppableCommentsContainer
                      category="niceToHaveComments"
                      onDrop={(item, at) => handleDropComment(item, 'niceToHaveComments', at)}
                    >
                      {(expandedSkillCategories.niceToHaveComments
                        ? (extractedData.niceToHaveComments || [])
                        : (extractedData.niceToHaveComments || []).slice(0, SKILL_PREVIEW_LIMIT)
                      ).map((comment, index) => (
                        <DraggableComment
                          key={index}
                          comment={comment}
                          index={index}
                          category="niceToHaveComments"
                          mergedInto={visibleTrailEntry(extractedData.mergeTrail?.find(
                            e => e.list === 'nice_to_have_comments' && e.survivor === comment
                          ), onScreenWordings)}
                          onRestoreMerged={handlePromoteGroupedSkill}
                          onMove={handleMoveComment}
                          onRemove={handleRemoveCommentByCategory}
                          onStartEdit={handleStartEditCommentByCategory}
                          isEditing={editingNiceCommentIndex === index}
                          editingValue={editingNiceCommentValue}
                          onEditChange={(value) => applyEnglishOnlyInputChange(value, 'Nice-to-have additional requirements', setEditingNiceCommentValue)}
                          onSaveEdit={handleSaveEditNiceComment}
                          onCancelEdit={handleCancelEditNiceComment}
                          readOnly={isRegenerating}
                        />
                      ))}
                    </DroppableCommentsContainer>
                    {(extractedData.niceToHaveComments || []).length > SKILL_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        onClick={() => toggleSkillCategory('niceToHaveComments')}
                        className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 rounded-lg hover:bg-brand-blue/10 transition-colors"
                      >
                        {expandedSkillCategories.niceToHaveComments
                          ? 'Show less'
                          : `+${(extractedData.niceToHaveComments || []).length - SKILL_PREVIEW_LIMIT} requirements${hiddenTrailLabel('niceToHaveComments')}`}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* POSSIBLY MISSED. JD phrases that ended up in no list. Every other Step 2
                  note hangs off an item that survived extraction; a requirement that did
                  not survive had nothing to hang off, so it was the one loss the tree could
                  never show - "server-side application development" simply was not there,
                  and nothing said so. Sits directly under the four lists (MHS, NHS, MHAR,
                  NHAR) - its Add menu files a phrase into one of them, so it reads as
                  their follow-up. */}
              {(() => {
                // A phrase the recruiter has since ADDED is not missing any more - but
                // the entry stays in the trail, so deleting that skill brings the flag
                // back. Only "Dismiss" removes it for good.
                const missed = (extractedData.mergeTrail || []).filter(
                  e => e.source === 'possibly-missed'
                    && !onScreenWordings.has(String(e.removed?.[0] || '').trim().toLowerCase()),
                );
                if (missed.length === 0) return null;
                // One entry per JD line, holding every phrase that came from it.
                const bySource = new Map<string, typeof missed>();
                for (const e of missed) {
                  const src = e.removed_sources?.[0] || '';
                  bySource.set(src, [...(bySource.get(src) || []), e]);
                }
                const groups = [...bySource.entries()];
                const shownGroups = showAllMissed ? groups : groups.slice(0, MISSED_SOURCE_PREVIEW);
                return (
                  <div className="mb-6 rounded-lg border border-warning-line bg-warning-subtle/60 p-3 sm:p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">
                          Possibly missed from the JD ({missed.length})
                        </p>
                        <p className="text-xs text-gray-600 dark:text-slate-400">
                          These phrases appear in the JD&apos;s requirements but are not in any list above. Add the ones that matter for this role.
                        </p>
                      </div>
                    </div>
                    {/* GROUPED BY THE JD LINE THEY CAME FROM.
                        One bullet can yield several phrases, and a flat list repeated
                        that same quotation under every one of them - five identical
                        "From the JD: Experience in Defect Management, including..." lines
                        in a row, each followed by three text links. The quotation is the
                        longest thing on the row and the only thing they had in common, so
                        it is now said once per source and the phrases sit under it as
                        chips. */}
                    <div className="space-y-3 pl-6">
                      {shownGroups.map(([source, items]) => (
                        <div key={source || items[0].removed[0]}>
                          {source && (
                            <p className="text-2xs text-gray-500 dark:text-slate-500 italic mb-1 break-words">
                              From the JD: &ldquo;{source}&rdquo;
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((e) => {
                              const phrase = e.removed[0];
                              const suggestNice = e.list === 'nice_to_have_skills';
                              const primary: MissedTarget = suggestNice ? 'niceToHaveSkills' : 'mustHaveSkills';
                              return (
                                <span
                                  key={phrase}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-warning-line bg-white dark:bg-slate-900 pl-2.5 pr-1 py-1"
                                >
                                  <span className="text-sm text-gray-800 dark:text-slate-200">
                                    {sentenceCaseForList(phrase, 'must_have_skills')}
                                  </span>
                                  {!isRegenerating && (
                                    <>
                                      {/* ONE menu, all four lists. Two buttons could only
                                          reach the two skills lists, and these phrases are
                                          as often requirement sentences as skill names -
                                          "Team Player: Ability to work collaboratively
                                          within a team environment" belongs in Additional
                                          Requirements, and there was no way to put it
                                          there without retyping it. */}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            aria-label={`Add "${phrase}" to a list`}
                                            title="Choose where this belongs"
                                            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-medium text-brand-blue hover:bg-brand-blue/10"
                                          >
                                            <Plus className="w-3 h-3" />
                                            Add
                                            <ChevronDown className="w-3 h-3" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="w-64">
                                          {MISSED_TARGETS.map(t => (
                                            <DropdownMenuItem
                                              key={t.category}
                                              onClick={() => handleResolvePossiblyMissed(phrase, t.category)}
                                              className="text-xs"
                                            >
                                              <span className={MENU_ITEM_SCALE_CLASS}>{t.label}</span>
                                              {/* The JD said where it read this - under a
                                                  "preferred" heading or not - so the
                                                  likely list is marked rather than
                                                  chosen for the recruiter. */}
                                              {t.category === primary && (
                                                <span className="ml-auto pl-2 text-2xs text-gray-400">suggested</span>
                                              )}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                      <button
                                        type="button"
                                        onClick={() => handleResolvePossiblyMissed(phrase, null)}
                                        aria-label="Dismiss"
                                        title="Not needed for this role"
                                        className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {groups.length > MISSED_SOURCE_PREVIEW && (
                      <button
                        type="button"
                        onClick={() => setShowAllMissed(v => !v)}
                        className="ml-6 mt-2 text-2xs font-medium text-brand-blue hover:underline"
                      >
                        {showAllMissed
                          ? 'Show fewer'
                          : `Show all ${groups.length} JD lines`}
                      </button>
                    )}
                  </div>
                );
              })()}

            </div>

            {/* ROLE REQUIREMENTS - Experience and Industry side by side (two
                columns now that Education is gone, rather than a three-column
                grid with an empty third), then Salary, then the Allow
                Overqualified choice that reads the Experience range. */}
            <div className={STEP2_CARD_CLASS}>
              <Step2SectionHeader
                icon={Briefcase}
                tone="success"
                title="Role Requirements"
                hint="Experience, industry, and compensation for this role."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Experience */}
                <div data-step2-field="experience" className={STEP2_PANEL_CLASS}>
                  <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Experience <span className="text-destructive">*</span></h3>
                    <label className={`flex shrink-0 items-center gap-1.5 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(extractedData.experienceRequired)}
                        onChange={(e) => {
                          // TICKING it on a contradictory JD is the one case that asks
                          // first. Unticking never does - going back to Preferred cannot
                          // reject anyone - and neither does a JD with no contradiction.
                          if (e.target.checked && experienceContradiction) {
                            setShowExperienceContradictionDialog(true);
                            return;
                          }
                          setExtractedData(prev => ({ ...prev, experienceRequired: e.target.checked }));
                          markExtractedDataModified();
                        }}
                        className="w-4 h-4 text-brand-blue border-gray-300 rounded focus:ring-brand-blue/40"
                        disabled={isRegenerating}
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">Required field</span>
                    </label>
                  </div>

                  {/* The decision extraction made, said out loud.
                      Reported 2026-09-21: a JD asking for 2-4 years that also welcomed
                      freshers had Required left unticked - correctly - but nothing on
                      screen said so, so it read as the system ignoring the JD. */}
                  {experienceContradiction && !extractedData.experienceRequired && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                      <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                        This JD asks for experience <strong>and</strong> welcomes freshers, so experience is
                        left <strong>Preferred</strong> - it still scores, but it will not reject the freshers
                        the JD invited. Tick <strong>Required field</strong> only if the minimum is strict.
                      </p>
                    </div>
                  )}

                  {/* The tick is ALREADY on, and the contradiction is live.
                      The dialog above only guards the moment of ticking, which does
                      nothing for a JD that carries the tick from before this rule existed
                      - like the reported JD-422, published with Required on and a line
                      saying internship experience counts towards the requirement. Those
                      are the JDs actively rejecting the people they invite, so they get
                      the louder message, not silence. */}
                  {experienceContradiction && extractedData.experienceRequired && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-500" />
                      <p className="text-xs leading-relaxed text-red-900 dark:text-red-200">
                        Experience is <strong>Required</strong>, but this JD also says people without that
                        experience may apply - so they will score <strong>No Match</strong> on the very
                        requirement it invited them under. Untick <strong>Required field</strong>, or edit
                        the JD text so it no longer invites them.
                      </p>
                    </div>
                  )}
                  {/* NUMBERS-FIRST: recruiter enters the actual From/To years. The
                      value is stored as a canonical "From-To Years" string on
                      extractedData.experience; persistence parses it back into
                      experience_min/experience_max and derives job_level. */}
                  {(() => {
                    const canonical = parseExperienceYearsString(extractedData.experience);
                    // While the recruiter is typing, show exactly what they typed - never
                    // the re-ordered canonical form (see experienceDraft above).
                    const from = experienceDraft ? experienceDraft.from : canonical.from;
                    const to = experienceDraft ? experienceDraft.to : canonical.to;
                    // Tolerant parse. Number('3+') is NaN, which made
                    // buildExperienceYearsString treat the bound as ABSENT and return an
                    // empty string - so a recruiter who entered "3+" in From (a natural way
                    // to write an open-ended minimum) was told "Experience is required"
                    // while the box still showed their input. Strip anything that is not a
                    // digit or decimal point before converting; '' still means "not given",
                    // so a MIN-ONLY range stays valid and open-ended.
                    const toYears = (raw: string): number | null => {
                      const cleaned = (raw ?? '').replace(/[^0-9.]/g, '');
                      if (cleaned === '') return null;
                      const n = Number(cleaned);
                      return Number.isNaN(n) ? null : n;
                    };
                    const commitYears = (nextFrom: string, nextTo: string) => {
                      const fromYears = toYears(nextFrom);
                      const toYearsValue = toYears(nextTo);

                      // HARD CEILING. A career longer than MAX_EXPERIENCE_YEARS is not a
                      // real requirement, so the recruiter is TOLD rather than silently
                      // corrected - clamping 51 to 50 would look like their own input.
                      // The value is not stored, so an out-of-range figure can never reach
                      // the JD. The backend enforces the same ceiling for extracted values,
                      // where there is no one to show an error to.
                      const over = [fromYears, toYearsValue].find(
                        (v) => v !== null && v > MAX_EXPERIENCE_YEARS,
                      );
                      if (over !== undefined && over !== null) {
                        setValidationErrors(prev => ({
                          ...prev,
                          experience: `Experience cannot exceed ${MAX_EXPERIENCE_YEARS} years.`,
                        }));
                        return;
                      }

                      const canonical = buildExperienceYearsString(
                        fromYears,
                        toYearsValue
                      );
                      setShowCustomExperienceInput(false);
                      setExperienceYearsExplicit(nextFrom !== '' || nextTo !== '');
                      setExtractedData(prev => ({ ...prev, experience: canonical }));
                      markExtractedDataModified();
                      if (nextFrom !== '' || nextTo !== '') {
                        setValidationErrors(prev => ({ ...prev, experience: undefined }));
                      }
                    };
                    const inputClass = `w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black ${
                      validationErrors.experience ? 'border-destructive-line' : 'border-gray-200'
                    } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`;
                    return (
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step={0.5}
                          value={from}
                          onChange={(e) => {
                            // Track the keystrokes AND persist, but render from the draft so
                            // no reordering is visible mid-number.
                            setExperienceDraft({ from: e.target.value, to });
                            commitYears(e.target.value, to);
                          }}
                          onBlur={() => setExperienceDraft(null)}
                          placeholder="From (years)"
                          disabled={isRegenerating}
                          className={inputClass}
                        />
                        <span className="text-sm text-gray-500 dark:text-slate-400">to</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          step={0.5}
                          value={to}
                          onChange={(e) => {
                            setExperienceDraft({ from, to: e.target.value });
                            commitYears(from, e.target.value);
                          }}
                          // Dropping the draft on blur re-reads the canonical value, so the
                          // From/To ordering is normalized exactly once - when the recruiter
                          // has finished typing, not partway through a number.
                          onBlur={() => setExperienceDraft(null)}
                          placeholder="To (years)"
                          disabled={isRegenerating}
                          className={inputClass}
                        />
                        <span className="text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">years</span>
                      </div>
                    );
                  })()}
                  {validationErrors.experience && (
                    <p className="text-destructive text-sm mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.experience}
                    </p>
                  )}
                  {/* RS20: Job Hopping toggle. Defaults from Experience (>= 3 years ->
                      on) and re-defaults every time Experience changes; the recruiter
                      can override it here for this save only. */}
                  <label className={`flex items-center gap-1.5 mt-1 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.jobHoppingEnabled)}
                      onChange={(e) => {
                        setExtractedData(prev => ({ ...prev, jobHoppingEnabled: e.target.checked }));
                        markExtractedDataModified();
                      }}
                      className="w-4 h-4 text-brand-blue border-gray-300 rounded focus:ring-brand-blue/40"
                      disabled={isRegenerating}
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-300">
                      Evaluate Job Hopping
                    </span>
                  </label>
                </div>

                {/* Education field REMOVED 2026-08-20.
                    Education is no longer a separate Step 2 control. Extraction now
                    always places it in the Additional Requirements lists instead:
                      stated in the JD      -> Must-Have Additional Requirements
                      not stated (inferred) -> Nice-to-Have Additional Requirements
                    and never in the Skills lists. The structured education_degree /
                    education_requirements values are STILL produced by extraction and
                    still persisted - AI interview question generation and the interview
                    prompts read them - they are simply no longer edited here. See
                    _enforce_education_placement() in the backend. */}

                {/* Industry Type */}
                <div data-step2-field="industryType" className={STEP2_PANEL_CLASS}>
                  <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Industry Type <span className="text-destructive">*</span></h3>
                    <label className={`flex shrink-0 items-center gap-1.5 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(extractedData.industryTypeRequired)}
                        onChange={(e) => { setExtractedData(prev => ({ ...prev, industryTypeRequired: e.target.checked })); markExtractedDataModified(); }}
                        className="w-4 h-4 text-brand-blue border-gray-300 rounded focus:ring-brand-blue/40"
                        disabled={isRegenerating}
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">Required field</span>
                    </label>
                  </div>
                  <FilterSelect
                    value={extractedData.industryType}
                    onChange={(v) => {
                      setExtractedData(prev => ({ ...prev, industryType: v }));
                      markExtractedDataModified();
                      // Clear validation error when user makes a selection
                      if (v) {
                        setValidationErrors(prev => ({ ...prev, industryType: undefined }));
                      }
                    }}
                    ariaLabel="Industry type"
                    className={`${JD_FIELD_SELECT_CLASS} py-2.5 sm:py-2.5 mb-3 ${
                      validationErrors.industryType ? 'border-destructive-line dark:border-destructive-line' : ''
                    } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={masterDataLoading || isRegenerating}
                    options={[
                      { value: '', label: masterDataLoading ? 'Loading...' : 'Select industry type' },
                      ...industryTypes.map((type) => ({ value: type.code, label: type.label })),
                      /* A proposed industry has no master row yet, so the list cannot
                         offer it. Without this option the select would fall blank the
                         moment the recruiter presses Add. */
                      ...(extractedData.industryType === PENDING_INDUSTRY_VALUE
                        ? [{ value: PENDING_INDUSTRY_VALUE, label: `${extractedData.industrySuggestedName} (new)` }]
                        : []),
                    ]}
                  />
                  {validationErrors.industryType && (
                    <p className="text-destructive text-sm mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.industryType}
                    </p>
                  )}

                  {/* ── An industry the list does not carry yet ─────────────────────
                      Offered UNDER the field rather than written into it: adopting a
                      new industry is the recruiter's call, and Step 3 still checks the
                      name against the JD before it becomes real. Three states —
                      extraction's proposal (Add / Clear), the recruiter's own text box
                      (after Clear), and neither. */}
                  {extractedData.industrySuggestedName && !extractedData.industryIsCustom && (
                    <div className="mt-1 rounded-lg border border-brand-blue/30 bg-brand-blue/5 p-3">
                      <div className="flex items-start gap-2">
                        {/* Nudged to sit on the heading's first line, which is
                            text-base (24px line) from sm up. */}
                        <div className="min-w-0 flex-1">
                          {/* The Allow Overqualified Candidates card's heading
                              style, verbatim. */}
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">
                            New Industry Type Detected
                          </h3>
                          <p className="text-xs text-gray-600 dark:text-slate-400">
                            This JD looks like{' '}
                            <strong>{extractedData.industrySuggestedName}</strong>, which is
                            not on your list yet.
                          </p>
                          {extractedData.industrySuggestedReason && (
                            <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">
                              {extractedData.industrySuggestedReason}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleAddSuggestedIndustry}
                              disabled={isRegenerating}
                              className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Add this industry
                            </button>
                            <button
                              type="button"
                              onClick={handleClearSuggestedIndustry}
                              disabled={isRegenerating}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 transition-colors hover:border-brand-blue/30 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                            >
                              Clear and enter my own
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">
                            It is checked against the JD at the next step before it is added.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {extractedData.industryIsCustom && (
                    <div className="mt-1">
                      <label className="mb-1 block text-xs text-gray-600 dark:text-slate-400">
                        Industry not on the list — type it here
                      </label>
                      <input
                        type="text"
                        value={extractedData.industrySuggestedName || ''}
                        onChange={(e) => handleCustomIndustryChange(e.target.value)}
                        placeholder="e.g. Marine Logistics"
                        maxLength={60}
                        disabled={isRegenerating}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-black focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/40 disabled:cursor-not-allowed disabled:bg-gray-100"
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleCancelCustomIndustry}
                          disabled={isRegenerating}
                          className="text-xs text-gray-500 underline-offset-2 hover:text-brand-blue hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400"
                        >
                          Pick from the list instead
                        </button>
                        <span className="text-xs text-gray-500 dark:text-slate-500">
                          Checked against the JD at the next step.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* No proposal, and extraction was not confident about the code it
                      did pick. Say so, rather than letting a weak guess look decided. */}
                  {!extractedData.industrySuggestedName
                    && !extractedData.industryIsCustom
                    && extractedData.industryType
                    && typeof extractedData.industryConfidence === 'number'
                    && extractedData.industryConfidence < LOW_INDUSTRY_CONFIDENCE && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        This was a weak match for the JD — worth a look before you continue.
                      </span>
                    </p>
                  )}

                  {/* The list is finite and the JD may simply not be in it. Without this
                      the only way out was to pick a near-miss or leave the field empty. */}
                  {!extractedData.industryIsCustom && !extractedData.industrySuggestedName && (
                    <button
                      type="button"
                      onClick={handleClearSuggestedIndustry}
                      disabled={isRegenerating}
                      className="mt-1 text-xs text-gray-500 underline-offset-2 hover:text-brand-blue hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400"
                    >
                      My industry is not on this list
                    </button>
                  )}
                </div>
              </div>

              {/* Salary Range | Allow Overqualified Candidates - one row of two
                  equal columns from md up (each panel stretches to the row's
                  height), stacked below that. Halving the row also stops the
                  From / To inputs running the full card width. */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Salary */}
              <div data-step2-field="salaryRange" className={STEP2_PANEL_CLASS}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Salary Range</h3>
                  <div className="flex items-center gap-4">
                    <label className={`flex items-center gap-1.5 ${isRegenerating || isFetchingExchangeRate ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="salaryCurrency"
                        value="INR"
                        checked={extractedData.salaryCurrency === 'INR'}
                        onChange={() => handleSalaryCurrencyChange('INR')}
                        className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40"
                        disabled={isRegenerating || isFetchingExchangeRate}
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">INR (₹)</span>
                    </label>
                    <label className={`flex items-center gap-1.5 ${isRegenerating || isFetchingExchangeRate ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="salaryCurrency"
                        value="USD"
                        checked={extractedData.salaryCurrency === 'USD'}
                        onChange={() => handleSalaryCurrencyChange('USD')}
                        className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40"
                        disabled={isRegenerating || isFetchingExchangeRate}
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">USD ($)</span>
                    </label>
                    {isFetchingExchangeRate && (
                      <span className="text-xs text-gray-500 dark:text-slate-400">Converting…</span>
                    )}
                  </div>
                </div>
                {/* Wraps instead of squeezing: in a half-width column the period
                    select drops to its own line before the inputs get cramped. */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="relative flex-1 min-w-[7.5rem]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{getSalaryCurrencySymbol(extractedData.salaryCurrency)}</span>
                      <input
                        type="text"
                        value={extractedData.salaryFrom || ''}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          // 8-DIGIT rule applies to the whole-currency part only. This
                          // counted every digit in the string, so with decimals now
                          // permitted a large rate with cents ("12345678.90" - 10 digits)
                          // was blocked mid-typing by a rule that is about magnitude.
                          if (newValue.split('.')[0].replace(/\D/g, '').length > 8) return;
                          setExtractedData(prev => ({
                            ...prev,
                            salaryFrom: newValue,
                            // Typing directly re-pins "original" to what's now on screen, in
                            // the currently displayed currency - see handleSalaryCurrencyChange.
                            salaryOriginalFrom: newValue,
                            salaryOriginalTo: prev.salaryTo,
                            salaryOriginalCurrency: prev.salaryCurrency,
                          }));
                          markExtractedDataModified();
                          const error = validateSalaryRange(newValue, extractedData.salaryTo || '');
                          setValidationErrors(prev => ({ ...prev, salaryRange: error }));
                        }}
                        // "Minimum"/"Maximum" rather than "From"/"To": with either box now
                        // allowed to stand alone (JD-21), the placeholder is what tells the
                        // recruiter which end they are stating, and which box the figure
                        // lands in decides whether it reads "50,000+" or "Up to 50,000".
                        placeholder="Minimum (e.g., 50000)"
                        className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black ${
                          validationErrors.salaryRange ? 'border-destructive-line' : 'border-gray-200'
                        } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        disabled={isRegenerating}
                        readOnly={isRegenerating}
                      />
                    </div>
                    <span className="text-gray-400 dark:text-slate-500 hidden sm:block">–</span>
                    <div className="relative flex-1 min-w-[7.5rem]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{getSalaryCurrencySymbol(extractedData.salaryCurrency)}</span>
                      <input
                        type="text"
                        value={extractedData.salaryTo || ''}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          // 8-DIGIT rule applies to the whole-currency part only. This
                          // counted every digit in the string, so with decimals now
                          // permitted a large rate with cents ("12345678.90" - 10 digits)
                          // was blocked mid-typing by a rule that is about magnitude.
                          if (newValue.split('.')[0].replace(/\D/g, '').length > 8) return;
                          setExtractedData(prev => ({
                            ...prev,
                            salaryTo: newValue,
                            // Typing directly re-pins "original" to what's now on screen, in
                            // the currently displayed currency - see handleSalaryCurrencyChange.
                            salaryOriginalFrom: prev.salaryFrom,
                            salaryOriginalTo: newValue,
                            salaryOriginalCurrency: prev.salaryCurrency,
                          }));
                          markExtractedDataModified();
                          const error = validateSalaryRange(extractedData.salaryFrom || '', newValue);
                          setValidationErrors(prev => ({ ...prev, salaryRange: error }));
                        }}
                        placeholder="Maximum (e.g., 100000)"
                        className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black ${
                          validationErrors.salaryRange ? 'border-destructive-line' : 'border-gray-200'
                        } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        disabled={isRegenerating}
                        readOnly={isRegenerating}
                      />
                    </div>
                    <FilterSelect
                      value={extractedData.compensationType}
                      onChange={(v) => { setExtractedData(prev => ({ ...prev, compensationType: v as 'hourly' | 'daily' | 'monthly' | 'yearly' })); markExtractedDataModified(); }}
                      ariaLabel="Compensation type"
                      className={`px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      disabled={isRegenerating}
                      options={[
                        { value: 'hourly', label: 'Hourly' },
                        { value: 'daily', label: 'Daily' },
                        { value: 'monthly', label: 'Monthly' },
                        { value: 'yearly', label: 'Yearly' },
                      ]}
                    />
                  </div>
                  {validationErrors.salaryRange && (
                    <p className="text-destructive text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {validationErrors.salaryRange}
                    </p>
                  )}
                  {exchangeRateError && (
                    <p className="text-destructive text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {exchangeRateError}
                    </p>
                  )}
                </div>

              {/* Allow Overqualified Candidates - REQUIRED choice, not a default-off
                  toggle. Scoring reads this (evaluate_experience_level in
                  odoo_scoring.py) so an unanswered field is not a safe silent default
                  in either direction - the recruiter must pick Yes or No before
                  leaving Step 2 (enforced in getValidationStatus/handlePublish). */}
              <div data-step2-field="allowOverqualified" className={`min-w-0 p-3 sm:p-4 rounded-lg border ${
                validationErrors.allowOverqualified
                  ? 'bg-destructive-subtle border-destructive-line'
                  : 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700'
              }`}>
                {/* Title and description, then the no-ceiling helper, then
                    Yes / No: one column, so the helper is read before the
                    choice it explains. */}
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">
                      Allow Overqualified Candidates <span className="text-destructive">*</span>
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-slate-400">
                      Should candidates with more experience than the maximum for this role be scored favorably (Yes), or treated as a mismatch (No)? With No, any experience above the To value fails the Experience criterion.
                    </p>
                  </div>
                  {/* The app's Tip box — the colours, Lightbulb and bold lead-in
                      of the Tip in the Resume Scoring popup's candidate panel
                      (`SelectedCandidatesPanel`): brand-orange tint and border,
                      brand-orange icon, gray-700 text. */}
                  {!experienceHasCeiling && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-brand-orange/[0.08] border border-brand-orange/20 px-3 py-2.5">
                      <Lightbulb className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
                      <p className="min-w-0 flex-1 text-sm text-gray-700 dark:text-slate-300">
                        <span className="font-semibold">Set to Yes:</span> the experience requirement has no upper limit, so there is no range to exceed. Enter a To (maximum) years value above to choose No.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2" role="radiogroup" aria-label="Allow Overqualified Candidates">
                    {([
                      { label: 'Yes', value: true },
                      { label: 'No', value: false },
                    ] as const).map((opt) => {
                      const isSelected = extractedData.allowOverqualified === opt.value;
                      // "No" needs a ceiling to exceed - locked (and Yes forced, see
                      // experienceHasCeiling) until the recruiter enters a To value.
                      const lockedNo = opt.value === false && !experienceHasCeiling;
                      const isDisabled = isRegenerating || lockedNo;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-disabled={isDisabled}
                          disabled={isDisabled}
                          title={lockedNo ? 'Enter a To (maximum) years value to allow choosing No' : undefined}
                          onClick={() => {
                            if (isDisabled) return;
                            setExtractedData(prev => ({ ...prev, allowOverqualified: opt.value }));
                            setValidationErrors(prev => ({ ...prev, allowOverqualified: undefined }));
                            markExtractedDataModified();
                          }}
                          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-brand-blue text-white border-brand-blue'
                              : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700 hover:border-brand-blue/40'
                          } ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {validationErrors.allowOverqualified && (
                  <p className="text-destructive text-sm mt-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {validationErrors.allowOverqualified}
                  </p>
                )}
              </div>
              </div>
              </div>

              {/* LOCATION & WORK SETUP - Locations, then Employment Type and
                  Work Mode under a divider, in one card. */}
              <div className={STEP2_CARD_CLASS}>
                <Step2SectionHeader
                  icon={MapPin}
                  tone="cyan"
                  title="Location & Work Setup"
                  hint="Where the role is based and how it is worked."
                />
                <div data-step2-field="locations" className="flex flex-wrap items-center gap-3 mb-4">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Locations <span className="text-destructive">*</span></h3>
                  <label className={`flex shrink-0 items-center gap-1.5 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={extractedData.locationsRequired}
                      onChange={(e) => { setExtractedData(prev => ({ ...prev, locationsRequired: e.target.checked })); markExtractedDataModified(); }}
                      className="w-4 h-4 text-brand-blue border-gray-300 rounded focus:ring-brand-blue/40"
                      disabled={isRegenerating}
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Required field</span>
                  </label>
                </div>

                {/* Inline Add Location - Country, State, City, Radius in one line - Hidden when read-only */}
                {!isRegenerating && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:gap-3 mb-4">
                  {/* Country Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1">Country</label>
                    <FilterSelect
                      value={locationCountry}
                      onChange={(v) => {
                        setLocationCountry(v as 'IN' | 'US');
                        setLocationStateFilter('all');
                        setNewLocation(prev => ({ ...prev, city: '' }));
                      }}
                      ariaLabel="Country"
                      className={JD_FIELD_SELECT_CLASS}
                      options={[
                        { value: 'IN', label: 'India' },
                        { value: 'US', label: 'United States' },
                      ]}
                    />
                  </div>

                  {/* State Filter Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1">State</label>
                    <FilterSelect
                      value={locationStateFilter}
                      onChange={(v) => {
                        setLocationStateFilter(v);
                        setNewLocation(prev => ({ ...prev, city: '' }));
                      }}
                      ariaLabel="State"
                      className={JD_FIELD_SELECT_CLASS}
                      options={[
                        { value: 'all', label: 'All States' },
                        ...(locationCountry === 'US' ? usStates.map((st) => ({ value: st.name, label: st.name })) : []),
                        ...(locationCountry === 'IN' ? IN_LOCATION_STATE_OPTIONS : []),
                      ]}
                    />
                  </div>

                  {/* City Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1">City</label>
                    <FilterSelect
                      value={newLocation.city}
                      onChange={(v) => setNewLocation(prev => ({ ...prev, city: v }))}
                      ariaLabel="City"
                      className={JD_FIELD_SELECT_CLASS}
                      options={[
                        { value: '', label: 'Select a city' },
                        ...(locationCountry === 'US'
                          ? (() => {
                              const selectedUsState = locationStateFilter === 'all'
                                ? null
                                : usStates.find((st) => st.name === locationStateFilter);
                              const statesToShow = selectedUsState ? [selectedUsState] : usStates;
                              return statesToShow.flatMap((st) =>
                                (usCitiesByState[st.isoCode] || []).map((city) => ({ value: `${city}, ${st.name}`, label: city, group: st.name })),
                              );
                            })()
                          : []),
                        ...(locationCountry === 'IN'
                          ? IN_LOCATION_CITY_GROUPS
                              .filter((g) => locationStateFilter === 'all' || locationStateFilter === g.state)
                              .flatMap((g) => g.options.map((o) => ({ ...o, group: g.state })))
                              // Delhi NCR repeats cities its states also list; keep one entry per value.
                              .filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i)
                          : []),
                      ]}
                    />
                  </div>

                  {/* Radius Dropdown */}
                  <div className="w-full sm:w-28">
                    <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1">Radius</label>
                    <FilterSelect
                      value={newLocation.radius}
                      onChange={(v) => setNewLocation(prev => ({ ...prev, radius: v }))}
                      ariaLabel="Radius"
                      className={JD_FIELD_SELECT_CLASS}
                      options={['10', '25', '50', '75', '100', '150', '200'].map((r) => ({ value: r, label: `${r} km` }))}
                    />
                  </div>

                  {/* Add Button */}
                  <Button
                    variant="primary"
                    onClick={handleAddLocation}
                    className="whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </Button>
                </div>
                )}
                {validationErrors.locations && (
                  <p className="text-destructive text-sm -mt-2 mb-3 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {validationErrors.locations}
                  </p>
                )}

                {/* Added Locations Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {extractedData.locations.map((location, index) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900 dark:text-slate-50">{location.city}</div>
                          <div className="text-xs text-gray-600 dark:text-slate-400">{location.radius} km radius</div>
                        </div>
                        {!isRegenerating && (
                          <button
                            onClick={() => handleRemoveLocation(index)}
                            className="text-destructive hover:text-destructive ml-2"
                           aria-label="Close">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

              {/* Employment Type & Work Model - under a divider in the Location &
                  Work Setup card, in the Country / State format: the same small
                  label, the same select box, and a quarter-width column on
                  desktop (two columns on tablet, stacked on a phone), so the
                  pair lines up with the location fields above. */}
              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-100 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                {/* Employment Type */}
                <div className="min-w-0">
                  <label htmlFor="jd-employment-type" className="block text-sm text-gray-700 dark:text-slate-300 mb-1">Employment Type</label>
                  <FilterSelect
                    id="jd-employment-type"
                    value={extractedData.employmentType}
                    onChange={(v) => { setExtractedData(prev => ({
                      ...prev,
                      employmentType: v as ExtractedData['employmentType']
                    })); markExtractedDataModified(); }}
                    className={`${JD_FIELD_SELECT_CLASS} ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={isRegenerating}
                    options={[
                      { value: 'full_time', label: 'Full Time' },
                      { value: 'part_time', label: 'Part Time' },
                      { value: 'contract', label: 'Contract' },
                      { value: 'internship', label: 'Internship' },
                      { value: 'temporary', label: 'Temporary / Seasonal' },
                    ]}
                  />
                </div>

                {/* Work Model */}
                <div className="min-w-0">
                  <label htmlFor="jd-work-mode" className="block text-sm text-gray-700 dark:text-slate-300 mb-1">Work Mode</label>
                  <FilterSelect
                    id="jd-work-mode"
                    value={extractedData.workModel}
                    onChange={(v) => { setExtractedData(prev => ({
                      ...prev,
                      workModel: v as ExtractedData['workModel']
                    })); markExtractedDataModified(); }}
                    className={`${JD_FIELD_SELECT_CLASS} ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={isRegenerating}
                    options={[
                      { value: 'onsite', label: 'Onsite' },
                      { value: 'remote', label: 'Remote' },
                      { value: 'hybrid', label: 'Hybrid' },
                      { value: 'field_based', label: 'Field-based / Travel' },
                    ]}
                  />
                </div>
              </div>
              </div>

              {/* Certifications & Domain Keywords - HIDDEN as per requirement */}
              {/*
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Certifications</h3>
                    {!isRegenerating && (
                      <button
                        onClick={() => setEditingCategory('certifications')}
                        className="text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    )}
                  </div>
                  {editingCategory === 'certifications' && !isRegenerating && (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newCertification}
                        onChange={(e) => setNewCertification(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCertification()}
                        placeholder="e.g., ISO 9001 Lead Auditor, PMP, AWS Solutions Architect"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                        autoFocus
                      />
                      <Button
                        variant="primary"
                        onClick={handleAddCertification}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {extractedData.certifications.map((cert, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg ${isRegenerating ? 'opacity-60' : ''}`}
                      >
                        <span className="text-sm text-gray-900">{cert}</span>
                        {!isRegenerating && (
                          <button
                            onClick={() => handleRemoveCertification(index)}
                            className="text-destructive hover:text-destructive ml-2"
                           aria-label="Close">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {extractedData.certifications.length === 0 && (
                      <p className="text-sm text-gray-500 italic py-4 text-center">
                        No certifications added yet
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Domain Keywords</h3>
                    {!isRegenerating && (
                      <button
                        onClick={() => setEditingCategory('domainKeywords')}
                        className="text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    )}
                  </div>
                  {editingCategory === 'domainKeywords' && !isRegenerating && (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newDomainKeyword}
                        onChange={(e) => setNewDomainKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddDomainKeyword()}
                        placeholder="e.g., Cold Chain, Retail Ops, Banking, Cloud"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                        autoFocus
                      />
                      <Button
                        variant="primary"
                        onClick={handleAddDomainKeyword}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {extractedData.domainKeywords.map((keyword, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg ${isRegenerating ? 'opacity-60' : ''}`}
                      >
                        <span className="text-sm text-gray-900">{keyword}</span>
                        {!isRegenerating && (
                          <button
                            onClick={() => handleRemoveDomainKeyword(index)}
                            className="text-destructive hover:text-destructive ml-2"
                           aria-label="Close">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {extractedData.domainKeywords.length === 0 && (
                      <p className="text-sm text-gray-500 italic py-4 text-center">
                        No domain keywords added yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
              */}

              {/* The "Requires a hands-on coding assessment" control and its Programming
                  Languages editor were removed from JD creation on request. codingRequired is
                  now forced OFF at both extraction sites below (search codingRequired), so the
                  jd_analyzer.validate_for_assessment() rule
                    coding_required && no supported_languages -> assessment creation blocked
                  can never trigger. Without that, hiding the control would have recreated the
                  Issue #7 dead end: an LLM misfire on a non-software role with no way to undo
                  it. To restore this feature, re-add the block AND drop the two `false &&`
                  overrides at the extraction sites. */}

              {/* NOTES & VISIBILITY - who sees each note is the thing that
                  separates them, so each sits in its own panel with its
                  visibility badge on the heading row. */}
              <div className={STEP2_CARD_CLASS}>
              <Step2SectionHeader
                icon={NotebookPen}
                tone="orange"
                title="Notes & Visibility"
                hint="Guidance for assessments, private notes, and details for candidates."
              />
              {/* Assessment Guidance & Internal Recruiter Notes - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Assessment Guidance - Left */}
                <div className={STEP2_PANEL_CLASS}>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Assessment Guidance</h3>
                    <span className="text-xs text-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">Optional</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    Visible to assessment team
                  </p>
                  <textarea
                    value={extractedData.assessmentGuidance}
                    onChange={(e) => {
                      const nextValue = e.target.value.slice(0, 500);
                      applyEnglishOnlyInputChange(nextValue, 'Assessment guidance', () => {
                        setExtractedData(prev => ({ ...prev, assessmentGuidance: nextValue }));
                        markExtractedDataModified();
                      });
                    }}
                    placeholder="e.g., Focus on safety compliance, hands-on judgement, problem-solving approach..."
                    className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black resize-none ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    rows={4}
                    disabled={isRegenerating}
                    readOnly={isRegenerating}
                  />
                  <div className="text-right text-xs text-gray-500 dark:text-slate-500 mt-1">{extractedData.assessmentGuidance?.length || 0}/500</div>
                </div>

                {/* Internal Recruiter Notes - Right */}
                <div className={STEP2_PANEL_CLASS}>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Internal Recruiter Notes</h3>
                    <span className={PRIVATE_BADGE_CLASS}>
                      <Lock className="w-3 h-3 flex-shrink-0" />
                      Private
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
                    Private notes for team use only. Not visible to candidates or used in scoring/assessments.
                  </p>
                  <textarea
                    value={extractedData.internalRecruiterComments.join('\n')}
                    onChange={(e) => {
                      // Capped at 500 like Assessment Guidance beside it.
                      const nextValue = e.target.value.slice(0, 500);
                      applyEnglishOnlyInputChange(nextValue, 'Internal recruiter notes', () => {
                        setExtractedData(prev => ({
                          ...prev,
                          internalRecruiterComments: nextValue.split('\n').filter(c => c.trim())
                        }));
                        markExtractedDataModified();
                      });
                    }}
                    placeholder="Add internal notes for recruiters..."
                    className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black resize-none ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    rows={4}
                    disabled={isRegenerating}
                    readOnly={isRegenerating}
                  />
                  <div className="text-right text-xs text-gray-500 dark:text-slate-500 mt-1">{extractedData.internalRecruiterComments.join('\n').length}/500</div>
                </div>
              </div>

              {/* JD22 - Additional Details. Last field in Step 2 on purpose: it is the
                  catch-all for whatever extraction did not pick up, so the recruiter
                  reaches it after reviewing everything that WAS extracted.

                  Full width rather than sharing the grid above, because the content is
                  prose the candidate reads (shift timings, WFO/WFH arrangements) and a
                  half-width box invites one-word answers.

                  The "not used for scoring" line is not decoration - it is the contract.
                  Assessment Guidance above it DOES steer the assessment and Internal
                  Notes are hidden entirely, so without saying which of the three this is,
                  a recruiter has no way to know whether writing "prefers night shift"
                  here will quietly affect a candidate's score. It will not: the field
                  travels as its own column and no scoring, assessment or interview input
                  ever reads it. */}
              <div className={`mt-4 ${STEP2_PANEL_CLASS}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Additional Details</h3>
                  <span className="text-xs text-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">Optional</span>
                  <span className={CANDIDATE_VISIBLE_BADGE_CLASS}>
                    <Eye className="w-3 h-3 flex-shrink-0" />
                    Visible to candidates
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
                  Extra information about this job for the candidate — shift timings, work from
                  office / work from home, or anything else the extraction missed. This is
                  <span className="font-medium text-gray-700 dark:text-slate-300"> information only</span>: it is
                  not used in resume scoring, AI assessment, or the AI interview.
                </p>
                <textarea
                  value={extractedData.additionalDetails}
                  onChange={(e) => {
                    const nextValue = e.target.value.slice(0, 2000);
                    applyEnglishOnlyInputChange(nextValue, 'Additional details', () => {
                      setExtractedData(prev => ({ ...prev, additionalDetails: nextValue }));
                      markExtractedDataModified();
                    });
                  }}
                  placeholder="e.g., Shift timings 2 PM - 11 PM IST. Work from office 3 days a week, remaining days work from home. Cab facility provided for night shifts."
                  className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black resize-none ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  rows={4}
                  disabled={isRegenerating}
                  readOnly={isRegenerating}
                />
                <div className="text-right text-xs text-gray-500 dark:text-slate-500 mt-1">{extractedData.additionalDetails?.length || 0}/2000</div>
              </div>
              </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center mt-6 sm:mt-8 gap-3 sm:gap-0">
              <div className="flex gap-2 sm:gap-3 [&>button]:w-full sm:[&>button]:w-auto">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    setStep('create');
                    setHasProceededToExtract(false);  // Re-enable regenerate button when going back

                    // Persist the stage reversion immediately - the debounced (2s) JD06
                    // autosave effect also does this, but a refresh that lands before the
                    // debounce fires would otherwise reload the JD at 'extract' (the stage
                    // Next saved to the server) instead of 'create'.
                    if (editingId) {
                      try {
                        await jdService.update(editingId, { creation_stage: 'create' });
                        ensureJDCreationUrl(editingId, 'create');
                      } catch (error) {
                        console.error('[TalentFlow] Failed to save create stage on Back:', error);
                      }
                    }
                  }}
                  icon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
              </div>
              <Button
                variant="primary"
                onClick={handlePublish}
                disabled={isRegenerating}
                title={!validationStatus.isValid ? `Missing: ${validationStatus.missingFields.join(', ')}` : ''}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Formatting with AI...
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Displayed Step 3: Review. The internal stage is 'review' for both
            this and the success screen below — `isPublished` is what separates
            them, and what the indicator reads as Step 3 vs Step 4. */}
        {step === 'review' && !isPublished && (
          <div className="space-y-4 sm:space-y-6">
                {/* Header - Step 2's section card and heading row, so Review
                    reads as the same workspace. */}
                <div className={STEP2_CARD_CLASS}>
                  <Step2SectionHeader
                    icon={ClipboardCheck}
                    tone="blue"
                    spacing="mb-0"
                    title={isEditingPublished ? 'Review & Republish' : 'Review & Publish'}
                    hint={isEditingPublished
                      ? 'Review all details before republishing. This will create a new version of the published JD.'
                      : 'Review all details before publishing. Once published, this JD will be locked and available to all authorized users.'}
                  />
                </div>

            {/* Final JD Document View */}
            <div className={STEP2_CARD_CLASS}>
              <Step2SectionHeader
                icon={FileText}
                tone="cyan"
                title="Final Job Description"
                hint="This is the job description that will be published"
                badge={mode === 'ai' ? (
                  /* JD12: AI-Generated indicator */
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                    <Wand2 className="w-3 h-3" />
                    AI Generated
                  </span>
                ) : undefined}
                actions={
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const text = mode === 'ai' ? generatedJD : manualJD;
                        navigator.clipboard.writeText(text);
                        toast.success({ title: 'Copied!', description: 'Job description copied to clipboard' });
                      }}
                      className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-sm text-black"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Copy
                    </button>
                    <button
                      /* Opens the format picker; nothing downloads until a
                         format is chosen there. */
                      onClick={() => setShowDownloadFormatDialog(true)}
                      aria-haspopup="dialog"
                      className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-sm text-black"
                    >
                      <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Download
                    </button>
                  </div>
                }
              />
              {/* Document frame from sm only — on a phone a second bordered,
                  padded box inside the card squeezed the JD text column. */}
              <div className="min-w-0 sm:rounded-lg sm:border sm:border-gray-100 sm:dark:border-slate-700/60 sm:p-6 lg:p-8">
                <div className="prose prose-sm max-w-none">
                  {/* Job Title & Quick Info */}
                  <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-gray-200 dark:border-slate-700">
                    {/* JD ID · job name · version on ONE row, drawn exactly as
                        the Job Openings list draws it (`JobOpeningSummary`):
                        the shared JobIdBadge, the job name in its typography,
                        and its dotted version pill, gap-2 apart. The name wraps
                        within itself rather than clipping, so a long title
                        never pushes the version off a narrow screen. */}
                    <div className="not-prose flex flex-wrap items-center gap-2 mb-2 sm:mb-3">
                      {effectiveEditingJD?.job_id && (
                        <JobIdBadge className="flex-shrink-0">{effectiveEditingJD.job_id}</JobIdBadge>
                      )}
                      <h1 className="m-0 min-w-0 text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 [overflow-wrap:anywhere]">
                        {jobTitle}
                      </h1>
                      {reviewVersionNumber != null && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5 flex-shrink-0 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                          v{reviewVersionNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-slate-400">
                      {groupLocationsByState(extractedData.locations).map(group => (
                        <span key={group.state} className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-gray-500 dark:text-slate-400 flex-shrink-0" />
                          {group.state !== 'Other' ? `${group.state}: ${group.cities.join(', ')}` : group.cities.join(', ')}
                        </span>
                      ))}
                      {extractedData.experience && (
                        <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-gray-500 dark:text-slate-400 flex-shrink-0" />{getExperienceLabel(extractedData.experience)}</span>
                      )}
                      {/* Education badge REMOVED 2026-08-21 - it is a requirement line
                          in Must-Have / Nice-to-Have Additional Requirements, not a
                          header attribute like location or employment type. */}
                      {extractedData.employmentType && (
                        <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-gray-500 dark:text-slate-400 flex-shrink-0" />{extractedData.employmentType === 'full_time' ? 'Full Time' : extractedData.employmentType === 'part_time' ? 'Part Time' : extractedData.employmentType === 'contract' ? 'Contract' : extractedData.employmentType}</span>
                      )}
                      {extractedData.workModel && (
                        <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-gray-500 dark:text-slate-400 flex-shrink-0" />{extractedData.workModel === 'onsite' ? 'On-site' : extractedData.workModel === 'remote' ? 'Remote' : extractedData.workModel === 'hybrid' ? 'Hybrid' : extractedData.workModel}</span>
                      )}
                    </div>
                    {(extractedData.salaryFrom || extractedData.salaryTo) && (
                      <div className="mt-3 text-sm text-success font-medium flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 flex-shrink-0" />
                        {formatSalaryRange({
                          min: extractedData.salaryFrom,
                          max: extractedData.salaryTo,
                          currency: extractedData.salaryCurrency,
                        })} / {extractedData.compensationType}
                      </div>
                    )}
                  </div>

                  {/* JD Content */}
                  <div className="markdown-content text-gray-700 dark:text-slate-300 leading-relaxed">
                    {(() => { console.log('[DEBUG] Review stage showing JD, mode:', mode, 'length:', (mode === 'ai' ? generatedJD : manualJD)?.length); return null; })()}
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={jdMarkdownComponents}
                    >
                      {getDisplayJDMarkdown(mode === 'ai' ? generatedJD : manualJD, mode)}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

            {/* JD22 - Additional Details, shown unconditionally (not tucked inside the
                collapsed Extracted Data Summary below) so text typed on Step 2 is visibly
                reflected here the moment Review loads, matching the always-visible card
                the published JD view (JobDetailView) shows for the same field. */}
            {extractedData.additionalDetails && (
              <div className="min-w-0 rounded-lg border border-gray-100 dark:border-slate-700/60 p-4 sm:p-6 mt-4 sm:mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-slate-50">Additional Details</h3>
                  <span className={CANDIDATE_VISIBLE_BADGE_CLASS}>
                    <Eye className="w-3 h-3 flex-shrink-0" />
                    Visible to candidates
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-400 whitespace-pre-wrap [overflow-wrap:anywhere]">{extractedData.additionalDetails}</p>
              </div>
            )}

            {/* Extracted Data Summary Preview - Collapsible. The shared summary
                card (components/jobs/ExtractedDataSummary): the whole heading
                row is the toggle, the sections sit under dividers. This step is
                the reference every other surface's summary follows. */}
            <ExtractedSummaryCard
              open={showExtractedSummary}
              onToggle={() => setShowExtractedSummary(!showExtractedSummary)}
              aiExtracted={mode === 'ai'}
            >
              {/* A read-only mirror of Step 2: every field the Skill Extraction
                  step shows, read from the same `extractedData`, grouped under
                  Step 2's own section names and icons. A field with no value says
                  so instead of disappearing, so the preview is complete. */}
              {(() => {
                const fieldLabel = SUMMARY_FIELD_LABEL;
                const fieldValue = SUMMARY_FIELD_VALUE;
                const emptyValue = SUMMARY_EMPTY_VALUE;
                const tile = SUMMARY_TILE;
                const requiredLine = (required?: boolean) => (
                  <p className="text-xs text-gray-500 dark:text-slate-500 mt-1 flex items-center gap-1">
                    {required
                      ? <><CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />Required</>
                      : <><Circle className="w-3.5 h-3.5 flex-shrink-0" />Preferred</>}
                  </p>
                );
                const sectionHeading = (Icon: typeof Info, tone: keyof typeof STEP2_SECTION_TONES, title: string) => (
                  <SummarySectionHeading
                    icon={Icon}
                    tone={tone}
                    title={title}
                    actions={
                      <button
                        onClick={() => setStep('extract')}
                        className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                    }
                  />
                );
                const itemList = (items: string[], emptyMessage: string) => (
                  <SummaryItemList items={items} emptyMessage={emptyMessage} />
                );
                const salaryText = formatSalaryRange({
                  min: extractedData.salaryFrom,
                  max: extractedData.salaryTo,
                  currency: extractedData.salaryCurrency,
                });
                const mustHaveComments = extractedData.mustHaveComments || [];
                const niceToHaveComments = extractedData.niceToHaveComments || [];
                return (
                  <>
              {/* Job Title */}
              <div className="py-4 sm:py-5">
                <h3 className="text-sm text-gray-500 dark:text-slate-500 mb-2">Job Title</h3>
                <p className="text-base sm:text-xl text-gray-900 dark:text-slate-50 [overflow-wrap:anywhere]">{jobTitle}</p>
              </div>

              {/* Skills & Requirements - Step 2's four lists */}
              <div className="py-4 sm:py-5">
                {sectionHeading(Sparkles, 'blue', 'Skills & Requirements')}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  <div className="min-w-0">
                    <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Must-Have Skills ({extractedData.mustHaveSkills.length})</h4>
                    {itemList(extractedData.mustHaveSkills, 'None added')}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Nice-to-Have Skills ({extractedData.niceToHaveSkills.length})</h4>
                    {itemList(extractedData.niceToHaveSkills, 'None added')}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Must-Have Additional Requirements ({mustHaveComments.length})</h4>
                    {itemList(mustHaveComments, 'None added')}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Nice-to-Have Additional Requirements ({niceToHaveComments.length})</h4>
                    {itemList(niceToHaveComments, 'None added')}
                  </div>
                </div>
              </div>

              {/* Role Requirements - Experience, Industry, Salary, Overqualified */}
              <div className="py-4 sm:py-5">
                {sectionHeading(Briefcase, 'success', 'Role Requirements')}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className={tile}>
                    <h4 className={fieldLabel}>Experience</h4>
                    {extractedData.experience
                      ? <p className={fieldValue}>{getExperienceLabel(extractedData.experience)}</p>
                      : <p className={emptyValue}>Not specified</p>}
                    {requiredLine(extractedData.experienceRequired)}
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      Evaluate Job Hopping: {extractedData.jobHoppingEnabled ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className={tile}>
                    <h4 className={fieldLabel}>Industry Type</h4>
                    {extractedData.industryType
                      ? <p className={fieldValue}>{getIndustryLabel(extractedData.industryType)}</p>
                      : <p className={emptyValue}>Not specified</p>}
                    {requiredLine(extractedData.industryTypeRequired)}
                  </div>
                  <div className={tile}>
                    <h4 className={fieldLabel}>Salary Range</h4>
                    {salaryText ? (
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className={fieldValue}>{salaryText}</span>
                        <span className="text-gray-600 dark:text-slate-400 text-sm">/ {extractedData.compensationType}</span>
                      </p>
                    ) : (
                      <p className={emptyValue}>Not specified</p>
                    )}
                  </div>
                  <div className={tile}>
                    <h4 className={fieldLabel}>Allow Overqualified Candidates</h4>
                    <SummaryYesNo value={!!extractedData.allowOverqualified} />
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      {extractedData.allowOverqualified
                        ? 'Accepting candidates who exceed requirements'
                        : 'Only accepting candidates within requirements'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Location & Work Setup - Locations, Employment Type, Work Mode */}
              <div className="py-4 sm:py-5">
                {sectionHeading(MapPin, 'cyan', 'Location & Work Setup')}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className={`${tile} sm:col-span-2`}>
                    <h4 className={fieldLabel}>Locations ({extractedData.locations.length})</h4>
                    {extractedData.locations.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {extractedData.locations.map((loc, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-sm text-gray-800 dark:text-slate-200"
                          >
                            <MapPin className="w-3.5 h-3.5 text-brand-cyan flex-shrink-0" />
                            <span className="min-w-0 [overflow-wrap:anywhere]">{loc.city}</span>
                            <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">{loc.radius} km radius</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className={emptyValue}>No locations added</p>
                    )}
                    {requiredLine(extractedData.locationsRequired)}
                  </div>
                  <div className={tile}>
                    <h4 className={fieldLabel}>Employment Type</h4>
                    <p className={fieldValue}>
                      {extractedData.employmentType === 'full_time' ? 'Full Time' :
                       extractedData.employmentType === 'part_time' ? 'Part Time' :
                       extractedData.employmentType === 'contract' ? 'Contract' :
                       extractedData.employmentType === 'internship' ? 'Internship' :
                       extractedData.employmentType === 'temporary' ? 'Temporary / Seasonal' : 'Not specified'}
                    </p>
                  </div>
                  <div className={tile}>
                    <h4 className={fieldLabel}>Work Mode</h4>
                    <p className={fieldValue}>
                      {extractedData.workModel === 'onsite' ? 'Onsite' :
                       extractedData.workModel === 'remote' ? 'Remote' :
                       extractedData.workModel === 'hybrid' ? 'Hybrid' :
                       extractedData.workModel === 'field_based' ? 'Field-based / Travel' : 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes & Visibility - each with Step 2's visibility marker */}
              <div className="pt-4 sm:pt-5">
                {sectionHeading(NotebookPen, 'orange', 'Notes & Visibility')}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div className={tile}>
                    <h4 className={`${fieldLabel} flex flex-wrap items-center gap-2`}>
                      Assessment Guidance
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-normal text-gray-600 dark:text-slate-400">
                        <Users className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                        Visible to assessment team
                      </span>
                    </h4>
                    {extractedData.assessmentGuidance
                      ? <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap [overflow-wrap:anywhere]">{extractedData.assessmentGuidance}</p>
                      : <p className={emptyValue}>No assessment guidance provided</p>}
                  </div>
                  <div className={tile}>
                    <h4 className={`${fieldLabel} flex flex-wrap items-center gap-2`}>
                      Internal Recruiter Notes
                      <span className={PRIVATE_BADGE_CLASS}>
                        <Lock className="w-3 h-3 flex-shrink-0" />
                        Private
                      </span>
                    </h4>
                    {extractedData.internalRecruiterComments.length > 0 ? (
                      <div className="space-y-2">
                        {extractedData.internalRecruiterComments.map((comment, index) => (
                          <div key={index} className="bg-warning-subtle p-2.5 sm:p-3 rounded-lg text-sm text-gray-700 dark:text-slate-300 border border-warning-line [overflow-wrap:anywhere]">
                            {comment}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={emptyValue}>No internal notes</p>
                    )}
                  </div>
                  <div className={`${tile} md:col-span-2`}>
                    <h4 className={`${fieldLabel} flex flex-wrap items-center gap-2`}>
                      Additional Details
                      <span className={CANDIDATE_VISIBLE_BADGE_CLASS}>
                        <Eye className="w-3 h-3 flex-shrink-0" />
                        Visible to candidates
                      </span>
                    </h4>
                    {extractedData.additionalDetails
                      ? <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap [overflow-wrap:anywhere]">{extractedData.additionalDetails}</p>
                      : <p className={emptyValue}>No additional details provided</p>}
                  </div>
                </div>
              </div>
                  </>
                );
              })()}
            </ExtractedSummaryCard>

            {/* DOWNLOAD FORMAT - the house dialog (overlay, panel, slate header
                with tile, title and close) around three option rows in the
                export dialogs' row style. Each format keeps the icon colour it
                already has in the app's export menus: Text the neutral file,
                DOCX brand blue, PDF destructive red. Picking one downloads and
                closes; the overlay and X close without downloading. */}
            {showDownloadFormatDialog && (
              <div
                className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6"
                onClick={() => setShowDownloadFormatDialog(false)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="jd-download-format-title"
                  className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-sm overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                        <Download className="w-5 h-5 text-brand-blue" />
                      </div>
                      <div className="min-w-0">
                        <h2 id="jd-download-format-title" className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Download Job Description</h2>
                        <p className="text-sm text-gray-600 dark:text-slate-400">Choose a file format</p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => setShowDownloadFormatDialog(false)}
                      aria-label="Close"
                      className="px-2 flex-shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="p-4 sm:p-5 space-y-2.5">
                    {/* The upload modal's folded-corner format icon (FileFormatIcon),
                        as it is - DOCX its Word chip in blue, PDF in its own red,
                        Text in the neutral gray the app's plain-text exports use. */}
                    {([
                      { format: 'txt', label: 'Text', icon: <FileFormatIcon color="var(--raw-6b7280)" accent="var(--raw-9ca3af)" label="TXT" className="h-7 w-7" /> },
                      { format: 'docx', label: 'DOCX', icon: <FileFormatIcon color="var(--raw-2563eb)" accent="var(--raw-93c5fd)" label="W" className="h-7 w-7" /> },
                      { format: 'pdf', label: 'PDF', icon: <FileFormatIcon color="var(--raw-dc2626)" accent="var(--raw-f87171)" label="PDF" className="h-7 w-7" /> },
                    ] as const).map(option => (
                      <button
                        key={option.format}
                        type="button"
                        onClick={() => {
                          setShowDownloadFormatDialog(false);
                          void downloadReviewJD(option.format);
                        }}
                        className="w-full flex items-center gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 transition-all text-left"
                      >
                        {option.icon}
                        <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 order-2 sm:order-1">
                <Button
                  variant="secondary"
                  onClick={() => setStep('extract')}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                {/* JD12: Save as Draft button */}
                <Button
                  variant="secondary"
                  onClick={() => handleSaveDraft()}
                  disabled={isSavingDraft || isJDInUse || nothingToSave}
                  title={isJDInUse ? 'This JD is in use and cannot be modified' : nothingToSave ? 'No changes to save' : ''}
                >
                  {isSavingDraft ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4" />
                      Save as Draft
                    </>
                  )}
                </Button>
              </div>
              <div className="flex gap-2 sm:gap-3 order-1 sm:order-2 [&>button]:w-full sm:[&>button]:w-auto">
                <Button
                  variant="primary"
                  onClick={handleConfirmPublish}
                  disabled={isPublishing || !validationStatus.isValid || isJDInUse}
                  title={isJDInUse ? 'This JD is in use and cannot be modified' : !validationStatus.isValid ? `Complete all required fields to ${isEditingPublished ? 'republish' : 'publish'}` : ''}
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isEditingPublished ? 'Republishing...' : 'Publishing...'}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {isEditingPublished ? 'Confirm & Republish' : 'Confirm & Publish'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Displayed Step 4: Publish — the published success state. */}
        {step === 'review' && isPublished && (
          <div className="py-4 sm:py-6 text-center">
            {/* The published tick, animated. It replaces the whole tinted disc
                rather than sitting inside it: the animation brings its own
                circle and throws particles past its edge, so the old ring would
                have drawn a hard line straight through the burst. */}
            <div className="flex justify-center mb-4 sm:mb-5">
              <SuccessAnimation />
            </div>
            {/* Laid out as Assessment Published and AI Interview Published are:
                headline, the one-line card naming what was published (the
                shared PublishedSummaryCard — JD ID badge, job name, job
                version), then the compact row of ways on from here. */}
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight mb-4 sm:mb-5">{publishedVersion && publishedVersion > 1 ? 'Job Description Republished!' : 'Job Description Published!'}</h2>

            <PublishedSummaryCard
              /* Capped at 48rem AND the column: `sm:max-w-3xl` alone let a long
                 job name push it past a 768px tablet's 704px content box. */
              className="mx-auto mb-5 sm:mb-6 w-fit max-w-[min(100%,48rem)]"
              icon={<Briefcase className="w-5 h-5 text-brand-blue" />}
              jobId={publishedJobCode}
              jobName={jobTitle}
              jobVersion={publishedVersionNumber}
            />

            <PublishedActions>
              {publishedJdId && (
                <Button
                  variant="secondary"
                  onClick={() => router.push(viewPublishedJdUrl)}
                  icon={<Eye className="w-4 h-4" />}
                >
                  View JD
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => router.push(createAnotherJdUrl)}
                icon={<Plus className="w-4 h-4" />}
              >
                Create New JD
              </Button>
              <Button
                variant="primary"
                onClick={onBack}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                {backDestinationLabel}
              </Button>
            </PublishedActions>
          </div>
        )}
        </div>
        </div>
      </div>

      {/* Leave prompt — Cancel / Discard current changes / Delete this entire JD,
          raised by any link, breadcrumb or browser Back while needsLeavePrompt(). */}
      <LeaveJDDialog
        open={showUnsavedDialog}
        jobCode={leaveJobCode}
        versionNumber={leaveCheckpointMeta?.versionNumber ?? effectiveEditingJD?.version_number ?? 1}
        jobTitle={jobTitle.trim() || undefined}
        discardTarget={leaveCheckpointMeta?.label ?? null}
        nothingSavedYet={!editingId || isUnsavedNewCopy}
        deleteBlockedReason={leaveDeleteBlockedReason}
        hideDelete={leaveCheckpointMeta?.isFreshFork === true || isNewCreationLeave}
        isPublishedJD={leaveIsPublishedJD}
        currentStepLabel={step === 'create' ? 'Step 1 (Create)' : step === 'extract' ? 'Step 2 (Extract)' : 'Step 3 (Review)'}
        busy={leaveBusy}
        onCancel={handleCancelDialog}
        onSave={handleLeaveSave}
        onDiscard={handleLeaveDiscard}
        onDelete={handleLeaveDelete}
      />

      {/* Industry gate — Step 3's answer about an industry the master list does not
          carry. Two questions can come back: "you already have this" (duplicate) and
          "this does not match the JD, or is not an industry" (contradiction). Both are
          put to the recruiter, who decides; neither blocks. Same contract as the
          experience dialog below it. */}
      <Dialog
        open={industryGate !== null}
        onOpenChange={(open) => !open && !isResolvingIndustryGate && setIndustryGate(null)}
      >
        <DialogContent className="p-4 sm:p-6 gap-3 sm:gap-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              {industryGate?.outcome === 'duplicate'
                ? 'You already have this industry'
                : 'This industry may not fit the JD'}
            </DialogTitle>
            <DialogDescription className="text-sm space-y-2">
              <span className="block">
                You proposed <strong>{extractedData.industrySuggestedName}</strong>.
              </span>
              {industryGate?.message && (
                <span className="block">{industryGate.message}</span>
              )}
              {industryGate?.outcome === 'duplicate' && industryGate.industry_label && (
                <span className="block">
                  Using <strong>{industryGate.industry_label}</strong> keeps this JD alongside
                  the others already filed there; adding a second name for the same
                  industry splits them.
                </span>
              )}
              {industryGate?.outcome === 'contradiction' && industryGate.industry_label && (
                <span className="block">
                  From the JD text, <strong>{industryGate.industry_label}</strong> looks like
                  the closer fit.
                </span>
              )}
              {industryGate?.outcome === 'contradiction' && !industryGate.industry_label && (
                <span className="block">
                  You can go back and change it, or add it anyway if you are sure.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIndustryGate(null)}
              disabled={isResolvingIndustryGate}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Go back and change it
            </button>
            {industryGate?.industry_type && industryGate.industry_label && (
              <button
                type="button"
                onClick={handleIndustryGateUseExisting}
                disabled={isResolvingIndustryGate}
                className="px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90 transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use {industryGate.industry_label}
              </button>
            )}
            <button
              type="button"
              onClick={() => { void handleIndustryGateInsist(); }}
              disabled={isResolvingIndustryGate}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-amber-300 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResolvingIndustryGate ? 'Adding…' : 'Add mine anyway'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Experience contradiction — ticking "Required field" on a JD that invites freshers
          ------------------------------------------------------------------------------
          Reported 2026-09-21. The JD said "2-4 years of experience ... but we also welcome
          freshers with relevant internship experience". Extraction correctly refused to mark
          experience Required - Required means Essential, and an Essential rating below 6 is
          an automatic No Match, so every fresher the JD invited would be rejected by the
          sentence that invited them - but it did so SILENTLY, which read as the JD being
          ignored.

          The recruiter still gets the final say: this asks, it does not block. What it will
          not do is let the tick happen without saying what it costs. */}
      <Dialog
        open={showExperienceContradictionDialog}
        onOpenChange={(open) => !open && setShowExperienceContradictionDialog(false)}
      >
        <DialogContent className="p-4 sm:p-6 gap-3 sm:gap-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              This JD also welcomes freshers
            </DialogTitle>
            <DialogDescription className="text-sm space-y-2">
              <span className="block">
                The JD text asks for experience and, in the same breath, invites freshers with
                internship experience to apply.
              </span>
              <span className="block">
                Making experience <strong>Required</strong> turns it into an <strong>Essential</strong>{' '}
                criterion in Resume Scoring: any candidate rated below 6 on experience is a{' '}
                <strong>No Match</strong> outright - so the freshers this JD invites will be
                rejected by it.
              </span>
              <span className="block">
                If the minimum really is strict, continue: the line inviting them will be removed
                from the JD text, so the posting stops promising what the scoring no longer allows.
                Otherwise leave it Preferred - experience still scores, it just cannot reject them
                on its own.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setShowExperienceContradictionDialog(false)}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm"
            >
              Keep it Preferred
            </button>
            <button
              onClick={async () => {
                setExtractedData(prev => ({ ...prev, experienceRequired: true }));
                markExtractedDataModified();
                setShowExperienceContradictionDialog(false);

                /* The tick alone would leave the JD contradicting itself - reported
                   2026-09-21: Required was applied and Step 3 still read "but we also
                   welcome freshers with relevant internship experience". Experience is
                   now Essential, so that sentence invites people the scorer will mark
                   No Match; it goes with the tick.

                   Server-side and deterministic: the same rule that raised the warning
                   decides what comes out, so nothing else in the recruiter's wording is
                   touched. A failure here is not fatal - the tick still stands, and the
                   text stays editable in the next step.

                   Mode-aware read AND write - reported again same day: the fix landed in
                   `generatedJD` unconditionally, but Step 3's preview and Save/Publish
                   both read `mode === 'ai' ? generatedJD : manualJD` (every other call site
                   in this file does the same split). A Manual-mode JD's real text lives in
                   `manualJD`, so the strip call ran, returned the cleaned text, and it went
                   into a variable nothing displays or saves - the contradiction silently
                   came back at Save. */
                const source = (mode === 'ai' ? generatedJD : manualJD) || effectiveEditingJD?.description || '';
                if (!source) return;
                try {
                  const { description, removed } = await jdService.stripFresherInvitation(source);
                  if (removed.length) {
                    if (mode === 'ai') {
                      setGeneratedJD(description);
                    } else {
                      setManualJD(description);
                    }
                    setHasUnsavedChanges(true);
                    toast.success(
                      removed.length === 1
                        ? 'Removed the line inviting candidates without that experience'
                        : `Removed ${removed.length} lines inviting candidates without that experience`,
                    );
                  }
                } catch (error) {
                  console.error('[JDCreation] Failed to update the JD wording:', error);
                  toast.error('Experience is now Required, but the JD text could not be updated - please edit it in the next step');
                }
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-md shadow-amber-600/25 ring-1 ring-white/10 transition-colors text-sm"
            >
              Make it Required
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel JD Creation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={(open) => !open && setShowCancelDialog(false)}>
        <DialogContent className="p-4 sm:p-6 gap-3 sm:gap-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Cancel JD Creation?</DialogTitle>
            <DialogDescription className="text-sm">
              Are you sure you want to cancel? {editingId && (!isPreExistingDraft || hasUnsavedChanges) ? 'This will delete the current draft and all your progress will be lost.' : 'You will be taken back to the job openings list.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowCancelDialog(false)}
            >
              Continue Editing
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancelJD}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Yes, Cancel'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
