'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Headphones, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle,
  FileText, Search, ArrowLeft, Filter, CheckCircle2, Circle, Clock3, XCircle,
  User, Calendar, Loader2, HelpCircle, KeyRound, Bug, MessageCircleQuestion, MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { internalTicketService, InternalTicket, InternalTicketStats, InternalTicketCategory, InternalTicketPriority } from '@/lib/services';

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

export default function InternalHelpDesk() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticketIdFromUrl = searchParams.get('ticket');

  const [view, setView] = useState<ViewType>('overview');
  const [selectedTicket, setSelectedTicket] = useState<InternalTicket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [replyMessage, setReplyMessage] = useState('');

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
    try {
      setLoading(true);
      const response = await internalTicketService.listTickets({
        status: filterStatus !== 'all' ? filterStatus as any : undefined,
        priority: filterPriority !== 'all' ? filterPriority as any : undefined,
        search: searchQuery || undefined,
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
      const data = await internalTicketService.getStats();
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

      setTickets([newTicket, ...tickets]);
      toast.success(`Ticket #${newTicket.ticket_number} created. Your administrator will respond soon.`);

      // Reset form
      setTitle('');
      setDescription('');
      setCategory('general-inquiry');
      setPriority('medium');
      setView('tickets');
      fetchStats();
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      toast.error(error?.response?.data?.detail || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
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

  const getStatusBadge = (status: string) => {
    const styles = {
      'open': { bg: 'bg-gray-100', text: 'text-gray-900', border: 'border-gray-300', icon: Circle },
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
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase());
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
  const totalTickets = stats?.total_tickets ?? 0;

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                <Headphones className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Help Desk</h1>
                <p className="text-sm text-gray-600">Request help from your administrator</p>
              </div>
            </div>

            {view !== 'overview' && view !== 'submit' && (
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

      {/* Content */}
      <div className="p-8">
        {/* Overview */}
        {view === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Open Requests</span>
                  <Circle className="w-5 h-5 text-gray-800" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{openTickets}</div>
                <div className="text-xs text-gray-500">Awaiting response</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">In Progress</span>
                  <Clock3 className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{inProgressTickets}</div>
                <div className="text-xs text-gray-500">Being reviewed</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Resolved</span>
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{resolvedTickets}</div>
                <div className="text-xs text-gray-500">Successfully handled</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Total Requests</span>
                  <Ticket className="w-5 h-5 text-gray-600" />
                </div>
                <div className="text-3xl font-semibold text-gray-900 mb-1">{totalTickets}</div>
                <div className="text-xs text-gray-500">All time</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <h3 className="text-lg font-semibold text-gray-900 mb-2">View My Requests</h3>
                <p className="text-sm text-gray-600">
                  Track the status of your help requests
                </p>
              </button>
            </div>

            {/* Recent Tickets */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-12">
                  <Ticket className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-600">No requests yet</p>
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
                          <span className="text-xs text-gray-600 block mb-1">{ticket.ticket_number}</span>
                          <h4 className="text-sm font-medium text-gray-900">{ticket.title}</h4>
                        </div>
                        {getStatusBadge(ticket.status)}
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

            {/* Help Info */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-3">What can I request help with?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {categories.slice(0, 3).map(cat => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.value} className="flex items-start gap-3">
                      <Icon className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{cat.label}</div>
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Submit Help Request</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of your request"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as InternalTicketCategory)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as InternalTicketPriority)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {priorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide detailed information about your request..."
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => setView('overview')}
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
                      placeholder="Search requests..."
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="in-progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>

                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Request #</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Title</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Category</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Priority</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-600">Status</th>
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
                              <div className="text-sm text-gray-900 max-w-md truncate">{ticket.title}</div>
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
                              <span className="text-sm text-gray-600">{formatDate(ticket.updated_at)}</span>
                            </td>
                            <td className="px-6 py-4">
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
                      <p className="text-sm text-gray-600">No requests found</p>
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
              Back to My Requests
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
                </div>

                {/* Conversation */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
                              <span className="text-sm font-medium text-gray-900">
                                {response.user_role === 'user' ? (response.user_name || 'You') : 'Administrator'}
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">Add Reply</label>
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your message..."
                        rows={4}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                      <div className="flex justify-end mt-3">
                        <button
                          onClick={handleSendReply}
                          disabled={!replyMessage.trim()}
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
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-4">Request Information</h4>

                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Created</div>
                      <div className="text-sm text-gray-900">{formatFullDate(selectedTicket.created_at)}</div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Last Updated</div>
                      <div className="text-sm text-gray-900">{formatFullDate(selectedTicket.updated_at)}</div>
                    </div>

                    {selectedTicket.assigned_to && (
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Assigned To</div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs">
                            {selectedTicket.assigned_to.name.charAt(0)}
                          </div>
                          <div className="text-sm text-gray-900">{selectedTicket.assigned_to.name}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Responses</div>
                      <div className="text-sm text-gray-900">{selectedTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Status Info */}
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Status Information</h4>
                  <p className="text-sm text-gray-600">
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
    </div>
  );
}
