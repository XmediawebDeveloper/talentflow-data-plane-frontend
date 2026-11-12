'use client';

import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Inbox, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle,
  Search, ArrowLeft, Filter, CheckCircle2, Circle, Clock3, XCircle,
  User, Calendar, Loader2, HelpCircle, KeyRound, Bug, MessageCircleQuestion, MoreHorizontal,
  UserCheck, Users, BarChart3, RefreshCw, Sparkles, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { internalTicketService, InternalTicket, InternalTicketAdminStats, InternalTicketCategory, InternalTicketPriority, InternalTicketStatus } from '@/lib/services';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { StatValuePlaceholder } from '@/components/ui/stats-card';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { NoTeamTicketsState, NoTicketsFoundState } from '@/components/SupportEmptyStates';

type ViewType = 'overview' | 'tickets' | 'detail';

const categories = [
  { value: 'account-access', label: 'Account Access', icon: KeyRound },
  { value: 'permission-request', label: 'Permission Request', icon: User },
  { value: 'feature-question', label: 'Feature Question', icon: MessageCircleQuestion },
  { value: 'bug-report', label: 'Bug Report', icon: Bug },
  { value: 'general-inquiry', label: 'General Inquiry', icon: HelpCircle },
  { value: 'other', label: 'Other', icon: MoreHorizontal }
];

const priorities = [
  { value: 'low', label: 'Low', color: 'text-gray-600 bg-gray-100 border-gray-300' },
  { value: 'medium', label: 'Medium', color: 'text-gray-800 bg-gray-100 border-gray-300' },
  { value: 'high', label: 'High', color: 'text-orange-600 bg-orange-100 border-orange-300' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const ASSIGNMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'All Tickets' },
  { value: 'mine', label: 'Assigned to Me' },
  { value: 'unassigned', label: 'Unassigned' },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All Priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function InternalTicketAdmin() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticketIdFromUrl = searchParams.get('ticket');

  const [view, setView] = useState<ViewType>('overview');
  const [selectedTicket, setSelectedTicket] = useState<InternalTicket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignment, setFilterAssignment] = useState<string>('all');
  const [replyMessage, setReplyMessage] = useState('');

  // Data states
  const [tickets, setTickets] = useState<InternalTicket[]>([]);
  const [stats, setStats] = useState<InternalTicketAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // The stats call failed — the cards show '—' instead of a number.
  const [statsFailed, setStatsFailed] = useState(false);
  const hasFetched = useRef(false);
  /* Bumped by every fetchTickets run, so only the latest request's rows apply.
     The mount fetch runs with default filters before the saved ones are
     restored, then again with them; whichever landed last used to win. */
  const fetchSeqRef = useRef(0);
  const hasHandledUrlTicket = useRef(false);

  // Persist scroll + view state so returning from a ticket detail lands the user
  // where they left off. Re-detect the scroll container when the view flips
  // (overview / tickets / detail have very different heights). The 'detail' view
  // isn't restored because it depends on a selectedTicket that isn't persisted.
  const rootRef = useScrollRestoration<HTMLElement>('org-internal-tickets', !loading, [view]);
  useListStatePersistence(
    'org-internal-tickets',
    { view, searchQuery, filterStatus, filterPriority, filterAssignment },
    (s) => {
      if (s.view === 'overview' || s.view === 'tickets') setView(s.view);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterStatus === 'string') setFilterStatus(s.filterStatus);
      if (typeof s.filterPriority === 'string') setFilterPriority(s.filterPriority);
      if (typeof s.filterAssignment === 'string') setFilterAssignment(s.filterAssignment);
    },
  );

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchTickets();
    fetchStats();
  }, []);

  // Handle ticket ID from URL query parameter
  useEffect(() => {
    if (ticketIdFromUrl && !hasHandledUrlTicket.current) {
      hasHandledUrlTicket.current = true;
      // Fetch and open the specific ticket
      const openTicketFromUrl = async () => {
        try {
          const ticket = await internalTicketService.getTicket(ticketIdFromUrl);
          setSelectedTicket(ticket);
          setView('detail');
          // Clear the query parameter from URL
          router.replace('/organization/internal-tickets', { scroll: false });
        } catch (error) {
          console.error('Error fetching ticket from URL:', error);
          toast.error('Could not find the requested ticket');
        }
      };
      openTicketFromUrl();
    }
  }, [ticketIdFromUrl, router]);

  const fetchTickets = async () => {
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;
    try {
      setLoading(true);
      const response = await internalTicketService.adminListAllTickets({
        status: filterStatus !== 'all' ? filterStatus as any : undefined,
        priority: filterPriority !== 'all' ? filterPriority as any : undefined,
        search: searchQuery || undefined,
        assigned_to_me: filterAssignment === 'mine' ? true : undefined,
        unassigned: filterAssignment === 'unassigned' ? true : undefined,
      });
      if (isStale()) return;
      setTickets(response.items);
    } catch (error) {
      if (isStale()) return;
      console.error('Error fetching tickets:', error);
      setTickets([]);
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await internalTicketService.adminGetStats();
      setStats(data);
      setStatsFailed(false);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStatsFailed(true);
    }
  };

  const fetchTicketDetail = async (ticketId: string) => {
    try {
      const ticket = await internalTicketService.getTicket(ticketId);
      setSelectedTicket(ticket);
    } catch (error) {
      console.error('Error fetching ticket detail:', error);
    }
  };

  useEffect(() => {
    if (!hasFetched.current) return;
    fetchTickets();
  }, [filterStatus, filterPriority, filterAssignment]);

  const handleAssignTicket = async (ticketId: string) => {
    try {
      setActionLoading(ticketId);
      const updatedTicket = await internalTicketService.assignTicket(ticketId);
      setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(updatedTicket);
      }
      toast.success('Ticket assigned to you');
      fetchStats();
    } catch (error) {
      console.error('Error assigning ticket:', error);
      toast.error('Failed to assign ticket');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveTicket = async (ticketId: string) => {
    try {
      setActionLoading(ticketId);
      const updatedTicket = await internalTicketService.resolveTicket(ticketId);
      setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(updatedTicket);
      }
      toast.success('Ticket marked as resolved');
      fetchStats();
    } catch (error) {
      console.error('Error resolving ticket:', error);
      toast.error('Failed to resolve ticket');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    try {
      setActionLoading(ticketId);
      const updatedTicket = await internalTicketService.closeTicket(ticketId);
      setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(updatedTicket);
      }
      toast.success('Ticket closed');
      fetchStats();
    } catch (error) {
      console.error('Error closing ticket:', error);
      toast.error('Failed to close ticket');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReopenTicket = async (ticketId: string) => {
    try {
      setActionLoading(ticketId);
      const updatedTicket = await internalTicketService.reopenTicket(ticketId);
      setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(updatedTicket);
      }
      toast.success('Ticket reopened');
      fetchStats();
    } catch (error) {
      console.error('Error reopening ticket:', error);
      toast.error('Failed to reopen ticket');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim() || !selectedTicket) return;

    try {
      const updatedTicket = await internalTicketService.addResponse(selectedTicket.id, {
        message: replyMessage,
      });

      setSelectedTicket(updatedTicket);
      setTickets(tickets.map(t => t.id === selectedTicket.id ? updatedTicket : t));
      setReplyMessage('');
      toast.success('Reply sent successfully');
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error('Failed to send reply');
    }
  };

  const handleUpdatePriority = async (ticketId: string, newPriority: InternalTicketPriority) => {
    try {
      const updatedTicket = await internalTicketService.updateTicket(ticketId, { priority: newPriority });
      setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(updatedTicket);
      }
      toast.success('Priority updated');
    } catch (error) {
      console.error('Error updating priority:', error);
      toast.error('Failed to update priority');
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'info' | 'warning' | 'success' | 'muted'; icon: typeof Circle }> = {
      'open': { variant: 'warning', icon: Circle },
      'in-progress': { variant: 'info', icon: Clock3 },
      'resolved': { variant: 'success', icon: CheckCircle2 },
      'closed': { variant: 'muted', icon: XCircle },
    };
    const { variant, icon: Icon } = map[status] || map['open'];
    return (
      <Badge variant={variant} className="gap-1.5 px-3 py-1.5">
        <Icon className="w-3.5 h-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </Badge>
    );
  };

  const getPriorityBadge = (priorityValue: string) => {
    const priorityData = priorities.find(p => p.value === priorityValue);
    return (
      <span className={`px-2.5 py-1 rounded text-xs border ${priorityData?.color}`}>
        {priorityData?.label}
      </span>
    );
  };

  const getCategoryLabel = (categoryValue: string) => {
    return categories.find(c => c.value === categoryValue)?.label || categoryValue;
  };

  const getCategoryIcon = (categoryValue: string) => {
    const cat = categories.find(c => c.value === categoryValue);
    return cat?.icon || HelpCircle;
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.created_by?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // The overview stat cards can set 'in_progress', so match either separator.
  const statusFilterLabel = (v: string) =>
    STATUS_FILTER_OPTIONS.find(o => o.value === v.replace(/_/g, '-'))?.label ?? v;
  const activeFilterChips: FilterChip[] = [
    filterStatus !== 'all' && {
      key: 'status',
      label: 'Status',
      value: statusFilterLabel(filterStatus),
      onRemove: () => setFilterStatus('all'),
    },
    filterAssignment !== 'all' && {
      key: 'assignment',
      label: 'Assignment',
      value: ASSIGNMENT_FILTER_OPTIONS.find(o => o.value === filterAssignment)?.label ?? filterAssignment,
      onRemove: () => setFilterAssignment('all'),
    },
    filterPriority !== 'all' && {
      key: 'priority',
      label: 'Priority',
      value: PRIORITY_FILTER_OPTIONS.find(o => o.value === filterPriority)?.label ?? filterPriority,
      onRemove: () => setFilterPriority('all'),
    },
  ].filter(Boolean) as FilterChip[];

  /* Placeholder until stats arrive ('—' if they failed) rather than a
     provisional 0 that then jumps. */
  const statCount = (value: number | undefined) =>
    value !== undefined ? value : statsFailed ? '—' : <StatValuePlaceholder />;
  const openTickets = statCount(stats?.open_tickets);
  const inProgressTickets = statCount(stats?.in_progress_tickets);
  const resolvedTickets = statCount(stats?.resolved_tickets);
  // Numeric for the "needs attention" banner, which simply stays hidden at 0.
  const unassignedTickets = stats?.unassigned_tickets ?? 0;
  const unassignedCount = statCount(stats?.unassigned_tickets);
  const totalTickets = statCount(stats?.total_tickets);

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Internal Tickets' }]} />
      {/* SaaS Hero Header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8">
        <div className="mx-auto max-w-[1400px]">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                  <Inbox className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="tf-badge mb-2 gap-1.5 bg-white/10 text-2xs text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                    <Sparkles className="h-3 w-3 text-brand-orange" />
                    Internal helpdesk
                  </div>
                  <h1 className="tf-page-title">Team Support Tickets</h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">Manage help requests from your team members in one place.</p>
                </div>
              </div>
              <button
                onClick={() => { fetchTickets(); fetchStats(); }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6 lg:p-8 mx-auto max-w-[1400px]">
        {/* Overview */}
        {view === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards — clicking a card drills into the tickets list pre-filtered by that status */}
            <div className="tf-grid-stats-5">
              <button
                type="button"
                onClick={() => { setFilterStatus('open'); setView('tickets'); }}
                className="text-left w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="tf-eyebrow tracking-wide">Open</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                    <Circle className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{openTickets}</div>
                <div className="tf-meta">Awaiting action</div>
              </button>

              <button
                type="button"
                onClick={() => { setFilterStatus('in_progress'); setView('tickets'); }}
                className="text-left w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="tf-eyebrow tracking-wide">In Progress</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning-subtle text-warning ring-1 ring-warning-line">
                    <Clock3 className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{inProgressTickets}</div>
                <div className="tf-meta">Being handled</div>
              </button>

              <button
                type="button"
                onClick={() => { setFilterStatus('resolved'); setView('tickets'); }}
                className="text-left w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="tf-eyebrow tracking-wide">Resolved</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/15">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{resolvedTickets}</div>
                <div className="tf-meta">Successfully resolved</div>
              </button>

              <button
                type="button"
                onClick={() => { setFilterAssignment('unassigned'); setFilterStatus('all'); setView('tickets'); }}
                className="text-left w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="tf-eyebrow tracking-wide">Unassigned</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/15">
                    <Users className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{unassignedCount}</div>
                <div className="tf-meta">Need assignment</div>
              </button>

              <button
                type="button"
                onClick={() => { setFilterStatus('all'); setFilterAssignment('all'); setView('tickets'); }}
                className="text-left w-full rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="tf-eyebrow tracking-wide">Total</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-cyan/15 to-brand-blue/10 text-brand-blue ring-1 ring-brand-cyan/15">
                    <Ticket className="w-4 h-4" />
                  </span>
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{totalTickets}</div>
                <div className="tf-meta">All time</div>
              </button>
            </div>

            {/* Category Breakdown */}
            {stats?.tickets_by_category && Object.keys(stats.tickets_by_category).length > 0 && (
              <div className="tf-card-soft p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Tickets by Category</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {Object.entries(stats.tickets_by_category).map(([cat, count]) => {
                    const CategoryIcon = getCategoryIcon(cat);
                    return (
                      <div key={cat} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <CategoryIcon className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="tf-section-title">{count}</div>
                          <div className="tf-meta">{getCategoryLabel(cat)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="tf-grid-3">
              <button
                onClick={() => { setFilterAssignment('unassigned'); setView('tickets'); }}
                className="group relative overflow-hidden rounded-2xl bg-brand-orange text-white shadow-lg shadow-brand-orange/25 ring-1 ring-white/10 p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                <Users className="relative w-8 h-8 mb-3" />
                <h3 className="relative text-lg font-semibold text-white mb-1">Unassigned Tickets</h3>
                <p className="relative text-sm text-white/85">
                  {unassignedTickets} tickets need attention
                </p>
              </button>

              <button
                onClick={() => { setFilterAssignment('mine'); setView('tickets'); }}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal text-white shadow-lg shadow-brand-blue/25 ring-1 ring-white/10 p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-xl"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-cyan/20 blur-2xl" />
                <UserCheck className="relative w-8 h-8 mb-3" />
                <h3 className="relative text-lg font-semibold text-white mb-1">My Assigned Tickets</h3>
                <p className="relative text-sm text-white/85">
                  View tickets assigned to you
                </p>
              </button>

              <button
                onClick={() => { setFilterAssignment('all'); setView('tickets'); }}
                className="group rounded-2xl border border-gray-100 bg-white p-6 text-left shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/30 hover:shadow-md"
              >
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                  <Ticket className="w-5 h-5" />
                </span>
                <h3 className="tf-section-title mb-1">All Team Tickets</h3>
                <p className="tf-body-secondary">
                  View all team support requests
                </p>
              </button>
            </div>

            {/* Recent Tickets */}
            <div className="tf-card-soft p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-gray-900">Recent Team Tickets</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="text-sm text-gray-700 hover:text-gray-900"
                >
                  View All
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 tf-loader-center">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
                </div>
              ) : tickets.length === 0 ? (
                <NoTeamTicketsState />
              ) : (
                <div className="space-y-3">
                  {tickets.slice(0, 5).map(ticket => (
                    <button
                      key={ticket.id}
                      onClick={() => {
                        setSelectedTicket(ticket);
                        fetchTicketDetail(ticket.id);
                        setView('detail');
                      }}
                      className="w-full text-left p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="tf-meta">{ticket.ticket_number}</span>
                            <span className="tf-hint">-</span>
                            <span className="tf-meta">from {ticket.created_by?.name}</span>
                          </div>
                          <h4 className="tf-row-name">{ticket.title}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          {!ticket.assigned_to && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded border border-orange-200">
                              Unassigned
                            </span>
                          )}
                          {getStatusBadge(ticket.status)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 tf-meta">
                        <span>{getCategoryLabel(ticket.category)}</span>
                        <span>-</span>
                        {getPriorityBadge(ticket.priority)}
                        <span>-</span>
                        <span>{formatISTDate(ticket.updated_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Tickets List */}
        {view === 'tickets' && (
          <div>
            <button
              onClick={() => { setFilterAssignment('all'); setView('overview'); }}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="tf-card-soft">
              {/* Filters */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue/60" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by ticket, title, or user..."
                      className="tf-input pl-9 pr-4"
                    />
                  </div>

                  <FilterSelect
                    value={filterStatus}
                    onChange={(v) => setFilterStatus(v)}
                    options={STATUS_FILTER_OPTIONS}
                    className="px-4 sm:px-4 py-3 sm:py-3 rounded-lg sm:rounded-lg border-gray-300 text-gray-900 bg-white"
                  />

                  <FilterSelect
                    value={filterAssignment}
                    onChange={(v) => setFilterAssignment(v)}
                    options={ASSIGNMENT_FILTER_OPTIONS}
                    className="px-4 sm:px-4 py-3 sm:py-3 rounded-lg sm:rounded-lg border-gray-300 text-gray-900 bg-white"
                  />

                  <FilterSelect
                    value={filterPriority}
                    onChange={(v) => setFilterPriority(v)}
                    options={PRIORITY_FILTER_OPTIONS}
                    className="px-4 sm:px-4 py-3 sm:py-3 rounded-lg sm:rounded-lg border-gray-300 text-gray-900 bg-white"
                  />
                </div>
                {activeFilterChips.length > 0 && <FilterChips className="mt-3" chips={activeFilterChips} />}
              </div>

              {/* Tickets Table */}
              {loading ? (
                <div className="flex items-center justify-center py-12 tf-loader-center">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
                </div>
              ) : (
                <>
                <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
                  <table className="w-full">
                    <thead className="bg-white border-b border-gray-200">
                      <tr>
                        <th className="tf-th-cell text-left tf-th">Ticket #</th>
                        <th className="tf-th-cell text-left tf-th">Title</th>
                        <th className="tf-th-cell text-left tf-th">From</th>
                        <th className="tf-th-cell text-left tf-th">Category</th>
                        <th className="tf-th-cell text-left tf-th">Priority</th>
                        <th className="tf-th-cell text-left tf-th">Status</th>
                        <th className="tf-th-cell text-left tf-th">Assigned</th>
                        <th className="tf-th-cell text-left tf-th">Updated</th>
                        <th className="tf-th-cell text-left tf-th tf-sticky-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredTickets.map(ticket => {
                        const CategoryIcon = getCategoryIcon(ticket.category);
                        return (
                          <tr key={ticket.id} className="hover:bg-gray-50">
                            <td className="tf-td">
                              <span className="tf-row-name">{ticket.ticket_number}</span>
                            </td>
                            <td className="tf-td">
                              <div className="tf-body max-w-xs truncate">{ticket.title}</div>
                            </td>
                            <td className="tf-td">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center tf-caption">
                                  {ticket.created_by?.name?.charAt(0) || 'U'}
                                </div>
                                <span className="tf-body-secondary">{ticket.created_by?.name}</span>
                              </div>
                            </td>
                            <td className="tf-td">
                              <div className="flex items-center gap-2">
                                <CategoryIcon className="w-4 h-4 text-gray-600" />
                                <span className="tf-body-secondary">{getCategoryLabel(ticket.category)}</span>
                              </div>
                            </td>
                            <td className="tf-td">
                              {getPriorityBadge(ticket.priority)}
                            </td>
                            <td className="tf-td">
                              {getStatusBadge(ticket.status)}
                            </td>
                            <td className="tf-td">
                              {ticket.assigned_to ? (
                                <span className="tf-body-secondary">{ticket.assigned_to.name}</span>
                              ) : (
                                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">Unassigned</span>
                              )}
                            </td>
                            <td className="tf-td">
                              <span className="tf-body-secondary">{formatISTDate(ticket.updated_at)}</span>
                            </td>
                            <td className="tf-td tf-sticky-col">
                              <button
                                onClick={() => {
                                  setSelectedTicket(ticket);
                                  fetchTicketDetail(ticket.id);
                                  setView('detail');
                                }}
                                className="text-sm text-gray-700 hover:text-gray-900"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {filteredTickets.length === 0 && (
                    <div className="p-4"><NoTicketsFoundState /></div>
                  )}
                </div>
                <MobileRecordList
                  className="p-3"
                  empty={
                    <div className="p-4"><NoTicketsFoundState /></div>
                  }
                >
                  {filteredTickets.map(ticket => {
                    const CategoryIcon = getCategoryIcon(ticket.category);
                    return (
                      <MobileRecordCard
                        key={ticket.id}
                        /* 👁 View at the right end of the name line, as on the Support Tickets cards. */
                        className="tf-jdv-actions-inline"
                        idBadge={<span className="tf-meta">{ticket.ticket_number}</span>}
                        badges={
                          <>
                            {getPriorityBadge(ticket.priority)}
                            {getStatusBadge(ticket.status)}
                            {!ticket.assigned_to && (
                              <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">Unassigned</span>
                            )}
                          </>
                        }
                        title={ticket.title}
                        meta={[
                          {
                            icon: (
                              <span className="w-5 h-5 shrink-0 bg-gray-200 rounded-full flex items-center justify-center tf-caption">
                                {ticket.created_by?.name?.charAt(0) || 'U'}
                              </span>
                            ),
                            label: ticket.created_by?.name,
                          },
                          { icon: <CategoryIcon className="w-3.5 h-3.5 text-gray-600" />, label: getCategoryLabel(ticket.category) },
                        ]}
                        fields={[
                          { label: 'Assigned', value: ticket.assigned_to?.name },
                          { label: 'Updated', value: formatISTDate(ticket.updated_at) },
                        ]}
                        actions={
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicket(ticket);
                              fetchTicketDetail(ticket.id);
                              setView('detail');
                            }}
                            title="View"
                            aria-label={`View ticket ${ticket.ticket_number}`}
                            className="tf-icon-btn-outline"
                          >
                            <Eye />
                          </button>
                        }
                      />
                    );
                  })}
                </MobileRecordList>
                </>
              )}
            </div>
          </div>
        )}

        {/* Ticket Detail View */}
        {view === 'detail' && selectedTicket && (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setView('tickets')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tickets
            </button>

            <div className="tf-grid-3">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Ticket Header */}
                <div className="tf-card-soft p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="tf-meta block mb-2">{selectedTicket.ticket_number}</span>
                      <h2 className="tf-section-title mb-3">{selectedTicket.title}</h2>
                      <div className="flex flex-wrap items-center gap-3">
                        {getStatusBadge(selectedTicket.status)}
                        {getPriorityBadge(selectedTicket.priority)}
                        <span className="tf-meta">
                          {getCategoryLabel(selectedTicket.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 tf-body-secondary">
                      <User className="w-4 h-4" />
                      <span>Submitted by <strong>{selectedTicket.created_by?.name}</strong></span>
                      {selectedTicket.created_by?.email && (
                        <span className="text-gray-400">({selectedTicket.created_by.email})</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conversation */}
                <div className="tf-card-soft p-6">
                  <h3 className="font-semibold text-gray-900 mb-6">Conversation</h3>

                  <div className="space-y-6">
                    {selectedTicket.responses?.map((response) => (
                      <div
                        key={response.id}
                        className={`${
                          response.user_role === 'admin'
                            ? 'bg-gray-100 border-gray-300'
                            : 'bg-blue-50 border-blue-200'
                        } border rounded-lg p-5`}
                      >
                        <div className="flex items-start gap-4 mb-3">
                          {response.user_role === 'admin' ? (
                            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white flex-shrink-0 text-sm font-medium">
                              A
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white flex-shrink-0 text-sm font-medium">
                              {response.user_name?.charAt(0) || 'U'}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="tf-row-name">
                                {response.user_role === 'admin' ? `${response.user_name} (Admin)` : response.user_name}
                              </span>
                              <span className="tf-meta">{formatIST(response.created_at)}</span>
                            </div>
                            <p className="tf-body leading-relaxed whitespace-pre-wrap">{response.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box */}
                  {selectedTicket.status !== 'closed' && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <label className="block tf-label mb-2">Reply to User</label>
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your response..."
                        rows={4}
                        className="tf-textarea px-4 py-3 resize-none"
                      />
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={handleSendReply}
                          disabled={!replyMessage.trim()}
                          className="px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Send Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Ticket Info */}
                <div className="tf-card-soft p-6">
                  <h4 className="tf-row-title mb-4">Ticket Information</h4>

                  <div className="space-y-4">
                    <div>
                      <div className="tf-meta mb-1">Created</div>
                      <div className="tf-body">{formatIST(selectedTicket.created_at)}</div>
                    </div>

                    <div>
                      <div className="tf-meta mb-1">Last Updated</div>
                      <div className="tf-body">{formatIST(selectedTicket.updated_at)}</div>
                    </div>

                    <div>
                      <div className="tf-meta mb-1">Assigned To</div>
                      {selectedTicket.assigned_to ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-white text-xs">
                            {selectedTicket.assigned_to.name.charAt(0)}
                          </div>
                          <div className="tf-body">{selectedTicket.assigned_to.name}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-orange-600">Not assigned</span>
                      )}
                    </div>

                    <div>
                      <div className="tf-meta mb-1">Responses</div>
                      <div className="tf-body">{selectedTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Update Priority */}
                {selectedTicket.status !== 'closed' && (
                  <div className="tf-card-soft p-6">
                    <h4 className="tf-row-title mb-4">Update Priority</h4>
                    <FilterSelect
                      value={selectedTicket.priority}
                      onChange={(v) => handleUpdatePriority(selectedTicket.id, v as InternalTicketPriority)}
                      options={priorities.map(p => ({ value: p.value, label: p.label }))}
                      className="w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300 text-gray-900 bg-white"
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="tf-card-soft p-6">
                  <h4 className="tf-row-title mb-4">Actions</h4>

                  <div className="space-y-2">
                    {!selectedTicket.assigned_to && selectedTicket.status !== 'closed' && (
                      <button
                        onClick={() => handleAssignTicket(selectedTicket.id)}
                        disabled={actionLoading === selectedTicket.id}
                        className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm text-left flex items-center gap-2 disabled:bg-gray-400"
                      >
                        {actionLoading === selectedTicket.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                        Assign to Me
                      </button>
                    )}

                    {selectedTicket.status === 'open' || selectedTicket.status === 'in-progress' ? (
                      <button
                        onClick={() => handleResolveTicket(selectedTicket.id)}
                        disabled={actionLoading === selectedTicket.id}
                        className="w-full px-4 py-2.5 bg-success text-white rounded-lg hover:bg-success transition-colors text-sm text-left flex items-center gap-2 disabled:bg-success/60"
                      >
                        {actionLoading === selectedTicket.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        Mark as Resolved
                      </button>
                    ) : null}

                    {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && (
                      <button
                        onClick={() => handleReopenTicket(selectedTicket.id)}
                        disabled={actionLoading === selectedTicket.id}
                        className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm text-left flex items-center gap-2 disabled:bg-gray-50"
                      >
                        {actionLoading === selectedTicket.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Reopen Ticket
                      </button>
                    )}

                    {selectedTicket.status !== 'closed' && (
                      <button
                        onClick={() => handleCloseTicket(selectedTicket.id)}
                        disabled={actionLoading === selectedTicket.id}
                        className="w-full px-4 py-2.5 bg-destructive-subtle text-destructive rounded-lg hover:bg-destructive-subtle transition-colors text-sm text-left flex items-center gap-2 disabled:bg-destructive-subtle"
                      >
                        {actionLoading === selectedTicket.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Close Ticket
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      </div>
    </main>
  );
}
