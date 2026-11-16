'use client';

import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Headphones, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle,
  FileText, Search, ArrowLeft, Filter, CheckCircle2, Circle, Clock3, XCircle,
  User, Calendar, Loader2, HelpCircle, KeyRound, Bug, MessageCircleQuestion, MoreHorizontal, Shield, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { internalTicketService, InternalTicket, InternalTicketStats, InternalTicketCategory, InternalTicketPriority } from '@/lib/services';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { forwardTeamLabel } from '@/lib/services/internalTicketService';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { AttachmentPicker, AttachmentList } from '@/components/support/TicketAttachments';
import { saveBlob } from '@/lib/supportAttachments';
import { StatValuePlaceholder } from '@/components/ui/stats-card';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { useAuth } from '@/lib/hooks/useAuth';
import UnitDisputesView from '@/components/subscription/unit-disputes/UnitDisputesView';

type ViewType = 'overview' | 'submit' | 'tickets' | 'detail';

const categories = [
  { value: 'account-access', label: 'Account Access Issues', icon: KeyRound },
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

const PRIORITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All Priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function InternalHelpDesk() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticketIdFromUrl = searchParams.get('ticket');

  const [view, setView] = useState<ViewType>('overview');
  // 'unit-disputes' = the shared Unit Disputes screen (also under Subscription).
  // Same rule as there: View Usage (the API re-checks); without it the tab is
  // visible, greyed, with a tooltip.
  const [tab, setTab] = useState<'requests' | 'unit-disputes'>('requests');
  const { user: authUser, hasPermission } = useAuth();
  const canViewUnitDisputes = hasPermission('canViewUsage');
  const [selectedTicket, setSelectedTicket] = useState<InternalTicket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [replyMessage, setReplyMessage] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replySending, setReplySending] = useState(false);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<InternalTicketCategory>('general-inquiry');
  const [priority, setPriority] = useState<InternalTicketPriority>('medium');

  // Data states
  const [tickets, setTickets] = useState<InternalTicket[]>([]);
  const [stats, setStats] = useState<InternalTicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // The stats call failed — the cards show '—' instead of a number.
  const [statsFailed, setStatsFailed] = useState(false);
  const hasFetched = useRef(false);
  /* Bumped by every fetchTickets run, so only the latest request's rows apply.
     The mount fetch runs with default filters before the saved ones are
     restored, then again with them; whichever landed last used to win. */
  const fetchSeqRef = useRef(0);
  const hasHandledUrlTicket = useRef(false);

  // Persist scroll + list view state so returning to the Help Desk restores it.
  // 'detail'/'submit' are excluded from restore since they depend on a selected
  // ticket / in-progress form that don't survive the remount.
  const rootRef = useScrollRestoration<HTMLElement>('help-desk', !loading);
  useListStatePersistence(
    'help-desk',
    { tab, view, searchQuery, filterStatus, filterPriority },
    (s) => {
      if (s.tab === 'requests' || s.tab === 'unit-disputes') setTab(s.tab);
      if (s.view === 'overview' || s.view === 'tickets') setView(s.view);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterStatus === 'string') setFilterStatus(s.filterStatus);
      if (typeof s.filterPriority === 'string') setFilterPriority(s.filterPriority);
    },
  );

  // Deep link: /support-tickets?tab=unit-disputes (wins over the restored tab).
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'unit-disputes' || t === 'requests') setTab(t);
  }, [searchParams]);

  // A restored / linked Unit Disputes tab the user can't see → back to My Requests.
  useEffect(() => {
    if (tab === 'unit-disputes' && authUser && !canViewUnitDisputes) setTab('requests');
  }, [tab, authUser, canViewUnitDisputes]);

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
          router.replace('/help-desk', { scroll: false });
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
      const response = await internalTicketService.listTickets({
        status: filterStatus !== 'all' ? filterStatus as any : undefined,
        priority: filterPriority !== 'all' ? filterPriority as any : undefined,
        search: searchQuery || undefined,
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
      const data = await internalTicketService.getStats();
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
  }, [filterStatus, filterPriority]);

  const handleSubmitTicket = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);
      const newTicket = await internalTicketService.createTicket({
        title,
        description,
        category,
        priority,
      });

      // Files go up right after the ticket exists (same endpoint replies use).
      let created = newTicket;
      if (newFiles.length) {
        try {
          created = await internalTicketService.uploadAttachments(newTicket.id, newFiles);
        } catch (uploadError) {
          toast.warning(`Ticket #${newTicket.ticket_number} created, but the attachments were not uploaded: ${friendlyErrorMessage(uploadError, 'upload failed')}. You can attach them from the ticket.`);
        }
      }
      setTickets([created, ...tickets]);
      toast.success(`Ticket #${newTicket.ticket_number} created. Your administrator will respond soon.`);
      setNewFiles([]);

      // Reset form
      setTitle('');
      setDescription('');
      setCategory('general-inquiry');
      setPriority('medium');
      setView('tickets');
      fetchStats();
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't create ticket. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if ((!replyMessage.trim() && replyFiles.length === 0) || !selectedTicket || replySending) return;

    setReplySending(true);
    try {
      let updatedTicket = selectedTicket;
      if (replyFiles.length) {
        updatedTicket = await internalTicketService.uploadAttachments(selectedTicket.id, replyFiles);
        setReplyFiles([]);
      }
      const text = replyMessage.trim()
        || `Attached ${replyFiles.length} file${replyFiles.length > 1 ? 's' : ''}: ${replyFiles.map(f => f.name).join(', ')}`;
      updatedTicket = await internalTicketService.addResponse(selectedTicket.id, { message: text });

      setSelectedTicket(updatedTicket);
      setTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
      setReplyMessage('');
      toast.success('Reply sent successfully');
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error(friendlyErrorMessage(error, 'Failed to send reply'));
    } finally {
      setReplySending(false);
    }
  };

  const handleDownload = async (file: { id: string; file_name: string }) => {
    if (!selectedTicket) return;
    try {
      saveBlob(await internalTicketService.downloadAttachment(selectedTicket.id, file.id), file.file_name);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, 'Could not download the file'));
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
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const activeFilterChips: FilterChip[] = [
    filterStatus !== 'all' && {
      key: 'status',
      label: 'Status',
      value: STATUS_FILTER_OPTIONS.find(o => o.value === filterStatus)?.label ?? filterStatus,
      onRemove: () => setFilterStatus('all'),
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
  const totalTickets = statCount(stats?.total_tickets);

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
      <PageBreadcrumb className="mb-4 md:mb-6" items={
        tab === 'unit-disputes'
          ? [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Desk', onClick: () => setTab('requests') }, { label: 'Unit Disputes' }]
          : [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Desk' }]
      } />
      {/* Header */}
      {/* No inner padding: the page panel already insets content 16/32px
          (px-8/p-8 here doubled it to 48px). */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="pb-4 sm:pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                <Headphones className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="tf-page-title">Help Desk</h1>
                <p className="tf-body-secondary">{tab === 'requests' ? 'Request help from your administrator' : 'Ask for units back when a session failed because of a platform problem.'}</p>
              </div>
            </div>

            {tab === 'requests' && view !== 'overview' && view !== 'submit' && (
              <button
                onClick={() => setView('submit')}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
                New Request
              </button>
            )}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Help Desk views" className="mt-4 flex gap-1 border-b border-gray-200 dark:border-slate-700">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'requests'}
          onClick={() => setTab('requests')}
          className={`tf-tab-line -mb-px ${tab === 'requests' ? 'tf-tab-line-active' : ''}`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <User className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">My Requests</span>
            <span className="sm:hidden">Requests</span>
          </div>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'unit-disputes'}
          aria-disabled={!canViewUnitDisputes}
          title={canViewUnitDisputes ? undefined : 'You do not have permission to view unit disputes'}
          onClick={() => { if (canViewUnitDisputes) setTab('unit-disputes'); }}
          className={`tf-tab-line -mb-px ${
            tab === 'unit-disputes'
              ? 'tf-tab-line-active'
              : canViewUnitDisputes ? '' : 'cursor-not-allowed text-gray-400 opacity-60'
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Shield className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Unit Disputes</span>
            <span className="sm:hidden">Disputes</span>
            {!canViewUnitDisputes && <Lock className="h-3.5 w-3.5 flex-shrink-0" />}
          </div>
        </button>
      </div>

      {/* Unit Disputes — the shared screen, without its own page shell. */}
      {tab === 'unit-disputes' && canViewUnitDisputes && (
        <div className="pt-4 sm:pt-6"><UnitDisputesView embedded /></div>
      )}

      {/* Content */}
      {tab === 'requests' && (
      <div className="pt-4 sm:pt-6">
        {/* Overview */}
        {view === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="tf-grid-4">
              <div className="tf-card-soft p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="tf-body-secondary">Open Requests</span>
                  <Circle className="w-5 h-5 text-gray-800" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{openTickets}</div>
                <div className="tf-meta">Awaiting response</div>
              </div>

              <div className="tf-card-soft p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="tf-body-secondary">In Progress</span>
                  <Clock3 className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{inProgressTickets}</div>
                <div className="tf-meta">Being reviewed</div>
              </div>

              <div className="tf-card-soft p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="tf-body-secondary">Resolved</span>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{resolvedTickets}</div>
                <div className="tf-meta">Successfully handled</div>
              </div>

              <div className="tf-card-soft p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="tf-body-secondary">Total Requests</span>
                  <Ticket className="w-5 h-5 text-gray-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{totalTickets}</div>
                <div className="tf-meta">All time</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="tf-grid-2">
              <button
                onClick={() => setView('submit')}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg p-8 text-left hover:from-indigo-600 hover:to-purple-700 transition-all"
              >
                <Send className="w-8 h-8 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Submit New Request</h3>
                <p className="text-sm text-indigo-100">
                  Need help with something? Submit a request to your administrator
                </p>
              </button>

              <button
                onClick={() => setView('tickets')}
                className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-8 text-left hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <Ticket className="w-8 h-8 text-indigo-600 mb-4" />
                <h3 className="tf-section-title mb-2">View My Requests</h3>
                <p className="tf-body-secondary">
                  Track the status of your help requests
                </p>
              </button>
            </div>

            {/* Recent Tickets */}
            <div className="tf-card-soft p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-gray-900">Recent Requests</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  View All
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 tf-loader-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-12">
                  <Ticket className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="tf-body-secondary">No requests yet</p>
                  <button
                    onClick={() => setView('submit')}
                    className="mt-4 text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    Submit your first request
                  </button>
                </div>
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
                          <span className="tf-meta block mb-1">{ticket.ticket_number}</span>
                          <h4 className="tf-row-name">{ticket.title}</h4>
                        </div>
                        {getStatusBadge(ticket.status)}
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

            {/* Help Info */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-3">What can I request help with?</h3>
              <div className="tf-grid-3">
                {categories.slice(0, 3).map(cat => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.value} className="flex items-start gap-3">
                      <Icon className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="tf-row-name">{cat.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Submit Ticket Form */}
        {view === 'submit' && (
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="tf-card-soft p-8">
              <h2 className="tf-section-title mb-6">Submit Help Request</h2>

              <div className="space-y-6">
                <div>
                  <label className="block tf-label mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of your request"
                    className="tf-input h-auto px-4 py-3"
                  />
                </div>

                <div className="tf-grid-2">
                  <div>
                    <label className="block tf-label mb-2">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <FilterSelect
                      value={category}
                      onChange={(v) => setCategory(v as InternalTicketCategory)}
                      options={categories.map(cat => ({ value: cat.value, label: cat.label }))}
                      className="w-full sm:w-full px-4 sm:px-4 py-3 sm:py-3 rounded-lg sm:rounded-lg border-gray-300 text-gray-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block tf-label mb-2">
                      Priority <span className="text-red-500">*</span>
                    </label>
                    <FilterSelect
                      value={priority}
                      onChange={(v) => setPriority(v as InternalTicketPriority)}
                      options={priorities.map(p => ({ value: p.value, label: p.label }))}
                      className="w-full sm:w-full px-4 sm:px-4 py-3 sm:py-3 rounded-lg sm:rounded-lg border-gray-300 text-gray-900 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block tf-label mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide detailed information about your request..."
                    rows={8}
                    className="tf-textarea px-4 py-3 resize-none"
                  />
                </div>

                <div>
                  <label className="block tf-label mb-2">
                    Attachments <span className="font-normal text-gray-500">(Optional)</span>
                  </label>
                  <AttachmentPicker files={newFiles} onChange={setNewFiles} disabled={submitting} />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => { setNewFiles([]); setView('overview'); }}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitTicket}
                    disabled={submitting}
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:bg-indigo-400"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All Tickets List */}
        {view === 'tickets' && (
          <div>
            <button
              onClick={() => setView('overview')}
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search requests..."
                      className="tf-input h-auto pl-11 pr-4 py-3"
                    />
                  </div>

                  <FilterSelect
                    value={filterStatus}
                    onChange={(v) => setFilterStatus(v)}
                    options={STATUS_FILTER_OPTIONS}
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
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : (
                <>
                <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
                  <table className="w-full">
                    <thead className="bg-white border-b border-gray-200">
                      <tr>
                        <th className="tf-th-cell text-left tf-th">Request #</th>
                        <th className="tf-th-cell text-left tf-th">Title</th>
                        <th className="tf-th-cell text-left tf-th">Category</th>
                        <th className="tf-th-cell text-left tf-th">Priority</th>
                        <th className="tf-th-cell text-left tf-th">Status</th>
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
                              <div className="tf-body max-w-md truncate">{ticket.title}</div>
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
                              <span className="tf-body-secondary">{formatISTDate(ticket.updated_at)}</span>
                            </td>
                            <td className="tf-td tf-sticky-col">
                              <button
                                onClick={() => {
                                  setSelectedTicket(ticket);
                                  fetchTicketDetail(ticket.id);
                                  setView('detail');
                                }}
                                className="text-sm text-indigo-600 hover:text-indigo-700"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {filteredTickets.length === 0 && (
                    <div className="text-center py-12">
                      <Ticket className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <p className="tf-body-secondary">No requests found</p>
                    </div>
                  )}
                </div>
                <MobileRecordList
                  className="p-3"
                  empty={
                    <div className="text-center py-12">
                      <Ticket className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <p className="tf-body-secondary">No requests found</p>
                    </div>
                  }
                >
                  {filteredTickets.map(ticket => {
                    const CategoryIcon = getCategoryIcon(ticket.category);
                    return (
                      <MobileRecordCard
                        key={ticket.id}
                        idBadge={<span className="tf-meta">{ticket.ticket_number}</span>}
                        badges={
                          <>
                            {getPriorityBadge(ticket.priority)}
                            {getStatusBadge(ticket.status)}
                          </>
                        }
                        title={ticket.title}
                        meta={[
                          { icon: <CategoryIcon className="w-3.5 h-3.5 text-gray-600" />, label: getCategoryLabel(ticket.category) },
                        ]}
                        fields={[
                          { label: 'Updated', value: formatISTDate(ticket.updated_at) },
                        ]}
                        footer={
                          <button
                            onClick={() => {
                              setSelectedTicket(ticket);
                              fetchTicketDetail(ticket.id);
                              setView('detail');
                            }}
                            className="text-sm text-indigo-600 hover:text-indigo-700"
                          >
                            View Details
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
              Back to My Requests
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
                  {selectedTicket.forwarding && (
                    <div className="mt-4 rounded-lg border border-brand-blue/20 bg-brand-blue/[0.05] p-3 tf-body">
                      Your admin forwarded this request to <strong>{forwardTeamLabel(selectedTicket.forwarding.team)}</strong> (platform support)
                      {selectedTicket.forwarding.support_ticket_number && <> as <strong>{selectedTicket.forwarding.support_ticket_number}</strong></>}.
                      Their updates will appear in the conversation below.
                    </div>
                  )}
                </div>

                {/* Conversation */}
                <div className="tf-card-soft p-6">
                  <h3 className="font-semibold text-gray-900 mb-6">Conversation</h3>

                  <div className="space-y-6">
                    {selectedTicket.responses?.map((response) => (
                      <div
                        key={response.id}
                        className={`${
                          response.user_role === 'user'
                            ? 'bg-gray-50 border-gray-200'
                            : 'bg-indigo-50 border-indigo-200'
                        } border rounded-lg p-5`}
                      >
                        <div className="flex items-start gap-4 mb-3">
                          {response.user_role === 'user' ? (
                            <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-white flex-shrink-0 text-sm font-medium">
                              {response.user_name?.charAt(0) || 'U'}
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white flex-shrink-0 text-sm font-medium">
                              A
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="tf-row-name">
                                {response.user_role === 'user' ? (response.user_name || 'You') : 'Administrator'}
                              </span>
                              <span className="tf-meta">{formatIST(response.created_at)}</span>
                            </div>
                            <p className="tf-body leading-relaxed whitespace-pre-wrap">{response.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Attachments (incl. files platform support added after forwarding) */}
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="tf-label mb-3">Attachments ({selectedTicket.attachments?.length || 0})</h4>
                    <AttachmentList files={selectedTicket.attachments || []} onDownload={handleDownload} />
                  </div>

                  {/* Reply Box */}
                  {selectedTicket.status !== 'closed' && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <label className="block tf-label mb-2">Add Reply</label>
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your message..."
                        rows={4}
                        className="tf-textarea px-4 py-3 resize-none"
                      />
                      <div className="mt-3">
                        <AttachmentPicker
                          compact
                          files={replyFiles}
                          onChange={setReplyFiles}
                          onTicket={selectedTicket.attachments?.length || 0}
                          disabled={replySending}
                        />
                      </div>
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={handleSendReply}
                          disabled={(!replyMessage.trim() && replyFiles.length === 0) || replySending}
                          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
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
                  <h4 className="tf-row-title mb-4">Request Information</h4>

                  <div className="space-y-4">
                    <div>
                      <div className="tf-meta mb-1">Created</div>
                      <div className="tf-body">{formatIST(selectedTicket.created_at)}</div>
                    </div>

                    <div>
                      <div className="tf-meta mb-1">Last Updated</div>
                      <div className="tf-body">{formatIST(selectedTicket.updated_at)}</div>
                    </div>

                    {selectedTicket.assigned_to && (
                      <div>
                        <div className="tf-meta mb-1">Assigned To</div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs">
                            {selectedTicket.assigned_to.name.charAt(0)}
                          </div>
                          <div className="tf-body">{selectedTicket.assigned_to.name}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="tf-meta mb-1">Responses</div>
                      <div className="tf-body">{selectedTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Status Info */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6">
                  <h4 className="tf-row-title mb-3">Status Information</h4>
                  <p className="tf-body-secondary">
                    {selectedTicket.status === 'open' && 'Your request is awaiting review by an administrator.'}
                    {selectedTicket.status === 'in-progress' && 'An administrator is currently working on your request.'}
                    {selectedTicket.status === 'resolved' && 'Your request has been resolved. If you need further assistance, please reply.'}
                    {selectedTicket.status === 'closed' && 'This request has been closed. Submit a new request if you need additional help.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
      </div>
      </div>
    </main>
  );
}
