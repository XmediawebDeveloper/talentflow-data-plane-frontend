'use client';

import { Wand2, FileText, Copy, Download, Save, ChevronRight, Plus, X, Edit2, CheckCircle, CheckCircle2, ArrowLeft, GripVertical, Info, Eye, Pencil, AlertTriangle, AlertCircle, Cloud, CloudOff, Loader2, Briefcase } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDrag, useDrop } from 'react-dnd';
import { Job } from '@/lib/types/types';
import { toast } from '@/components/ui/enhanced-toast';
import { jdService, masterDataService, ExperienceLevel, EducationLevel, IndustryType } from '@/lib/services';
import { useQuotaCheck } from '@/lib/hooks/useQuotaCheck';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { normalizeManualJDToMarkdown, stripEmptyCertificationSections } from '@/lib/utils/jdMarkdown';
import { formatSalaryRange, getSalaryCurrencySymbol, normalizeSalaryCurrency } from '@/lib/utils/salary';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';

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
  if (current > max) return 'text-red-500';
  return 'text-green-600';
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
    <div className="table-responsive my-4">
      <table {...props} />
    </div>
  ),
};

const getDisplayJDMarkdown = (text: string, mode: CreationMode): string => {
  const normalized = mode === 'manual' ? normalizeManualJDToMarkdown(text) : text;
  return stripEmptyCertificationSections(normalized);
};

const containsCodePatterns = (text: string): boolean => {
  if (!text || !text.trim()) return false;

  const lowerText = text.toLowerCase();

  // Programming language names that are ALLOWED in job descriptions
  // These should NOT trigger the code validation
  const allowedProgrammingTerms = [
    'c#', 'c++', 'c ', ' c', // C family languages (with spaces to avoid false matches)
    'java', 'javascript', 'typescript',
    'python', 'ruby', 'php',
    'go', 'golang', 'rust', 'swift', 'kotlin',
    'scala', 'perl', 'r programming',
    '.net', 'dotnet', 'net', 'asp.net', 'asp', 'vb.net', // .NET variations
    'node.js', 'nodejs', 'node',
    'react', 'reactjs', 'angular', 'angularjs', 'vue', 'vuejs', 'svelte',
    'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'sqlite', 'oracle',
    'html', 'css', 'sass', 'scss', 'less',
    'spring boot', 'spring', 'django', 'flask', 'express', 'fastapi',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'gitlab', 'github',
    'redux', 'graphql', 'rest api', 'api', 'webpack', 'babel',
  ];

  // Create a sanitized version of text with allowed terms removed
  // This prevents programming language names from triggering false positives
  let sanitizedText = text;
  allowedProgrammingTerms.forEach(term => {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    sanitizedText = sanitizedText.replace(regex, ' ');
  });

  const sanitizedLowerText = sanitizedText.toLowerCase();

  // Only truly unique code tokens that never appear in plain English job descriptions
  const codeKeywords = [
    'printf', 'cout', 'println', 'console.log', 'print(',
    '__init__', 'self.', 'this.', '<?php', '#!/bin',
    'function(', '=>{', '=>{', '};', '});',
  ];

  // Check for programming keywords in sanitized text
  const hasCodeKeywords = codeKeywords.some(keyword => sanitizedLowerText.includes(keyword));

  // Code-like patterns
  const codePatterns = [
    /\bdef\s+\w+\s*\(/,           // Python function: def foo(
    /\bfunction\s+\w+\s*\(/,      // JS function: function foo(
    /\(\s*\w+\s*\)\s*[:=]>/,      // Arrow function: (param) => or (param) ->
    /\w+\s*\(\s*\w*\s*\)\s*\{/,   // Function with braces: foo() {
    /\breturn\s+[^;]+;/,          // Return statement with semicolon
    /\bimport\s+\w+\s+from/,      // ES6 import
    /\bimport\s+[\w.]+/,          // Python import
    /[{}\[\]]\s*[{}\[\]]/,        // Multiple consecutive brackets
    /[=!<>]{2,3}/,                // Comparison operators: ==, ===, !==, etc.
    /\w+\.\w+\s*\(/,              // Method calls: obj.method(
    /\bvar\b|\blet\b|\bconst\b/,  // Variable declarations
    /^\s*#include/m,              // C/C++ include
    /^\s*package\s+\w+/m,         // Java/Go package
    /\$\w+\s*=/,                  // PHP variables
    /f["'].*\{.*\}["']/,          // f-strings: f"text {var}"
  ];

  // Check for code patterns in sanitized text
  const hasCodePattern = codePatterns.some(pattern => pattern.test(sanitizedText));

  // Detect excessive use of special characters typical in code
  const specialChars = sanitizedText.match(/[(){}\[\];:<>]/g);
  const specialCharRatio = specialChars ? specialChars.length / sanitizedText.length : 0;
  const hasExcessiveSpecialChars = specialCharRatio > 0.15; // More than 15% special chars

  return hasCodeKeywords || hasCodePattern || hasExcessiveSpecialChars;
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
  mustHaveComments: 'Must-Have Comments',
  niceToHaveComments: 'Nice-to-Have Comments',
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
  const withoutParens = value.toLowerCase().replace(/\(.*?\)/g, ' ');
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
  industryType: string;
  industryTypeRequired: boolean;
  department: string;
  allowOverqualified: boolean;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary';
  workModel: 'onsite' | 'remote' | 'hybrid' | 'field_based';
  salaryFrom: string;
  salaryTo: string;
  compensationType: 'hourly' | 'daily' | 'monthly' | 'yearly';
  salaryCurrency: 'INR' | 'USD';
  locations: Array<{ city: string; radius: string; radiusKm?: number; isRequired?: boolean; country?: 'IN' | 'US' }>;
  locationsRequired: boolean;
  assessmentGuidance: string;
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
  current_version?: number;
  title: string;
  description: string;
  status?: 'draft' | 'published' | 'archived' | 'disabled';
  creation_stage: 'create' | 'extract' | 'review';
  creation_method?: 'manual' | 'ai_generated';
  ai_prompt?: string;  // Original AI prompt used to generate JD
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  education_requirements?: { degree?: string };
  experience_min?: number;
  experience_max?: number;
  industry_type?: string;
  department?: string;
  salary_min?: number;
  salary_max?: number;
  compensation_type?: string;
  employment_type?: string;
  remote_type?: string;
  assessment_guidance?: string;
  internal_comments?: string;
  must_have_comments?: string[];
  nice_to_have_comments?: string[];
  certifications?: string[];
  domain_keywords?: string[];
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
  breadcrumbItems?: BreadcrumbCrumb[];  // Optional breadcrumb shown above the header
  // FIX-003: Props for embedded mode in sheet/modal
  editingJDId?: string | null;  // JD ID to fetch and edit
  onClose?: () => void;  // Callback when closed
  onSuccess?: (jdId?: string) => void;  // Callback on successful create/update (with optional JD ID)
  isEmbedded?: boolean;  // Flag to indicate embedded mode
}

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
}

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
  readOnly = false
}: DraggableSkillProps) => {
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'SKILL',
    item: { skill, category, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const isMustHave = category === 'mustHaveSkills';
  const tickColor = isMustHave ? 'text-green-600' : 'text-sky-500';

  return (
    <div
      ref={dragPreview as unknown as React.Ref<HTMLDivElement>}
      className={`flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg group transition-opacity ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
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
              className="text-green-600 hover:text-green-700 px-2"
              aria-label="Save" title="Save"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={onCancelEdit}
              className="text-red-600 hover:text-red-700"
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
                className="cursor-move opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
                title="Drag to move"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            <CheckCircle className={`w-4 h-4 ${tickColor} flex-shrink-0`} />
            <span
              className={`text-sm text-gray-700 dark:text-slate-300 flex-1 ${readOnly ? '' : 'cursor-pointer hover:text-gray-900'}`}
              onClick={() => !readOnly && onStartEdit(category, index, skill)}
              title={readOnly ? '' : 'Click to edit'}
            >
              {skill}
            </span>
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
                className="text-xs text-gray-800 hover:text-gray-900 px-2"
                title={isMustHave ? 'Move to Nice-to-Have' : 'Convert to Must-Have'}
              >
                {isMustHave ? '→' : '←'}
              </button>
              <button
                onClick={() => onRemove(category, index)}
                className="text-red-600 hover:text-red-700"
                aria-label="Delete" title="Delete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface DroppableSkillsContainerProps {
  category: 'mustHaveSkills' | 'niceToHaveSkills';
  onDrop: (skill: string, fromCategory: 'mustHaveSkills' | 'niceToHaveSkills') => void;
  children: React.ReactNode;
}

const DroppableSkillsContainer = ({ category, onDrop, children }: DroppableSkillsContainerProps) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'SKILL',
    drop: (item: { skill: string; category: 'mustHaveSkills' | 'niceToHaveSkills' }) => {
      if (item.category !== category) {
        onDrop(item.skill, item.category);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  const isMustHave = category === 'mustHaveSkills';
  const isActive = isOver && canDrop;
  
  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      className={`space-y-2 min-h-[100px] p-3 rounded-lg border-2 border-dashed transition-all ${
        isActive
          ? isMustHave
            ? 'border-red-400 bg-red-50'
            : 'border-gray-400 bg-gray-50'
          : 'border-transparent'
      }`}
    >
      {children}
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
  readOnly = false
}: DraggableCommentProps) => {
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'COMMENT',
    item: { comment, category, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const isMustHave = category === 'mustHaveComments';
  const bgColor = isMustHave ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200';
  const iconColor = isMustHave ? 'text-orange-500' : 'text-blue-500';

  return (
    <div
      ref={dragPreview as unknown as React.Ref<HTMLDivElement>}
      className={`flex items-center justify-between p-2.5 ${bgColor} border rounded-lg group transition-opacity ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
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
              className="text-green-600 hover:text-green-700 px-2"
              aria-label="Save" title="Save"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={onCancelEdit}
              className="text-red-600 hover:text-red-700"
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
              className={`text-sm text-gray-900 dark:text-slate-50 flex-1 ${readOnly ? '' : 'cursor-pointer hover:text-gray-800'}`}
              onClick={() => !readOnly && onStartEdit(category, index, comment)}
              title={readOnly ? '' : 'Click to edit'}
            >
              {comment}
            </span>
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
                className="text-xs text-gray-800 hover:text-gray-900 px-2"
                title={isMustHave ? 'Move to Nice-to-Have' : 'Convert to Must-Have'}
              >
                {isMustHave ? '→' : '←'}
              </button>
              <button
                onClick={() => onRemove(category, index)}
                className={isMustHave ? 'text-red-600 hover:text-red-700' : 'text-blue-600 hover:text-blue-700'}
                aria-label="Delete" title="Delete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface DroppableCommentsContainerProps {
  category: 'mustHaveComments' | 'niceToHaveComments';
  onDrop: (comment: string, fromCategory: 'mustHaveComments' | 'niceToHaveComments') => void;
  children: React.ReactNode;
}

const DroppableCommentsContainer = ({ category, onDrop, children }: DroppableCommentsContainerProps) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'COMMENT',
    drop: (item: { comment: string; category: 'mustHaveComments' | 'niceToHaveComments' }) => {
      if (item.category !== category) {
        onDrop(item.comment, item.category);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  const isMustHave = category === 'mustHaveComments';
  const isActive = isOver && canDrop;

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      className={`space-y-2 min-h-[100px] p-3 rounded-lg border-2 border-dashed transition-all ${
        isActive
          ? isMustHave
            ? 'border-orange-400 bg-orange-50'
            : 'border-blue-400 bg-blue-50'
          : 'border-transparent'
      }`}
    >
      {children}
    </div>
  );
};

// Fallback master data in case API fails or returns empty
const FALLBACK_EXPERIENCE_LEVELS: ExperienceLevel[] = [
  { id: 1, code: 'entry', label: 'Entry Level (0-2 Years)', min_years: 0, max_years: 2, sort_order: 1, is_active: true },
  { id: 2, code: 'junior', label: 'Junior Level (2-3 Years)', min_years: 2, max_years: 3, sort_order: 2, is_active: true },
  { id: 3, code: 'mid', label: 'Mid Level (4-7 Years)', min_years: 4, max_years: 7, sort_order: 3, is_active: true },
  { id: 4, code: 'senior', label: 'Senior Level (7-10 Years)', min_years: 7, max_years: 10, sort_order: 4, is_active: true },
  { id: 5, code: 'architect', label: 'Architect Level (10+ Years)', min_years: 10, max_years: null, sort_order: 5, is_active: true },
  { id: 6, code: 'management', label: 'Management Level (10+ Years)', min_years: 10, max_years: null, sort_order: 6, is_active: true },
];
const CUSTOM_EXPERIENCE_VALUE = '__custom_experience__';

const FALLBACK_EDUCATION_LEVELS: EducationLevel[] = [
  { id: 1, code: 'diploma', label: 'Diploma', level: 1, sort_order: 1, is_active: true },
  { id: 2, code: 'associate', label: 'Associate Degree', level: 2, sort_order: 2, is_active: true },
  { id: 3, code: 'bachelors', label: "Bachelor's Degree", level: 3, sort_order: 3, is_active: true },
  { id: 4, code: 'masters', label: "Master's Degree", level: 4, sort_order: 4, is_active: true },
  { id: 5, code: 'doctorate', label: 'Doctorate / PhD', level: 5, sort_order: 5, is_active: true },
  { id: 6, code: 'none', label: 'No Formal Education', level: 0, sort_order: 6, is_active: true },
  { id: 7, code: 'others', label: 'Other', level: 0, sort_order: 7, is_active: true },
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

export default function JDCreation({ onBack, selectedJob, onPublish, editingJD, isJDInUse = false, jdUsageMessage, breadcrumbItems, editingJDId, onClose, onSuccess, isEmbedded }: JDCreationProps = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<CreationMode>('ai');
  const [step, setStep] = useState<Step>(editingJD?.creation_stage || 'create');
  const ensureJDCreationUrl = (jdId: string, creationStage: Step) => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const currentId = params.get('id');
    const currentStage = params.get('stage');

    if (currentId === jdId && currentStage === creationStage) return;

    params.set('id', jdId);
    params.set('stage', creationStage);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    console.log('[TalentFlow] URL updated with JD progress:', { jdId, creationStage });
  };

  // Determine if we're editing a draft or a published JD
  // Draft JD: can be updated directly (editingId is set)
  // Published JD: can also be updated directly (editingId is set) - creates a new version on publish
  // FIX-003: Use effectiveEditingJD (loaded or prop data) - computed below after loading

  // If editing a draft or published JD, we can update it directly.
  const [editingId, setEditingId] = useState<string | null>(null);
  // true when editingId was loaded from an existing JD (not created fresh in this session)
  const [isPreExistingDraft, setIsPreExistingDraft] = useState(false);
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
            industry_type: jd.industry_type,
            salary_min: jd.salary_min,
            salary_max: jd.salary_max,
            compensation_type: jd.compensation_type,
            job_level: jd.job_level,
            employment_type: jd.employment_type,
            remote_type: jd.remote_type,
            assessment_guidance: jd.assessment_guidance,
            internal_comments: jd.internal_comments,
            must_have_comments: jd.must_have_comments,
            nice_to_have_comments: jd.nice_to_have_comments,
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

  // Set editingId when component mounts or editingJD changes
  useEffect(() => {
    if (effectiveEditingJD) {
      console.log('[DEBUG] editingJD received:', { id: effectiveEditingJD.id, status: effectiveEditingJD.status });
      if (effectiveEditingJD.status === 'draft') {
        // Editing a draft - update it directly
        setEditingId(effectiveEditingJD.id);
        setIsPreExistingDraft(true);
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
    industryType: '',
    industryTypeRequired: false,
    department: '',
    allowOverqualified: false,
    employmentType: 'full_time',
    workModel: 'onsite',
    salaryFrom: '',
    salaryTo: '',
    compensationType: 'yearly',
    salaryCurrency: 'INR',
    locations: [],
    locationsRequired: false,
    assessmentGuidance: '',
    internalRecruiterComments: [],
    // JD09: Certifications and Domain Keywords
    certifications: [],
    domainKeywords: [],
    // Coding assessment fields
    codingRequired: false,
    suggestedLanguages: [],
  });
  const [experienceYearsExplicit, setExperienceYearsExplicit] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newCertification, setNewCertification] = useState('');
  const [newDomainKeyword, setNewDomainKeyword] = useState('');
  const [newLocation, setNewLocation] = useState({ city: '', radius: '50' });
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [locationStateFilter, setLocationStateFilter] = useState<string>('all');
  const [locationCountry, setLocationCountry] = useState<'IN' | 'US'>('IN');
  const [usStates, setUsStates] = useState<USStateOption[]>([]);
  const [usCitiesByState, setUsCitiesByState] = useState<Record<string, string[]>>({});
  const [isLoadingUsLocations, setIsLoadingUsLocations] = useState(false);
  
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
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedJdId, setPublishedJdId] = useState<string | null>(null);
  const [publishedJobCode, setPublishedJobCode] = useState<string | null>(null);

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
  const [extractedDataModified, setExtractedDataModified] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showExtractedSummary, setShowExtractedSummary] = useState(false);

  // Track if we've loaded from editingJD to prevent re-initialization on re-renders
  const hasLoadedFromEditingJD = useRef(false);

  // Track original values from last extraction to skip re-extraction if unchanged
  const [lastExtractedJD, setLastExtractedJD] = useState<string>('');

  // Track if we've already formatted for review to skip re-formatting if no changes
  const [hasFormattedForReview, setHasFormattedForReview] = useState(false);

  // Snapshot of extractedData when entering step 2 — used to detect actual changes via data comparison
  const step2DataSnapshot = useRef<string>('');
  // Baseline of Step-1 content captured when an existing JD is loaded for editing.
  // Lets handleNext / handleConfirmPublish detect "no changes since load" and skip
  // the extraction / reformat LLM calls on a no-op edit pass-through.
  const stage1LoadBaseline = useRef<{ jobTitle: string; aiPrompt: string; generatedJD: string; manualJD: string } | null>(null);

  // Validation errors for inline display
  const [validationErrors, setValidationErrors] = useState<{
    mustHaveSkills?: string;
    mustHaveComments?: string;
    education?: string;
    experience?: string;
    industryType?: string;
    salaryRange?: string;
  }>({});
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
  const sanitizeExtractedSalary = (val: number | null | undefined): string => {
    if (val == null) return '';
    const intVal = Math.trunc(val);
    if (intVal > 99999999) return '';
    return String(intVal);
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
  const validateSalaryRange = (from: string, to: string): string | undefined => {
    const minSalary = parseSalaryValue(from);
    const maxSalary = parseSalaryValue(to);

    // If both are empty, no error
    if (minSalary === null && maxSalary === null) return undefined;

    // If only min is filled, prompt for max
    if (minSalary !== null && maxSalary === null) {
      return 'Enter the maximum salary to complete the range.';
    }

    // If only max is filled, validate limit then prompt for min
    if (minSalary === null && maxSalary !== null) {
      if (maxSalary > 99999999) {
        return 'Maximum salary cannot exceed ₹9,99,99,999 (8 digits)';
      }
      return 'Enter the minimum salary to complete the range.';
    }

    // Max salary must not exceed 8 digits (99,999,999)
    if (maxSalary !== null && maxSalary > 99999999) {
      return 'Maximum salary cannot exceed ₹9,99,99,999 (8 digits)';
    }

    // Both are filled - validate range
    if (minSalary > maxSalary) {
      return 'Maximum salary cannot be less than minimum salary.';
    }

    return undefined;
  };


  // Helper: mark extracted data as modified AND reset formatted flag so AI reformatting triggers
  const markExtractedDataModified = () => {
    setExtractedDataModified(true);
    setHasFormattedForReview(false);
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
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Cancel JD creation state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Master data state - initialized with fallback data so dropdowns work immediately
  const [experienceLevels, setExperienceLevels] = useState<ExperienceLevel[]>(FALLBACK_EXPERIENCE_LEVELS);
  const [educationLevels, setEducationLevels] = useState<EducationLevel[]>(FALLBACK_EDUCATION_LEVELS);
  const [industryTypes, setIndustryTypes] = useState<IndustryType[]>(FALLBACK_INDUSTRY_TYPES);
  const [masterDataLoading, setMasterDataLoading] = useState(false);  // Set to false since we have fallback data
  const [showCustomExperienceInput, setShowCustomExperienceInput] = useState(false);

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
        setExperienceLevels(data.experience_levels?.length > 0 ? data.experience_levels : FALLBACK_EXPERIENCE_LEVELS);
        setEducationLevels(data.education_levels?.length > 0 ? data.education_levels : FALLBACK_EDUCATION_LEVELS);
        setIndustryTypes(data.industry_types?.length > 0 ? data.industry_types : FALLBACK_INDUSTRY_TYPES);

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

  const inferExperienceRangeFromCustomValue = (value?: string | null): { experienceMin?: number; experienceMax?: number } => {
    const normalized = value?.toLowerCase().trim() || '';
    if (!normalized) return {};

    const rangeMatch = normalized.match(/(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})/);
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

    const plusMatch = normalized.match(/(\d{1,2})\s*(?:\+|plus|or more|and above)/);
    if (plusMatch) {
      const years = Number(plusMatch[1]);
      if (!Number.isNaN(years)) {
        return { experienceMin: years };
      }
    }

    const minimumMatch = normalized.match(/(?:minimum|min\.?|at least)\s*(\d{1,2})/);
    if (minimumMatch) {
      const years = Number(minimumMatch[1]);
      if (!Number.isNaN(years)) {
        return { experienceMin: years };
      }
    }

    const singleMatch = normalized.match(/(\d{1,2})\s*(?:years?|yrs?)/);
    if (singleMatch) {
      const years = Number(singleMatch[1]);
      if (!Number.isNaN(years)) {
        return { experienceMin: years };
      }
    }

    return {};
  };

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
    return {
      jobLevel: normalized,
      experienceMin,
      experienceMax,
      isCustom: true,
    };
  };

  const resolvePersistedExperiencePayload = (
    value?: string | null,
    yearsWereExplicit: boolean = experienceYearsExplicit
  ) => {
    const payload = resolveExperiencePayload(value);
    const customHasExplicitYears = payload.isCustom
      && (payload.experienceMin !== undefined || payload.experienceMax !== undefined);
    const shouldPersistYears = yearsWereExplicit || customHasExplicitYears;

    return {
      ...payload,
      experienceMin: shouldPersistYears ? payload.experienceMin : undefined,
      experienceMax: shouldPersistYears ? payload.experienceMax : undefined,
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
      if (min >= 4 || (max && max >= 5 && min >= 3)) return 'mid';
      if (min >= 2 || (max && max >= 2 && min >= 1)) return 'junior';
      return 'entry';
    };

    if (hasExpMin || hasExpMax) {
      const min = hasExpMin ? expMin! : 0;
      const max = hasExpMax ? expMax : null;
      experienceValue = mapToExperienceCode(min, max, jdText);
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
      experienceValue = levelMap[normalizedLevel] || '';

      if (!experienceValue) {
        if (normalizedLevel.includes('entry')) experienceValue = 'entry';
        else if (normalizedLevel.includes('junior')) experienceValue = 'junior';
        else if (normalizedLevel.includes('mid')) experienceValue = 'mid';
        else if (normalizedLevel.includes('senior')) experienceValue = 'senior';
        else if (normalizedLevel.includes('architect')) experienceValue = 'architect';
        else if (normalizedLevel.includes('management') || normalizedLevel.includes('manager')) experienceValue = 'management';
      }

      if (!experienceValue) {
        return rawExperienceValue;
      }
    }

    return experienceValue;
  };

  const selectedExperienceLevel = getExperienceLevelByCode(extractedData.experience);
  const experienceSelectValue = selectedExperienceLevel
    ? selectedExperienceLevel.code
    : showCustomExperienceInput
      ? CUSTOM_EXPERIENCE_VALUE
      : '';

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

    // Need at least 1 non-space character in job title
    const trimmedJobTitle = jobTitle.trim();
    if (!trimmedJobTitle) return;
    if (getResolvedJobTitleValidationError(trimmedJobTitle) || isJobTitleValidating) {
      setAutosaveStatus('idle');
      return;
    }

    const autosaveTimer = setTimeout(async () => {
      // Don't autosave if currently saving via another action or already published
      if (isSavingDraft || isPublishing || isPublished) return;

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
          savedJd = await jdService.create(jdData);
          setEditingId(savedJd.id);
        }

        setAutosaveStatus('saved');
        setLastAutosaveTime(new Date());
        setHasUnsavedChanges(false); // Clear unsaved changes after successful save

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
  }, [jobTitle, manualJD, aiPrompt, generatedJD, step, mode, editingId, isSavingDraft, isPublishing, isPublished, isJobTitleValidating]);

  // Track changes for unsaved changes warning
  useEffect(() => {
    if (jobTitle.trim() || aiPrompt.trim() || manualJD.trim() || generatedJD.trim()) {
      setHasUnsavedChanges(true);
    }
  }, [jobTitle, aiPrompt, manualJD, generatedJD]);

  // Warn before closing browser tab/window if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && !isPublished) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isPublished]);

  // Intercept navigation clicks (menu items, links, etc.) if there are unsaved changes
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Only intercept if there are unsaved changes and not published
      if (!hasUnsavedChanges || isPublished) {
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

            // Store the target URL and show dialog
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
  }, [hasUnsavedChanges, isPublished]);

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

    // Validate salary: if prompt mentions a single salary (e.g., "3 LPA") without a range, ask user to provide a range
    // Detect single salary value with salary keyword (e.g., "6 LPA", "3 lakh", "salary 500000")
    const singleSalaryPattern = /\d[\d,.\s]*\s*(?:lpa|lakhs?|lakh|per\s*annum|ctc|package)/i;
    // Detect salary RANGE: requires salary unit keyword on at least one side (e.g., "3 LPA to 5 LPA", "3 to 5 LPA")
    // This avoids false matches on experience ranges like "3-5 years"
    const salaryRangePattern = /\d[\d,.\s]*\s*(?:lpa|lakhs?|lakh|k|cr|crores?)\s*(?:to|-|–|~)\s*\d[\d,.\s]*\s*(?:lpa|lakhs?|lakh|k|cr|crores?)?/i;
    const salaryRangePattern2 = /\d[\d,.\s]*\s*(?:to|-|–|~)\s*\d[\d,.\s]*\s*(?:lpa|lakhs?|lakh|k|cr|crores?)/i;

    const hasSingleSalary = singleSalaryPattern.test(aiPrompt);
    const hasSalaryRange = salaryRangePattern.test(aiPrompt) || salaryRangePattern2.test(aiPrompt);

    if (hasSingleSalary && !hasSalaryRange) {
      toast.error({
        title: 'Salary Range Required',
        description: 'Please enter a salary range instead of a single value. For example: "3 LPA to 4 LPA" instead of just "3 LPA".',
      });
      return;
    }

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

      const expValue = mapExtractedExperienceValue(params, experienceSourceText);
      const hasExplicitExperienceYears = (
        params.experience_min !== null
        && params.experience_min !== undefined
        && !Number.isNaN(Number(params.experience_min))
      ) || (
        params.experience_max !== null
        && params.experience_max !== undefined
        && !Number.isNaN(Number(params.experience_max))
      );

      // When in edit mode, preserve existing values if extraction returns empty arrays
      const isEditMode = !!editingId;
      const nextExperienceValue = expValue || (isEditMode ? extractedData.experience : '');

      setShowCustomExperienceInput(Boolean(nextExperienceValue && !getExperienceLevelByCode(nextExperienceValue)));
      setExperienceYearsExplicit(hasExplicitExperienceYears);

      setExtractedData(prev => ({
        ...prev,
        mustHaveSkills: params.must_have_skills?.length > 0 ? params.must_have_skills : (isEditMode ? prev.mustHaveSkills : []),
        mustHaveComments: params.must_have_comments?.length > 0 ? params.must_have_comments : prev.mustHaveComments,
        niceToHaveSkills: params.nice_to_have_skills?.length > 0 ? params.nice_to_have_skills : (isEditMode ? prev.niceToHaveSkills : []),
        niceToHaveComments: params.nice_to_have_comments?.length > 0 ? params.nice_to_have_comments : prev.niceToHaveComments,
        education: params.education_requirements?.degree?.toLowerCase().replace("'s", 's').replace(' ', '-') || (isEditMode ? prev.education : ''),
        experience: expValue || prev.experience,
        industryType: params.industry_type?.toLowerCase() || (isEditMode ? prev.industryType : ''),
        employmentType: prev.employmentType,
        workModel: prev.workModel,
        // Pre-fill salary from AI extraction
        salaryFrom: params.salary_min != null ? (sanitizeExtractedSalary(params.salary_min) || prev.salaryFrom || '') : (prev.salaryFrom || ''),
        salaryTo: params.salary_max != null ? (sanitizeExtractedSalary(params.salary_max) || prev.salaryTo || '') : (prev.salaryTo || ''),
        salaryCurrency: normalizeSalaryCurrency(params.salary_currency || prev.salaryCurrency),
        compensationType: (params.compensation_type as 'yearly' | 'monthly' | 'hourly' | 'daily') || prev.compensationType || 'yearly',
        locations: (params.locations || []).length > 0 ? params.locations.map((loc: any) => ({
          city: loc.city || '',
          radius: '50'
        })) : (isEditMode ? prev.locations : []),
        allowOverqualified: isEditMode ? prev.allowOverqualified : false,
        codingRequired: params.coding_required === true || (isEditMode ? prev.codingRequired : false),
        suggestedLanguages: params.suggested_languages?.length > 0 ? params.suggested_languages : (isEditMode ? prev.suggestedLanguages : []),
        certifications: params.certifications?.length > 0 ? params.certifications : (isEditMode ? prev.certifications : []),
        domainKeywords: params.domain_keywords?.length > 0 ? params.domain_keywords : (isEditMode ? prev.domainKeywords : []),
      }));

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
          if (response.title) {
            setJobTitle(response.title);
        }
          setGeneratedJD(response.description);

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
            description: error.message,
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
          // Update title if provided
          if (title) {
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

            // Pre-fill step 2 form with extracted params (salary, skills, etc.)
            if (response.extracted_params) {
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
          description: streamErr.message,
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

  const hasExtractedRequirementData = (): boolean =>
    (extractedData.mustHaveSkills?.length || 0) +
      (extractedData.niceToHaveSkills?.length || 0) +
      (extractedData.mustHaveComments?.length || 0) +
      (extractedData.niceToHaveComments?.length || 0) >
    0;

  const handleNext = async () => {
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

    // EDIT FLOW — NO CHANGE, NO LLM:
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

    // If user has proceeded to review and returned to Stage 1
    if (hasProceededToReview && originalStage1Values) {
      if (!hasStage1FieldsChanged()) {
        // No fields modified - skip extraction, go directly to Stage 2
        // Keep current extractedData as-is (user may have deleted items)
        console.log('[TalentFlow] No Stage 1 fields modified after review, keeping current extractedData');
        setHasProceededToExtract(true);
        setStep('extract');
        return;
      } else {
        // Fields modified - need to re-extract, also reset hasProceededToReview
        console.log('[TalentFlow] Stage 1 fields modified after review, triggering re-extraction');
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

    setIsExtracting(true);
    setHasProceededToExtract(true); // Disable regenerate button immediately when Next is clicked

    try {
      // Call real API to extract parameters using AI
      console.log('[TalentFlow] Extracting parameters from JD, length:', jdText.length);
      const params = await jdService.extractParamsFromText(jdText, trimmedJobTitle);

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

      const experienceValue = mapExtractedExperienceValue(
        {
          experience_min: params.experience_min,
          experience_max: params.experience_max,
          experience_level: params.experience_level,
          job_level: params.job_level,
        },
        jdText
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
        const educationMap: Record<string, string> = {
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

      // Map industry to valid Odoo codes (matching backend extraction and database)
      const validIndustryCodes = [
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
      // Map common variations to valid Odoo codes
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
        // First check if it's already a valid Odoo code
        if (validIndustryCodes.includes(rawIndustry)) {
          industryValue = rawIndustry;
        } else if (industryMapping[rawIndustry]) {
          // Map known variations to valid Odoo codes
          industryValue = industryMapping[rawIndustry];
        } else {
          // Default to 'others' for unknown industries
          industryValue = 'others';
        }
        console.log('[TalentFlow] Mapped industry:', { raw: params.industry_type, normalized: rawIndustry, code: industryValue });
      } else {
        console.log('[TalentFlow] No industry extracted, leaving empty');
      }

      // When in edit mode, preserve existing values if extraction returns empty arrays
      // This prevents losing manually edited comments/skills when re-extracting
      const isEditMode = !!editingId;

      // FIX: If user has modified extracted data (deleted/edited skills/comments), preserve their changes
      // Don't let AI extraction overwrite user's manual edits
      const preserveUserEdits = isEditMode && extractedDataModified;
      const nextExperienceYearsExplicit = (hasExpMin || hasExpMax)
        || (preserveUserEdits && resolvePersistedExperiencePayload(extractedData.experience).yearsWereExplicit);
      setExperienceYearsExplicit(nextExperienceYearsExplicit);

      const extraction: ExtractedData = {
        mustHaveSkills: preserveUserEdits ? extractedData.mustHaveSkills : (params.must_have_skills?.length > 0 ? params.must_have_skills : (isEditMode ? extractedData.mustHaveSkills || [] : [])),
        mustHaveComments: preserveUserEdits ? extractedData.mustHaveComments : (params.must_have_comments?.length > 0 ? params.must_have_comments : (isEditMode ? extractedData.mustHaveComments || [] : [])),
        niceToHaveSkills: preserveUserEdits ? extractedData.niceToHaveSkills : (params.nice_to_have_skills?.length > 0 ? params.nice_to_have_skills : (isEditMode ? extractedData.niceToHaveSkills || [] : [])),
        niceToHaveComments: preserveUserEdits ? extractedData.niceToHaveComments : (params.nice_to_have_comments?.length > 0 ? params.nice_to_have_comments : (isEditMode ? extractedData.niceToHaveComments || [] : [])),
        education: educationValue || (isEditMode ? extractedData.education : ''),
        // Use API's mandatory flag for education
        educationRequired: params.education_mandatory || false,
        experience: experienceValue || (isEditMode ? extractedData.experience : ''),
        // Use API's mandatory flag for experience
        experienceRequired: params.experience_mandatory || false,
        industryType: industryValue, // Only from extraction, no fallback - user must select if not extracted
        // Use API's mandatory flag for industry
        industryTypeRequired: params.industry_mandatory || false,
        department: isEditMode ? extractedData.department : '',
        allowOverqualified: isEditMode ? extractedData.allowOverqualified : false,
        employmentType: (params.job_type as 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary') || (isEditMode ? extractedData.employmentType : 'full_time'),
        workModel: (params.work_mode as 'onsite' | 'remote' | 'hybrid' | 'field_based') || (isEditMode ? extractedData.workModel : 'onsite'),
        // Pre-fill salary from AI extraction
        salaryFrom: params.salary_min != null ? (sanitizeExtractedSalary(params.salary_min) || extractedData.salaryFrom || '') : (extractedData.salaryFrom || ''),
        salaryTo: params.salary_max != null ? (sanitizeExtractedSalary(params.salary_max) || extractedData.salaryTo || '') : (extractedData.salaryTo || ''),
        compensationType: (params.compensation_type as 'yearly' | 'monthly' | 'hourly' | 'daily') || extractedData.compensationType || 'yearly',
        salaryCurrency: normalizeSalaryCurrency(params.salary_currency || extractedData.salaryCurrency),
        locations: (params.locations || []).length > 0 ? params.locations.map((loc: any) => ({
          city: loc.city || '',
          radius: '50'  // Default radius
        })) : (isEditMode ? extractedData.locations : []),
        locationsRequired: params.location_mandatory || (isEditMode ? extractedData.locationsRequired : false),
        assessmentGuidance: isEditMode ? extractedData.assessmentGuidance : '',
        internalRecruiterComments: isEditMode ? extractedData.internalRecruiterComments : [],
        // JD09: Extract certifications and domain keywords
        certifications: params.certifications?.length > 0 ? params.certifications : (isEditMode ? extractedData.certifications : []),
        domainKeywords: params.domain_keywords?.length > 0 ? params.domain_keywords : (isEditMode ? extractedData.domainKeywords : []),
        // Coding assessment fields - extract from AI response
        codingRequired: params.coding_required === true || (isEditMode ? extractedData.codingRequired : false),
        suggestedLanguages: params.suggested_languages?.length > 0 ? params.suggested_languages : (isEditMode ? extractedData.suggestedLanguages : []),
      };
      const extractionExperiencePayload = resolvePersistedExperiencePayload(extraction.experience, nextExperienceYearsExplicit);
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
      setExtractedDataModified(false);  // Reset after fresh extraction - no user modifications yet
      step2DataSnapshot.current = JSON.stringify(extraction);  // Snapshot for change detection
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
        education_requirements: extraction.education ? { degree: extraction.education } : undefined,
        experience_min: extractionExperiencePayload.experienceMin,
        experience_max: extractionExperiencePayload.experienceMax,
        industry_type: extraction.industryType || undefined,
        salary_min: extraction.salaryFrom ? parseInt(extraction.salaryFrom.replace(/[^0-9.]/g, '')) : undefined,
        salary_max: extraction.salaryTo ? parseInt(extraction.salaryTo.replace(/[^0-9.]/g, '')) : undefined,
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
          savedJd = await jdService.create(jdData);
          jdId = savedJd.id;
          setEditingId(savedJd.id);
          console.log('[TalentFlow] JD created with extract stage, new id:', savedJd.id);
        }

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

    const updatedData = {
      ...extractedData,
      mustHaveSkills: updatedMustHave,
      niceToHaveSkills: updatedNiceToHave,
    };
    setExtractedData(updatedData);
    markExtractedDataModified();  // Mark as modified to prevent reload from DB

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          must_have_skills: updatedMustHave,
          nice_to_have_skills: updatedNiceToHave,
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

  const handleMoveSkill = async (skill: string, from: 'mustHaveSkills' | 'niceToHaveSkills', to: 'mustHaveSkills' | 'niceToHaveSkills') => {
    console.log('[Move] Moving skill:', skill, 'from', from, 'to', to);

    // Calculate updated arrays
    const updatedFrom = extractedData[from].filter(s => s !== skill);
    const updatedTo = [...extractedData[to], skill];

    const updatedMustHave = from === 'mustHaveSkills' ? updatedFrom : (to === 'mustHaveSkills' ? updatedTo : extractedData.mustHaveSkills);
    const updatedNiceToHave = from === 'niceToHaveSkills' ? updatedFrom : (to === 'niceToHaveSkills' ? updatedTo : extractedData.niceToHaveSkills);

    setExtractedData(prev => ({
      ...prev,
      mustHaveSkills: updatedMustHave,
      niceToHaveSkills: updatedNiceToHave,
    }));
    markExtractedDataModified();

    // Save to DB immediately
    if (editingId) {
      try {
        await jdService.update(editingId, {
          must_have_skills: updatedMustHave,
          nice_to_have_skills: updatedNiceToHave,
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

      if (!validateEnglishOnlyExtractedValue(commentToAdd, 'Must-have comments')) {
        return;
      }

      if (isDuplicateAcrossLists(commentToAdd)) {
        return;
      }

      const updatedComments = [...extractedData.mustHaveComments, commentToAdd];

      setExtractedData(prev => ({
        ...prev,
        mustHaveComments: updatedComments,
      }));
      setNewComment('');
      setEditingCategory(null);
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

      setExtractedData(prev => ({
        ...prev,
        mustHaveSkills: updatedMustHave,
        niceToHaveSkills: updatedNiceToHave,
      }));
      markExtractedDataModified();

      // Save to DB immediately
      if (editingId) {
        try {
          await jdService.update(editingId, {
            must_have_skills: updatedMustHave,
            nice_to_have_skills: updatedNiceToHave,
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

      if (!validateEnglishOnlyExtractedValue(newValue, 'Must-have comments')) {
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

      if (!validateEnglishOnlyExtractedValue(commentToAdd, 'Nice-to-have comments')) {
        return;
      }

      if (isDuplicateAcrossLists(commentToAdd)) {
        return;
      }

      setExtractedData(prev => ({
        ...prev,
        niceToHaveComments: [...(prev.niceToHaveComments || []), commentToAdd],
      }));
      setNewComment('');
      setEditingCategory(null);
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

      if (!validateEnglishOnlyExtractedValue(newValue, 'Nice-to-have comments')) {
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

  const handleDropSkill = (skill: string, fromCategory: 'mustHaveSkills' | 'niceToHaveSkills', toCategory: 'mustHaveSkills' | 'niceToHaveSkills') => {
    if (fromCategory !== toCategory) {
      handleMoveSkill(skill, fromCategory, toCategory);
    }
  };

  // Comment move/drop handlers for drag and drop
  const handleMoveComment = (comment: string, from: 'mustHaveComments' | 'niceToHaveComments', to: 'mustHaveComments' | 'niceToHaveComments') => {
    setExtractedData(prev => ({
      ...prev,
      [from]: (prev[from] || []).filter(c => c !== comment),
      [to]: [...(prev[to] || []), comment],
    }));
    markExtractedDataModified();
  };

  const handleDropComment = (comment: string, fromCategory: 'mustHaveComments' | 'niceToHaveComments', toCategory: 'mustHaveComments' | 'niceToHaveComments') => {
    if (fromCategory !== toCategory) {
      handleMoveComment(comment, fromCategory, toCategory);
    }
  };

  const handleRemoveCommentByCategory = async (category: 'mustHaveComments' | 'niceToHaveComments', index: number) => {
    const updatedComments = (extractedData[category] || []).filter((_, i) => i !== index);
    setExtractedData(prev => ({
      ...prev,
      [category]: updatedComments,
    }));
    markExtractedDataModified();  // Mark as modified to prevent reload from DB

    // Save to DB immediately
    if (editingId) {
      try {
        const updateData = category === 'mustHaveComments'
          ? { must_have_comments: updatedComments }
          : { nice_to_have_comments: updatedComments };
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

      if (!validateEnglishOnlyExtractedValue(cityToAdd, 'Locations')) {
        return;
      }

      setExtractedData(prev => ({
        ...prev,
        locations: [...prev.locations, {
          city: cityToAdd,
          radius: newLocation.radius || '50',
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
      { valid: validateEnglishOnlyExtractedList(extractedData.mustHaveComments, 'Must-have comments'), fieldLabel: 'Must-have comments' },
      { valid: validateEnglishOnlyExtractedList(extractedData.niceToHaveComments, 'Nice-to-have comments'), fieldLabel: 'Nice-to-have comments' },
      { valid: validateEnglishOnlyExtractedList(extractedData.internalRecruiterComments, 'Internal recruiter notes'), fieldLabel: 'Internal recruiter notes' },
      { valid: validateEnglishOnlyExtractedList(extractedData.certifications, 'Certifications'), fieldLabel: 'Certifications' },
      { valid: validateEnglishOnlyExtractedList(extractedData.domainKeywords, 'Domain keywords'), fieldLabel: 'Domain keywords' },
      { valid: validateEnglishOnlyExtractedList(extractedData.locations.map(location => location.city), 'Locations'), fieldLabel: 'Locations' },
    ];

    if (extractedData.assessmentGuidance.trim() && !validateEnglishOnlyExtractedValue(extractedData.assessmentGuidance.trim(), 'Assessment guidance')) {
      return false;
    }

    return englishOnlyChecks.every(check => check.valid);
  };

  const handlePublish = async () => {
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

    // DEFENSIVE CHECK: Early return if critical fields are empty
    // This prevents any edge case where button might be clickable
    const earlyCheckFailed = [];
    if (!extractedData.education?.trim()) earlyCheckFailed.push('Education');
    if (!extractedData.experience?.trim()) earlyCheckFailed.push('Experience');
    if (!extractedData.industryType?.trim()) earlyCheckFailed.push('Industry Type');

    if (earlyCheckFailed.length > 0) {
      console.log('[TalentFlow] BLOCKED: Missing required fields:', earlyCheckFailed);
      toast.error({
        title: 'Missing Required Fields',
        description: `Please select: ${earlyCheckFailed.join(', ')}`,
      });
      return;
    }

    // Validate mandatory fields
    const missingFields: string[] = [];
    const errors: {
      mustHaveSkills?: string;
      mustHaveComments?: string;
      education?: string;
      experience?: string;
      industryType?: string;
      locations?: string;
    } = {};

    // Must have at least one must-have skill
    if (!extractedData.mustHaveSkills || extractedData.mustHaveSkills.length === 0) {
      missingFields.push('At least one Must-Have Skill');
      errors.mustHaveSkills = 'At least one Must-Have Skill is required';
    }

    // Must-Have Comments are optional - no validation required

    // Education is required - check for empty string, null, undefined, or whitespace only
    if (!extractedData.education || extractedData.education.trim() === '') {
      missingFields.push('Education');
      errors.education = 'Education is required';
    }

    // Experience is required - check for empty string, null, undefined, or whitespace only
    if (!extractedData.experience || extractedData.experience.trim() === '') {
      missingFields.push('Experience');
      errors.experience = 'Experience is required';
    }

    // Industry Type is required - check for empty string, null, undefined, or whitespace only
    if (!extractedData.industryType || extractedData.industryType.trim() === '') {
      missingFields.push('Industry Type');
      errors.industryType = 'Industry Type is required';
    }

    // Location validation - if location is marked as required but no locations added, show error
    if (extractedData.locationsRequired && (!extractedData.locations || extractedData.locations.length === 0)) {
      missingFields.push('At least one Location');
      errors.locations = 'Location is marked as required but no locations added';
    }

    // Set validation errors for inline display
    setValidationErrors(errors);

    if (missingFields.length > 0) {
      toast.error({
        title: 'Missing Required Fields',
        description: `Please complete: ${missingFields.join(', ')}`,
      });
      return;
    }

    // BEFORE going to review, reformat the JD description using AI
    // Only reformat if user actually modified extracted data (skills/comments/fields) in Step 2
    // If no edits were made, skip AI formatting and go directly to review

    // Detect changes via data comparison (bulletproof fallback - works even if a handler misses the flag)
    const dataChanged = step2DataSnapshot.current !== '' && JSON.stringify(extractedData) !== step2DataSnapshot.current;

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

    const shouldReformat = (extractedDataModified && !hasFormattedForReview) || dataChanged || lacksMarkdownFormatting;

    console.log('[DEBUG] handlePublish - extractedDataModified:', extractedDataModified, 'hasFormattedForReview:', hasFormattedForReview, 'dataChanged:', dataChanged, 'lacksMarkdownFormatting:', lacksMarkdownFormatting, 'shouldReformat:', shouldReformat);

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
            experience_min: experienceMin,
            experience_max: experienceMax,
            job_level: persistedExperiencePayload.jobLevel,
            education_requirements: educationRequirements,
            certifications: extractedData.certifications,
            coding_required: extractedData.codingRequired,
            supported_languages: extractedData.suggestedLanguages,
            salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9.]/g, '')) : undefined,
            salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9.]/g, '')) : undefined,
            salary_currency: extractedData.salaryCurrency,
            compensation_type: extractedData.compensationType,
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
    step2DataSnapshot.current = JSON.stringify(reviewData);  // Update snapshot so returning without new edits skips
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
        education_requirements: extractedData.education ? { degree: extractedData.education } : undefined,
        experience_min: experienceMin,
        experience_max: experienceMax,
        industry_type: extractedData.industryType || undefined,
        salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9.]/g, '')) : undefined,
        salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9.]/g, '')) : undefined,
        compensation_type: extractedData.compensationType,
        salary_currency: extractedData.salaryCurrency,
        employment_type: extractedData.employmentType,
        remote_type: extractedData.workModel,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
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
        savedJd = await jdService.create(jdData);
        jdId = savedJd.id;
        setEditingId(savedJd.id);
        console.log('[TalentFlow] JD created with review stage:', savedJd.id);
      }

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

  // Helper function to get experience label from master data
  const getExperienceLabel = (code: string): string => {
    if (!code) return 'Not specified';
    const normalized = code.trim();
    const level = getExperienceLevelByCode(normalized);
    return level?.label || normalized;
  };

  // Helper function to get education label from master data
  const getEducationLabel = (code: string): string => {
    if (!code) return 'Not specified';
    const level = educationLevels.find(l => l.code === code);
    return level?.label || code.charAt(0).toUpperCase() + code.slice(1).replace('-', ' ');
  };

  // Helper function to get industry label from master data
  const getIndustryLabel = (code: string): string => {
    if (!code) return 'Not specified';
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

    // Education is required - check for empty string, null, undefined, or whitespace only
    const educationValue = extractedData.education?.trim() || '';
    if (!educationValue) {
      missingFields.push('Education');
    }

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

    // Validate salary range
    const salaryError = validateSalaryRange(extractedData.salaryFrom || '', extractedData.salaryTo || '');
    if (salaryError) {
      missingFields.push('Salary Range - ' + salaryError);
    }

    // Debug logging
    console.log('[TalentFlow] Validation check:', {
      experience: experienceValue,
      education: educationValue,
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
      let publishDescription = generatedJD || manualJD;
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
            experience_min: experienceMin,
            experience_max: experienceMax,
            job_level: experiencePayload.jobLevel,
            education_requirements: extractedData.education
              ? (typeof extractedData.education === 'string' ? { degree: extractedData.education } : extractedData.education)
              : null,
            certifications: extractedData.certifications,
            coding_required: extractedData.codingRequired,
            supported_languages: extractedData.suggestedLanguages,
            salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9.]/g, '')) : undefined,
            salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9.]/g, '')) : undefined,
            salary_currency: extractedData.salaryCurrency,
            compensation_type: extractedData.compensationType,
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
        industry_type: extractedData.industryType || undefined,
        salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9.]/g, '')) : undefined,
        salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9.]/g, '')) : undefined,
        compensation_type: extractedData.compensationType,
        salary_currency: extractedData.salaryCurrency,
        job_level: experiencePayload.jobLevel,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        internal_comments: extractedData.internalRecruiterComments.join('\n') || undefined,
        must_have_comments: extractedData.mustHaveComments,
        nice_to_have_comments: extractedData.niceToHaveComments,
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
        jdToPublish = await jdService.create(jdData);
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
      setPublishedJdId(publishedJd.id);
      setPublishedJobCode(publishedJd.job_id || null);
      setPublishedVersion(publishedJd.current_version || 1);

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
          description: generatedJD || manualJD,
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
          title: isEditingPublished ? 'Job description republished!' : 'Job description published!',
          description: isEditingPublished
            ? `"${jobTitle}" has been updated and a new version has been saved.`
            : `"${jobTitle}" is now live and accepting applications.`,
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
          title: 'Failed to publish job description',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
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
      // Auto save as draft
      await handleSaveDraft();
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

  // Handle "Save Draft" button in unsaved changes dialog
  const handleSaveAndNavigate = async () => {
    setShowUnsavedDialog(false);
    setIsNavigatingBack(true);

    // Save draft first
    await handleSaveDraft();

    // Then navigate to the stored URL
    if (pendingNavigation) {
      router.push(pendingNavigation);
    }

    setPendingNavigation(null);
    setIsNavigatingBack(false);
  };

  // Handle "Discard" button in unsaved changes dialog
  const handleDiscardAndNavigate = () => {
    setShowUnsavedDialog(false);
    setHasUnsavedChanges(false);

    // Navigate without saving
    if (pendingNavigation) {
      router.push(pendingNavigation);
    }

    setPendingNavigation(null);
  };

  // Handle dialog cancel (X button or clicking outside)
  const handleCancelDialog = () => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
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
        toast.info('JD draft has been deleted');
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
  const handleSaveDraft = async () => {
    const trimmedJobTitle = jobTitle.trim();

    // Validate job title has at least 1 non-space character
    if (!trimmedJobTitle) {
      toast.warning({
        title: 'Cannot save draft',
        description: 'Please enter a job title',
      });
      return;
    }

    if (!(await ensureValidJobTitle(trimmedJobTitle))) {
      return;
    }

    if (step !== 'create' && !validateExtractionPageEnglishOnlyFields()) {
      return;
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
        industry_type: extractedData.industryType || undefined,
        salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9.]/g, '')) : undefined,
        salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9.]/g, '')) : undefined,
        compensation_type: extractedData.compensationType,
        salary_currency: extractedData.salaryCurrency,
        job_level: experiencePayload.jobLevel,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        internal_comments: extractedData.internalRecruiterComments.join('\n') || undefined,
        must_have_comments: extractedData.mustHaveComments,
        nice_to_have_comments: extractedData.niceToHaveComments,
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
      // IMPORTANT: When editing a published JD, always create a NEW draft instead of updating
      console.log('[DEBUG] Save draft - editingId:', editingId, 'isEditingDraft:', isEditingDraft, 'isEditingPublished:', isEditingPublished);
      console.log('[DEBUG] jdData being saved:', { title: jdData.title, description: jdData.description?.substring(0, 100), creation_method: jdData.creation_method });
      let savedJd;
      if (editingId && !isEditingPublished) {
        // Only update if editing an existing DRAFT (not published)
        console.log('[DEBUG] Updating existing draft with ID:', editingId);
        savedJd = await jdService.update(editingId, jdData);
        console.log('[DEBUG] JD updated as draft:', savedJd.id);
      } else {
        // Create new draft when:
        // 1. No editingId (new JD)
        // 2. Editing a published JD (create new draft version)
        console.log('[DEBUG] Creating new draft (editingId is null or editing published JD)');
        savedJd = await jdService.create(jdData);
        setEditingId(savedJd.id);  // Track the new ID in case we save again
        console.log('[DEBUG] JD created as draft:', savedJd.id);
      }

      setIsSavingDraft(false);
      setHasUnsavedChanges(false); // Clear unsaved changes after successful save

      toast.success({
        title: isEditingPublished ? 'New draft created!' : 'Draft saved!',
        description: isEditingPublished
          ? `A new draft version of "${jobTitle}" has been created. The original JD remains unchanged.`
          : `"${jobTitle}" has been saved as draft.`,
      });

      // Navigate to job openings page after saving draft
      router.push('/recruitment/job-openings');
    } catch (error) {
      console.error('[ERROR] Failed to save draft:', error);
      setIsSavingDraft(false);
      toast.error({
        title: 'Failed to save draft',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
      // Stay on page even on error - let user retry or fix issues
    }
  };

  const renderStepIndicator = () => (
    <div>
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3 sm:gap-4">
        {/* Step 1 */}
        <div className="flex items-center gap-2.5">
          <div className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full text-sm font-semibold ${
            step === 'create' ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-brand-cyan text-white shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10'
          }`}>
            {step !== 'create' ? <CheckCircle className="w-5 h-5" /> : '1'}
          </div>
          <div className={`hidden sm:block text-sm whitespace-nowrap font-medium ${step === 'create' ? 'text-brand-blue' : 'text-gray-700 dark:text-slate-300'}`}>Create JD</div>
        </div>

        {/* Connector 1 */}
        <div className={`w-10 sm:w-20 lg:w-32 h-0.5 rounded-full ${step !== 'create' ? 'bg-brand-cyan' : 'bg-gray-200 dark:bg-slate-700'}`} />

        {/* Step 2 */}
        <div className="flex items-center gap-2.5">
          <div className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full text-sm font-semibold ${
            step === 'extract' ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10' :
            step === 'review' ? 'bg-brand-cyan text-white shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10' :
            'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 ring-1 ring-gray-200 dark:ring-slate-700'
          }`}>
            {step === 'review' ? <CheckCircle className="w-5 h-5" /> : '2'}
          </div>
          <div className={`hidden sm:block text-sm whitespace-nowrap font-medium ${step === 'extract' ? 'text-brand-blue' : 'text-gray-700 dark:text-slate-300'}`}>Extract</div>
        </div>

        {/* Connector 2 */}
        <div className={`w-10 sm:w-20 lg:w-32 h-0.5 rounded-full ${step === 'review' ? 'bg-brand-cyan' : 'bg-gray-200 dark:bg-slate-700'}`} />

        {/* Step 3 */}
        <div className="flex items-center gap-2.5">
          <div className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full text-sm font-semibold ${
            step === 'review' ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 ring-1 ring-gray-200 dark:ring-slate-700'
          }`}>
            3
          </div>
          <div className={`hidden sm:block text-sm whitespace-nowrap font-medium ${step === 'review' ? 'text-brand-blue' : 'text-gray-700 dark:text-slate-300'}`}>{isEditingPublished ? 'Republish' : 'Publish'}</div>
        </div>
        </div>
      </div>
    </div>
  );

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

      // Use functional updates to preserve user edits if they exist
      setJobTitle(prev => prev || effectiveEditingJD.title);
      setGeneratedJD(prev => prev || effectiveEditingJD.description);

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

      // Set lastExtractedJD to the loaded description only if extraction has already happened.
      // For drafts saved at 'create' stage, leave it empty so handleNext triggers extraction.
      if (effectiveEditingJD.creation_stage !== 'create') {
        setLastExtractedJD(effectiveEditingJD.description || '');
      }

      setStep(effectiveEditingJD.creation_stage);
      console.log('[TalentFlow] Set step to:', effectiveEditingJD.creation_stage);

      // If already at review stage, mark as formatted to skip reformatting on next "Next" click
      // and mark as proceeded to review to make Stage 2 fields read-only
      if (effectiveEditingJD.creation_stage === 'review') {
        setHasFormattedForReview(true);
        setHasProceededToReview(true);

        // Save original Stage 1 values so we can detect modifications if user goes back to Stage 1
        setOriginalStage1Values({
          jobTitle: effectiveEditingJD.title || '',
          aiPrompt: effectiveEditingJD.ai_prompt || '',
          generatedJD: effectiveEditingJD.description || '',
          manualJD: effectiveEditingJD.creation_method === 'manual' ? (effectiveEditingJD.description || '') : ''
        });
      }

      // Restore the creation mode based on saved creation_method
      if (effectiveEditingJD.creation_method) {
        setMode(effectiveEditingJD.creation_method === 'ai_generated' ? 'ai' : 'manual');
      }

      // Load extracted data if:
      // 1. We're past the create step (draft JDs), OR
      // 2. It's a published JD (always has data regardless of stage)
      if (effectiveEditingJD.creation_stage !== 'create' || effectiveEditingJD.status === 'published') {
        // Calculate actual values first, then set Required based on whether value exists
        const educationValue = effectiveEditingJD.education_requirements?.degree || '';

        // Map experience_min/max to level codes (entry, junior, mid, senior, architect, management)
        const mapExpToLevel = (min: number | null | undefined, max: number | null | undefined): string => {
          // Check for null/undefined but allow 0 as valid value
          if (min === null || min === undefined) return '';

          // 10+ years
          if (min >= 10) {
            // Check JD description for architect/management keywords
            const desc = (effectiveEditingJD.description || '').toLowerCase();
            const isArchitect = desc.includes('architect') || desc.includes('architecture');
            const isManagement = desc.includes('manager') || desc.includes('management') || desc.includes('director') || desc.includes('lead');

            if (isArchitect && !isManagement) return 'architect';
            if (isManagement) return 'management';
            return 'senior';
          }

          // 7-10 years = Senior
          if (min >= 7) return 'senior';

          // 5-7 years = Mid
          if (min >= 5) return 'mid';

          // 2-4 years = Junior
          if (min >= 2) return 'junior';

          // 0-2 years = Entry
          return 'entry';
        };

        const experienceValue = effectiveEditingJD.job_level || mapExpToLevel(effectiveEditingJD.experience_min, effectiveEditingJD.experience_max);
        const hasPersistedExperienceYears = (
          effectiveEditingJD.experience_min !== null
          && effectiveEditingJD.experience_min !== undefined
        ) || (
          effectiveEditingJD.experience_max !== null
          && effectiveEditingJD.experience_max !== undefined
        );
        // Restore industry type from saved draft
        const industryValue = effectiveEditingJD.industry_type || '';
        setShowCustomExperienceInput(Boolean(experienceValue && !getExperienceLevelByCode(experienceValue)));
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

        setExtractedData(prev => ({
          ...prev,
          mustHaveSkills: effectiveEditingJD.must_have_skills || [],
          niceToHaveSkills: effectiveEditingJD.nice_to_have_skills || [],
          education: educationValue,
          educationRequired: false,  // Default to false - user can enable if needed
          experience: experienceValue,
          experienceRequired: false,  // Default to false - user can enable if needed
          industryType: industryValue,
          industryTypeRequired: false,  // Default to false - user can enable if needed
          department: effectiveEditingJD.department || '',
          salaryFrom: sanitizeExtractedSalary(effectiveEditingJD.salary_min),
          salaryTo: sanitizeExtractedSalary(effectiveEditingJD.salary_max),
          compensationType: (effectiveEditingJD.compensation_type as 'hourly' | 'daily' | 'monthly' | 'yearly') || 'yearly',
          salaryCurrency: normalizeSalaryCurrency(effectiveEditingJD.salary_currency),
          assessmentGuidance: effectiveEditingJD.assessment_guidance || '',
          internalRecruiterComments: effectiveEditingJD.internal_comments ? effectiveEditingJD.internal_comments.split('\n').filter(c => c.trim()) : [],
          mustHaveComments: effectiveEditingJD.must_have_comments || [],
          niceToHaveComments: effectiveEditingJD.nice_to_have_comments || [],
          certifications: effectiveEditingJD.certifications || [],
          domainKeywords: effectiveEditingJD.domain_keywords || [],
          allowOverqualified: effectiveEditingJD.allow_overqualified ?? false,
          employmentType: (effectiveEditingJD.employment_type as ExtractedData['employmentType']) || 'full_time',
          workModel: (effectiveEditingJD.remote_type as ExtractedData['workModel']) || 'onsite',
          locations: effectiveEditingJD.locations?.map(loc => ({
            // Reconstruct "City, State" format for UI dropdown matching
            city: loc.state ? `${loc.city}, ${loc.state}` : loc.city,
            radius: loc.radius_km?.toString() || '50',
            country: (loc.country === 'US' ? 'US' : 'IN') as 'IN' | 'US',
          })) || [],
          locationsRequired: effectiveEditingJD.locations?.some(loc => loc.is_required) || false,
        }));

        // Sync the standalone country dropdown to the first saved location's country
        const firstCountry = effectiveEditingJD.locations?.[0]?.country;
        if (firstCountry === 'US' || firstCountry === 'IN') {
          setLocationCountry(firstCountry);
        }

        console.log('[TalentFlow] Extracted data loaded successfully from database');
      }
    }
  }, [effectiveEditingJD]);

  // Take snapshot of extractedData when first entering step 2 (for change detection in handlePublish)
  useEffect(() => {
    if (step === 'extract' && step2DataSnapshot.current === '') {
      step2DataSnapshot.current = JSON.stringify(extractedData);
    }
  }, [step, extractedData]);

  // FIX-003: Show loading state when fetching JD in embedded mode
  if (loadingJD) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-slate-400 font-medium">Loading job description...</p>
        </div>
      </div>
    );
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
  const isAiInterviewFlow = breadcrumbItems?.some(item => item.href === '/recruitment/ai-interviews') ?? false;
  const createAnotherJdUrl = isAiInterviewFlow
    ? '/recruitment/jd-creation?from=ai-interview'
    : '/recruitment/jd-creation';
  const viewPublishedJdUrl = publishedJdId
    ? `/recruitment/job-details?id=${publishedJdId}${isAiInterviewFlow ? '&from=ai-interview' : ''}`
    : '';

  return (
    <>
      <div className="h-full overflow-x-hidden overflow-y-auto bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px] space-y-4 md:space-y-5">

        {/* Content Card: Breadcrumb + Title + Step Indicator + warning + step content (AI-Generated JD, Manual Input, Job Details, Generated JD) */}
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">

          {/* Breadcrumb + Title */}
          {breadcrumbItems && breadcrumbItems.length > 0 && (
            <PageBreadcrumb className="mb-4 sm:mb-5" items={breadcrumbItems} />
          )}
          <div className="flex items-start gap-3 min-w-0 mb-4 sm:mb-6">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <Briefcase className="h-4 w-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight mb-1">
                {isEditingPublished ? 'Create New Version' : isEditingDraft ? 'Edit Draft' : 'Job Description Creation'}
              </h1>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {isEditingPublished
                  ? 'Editing a published JD creates a new draft. The original remains unchanged.'
                  : isEditingDraft
                  ? 'Continue editing your draft job description'
                  : 'Create professional job descriptions with AI-powered extraction'}
              </p>
            </div>
          </div>

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
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <Wand2 className={`w-5 h-5 sm:w-6 sm:h-6 ${mode === 'ai' ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'}`} />
                  <h3 className="font-medium text-sm sm:text-base text-gray-900 dark:text-slate-50">
                    AI-Generated JD
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-left text-gray-600 dark:text-slate-400">
                  Let AI create a professional job description based on your inputs
                </p>
              </button>

              <button
                onClick={() => setMode('manual')}
                className={`flex-1 p-4 sm:p-6 rounded-xl border-2 transition-all ${
                  mode === 'manual'
                    ? 'border-brand-blue/40 bg-brand-blue/5 shadow-md shadow-brand-blue/10'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <Edit2 className={`w-5 h-5 sm:w-6 sm:h-6 ${mode === 'manual' ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'}`} />
                  <h3 className="font-medium text-sm sm:text-base text-gray-900 dark:text-slate-50">
                    Manual Input
                  </h3>
                </div>
                <p className={`text-xs sm:text-sm text-left ${mode === 'manual' ? 'text-gray-600 dark:text-slate-400' : 'text-gray-600 dark:text-slate-400'}`}>
                  Write or paste your own job description
                </p>
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
                      {autosaveStatus === 'saved' && (
                        <span className="flex items-center gap-1.5 text-green-600">
                          <Cloud className="w-4 h-4" />
                          Draft saved
                        </span>
                      )}
                      {autosaveStatus === 'error' && (
                        <span className="flex items-center gap-1.5 text-red-500">
                          <CloudOff className="w-4 h-4" />
                          Save failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Job Title<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        maxLength={VALIDATION.JOB_TITLE.max}
                        placeholder="e.g., Senior Java Developer – Banking Domain"
                        disabled={isJDInUse}
                        className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black ${
                          isJDInUse
                            ? 'bg-gray-100 cursor-not-allowed'
                            : hasJobTitleValidationError
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-200'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${hasJobTitleValidationError ? 'text-red-500' : isJobTitlePendingValidation ? 'text-gray-500' : getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length === 0 && `Job Title is required (min ${VALIDATION.JOB_TITLE.min} characters)`}
                          {jobTitle.length > 0 && jobTitleValidationError && jobTitleValidationError}
                          {jobTitle.length > 0 && !jobTitleValidationError && jobTitle.length < VALIDATION.JOB_TITLE.min && `Min ${VALIDATION.JOB_TITLE.min} characters required (${VALIDATION.JOB_TITLE.min - jobTitle.length} more)`}
                          {jobTitle.length >= VALIDATION.JOB_TITLE.min && !jobTitleValidationError && !jobTitleLengthInvalid && isJobTitlePendingValidation && 'Validating job title...'}
                        </p>
                        <p className={`text-xs ${hasJobTitleValidationError ? 'text-red-500' : isJobTitlePendingValidation ? 'text-gray-500' : getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
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
                        AI Prompt – Quick Job Details <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        maxLength={VALIDATION.AI_PROMPT.max}
                        placeholder="Describe what you're looking for in this role... e.g., 'We need a senior full-stack developer with React and Node.js experience, 5+ years, remote position, who can lead a team of 3 developers'"
                        rows={12}
                        disabled={isJDInUse}
                        className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black placeholder-gray-500 ${
                          isJDInUse
                            ? 'bg-gray-100 cursor-not-allowed'
                            : aiPrompt.trim().length > VALIDATION.AI_PROMPT.max || Boolean(aiPromptValidationError)
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-200'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${aiPromptValidationError || (aiPrompt.trim().length > 0 && aiPrompt.trim().length < VALIDATION.AI_PROMPT.min) ? 'text-red-500' : 'text-gray-500'}`}>
                          {aiPrompt.trim().length === 0 && `Min ${VALIDATION.AI_PROMPT.min} characters required`}
                          {aiPrompt.trim().length > 0 && aiPrompt.trim().length < VALIDATION.AI_PROMPT.min && `${VALIDATION.AI_PROMPT.min - aiPrompt.trim().length} more characters needed`}
                          {aiPrompt.trim().length >= VALIDATION.AI_PROMPT.min && aiPromptValidationError && aiPromptValidationError}
                        </p>
                        <p className={`text-xs ${aiPrompt.trim().length > VALIDATION.AI_PROMPT.max || aiPromptValidationError ? 'text-red-500' : 'text-gray-500'}`}>
                          {aiPrompt.trim().length}/{VALIDATION.AI_PROMPT.max}
                        </p>
                      </div>
                    </div>

                    {/* Quota Warning */}
                    {quotaChecked && !hasQuota && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800">Job Quota Exceeded</p>
                          <p className="text-xs text-red-600">
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

                    <button
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
                      className="w-full flex items-center justify-center gap-2 bg-brand-blue text-white px-5 py-2.5 rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Wand2 className="w-5 h-5" />
                      {isGenerating ? (
                        <span className="animate-pulse">Generating with AI...</span>
                      ) : (generatedJD && !generatedJD.startsWith('[AI Prompt - Pending Generation]')) ? (
                        'Regenerate Job Description'
                      ) : (
                        'Generate Job Description'
                      )}
                    </button>
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
                      {autosaveStatus === 'saved' && (
                        <span className="flex items-center gap-1.5 text-green-600">
                          <Cloud className="w-4 h-4" />
                          Draft saved
                        </span>
                      )}
                      {autosaveStatus === 'error' && (
                        <span className="flex items-center gap-1.5 text-red-500">
                          <CloudOff className="w-4 h-4" />
                          Save failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Job Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        maxLength={VALIDATION.JOB_TITLE.max}
                        placeholder="e.g., Senior Java Developer"
                        disabled={isJDInUse}
                        className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black ${
                          isJDInUse
                            ? 'bg-gray-100 cursor-not-allowed'
                            : hasJobTitleValidationError
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-200'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${hasJobTitleValidationError ? 'text-red-500' : isJobTitlePendingValidation ? 'text-gray-500' : getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length > 0 && jobTitleValidationError && jobTitleValidationError}
                          {jobTitle.length > 0 && !jobTitleValidationError && jobTitle.length < VALIDATION.JOB_TITLE.min && `Min ${VALIDATION.JOB_TITLE.min} characters required`}
                          {jobTitle.length >= VALIDATION.JOB_TITLE.min && !jobTitleValidationError && !jobTitleLengthInvalid && isJobTitlePendingValidation && 'Validating job title...'}
                        </p>
                        <p className={`text-xs ${hasJobTitleValidationError ? 'text-red-500' : isJobTitlePendingValidation ? 'text-gray-500' : getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length}/{VALIDATION.JOB_TITLE.max}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Job Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={manualJD}
                        onChange={(e) => setManualJD(e.target.value)}
                        maxLength={VALIDATION.MANUAL_JD.max}
                        placeholder="Paste or write your job description here..."
                        rows={20}
                        className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-black placeholder-gray-500 ${
                          manualJD.length > 0 && (!isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max) || !containsMeaningfulText(manualJD) || containsCodePatterns(manualJD) || !isEnglishOnly(manualJD))
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-200'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${manualJD.length > 0 && ((isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max) && (!containsMeaningfulText(manualJD) || containsCodePatterns(manualJD) || !isEnglishOnly(manualJD))) || !isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max)) ? 'text-red-500' : getCharCountColor(manualJD.length, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max)}`}>
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
                      <button
                        onClick={() => {
                          const text = mode === 'ai' ? generatedJD : manualJD;
                          navigator.clipboard.writeText(text);
                          toast.success({ title: 'Copied!', description: 'Job description copied to clipboard' });
                        }}
                        className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
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
                        className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                        title="Download as text file"
                      >
                        <Download className="w-4 h-4" />
                      </button>
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
                        <div className="flex items-center gap-2 p-3 mt-2 bg-red-50 text-red-700 rounded-md border border-red-200">
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
                            className={`w-full h-[300px] sm:h-[400px] lg:h-[600px] px-3 sm:px-4 py-2 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue font-mono text-xs sm:text-sm text-black ${
                              generatedJD.length > 0 && !isEnglishOnly(generatedJD)
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-200 dark:border-slate-700'
                            } ${isJDInUse ? 'bg-gray-100 dark:bg-slate-800 cursor-not-allowed' : ''}`}
                          />
                          {generatedJD.length > 0 && !isEnglishOnly(generatedJD) && (
                            <p className="mt-1 text-xs text-red-500">
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
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 px-4">
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
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 px-4">
                          Paste or write your JD in the left panel
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-end mt-4 sm:mt-6">
              <button
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
                className="flex items-center gap-2 bg-brand-blue hover:bg-brand-blue-2 text-white px-4 py-2 rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isStreaming ? 'Generating...' : isExtracting ? 'Extracting...' : 'Next'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* Step 2: Extract & Modify Skills */}
        {step === 'extract' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Drag & Drop Tips */}
            {showDragTips && (
              <div className="bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-xl p-3 sm:p-5">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex-shrink-0 hidden sm:block">
                    <div className="w-10 h-10 rounded-lg bg-brand-blue shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex items-center justify-center">
                      <Info className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm sm:text-base text-brand-blue font-medium">💡 Pro Tips</h3>
                      <button
                        onClick={() => setShowDragTips(false)}
                        className="text-brand-blue hover:text-brand-blue-2 text-xs sm:text-sm flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        Dismiss
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 mt-0.5 text-brand-blue flex-shrink-0" />
                        <div>
                          <strong>Drag & Drop:</strong> Hover over a skill and grab the grip icon to drag it between Must-Have and Nice-to-Have
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Edit2 className="w-4 h-4 mt-0.5 text-brand-blue flex-shrink-0" />
                        <div>
                          <strong>Click to Edit:</strong> Click on any skill or comment text to edit it inline. Press Enter to save, Escape to cancel
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-brand-blue mt-0.5 flex-shrink-0">← →</span>
                        <div>
                          <strong>Arrow Buttons:</strong> Use arrow buttons to quickly move skills between categories
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
                    <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                      You&apos;ve made changes to skills or comments. The JD will be regenerated when you continue to Review.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 mb-4 sm:mb-6">Extracted Information</h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-4 sm:mb-6">
                {isRegenerating
                  ? 'Processing... Fields are temporarily read-only.'
                  : 'AI has extracted the following information from your JD. You can modify, add, or remove items.'
                }
              </p>

              {/* Skills & Comments Section - Single Row with 3 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                {/* Column 1: Must-Have Skills */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Must-Have Skills <span className="text-red-500">*</span> ({extractedData.mustHaveSkills?.length || 0})</h3>
                    {!isRegenerating && (
                      <button
                        onClick={() => setEditingCategory('mustHave')}
                        className="text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900 flex items-center gap-1"
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
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddSkill('mustHaveSkills')}
                        className="px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  )}
                  <DroppableSkillsContainer
                    category="mustHaveSkills"
                    onDrop={(skill, fromCategory) => handleDropSkill(skill, fromCategory, 'mustHaveSkills')}
                  >
                    {extractedData.mustHaveSkills.map((skill, index) => (
                      <DraggableSkill
                        key={index}
                        skill={skill}
                        index={index}
                        category="mustHaveSkills"
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
                  {validationErrors.mustHaveSkills && (
                    <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.mustHaveSkills}
                    </p>
                  )}
                </div>

                {/* Column 2: Nice-to-Have Skills */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Nice-to-Have Skills ({extractedData.niceToHaveSkills?.length || 0})</h3>
                    {!isRegenerating && (
                      <button
                        onClick={() => setEditingCategory('niceToHave')}
                        className="text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900 flex items-center gap-1"
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
                      <button
                        onClick={() => handleAddSkill('niceToHaveSkills')}
                        className="px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  )}
                  <DroppableSkillsContainer
                    category="niceToHaveSkills"
                    onDrop={(skill, fromCategory) => handleDropSkill(skill, fromCategory, 'niceToHaveSkills')}
                  >
                    {extractedData.niceToHaveSkills.map((skill, index) => (
                      <DraggableSkill
                        key={index}
                        skill={skill}
                        index={index}
                        category="niceToHaveSkills"
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
                </div>

                {/* Column 3: Comments (Split - Must-Have on top, Nice-to-Have below) */}
                <div className="space-y-6">
                  {/* Must-Have Comments */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Must-Have Comments ({extractedData.mustHaveComments?.length || 0})</h3>
                      {!isRegenerating && (
                        <button
                          onClick={() => setEditingCategory('comments')}
                          className="text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900 flex items-center gap-1"
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
                          onChange={(e) => applyEnglishOnlyInputChange(e.target.value, 'Must-have comments', setNewComment)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                          placeholder="Enter comment..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                          autoFocus
                        />
                        <button
                          onClick={handleAddComment}
                          className="px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    )}
                    <DroppableCommentsContainer
                      category="mustHaveComments"
                      onDrop={(comment, fromCategory) => handleDropComment(comment, fromCategory, 'mustHaveComments')}
                    >
                      {extractedData.mustHaveComments.map((comment, index) => (
                        <DraggableComment
                          key={index}
                          comment={comment}
                          index={index}
                          category="mustHaveComments"
                          onMove={handleMoveComment}
                          onRemove={handleRemoveCommentByCategory}
                          onStartEdit={handleStartEditCommentByCategory}
                          isEditing={editingCommentIndex === index}
                          editingValue={editingCommentValue}
                          onEditChange={(value) => applyEnglishOnlyInputChange(value, 'Must-have comments', setEditingCommentValue)}
                          onSaveEdit={handleSaveEditComment}
                          onCancelEdit={handleCancelEditComment}
                          readOnly={isRegenerating}
                        />
                      ))}
                    </DroppableCommentsContainer>
                    {validationErrors.mustHaveComments && (
                      <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {validationErrors.mustHaveComments}
                      </p>
                    )}
                  </div>

                  {/* Nice-to-Have Comments */}
                  <div>
                    {(() => { console.log('[DEBUG] Rendering Nice-to-Have Comments, count:', extractedData.niceToHaveComments?.length, 'data:', extractedData.niceToHaveComments); return null; })()}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50">Nice-to-Have Comments ({extractedData.niceToHaveComments?.length || 0})</h3>
                      {!isRegenerating && (
                        <button
                          onClick={() => setEditingCategory('nice-comments')}
                          className="text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900 flex items-center gap-1"
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
                          onChange={(e) => applyEnglishOnlyInputChange(e.target.value, 'Nice-to-have comments', setNewComment)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddNiceComment()}
                          placeholder="Enter nice-to-have comment..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                          autoFocus
                        />
                        <button
                          onClick={handleAddNiceComment}
                          className="px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    )}
                    <DroppableCommentsContainer
                      category="niceToHaveComments"
                      onDrop={(comment, fromCategory) => handleDropComment(comment, fromCategory, 'niceToHaveComments')}
                    >
                      {(extractedData.niceToHaveComments || []).map((comment, index) => (
                        <DraggableComment
                          key={index}
                          comment={comment}
                          index={index}
                          category="niceToHaveComments"
                          onMove={handleMoveComment}
                          onRemove={handleRemoveCommentByCategory}
                          onStartEdit={handleStartEditCommentByCategory}
                          isEditing={editingNiceCommentIndex === index}
                          editingValue={editingNiceCommentValue}
                          onEditChange={(value) => applyEnglishOnlyInputChange(value, 'Nice-to-have comments', setEditingNiceCommentValue)}
                          onSaveEdit={handleSaveEditNiceComment}
                          onCancelEdit={handleCancelEditNiceComment}
                          readOnly={isRegenerating}
                        />
                      ))}
                    </DroppableCommentsContainer>
                  </div>
                </div>
              </div>

              {/* Experience, Education, Salary - 3 Column Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                {/* Experience */}
                <div>
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Experience <span className="text-red-500">*</span></h3>
                  <select
                    value={experienceSelectValue}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      if (nextValue === CUSTOM_EXPERIENCE_VALUE) {
                        setShowCustomExperienceInput(true);
                        setExperienceYearsExplicit(false);
                        setExtractedData(prev => ({
                          ...prev,
                          experience: getExperienceLevelByCode(prev.experience) ? '' : prev.experience,
                        }));
                        markExtractedDataModified();
                        return;
                      }

                      setShowCustomExperienceInput(false);
                      // A level picked from the dropdown is a deliberate user choice,
                      // and each level carries a definitional year range (e.g. "Junior
                      // Level" = 2-4 years). Mark years as explicit so the range
                      // persists into Step 3 and the published JD. (Without this, the
                      // selected experience was silently dropped before reaching Step 3.)
                      const selectedLevel = getExperienceLevelByCode(nextValue);
                      const levelHasYears = !!selectedLevel
                        && (selectedLevel.min_years != null || selectedLevel.max_years != null);
                      setExperienceYearsExplicit(levelHasYears);
                      setExtractedData(prev => ({ ...prev, experience: nextValue }));
                      markExtractedDataModified();
                      // Clear validation error when user makes a selection
                      if (nextValue) {
                        setValidationErrors(prev => ({ ...prev, experience: undefined }));
                      }
                    }}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black mb-3 ${
                      validationErrors.experience ? 'border-red-500' : 'border-gray-200'
                    } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={masterDataLoading || isRegenerating}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select experience level'}</option>
                    {experienceLevels.map((level) => (
                      <option key={level.id} value={level.code}>{level.label}</option>
                    ))}
                    <option value={CUSTOM_EXPERIENCE_VALUE}>Custom experience</option>
                  </select>
                  {showCustomExperienceInput && (
                    <input
                      type="text"
                      value={selectedExperienceLevel ? '' : extractedData.experience}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        if (nextValue && !isEnglishOnly(nextValue)) {
                          setValidationErrors(prev => ({
                            ...prev,
                            experience: 'Custom experience must be written in English only.',
                          }));
                          toast.error({
                            title: 'English only',
                            description: 'Custom experience must be written in English only. Other languages are not supported.',
                          });
                          return;
                        }

                        setExtractedData(prev => ({ ...prev, experience: nextValue }));
                        const customRange = inferExperienceRangeFromCustomValue(nextValue);
                        setExperienceYearsExplicit(
                          customRange.experienceMin !== undefined || customRange.experienceMax !== undefined
                        );
                        markExtractedDataModified();
                        if (nextValue.trim()) {
                          setValidationErrors(prev => ({ ...prev, experience: undefined }));
                        }
                      }}
                      placeholder="Enter custom experience, e.g. 3-5 years in SaaS"
                      maxLength={50}
                      className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black mb-3 ${
                        validationErrors.experience ? 'border-red-500' : 'border-gray-200'
                      } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      disabled={isRegenerating}
                    />
                  )}
                  {validationErrors.experience && (
                    <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.experience}
                    </p>
                  )}
                  <label className={`flex items-center gap-2 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.experienceRequired)}
                      onChange={(e) => { setExtractedData(prev => ({ ...prev, experienceRequired: e.target.checked })); markExtractedDataModified(); }}
                      className="w-4 h-4 text-brand-blue border-gray-300 rounded focus:ring-brand-blue/40"
                      disabled={isRegenerating}
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Required</span>
                  </label>
                </div>

                {/* Education */}
                <div>
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Education <span className="text-red-500">*</span></h3>
                  <select
                    value={extractedData.education}
                    onChange={(e) => {
                      setExtractedData(prev => ({ ...prev, education: e.target.value }));
                      markExtractedDataModified();
                      // Clear validation error when user makes a selection
                      if (e.target.value) {
                        setValidationErrors(prev => ({ ...prev, education: undefined }));
                      }
                    }}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black mb-3 ${
                      validationErrors.education ? 'border-red-500' : 'border-gray-200'
                    } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={masterDataLoading || isRegenerating}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select education level'}</option>
                    {educationLevels.map((level) => (
                      <option key={level.id} value={level.code}>{level.label}</option>
                    ))}
                  </select>
                  {validationErrors.education && (
                    <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.education}
                    </p>
                  )}
                  <label className={`flex items-center gap-2 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.educationRequired)}
                      onChange={(e) => { setExtractedData(prev => ({ ...prev, educationRequired: e.target.checked })); markExtractedDataModified(); }}
                      className="w-4 h-4 text-brand-blue border-gray-300 rounded focus:ring-brand-blue/40"
                      disabled={isRegenerating}
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Required</span>
                  </label>
                </div>

                {/* Industry Type */}
                <div>
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Industry Type <span className="text-red-500">*</span></h3>
                  <select
                    value={extractedData.industryType}
                    onChange={(e) => {
                      setExtractedData(prev => ({ ...prev, industryType: e.target.value }));
                      markExtractedDataModified();
                      // Clear validation error when user makes a selection
                      if (e.target.value) {
                        setValidationErrors(prev => ({ ...prev, industryType: undefined }));
                      }
                    }}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black mb-3 ${
                      validationErrors.industryType ? 'border-red-500' : 'border-gray-200'
                    } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={masterDataLoading || isRegenerating}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select industry type'}</option>
                    {industryTypes.map((type) => (
                      <option key={type.id} value={type.code}>{type.label}</option>
                    ))}
                  </select>
                  {validationErrors.industryType && (
                    <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.industryType}
                    </p>
                  )}
                  <label className={`flex items-center gap-2 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.industryTypeRequired)}
                      onChange={(e) => { setExtractedData(prev => ({ ...prev, industryTypeRequired: e.target.checked })); markExtractedDataModified(); }}
                      className="w-4 h-4 text-brand-blue border-gray-300 rounded focus:ring-brand-blue/40"
                      disabled={isRegenerating}
                    />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Required</span>
                  </label>
                </div>
              </div>

              {/* Salary */}
              <div className="mb-6 sm:mb-8">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Salary Range</h3>
                  <div className="flex items-center gap-4">
                    <label className={`flex items-center gap-1.5 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="salaryCurrency"
                        value="INR"
                        checked={extractedData.salaryCurrency === 'INR'}
                        onChange={() => { setExtractedData(prev => ({ ...prev, salaryCurrency: 'INR' })); markExtractedDataModified(); }}
                        className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40"
                        disabled={isRegenerating}
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">INR (₹)</span>
                    </label>
                    <label className={`flex items-center gap-1.5 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="salaryCurrency"
                        value="USD"
                        checked={extractedData.salaryCurrency === 'USD'}
                        onChange={() => { setExtractedData(prev => ({ ...prev, salaryCurrency: 'USD' })); markExtractedDataModified(); }}
                        className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40"
                        disabled={isRegenerating}
                      />
                      <span className="text-sm text-gray-700 dark:text-slate-300">USD ($)</span>
                    </label>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{getSalaryCurrencySymbol(extractedData.salaryCurrency)}</span>
                      <input
                        type="text"
                        value={extractedData.salaryFrom || ''}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          if (newValue.replace(/\D/g, '').length > 8) return;
                          setExtractedData(prev => ({ ...prev, salaryFrom: newValue }));
                          markExtractedDataModified();
                          const error = validateSalaryRange(newValue, extractedData.salaryTo || '');
                          setValidationErrors(prev => ({ ...prev, salaryRange: error }));
                        }}
                        placeholder="From (e.g., 50000)"
                        className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black ${
                          validationErrors.salaryRange ? 'border-red-500' : 'border-gray-200'
                        } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        disabled={isRegenerating}
                        readOnly={isRegenerating}
                      />
                    </div>
                    <span className="text-gray-400 dark:text-slate-500 hidden sm:block">–</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{getSalaryCurrencySymbol(extractedData.salaryCurrency)}</span>
                      <input
                        type="text"
                        value={extractedData.salaryTo || ''}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          if (newValue.replace(/\D/g, '').length > 8) return;
                          setExtractedData(prev => ({ ...prev, salaryTo: newValue }));
                          markExtractedDataModified();
                          const error = validateSalaryRange(extractedData.salaryFrom || '', newValue);
                          setValidationErrors(prev => ({ ...prev, salaryRange: error }));
                        }}
                        placeholder="To (e.g., 100000)"
                        className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black ${
                          validationErrors.salaryRange ? 'border-red-500' : 'border-gray-200'
                        } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        disabled={isRegenerating}
                        readOnly={isRegenerating}
                      />
                    </div>
                    <select
                      value={extractedData.compensationType}
                      onChange={(e) => { setExtractedData(prev => ({ ...prev, compensationType: e.target.value as 'hourly' | 'daily' | 'monthly' | 'yearly' })); markExtractedDataModified(); }}
                      className={`px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      disabled={isRegenerating}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  {validationErrors.salaryRange && (
                    <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {validationErrors.salaryRange}
                    </p>
                  )}
                </div>
              </div>

              {/* Locations Section */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Locations</h3>
                  <label className={`flex items-center gap-1.5 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={extractedData.locationsRequired}
                      onChange={(e) => { setExtractedData(prev => ({ ...prev, locationsRequired: e.target.checked })); markExtractedDataModified(); }}
                      className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500"
                      disabled={isRegenerating}
                    />
                    <span className="text-gray-500 dark:text-slate-500 text-xs">(Required)</span>
                  </label>
                </div>

                {/* Inline Add Location - Country, State, City, Radius in one line - Hidden when read-only */}
                {!isRegenerating && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:gap-3 mb-4">
                  {/* Country Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1">Country</label>
                    <select
                      value={locationCountry}
                      onChange={(e) => {
                        setLocationCountry(e.target.value as 'IN' | 'US');
                        setLocationStateFilter('all');
                        setNewLocation(prev => ({ ...prev, city: '' }));
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black"
                    >
                      <option value="IN">India</option>
                      <option value="US">United States</option>
                    </select>
                  </div>

                  {/* State Filter Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1">State</label>
                    <select
                      value={locationStateFilter}
                      onChange={(e) => {
                        setLocationStateFilter(e.target.value);
                        setNewLocation(prev => ({ ...prev, city: '' }));
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black"
                    >
                      <option value="all">All States</option>
                      {locationCountry === 'US' && usStates.map((s) => (
                        <option key={s.isoCode} value={s.name}>{s.name}</option>
                      ))}
                      {locationCountry === 'IN' && (<>
                      <option value="Delhi NCR">Delhi NCR</option>
                      <option value="Andaman And Nicobar Islands">Andaman And Nicobar Islands</option>
                      <option value="Andhra Pradesh">Andhra Pradesh</option>
                      <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                      <option value="Assam">Assam</option>
                      <option value="Bihar">Bihar</option>
                      <option value="Chandigarh">Chandigarh</option>
                      <option value="Chhattisgarh">Chhattisgarh</option>
                      <option value="Delhi">Delhi</option>
                      <option value="Goa">Goa</option>
                      <option value="Gujarat">Gujarat</option>
                      <option value="Haryana">Haryana</option>
                      <option value="Himachal Pradesh">Himachal Pradesh</option>
                      <option value="Jammu And Kashmir">Jammu And Kashmir</option>
                      <option value="Jharkhand">Jharkhand</option>
                      <option value="Karnataka">Karnataka</option>
                      <option value="Kerala">Kerala</option>
                      <option value="Ladakh">Ladakh</option>
                      <option value="Lakshadweep">Lakshadweep</option>
                      <option value="Madhya Pradesh">Madhya Pradesh</option>
                      <option value="Maharashtra">Maharashtra</option>
                      <option value="Manipur">Manipur</option>
                      <option value="Meghalaya">Meghalaya</option>
                      <option value="Mizoram">Mizoram</option>
                      <option value="Nagaland">Nagaland</option>
                      <option value="Odisha">Odisha</option>
                      <option value="Puducherry">Puducherry</option>
                      <option value="Punjab">Punjab</option>
                      <option value="Rajasthan">Rajasthan</option>
                      <option value="Sikkim">Sikkim</option>
                      <option value="Tamil Nadu">Tamil Nadu</option>
                      <option value="Telangana">Telangana</option>
                      <option value="The Dadra And Nagar Haveli And Daman And Diu">The Dadra And Nagar Haveli And Daman And Diu</option>
                      <option value="Tripura">Tripura</option>
                      <option value="Uttar Pradesh">Uttar Pradesh</option>
                      <option value="Uttarakhand">Uttarakhand</option>
                      <option value="West Bengal">West Bengal</option>
                      <option value="Remote">Remote/Hybrid</option>
                      </>)}
                    </select>
                  </div>

                  {/* City Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1">City</label>
                    <select
                      value={newLocation.city}
                      onChange={(e) => setNewLocation(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black"
                    >
                      <option value="">Select a city</option>
                      {locationCountry === 'US' && (() => {
                        const selectedUsState = locationStateFilter === 'all'
                          ? null
                          : usStates.find((s) => s.name === locationStateFilter);
                        const statesToShow = selectedUsState ? [selectedUsState] : usStates;
                        return statesToShow.map((s) => {
                          const cities = usCitiesByState[s.isoCode] || [];
                          if (!cities.length) return null;
                          return (
                            <optgroup key={s.isoCode} label={s.name}>
                              {cities.map((city, idx) => (
                                <option key={`${s.isoCode}-${idx}`} value={`${city}, ${s.name}`}>{city}</option>
                              ))}
                            </optgroup>
                          );
                        });
                      })()}
                      {locationCountry === 'IN' && (<>
                      {(locationStateFilter === 'all' || locationStateFilter === 'Delhi NCR') && (
                        <optgroup label="Delhi NCR">
                          <option value="Delhi NCR">Delhi NCR (All)</option>
                          <option value="New Delhi, Delhi">New Delhi</option>
                          <option value="Gurugram, Haryana">Gurugram (Gurgaon)</option>
                          <option value="Gautam Buddha Nagar, Uttar Pradesh">Noida / Greater Noida</option>
                          <option value="Ghaziabad, Uttar Pradesh">Ghaziabad</option>
                          <option value="Faridabad, Haryana">Faridabad</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Andaman And Nicobar Islands') && (
                        <optgroup label="Andaman And Nicobar Islands">
                          <option value="Nicobars, Andaman And Nicobar Islands">Nicobars</option>
                          <option value="North And Middle Andaman, Andaman And Nicobar Islands">North And Middle Andaman</option>
                          <option value="South Andamans, Andaman And Nicobar Islands">South Andamans</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Andhra Pradesh') && (
                        <optgroup label="Andhra Pradesh">
                          <option value="Anantapur, Andhra Pradesh">Anantapur</option>
                          <option value="Chittoor, Andhra Pradesh">Chittoor</option>
                          <option value="East Godavari, Andhra Pradesh">East Godavari</option>
                          <option value="Guntur, Andhra Pradesh">Guntur</option>
                          <option value="Krishna, Andhra Pradesh">Krishna</option>
                          <option value="Kurnool, Andhra Pradesh">Kurnool</option>
                          <option value="Prakasam, Andhra Pradesh">Prakasam</option>
                          <option value="Spsr Nellore, Andhra Pradesh">Spsr Nellore</option>
                          <option value="Srikakulam, Andhra Pradesh">Srikakulam</option>
                          <option value="Visakhapatanam, Andhra Pradesh">Visakhapatanam</option>
                          <option value="Vizianagaram, Andhra Pradesh">Vizianagaram</option>
                          <option value="West Godavari, Andhra Pradesh">West Godavari</option>
                          <option value="Y.S.R., Andhra Pradesh">Y.S.R.</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Arunachal Pradesh') && (
                        <optgroup label="Arunachal Pradesh">
                          <option value="Anjaw, Arunachal Pradesh">Anjaw</option>
                          <option value="Changlang, Arunachal Pradesh">Changlang</option>
                          <option value="Dibang Valley, Arunachal Pradesh">Dibang Valley</option>
                          <option value="East Kameng, Arunachal Pradesh">East Kameng</option>
                          <option value="East Siang, Arunachal Pradesh">East Siang</option>
                          <option value="Kamle, Arunachal Pradesh">Kamle</option>
                          <option value="Kra Daadi, Arunachal Pradesh">Kra Daadi</option>
                          <option value="Kurung Kumey, Arunachal Pradesh">Kurung Kumey</option>
                          <option value="Leparada, Arunachal Pradesh">Leparada</option>
                          <option value="Lohit, Arunachal Pradesh">Lohit</option>
                          <option value="Longding, Arunachal Pradesh">Longding</option>
                          <option value="Lower Dibang Valley, Arunachal Pradesh">Lower Dibang Valley</option>
                          <option value="Lower Siang, Arunachal Pradesh">Lower Siang</option>
                          <option value="Lower Subansiri, Arunachal Pradesh">Lower Subansiri</option>
                          <option value="Namsai, Arunachal Pradesh">Namsai</option>
                          <option value="Pakke Kessang, Arunachal Pradesh">Pakke Kessang</option>
                          <option value="Papum Pare, Arunachal Pradesh">Papum Pare</option>
                          <option value="Shi Yomi, Arunachal Pradesh">Shi Yomi</option>
                          <option value="Siang, Arunachal Pradesh">Siang</option>
                          <option value="Tawang, Arunachal Pradesh">Tawang</option>
                          <option value="Tirap, Arunachal Pradesh">Tirap</option>
                          <option value="Upper Siang, Arunachal Pradesh">Upper Siang</option>
                          <option value="Upper Subansiri, Arunachal Pradesh">Upper Subansiri</option>
                          <option value="West Kameng, Arunachal Pradesh">West Kameng</option>
                          <option value="West Siang, Arunachal Pradesh">West Siang</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Assam') && (
                        <optgroup label="Assam">
                          <option value="Baksa, Assam">Baksa</option>
                          <option value="Barpeta, Assam">Barpeta</option>
                          <option value="Biswanath, Assam">Biswanath</option>
                          <option value="Bongaigaon, Assam">Bongaigaon</option>
                          <option value="Cachar, Assam">Cachar</option>
                          <option value="Charaideo, Assam">Charaideo</option>
                          <option value="Chirang, Assam">Chirang</option>
                          <option value="Darrang, Assam">Darrang</option>
                          <option value="Dhemaji, Assam">Dhemaji</option>
                          <option value="Dhubri, Assam">Dhubri</option>
                          <option value="Dibrugarh, Assam">Dibrugarh</option>
                          <option value="Dima Hasao, Assam">Dima Hasao</option>
                          <option value="Goalpara, Assam">Goalpara</option>
                          <option value="Golaghat, Assam">Golaghat</option>
                          <option value="Hailakandi, Assam">Hailakandi</option>
                          <option value="Hojai, Assam">Hojai</option>
                          <option value="Jorhat, Assam">Jorhat</option>
                          <option value="Kamrup, Assam">Kamrup</option>
                          <option value="Kamrup Metro, Assam">Kamrup Metro</option>
                          <option value="Karbi Anglong, Assam">Karbi Anglong</option>
                          <option value="Karimganj, Assam">Karimganj</option>
                          <option value="Kokrajhar, Assam">Kokrajhar</option>
                          <option value="Lakhimpur, Assam">Lakhimpur</option>
                          <option value="Majuli, Assam">Majuli</option>
                          <option value="Marigaon, Assam">Marigaon</option>
                          <option value="Nagaon, Assam">Nagaon</option>
                          <option value="Nalbari, Assam">Nalbari</option>
                          <option value="Sivasagar, Assam">Sivasagar</option>
                          <option value="Sonitpur, Assam">Sonitpur</option>
                          <option value="South Salmara Mancachar, Assam">South Salmara Mancachar</option>
                          <option value="Tinsukia, Assam">Tinsukia</option>
                          <option value="Udalguri, Assam">Udalguri</option>
                          <option value="West Karbi Anglong, Assam">West Karbi Anglong</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Bihar') && (
                        <optgroup label="Bihar">
                          <option value="Araria, Bihar">Araria</option>
                          <option value="Arwal, Bihar">Arwal</option>
                          <option value="Aurangabad, Bihar">Aurangabad</option>
                          <option value="Banka, Bihar">Banka</option>
                          <option value="Begusarai, Bihar">Begusarai</option>
                          <option value="Bhagalpur, Bihar">Bhagalpur</option>
                          <option value="Bhojpur, Bihar">Bhojpur</option>
                          <option value="Buxar, Bihar">Buxar</option>
                          <option value="Darbhanga, Bihar">Darbhanga</option>
                          <option value="Gaya, Bihar">Gaya</option>
                          <option value="Gopalganj, Bihar">Gopalganj</option>
                          <option value="Jamui, Bihar">Jamui</option>
                          <option value="Jehanabad, Bihar">Jehanabad</option>
                          <option value="Kaimur (Bhabua), Bihar">Kaimur (Bhabua)</option>
                          <option value="Katihar, Bihar">Katihar</option>
                          <option value="Khagaria, Bihar">Khagaria</option>
                          <option value="Kishanganj, Bihar">Kishanganj</option>
                          <option value="Lakhisarai, Bihar">Lakhisarai</option>
                          <option value="Madhepura, Bihar">Madhepura</option>
                          <option value="Madhubani, Bihar">Madhubani</option>
                          <option value="Munger, Bihar">Munger</option>
                          <option value="Muzaffarpur, Bihar">Muzaffarpur</option>
                          <option value="Nalanda, Bihar">Nalanda</option>
                          <option value="Nawada, Bihar">Nawada</option>
                          <option value="Pashchim Champaran, Bihar">Pashchim Champaran</option>
                          <option value="Patna, Bihar">Patna</option>
                          <option value="Purbi Champaran, Bihar">Purbi Champaran</option>
                          <option value="Purnia, Bihar">Purnia</option>
                          <option value="Rohtas, Bihar">Rohtas</option>
                          <option value="Saharsa, Bihar">Saharsa</option>
                          <option value="Samastipur, Bihar">Samastipur</option>
                          <option value="Saran, Bihar">Saran</option>
                          <option value="Sheikhpura, Bihar">Sheikhpura</option>
                          <option value="Sheohar, Bihar">Sheohar</option>
                          <option value="Sitamarhi, Bihar">Sitamarhi</option>
                          <option value="Siwan, Bihar">Siwan</option>
                          <option value="Supaul, Bihar">Supaul</option>
                          <option value="Vaishali, Bihar">Vaishali</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Chandigarh') && (
                        <optgroup label="Chandigarh">
                          <option value="Chandigarh, Chandigarh">Chandigarh</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Chhattisgarh') && (
                        <optgroup label="Chhattisgarh">
                          <option value="Balod, Chhattisgarh">Balod</option>
                          <option value="Baloda Bazar, Chhattisgarh">Baloda Bazar</option>
                          <option value="Balrampur, Chhattisgarh">Balrampur</option>
                          <option value="Bastar, Chhattisgarh">Bastar</option>
                          <option value="Bemetara, Chhattisgarh">Bemetara</option>
                          <option value="Bijapur, Chhattisgarh">Bijapur</option>
                          <option value="Bilaspur, Chhattisgarh">Bilaspur</option>
                          <option value="Dantewada, Chhattisgarh">Dantewada</option>
                          <option value="Dhamtari, Chhattisgarh">Dhamtari</option>
                          <option value="Durg, Chhattisgarh">Durg</option>
                          <option value="Gariyaband, Chhattisgarh">Gariyaband</option>
                          <option value="Gaurella Pendra Marwahi, Chhattisgarh">Gaurella Pendra Marwahi</option>
                          <option value="Janjgir-Champa, Chhattisgarh">Janjgir-Champa</option>
                          <option value="Jashpur, Chhattisgarh">Jashpur</option>
                          <option value="Kabirdham, Chhattisgarh">Kabirdham</option>
                          <option value="Kanker, Chhattisgarh">Kanker</option>
                          <option value="Kondagaon, Chhattisgarh">Kondagaon</option>
                          <option value="Korba, Chhattisgarh">Korba</option>
                          <option value="Korea, Chhattisgarh">Korea</option>
                          <option value="Mahasamund, Chhattisgarh">Mahasamund</option>
                          <option value="Mungeli, Chhattisgarh">Mungeli</option>
                          <option value="Narayanpur, Chhattisgarh">Narayanpur</option>
                          <option value="Raigarh, Chhattisgarh">Raigarh</option>
                          <option value="Raipur, Chhattisgarh">Raipur</option>
                          <option value="Rajnandgaon, Chhattisgarh">Rajnandgaon</option>
                          <option value="Sukma, Chhattisgarh">Sukma</option>
                          <option value="Surajpur, Chhattisgarh">Surajpur</option>
                          <option value="Surguja, Chhattisgarh">Surguja</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Delhi') && (
                        <optgroup label="Delhi">
                          <option value="Central, Delhi">Central</option>
                          <option value="East, Delhi">East</option>
                          <option value="New Delhi, Delhi">New Delhi</option>
                          <option value="North, Delhi">North</option>
                          <option value="North East, Delhi">North East</option>
                          <option value="North West, Delhi">North West</option>
                          <option value="Shahdara, Delhi">Shahdara</option>
                          <option value="South, Delhi">South</option>
                          <option value="South East, Delhi">South East</option>
                          <option value="South West, Delhi">South West</option>
                          <option value="West, Delhi">West</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Goa') && (
                        <optgroup label="Goa">
                          <option value="North Goa, Goa">North Goa</option>
                          <option value="South Goa, Goa">South Goa</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Gujarat') && (
                        <optgroup label="Gujarat">
                          <option value="Ahmadabad, Gujarat">Ahmadabad</option>
                          <option value="Amreli, Gujarat">Amreli</option>
                          <option value="Anand, Gujarat">Anand</option>
                          <option value="Arvalli, Gujarat">Arvalli</option>
                          <option value="Banas Kantha, Gujarat">Banas Kantha</option>
                          <option value="Bharuch, Gujarat">Bharuch</option>
                          <option value="Bhavnagar, Gujarat">Bhavnagar</option>
                          <option value="Botad, Gujarat">Botad</option>
                          <option value="Chhotaudepur, Gujarat">Chhotaudepur</option>
                          <option value="Dang, Gujarat">Dang</option>
                          <option value="Devbhumi Dwarka, Gujarat">Devbhumi Dwarka</option>
                          <option value="Dohad, Gujarat">Dohad</option>
                          <option value="Gandhinagar, Gujarat">Gandhinagar</option>
                          <option value="Gir Somnath, Gujarat">Gir Somnath</option>
                          <option value="Jamnagar, Gujarat">Jamnagar</option>
                          <option value="Junagadh, Gujarat">Junagadh</option>
                          <option value="Kachchh, Gujarat">Kachchh</option>
                          <option value="Kheda, Gujarat">Kheda</option>
                          <option value="Mahesana, Gujarat">Mahesana</option>
                          <option value="Mahisagar, Gujarat">Mahisagar</option>
                          <option value="Morbi, Gujarat">Morbi</option>
                          <option value="Narmada, Gujarat">Narmada</option>
                          <option value="Navsari, Gujarat">Navsari</option>
                          <option value="Panch Mahals, Gujarat">Panch Mahals</option>
                          <option value="Patan, Gujarat">Patan</option>
                          <option value="Porbandar, Gujarat">Porbandar</option>
                          <option value="Rajkot, Gujarat">Rajkot</option>
                          <option value="Sabar Kantha, Gujarat">Sabar Kantha</option>
                          <option value="Surat, Gujarat">Surat</option>
                          <option value="Surendranagar, Gujarat">Surendranagar</option>
                          <option value="Tapi, Gujarat">Tapi</option>
                          <option value="Vadodara, Gujarat">Vadodara</option>
                          <option value="Valsad, Gujarat">Valsad</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Haryana') && (
                        <optgroup label="Haryana">
                          <option value="Ambala, Haryana">Ambala</option>
                          <option value="Bhiwani, Haryana">Bhiwani</option>
                          <option value="Charki Dadri, Haryana">Charki Dadri</option>
                          <option value="Faridabad, Haryana">Faridabad</option>
                          <option value="Fatehabad, Haryana">Fatehabad</option>
                          <option value="Gurugram, Haryana">Gurugram</option>
                          <option value="Hisar, Haryana">Hisar</option>
                          <option value="Jhajjar, Haryana">Jhajjar</option>
                          <option value="Jind, Haryana">Jind</option>
                          <option value="Kaithal, Haryana">Kaithal</option>
                          <option value="Karnal, Haryana">Karnal</option>
                          <option value="Kurukshetra, Haryana">Kurukshetra</option>
                          <option value="Mahendragarh, Haryana">Mahendragarh</option>
                          <option value="Nuh, Haryana">Nuh</option>
                          <option value="Palwal, Haryana">Palwal</option>
                          <option value="Panchkula, Haryana">Panchkula</option>
                          <option value="Panipat, Haryana">Panipat</option>
                          <option value="Rewari, Haryana">Rewari</option>
                          <option value="Rohtak, Haryana">Rohtak</option>
                          <option value="Sirsa, Haryana">Sirsa</option>
                          <option value="Sonipat, Haryana">Sonipat</option>
                          <option value="Yamunanagar, Haryana">Yamunanagar</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Himachal Pradesh') && (
                        <optgroup label="Himachal Pradesh">
                          <option value="Bilaspur, Himachal Pradesh">Bilaspur</option>
                          <option value="Chamba, Himachal Pradesh">Chamba</option>
                          <option value="Hamirpur, Himachal Pradesh">Hamirpur</option>
                          <option value="Kangra, Himachal Pradesh">Kangra</option>
                          <option value="Kinnaur, Himachal Pradesh">Kinnaur</option>
                          <option value="Kullu, Himachal Pradesh">Kullu</option>
                          <option value="Lahul And Spiti, Himachal Pradesh">Lahul And Spiti</option>
                          <option value="Mandi, Himachal Pradesh">Mandi</option>
                          <option value="Shimla, Himachal Pradesh">Shimla</option>
                          <option value="Sirmaur, Himachal Pradesh">Sirmaur</option>
                          <option value="Solan, Himachal Pradesh">Solan</option>
                          <option value="Una, Himachal Pradesh">Una</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Jammu And Kashmir') && (
                        <optgroup label="Jammu And Kashmir">
                          <option value="Anantnag, Jammu And Kashmir">Anantnag</option>
                          <option value="Bandipora, Jammu And Kashmir">Bandipora</option>
                          <option value="Baramulla, Jammu And Kashmir">Baramulla</option>
                          <option value="Budgam, Jammu And Kashmir">Budgam</option>
                          <option value="Doda, Jammu And Kashmir">Doda</option>
                          <option value="Ganderbal, Jammu And Kashmir">Ganderbal</option>
                          <option value="Jammu, Jammu And Kashmir">Jammu</option>
                          <option value="Kathua, Jammu And Kashmir">Kathua</option>
                          <option value="Kishtwar, Jammu And Kashmir">Kishtwar</option>
                          <option value="Kulgam, Jammu And Kashmir">Kulgam</option>
                          <option value="Kupwara, Jammu And Kashmir">Kupwara</option>
                          <option value="Poonch, Jammu And Kashmir">Poonch</option>
                          <option value="Pulwama, Jammu And Kashmir">Pulwama</option>
                          <option value="Rajouri, Jammu And Kashmir">Rajouri</option>
                          <option value="Ramban, Jammu And Kashmir">Ramban</option>
                          <option value="Reasi, Jammu And Kashmir">Reasi</option>
                          <option value="Samba, Jammu And Kashmir">Samba</option>
                          <option value="Shopian, Jammu And Kashmir">Shopian</option>
                          <option value="Srinagar, Jammu And Kashmir">Srinagar</option>
                          <option value="Udhampur, Jammu And Kashmir">Udhampur</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Jharkhand') && (
                        <optgroup label="Jharkhand">
                          <option value="Bokaro, Jharkhand">Bokaro</option>
                          <option value="Chatra, Jharkhand">Chatra</option>
                          <option value="Deoghar, Jharkhand">Deoghar</option>
                          <option value="Dhanbad, Jharkhand">Dhanbad</option>
                          <option value="Dumka, Jharkhand">Dumka</option>
                          <option value="East Singhbum, Jharkhand">East Singhbum</option>
                          <option value="Garhwa, Jharkhand">Garhwa</option>
                          <option value="Giridih, Jharkhand">Giridih</option>
                          <option value="Godda, Jharkhand">Godda</option>
                          <option value="Gumla, Jharkhand">Gumla</option>
                          <option value="Hazaribagh, Jharkhand">Hazaribagh</option>
                          <option value="Jamtara, Jharkhand">Jamtara</option>
                          <option value="Khunti, Jharkhand">Khunti</option>
                          <option value="Koderma, Jharkhand">Koderma</option>
                          <option value="Latehar, Jharkhand">Latehar</option>
                          <option value="Lohardaga, Jharkhand">Lohardaga</option>
                          <option value="Pakur, Jharkhand">Pakur</option>
                          <option value="Palamu, Jharkhand">Palamu</option>
                          <option value="Ramgarh, Jharkhand">Ramgarh</option>
                          <option value="Ranchi, Jharkhand">Ranchi</option>
                          <option value="Sahebganj, Jharkhand">Sahebganj</option>
                          <option value="Saraikela Kharsawan, Jharkhand">Saraikela Kharsawan</option>
                          <option value="Simdega, Jharkhand">Simdega</option>
                          <option value="West Singhbhum, Jharkhand">West Singhbhum</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Karnataka') && (
                        <optgroup label="Karnataka">
                          <option value="Bagalkote, Karnataka">Bagalkote</option>
                          <option value="Ballari, Karnataka">Ballari</option>
                          <option value="Belagavi, Karnataka">Belagavi</option>
                          <option value="Bengaluru Rural, Karnataka">Bengaluru Rural</option>
                          <option value="Bengaluru Urban, Karnataka">Bengaluru Urban</option>
                          <option value="Bidar, Karnataka">Bidar</option>
                          <option value="Chamarajanagara, Karnataka">Chamarajanagara</option>
                          <option value="Chikkaballapura, Karnataka">Chikkaballapura</option>
                          <option value="Chikkamagaluru, Karnataka">Chikkamagaluru</option>
                          <option value="Chitradurga, Karnataka">Chitradurga</option>
                          <option value="Dakshina Kannada, Karnataka">Dakshina Kannada</option>
                          <option value="Davangere, Karnataka">Davangere</option>
                          <option value="Dharwad, Karnataka">Dharwad</option>
                          <option value="Gadag, Karnataka">Gadag</option>
                          <option value="Hassan, Karnataka">Hassan</option>
                          <option value="Haveri, Karnataka">Haveri</option>
                          <option value="Kalaburagi, Karnataka">Kalaburagi</option>
                          <option value="Kodagu, Karnataka">Kodagu</option>
                          <option value="Kolar, Karnataka">Kolar</option>
                          <option value="Koppal, Karnataka">Koppal</option>
                          <option value="Mandya, Karnataka">Mandya</option>
                          <option value="Mysuru, Karnataka">Mysuru</option>
                          <option value="Raichur, Karnataka">Raichur</option>
                          <option value="Ramanagara, Karnataka">Ramanagara</option>
                          <option value="Shivamogga, Karnataka">Shivamogga</option>
                          <option value="Tumakuru, Karnataka">Tumakuru</option>
                          <option value="Udupi, Karnataka">Udupi</option>
                          <option value="Uttara Kannada, Karnataka">Uttara Kannada</option>
                          <option value="Vijayapura, Karnataka">Vijayapura</option>
                          <option value="Yadgir, Karnataka">Yadgir</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Kerala') && (
                        <optgroup label="Kerala">
                          <option value="Alappuzha, Kerala">Alappuzha</option>
                          <option value="Ernakulam, Kerala">Ernakulam</option>
                          <option value="Idukki, Kerala">Idukki</option>
                          <option value="Kannur, Kerala">Kannur</option>
                          <option value="Kasaragod, Kerala">Kasaragod</option>
                          <option value="Kollam, Kerala">Kollam</option>
                          <option value="Kottayam, Kerala">Kottayam</option>
                          <option value="Kozhikode, Kerala">Kozhikode</option>
                          <option value="Malappuram, Kerala">Malappuram</option>
                          <option value="Palakkad, Kerala">Palakkad</option>
                          <option value="Pathanamthitta, Kerala">Pathanamthitta</option>
                          <option value="Thiruvananthapuram, Kerala">Thiruvananthapuram</option>
                          <option value="Thrissur, Kerala">Thrissur</option>
                          <option value="Wayanad, Kerala">Wayanad</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Ladakh') && (
                        <optgroup label="Ladakh">
                          <option value="Kargil, Ladakh">Kargil</option>
                          <option value="Leh Ladakh, Ladakh">Leh Ladakh</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Lakshadweep') && (
                        <optgroup label="Lakshadweep">
                          <option value="Lakshadweep District, Lakshadweep">Lakshadweep District</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Madhya Pradesh') && (
                        <optgroup label="Madhya Pradesh">
                          <option value="Agar Malwa, Madhya Pradesh">Agar Malwa</option>
                          <option value="Alirajpur, Madhya Pradesh">Alirajpur</option>
                          <option value="Anuppur, Madhya Pradesh">Anuppur</option>
                          <option value="Ashoknagar, Madhya Pradesh">Ashoknagar</option>
                          <option value="Balaghat, Madhya Pradesh">Balaghat</option>
                          <option value="Barwani, Madhya Pradesh">Barwani</option>
                          <option value="Betul, Madhya Pradesh">Betul</option>
                          <option value="Bhind, Madhya Pradesh">Bhind</option>
                          <option value="Bhopal, Madhya Pradesh">Bhopal</option>
                          <option value="Burhanpur, Madhya Pradesh">Burhanpur</option>
                          <option value="Chhatarpur, Madhya Pradesh">Chhatarpur</option>
                          <option value="Chhindwara, Madhya Pradesh">Chhindwara</option>
                          <option value="Damoh, Madhya Pradesh">Damoh</option>
                          <option value="Datia, Madhya Pradesh">Datia</option>
                          <option value="Dewas, Madhya Pradesh">Dewas</option>
                          <option value="Dhar, Madhya Pradesh">Dhar</option>
                          <option value="Dindori, Madhya Pradesh">Dindori</option>
                          <option value="East Nimar, Madhya Pradesh">East Nimar</option>
                          <option value="Guna, Madhya Pradesh">Guna</option>
                          <option value="Gwalior, Madhya Pradesh">Gwalior</option>
                          <option value="Harda, Madhya Pradesh">Harda</option>
                          <option value="Hoshangabad, Madhya Pradesh">Hoshangabad</option>
                          <option value="Indore, Madhya Pradesh">Indore</option>
                          <option value="Jabalpur, Madhya Pradesh">Jabalpur</option>
                          <option value="Jhabua, Madhya Pradesh">Jhabua</option>
                          <option value="Katni, Madhya Pradesh">Katni</option>
                          <option value="Khargone, Madhya Pradesh">Khargone</option>
                          <option value="Mandla, Madhya Pradesh">Mandla</option>
                          <option value="Mandsaur, Madhya Pradesh">Mandsaur</option>
                          <option value="Morena, Madhya Pradesh">Morena</option>
                          <option value="Narsinghpur, Madhya Pradesh">Narsinghpur</option>
                          <option value="Neemuch, Madhya Pradesh">Neemuch</option>
                          <option value="Niwari, Madhya Pradesh">Niwari</option>
                          <option value="Panna, Madhya Pradesh">Panna</option>
                          <option value="Raisen, Madhya Pradesh">Raisen</option>
                          <option value="Rajgarh, Madhya Pradesh">Rajgarh</option>
                          <option value="Ratlam, Madhya Pradesh">Ratlam</option>
                          <option value="Rewa, Madhya Pradesh">Rewa</option>
                          <option value="Sagar, Madhya Pradesh">Sagar</option>
                          <option value="Satna, Madhya Pradesh">Satna</option>
                          <option value="Sehore, Madhya Pradesh">Sehore</option>
                          <option value="Seoni, Madhya Pradesh">Seoni</option>
                          <option value="Shahdol, Madhya Pradesh">Shahdol</option>
                          <option value="Shajapur, Madhya Pradesh">Shajapur</option>
                          <option value="Sheopur, Madhya Pradesh">Sheopur</option>
                          <option value="Shivpuri, Madhya Pradesh">Shivpuri</option>
                          <option value="Sidhi, Madhya Pradesh">Sidhi</option>
                          <option value="Singrauli, Madhya Pradesh">Singrauli</option>
                          <option value="Tikamgarh, Madhya Pradesh">Tikamgarh</option>
                          <option value="Ujjain, Madhya Pradesh">Ujjain</option>
                          <option value="Umaria, Madhya Pradesh">Umaria</option>
                          <option value="Vidisha, Madhya Pradesh">Vidisha</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Maharashtra') && (
                        <optgroup label="Maharashtra">
                          <option value="Ahmednagar, Maharashtra">Ahmednagar</option>
                          <option value="Akola, Maharashtra">Akola</option>
                          <option value="Amravati, Maharashtra">Amravati</option>
                          <option value="Aurangabad, Maharashtra">Aurangabad</option>
                          <option value="Beed, Maharashtra">Beed</option>
                          <option value="Bhandara, Maharashtra">Bhandara</option>
                          <option value="Buldhana, Maharashtra">Buldhana</option>
                          <option value="Chandrapur, Maharashtra">Chandrapur</option>
                          <option value="Dhule, Maharashtra">Dhule</option>
                          <option value="Gadchiroli, Maharashtra">Gadchiroli</option>
                          <option value="Gondia, Maharashtra">Gondia</option>
                          <option value="Hingoli, Maharashtra">Hingoli</option>
                          <option value="Jalgaon, Maharashtra">Jalgaon</option>
                          <option value="Jalna, Maharashtra">Jalna</option>
                          <option value="Kolhapur, Maharashtra">Kolhapur</option>
                          <option value="Latur, Maharashtra">Latur</option>
                          <option value="Mumbai, Maharashtra">Mumbai</option>
                          <option value="Mumbai Suburban, Maharashtra">Mumbai Suburban</option>
                          <option value="Nagpur, Maharashtra">Nagpur</option>
                          <option value="Nanded, Maharashtra">Nanded</option>
                          <option value="Nandurbar, Maharashtra">Nandurbar</option>
                          <option value="Nashik, Maharashtra">Nashik</option>
                          <option value="Osmanabad, Maharashtra">Osmanabad</option>
                          <option value="Palghar, Maharashtra">Palghar</option>
                          <option value="Parbhani, Maharashtra">Parbhani</option>
                          <option value="Pune, Maharashtra">Pune</option>
                          <option value="Raigad, Maharashtra">Raigad</option>
                          <option value="Ratnagiri, Maharashtra">Ratnagiri</option>
                          <option value="Sangli, Maharashtra">Sangli</option>
                          <option value="Satara, Maharashtra">Satara</option>
                          <option value="Sindhudurg, Maharashtra">Sindhudurg</option>
                          <option value="Solapur, Maharashtra">Solapur</option>
                          <option value="Thane, Maharashtra">Thane</option>
                          <option value="Wardha, Maharashtra">Wardha</option>
                          <option value="Washim, Maharashtra">Washim</option>
                          <option value="Yavatmal, Maharashtra">Yavatmal</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Manipur') && (
                        <optgroup label="Manipur">
                          <option value="Bishnupur, Manipur">Bishnupur</option>
                          <option value="Chandel, Manipur">Chandel</option>
                          <option value="Churachandpur, Manipur">Churachandpur</option>
                          <option value="Imphal East, Manipur">Imphal East</option>
                          <option value="Imphal West, Manipur">Imphal West</option>
                          <option value="Jiribam, Manipur">Jiribam</option>
                          <option value="Kakching, Manipur">Kakching</option>
                          <option value="Kamjong, Manipur">Kamjong</option>
                          <option value="Kangpokpi, Manipur">Kangpokpi</option>
                          <option value="Noney, Manipur">Noney</option>
                          <option value="Pherzawl, Manipur">Pherzawl</option>
                          <option value="Senapati, Manipur">Senapati</option>
                          <option value="Tamenglong, Manipur">Tamenglong</option>
                          <option value="Tengnoupal, Manipur">Tengnoupal</option>
                          <option value="Thoubal, Manipur">Thoubal</option>
                          <option value="Ukhrul, Manipur">Ukhrul</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Meghalaya') && (
                        <optgroup label="Meghalaya">
                          <option value="East Garo Hills, Meghalaya">East Garo Hills</option>
                          <option value="East Jaintia Hills, Meghalaya">East Jaintia Hills</option>
                          <option value="East Khasi Hills, Meghalaya">East Khasi Hills</option>
                          <option value="North Garo Hills, Meghalaya">North Garo Hills</option>
                          <option value="Ri Bhoi, Meghalaya">Ri Bhoi</option>
                          <option value="South Garo Hills, Meghalaya">South Garo Hills</option>
                          <option value="South West Garo Hills, Meghalaya">South West Garo Hills</option>
                          <option value="South West Khasi Hills, Meghalaya">South West Khasi Hills</option>
                          <option value="West Garo Hills, Meghalaya">West Garo Hills</option>
                          <option value="West Jaintia Hills, Meghalaya">West Jaintia Hills</option>
                          <option value="West Khasi Hills, Meghalaya">West Khasi Hills</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Mizoram') && (
                        <optgroup label="Mizoram">
                          <option value="Aizawl, Mizoram">Aizawl</option>
                          <option value="Champhai, Mizoram">Champhai</option>
                          <option value="Hnahthial, Mizoram">Hnahthial</option>
                          <option value="Khawzawl, Mizoram">Khawzawl</option>
                          <option value="Kolasib, Mizoram">Kolasib</option>
                          <option value="Lawngtlai, Mizoram">Lawngtlai</option>
                          <option value="Lunglei, Mizoram">Lunglei</option>
                          <option value="Mamit, Mizoram">Mamit</option>
                          <option value="Saiha, Mizoram">Saiha</option>
                          <option value="Saitual, Mizoram">Saitual</option>
                          <option value="Serchhip, Mizoram">Serchhip</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Nagaland') && (
                        <optgroup label="Nagaland">
                          <option value="Dimapur, Nagaland">Dimapur</option>
                          <option value="Kiphire, Nagaland">Kiphire</option>
                          <option value="Kohima, Nagaland">Kohima</option>
                          <option value="Longleng, Nagaland">Longleng</option>
                          <option value="Mokokchung, Nagaland">Mokokchung</option>
                          <option value="Mon, Nagaland">Mon</option>
                          <option value="Noklak, Nagaland">Noklak</option>
                          <option value="Peren, Nagaland">Peren</option>
                          <option value="Phek, Nagaland">Phek</option>
                          <option value="Tuensang, Nagaland">Tuensang</option>
                          <option value="Wokha, Nagaland">Wokha</option>
                          <option value="Zunheboto, Nagaland">Zunheboto</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Odisha') && (
                        <optgroup label="Odisha">
                          <option value="Anugul, Odisha">Anugul</option>
                          <option value="Balangir, Odisha">Balangir</option>
                          <option value="Baleshwar, Odisha">Baleshwar</option>
                          <option value="Bargarh, Odisha">Bargarh</option>
                          <option value="Bhadrak, Odisha">Bhadrak</option>
                          <option value="Boudh, Odisha">Boudh</option>
                          <option value="Cuttack, Odisha">Cuttack</option>
                          <option value="Deogarh, Odisha">Deogarh</option>
                          <option value="Dhenkanal, Odisha">Dhenkanal</option>
                          <option value="Gajapati, Odisha">Gajapati</option>
                          <option value="Ganjam, Odisha">Ganjam</option>
                          <option value="Jagatsinghapur, Odisha">Jagatsinghapur</option>
                          <option value="Jajapur, Odisha">Jajapur</option>
                          <option value="Jharsuguda, Odisha">Jharsuguda</option>
                          <option value="Kalahandi, Odisha">Kalahandi</option>
                          <option value="Kandhamal, Odisha">Kandhamal</option>
                          <option value="Kendrapara, Odisha">Kendrapara</option>
                          <option value="Kendujhar, Odisha">Kendujhar</option>
                          <option value="Khordha, Odisha">Khordha</option>
                          <option value="Koraput, Odisha">Koraput</option>
                          <option value="Malkangiri, Odisha">Malkangiri</option>
                          <option value="Mayurbhanj, Odisha">Mayurbhanj</option>
                          <option value="Nabarangpur, Odisha">Nabarangpur</option>
                          <option value="Nayagarh, Odisha">Nayagarh</option>
                          <option value="Nuapada, Odisha">Nuapada</option>
                          <option value="Puri, Odisha">Puri</option>
                          <option value="Rayagada, Odisha">Rayagada</option>
                          <option value="Sambalpur, Odisha">Sambalpur</option>
                          <option value="Sonepur, Odisha">Sonepur</option>
                          <option value="Sundargarh, Odisha">Sundargarh</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Puducherry') && (
                        <optgroup label="Puducherry">
                          <option value="Karaikal, Puducherry">Karaikal</option>
                          <option value="Mahe, Puducherry">Mahe</option>
                          <option value="Pondicherry, Puducherry">Pondicherry</option>
                          <option value="Yanam, Puducherry">Yanam</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Punjab') && (
                        <optgroup label="Punjab">
                          <option value="Amritsar, Punjab">Amritsar</option>
                          <option value="Barnala, Punjab">Barnala</option>
                          <option value="Bathinda, Punjab">Bathinda</option>
                          <option value="Faridkot, Punjab">Faridkot</option>
                          <option value="Fatehgarh Sahib, Punjab">Fatehgarh Sahib</option>
                          <option value="Fazilka, Punjab">Fazilka</option>
                          <option value="Firozepur, Punjab">Firozepur</option>
                          <option value="Gurdaspur, Punjab">Gurdaspur</option>
                          <option value="Hoshiarpur, Punjab">Hoshiarpur</option>
                          <option value="Jalandhar, Punjab">Jalandhar</option>
                          <option value="Kapurthala, Punjab">Kapurthala</option>
                          <option value="Ludhiana, Punjab">Ludhiana</option>
                          <option value="Malerkotla, Punjab">Malerkotla</option>
                          <option value="Mansa, Punjab">Mansa</option>
                          <option value="Moga, Punjab">Moga</option>
                          <option value="Pathankot, Punjab">Pathankot</option>
                          <option value="Patiala, Punjab">Patiala</option>
                          <option value="Rupnagar, Punjab">Rupnagar</option>
                          <option value="S.A.S Nagar, Punjab">S.A.S Nagar</option>
                          <option value="Sangrur, Punjab">Sangrur</option>
                          <option value="Shahid Bhagat Singh Nagar, Punjab">Shahid Bhagat Singh Nagar</option>
                          <option value="Sri Muktsar Sahib, Punjab">Sri Muktsar Sahib</option>
                          <option value="Tarn Taran, Punjab">Tarn Taran</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Rajasthan') && (
                        <optgroup label="Rajasthan">
                          <option value="Ajmer, Rajasthan">Ajmer</option>
                          <option value="Alwar, Rajasthan">Alwar</option>
                          <option value="Banswara, Rajasthan">Banswara</option>
                          <option value="Baran, Rajasthan">Baran</option>
                          <option value="Barmer, Rajasthan">Barmer</option>
                          <option value="Bharatpur, Rajasthan">Bharatpur</option>
                          <option value="Bhilwara, Rajasthan">Bhilwara</option>
                          <option value="Bikaner, Rajasthan">Bikaner</option>
                          <option value="Bundi, Rajasthan">Bundi</option>
                          <option value="Chittorgarh, Rajasthan">Chittorgarh</option>
                          <option value="Churu, Rajasthan">Churu</option>
                          <option value="Dausa, Rajasthan">Dausa</option>
                          <option value="Dholpur, Rajasthan">Dholpur</option>
                          <option value="Dungarpur, Rajasthan">Dungarpur</option>
                          <option value="Ganganagar, Rajasthan">Ganganagar</option>
                          <option value="Hanumangarh, Rajasthan">Hanumangarh</option>
                          <option value="Jaipur, Rajasthan">Jaipur</option>
                          <option value="Jaisalmer, Rajasthan">Jaisalmer</option>
                          <option value="Jalore, Rajasthan">Jalore</option>
                          <option value="Jhalawar, Rajasthan">Jhalawar</option>
                          <option value="Jhunjhunu, Rajasthan">Jhunjhunu</option>
                          <option value="Jodhpur, Rajasthan">Jodhpur</option>
                          <option value="Karauli, Rajasthan">Karauli</option>
                          <option value="Kota, Rajasthan">Kota</option>
                          <option value="Nagaur, Rajasthan">Nagaur</option>
                          <option value="Pali, Rajasthan">Pali</option>
                          <option value="Pratapgarh, Rajasthan">Pratapgarh</option>
                          <option value="Rajsamand, Rajasthan">Rajsamand</option>
                          <option value="Sawai Madhopur, Rajasthan">Sawai Madhopur</option>
                          <option value="Sikar, Rajasthan">Sikar</option>
                          <option value="Sirohi, Rajasthan">Sirohi</option>
                          <option value="Tonk, Rajasthan">Tonk</option>
                          <option value="Udaipur, Rajasthan">Udaipur</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Sikkim') && (
                        <optgroup label="Sikkim">
                          <option value="East District, Sikkim">East District</option>
                          <option value="North District, Sikkim">North District</option>
                          <option value="South District, Sikkim">South District</option>
                          <option value="West District, Sikkim">West District</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Tamil Nadu') && (
                        <optgroup label="Tamil Nadu">
                          <option value="Ariyalur, Tamil Nadu">Ariyalur</option>
                          <option value="Chengalpattu, Tamil Nadu">Chengalpattu</option>
                          <option value="Chennai, Tamil Nadu">Chennai</option>
                          <option value="Coimbatore, Tamil Nadu">Coimbatore</option>
                          <option value="Cuddalore, Tamil Nadu">Cuddalore</option>
                          <option value="Dharmapuri, Tamil Nadu">Dharmapuri</option>
                          <option value="Dindigul, Tamil Nadu">Dindigul</option>
                          <option value="Erode, Tamil Nadu">Erode</option>
                          <option value="Kallakurichi, Tamil Nadu">Kallakurichi</option>
                          <option value="Kanchipuram, Tamil Nadu">Kanchipuram</option>
                          <option value="Kanniyakumari, Tamil Nadu">Kanniyakumari</option>
                          <option value="Karur, Tamil Nadu">Karur</option>
                          <option value="Krishnagiri, Tamil Nadu">Krishnagiri</option>
                          <option value="Madurai, Tamil Nadu">Madurai</option>
                          <option value="Mayiladuthurai, Tamil Nadu">Mayiladuthurai</option>
                          <option value="Nagapattinam, Tamil Nadu">Nagapattinam</option>
                          <option value="Namakkal, Tamil Nadu">Namakkal</option>
                          <option value="Perambalur, Tamil Nadu">Perambalur</option>
                          <option value="Pudukkottai, Tamil Nadu">Pudukkottai</option>
                          <option value="Ramanathapuram, Tamil Nadu">Ramanathapuram</option>
                          <option value="Ranipet, Tamil Nadu">Ranipet</option>
                          <option value="Salem, Tamil Nadu">Salem</option>
                          <option value="Sivaganga, Tamil Nadu">Sivaganga</option>
                          <option value="Tenkasi, Tamil Nadu">Tenkasi</option>
                          <option value="Thanjavur, Tamil Nadu">Thanjavur</option>
                          <option value="The Nilgiris, Tamil Nadu">The Nilgiris</option>
                          <option value="Theni, Tamil Nadu">Theni</option>
                          <option value="Thiruvallur, Tamil Nadu">Thiruvallur</option>
                          <option value="Thiruvarur, Tamil Nadu">Thiruvarur</option>
                          <option value="Tiruchirappalli, Tamil Nadu">Tiruchirappalli</option>
                          <option value="Tirunelveli, Tamil Nadu">Tirunelveli</option>
                          <option value="Tirupathur, Tamil Nadu">Tirupathur</option>
                          <option value="Tiruppur, Tamil Nadu">Tiruppur</option>
                          <option value="Tiruvannamalai, Tamil Nadu">Tiruvannamalai</option>
                          <option value="Tuticorin, Tamil Nadu">Tuticorin</option>
                          <option value="Vellore, Tamil Nadu">Vellore</option>
                          <option value="Villupuram, Tamil Nadu">Villupuram</option>
                          <option value="Virudhunagar, Tamil Nadu">Virudhunagar</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Telangana') && (
                        <optgroup label="Telangana">
                          <option value="Adilabad, Telangana">Adilabad</option>
                          <option value="Bhadradri Kothagudem, Telangana">Bhadradri Kothagudem</option>
                          <option value="Hyderabad, Telangana">Hyderabad</option>
                          <option value="Jagitial, Telangana">Jagitial</option>
                          <option value="Jangoan, Telangana">Jangoan</option>
                          <option value="Jayashankar Bhupalapally, Telangana">Jayashankar Bhupalapally</option>
                          <option value="Jogulamba Gadwal, Telangana">Jogulamba Gadwal</option>
                          <option value="Kamareddy, Telangana">Kamareddy</option>
                          <option value="Karimnagar, Telangana">Karimnagar</option>
                          <option value="Khammam, Telangana">Khammam</option>
                          <option value="Kumuram Bheem Asifabad, Telangana">Kumuram Bheem Asifabad</option>
                          <option value="Mahabubabad, Telangana">Mahabubabad</option>
                          <option value="Mahabubnagar, Telangana">Mahabubnagar</option>
                          <option value="Mancherial, Telangana">Mancherial</option>
                          <option value="Medak, Telangana">Medak</option>
                          <option value="Medchal Malkajgiri, Telangana">Medchal Malkajgiri</option>
                          <option value="Mulugu, Telangana">Mulugu</option>
                          <option value="Nagarkurnool, Telangana">Nagarkurnool</option>
                          <option value="Nalgonda, Telangana">Nalgonda</option>
                          <option value="Narayanpet, Telangana">Narayanpet</option>
                          <option value="Nirmal, Telangana">Nirmal</option>
                          <option value="Nizamabad, Telangana">Nizamabad</option>
                          <option value="Peddapalli, Telangana">Peddapalli</option>
                          <option value="Rajanna Sircilla, Telangana">Rajanna Sircilla</option>
                          <option value="Ranga Reddy, Telangana">Ranga Reddy</option>
                          <option value="Sangareddy, Telangana">Sangareddy</option>
                          <option value="Siddipet, Telangana">Siddipet</option>
                          <option value="Suryapet, Telangana">Suryapet</option>
                          <option value="Vikarabad, Telangana">Vikarabad</option>
                          <option value="Wanaparthy, Telangana">Wanaparthy</option>
                          <option value="Warangal Rural, Telangana">Warangal Rural</option>
                          <option value="Warangal Urban, Telangana">Warangal Urban</option>
                          <option value="Yadadri Bhuvanagiri, Telangana">Yadadri Bhuvanagiri</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'The Dadra And Nagar Haveli And Daman And Diu') && (
                        <optgroup label="The Dadra And Nagar Haveli And Daman And Diu">
                          <option value="Dadra And Nagar Haveli, The Dadra And Nagar Haveli And Daman And Diu">Dadra And Nagar Haveli</option>
                          <option value="Daman, The Dadra And Nagar Haveli And Daman And Diu">Daman</option>
                          <option value="Diu, The Dadra And Nagar Haveli And Daman And Diu">Diu</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Tripura') && (
                        <optgroup label="Tripura">
                          <option value="Dhalai, Tripura">Dhalai</option>
                          <option value="Gomati, Tripura">Gomati</option>
                          <option value="Khowai, Tripura">Khowai</option>
                          <option value="North Tripura, Tripura">North Tripura</option>
                          <option value="Sepahijala, Tripura">Sepahijala</option>
                          <option value="South Tripura, Tripura">South Tripura</option>
                          <option value="Unakoti, Tripura">Unakoti</option>
                          <option value="West Tripura, Tripura">West Tripura</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Uttar Pradesh') && (
                        <optgroup label="Uttar Pradesh">
                          <option value="Agra, Uttar Pradesh">Agra</option>
                          <option value="Aligarh, Uttar Pradesh">Aligarh</option>
                          <option value="Ambedkar Nagar, Uttar Pradesh">Ambedkar Nagar</option>
                          <option value="Amethi, Uttar Pradesh">Amethi</option>
                          <option value="Amroha, Uttar Pradesh">Amroha</option>
                          <option value="Auraiya, Uttar Pradesh">Auraiya</option>
                          <option value="Ayodhya, Uttar Pradesh">Ayodhya</option>
                          <option value="Azamgarh, Uttar Pradesh">Azamgarh</option>
                          <option value="Baghpat, Uttar Pradesh">Baghpat</option>
                          <option value="Bahraich, Uttar Pradesh">Bahraich</option>
                          <option value="Ballia, Uttar Pradesh">Ballia</option>
                          <option value="Balrampur, Uttar Pradesh">Balrampur</option>
                          <option value="Banda, Uttar Pradesh">Banda</option>
                          <option value="Barabanki, Uttar Pradesh">Barabanki</option>
                          <option value="Bareilly, Uttar Pradesh">Bareilly</option>
                          <option value="Basti, Uttar Pradesh">Basti</option>
                          <option value="Bhadohi, Uttar Pradesh">Bhadohi</option>
                          <option value="Bijnor, Uttar Pradesh">Bijnor</option>
                          <option value="Budaun, Uttar Pradesh">Budaun</option>
                          <option value="Bulandshahr, Uttar Pradesh">Bulandshahr</option>
                          <option value="Chandauli, Uttar Pradesh">Chandauli</option>
                          <option value="Chitrakoot, Uttar Pradesh">Chitrakoot</option>
                          <option value="Deoria, Uttar Pradesh">Deoria</option>
                          <option value="Etah, Uttar Pradesh">Etah</option>
                          <option value="Etawah, Uttar Pradesh">Etawah</option>
                          <option value="Farrukhabad, Uttar Pradesh">Farrukhabad</option>
                          <option value="Fatehpur, Uttar Pradesh">Fatehpur</option>
                          <option value="Firozabad, Uttar Pradesh">Firozabad</option>
                          <option value="Gautam Buddha Nagar, Uttar Pradesh">Gautam Buddha Nagar</option>
                          <option value="Ghaziabad, Uttar Pradesh">Ghaziabad</option>
                          <option value="Ghazipur, Uttar Pradesh">Ghazipur</option>
                          <option value="Gonda, Uttar Pradesh">Gonda</option>
                          <option value="Gorakhpur, Uttar Pradesh">Gorakhpur</option>
                          <option value="Hamirpur, Uttar Pradesh">Hamirpur</option>
                          <option value="Hapur, Uttar Pradesh">Hapur</option>
                          <option value="Hardoi, Uttar Pradesh">Hardoi</option>
                          <option value="Hathras, Uttar Pradesh">Hathras</option>
                          <option value="Jalaun, Uttar Pradesh">Jalaun</option>
                          <option value="Jaunpur, Uttar Pradesh">Jaunpur</option>
                          <option value="Jhansi, Uttar Pradesh">Jhansi</option>
                          <option value="Kannauj, Uttar Pradesh">Kannauj</option>
                          <option value="Kanpur Dehat, Uttar Pradesh">Kanpur Dehat</option>
                          <option value="Kanpur Nagar, Uttar Pradesh">Kanpur Nagar</option>
                          <option value="Kasganj, Uttar Pradesh">Kasganj</option>
                          <option value="Kaushambi, Uttar Pradesh">Kaushambi</option>
                          <option value="Kheri, Uttar Pradesh">Kheri</option>
                          <option value="Kushi Nagar, Uttar Pradesh">Kushi Nagar</option>
                          <option value="Lalitpur, Uttar Pradesh">Lalitpur</option>
                          <option value="Lucknow, Uttar Pradesh">Lucknow</option>
                          <option value="Maharajganj, Uttar Pradesh">Maharajganj</option>
                          <option value="Mahoba, Uttar Pradesh">Mahoba</option>
                          <option value="Mainpuri, Uttar Pradesh">Mainpuri</option>
                          <option value="Mathura, Uttar Pradesh">Mathura</option>
                          <option value="Mau, Uttar Pradesh">Mau</option>
                          <option value="Meerut, Uttar Pradesh">Meerut</option>
                          <option value="Mirzapur, Uttar Pradesh">Mirzapur</option>
                          <option value="Moradabad, Uttar Pradesh">Moradabad</option>
                          <option value="Muzaffarnagar, Uttar Pradesh">Muzaffarnagar</option>
                          <option value="Pilibhit, Uttar Pradesh">Pilibhit</option>
                          <option value="Pratapgarh, Uttar Pradesh">Pratapgarh</option>
                          <option value="Prayagraj, Uttar Pradesh">Prayagraj</option>
                          <option value="Rae Bareli, Uttar Pradesh">Rae Bareli</option>
                          <option value="Rampur, Uttar Pradesh">Rampur</option>
                          <option value="Saharanpur, Uttar Pradesh">Saharanpur</option>
                          <option value="Sambhal, Uttar Pradesh">Sambhal</option>
                          <option value="Sant Kabeer Nagar, Uttar Pradesh">Sant Kabeer Nagar</option>
                          <option value="Shahjahanpur, Uttar Pradesh">Shahjahanpur</option>
                          <option value="Shamli, Uttar Pradesh">Shamli</option>
                          <option value="Shravasti, Uttar Pradesh">Shravasti</option>
                          <option value="Siddharth Nagar, Uttar Pradesh">Siddharth Nagar</option>
                          <option value="Sitapur, Uttar Pradesh">Sitapur</option>
                          <option value="Sonbhadra, Uttar Pradesh">Sonbhadra</option>
                          <option value="Sultanpur, Uttar Pradesh">Sultanpur</option>
                          <option value="Unnao, Uttar Pradesh">Unnao</option>
                          <option value="Varanasi, Uttar Pradesh">Varanasi</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Uttarakhand') && (
                        <optgroup label="Uttarakhand">
                          <option value="Almora, Uttarakhand">Almora</option>
                          <option value="Bageshwar, Uttarakhand">Bageshwar</option>
                          <option value="Chamoli, Uttarakhand">Chamoli</option>
                          <option value="Champawat, Uttarakhand">Champawat</option>
                          <option value="Dehradun, Uttarakhand">Dehradun</option>
                          <option value="Haridwar, Uttarakhand">Haridwar</option>
                          <option value="Nainital, Uttarakhand">Nainital</option>
                          <option value="Pauri Garhwal, Uttarakhand">Pauri Garhwal</option>
                          <option value="Pithoragarh, Uttarakhand">Pithoragarh</option>
                          <option value="Rudra Prayag, Uttarakhand">Rudra Prayag</option>
                          <option value="Tehri Garhwal, Uttarakhand">Tehri Garhwal</option>
                          <option value="Udam Singh Nagar, Uttarakhand">Udam Singh Nagar</option>
                          <option value="Uttar Kashi, Uttarakhand">Uttar Kashi</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'West Bengal') && (
                        <optgroup label="West Bengal">
                          <option value="24 Paraganas North, West Bengal">24 Paraganas North</option>
                          <option value="24 Paraganas South, West Bengal">24 Paraganas South</option>
                          <option value="Alipurduar, West Bengal">Alipurduar</option>
                          <option value="Bankura, West Bengal">Bankura</option>
                          <option value="Birbhum, West Bengal">Birbhum</option>
                          <option value="Coochbehar, West Bengal">Coochbehar</option>
                          <option value="Darjeeling, West Bengal">Darjeeling</option>
                          <option value="Dinajpur Dakshin, West Bengal">Dinajpur Dakshin</option>
                          <option value="Dinajpur Uttar, West Bengal">Dinajpur Uttar</option>
                          <option value="Hooghly, West Bengal">Hooghly</option>
                          <option value="Howrah, West Bengal">Howrah</option>
                          <option value="Jalpaiguri, West Bengal">Jalpaiguri</option>
                          <option value="Jhargram, West Bengal">Jhargram</option>
                          <option value="Kalimpong, West Bengal">Kalimpong</option>
                          <option value="Kolkata, West Bengal">Kolkata</option>
                          <option value="Maldah, West Bengal">Maldah</option>
                          <option value="Medinipur East, West Bengal">Medinipur East</option>
                          <option value="Medinipur West, West Bengal">Medinipur West</option>
                          <option value="Murshidabad, West Bengal">Murshidabad</option>
                          <option value="Nadia, West Bengal">Nadia</option>
                          <option value="Paschim Bardhaman, West Bengal">Paschim Bardhaman</option>
                          <option value="Purba Bardhaman, West Bengal">Purba Bardhaman</option>
                          <option value="Purulia, West Bengal">Purulia</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Remote') && (
                        <optgroup label="Remote/Hybrid">
                          <option value="Remote - India">Remote - India</option>
                          <option value="Remote - Anywhere">Remote - Anywhere</option>
                          <option value="Hybrid - Flexible">Hybrid - Flexible</option>
                        </optgroup>
                      )}
                      </>)}
                    </select>
                  </div>

                  {/* Radius Dropdown */}
                  <div className="w-full sm:w-28">
                    <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1">Radius</label>
                    <select
                      value={newLocation.radius}
                      onChange={(e) => setNewLocation(prev => ({ ...prev, radius: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-sm text-black"
                    >
                      <option value="10">10 km</option>
                      <option value="25">25 km</option>
                      <option value="50">50 km</option>
                      <option value="75">75 km</option>
                      <option value="100">100 km</option>
                      <option value="150">150 km</option>
                      <option value="200">200 km</option>
                    </select>
                  </div>

                  {/* Add Button */}
                  <button
                    onClick={handleAddLocation}
                    className="px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm whitespace-nowrap flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
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
                            className="text-red-600 hover:text-red-700 ml-2"
                           aria-label="Close">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Employment Type & Work Model - Side by Side */}
              <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Employment Type */}
                <div>
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-2">Employment Type</h3>
                  <select
                    value={extractedData.employmentType}
                    onChange={(e) => { setExtractedData(prev => ({
                      ...prev,
                      employmentType: e.target.value as ExtractedData['employmentType']
                    })); markExtractedDataModified(); }}
                    className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black bg-white ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={isRegenerating}
                  >
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                    <option value="temporary">Temporary / Seasonal</option>
                  </select>
                </div>

                {/* Work Model */}
                <div>
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-2">Work Mode</h3>
                  <select
                    value={extractedData.workModel}
                    onChange={(e) => { setExtractedData(prev => ({
                      ...prev,
                      workModel: e.target.value as ExtractedData['workModel']
                    })); markExtractedDataModified(); }}
                    className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black bg-white ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={isRegenerating}
                  >
                    <option value="onsite">Onsite</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="field_based">Field-based / Travel</option>
                  </select>
                </div>
              </div>

              {/* Allow Overqualified Candidates */}
              <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-1">Allow Overqualified Candidates</h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">Accept candidates who exceed the required qualifications</p>
                  </div>
                  <label className={`relative inline-flex items-center ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.allowOverqualified)}
                      onChange={(e) => { setExtractedData(prev => ({ ...prev, allowOverqualified: e.target.checked })); markExtractedDataModified(); }}
                      className="sr-only peer"
                      disabled={isRegenerating}
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-blue/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                  </label>
                </div>
              </div>

              {/* Certifications & Domain Keywords - HIDDEN as per requirement */}
              {/*
              <div className="mt-6 grid grid-cols-2 gap-6">
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
                        placeholder="e.g., AWS Certified Solutions Architect"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                        autoFocus
                      />
                      <button
                        onClick={handleAddCertification}
                        className="px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm transition-colors"
                      >
                        Add
                      </button>
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
                            className="text-red-600 hover:text-red-700 ml-2"
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
                        placeholder="e.g., Banking, Fintech, Cloud"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black"
                        autoFocus
                      />
                      <button
                        onClick={handleAddDomainKeyword}
                        className="px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-sm transition-colors"
                      >
                        Add
                      </button>
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
                            className="text-red-600 hover:text-red-700 ml-2"
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

              {/* Assessment Guidance & Internal Recruiter Notes - Side by Side */}
              <div className="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Assessment Guidance - Left */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Assessment Guidance</h3>
                    <span className="text-xs text-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">Optional</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-3 flex items-center gap-1">
                    <span className="text-blue-500">ℹ️</span> Visible to assessment team
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
                    placeholder="e.g., Focus on system design, coding best practices, problem-solving approach..."
                    className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm text-black resize-none ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    rows={4}
                    disabled={isRegenerating}
                    readOnly={isRegenerating}
                  />
                  <div className="text-right text-xs text-gray-500 dark:text-slate-500 mt-1">{extractedData.assessmentGuidance?.length || 0}/500</div>
                </div>

                {/* Internal Recruiter Notes - Right */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Internal Recruiter Notes</h3>
                    <span className="text-xs text-gray-500 dark:text-slate-500 bg-yellow-100 px-2 py-0.5 rounded flex items-center gap-1">
                      🔒 Private
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
                    Private notes for team use only. Not visible to candidates or used in scoring/assessments.
                  </p>
                  <textarea
                    value={extractedData.internalRecruiterComments.join('\n')}
                    onChange={(e) => {
                      const nextValue = e.target.value;
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
                </div>
              </div>

            {/* Validation Warning Banner - Show when required fields are missing */}
            {!validationStatus.isValid && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 mt-4 sm:mt-6">
                <div className="flex items-start gap-2 sm:gap-3">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm sm:text-base text-amber-800 font-medium">Cannot Proceed - Missing Required Fields</h4>
                    <p className="text-xs sm:text-sm text-amber-700 mt-1">
                      Please complete the following before {isEditingPublished ? 'republishing' : 'publishing'}:
                    </p>
                    <ul className="text-xs sm:text-sm text-amber-700 mt-2 list-disc list-inside">
                      {validationStatus.missingFields.map((field, index) => (
                        <li key={index}>{field}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center mt-6 sm:mt-8 gap-3 sm:gap-0">
              <div className="flex gap-2 sm:gap-3">
                <button
                  onClick={() => {
                    setStep('create');
                    setHasProceededToExtract(false);  // Re-enable regenerate button when going back
                  }}
                  className="px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
                >
                  Back
                </button>
              </div>
              <button
                onClick={handlePublish}
                disabled={isRegenerating || !validationStatus.isValid}
                className="flex items-center justify-center gap-2 bg-brand-blue hover:bg-brand-blue-2 text-white px-4 py-2 rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Publish */}
        {step === 'review' && !isPublished && (
          <div className="space-y-4 sm:space-y-6">
                {/* Header */}
                <div className="bg-gradient-to-r from-brand-blue to-brand-blue-2 rounded-xl p-4 sm:p-6 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
                  <h2 className="text-lg sm:text-2xl mb-1 sm:mb-2 font-semibold tracking-tight">{isEditingPublished ? 'Review & Republish' : 'Review & Publish'}</h2>
                  <p className="text-sm sm:text-base text-white/85">
                    {isEditingPublished
                      ? 'Review all details before republishing. This will create a new version of the published JD.'
                      : 'Review all details before publishing. Once published, this JD will be locked and available to all authorized users.'}
                  </p>
                </div>

            {/* Final JD Document View */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-md shadow-brand-blue/10">
              <div className="bg-brand-blue/[0.04] px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-lg text-gray-900 dark:text-slate-50 flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 dark:text-slate-100 flex-shrink-0" />
                      Final Job Description
                      {/* JD12: AI-Generated indicator */}
                      {mode === 'ai' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                          <Wand2 className="w-3 h-3" />
                          AI Generated
                        </span>
                      )}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mt-1">This is the job description that will be published</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        const text = mode === 'ai' ? generatedJD : manualJD;
                        navigator.clipboard.writeText(text);
                        toast.success({ title: 'Copied!', description: 'Job description copied to clipboard' });
                      }}
                      className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-xs sm:text-sm text-black"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        const text = mode === 'ai' ? generatedJD : manualJD;
                        const fullContent = `${jobTitle}\n\n${text}\n\n--- Skills ---\nMust Have: ${extractedData.mustHaveSkills.join(', ')}\nNice to Have: ${extractedData.niceToHaveSkills.join(', ')}\n\nExperience: ${extractedData.experience}\nEducation: ${extractedData.education}`;
                        const blob = new Blob([fullContent], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${jobTitle.replace(/[^a-z0-9]/gi, '_')}_JD.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success({ title: 'Downloaded!', description: 'Job description saved as text file' });
                      }}
                      className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-xs sm:text-sm text-black"
                    >
                      <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-6 lg:p-8 bg-white dark:bg-slate-900">
                <div className="prose prose-sm max-w-none">
                  {/* Job Title & Quick Info */}
                  <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-gray-200 dark:border-slate-700">
                    {effectiveEditingJD?.job_id && (
                      <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-slate-500 mb-1">{effectiveEditingJD.job_id}</p>
                    )}
                    <h1 className="text-xl sm:text-2xl lg:text-3xl text-gray-900 dark:text-slate-50 mb-2 sm:mb-3 flex items-center gap-2 sm:gap-3 flex-wrap">
                      {jobTitle}
                      {effectiveEditingJD?.current_version && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                          v{effectiveEditingJD.current_version}
                        </span>
                      )}
                    </h1>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-slate-400">
                      {extractedData.locations.length > 0 && extractedData.locations[0].city && (
                        <span className="flex items-center gap-1">📍 {extractedData.locations[0].city}</span>
                      )}
                      {extractedData.experience && (
                        <span className="flex items-center gap-1">⏱️ {getExperienceLabel(extractedData.experience)}</span>
                      )}
                      {extractedData.education && (
                        <span className="flex items-center gap-1">🎓 {getEducationLabel(extractedData.education)}</span>
                      )}
                      {extractedData.employmentType && (
                        <span className="flex items-center gap-1">💼 {extractedData.employmentType === 'full_time' ? 'Full Time' : extractedData.employmentType === 'part_time' ? 'Part Time' : extractedData.employmentType === 'contract' ? 'Contract' : extractedData.employmentType}</span>
                      )}
                      {extractedData.workModel && (
                        <span className="flex items-center gap-1">🏢 {extractedData.workModel === 'onsite' ? 'On-site' : extractedData.workModel === 'remote' ? 'Remote' : extractedData.workModel === 'hybrid' ? 'Hybrid' : extractedData.workModel}</span>
                      )}
                    </div>
                    {(extractedData.salaryFrom || extractedData.salaryTo) && (
                      <div className="mt-3 text-sm text-green-700 font-medium">
                        💰 {formatSalaryRange({
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

            {/* Extracted Data Summary Preview - Collapsible */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5">
              {/* Section Header with Toggle */}
              <button
                onClick={() => setShowExtractedSummary(!showExtractedSummary)}
                className="w-full bg-brand-blue/[0.04] px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between hover:bg-brand-blue/[0.07] transition-colors"
              >
                <div className="text-left">
                  <h3 className="text-sm sm:text-lg text-gray-900 dark:text-slate-50 flex items-center gap-2 flex-wrap">
                    📊 Extracted Data Summary
                    <Eye className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                    {/* JD12: AI-Generated indicator for extracted parameters */}
                    {mode === 'ai' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                        <Wand2 className="w-3 h-3" />
                        AI Extracted
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Click to {showExtractedSummary ? 'hide' : 'view'} structured requirements</p>
                </div>
                <div className={`transform transition-transform ${showExtractedSummary ? 'rotate-180' : ''}`}>
                  <ChevronRight className="w-5 h-5 text-gray-500 dark:text-slate-500 rotate-90" />
                </div>
              </button>

              {/* Collapsible Content */}
              {showExtractedSummary && (
                <>
              {/* Job Title */}
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                <h3 className="text-sm text-gray-500 dark:text-slate-500 mb-2">Job Title</h3>
                <p className="text-base sm:text-xl text-gray-900 dark:text-slate-50">{jobTitle}</p>
              </div>

              {/* Skills Section */}
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Skills & Requirements</h3>
                  <button
                    onClick={() => setStep('extract')}
                    className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {/* Left Column: Skills */}
                  <div className="space-y-4 sm:space-y-6">
                    {/* Must-Have Skills */}
                    <div>
                      <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Must-Have Skills ({extractedData.mustHaveSkills.length})</h4>
                      <div className="space-y-2">
                        {extractedData.mustHaveSkills.map((skill, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                            <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                            {skill}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Nice-to-Have Skills */}
                    <div>
                      <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Nice-to-Have Skills ({extractedData.niceToHaveSkills.length})</h4>
                      <div className="space-y-2">
                        {extractedData.niceToHaveSkills.map((skill, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                            <CheckCircle className="w-4 h-4 text-gray-800 dark:text-slate-100 flex-shrink-0" />
                            {skill}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Comments */}
                  <div className="space-y-6">
                    {/* Must-Have Comments */}
                    {extractedData.mustHaveComments.length > 0 && (
                      <div>
                        <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Must-Have Comments ({extractedData.mustHaveComments.length})</h4>
                        <div className="space-y-2">
                          {extractedData.mustHaveComments.map((comment, index) => (
                            <div key={index} className="flex items-start gap-2 text-sm text-gray-700 dark:text-slate-300">
                              <CheckCircle2 className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                              <span>{comment}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Nice-to-Have Comments */}
                    {(extractedData.niceToHaveComments || []).length > 0 && (
                      <div>
                        <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Nice-to-Have Comments ({(extractedData.niceToHaveComments || []).length})</h4>
                        <div className="space-y-2">
                          {(extractedData.niceToHaveComments || []).map((comment, index) => (
                            <div key={index} className="flex items-start gap-2 text-sm text-gray-600 dark:text-slate-400">
                              <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                              <span>{comment}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Requirements Grid */}
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Requirements</h3>
                  <button
                    onClick={() => setStep('extract')}
                    className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
                  {/* Experience */}
                  <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Experience</h4>
                    <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">{getExperienceLabel(extractedData.experience)}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      {extractedData.experienceRequired ? '✓ Required' : '○ Preferred'}
                    </p>
                  </div>

                  {/* Education */}
                  <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Education</h4>
                    <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">{getEducationLabel(extractedData.education)}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      {extractedData.educationRequired ? '✓ Required' : '○ Preferred'}
                    </p>
                  </div>

                  {/* Industry Type - Only show if specified */}
                  {extractedData.industryType && (
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                      <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Industry Type</h4>
                      <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">{getIndustryLabel(extractedData.industryType)}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                        {extractedData.industryTypeRequired ? '✓ Required' : '○ Preferred'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Compensation */}
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Compensation</h3>
                  <button
                    onClick={() => setStep('extract')}
                    className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
                <div className="bg-green-50 p-3 sm:p-4 rounded-lg inline-flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-sm sm:text-base text-gray-900 dark:text-slate-50">
                    {formatSalaryRange({
                      min: extractedData.salaryFrom,
                      max: extractedData.salaryTo,
                      currency: extractedData.salaryCurrency,
                    })}
                  </span>
                  <span className="text-gray-600 dark:text-slate-400 text-xs sm:text-sm">/ {extractedData.compensationType}</span>
                </div>
              </div>

              {/* Employment Type & Work Model */}
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Job Type</h3>
                  <button
                    onClick={() => setStep('extract')}
                    className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Employment Type</h4>
                    <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">
                      {extractedData.employmentType === 'full_time' ? 'Full Time' :
                       extractedData.employmentType === 'part_time' ? 'Part Time' :
                       extractedData.employmentType === 'contract' ? 'Contract' :
                       extractedData.employmentType === 'internship' ? 'Internship' :
                       extractedData.employmentType === 'temporary' ? 'Temporary / Seasonal' : 'Not specified'}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-1 sm:mb-2">Work Mode</h4>
                    <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">
                      {extractedData.workModel === 'onsite' ? 'Onsite' :
                       extractedData.workModel === 'remote' ? 'Remote' :
                       extractedData.workModel === 'hybrid' ? 'Hybrid' :
                       extractedData.workModel === 'field_based' ? 'Field-based / Travel' : 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Locations - Hidden for now */}
              {false && extractedData.locations.length > 0 && (
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-gray-900 mb-4">
                    Locations ({extractedData.locations.length})
                    {extractedData.locationsRequired && (
                      <span className="text-xs text-gray-500 ml-2">✓ Required</span>
                    )}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {extractedData.locations.map((loc, index) => (
                      <div key={index} className="bg-gray-50 text-gray-800 px-3 py-2 rounded-lg text-sm">
                        {loc.city} <span className="text-gray-800">(+{loc.radius}km)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assessment Guidance */}
              {extractedData.assessmentGuidance && (
                <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-3 flex items-center gap-2">
                    Assessment Guidance
                    <span className="text-xs text-gray-800 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/50 px-2 py-1 rounded">
                      ℹ️ Visible to assessment team
                    </span>
                  </h3>
                  <div className="bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg text-xs sm:text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">
                    {extractedData.assessmentGuidance}
                  </div>
                </div>
              )}

              {/* Internal Recruiter Comments */}
              {extractedData.internalRecruiterComments.length > 0 && (
                <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-slate-700">
                  <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-3 flex items-center gap-2">
                    Internal Recruiter Notes
                    <span className="text-xs text-gray-500 dark:text-slate-500 bg-yellow-100 px-2 py-1 rounded">
                      🔒 Private
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {extractedData.internalRecruiterComments.map((comment, index) => (
                      <div key={index} className="bg-yellow-50 p-2.5 sm:p-3 rounded-lg text-xs sm:text-sm text-gray-700 dark:text-slate-300 border border-yellow-200">
                        {comment}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate Preferences */}
              <div className="p-4 sm:p-6">
                <h3 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Candidate Preferences</h3>
                <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 rounded-lg">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    extractedData.allowOverqualified ? 'bg-green-100' : 'bg-gray-200 dark:bg-slate-800'
                  }`}>
                    {extractedData.allowOverqualified ? (
                      <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                    ) : (
                      <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 dark:text-slate-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50">Allow Overqualified Candidates</p>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                      {extractedData.allowOverqualified 
                        ? 'Accepting candidates who exceed requirements'
                        : 'Only accepting candidates within requirements'}
                    </p>
                  </div>
                </div>
              </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between">
              <div className="flex gap-2 sm:gap-3 order-2 sm:order-1">
                <button
                  onClick={() => setStep('extract')}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                {/* JD12: Save as Draft button */}
                <button
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isJDInUse}
                  title={isJDInUse ? 'This JD is in use and cannot be modified' : ''}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-50 text-sm"
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
                </button>
              </div>
              <div className="flex gap-2 sm:gap-3 order-1 sm:order-2">
                <button
                  onClick={handleConfirmPublish}
                  disabled={isPublishing || !validationStatus.isValid || isJDInUse}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm ${
                    validationStatus.isValid && !isJDInUse
                      ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                      : 'bg-gray-200 dark:bg-slate-800 text-gray-500 dark:text-slate-500'
                  }`}
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
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Published Success State */}
        {step === 'review' && isPublished && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-5 sm:p-8 text-center">
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <CheckCircle className="w-8 h-8 sm:w-12 sm:h-12 text-brand-blue" />
            </div>
            <h2 className="text-lg sm:text-2xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight mb-3 sm:mb-4">{publishedVersion && publishedVersion > 1 ? 'Job Description Republished!' : 'Job Description Published!'}</h2>

            {/* JD Name, Code and Version */}
            <div className="bg-brand-blue/[0.04] ring-1 ring-brand-blue/15 rounded-lg px-4 sm:px-6 py-2 sm:py-3 mb-4 sm:mb-6 inline-flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
              {publishedJobCode && (
                <span className="px-3 py-1 bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 text-sm font-medium rounded-full">
                  {publishedJobCode}
                </span>
              )}
              <span className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">{jobTitle}</span>
              {publishedVersion && (
                <span className="px-3 py-1 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 text-sm font-medium rounded-full">
                  v{publishedVersion}
                </span>
              )}
            </div>

            <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400 mb-2">
              {publishedVersion && publishedVersion > 1
                ? 'Your job description has been successfully republished with a new version.'
                : 'Your job description has been successfully published and is now live.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
              <button
                onClick={() => router.push(createAnotherJdUrl)}
                className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm"
              >
                Create Another JD
              </button>
              {publishedJdId && (
                <button
                  onClick={() => router.push(viewPublishedJdUrl)}
                  className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm"
                >
                  View JD
                </button>
              )}
              <button
                onClick={onBack}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors text-sm"
              >
                {isAiInterviewFlow ? 'Select Job Description' : 'View All Jobs'}
              </button>
            </div>
          </div>
        )}
        </div>
        </div>
      </div>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={(open) => !open && handleCancelDialog()}>
        <DialogContent className="p-4 sm:p-6 gap-3 sm:gap-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Unsaved Changes</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              You have unsaved changes. Would you like to save them as a draft before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={handleDiscardAndNavigate}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm"
            >
              Discard Changes
            </button>
            <button
              onClick={handleSaveAndNavigate}
              disabled={isSavingDraft}
              className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {isSavingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Draft'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel JD Creation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={(open) => !open && setShowCancelDialog(false)}>
        <DialogContent className="p-4 sm:p-6 gap-3 sm:gap-4">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Cancel JD Creation?</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Are you sure you want to cancel? {editingId && (!isPreExistingDraft || hasUnsavedChanges) ? 'This will delete the current draft and all your progress will be lost.' : 'You will be taken back to the job openings list.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setShowCancelDialog(false)}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors text-sm"
            >
              Continue Editing
            </button>
            <button
              onClick={confirmCancelJD}
              disabled={isCancelling}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md shadow-red-600/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Yes, Cancel'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
