'use client';

import { useEffect, useState } from 'react';
import { Code, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-[95vw] sm:max-w-2xl w-full p-8 flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-[95vw] sm:max-w-2xl w-full p-6 sm:p-8 max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        <div className="shrink-0 w-12 h-12 bg-brand-blue/10 text-brand-blue rounded-full flex items-center justify-center mb-4">
          <Code className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Choose your coding language
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
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
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                  selected
                    ? 'border-brand-blue bg-brand-blue/5'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } disabled:opacity-60`}
              >
                <div className="flex items-center gap-3">
                  <Code
                    className={`w-4 h-4 ${
                      selected
                        ? 'text-brand-blue'
                        : 'text-gray-400'
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      selected
                        ? 'text-brand-blue'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {lang.name}
                  </span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 ${
                    selected
                      ? 'border-brand-blue bg-brand-blue'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {selected && (
                    <div className="w-full h-full rounded-full bg-white scale-50" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {pickError && (
          <p className="text-sm text-destructive mb-3">{pickError}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-4">
          <Lock className="w-3.5 h-3.5" />
          <span>Your choice cannot be changed once confirmed.</span>
        </div>

        <Button
          type="button"
          variant="primary"
          onClick={handleConfirm}
          disabled={isPicking || compilable.length === 0}
          className="w-full"
        >
          {isPicking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Confirm language'
          )}
        </Button>
      </div>
    </div>
  );
}
