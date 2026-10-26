'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Code,
  FileText,
  Info,
  Inbox,
  Lightbulb,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import LanguageLogo from '@/components/assessments/LanguageLogo';
import { Button } from '@/components/ui/button';

/**
 * The coding round's LANGUAGE PICKER — the dialog behind the Coding Round
 * toggle on Configure Assessment.
 *
 * TWO STATES, decided by the JOB ROLE and not by the recruiter:
 *
 *  · REQUIRED — the JD named programming languages (`jdLanguages`), so a
 *    coding round belongs to this role. Those languages get a panel of their
 *    own at the top, already ticked and badged "From JD", and the rest of the
 *    list sits below as languages that may be ADDED to them. The dialog's job
 *    here is to report what was detected and let the recruiter adjust it.
 *
 *  · AUTO (NOT REQUIRED) — the JD named none, so a coding round is optional.
 *    The dialog says exactly that, in an informational tone, and offers the
 *    plain list. Nothing here is phrased as an obligation, and there is no
 *    "from the JD" panel to phrase, because the JD asked for nothing.
 *
 * The split is the same one the Coding Round card on the page draws with its
 * "Auto (IT Job)" / "Auto (Not Required)" badge, so the badge and the dialog
 * it opens can never disagree about the same JD.
 *
 * Presentational only: every piece of selection state is the host's
 * (`AssessmentCreation`), which owns the cap, the toast at the cap, and what
 * confirming does to the section percentages. Only the search box and the
 * filter — which exist to find a row, never to change one — are local.
 */

function LanguageCard({
  language,
  selected,
  blocked,
  fromJd,
  maxLanguages,
  onToggle,
}: {
  language: string;
  selected: boolean;
  blocked: boolean;
  fromJd?: boolean;
  maxLanguages: number;
  onToggle: (language: string) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={() => onToggle(language)}
      disabled={blocked}
      title={blocked ? `Maximum ${maxLanguages} languages selected` : undefined}
      className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border text-left transition-all ${
        selected
          ? 'border-brand-blue/40 bg-brand-blue/5 ring-1 ring-brand-blue/20'
          : blocked
            ? 'border-gray-100 bg-slate-50 opacity-60 cursor-not-allowed'
            : 'border-gray-200 bg-white hover:border-brand-blue/30 hover:bg-brand-blue/5'
      }`}
    >
      <LanguageLogo language={language} />
      <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">{language}</span>
      {fromJd && (
        <span className="px-1.5 py-0.5 rounded-full bg-success-subtle text-success text-2xs font-medium flex-shrink-0">
          From JD
        </span>
      )}
      <span
        className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
          selected ? 'bg-brand-blue ring-1 ring-white/10' : 'border border-gray-300 bg-white'
        }`}
      >
        {selected && <Check className="w-3.5 h-3.5 text-white" />}
      </span>
    </button>
  );
}

type LanguageFilter = 'all' | 'selected' | 'unselected';

export interface CodingRoundLanguageModalProps {
  /** 'enable' turns the round on; 'edit' only changes the languages of a round
   *  that is already on. Both show the same picker — only the title and the
   *  confirm label differ. The 'disable' confirmation is a separate dialog and
   *  never reaches here. */
  mode: 'enable' | 'edit';
  /** Every language the candidate runner can actually execute. */
  languages: readonly string[];
  /** The subset of those detected on the JD. Non-empty means the coding round
   *  is REQUIRED for this job role; empty means Auto (Not Required). */
  jdLanguages: string[];
  selected: string[];
  maxLanguages: number;
  onToggle: (language: string) => void;
  onClear: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function CodingRoundLanguageModal({
  mode,
  languages,
  jdLanguages,
  selected,
  maxLanguages,
  onToggle,
  onClear,
  onCancel,
  onConfirm,
}: CodingRoundLanguageModalProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LanguageFilter>('all');

  /* THE ONE BRANCH. Everything the two states differ by hangs off this: a JD
     that named languages is a role whose coding round is required. */
  const isRequired = jdLanguages.length > 0;

  const atCap = selected.length >= maxLanguages;
  const isSelected = (lang: string) => selected.includes(lang);

  /* The list the browsable grid offers. In the required state the JD's own
     languages are lifted out into their panel above, so they are not offered
     a second time down here. */
  const browsable = useMemo(
    () => languages.filter(lang => !jdLanguages.includes(lang)),
    [languages, jdLanguages],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return browsable.filter(lang => {
      if (needle && !lang.toLowerCase().includes(needle)) return false;
      if (filter === 'selected') return selected.includes(lang);
      if (filter === 'unselected') return !selected.includes(lang);
      return true;
    });
  }, [browsable, search, filter, selected]);

  /* Search and filter are the same row in both states — only the heading
     above them changes — so the pair is built once. */
  const listControls = (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto flex-shrink-0">
      <div className="relative flex-1 sm:w-56 sm:flex-none">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search languages..."
          aria-label="Search languages"
          className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
        />
      </div>
      <div className="relative">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as LanguageFilter)}
          aria-label="Filter languages"
          className="appearance-none w-full sm:w-auto text-sm pl-3 pr-8 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
        >
          <option value="all">All Languages</option>
          <option value="selected">Selected</option>
          <option value="unselected">Not selected</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      </div>
    </div>
  );

  const languageGrid = (list: string[], fromJd = false) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
      {list.map(lang => (
        <LanguageCard
          key={lang}
          language={lang}
          selected={isSelected(lang)}
          blocked={!isSelected(lang) && atCap}
          fromJd={fromJd}
          maxLanguages={maxLanguages}
          onToggle={onToggle}
        />
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coding-round-dialog-title"
        className="bg-white rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-2xl lg:max-w-5xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden"
      >
        {/* Header. The code mark, the title, and the STATUS this whole dialog
            turns on — named in words rather than left to be read off a
            colour. */}
        <div className="flex-shrink-0 flex items-start gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
            <Code className="w-5 h-5 text-brand-blue" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                id="coding-round-dialog-title"
                className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight"
              >
                {mode === 'edit' ? 'Choose your programming language' : 'Enable Coding Round'}
              </h3>
              {isRequired ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-subtle text-warning text-2xs font-medium">
                  <AlertCircle className="w-3 h-3" />
                  Coding Round — Required
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-2xs font-medium">
                  <Info className="w-3 h-3" />
                  Coding Round — Auto (Not Required)
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5 leading-snug">
              Select up to {maxLanguages} programming languages for the assessment
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            aria-label="Close"
            className="px-2 -mr-1 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-5 space-y-4">
          {/* THE BANNER — the one line that says which of the two states this
              is, in that state's own words. The JD's finding in brand blue
              when the round is required; reassuring violet when it is not. */}
          {isRequired ? (
            <div className="flex items-start gap-3 rounded-xl bg-brand-blue/5 ring-1 ring-brand-blue/15 px-3 sm:px-4 py-3">
              <Info className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand-blue">
                  Languages detected from the Job Description are automatically selected.
                </p>
                <p className="text-sm text-gray-600 mt-0.5 leading-snug">
                  Coding is mandatory for this job role — you can deselect these or add additional
                  languages, but at least one must stay selected.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 px-3 sm:px-4 py-3">
              <Lightbulb className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-indigo-700">
                  Programming languages are not required for this assessment.
                </p>
                <p className="text-sm text-gray-600 mt-0.5 leading-snug">
                  Coding is handled automatically for this job role and needs no setup. You can
                  enable and select languages if you want to include a coding round anyway.
                </p>
              </div>
            </div>
          )}

          {/* REQUIRED ONLY — what the JD asked for, kept apart from what the
              recruiter may add to it. Ticked on arrival, and every one of them
              still un-tickable: the JD is the reason they are here, not a lock
              on them. */}
          {isRequired && (
            <div className="rounded-xl bg-brand-blue/5 ring-1 ring-brand-blue/15 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm sm:text-base font-medium text-gray-900">
                        Languages from Job Description
                      </h4>
                      <Info className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                      These languages are detected from the JD and selected by default. You can
                      deselect them if needed.
                    </p>
                  </div>
                </div>
                <span className="text-sm text-gray-500 whitespace-nowrap flex-shrink-0">
                  <span className="font-semibold text-gray-900">{selected.length}</span> /{' '}
                  {maxLanguages} selected
                </span>
              </div>
              {languageGrid(jdLanguages, true)}
            </div>
          )}

          {/* The browsable list. In the required state it is what may be ADDED
              to the JD's languages, so it says so and sits on a card of its
              own; in the optional state it is the whole choice, and heads the
              dialog's only section. */}
          <div
            className={
              isRequired ? 'rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-3 sm:p-4' : ''
            }
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
              <div className="flex items-start gap-2.5 min-w-0">
                {isRequired && (
                  <div className="w-9 h-9 rounded-xl bg-success-subtle flex items-center justify-center flex-shrink-0">
                    <Plus className="w-4 h-4 text-success" />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-sm sm:text-base font-medium text-gray-900">
                    {isRequired ? 'Additional Languages' : 'Select Programming Languages'}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                    {isRequired
                      ? 'Select additional programming languages from the list below.'
                      : 'Choose the languages you want to include for the coding round.'}
                  </p>
                </div>
              </div>
              {listControls}
            </div>

            {visible.length > 0 ? (
              languageGrid(visible)
            ) : (
              <p className="text-sm text-gray-500 py-6 text-center">No languages match your search.</p>
            )}
          </div>

          {/* What is actually going into the round. Empty, it is a dashed
              placeholder naming what is still missing; filled, it is the
              chips themselves, each removable where it stands. */}
          {selected.length === 0 ? (
            <div className="border-t border-gray-100 pt-3">
              <h4 className="text-sm sm:text-base font-medium text-gray-900 mb-2">
                Selected Languages (0)
              </h4>
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-4">
                <Inbox className="w-6 h-6 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700">No languages selected</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                    Please select at least one programming language to enable the coding round.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-success-subtle ring-1 ring-success-line p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                  <h4 className="text-sm sm:text-base font-medium text-gray-900">
                    Selected Languages ({selected.length})
                    {atCap && (
                      <span className="ml-1.5 text-xs font-normal text-brand-orange-deep">
                        maximum reached
                      </span>
                    )}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:text-destructive transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.map(lang => (
                  <span
                    key={`sel-${lang}`}
                    className="inline-flex items-center gap-2 pl-2 pr-1.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900"
                  >
                    <LanguageLogo language={lang} />
                    {lang}
                    <button
                      type="button"
                      onClick={() => onToggle(lang)}
                      aria-label={`Remove ${lang}`}
                      className="p-0.5 rounded text-gray-400 hover:text-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* What the selection means for the candidate — the same sentence in
              both states, because it describes the ROUND, not the job role.
              Only its tint follows the state it sits in. */}
          <div
            className={`flex items-start gap-3 rounded-xl px-3 sm:px-4 py-3 ${
              isRequired
                ? 'bg-indigo-50 ring-1 ring-indigo-100'
                : 'bg-success-subtle ring-1 ring-success-line'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isRequired ? 'bg-indigo-100' : 'bg-success-subtle'
              }`}
            >
              <Users className={`w-4 h-4 ${isRequired ? 'text-indigo-600' : 'text-success'}`} />
            </div>
            <p
              className={`text-sm leading-snug ${
                isRequired ? 'text-indigo-700' : 'text-success'
              }`}
            >
              During the interview, candidates will see{' '}
              <span className="font-semibold">only the selected languages</span> and can{' '}
              <span className="font-semibold">choose any one language</span> to proceed with the
              coding assessment.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-slate-50 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <p className="text-xs text-gray-500 order-2 sm:order-1">
            Minimum 1 and maximum {maxLanguages} languages can be selected.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 order-1 sm:order-2">
            <Button
              variant="primary"
              size="md"
              onClick={onConfirm}
              disabled={selected.length === 0}
              icon={<Check className="w-4 h-4" />}
            >
              {mode === 'edit' ? 'Save Languages' : 'Enable Coding'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
