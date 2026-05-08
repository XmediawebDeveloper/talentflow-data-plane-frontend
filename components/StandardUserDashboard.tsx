'use client';

import {
  Briefcase,
  CheckSquare,
  Clock,
  FileText,
  Upload,
  Sparkles,
  Calendar,
  HelpCircle,
  BookOpen,
  ArrowRight,
  Activity,
  Users,
  Video,
  ClipboardCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';

interface StandardUserDashboardProps {
  user?: User;
  tenant?: Tenant;
}

export default function StandardUserDashboard({ user, tenant }: StandardUserDashboardProps) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { hasPlanFeature } = usePlanFeatures();

  const canCreateJD = hasPermission('canCreateJD');
  const canUploadResumes = hasPermission('canUploadResumes');
  const canCreateAssessments = hasPermission('canCreateAssessments');

  const tasks = [
    { id: 1, title: 'Review 5 resumes for Backend Engineer', due: 'Today', tone: 'orange' },
    { id: 2, title: 'Grade assessment · Priya Sharma', due: 'Today', tone: 'orange' },
    { id: 3, title: 'Send feedback for AI interview · Raj Mehta', due: 'Tomorrow', tone: 'cyan' },
    { id: 4, title: 'Sync with hiring manager - Product Designer', due: 'May 9', tone: 'blue' },
  ];

  const schedule = [
    { time: '11:00 AM', title: 'Resume review · Backend Engineer', icon: <FileText className="w-4 h-4" /> },
    { time: '02:00 PM', title: 'AI interview review · Raj Mehta', icon: <Video className="w-4 h-4" /> },
    { time: '04:30 PM', title: 'Assessment grading · Sarah Chen', icon: <ClipboardCheck className="w-4 h-4" /> },
  ];

  const assignedJDs = [
    { id: 'jd-1', title: 'Backend Engineer', dept: 'Engineering', applicants: 28 },
    { id: 'jd-2', title: 'Product Designer', dept: 'Design', applicants: 15 },
    { id: 'jd-3', title: 'DevOps Engineer', dept: 'Engineering', applicants: 12 },
  ];

  const recentActivity = [
    { action: 'Reviewed resume', target: 'Sarah Chen', time: '15 min ago', tone: 'brand-blue' },
    { action: 'Graded assessment', target: 'Backend Engineer · A. Kumar', time: '1 hr ago', tone: 'brand-cyan' },
    { action: 'Submitted feedback', target: 'AI Interview · M. Rao', time: '3 hrs ago', tone: 'brand-teal' },
    { action: 'Uploaded resume', target: 'designer_portfolio.pdf', time: 'Yesterday', tone: 'brand-orange' },
  ];

  return (
    <main className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="p-4 md:p-8 w-full max-w-[1400px] mx-auto">
        <div className="mb-8">
          <WelcomeBanner user={user} tenant={tenant} />
        </div>

        {/* Quick stats — compact, scoped to user */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <MiniStat label="My tasks" value={tasks.length} accent="bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/15" icon={<CheckSquare className="w-4 h-4" />} />
          <MiniStat label="Assigned JDs" value={assignedJDs.length} accent="bg-brand-blue/10 text-brand-blue ring-brand-blue/15" icon={<Briefcase className="w-4 h-4" />} />
          <MiniStat label="Today" value={schedule.length} accent="bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15" icon={<Calendar className="w-4 h-4" />} />
          <MiniStat label="This week" value={12} accent="bg-brand-teal/10 text-brand-teal ring-brand-teal/15" icon={<Activity className="w-4 h-4" />} />
        </div>

        {/* Main grid: Tasks (lg:2) + Schedule (lg:1) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">My tasks</h2>
                <p className="text-xs text-gray-500 mt-0.5">Items assigned to you</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange-deep text-xs font-medium ring-1 ring-brand-orange/15">
                {tasks.length} open
              </span>
            </div>
            <div className="p-6 space-y-3">
              {tasks.map((t) => {
                const toneMap = {
                  orange: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/15',
                  cyan: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15',
                  blue: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15',
                } as const;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:border-brand-blue/30 hover:shadow-sm transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gray-50 ring-1 ring-gray-100 flex items-center justify-center flex-shrink-0">
                      <CheckSquare className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{t.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Due <span className="font-medium">{t.due}</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 ${toneMap[t.tone as keyof typeof toneMap]}`}>
                      {t.due}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Today's schedule */}
          <div className="bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Today</h2>
              <p className="text-xs text-gray-500 mt-0.5">Your schedule</p>
            </div>
            <div className="p-6 space-y-4">
              {schedule.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="text-[11px] font-medium text-gray-500 w-16 pt-1.5 flex-shrink-0">{item.time}</div>
                  <div className="flex-1 min-w-0 border-l-2 border-brand-cyan pl-3">
                    <div className="flex items-center gap-2">
                      <span className="text-brand-cyan">{item.icon}</span>
                      <div className="text-sm text-gray-900 truncate">{item.title}</div>
                    </div>
                  </div>
                </div>
              ))}
              {schedule.length === 0 && (
                <div className="text-center py-6">
                  <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No items today</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions (permission-aware) + Help */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick actions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {canUploadResumes && (
                <ActionTile
                  label="Upload resume"
                  icon={<Upload className="w-5 h-5" />}
                  onClick={() => router.push('/recruitment/my-resumes')}
                  tone="brand-blue"
                />
              )}
              {canCreateJD && (
                <ActionTile
                  label="Post JD"
                  icon={<Briefcase className="w-5 h-5" />}
                  onClick={() => router.push('/recruitment/job-creation')}
                  tone="brand-cyan"
                />
              )}
              {canCreateAssessments && (
                <ActionTile
                  label="Create assessment"
                  icon={<FileText className="w-5 h-5" />}
                  onClick={() => router.push('/recruitment/assessments')}
                  tone="brand-teal"
                />
              )}
              {hasPlanFeature('ai_interview') && (
                <ActionTile
                  label="Schedule interview"
                  icon={<Video className="w-5 h-5" />}
                  onClick={() => router.push('/recruitment/ai-interview')}
                  tone="brand-orange"
                />
              )}
              {hasPlanFeature('ai_talent_match') && (
                <ActionTile
                  label="AI talent match"
                  icon={<Sparkles className="w-5 h-5" />}
                  onClick={() => router.push('/recruitment/job-openings')}
                  tone="brand-blue"
                />
              )}
              <ActionTile
                label="View candidates"
                icon={<Users className="w-5 h-5" />}
                onClick={() => router.push('/recruitment/my-resumes')}
                tone="brand-cyan"
              />
            </div>
          </div>

          {/* Help / onboarding */}
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-cyan/10 via-white to-brand-blue/5 rounded-2xl border border-brand-cyan/20 p-6">
            <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-brand-cyan/15 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-brand-cyan/15 ring-1 ring-brand-cyan/25 flex items-center justify-center mb-3">
                <HelpCircle className="w-5 h-5 text-brand-cyan" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">New to TalentFlow?</h3>
              <p className="text-xs text-gray-600 mb-4">
                Walk through the basics and learn how to make the most of your account.
              </p>
              <div className="space-y-2">
                <a
                  href="#"
                  className="flex items-center justify-between p-2.5 bg-white rounded-lg ring-1 ring-gray-100 hover:ring-brand-cyan/30 transition-all text-sm group"
                >
                  <span className="inline-flex items-center gap-2 text-gray-700">
                    <BookOpen className="w-4 h-4 text-brand-cyan" />
                    Getting started guide
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-brand-cyan group-hover:translate-x-0.5 transition-all" />
                </a>
                <a
                  href="#"
                  className="flex items-center justify-between p-2.5 bg-white rounded-lg ring-1 ring-gray-100 hover:ring-brand-cyan/30 transition-all text-sm group"
                >
                  <span className="inline-flex items-center gap-2 text-gray-700">
                    <Video className="w-4 h-4 text-brand-cyan" />
                    Watch a 2-min tour
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-brand-cyan group-hover:translate-x-0.5 transition-all" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Assigned JDs + Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Assigned JDs</h2>
                <p className="text-xs text-gray-500 mt-0.5">JDs you collaborate on</p>
              </div>
              <button
                onClick={() => router.push('/recruitment/job-openings')}
                className="text-sm text-brand-blue hover:text-brand-blue-2 font-medium inline-flex items-center gap-1"
              >
                View all <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {assignedJDs.map((jd) => (
                <button
                  key={jd.id}
                  type="button"
                  onClick={() => router.push(`/recruitment/job-openings/${jd.id}`)}
                  className="w-full flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:border-brand-blue/30 hover:shadow-sm transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{jd.title}</div>
                    <div className="text-[11px] text-gray-500">{jd.dept}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">{jd.applicants}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">applicants</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Recent activity</h2>
              <p className="text-xs text-gray-500 mt-0.5">Your last actions</p>
            </div>
            <div className="p-6 space-y-4">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-${a.tone}/10 ring-1 ring-${a.tone}/15 flex items-center justify-center flex-shrink-0`}>
                    <Activity className={`w-3.5 h-3.5 text-${a.tone}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">{a.action}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">{a.target}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function MiniStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number | string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ring-1 flex items-center justify-center ${accent}`}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">{label}</div>
    </div>
  );
}

function ActionTile({
  label,
  icon,
  onClick,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone: 'brand-blue' | 'brand-cyan' | 'brand-teal' | 'brand-orange';
}) {
  const map = {
    'brand-blue': 'bg-brand-blue/10 ring-brand-blue/15 text-brand-blue hover:bg-brand-blue/15',
    'brand-cyan': 'bg-brand-cyan/10 ring-brand-cyan/15 text-brand-cyan hover:bg-brand-cyan/15',
    'brand-teal': 'bg-brand-teal/10 ring-brand-teal/15 text-brand-teal hover:bg-brand-teal/15',
    'brand-orange': 'bg-brand-orange/10 ring-brand-orange/15 text-brand-orange-deep hover:bg-brand-orange/15',
  };
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-2 p-4 rounded-xl ring-1 transition-all hover:-translate-y-0.5 ${map[tone]}`}
    >
      <div className="w-9 h-9 rounded-lg bg-white/60 flex items-center justify-center">{icon}</div>
      <span className="text-sm font-medium text-gray-900">{label}</span>
    </button>
  );
}
