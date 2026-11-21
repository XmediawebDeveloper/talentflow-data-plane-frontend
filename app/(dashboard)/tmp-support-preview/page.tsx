'use client';

/* TEMP — Support Tickets redesign preview (/tmp-support-preview).
   The chosen design: two views of the same tickets — Table (default, the
   Service Desk Console) and Kanban (by status). Both open a ticket in the
   same right-side drawer. All on the REAL
   data (GET only — see components/support-preview/data.ts); nothing is
   created, changed or sent: every action shows a "preview" toast. The live
   /support-tickets page is untouched. */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  BookOpen, Columns3, ExternalLink, Eye, Headphones, ListChecks, Mail, Phone, Clock3, Scale, Table2, Users,
} from 'lucide-react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useAuth } from '@/lib/hooks/useAuth';
import { SUPPORT_CONTACT, useSupportData, type Scope } from '@/components/support-preview/data';
import { CreateTicketDialog, type DesignProps } from '@/components/support-preview/shared';
import DesignConsole from '@/components/support-preview/DesignConsole';
import DesignBoard from '@/components/support-preview/DesignBoard';

type ViewKey = 'table' | 'kanban';

const VIEWS: { key: ViewKey; label: string; hint: string; icon: ReactNode }[] = [
  { key: 'table', label: 'Table', hint: 'KPI filters, table, side drawer', icon: <Table2 className="h-4 w-4" /> },
  { key: 'kanban', label: 'Kanban', hint: 'Columns by status', icon: <Columns3 className="h-4 w-4" /> },
];

export default function SupportPreviewPage() {
  const { user, isTenantAdmin } = useAuth();
  // Table (Option 1) is the default view.
  const [view, setView] = useState<ViewKey>('table');
  // Admins: My Support Tickets (TalentFlow) + Team Support Tickets. Others: their Help Desk requests.
  const [tab, setTab] = useState<Scope | 'disputes'>('support');
  const [creating, setCreating] = useState(false);
  const isAdmin = !!isTenantAdmin;
  const scope: Scope = !isAdmin ? 'team' : tab === 'team' ? 'team' : 'support';
  const data = useSupportData(scope, isAdmin);

  if (!user) return null;

  const props: DesignProps = {
    scope, tickets: data.tickets, total: data.total, stats: data.stats, state: data.state, error: data.error,
    onRetry: data.retry, loadDetail: data.loadDetail, onNew: () => setCreating(true),
  };
  const tabs: { key: Scope | 'disputes'; label: string; icon: ReactNode }[] = isAdmin
    ? [
        { key: 'support', label: 'My Support Tickets', icon: <Headphones className="h-4 w-4" /> },
        { key: 'team', label: 'Team Support Tickets', icon: <Users className="h-4 w-4" /> },
        { key: 'disputes', label: 'Unit Disputes', icon: <Scale className="h-4 w-4" /> },
      ]
    : [{ key: 'team', label: 'My Requests', icon: <ListChecks className="h-4 w-4" /> }];
  const activeTab = isAdmin ? tab : 'team';

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-x-clip bg-white xl:bg-slate-50 dark:bg-slate-900 xl:dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="w-full bg-white p-4 md:p-8 xl:my-5 xl:rounded-2xl xl:shadow-2xl dark:bg-slate-900">
          <PageBreadcrumb className="mb-4" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Support Tickets — design preview' }]} />

          {/* Page header */}
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">Support Tickets</h1>
              <p className="mt-1 tf-body-secondary">
                {isAdmin
                  ? 'Get help from the TalentFlow support team, and manage your team’s help requests in one place.'
                  : 'Raise a request to your administrator and follow it to resolution.'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-semibold text-brand-orange-deep lg:self-auto">
              <Eye className="h-3.5 w-3.5" />Preview · real data, read only · actions are simulated
            </span>
          </div>

          {/* Design picker */}
          {/* Scope tabs · view switch (Table / Kanban) */}
          <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 dark:border-slate-700 md:flex-row md:items-end">
            <div role="tablist" aria-label="Ticket areas" className="flex gap-1 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key} onClick={() => setTab(t.key)}
                  className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium ${activeTab === t.key ? 'border-brand-blue text-brand-blue' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200'}`}>
                  {t.icon}{t.label}
                  {t.key === scope && activeTab !== 'disputes' && data.state === 'ready' && <span className="rounded-full bg-gray-100 px-1.5 text-[11px] tabular-nums text-gray-600 dark:bg-slate-800 dark:text-slate-300">{data.total}</span>}
                </button>
              ))}
            </div>
            {activeTab !== 'disputes' && (
              <div role="radiogroup" aria-label="View" className="mb-2 inline-flex self-start rounded-lg bg-gray-100 p-0.5 dark:bg-slate-800 md:ml-auto md:self-auto">
                {VIEWS.map(v => (
                  <button key={v.key} type="button" role="radio" aria-checked={view === v.key} onClick={() => setView(v.key)} title={v.hint}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${view === v.key ? 'bg-white text-brand-blue shadow-sm ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700' : 'text-gray-600 hover:text-gray-900 dark:text-slate-300'}`}>
                    {v.icon}{v.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeTab === 'disputes' ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-6 py-14 text-center dark:border-slate-600">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue"><Scale className="h-5 w-5" /></span>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Unit Disputes stays as it is</p>
              <p className="tf-meta max-w-md">It is a shared screen (also under Subscription), so it is not part of this redesign. It keeps working in the live page.</p>
              <Link href="/support-tickets?tab=unit-disputes" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline">Open Unit Disputes <ExternalLink className="h-3.5 w-3.5" /></Link>
            </div>
          ) : (
            <>
              {view === 'table' && <DesignConsole key={scope} {...props} />}
              {view === 'kanban' && <DesignBoard key={scope} {...props} />}

              {/* Help strip — the live page's Knowledge Base + contact details */}
              {scope === 'support' && (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900 md:flex-row md:items-center">
                  <span className="flex items-center gap-2 font-medium text-gray-800 dark:text-slate-200"><BookOpen className="h-4 w-4 text-brand-blue" />Knowledge base <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-600 dark:bg-slate-700 dark:text-slate-300">Coming soon</span></span>
                  <span className="flex flex-wrap gap-x-5 gap-y-1 text-gray-600 dark:text-slate-300 md:ml-auto">
                    {SUPPORT_CONTACT.map(c => (
                      <span key={c.label} className="inline-flex items-center gap-1.5">
                        {c.label === 'Email' ? <Mail className="h-3.5 w-3.5 text-gray-400" /> : c.label === 'Phone' ? <Phone className="h-3.5 w-3.5 text-gray-400" /> : <Clock3 className="h-3.5 w-3.5 text-gray-400" />}
                        {c.href ? <a href={c.href} className="hover:text-brand-blue hover:underline">{c.value}</a> : c.value}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <CreateTicketDialog key={`${scope}-${creating}`} scope={scope} open={creating} onClose={() => setCreating(false)} />
    </main>
  );
}
