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
  Mail, Ban, Play, Monitor, Clock, CheckCircle, XCircle, X, RefreshCw,
} from 'lucide-react';
import {
  resumeService,
  type ResumeActivity,
  type ResumeActivityAssessment,
} from '@/lib/services/resumeService';
import { formatIST } from '@/lib/utils/dateUtils';
import { formatScore } from '@/lib/utils/score';
import { formatOverallScoreValue, matchBadgeClass, normalizeMatchResult, MATCH_SCORE_TEXT_CLASS } from '@/lib/utils/matchStatus';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE, type PlanFeatureKey } from '@/lib/types/planFeatures';
import { AIInviteStatusBadge, displayInviteScore, inviteResult } from '@/components/AIInterviewInviteTable';
import { rememberResumeActivityTrail, resumeViewFromQuery, type TrailCrumb } from '@/lib/utils/resumeActivityTrail';

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

/* One column layout per tab, so every row of a tab lines up no matter what it
   carries: Details | <the tab's value columns> | View, each a fixed width. A
   missing value shows a dash instead of letting the row's badges slide over.
   Headings and values are centred. On a phone the cells simply wrap under the
   title. Grid classes are written out in full so Tailwind picks them up. */
const COLUMNS: Record<TabKey, { heads: string[]; grid: string }> = {
  scores: { heads: ['Score out of 10', 'Match'], grid: 'sm:grid-cols-[minmax(0,1fr)_8rem_9rem_7rem]' },
  talent_matches: { heads: ['Rating', 'Scored Status'], grid: 'sm:grid-cols-[minmax(0,1fr)_6rem_9rem_7rem]' },
  assessments: { heads: ['Tech %', 'Coding %', 'Result', 'Status'], grid: 'sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem_8.5rem_7rem]' },
  interviews: { heads: ['Match Score', 'Result', 'Status'], grid: 'sm:grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_8.5rem_7rem]' },
};
const gridFor = (tab: TabKey) => `sm:grid ${COLUMNS[tab].grid} sm:items-center sm:gap-x-3`;

const NoValue = () => <span className="text-sm text-gray-400">—</span>;

/* Every tab colours its score the same way: by that row's own result —
   Pass green / Fail red (assessments, interviews), the verdict's colour
   (resume scoring), plain where there is no result to judge by. */
const SCORE_TEXT = 'text-sm font-semibold';
const passColour = (passed: boolean | null | undefined) =>
  passed == null ? 'text-gray-900' : passed ? 'text-success' : 'text-destructive';
const verdictColour = (matchStatus: string) => {
  const verdict = normalizeMatchResult(matchStatus);
  return verdict ? MATCH_SCORE_TEXT_CLASS[verdict] : 'text-gray-900';
};

/* AI Talent Match shows its 0-100 score as a 0-10 rating everywhere — the
   same rounding as AITalentMatchPage's toMatchRating. */
const toMatchRating = (score: number) => Math.max(0, Math.min(10, Math.round(score / 10)));

/* An assessment section score cell (Tech % / Coding %); undefined → dash. */
const sectionPct = (v: number | null | undefined, colour: string) =>
  v != null ? <span className={`${SCORE_TEXT} ${colour}`}>{formatScore(v)}%</span> : undefined;

function Row({
  tab, title, meta, cells, onOpen, openLabel,
}: {
  tab: TabKey;
  title: ReactNode;
  meta: ReactNode;
  /** One per COLUMNS[tab].heads entry; undefined renders a dash. */
  cells: (ReactNode | undefined)[];
  onOpen?: () => void;
  openLabel?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${gridFor(tab)} py-3 px-3 rounded-lg ring-1 ring-gray-100 hover:ring-brand-blue/20 hover:bg-brand-blue/[0.02] transition-all`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-0.5 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">{meta}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:contents">
        {cells.map((cell, i) => (
          <div key={i} className="sm:flex sm:justify-center sm:text-center">{cell ?? <NoValue />}</div>
        ))}
        <div className="sm:flex sm:justify-center">
          {onOpen && (
            <button
              onClick={onOpen}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-2 whitespace-nowrap"
            >
              {openLabel || 'View'} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Column headings over the rows (desktop only), named per tab. */
function ColumnHeader({ tab }: { tab: TabKey }) {
  return (
    <div className={`hidden ${gridFor(tab)} px-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-gray-400`}>
      <span>Details</span>
      {COLUMNS[tab].heads.map(h => <span key={h} className="text-center">{h}</span>)}
      <span className="text-center">View</span>
    </div>
  );
}

export default function CandidateActivityCard({ resumeId, trail }: { resumeId: string; trail: TrailCrumb[] }) {
  const router = useRouter();
  /* Every View goes through here: the destination shows THIS page's trail
     (Resume Database › My Resumes › <candidate>) instead of its own module's,
     and its Back returns to this resume. See lib/utils/resumeActivityTrail. */
  const openFromResume = (url: string) => {
    rememberResumeActivityTrail(trail);
    router.push(`${url}${resumeViewFromQuery}`);
  };
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
        <ColumnHeader tab={active} />
        {active === 'scores' && visible.map(s => (
          <Row
            key={s.id}
            tab="scores"
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
            cells={[
              <span key="rating" className={`${SCORE_TEXT} ${verdictColour(s.match_status)}`} title="Overall rating out of 10">
                {formatOverallScoreValue(s.overall_rating_10, s.overall_score)}
              </span>,
              <span key="match" className={`${BADGE} ${matchBadgeClass(s.match_status)}`}>{s.match_status}</span>,
            ]}
            onOpen={() => openFromResume(`/recruitment/resume-scoring?jd_id=${s.jd_id}&score_id=${s.id}`)}
            openLabel="View Score"
          />
        ))}

        {active === 'talent_matches' && visible.map(m => (
          <Row
            key={m.id}
            tab="talent_matches"
            title={<>
              <span className="truncate">{m.jd_title || 'Custom search'}</span>
              {m.jd_job_id && <span className="text-xs font-normal text-gray-500">{m.jd_job_id}</span>}
              <VersionTag version={m.resume_version} />
            </>}
            meta={<>
              <span>Matched by {m.run_by_name}</span>
              <span>{formatIST(m.created_at)}</span>
            </>}
            cells={[
              m.final_score != null ? (
                <span key="rating" className={`${SCORE_TEXT} text-gray-900`} title="AI Talent Match rating out of 10">{toMatchRating(m.final_score)}</span>
              ) : undefined,
              // "Scored Status" as AI Talent Match shows it: scored against this job in Resume Scoring.
              m.scored ? (
                <span key="scored" className={`${BADGE} bg-success-subtle text-success ring-success/20`}><CheckCircle className="w-3 h-3" /> Scored</span>
              ) : (
                <span key="scored" className={`${BADGE} bg-slate-100 text-gray-600 ring-gray-200`}><XCircle className="w-3 h-3" /> Not Scored</span>
              ),
            ]}
            onOpen={m.jd_id ? () => openFromResume(`/recruitment/ai-talent-match?jdId=${m.jd_id}&view=results`) : undefined}
            openLabel="View Match"
          />
        ))}

        {active === 'assessments' && visible.map((a: ResumeActivityAssessment) => {
          const canOpen = a.status === 'completed' && !!a.attempt_id && !!a.assessment_id;
          const cid = a.candidate_display_id ? `&cid=${encodeURIComponent(a.candidate_display_id)}` : '';
          return (
            <Row
              key={a.id}
              tab="assessments"
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
              cells={[
                sectionPct(a.technical_score, passColour(a.passed)),
                sectionPct(a.coding_score, passColour(a.passed)),
                a.passed != null ? <PassFail key="result" passed={a.passed} /> : undefined,
                <AssessmentStatusBadge key="status" status={a.status} />,
              ]}
              onOpen={canOpen ? () => openFromResume(`/recruitment/assessments/${a.assessment_id}/results/details?candidate_id=${a.attempt_id}${cid}`) : undefined}
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
              tab="interviews"
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
              cells={[
                score != null ? (
                  <span key="score" className={`${SCORE_TEXT} ${passColour(result ? result === 'Pass' : null)}`} title="Must-Have Skills score">{score}%</span>
                ) : undefined,
                result ? <PassFail key="result" passed={result === 'Pass'} /> : undefined,
                <AIInviteStatusBadge key="status" inv={i} />,
              ]}
              onOpen={canOpen ? () => openFromResume(`/recruitment/ai-interviews/${i.config_id}/results/details?session_id=${i.id}`) : undefined}
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
          <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-100 mb-4 -mx-1 px-1">
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
