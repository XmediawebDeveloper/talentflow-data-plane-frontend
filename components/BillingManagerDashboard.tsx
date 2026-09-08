'use client';

import { useMemo } from 'react';
import {
  CreditCard,
  Crown,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  Receipt,
  Wallet,
  Users,
  Zap,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  AreaChart,
  Area,
} from 'recharts';
import { useRouter } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface BillingManagerDashboardProps {
  user?: User;
  tenant?: Tenant;
}

export default function BillingManagerDashboard({ user, tenant }: BillingManagerDashboardProps) {
  const router = useRouter();
  const { quotaData } = useQuota();
  const { hasPermission } = useAuth();

  const subscription = tenant?.subscription;
  const planName = quotaData?.plan_name || subscription?.planName || '—';
  const renewalDate = subscription?.renewalDate;
  const seatsUsed = subscription?.usage?.currentSeats ?? 0;
  const seatsLimit = subscription?.limits?.maxSeats ?? 0;

  const canExportUsage = hasPermission('canExportUsage');
  const canAddPaymentMethod = hasPermission('canAddPaymentMethod');

  // Spend trend (mock — wire to billing API when available)
  const spendTrend = useMemo(
    () => [
      { month: 'Nov', spend: 4200, overage: 0 },
      { month: 'Dec', spend: 4500, overage: 120 },
      { month: 'Jan', spend: 5100, overage: 380 },
      { month: 'Feb', spend: 4800, overage: 0 },
      { month: 'Mar', spend: 5200, overage: 220 },
      { month: 'Apr', spend: 5600, overage: 410 },
    ],
    []
  );

  // Build a normalized usage bar list. quotaData.quotas is an object keyed by code (RU/RS/AIU/AS),
  // each entry has .subscription.{limit,used}.
  const usageBars = useMemo(() => {
    const labelMap: Record<string, string> = {
      RU: 'Resume Parses',
      RS: 'Scoring Credits',
      AIU: 'AI Interview Minutes',
      AS: 'Assessment Units',
    };
    const live = Object.entries(quotaData?.quotas || {})
      .filter(([k]) => k in labelMap)
      .map(([k, q]) => {
        const used = typeof q?.subscription?.used === 'number' ? q!.subscription!.used : 0;
        const limit = typeof q?.subscription?.limit === 'number' ? q!.subscription!.limit : 0;
        return { name: labelMap[k], used, limit };
      })
      .filter((q) => q.limit > 0);
    if (live.length > 0) return live;
    return [
      { name: 'Resume Parses', used: 1593, limit: 2450 },
      { name: 'Scoring Credits', used: 412, limit: 1000 },
      { name: 'AI Interview Minutes', used: 480, limit: 1200 },
      { name: 'Assessment Units', used: 142, limit: 500 },
    ];
  }, [quotaData]);

  // Top consumers (mock)
  const topConsumers = [
    { name: 'Priya Sharma', team: 'Engineering Hiring', credits: 482, color: 'bg-brand-blue' },
    { name: 'Arjun Verma', team: 'Sales Hiring', credits: 364, color: 'bg-brand-cyan' },
    { name: 'Neha Patel', team: 'Product Hiring', credits: 218, color: 'bg-brand-teal' },
    { name: 'Karthik R.', team: 'Engineering Hiring', credits: 175, color: 'bg-brand-orange' },
  ];

  // Mock invoices
  const invoices = [
    { id: 'INV-2026-04', date: '2026-04-01', amount: 5600, status: 'paid' },
    { id: 'INV-2026-03', date: '2026-03-01', amount: 5200, status: 'paid' },
    { id: 'INV-2026-02', date: '2026-02-01', amount: 4800, status: 'paid' },
    { id: 'INV-2026-01', date: '2026-01-01', amount: 5100, status: 'paid' },
  ];

  const projectedExhaustion = useMemo(() => {
    return usageBars.reduce<{ daysLeft: number; name: string } | null>((acc, q) => {
      if (q.limit <= 0) return acc;
      const pct = q.used / q.limit;
      if (pct < 0.5) return acc;
      const remaining = q.limit - q.used;
      const dailyBurn = q.used / 25;
      const daysLeft = dailyBurn > 0 ? Math.round(remaining / dailyBurn) : Infinity;
      if (!acc || daysLeft < acc.daysLeft) return { daysLeft, name: q.name };
      return acc;
    }, null);
  }, [usageBars]);

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="p-4 md:p-8 w-full max-w-[1400px] mx-auto">
        <div className="mb-8">
          <WelcomeBanner user={user} tenant={tenant} />
        </div>

        {/* Top row: Invoice + Plan card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Current invoice — prominent */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal text-white p-6 shadow-lg shadow-brand-blue/20">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-cyan/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-brand-orange/15 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/70 mb-2">
                <Receipt className="w-3.5 h-3.5" />
                Current invoice
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-8 mb-6">
                <div>
                  <div className="text-4xl sm:text-5xl font-bold tracking-tight">${spendTrend.at(-1)?.spend.toLocaleString()}</div>
                  <div className="text-sm text-white/80 mt-1">
                    Due {renewalDate ? formatISTDate(renewalDate) : 'on next cycle'}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-green-400/15 px-3 py-1 text-xs font-medium ring-1 ring-green-300/30 text-green-100">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  On track
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => router.push('/subscription/billing-history')}
                  className="px-5 py-2.5 bg-white text-brand-blue rounded-xl text-sm font-semibold hover:bg-white/90 transition-colors inline-flex items-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Pay now
                </button>
                <button
                  onClick={() => router.push('/subscription/billing-history')}
                  className="px-5 py-2.5 bg-white/10 backdrop-blur-sm ring-1 ring-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/15 transition-colors inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download invoice
                </button>
              </div>
            </div>
          </div>

          {/* Plan card */}
          <div className="bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
                <Crown className="w-5 h-5 text-brand-blue" />
              </div>
              <span className="text-xs text-gray-500">Active</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 tracking-tight">{planName}</div>
            <div className="text-xs text-gray-500 mt-1">Current plan</div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 inline-flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  Seats
                </span>
                <span className="font-medium text-gray-900 tabular-nums">
                  {seatsUsed} / {seatsLimit || '∞'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 inline-flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Renews
                </span>
                <span className="font-medium text-gray-900">
                  {renewalDate ? formatISTDate(renewalDate) : '—'}
                </span>
              </div>
            </div>
            <button
              onClick={() => router.push('/subscription/current-plan')}
              className="mt-5 w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors inline-flex items-center justify-center gap-1"
            >
              Manage plan <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Projected exhaustion alert */}
        {projectedExhaustion && projectedExhaustion.daysLeft < 30 && (
          <div className="bg-gradient-to-br from-brand-orange/10 via-white to-brand-orange/5 border border-brand-orange/20 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/15 ring-1 ring-brand-orange/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-brand-orange-deep" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Quota burndown</h3>
                <p className="text-sm text-gray-700">
                  At current pace, <span className="font-semibold">{projectedExhaustion.name}</span> will be exhausted in
                  <span className="font-semibold text-brand-orange-deep"> {projectedExhaustion.daysLeft} days</span>.
                </p>
              </div>
              <button
                onClick={() => router.push('/subscription/current-plan')}
                className="px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange-deep transition-colors flex-shrink-0"
              >
                Top up
              </button>
            </div>
          </div>
        )}

        {/* Usage vs plan */}
        <div className="bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Usage vs Plan</h2>
              <p className="text-xs text-gray-500 mt-0.5">Current billing cycle</p>
            </div>
            {canExportUsage && (
              <button
                onClick={() => router.push('/organization/usage')}
                className="text-sm text-brand-blue hover:text-brand-blue-2 font-medium inline-flex items-center gap-1"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {usageBars.map((q, i: number) => {
              const used = q.used;
              const limit = q.limit;
              const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              const isHigh = pct >= 80;
              const colors = ['bg-brand-blue', 'bg-brand-cyan', 'bg-brand-teal', 'bg-brand-orange'];
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">{q.name}</span>
                    <span className={`text-sm tabular-nums ${isHigh ? 'text-brand-orange-deep font-semibold' : 'text-gray-600'}`}>
                      {used.toLocaleString()} / {limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${isHigh ? 'bg-brand-orange' : colors[i % colors.length]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500">
                    <span>{pct}% used</span>
                    <span>{(limit - used).toLocaleString()} remaining</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spend trend + Top consumers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Spend trend</h2>
                <p className="text-xs text-gray-500 mt-0.5">Last 6 months</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-brand-blue" />
                  Plan spend
                </span>
                <span className="inline-flex items-center gap-1 text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-brand-orange" />
                  Overage
                </span>
              </div>
            </div>
            <div className="h-64 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spendTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="planFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f3c99" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#0f3c99" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="overFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ed881c" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#ed881c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <ReTooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v: any) => [`$${v.toLocaleString()}`, '']}
                  />
                  <Area type="monotone" dataKey="spend" stroke="#0f3c99" strokeWidth={2} fill="url(#planFill)" />
                  <Area type="monotone" dataKey="overage" stroke="#ed881c" strokeWidth={2} fill="url(#overFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Top consumers</h2>
              <button
                onClick={() => router.push('/organization/usage')}
                className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
              >
                All
              </button>
            </div>
            <div className="space-y-4">
              {topConsumers.map((c, i) => {
                const max = Math.max(...topConsumers.map((x) => x.credits));
                const pct = (c.credits / max) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                        <div className="text-[11px] text-gray-500">{c.team}</div>
                      </div>
                      <span className="text-sm tabular-nums text-gray-700 ml-3">{c.credits}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${c.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Invoice history */}
        <div className="bg-white rounded-2xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm mb-6">
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Invoice history</h2>
              <p className="text-xs text-gray-500 mt-0.5">Last 4 invoices</p>
            </div>
            <button
              onClick={() => router.push('/subscription/billing-history')}
              className="text-sm text-brand-blue hover:text-brand-blue-2 font-medium inline-flex items-center gap-1"
            >
              View all <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatISTDate(inv.date)}</td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums text-gray-900">${inv.amount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700 ring-1 ring-green-100">
                        <CheckCircle2 className="w-3 h-3" />
                        Paid
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium inline-flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </button>
                    </td>
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
