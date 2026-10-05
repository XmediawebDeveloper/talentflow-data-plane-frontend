'use client';

/**
 * Candidate Activity — the Resume View page's record of everything done with
 * this candidate: jobs the resume was scored against, AI Talent Match runs,
 * and every AI Assessment / AI Interview invite with its status and result,
 * across all of the candidate's resume versions (GET /resumes/{id}/activity).
 *
 * Access follows the rule used everywhere else: PERMISSION decides whether a
 * tab is shown (the backend returns `allowed: false` for a module the user may
 * not read), the PLAN only whether it is clickable (greyed, with the
 * plan-locked hover). Values, labels and colours are the ones each module's
 * own list shows — the interview cells reuse that list's helpers directly.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, Target, Sparkles, ClipboardCheck, Bot, Loader2, ChevronRight, Lock,
  Mail, Ban, Play, Monitor, Clock, CheckCircle, X, RefreshCw,
} from 'lucide-react';
import {
  resumeService,
  type ResumeActivity,
  type ResumeActivityAssessment,
} from '@/lib/services/resumeService';
import { formatIST } from '@/lib/utils/dateUtils';
import { formatScore } from '@/lib/utils/score';
import { formatOverallScoreValue, matchBadgeClass } from '@/lib/utils/matchStatus';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE, type PlanFeatureKey } from '@/lib/types/planFeatures';
import { AIInviteStatusBadge, displayInviteScore, inviteResult } from '@/components/AIInterviewInviteTable';

type TabKey = 'scores' | 'talent_matches' | 'assessments' | 'interviews';

const TABS: { key: TabKey; label: string; Icon: typeof Target; plan: PlanFeatureKey }[] = [
  { key: 'scores', label: 'Resume Scoring', Icon: Target, plan: 'resume_scoring' },
  { key: 'talent_matches', label: 'AI Talent Match', Icon: Sparkles, plan: 'ai_talent_match' },
  { key: 'assessments', label: 'AI Assessments', Icon: ClipboardCheck, plan: 'assessment' },
  { key: 'interviews', label: 'AI Interviews', Icon: Bot, plan: 'ai_interview' },
];

/** Rows shown before "Show all". */
const COLLAPSED_ROWS = 5;

const BADGE = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs sm:text-xs font-medium whitespace-nowrap ring-1';

/* Assessment invite status in the Assessments tracker's words and colours
   (Assessments.tsx badge): the backend already resolved the precedence. */
function AssessmentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <span className={`${BADGE} bg-status-completed/10 text-status-completed ring-status-completed/20`}><CheckCircle className="w-3 h-3" /> Completed</span>;
    case 'expired':
      return <span className={`${BADGE} bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20`}><Clock className="w-3 h-3" /> Expired</span>;
    case 'failed':
      return <span className={`${BADGE} bg-destructive-subtle text-destructive ring-destructive-line`}><X className="w-3 h-3" /> Invite Failed</span>;
    case 'bounced':
      return <span className={`${BADGE} bg-destructive-subtle text-destructive ring-destructive-line`}><RefreshCw className="w-3 h-3" /> Bounced</span>;
    case 'revoked':
      return <span className={`${BADGE} bg-destructive-subtle text-destructive ring-destructive-line`}><Ban className="w-3 h-3" /> Revoked</span>;
    case 'abandoned':
      return <span className={`${BADGE} bg-destructive-subtle text-destructive ring-destructive-line`} title="Ended before completion — the candidate left the assessment"><Ban className="w-3 h-3" /> Terminated</span>;
    case 'started':
      return <span className={`${BADGE} bg-status-progress/10 text-status-progress ring-status-progress/20`}><Play className="w-3 h-3" /> In Progress</span>;
    case 'opened':
      return <span className={`${BADGE} bg-status-progress/10 text-status-progress ring-status-progress/20`} title="Consent accepted — the candidate is on the system check step"><Monitor className="w-3 h-3" /> System Check</span>;
    case 'sent':
      return <span className={`${BADGE} bg-status-invited/10 text-status-invited ring-status-invited/20`}><Mail className="w-3 h-3" /> Invited</span>;
    default:
      return <span className={`${BADGE} bg-slate-100 text-gray-700 ring-gray-200`}><Clock className="w-3 h-3" /> Pending</span>;
  }
}

const TALENT_MATCH_STATUS: Record<string, string> = {
  pending: 'Pending', shortlisted: 'Shortlisted', rejected: 'Rejected', contacted: 'Contacted',
};

const VersionTag = ({ version }: { version: number | null | undefined }) =>
  version ? (
    <span className="px-1.5 py-0.5 rounded bg-brand-blue/10 text-brand-blue text-2xs font-medium ring-1 ring-brand-blue/15">v{version}</span>
  ) : null;

const ViaEmailTag = () => (
  <span
    className="px-1.5 py-0.5 rounded bg-slate-100 text-gray-600 text-2xs ring-1 ring-gray-200"
    title="Invited by email address, not from a resume — matched to this candidate by the same email"
  >
    via email
  </span>
);

const PassFail = ({ passed }: { passed: boolean | null | undefined }) =>
  passed == null ? null : (
    <span className={`${BADGE} ${passed ? 'bg-success/10 text-success ring-success/20' : 'bg-destructive-subtle text-destructive ring-destructive-line'}`}>
      {passed ? 'Pass' : 'Fail'}
    </span>
  );

function Row({
  title, meta, right, onOpen, openLabel,
}: {
  title: ReactNode;
  meta: ReactNode;
  right: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 px-3 rounded-lg ring-1 ring-gray-100 hover:ring-brand-blue/20 hover:bg-brand-blue/[0.02] transition-all">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-0.5 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">{meta}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">{right}</div>
      {onOpen ? (
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 whitespace-nowrap"
        >
          {openLabel || 'View'} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span className="hidden sm:inline-block w-[64px]" />
      )}
    </div>
  );
}

export default function CandidateActivityCard({ resumeId }: { resumeId: string }) {
  const router = useRouter();
  const { isPlanLocked } = usePlanLock();
  const [data, setData] = useState<ResumeActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<TabKey | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    resumeService.getActivity(resumeId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [resumeId]);

  // Permission decides which tabs exist; the plan only greys them.
  const tabs = useMemo(
    () => (data ? TABS.filter(t => data[t.key].allowed) : []),
    [data]
  );
  const usable = tabs.filter(t => !isPlanLocked(t.plan));

  useEffect(() => {
    if (!data || active) return;
    // Open the first tab that has rows, else the first usable one.
    const withRows = usable.find(t => data[t.key].items.length > 0);
    setActive((withRows || usable[0])?.key ?? null);
  }, [data, usable, active]);

  useEffect(() => { setExpanded(false); }, [active]);

  if (!loading && !failed && tabs.length === 0) return null; // no module readable

  const total = data ? tabs.reduce((n, t) => n + (isPlanLocked(t.plan) ? 0 : data[t.key].items.length), 0) : 0;

  const renderRows = () => {
    if (!data || !active) return null;
    const section = data[active];
    if (section.error) {
      return <p className="text-sm text-destructive py-6 text-center">Could not load this section. Please refresh to try again.</p>;
    }
    const items = section.items as any[];
    if (items.length === 0) {
      const empty: Record<TabKey, string> = {
        scores: 'This resume has not been scored against any job yet.',
        talent_matches: 'This candidate has not appeared in any AI Talent Match run yet.',
        assessments: 'This candidate has not been invited to any AI Assessment yet.',
        interviews: 'This candidate has not been invited to any AI Interview yet.',
      };
      return <p className="text-sm text-gray-500 py-6 text-center">{empty[active]}</p>;
    }
    const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS);

    return (
      <div className="space-y-2">
        {active === 'scores' && visible.map(s => (
          <Row
            key={s.id}
            title={<>
              <span className="truncate">{s.jd_title || 'Untitled job'}</span>
              {s.jd_job_id && <span className="text-xs font-normal text-gray-500">{s.jd_job_id}</span>}
              <VersionTag version={s.resume_version} />
            </>}
            meta={<>
              <span>Scored by {s.scored_by_name}</span>
              <span>{formatIST(s.created_at)}</span>
              {s.run_count > 1 && <span title="Same resume version scored against this job more than once — the latest run is shown">Re-scored {s.run_count - 1}×</span>}
            </>}
            right={<>
              <span className="text-sm font-semibold text-gray-900" title="Overall rating out of 10">
                {formatOverallScoreValue(s.overall_rating_10, s.overall_score)}
                {s.overall_rating_10 != null && <span className="text-xs font-normal text-gray-500">/10</span>}
              </span>
              <span className={`${BADGE} ${matchBadgeClass(s.match_status)}`}>{s.match_status}</span>
            </>}
            onOpen={() => router.push(`/recruitment/resume-scoring?jd_id=${s.jd_id}&score_id=${s.id}`)}
            openLabel="View Score"
          />
        ))}

        {active === 'talent_matches' && visible.map(m => (
          <Row
            key={m.id}
            title={<>
              <span className="truncate">{m.jd_title || 'Custom search'}</span>
              {m.jd_job_id && <span className="text-xs font-normal text-gray-500">{m.jd_job_id}</span>}
              <VersionTag version={m.resume_version} />
            </>}
            meta={<>
              <span>Matched by {m.run_by_name}</span>
              <span>{formatIST(m.created_at)}</span>
            </>}
            right={<>
              {m.final_score != null && <span className="text-sm font-semibold text-gray-900">{formatScore(m.final_score)}%</span>}
              <span className={`${BADGE} bg-slate-100 text-gray-700 ring-gray-200`}>{TALENT_MATCH_STATUS[m.status] || m.status}</span>
            </>}
            onOpen={m.jd_id ? () => router.push(`/recruitment/ai-talent-match?jdId=${m.jd_id}`) : undefined}
            openLabel="Open Match"
          />
        ))}

        {active === 'assessments' && visible.map((a: ResumeActivityAssessment) => {
          const canOpen = a.status === 'completed' && !!a.attempt_id && !!a.assessment_id;
          const cid = a.candidate_display_id ? `&cid=${encodeURIComponent(a.candidate_display_id)}` : '';
          return (
            <Row
              key={a.id}
              title={<>
                <span className="truncate">{a.assessment_title || 'Assessment'}</span>
                {a.assessment_deleted && <span className="text-2xs text-destructive">(assessment deleted)</span>}
                {a.linked_by === 'email' ? <ViaEmailTag /> : <VersionTag version={a.resume_version} />}
              </>}
              meta={<>
                {a.invited_by_name && <span>Invited by {a.invited_by_name}</span>}
                <span>Invited {formatIST(a.invited_at)}</span>
                {a.completed_at && <span>Completed {formatIST(a.completed_at)}</span>}
              </>}
              right={<>
                {a.score != null && <span className="text-sm font-semibold text-gray-900">{formatScore(a.score)}%</span>}
                <PassFail passed={a.passed} />
                <AssessmentStatusBadge status={a.status} />
              </>}
              onOpen={canOpen ? () => router.push(`/recruitment/assessments/${a.assessment_id}/results/details?candidate_id=${a.attempt_id}${cid}&from=candidate-results`) : undefined}
              openLabel="View Result"
            />
          );
        })}

        {active === 'interviews' && visible.map(i => {
          const score = displayInviteScore(i);
          const result = inviteResult(i, score);
          const canOpen = i.status === 'completed' || i.status === 'terminated';
          return (
            <Row
              key={i.id}
              title={<>
                <span className="truncate">{i.title || 'AI Interview'}</span>
                {i.config_display_id && <span className="text-xs font-normal text-gray-500">{i.config_display_id}</span>}
                {i.linked_by === 'email' ? <ViaEmailTag /> : <VersionTag version={i.resume_version} />}
              </>}
              meta={<>
                {i.invited_by_name && <span>Invited by {i.invited_by_name}</span>}
                <span>Invited {formatIST(i.invited_at)}</span>
                {i.completed_at && <span>Completed {formatIST(i.completed_at)}</span>}
              </>}
              right={<>
                {score != null && (
                  <span className={`text-sm font-semibold ${score >= 60 ? 'text-success' : 'text-destructive'}`} title="Must-Have Skills score">{score}%</span>
                )}
                {result && <PassFail passed={result === 'Pass'} />}
                <AIInviteStatusBadge inv={i} />
              </>}
              onOpen={canOpen ? () => router.push(`/recruitment/ai-interviews/${i.config_id}/results/details?session_id=${i.id}&from=candidate-results`) : undefined}
              openLabel="View Result"
            />
          );
        })}

        {items.length > COLLAPSED_ROWS && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full py-2 text-xs font-medium text-brand-blue hover:text-brand-blue-2"
          >
            {expanded ? 'Show less' : `Show all ${items.length}`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
          <Activity className="w-4 h-4 text-brand-blue" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Candidate Activity</h3>
        {!loading && data && (
          <span className="px-2.5 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs ring-1 ring-brand-blue/20">
            {total} record{total !== 1 ? 's' : ''}
          </span>
        )}
        {data && data.version_count > 1 && (
          <span className="ml-auto text-xs text-gray-500">Across all {data.version_count} resume versions</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-500 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading activity…
        </div>
      ) : failed || !data ? (
        <p className="text-sm text-destructive py-6 text-center">Could not load candidate activity. Please refresh to try again.</p>
      ) : (
        <>
          <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-100 mb-4 -mx-1 px-1">
            {tabs.map(({ key, label, Icon, plan }) => {
              const locked = isPlanLocked(plan);
              const selected = active === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={selected}
                  disabled={locked}
                  title={locked ? PLAN_LOCKED_MESSAGE : undefined}
                  onClick={() => setActive(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    locked
                      ? 'border-transparent text-gray-300 cursor-not-allowed'
                      : selected
                        ? 'border-brand-blue text-brand-blue font-medium'
                        : 'border-transparent text-gray-600 hover:text-brand-blue'
                  }`}
                >
                  {locked ? <Lock className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  {label}
                  {!locked && (
                    <span className={`px-1.5 rounded-full text-2xs ${selected ? 'bg-brand-blue/10' : 'bg-slate-100 text-gray-500'}`}>
                      {data[key].items.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {active ? renderRows() : (
            <p className="text-sm text-gray-500 py-6 text-center">{PLAN_LOCKED_MESSAGE}</p>
          )}
        </>
      )}
    </div>
  );
}
