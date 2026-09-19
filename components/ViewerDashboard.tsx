'use client';

import { useMemo } from 'react';
import {
  Briefcase,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Award,
  Eye,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useRouter } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';

interface ViewerDashboardProps {
  user?: User;
  tenant?: Tenant;
}

export default function ViewerDashboard({ user, tenant }: ViewerDashboardProps) {
  const router = useRouter();

  const trendData = useMemo(
    () => [
      { month: 'Nov', applications: 220, hires: 12 },
      { month: 'Dec', applications: 280, hires: 16 },
      { month: 'Jan', applications: 340, hires: 22 },
      { month: 'Feb', applications: 310, hires: 18 },
      { month: 'Mar', applications: 380, hires: 26 },
      { month: 'Apr', applications: 420, hires: 32 },
    ],
    []
  );

  const sourceData = [
    { name: 'Job Boards', value: 42, color: 'var(--raw-0f3c99)' },
    { name: 'Referrals', value: 24, color: 'var(--raw-079cc4)' },
    { name: 'LinkedIn', value: 18, color: 'var(--raw-099ab6)' },
    { name: 'Career Site', value: 11, color: 'var(--raw-ed881c)' },
    { name: 'Other', value: 5, color: 'var(--raw-9ca3af)' },
  ];

  const topJDs = [
    { title: 'Senior Backend Engineer', dept: 'Engineering', applicants: 142, score: 88 },
    { title: 'Product Designer', dept: 'Design', applicants: 96, score: 84 },
    { title: 'Sales Lead - APAC', dept: 'Sales', applicants: 78, score: 79 },
    { title: 'DevOps Engineer', dept: 'Engineering', applicants: 64, score: 82 },
    { title: 'Marketing Manager', dept: 'Marketing', applicants: 51, score: 76 },
  ];

  const pipeline = [
    { label: 'Applied', count: 420, pct: 100, color: 'bg-brand-blue' },
    { label: 'Screened', count: 248, pct: 59, color: 'bg-brand-cyan' },
    { label: 'Assessment', count: 132, pct: 31, color: 'bg-brand-teal' },
    { label: 'Interview', count: 64, pct: 15, color: 'bg-brand-orange' },
    { label: 'Offer', count: 32, pct: 8, color: 'bg-brand-orange-deep' },
  ];

  const recentAssessments = [
    { candidate: 'A. Kumar', jd: 'Backend Engineer', score: 92, date: '2026-05-06' },
    { candidate: 'M. Rao', jd: 'Product Designer', score: 88, date: '2026-05-06' },
    { candidate: 'S. Iyer', jd: 'DevOps Engineer', score: 81, date: '2026-05-05' },
    { candidate: 'R. Khan', jd: 'Sales Lead - APAC', score: 76, date: '2026-05-05' },
    { candidate: 'P. Joshi', jd: 'Marketing Manager', score: 74, date: '2026-05-04' },
  ];

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="p-4 md:p-8 w-full max-w-[1400px] mx-auto">
        <div className="mb-8">
          <WelcomeBanner user={user} tenant={tenant} />
        </div>

        {/* Read-only context strip */}
        <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 text-xs">
          <Eye className="w-3.5 h-3.5" />
          Read-only view · Hiring insights
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <KpiTile
            label="Active JDs"
            value="42"
            sub="across 6 departments"
            icon={<Briefcase className="w-6 h-6 text-brand-blue" />}
            accent="bg-brand-blue/10 ring-brand-blue/15"
            trend={{ dir: 'up', value: '+8%' }}
          />
          <KpiTile
            label="Candidates in Pipeline"
            value="892"
            sub="248 newly screened"
            icon={<Users className="w-6 h-6 text-brand-cyan" />}
            accent="bg-brand-cyan/10 ring-brand-cyan/15"
            trend={{ dir: 'up', value: '+12%' }}
          />
          <KpiTile
            label="Hires this month"
            value="32"
            sub="vs 26 last month"
            icon={<CheckCircle2 className="w-6 h-6 text-brand-teal" />}
            accent="bg-brand-teal/10 ring-brand-teal/15"
            trend={{ dir: 'up', value: '+23%' }}
          />
          <KpiTile
            label="Avg time-to-hire"
            value="18d"
            sub="3 days faster"
            icon={<Clock className="w-6 h-6 text-brand-orange" />}
            accent="bg-brand-orange/10 ring-brand-orange/15"
            trend={{ dir: 'down', value: '-3d', positive: true }}
          />
        </div>

        {/* Pipeline + Hiring trends */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Hiring trends</h2>
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Last 6 months</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-brand-blue" />
                  Applications
                </span>
                <span className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-brand-orange" />
                  Hires
                </span>
              </div>
            </div>
            <div className="h-72 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--raw-e5e7eb)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--raw-6b7280)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--raw-6b7280)' }} axisLine={false} tickLine={false} />
                  <ReTooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--raw-e5e7eb)', fontSize: 12 }} />
                  <Line type="monotone" dataKey="applications" stroke="var(--raw-0f3c99)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="hires" stroke="var(--raw-ed881c)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50 mb-1">Pipeline funnel</h2>
            <p className="text-xs text-gray-500 dark:text-slate-500 mb-5">Aggregated across all JDs</p>
            <div className="space-y-4">
              {pipeline.map((stage) => (
                <div key={stage.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{stage.label}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500 tabular-nums">
                      {stage.count} <span className="text-gray-400 dark:text-slate-500">· {stage.pct}%</span>
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${stage.color} transition-all`} style={{ width: `${stage.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* JD leaderboard + Source of hire */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Top performing JDs</h2>
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">By applicant volume + AI match score</p>
              </div>
              <button
                onClick={() => router.push('/recruitment/job-openings')}
                className="text-sm text-brand-blue hover:text-brand-blue-2 font-medium inline-flex items-center gap-1"
              >
                View all <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">#</th>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">Job description</th>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3 text-right text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">Applicants</th>
                    <th className="px-6 py-3 text-right text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">Avg score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {topJDs.map((j, i) => (
                    <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-slate-50">{j.title}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">{j.dept}</td>
                      <td className="px-6 py-4 text-sm text-right tabular-nums text-gray-900 dark:text-slate-50">{j.applicants}</td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            j.score >= 85
                              ? 'bg-green-50 text-green-700 ring-1 ring-green-100'
                              : j.score >= 75
                              ? 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/15'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-1 ring-gray-200'
                          }`}
                        >
                          <Award className="w-3 h-3" />
                          {j.score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50 mb-1">Source of hire</h2>
            <p className="text-xs text-gray-500 dark:text-slate-500 mb-3">% of total hires</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {sourceData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <ReTooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--raw-e5e7eb)', fontSize: 12 }}
                    formatter={(v: any) => [`${v}%`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-3">
              {sourceData.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 text-gray-700 dark:text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                  <span className="tabular-nums text-gray-500 dark:text-slate-500">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent assessments (read-only) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm mb-6">
          <div className="p-6 border-b border-gray-100 dark:border-slate-700/60">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Recent assessments</h2>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Latest scored candidates</p>
          </div>
          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">Candidate</th>
                  <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">JD</th>
                  <th className="px-6 py-3 text-right text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">Score</th>
                  <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 dark:text-slate-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {recentAssessments.map((a, i) => (
                  <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-slate-50">{a.candidate}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">{a.jd}</td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          a.score >= 85
                            ? 'bg-green-50 text-green-700 ring-1 ring-green-100'
                            : a.score >= 75
                            ? 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/15'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 ring-1 ring-gray-200'
                        }`}
                      >
                        {a.score}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-400">{a.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  trend?: { dir: 'up' | 'down'; value: string; positive?: boolean };
}) {
  const trendUp = trend?.dir === 'up';
  const positive = trend?.positive ?? trendUp;
  return (
    <div className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-6 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-xl ${accent} ring-1 flex items-center justify-center`}>{icon}</div>
        {trend && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? 'text-green-600' : 'text-red-600'}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">{value}</div>
      <div className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-500 dark:text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
