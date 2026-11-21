'use client';

/* Support Tickets (/support-tickets) — one page for every role:
     tenant admin  My Support Tickets (to TalentFlow) · Team Support Tickets · Unit Disputes
     others        My Requests (to their administrator) · Unit Disputes (with canViewUsage)
   Two views of the same tickets — Table (default) and Kanban — and the
   ticket in a resizable right-side drawer. A user's ticket goes ONLY to Team
   Support Tickets (their tenant admin) and reaches TalentFlow only when the
   admin forwards it.
   Deep links: ?tab=external|team|unit-disputes, ?ticket=<id>. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Clock3, Columns3, Headphones, ListChecks, Lock, Mail, Phone, Scale, Table2, Users } from 'lucide-react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import ForwardTicketDialog from '@/components/support/ForwardTicketDialog';
import UnitDisputesView from '@/components/subscription/unit-disputes/UnitDisputesView';
import { useAuth } from '@/lib/hooks/useAuth';
import { SUPPORT_CONTACT, type Scope, type Ticket } from './model';
import { useDesk, type ViewMode } from './useDesk';
import { TicketDrawer } from './ui';
import TableView from './TableView';
import KanbanView from './KanbanView';
import CreateTicketDialog from './CreateTicketDialog';

type Tab = Scope | 'disputes';
const VIEW_KEY = 'support-tickets:view';
const TAB_KEY = 'support-tickets:tab';

const VIEWS: { key: ViewMode; label: string; hint: string; icon: ReactNode }[] = [
  { key: 'table', label: 'Table', hint: 'KPI filters, table, side drawer', icon: <Table2 className="h-4 w-4" /> },
  { key: 'kanban', label: 'Kanban', hint: 'Columns by status', icon: <Columns3 className="h-4 w-4" /> },
];

const readStored = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};
const store = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } };

/** One area's tickets (keyed by area, so filters start fresh on each). */
function DeskArea({ scope, view, userId, openTicketId }: { scope: Scope; view: ViewMode; userId?: string; openTicketId: string | null }) {
  const desk = useDesk(scope, userId, view);
  const [creating, setCreating] = useState(false);
  const [forwarding, setForwarding] = useState<Ticket | null>(null);

  // ?ticket=<id> — open it once.
  const linked = useRef(false);
  const { open } = desk;
  useEffect(() => {
    if (!openTicketId || linked.current) return;
    linked.current = true;
    void open(openTicketId);
  }, [openTicketId, open]);

  return (
    <>
      {view === 'table'
        ? <TableView desk={desk} scope={scope} onNew={() => setCreating(true)} />
        : <KanbanView desk={desk} scope={scope} onNew={() => setCreating(true)} onForward={setForwarding} />}

      <TicketDrawer desk={desk} meId={userId} onForward={setForwarding} />

      {creating && (
        <CreateTicketDialog
          scope={scope}
          open
          onClose={() => setCreating(false)}
          userId={userId}
          recent={desk.rows}
          onCreate={desk.create}
          onOpenTicket={t => { setCreating(false); void desk.open(t.id, t); }}
        />
      )}
      <ForwardTicketDialog
        ticket={forwarding?.raw ?? null}
        open={!!forwarding}
        onClose={() => setForwarding(null)}
        onForwarded={raw => { desk.actions.forwarded(raw); setForwarding(null); }}
      />
    </>
  );
}

export default function SupportDesk() {
  const { user, isTenantAdmin, hasPermission } = useAuth();
  const isAdmin = !!isTenantAdmin;
  const canViewDisputes = isAdmin || hasPermission('canViewUsage');
  const tabs: { key: Tab; label: string; icon: ReactNode; locked?: boolean }[] = isAdmin
    ? [
        { key: 'support', label: 'My Support Tickets', icon: <Headphones className="h-4 w-4" /> },
        { key: 'team', label: 'Team Support Tickets', icon: <Users className="h-4 w-4" /> },
        { key: 'disputes', label: 'Unit Disputes', icon: <Scale className="h-4 w-4" />, locked: !canViewDisputes },
      ]
    : [
        { key: 'requests', label: 'My Requests', icon: <ListChecks className="h-4 w-4" /> },
        ...(canViewDisputes ? [{ key: 'disputes' as Tab, label: 'Unit Disputes', icon: <Scale className="h-4 w-4" /> }] : []),
      ];
  const allowed = tabs.filter(t => !t.locked).map(t => t.key);

  const [view, setViewState] = useState<ViewMode>(() => readStored<ViewMode>(VIEW_KEY, ['table', 'kanban'], 'table'));
  const [tabChoice, setTabChoice] = useState<Tab | null>(() => readStored<Tab | ''>(TAB_KEY, ['support', 'team', 'requests', 'disputes'], '') || null);
  const [ticketLink, setTicketLink] = useState<string | null>(null);

  // Deep links: ?tab= (wins over the remembered tab) and ?ticket=. Applied
  // once, then removed from the address bar.
  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('tab');
    const ticket = url.searchParams.get('ticket');
    const mapped: Tab | null = t === 'unit-disputes' ? 'disputes' : t === 'external' ? 'support' : t === 'team' ? 'team' : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mapped) setTabChoice(mapped);
    if (ticket) setTicketLink(ticket);
    if (t !== null || ticket !== null) {
      url.searchParams.delete('tab');
      url.searchParams.delete('ticket');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    }
  }, []);

  // Role not known yet — don't flash the wrong tabs.
  if (!user) return null;

  // A remembered / linked tab this user can't open falls back to the first one.
  const tab: Tab = tabChoice && allowed.includes(tabChoice) ? tabChoice : allowed[0];
  const setTab = (next: Tab) => { setTabChoice(next); store(TAB_KEY, next); };
  const setView = (next: ViewMode) => { setViewState(next); store(VIEW_KEY, next); };
  const subtitle = tab === 'support' ? 'Get help from the TalentFlow support team.'
    : tab === 'team' ? 'Manage help requests from your team in one place.'
      : tab === 'requests' ? 'Raise a request to your administrator and follow it to resolution.'
        : 'Ask for units back when a session failed because of a platform problem.';

  return (
    <div className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Support Tickets' }]} />

          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">Support Tickets</h1>
            <p className="mt-1 tf-body-secondary">{subtitle}</p>
          </div>

          {/* Areas · view switch */}
          <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 dark:border-slate-700 md:flex-row md:items-end">
            <div role="tablist" aria-label="Ticket areas" className="flex gap-1 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} aria-disabled={t.locked}
                  title={t.locked ? 'You do not have permission to view unit disputes' : undefined}
                  onClick={() => { if (!t.locked) setTab(t.key); }}
                  className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium ${
                    tab === t.key ? 'border-brand-blue text-brand-blue' : t.locked ? 'cursor-not-allowed border-transparent text-gray-400 opacity-60' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-slate-200'
                  }`}>
                  {t.icon}{t.label}{t.locked && <Lock className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            {tab !== 'disputes' && (
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

          {tab === 'disputes' ? (
            <UnitDisputesView embedded />
          ) : (
            <>
              <DeskArea key={tab} scope={tab} view={view} userId={user.id} openTicketId={ticketLink} />

              {/* Help — Knowledge Base + contact details */}
              {tab === 'support' && (
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
    </div>
  );
}
