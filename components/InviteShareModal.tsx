'use client';

import { useEffect, useState } from 'react';
import { X, FileText, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { assessmentService } from '@/lib/services/assessmentService';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import ShareAssessmentModal from './ShareAssessmentModal';

// Shape ShareAssessmentModal expects for an assessment.
interface ShareAssessment {
  id: string;
  title: string;
  duration: string;
  questions: number;
  type: string;
  short_id?: string;
  version?: number;
  jd_short_id?: string;
  jd_title?: string;
  jd_version?: number;
  hr_enabled?: boolean;
  technical_enabled?: boolean;
  coding_enabled?: boolean;
}

interface InviteCandidate {
  id?: string;
  resumeId?: string;
  candidateName?: string;
  name?: string;
  email: string;
  phone?: string;
}

interface InviteShareModalProps {
  candidate: InviteCandidate;
  jobId: string;
  jobTitle: string;
  onClose: () => void;
}

// Map a raw assessment API item into the shape ShareAssessmentModal consumes.
// Mirrors mapAssessmentFromApi in Assessments.tsx (only the fields the modal reads).
function toShareAssessment(a: any): ShareAssessment {
  return {
    id: a.id,
    title: a.title,
    duration: `${a.duration_minutes} min`,
    questions: (a.hr_enabled ? 10 : 0) + (a.technical_enabled ? 10 : 0) + (a.coding_enabled ? 5 : 0),
    type: a.technical_enabled ? 'Technical' : a.hr_enabled ? 'Behavioral' : 'Aptitude',
    short_id: a.short_id,
    version: a.version,
    jd_short_id: a.jd_short_id,
    jd_title: a.jd_title,
    jd_version: a.jd_version,
    hr_enabled: a.hr_enabled,
    technical_enabled: a.technical_enabled,
    coding_enabled: a.coding_enabled,
  };
}

type Phase = 'loading' | 'no-assessment' | 'picker';

/**
 * Wrapper that opens the SAME ShareAssessmentModal used in the Assessment
 * module from the resume-scoring Invite button. Because the resume-scoring
 * flow only knows the JD (not a specific assessment), this first resolves
 * the JD's published assessments:
 *   - 0  → "no published assessment" message
 *   - 1  → opens ShareAssessmentModal directly
 *   - 2+ → shows a lightweight picker, then opens ShareAssessmentModal
 */
export default function InviteShareModal({ candidate, jobId, jobTitle, onClose }: InviteShareModalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [assessments, setAssessments] = useState<ShareAssessment[]>([]);
  const [selected, setSelected] = useState<ShareAssessment | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await assessmentService.list({ jd_id: jobId });
        const revokedIds = getLocallyRevokedAssessmentIds();
        const active = (response.items || []).filter(
          (a: any) =>
            a.status === 'published' &&
            !a.is_archived &&
            !isAssessmentRevoked(a, revokedIds)
        );
        if (cancelled) return;
        const mapped = active.map(toShareAssessment);
        setAssessments(mapped);
        if (mapped.length === 0) {
          setPhase('no-assessment');
        } else if (mapped.length === 1) {
          setSelected(mapped[0]);
        } else {
          setPhase('picker');
        }
      } catch (error) {
        console.error('Failed to load assessments for invite:', error);
        if (cancelled) return;
        toast.error('Failed to load assessments');
        onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Only email is actually required to prefill — a candidate scored without a
  // name on file used to blank the WHOLE form (name AND email empty) because
  // this required both, when only the email is what an invite can't be sent
  // without. Missing just the name shouldn't cost the email too.
  const candidateName = candidate.candidateName || candidate.name || '';
  const prefilledCandidates =
    candidate.email
      ? [{
          id: candidate.resumeId || candidate.id || '1',
          name: candidateName,
          email: candidate.email,
          phone: candidate.phone,
          source: 'manual' as const,
          resumeId: candidate.resumeId,
        }]
      : undefined;

  // Once an assessment is resolved (auto-selected single, or picked), hand off
  // to the shared ShareAssessmentModal.
  if (selected) {
    return (
      <ShareAssessmentModal
        isOpen
        onClose={onClose}
        assessment={selected}
        prefilledCandidates={prefilledCandidates}
        inviteSource="Resume Scoring"
      />
    );
  }

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-3 shadow-xl">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-gray-600">Checking for published assessments…</p>
        </div>
      </div>
    );
  }

  if (phase === 'no-assessment') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl max-w-[95vw] sm:max-w-md w-full shadow-xl max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">No Published Assessment</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              There is no published assessment for <span className="font-medium">{jobTitle}</span> yet.
              Please create and publish an assessment before inviting candidates.
            </p>
          </div>
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'picker' — JD has multiple published assessments; choose one.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl max-w-[95vw] sm:max-w-2xl w-full shadow-xl max-h-[80dvh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Select an Assessment</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {jobTitle} has multiple published assessments. Choose one to invite to.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 py-4 overflow-y-auto space-y-2">
          {assessments.map((a) => {
            const parsed = parseAssessmentTitle(a.title || '');
            const base = parsed.cleanTitle || a.short_id || 'Untitled assessment';
            const sections = [
              a.hr_enabled && 'HR',
              a.technical_enabled && 'Technical',
              a.coding_enabled && 'Coding',
            ].filter(Boolean).join(' • ');
            return (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-left"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {base}
                      {typeof a.version === 'number' ? ` (v${a.version})` : ''}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {a.short_id ? `${a.short_id} · ` : ''}{sections || a.type} · {a.duration}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
