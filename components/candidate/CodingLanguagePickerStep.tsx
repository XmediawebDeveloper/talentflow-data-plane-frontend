'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Code, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LanguageLogo, { logoLabelForId } from '@/components/assessments/LanguageLogo';
import { candidateService } from '@/lib/services/candidateService';
import {
  LanguageConfig,
  getLanguageConfig,
  resolveLanguageAlias,
} from '@/lib/constants/languageTemplates';

interface CodingLanguagePickerStepProps {
  token: string;
  attemptId: string;
  onPicked: () => void;
}

export default function CodingLanguagePickerStep({
  token,
  attemptId,
  onPicked,
}: CodingLanguagePickerStepProps) {
  const [compilable, setCompilable] = useState<LanguageConfig[] | null>(null);
  const [highlightedLang, setHighlightedLang] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Use the token-based endpoint for tenant resolution. The attempt-id
        // endpoint does landlord-DB lookup which silently fails in schema-isolated
        // tenants, returning an empty list.
        const res = await candidateService.getAvailableLanguagesByToken(token);
        if (cancelled) return;
        const filtered = (res.available_languages || [])
          .map((l) => getLanguageConfig(resolveLanguageAlias(l.code.toLowerCase())))
          .filter(Boolean) as LanguageConfig[];
        setCompilable(filtered);
        if (filtered.length === 0) {
          setLoadError('No compilable languages are configured for this assessment.');
        }
      } catch {
        if (!cancelled) {
          setCompilable([]);
          setLoadError('Unable to load language options. Please refresh and try again.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleConfirm = async () => {
    if (!highlightedLang) {
      setPickError('Please select a programming language to continue');
      return;
    }
    setIsPicking(true);
    setPickError(null);
    try {
      await candidateService.chooseCodingLanguage(token, highlightedLang);
      onPicked();
    } catch (e: any) {
      setPickError(e?.message || 'Failed to save language. Please try again.');
    } finally {
      setIsPicking(false);
    }
  };

  // Render as a true modal overlay (fixed-position card on top of a
  // dimmed backdrop) so it pops over whatever screen the candidate was
  // just on (System Check, after my flow change). Previously this was a
  // full-page step replacement and recruiters reported "the modal isn't
  // showing" — visually they were looking for an overlay.
  if (compilable === null) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-[95vw] sm:max-w-2xl w-full p-6 sm:p-8 flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-[95vw] sm:max-w-2xl w-full p-6 sm:p-8 max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        <div className="shrink-0 w-12 h-12 bg-brand-blue/10 text-brand-blue rounded-full flex items-center justify-center mb-4">
          <Code className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Choose your coding language
        </h3>
        <p className="tf-body-secondary mb-5">
          This assessment supports multiple languages. Pick the one you're most comfortable with —
          your coding questions will be generated for this language and it will be locked for the
          rest of the coding round.
        </p>

        {loadError && (
          <p className="text-sm text-destructive mb-4">{loadError}</p>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 mb-5">
          {compilable.map((lang) => {
            const selected = highlightedLang === lang.id;
            return (
              <button
                key={lang.id}
                type="button"
                onClick={() => {
                  setHighlightedLang(lang.id);
                  setPickError(null);
                }}
                disabled={isPicking}
                aria-pressed={selected}
                /* Hairline border, not `border-2`: the reference row reads as a
                   tinted surface with a soft edge, and a 2px border on an
                   unselected row was the heaviest line in the dialog. */
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  selected
                    ? 'border-brand-blue/40 bg-brand-blue/5'
                    : 'border-gray-200 dark:border-gray-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                } disabled:opacity-60`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {/* The language's own mark, as on Configure Assessment's
                      language picker — same component, size and gap. */}
                  <LanguageLogo language={logoLabelForId(lang.id, lang.name)} />
                  {/* The label stays dark when selected. Turning it brand-blue
                      as well left the row with no plain text in it. */}
                  <span className="tf-row-name truncate">
                    {lang.name}
                  </span>
                </span>

                {/* Radio — filled ring when chosen, as in the reference. */}
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    selected ? 'border-brand-blue bg-brand-blue' : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </button>
            );
          })}
        </div>

        {pickError && (
          <p className="text-sm text-destructive mb-3">{pickError}</p>
        )}

        {/* The lock note as the reference draws it: a tinted panel with its own
            circular tile and two lines — the warning first, in brand blue, then
            what it means in grey. It was a single `text-xs` grey row with a
            14px lock, which read as a caption rather than as the one thing on
            this dialog the candidate cannot undo. */}
        <div className="flex items-start gap-3 rounded-xl bg-brand-blue/5 p-3 sm:p-4 mb-5">
          <span className="w-8 h-8 rounded-full bg-brand-blue/15 text-brand-blue flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-blue">
              Your choice cannot be changed once confirmed.
            </p>
            <p className="tf-body-secondary mt-0.5">
              All coding questions will be generated in the selected language for this round.
            </p>
          </div>
        </div>

        {/* Right-aligned with a forward arrow, matching the reference and the
            "Continue" actions on every other screen in this flow. It was a
            full-width block, which is the only full-width button in the
            candidate journey. */}
        <div className="flex justify-end">
        <Button
          type="button"
          variant="primary"
          onClick={handleConfirm}
          disabled={isPicking || compilable.length === 0}
          className="w-full sm:w-auto"
        >
          {isPicking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              Confirm language
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
        </div>
      </div>
    </div>
  );
}
