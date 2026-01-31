'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Inbox, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle,
  Search, ArrowLeft, Filter, CheckCircle2, Circle, Clock3, XCircle,
  User, Calendar, Loader2, HelpCircle, KeyRound, Bug, MessageCircleQuestion, MoreHorizontal,
  UserCheck, Users, BarChart3, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { internalTicketService, InternalTicket, InternalTicketAdminStats, InternalTicketCategory, InternalTicketPriority, InternalTicketStatus } from '@/lib/services';

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

  const hasFetched = useRef(false);
  const hasHandledUrlTicket = useRef(false);

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
    try {
      setLoading(true);
      const response = await internalTicketService.adminListAllTickets({
        status: filterStatus !== 'all' ? filterStatus as any : undefined,
        priority: filterPriority !== 'all' ? filterPriority as any : undefined,
        search: searchQuery || undefined,
        assigned_to_me: filterAssignment === 'mine' ? true : undefined,
        unassigned: filterAssignment === 'unassigned' ? true : undefined,
      });
      setTickets(response.items);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await internalTicketService.adminGetStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
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
    const styles = {
      'open': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: Circle },
      'in-progress': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', icon: Clock3 },
      'resolved': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: CheckCircle2 },
      'closed': { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: XCircle }
    };

    const style = styles[status as keyof typeof styles] || styles['open'];
    const Icon = style.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${style.bg} ${style.text} ${style.border}`}>
        <Icon className="w-3.5 h-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </span>
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return 'Yesterday';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const openTickets = stats?.open_tickets ?? 0;
  const inProgressTickets = stats?.in_progress_tickets ?? 0;
  const resolvedTickets = stats?.resolved_tickets ?? 0;
  const unassignedTickets = stats?.unassigned_tickets ?? 0;
  const totalTickets = stats?.total_tickets ?? 0;

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl shadow-lg">
                <Inbox className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Team Support Tickets</h1>
                <p className="text-sm text-gray-600">Manage help requests from your team members</p>
              </div>
            </div>

            <button
              onClick={() => { fetchTickets(); fetchStats(); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {/* Overview */}
        {view === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Open</span>
                  <Circle className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{openTickets}</div>
                <div className="text-xs text-gray-500">Awaiting action</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">In Progress</span>
                  <Clock3 className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{inProgressTickets}</div>
                <div className="text-xs text-gray-500">Being handled</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Resolved</span>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{resolvedTickets}</div>
                <div className="text-xs text-gray-500">Successfully resolved</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Unassigned</span>
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{unassignedTickets}</div>
                <div className="text-xs text-gray-500">Need assignment</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Total</span>
                  <Ticket className="w-5 h-5 text-gray-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{totalTickets}</div>
                <div className="text-xs text-gray-500">All time</div>
              </div>
            </div>

            {/* Category Breakdown */}
            {stats?.tickets_by_category && Object.keys(stats.tickets_by_category).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Tickets by Category</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {Object.entries(stats.tickets_by_category).map(([cat, count]) => {
                    const CategoryIcon = getCategoryIcon(cat);
                    return (
                      <div key={cat} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <CategoryIcon className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="text-lg font-semibold text-gray-900">{count}</div>
                          <div className="text-xs text-gray-600">{getCategoryLabel(cat)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                onClick={() => { setFilterAssignment('unassigned'); setView('tickets'); }}
                className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl shadow-lg p-6 text-left hover:from-orange-600 hover:to-red-600 transition-all"
              >
                <Users className="w-8 h-8 mb-3" />
                <h3 className="text-lg font-semibold text-white mb-1">Unassigned Tickets</h3>
                <p className="text-sm text-orange-100">
                  {unassignedTickets} tickets need attention
                </p>
              </button>

              <button
                onClick={() => { setFilterAssignment('mine'); setView('tickets'); }}
                className="bg-gradient-to-r from-gray-700 to-gray-900 text-white rounded-xl shadow-lg p-6 text-left hover:from-gray-800 hover:to-black transition-all"
              >
                <UserCheck className="w-8 h-8 mb-3" />
                <h3 className="text-lg font-semibold text-white mb-1">My Assigned Tickets</h3>
                <p className="text-sm text-gray-300">
                  View tickets assigned to you
                </p>
              </button>

              <button
                onClick={() => { setFilterAssignment('all'); setView('tickets'); }}
                className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-6 text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <Ticket className="w-8 h-8 text-gray-700 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">All Team Tickets</h3>
                <p className="text-sm text-gray-600">
                  View all team support requests
                </p>
              </button>
            </div>

            {/* Recent Tickets */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-12">
                  <Inbox className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-600">No team tickets yet</p>
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
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-600">{ticket.ticket_number}</span>
                            <span className="text-xs text-gray-400">-</span>
                            <span className="text-xs text-gray-600">from {ticket.created_by?.name}</span>
                          </div>
                          <h4 className="text-sm font-medium text-gray-900">{ticket.title}</h4>
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
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <span>{getCategoryLabel(ticket.category)}</span>
                        <span>-</span>
                        {getPriorityBadge(ticket.priority)}
                        <span>-</span>
                        <span>{formatDate(ticket.updated_at)}</span>
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Filters */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by ticket, title, or user..."
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="in-progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>

                  <select
                    value={filterAssignment}
                    onChange={(e) => setFilterAssignment(e.target.value)}
                    className="px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    <option value="all">All Tickets</option>
                    <option value="mine">Assigned to Me</option>
                    <option value="unassigned">Unassigned</option>
                  </select>

                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    <option value="all">All Priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              {/* Tickets Table */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Ticket #</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Title</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">From</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Category</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Priority</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Status</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Assigned</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Updated</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredTickets.map(ticket => {
                        const CategoryIcon = getCategoryIcon(ticket.category);
                        return (
                          <tr key={ticket.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <span className="text-sm font-medium text-gray-900">{ticket.ticket_number}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 max-w-xs truncate">{ticket.title}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-700">
                                  {ticket.created_by?.name?.charAt(0) || 'U'}
                                </div>
                                <span className="text-sm text-gray-600">{ticket.created_by?.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <CategoryIcon className="w-4 h-4 text-gray-600" />
                                <span className="text-sm text-gray-600">{getCategoryLabel(ticket.category)}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {getPriorityBadge(ticket.priority)}
                            </td>
                            <td className="px-6 py-4">
                              {getStatusBadge(ticket.status)}
                            </td>
                            <td className="px-6 py-4">
                              {ticket.assigned_to ? (
                                <span className="text-sm text-gray-600">{ticket.assigned_to.name}</span>
                              ) : (
                                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">Unassigned</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-gray-600">{formatDate(ticket.updated_at)}</span>
                            </td>
                            <td className="px-6 py-4">
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
                    <div className="text-center py-12">
                      <Inbox className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <p className="text-sm text-gray-600">No tickets found</p>
                    </div>
                  )}
                </div>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Ticket Header */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="text-xs text-gray-600 block mb-2">{selectedTicket.ticket_number}</span>
                      <h2 className="text-lg font-semibold text-gray-900 mb-3">{selectedTicket.title}</h2>
                      <div className="flex flex-wrap items-center gap-3">
                        {getStatusBadge(selectedTicket.status)}
                        {getPriorityBadge(selectedTicket.priority)}
                        <span className="text-xs text-gray-600">
                          {getCategoryLabel(selectedTicket.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <User className="w-4 h-4" />
                      <span>Submitted by <strong>{selectedTicket.created_by?.name}</strong></span>
                      {selectedTicket.created_by?.email && (
                        <span className="text-gray-400">({selectedTicket.created_by.email})</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conversation */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
                              <span className="text-sm font-medium text-gray-900">
                                {response.user_role === 'admin' ? `${response.user_name} (Admin)` : response.user_name}
                              </span>
                              <span className="text-xs text-gray-500">{formatDate(response.created_at)}</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{response.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box */}
                  {selectedTicket.status !== 'closed' && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Reply to User</label>
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your response..."
                        rows={4}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none"
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
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">Ticket Information</h4>

                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Created</div>
                      <div className="text-sm text-gray-900">{formatFullDate(selectedTicket.created_at)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Last Updated</div>
                      <div className="text-sm text-gray-900">{formatFullDate(selectedTicket.updated_at)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Assigned To</div>
                      {selectedTicket.assigned_to ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-white text-xs">
                            {selectedTicket.assigned_to.name.charAt(0)}
                          </div>
                          <div className="text-sm text-gray-900">{selectedTicket.assigned_to.name}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-orange-600">Not assigned</span>
                      )}
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Responses</div>
                      <div className="text-sm text-gray-900">{selectedTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Update Priority */}
                {selectedTicket.status !== 'closed' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-4">Update Priority</h4>
                    <select
                      value={selectedTicket.priority}
                      onChange={(e) => handleUpdatePriority(selectedTicket.id, e.target.value as InternalTicketPriority)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      {priorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">Actions</h4>

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
                        className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm text-left flex items-center gap-2 disabled:bg-green-400"
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
                        className="w-full px-4 py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm text-left flex items-center gap-2 disabled:bg-red-50"
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
  );
}
