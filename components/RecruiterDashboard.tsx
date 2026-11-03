'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Users,
  FileText,
  Sparkles,
  Video,
  Upload,
  Target,
  Calendar,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ClipboardCheck,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanLock } from '@/lib/hooks/usePlanFeature';
import PlanLockedOverlay from '@/components/shared/PlanLockedOverlay';
import { useQuota } from '@/contexts/QuotaContext';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { Button } from '@/components/ui/button';

interface RecruiterDashboardProps {
  user?: User;
  tenant?: Tenant;
}

interface PipelineStage {
  key: string;
  label: string;
  count: number;
  color: string;
  bg: string;
}

export default function RecruiterDashboard({ user, tenant }: RecruiterDashboardProps) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { isPlanLocked } = usePlanLock();
  const { quotaData } = useQuota();

  const [myJDs, setMyJDs] = useState<JDResponse[]>([]);
  const [loadingJDs, setLoadingJDs] = useState(true);

  const canCreateJD = hasPermission('canCreateJD');
  const canUploadResumes = hasPermission('canUploadResumes');
  const canCreateAssessments = hasPermission('canCreateAssessments');

  useEffect(() => {
    let cancelled = false;
    const fetchJDs = async () => {
      try {
        setLoadingJDs(true);
        const res = await jdService.list({ status: 'published', page_size: 5, page: 1, source: 'my-jds' });
        if (!cancelled) setMyJDs(res.items || []);
      } catch (err) {
        console.error('[RecruiterDashboard] failed to load JDs', err);
      } finally {
        if (!cancelled) setLoadingJDs(false);
      }
    };
    fetchJDs();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pipeline (placeholder while backend endpoint is wired)
  const pipeline: PipelineStage[] = useMemo(
    () => [
      { key: 'applied', label: 'Applied', count: 156, color: 'bg-brand-blue', bg: 'bg-brand-blue/10' },
      { key: 'screened', label: 'Screened', count: 84, color: 'bg-brand-cyan', bg: 'bg-brand-cyan/10' },
      { key: 'assessment', label: 'Assessment', count: 42, color: 'bg-brand-teal', bg: 'bg-brand-teal/10' },
      { key: 'interview', label: 'Interview', count: 18, color: 'bg-brand-orange', bg: 'bg-brand-orange/10' },
      { key: 'offer', label: 'Offer', count: 6, color: 'bg-brand-orange-deep', bg: 'bg-brand-orange-deep/10' },
    ],
    []
  );
  const pipelineMax = Math.max(...pipeline.map((s) => s.count));

  // Quota mini-card data — quotaData.quotas is keyed by code (RU/RS/AIU)
  const toNum = (v: number | string | undefined) => (typeof v === 'number' ? v : 0);
  const resumeQ = quotaData?.quotas?.RU;
  const scoringQ = quotaData?.quotas?.RS;
  const aiInterviewQ = quotaData?.quotas?.AIU;
  const resumeQuota = { used: toNum(resumeQ?.subscription?.used), limit: toNum(resumeQ?.subscription?.limit) };
  const scoringQuota = { used: toNum(scoringQ?.subscription?.used), limit: toNum(scoringQ?.subscription?.limit) };
  const aiInterviewQuota = { used: toNum(aiInterviewQ?.subscription?.used), limit: toNum(aiInterviewQ?.subscription?.limit) };

  return (
    <main className="tf-page">
      <div className="tf-page-pad w-full max-w-[1400px] mx-auto">
        <div className="mb-8">
          <WelcomeBanner user={user} tenant={tenant} />
        </div>

        {/* KPI tiles */}
        <div className="tf-grid-4 mb-6">
          <KpiTile
            label="My Active JDs"
            value={myJDs.length || 0}
            sub={`${pipeline[0].count} new applicants`}
            icon={<Briefcase className="w-6 h-6 text-brand-blue" />}
            accent="bg-brand-blue/10 ring-brand-blue/15"
            trend="+8%"
          />
          <KpiTile
            label="Top Matches Today"
            value={12}
            sub="Score &gt; 85%"
            icon={<Sparkles className="w-6 h-6 text-brand-cyan" />}
            accent="bg-brand-cyan/10 ring-brand-cyan/15"
            trend="+3"
          />
          <KpiTile
            label="Pending Reviews"
            value={8}
            sub="Assessments awaiting"
            icon={<ClipboardCheck className="w-6 h-6 text-brand-orange" />}
            accent="bg-brand-orange/10 ring-brand-orange/15"
            trend=""
          />
          <KpiTile
            label="Today's Interviews"
            value={4}
            sub="2 AI · 2 panel"
            icon={<Video className="w-6 h-6 text-brand-teal" />}
            accent="bg-brand-teal/10 ring-brand-teal/15"
            trend=""
          />
        </div>

        {/* Pipeline funnel + quota mini */}
        <div className="tf-grid-3 mb-6">
          <div className="tf-card-soft lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="tf-section-title">Recruitment Pipeline</h2>
                <p className="tf-meta mt-0.5">Across your active job descriptions</p>
              </div>
              <button
                onClick={() => router.push('/reports/performance-reports')}
                className="text-sm text-brand-blue hover:text-brand-blue-2 font-medium inline-flex items-center gap-1"
              >
                View report <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              {pipeline.map((stage) => {
                const widthPct = pipelineMax ? Math.round((stage.count / pipelineMax) * 100) : 0;
                return (
                  <div key={stage.key} className="flex items-center gap-4">
                    <div className={`w-28 text-xs font-medium text-gray-700 dark:text-slate-300`}>{stage.label}</div>
                    <div className={`flex-1 h-7 rounded-lg ${stage.bg} relative overflow-hidden`}>
                      <div
                        className={`absolute inset-y-0 left-0 ${stage.color} rounded-lg transition-all`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="w-12 text-right tf-row-title">{stage.count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tf-card-soft p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="tf-row-title">Quota This Cycle</h3>
              <button
                onClick={() => router.push('/organization/usage')}
                className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
              >
                Details
              </button>
            </div>
            <div className="space-y-4">
              <QuotaBar label="Resumes Parsed" used={resumeQuota.used || 142} limit={resumeQuota.limit || 500} color="bg-brand-blue" />
              <QuotaBar label="Scoring Credits" used={scoringQuota.used || 87} limit={scoringQuota.limit || 200} color="bg-brand-cyan" />
              <QuotaBar
                label="AI Interview Minutes"
                used={aiInterviewQuota.used || 240}
                limit={aiInterviewQuota.limit || 600}
                color="bg-brand-teal"
              />
            </div>
          </div>
        </div>

        {/* Quick actions strip */}
        <div className="tf-grid-stats mb-6">
          {canCreateJD && (
            <QuickAction
              label="Post JD"
              icon={<Plus className="w-5 h-5" />}
              onClick={() => router.push('/recruitment/job-creation')}
              accent="from-brand-blue to-brand-blue-2"
            />
          )}
          {canUploadResumes && (
            <QuickAction
              label="Upload Resumes"
              icon={<Upload className="w-5 h-5" />}
              onClick={() => router.push('/recruitment/resume-database?tab=my-resumes')}
              accent="from-brand-cyan to-brand-teal"
            />
          )}
          {<PlanLockedOverlay locked={isPlanLocked('ai_talent_match')}>{(
            <QuickAction
              label="Run AI Match"
              icon={<Sparkles className="w-5 h-5" />}
              onClick={() => router.push('/recruitment/job-openings')}
              accent="from-brand-teal to-brand-cyan"
            />
          )}</PlanLockedOverlay>}
          {<PlanLockedOverlay locked={isPlanLocked('ai_interview')}>{(
            <QuickAction
              label="Schedule Interview"
              icon={<Video className="w-5 h-5" />}
              onClick={() => router.push('/recruitment/ai-interview')}
              accent="from-brand-orange to-brand-orange-deep"
            />
          )}</PlanLockedOverlay>}
        </div>

        {/* My JDs + today's schedule */}
        <div className="tf-grid-3 mb-6">
          <div className="tf-card-soft lg:col-span-2">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-700/60">
              <div>
                <h2 className="tf-section-title">My Active JDs</h2>
                <p className="tf-meta mt-0.5">Open requisitions you own</p>
              </div>
              <button
                onClick={() => router.push('/recruitment/job-openings?source=my-jds')}
                className="text-sm text-brand-blue hover:text-brand-blue-2 font-medium inline-flex items-center gap-1"
              >
                View all <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              {loadingJDs ? (
                <div className="flex items-center justify-center py-10 tf-loader-center">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                </div>
              ) : myJDs.length === 0 ? (
                <EmptyState
                  icon={<Briefcase className="w-10 h-10 text-gray-300" />}
                  title="No active JDs yet"
                  body="Create a JD to start receiving applicants and matches."
                  cta={
                    canCreateJD
                      ? {
                          label: 'Post JD',
                          onClick: () => router.push('/recruitment/job-creation'),
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="space-y-3">
                  {myJDs.map((jd) => {
                    const applicants = jd.applicants_count || 0;
                    const scored = jd.scored_resumes_count || 0;
                    const daysOpen = jd.published_at
                      ? Math.max(0, Math.floor((Date.now() - new Date(jd.published_at).getTime()) / 86400000))
                      : null;
                    return (
                      <button
                        key={jd.id}
                        type="button"
                        onClick={() => router.push(`/recruitment/job-openings/${jd.id}`)}
                        className="w-full text-left border border-gray-100 dark:border-slate-700/60 rounded-xl p-4 hover:border-brand-blue/30 hover:shadow-sm transition-all group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <h3 className="font-medium text-gray-900 dark:text-slate-50 truncate group-hover:text-brand-blue">
                                {jd.title || 'Untitled'}
                              </h3>
                              <span className="tf-badge text-2xs bg-success-subtle text-success ring-1 ring-success-line">
                                Published
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tf-meta">
                              {jd.department && <span>{jd.department}</span>}
                              {jd.location && <span>· {jd.location}</span>}
                              {daysOpen !== null && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {daysOpen}d open
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <Stat label="Applicants" value={applicants} />
                            <Stat label="Scored" value={scored} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="tf-card-soft">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700/60">
              <h2 className="tf-section-title">Today's Schedule</h2>
              <p className="tf-meta mt-0.5">Interviews & reviews</p>
            </div>
            <div className="p-6 space-y-3">
              {[
                { time: '10:30 AM', title: 'AI Interview · Sarah Chen', type: 'AI', tone: 'brand-cyan' },
                { time: '01:00 PM', title: 'Panel · Backend Engineer', type: 'Panel', tone: 'brand-orange' },
                { time: '03:30 PM', title: 'AI Interview · Raj Mehta', type: 'AI', tone: 'brand-cyan' },
                { time: '05:00 PM', title: 'Assessment Review · UX Lead', type: 'Review', tone: 'brand-teal' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-16 flex-shrink-0 tf-micro-hint pt-1">{item.time}</div>
                  <div className="flex-1 min-w-0 border-l-2 pl-3" style={{ borderColor: `var(--${item.tone})` }}>
                    <div className="tf-body truncate">{item.title}</div>
                    <div className="tf-micro-hint mt-0.5 uppercase tracking-wide">{item.type}</div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => router.push('/recruitment/ai-interview')}
                className="w-full mt-2 text-xs text-brand-blue hover:text-brand-blue-2 font-medium inline-flex items-center justify-center gap-1"
              >
                Open calendar <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Pending actions */}
        <div className="bg-gradient-to-br from-brand-orange/10 via-white to-brand-cyan/5 border border-brand-orange/20 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-orange/15 ring-1 ring-brand-orange/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-brand-orange-deep" />
            </div>
            <div className="flex-1">
              <h3 className="tf-row-title mb-1">Action items</h3>
              <p className="tf-body mb-3">
                You have <span className="font-semibold text-brand-orange-deep">8 assessments</span> awaiting review and{' '}
                <span className="font-semibold text-brand-orange-deep">3 AI interview reports</span> ready.
              </p>
              <div className="flex flex-wrap gap-2">
                {canCreateAssessments && (
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/recruitment/assessments')}
                  >
                    Review assessments
                  </Button>
                )}
                {<PlanLockedOverlay locked={isPlanLocked('ai_interview')}>{(
                  <Button
                    variant="secondary"
                    onClick={() => router.push('/recruitment/ai-interview')}
                  >
                    View interview reports
                  </Button>
                )}</PlanLockedOverlay>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  accent,
  trend,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  trend?: string;
}) {
  return (
    <div className="tf-card-soft group relative overflow-hidden p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-xl ${accent} ring-1 flex items-center justify-center`}>{icon}</div>
        {trend && (
          <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">{value}</div>
      <div className="tf-body-secondary mt-0.5">{label}</div>
      {sub && <div className="tf-micro-hint mt-1" dangerouslySetInnerHTML={{ __html: sub }} />}
    </div>
  );
}

function QuotaBar({ label, used, limit, color }: { label: string; used: number; limit: number; color: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isLow = pct >= 80;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <span className="text-gray-700 dark:text-slate-300 font-medium">{label}</span>
        <span className={`tabular-nums ${isLow ? 'text-brand-orange-deep' : 'text-gray-500 dark:text-slate-500'}`}>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${isLow ? 'bg-brand-orange' : color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuickAction({
  label,
  icon,
  onClick,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden bg-gradient-to-br ${accent} text-white rounded-xl p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all text-left`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-white/15 ring-1 ring-white/20 flex items-center justify-center">{icon}</div>
        <span className="font-medium">{label}</span>
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-right">
      <div className="tf-section-title tabular-nums">{value}</div>
      <div className="tf-micro-hint uppercase tracking-wide">{label}</div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="text-center py-10">
      <div className="mx-auto mb-3 w-fit">{icon}</div>
      <h3 className="tf-row-name mb-1">{title}</h3>
      <p className="tf-meta mb-4">{body}</p>
      {cta && (
        <Button
          variant="primary"
          onClick={cta.onClick}
          icon={<Plus className="w-4 h-4" />}
        >
          {cta.label}
        </Button>
      )}
    </div>
  );
}
