'use client';
// TEMPORARY visual copy of the Complete Assessment popup markup (AssessmentInterface.tsx). Delete after review.
import { AlertCircle, CheckCircle, Check, FileText, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TmpCompletePreview() {
  const totalCount = 18;
  let lockedCount = 0; let draftCount = 0;
  const unansweredQuestions = [4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const answerStatuses = new Map<string, { hasDraft: boolean; isLocked: boolean }>([
    ['question_1', { hasDraft: true, isLocked: true }], ['question_2', { hasDraft: true, isLocked: true }],
    ['question_3', { hasDraft: true, isLocked: false }], ['question_6', { hasDraft: true, isLocked: false }],
    ['question_7', { hasDraft: true, isLocked: true }], ['question_8', { hasDraft: true, isLocked: false }],
  ]);
  const setShowCompleteConfirm = (_: boolean) => {};
  const handleCompleteAssessment = () => {};
  const isCompleting = false;
  void lockedCount; void draftCount;
        // One status per question, so the chips and the three counts can never
        // disagree. Unanswered comes from `unansweredQuestions` (computed by
        // handleFinalSubmit, which also accounts for the current question);
        // anything else is Completed once locked, otherwise Draft.
        const unansweredSet = new Set(unansweredQuestions);
        const questionStatuses = Array.from({ length: totalCount }, (_, i) => {
          const qNum = i + 1;
          const s = answerStatuses.get(`question_${qNum}`);
          const status: 'completed' | 'draft' | 'unanswered' = unansweredSet.has(qNum)
            ? 'unanswered'
            : s?.isLocked
              ? 'completed'
              : 'draft';
          return { qNum, status };
        });
        lockedCount = questionStatuses.filter((q) => q.status === 'completed').length;
        draftCount = questionStatuses.filter((q) => q.status === 'draft').length;
        const unansweredCount = totalCount - lockedCount - draftCount;
        const answeredCount = lockedCount + draftCount; // anything with content

        const STATUS_CHIP = {
          completed: 'bg-success-subtle text-success-strong ring-success-line',
          draft: 'bg-warning-subtle text-warning-strong ring-warning-line',
          unanswered: 'bg-destructive-subtle text-destructive-strong ring-destructive-line',
        } as const;
        const STATUS_LABEL = { completed: 'Completed', draft: 'Draft', unanswered: 'Unanswered' } as const;

        const statCards = [
          { key: 'completed', label: 'Completed', count: lockedCount, Icon: CheckCircle, tile: 'border-success-line', icon: 'text-success', num: 'text-success-strong' },
          { key: 'draft', label: 'Draft', count: draftCount, Icon: FileText, tile: 'border-warning-line', icon: 'text-warning', num: 'text-warning-strong' },
          { key: 'unanswered', label: 'Unanswered', count: unansweredCount, Icon: AlertCircle, tile: 'border-destructive-line', icon: 'text-destructive', num: 'text-destructive-strong' },
        ] as const;

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          {/* Header and footer stay put; only the middle scrolls. */}
          <div className="bg-white rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
            {/* Sticky header */}
            <div className="relative z-10 shrink-0 px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-border shadow-sm">
            {/* Close Button */}
            <button
              onClick={() => setShowCompleteConfirm(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="flex items-center gap-3 sm:gap-4 pr-8">
              <div className={`w-12 h-12 shrink-0 ${unansweredCount > 0 ? 'bg-warning-subtle' : 'bg-success-subtle'} rounded-full flex items-center justify-center`}>
                {unansweredCount > 0 ? (
                  <AlertCircle className="w-6 h-6 text-warning" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-success" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="tf-section-title">Complete Assessment?</h3>
                <p className="tf-body-muted">
                  {answeredCount === totalCount
                    ? "You've answered all questions"
                    : `You've answered ${answeredCount} of ${totalCount} questions`
                  }
                </p>
              </div>
            </div>

            </div>

            {/* Scrolling content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">
            {/* Every question, coloured by its status. */}
            <div className={`rounded-xl border p-3 sm:p-4 mb-3 ${unansweredCount > 0 ? 'border-destructive-line' : 'border-success-line'}`}>
              {unansweredCount > 0 ? (
                <>
                  <p className="text-sm font-semibold text-destructive-strong">
                    {unansweredCount} Unanswered Question{unansweredCount === 1 ? '' : 's'}
                  </p>
                  <p className="tf-meta mb-3">These questions will be submitted without answers.</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-success-strong mb-3">All questions answered!</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {questionStatuses.map(({ qNum, status }) => (
                  <span
                    key={qNum}
                    title={`Q${qNum}: ${STATUS_LABEL[status]}`}
                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md ring-1 text-xs font-semibold ${STATUS_CHIP[status]}`}
                  >
                    {status === 'completed' && <Check className="w-3 h-3" />}
                    {status === 'draft' && <FileText className="w-3 h-3" />}
                    Q{qNum}
                    <span className="sr-only">{STATUS_LABEL[status]}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* The three counts. */}
            {/* What happens to each status on submit. Three across from `sm`;
                stacked single-line rows on phones, where three columns would
                split "12 Unanswered" over two lines. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 mb-3">
              {statCards.map(({ key, label, count, Icon, tile, icon, num }) => (
                <div key={key} className={`rounded-lg border bg-white px-3 py-2 min-w-0 ${tile}`}>
                  <p className="flex items-center gap-1.5 tf-row-title leading-snug whitespace-nowrap">
                    <Icon className={`w-4 h-4 shrink-0 ${icon}`} aria-hidden />
                    <span><span className={num}>{count}</span> {label}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 p-3 sm:p-4 rounded-xl mb-3 border border-info-line bg-info-subtle">
              <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h4 className="tf-row-title">What happens next?</h4>
                <ul className="mt-1 space-y-0.5 text-sm text-gray-700 list-disc pl-4 marker:text-info">
                  <li>Your answered and draft responses will be submitted.</li>
                  <li>Unanswered questions will be submitted as blank.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 sm:p-4 bg-destructive-subtle rounded-xl border border-destructive-line">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-destructive-strong">
                  Once submitted, you cannot modify your answers.
                </p>
                <p className="tf-body-secondary">Please review the summary above before continuing.</p>
              </div>
            </div>

            </div>

            {/* Sticky footer */}
            <div className="relative z-10 shrink-0 flex items-center justify-center px-5 sm:px-6 py-4 border-t border-border shadow-[0_-1px_2px_0_rgb(0_0_0_/_0.05)]">
              <Button
                variant="primary"
                className="w-full"
                onClick={handleCompleteAssessment}
                loading={isCompleting}
                disabled={isCompleting}
              >
                Submit Now
              </Button>
            </div>
          </div>
        </div>
        );

}
