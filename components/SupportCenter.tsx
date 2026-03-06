'use client';

import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { useState, useEffect, useRef } from 'react';
import {
  HelpCircle, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle,
  FileText, Upload, Trash2, Search, X, ArrowLeft, Filter, Download, ExternalLink,
  CheckCircle2, Circle, Clock3, XCircle, ChevronDown, Mail, Phone, Globe, Book,
  Video, FileQuestion, Tag, User, Calendar, Paperclip, Loader2, Inbox,
  Users, UserCheck, RefreshCw, KeyRound, Bug, MessageCircleQuestion, MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { internalTicketService, InternalTicket, InternalTicketAdminStats, InternalTicketPriority } from '@/lib/services';

// Main API - Local backend handles everything including support tickets
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface SupportTicket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: 'resume-upload' | 'job-posting' | 'candidate-management' | 'assessment' | 'billing' | 'technical' | 'feature-request' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
  assignedAgent?: string;
  attachments?: { id: string; name: string; size: string; url: string }[];
  responses?: {
    id: string;
    from: 'user' | 'support';
    message: string;
    timestamp: string;
    agentName?: string;
  }[];
}

interface TicketStats {
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  total_tickets: number;
}

// Internal ticket categories for team support
const internalCategories = [
  { value: 'account-access', label: 'Account Access', icon: KeyRound },
  { value: 'permission-request', label: 'Permission Request', icon: User },
  { value: 'feature-question', label: 'Feature Question', icon: MessageCircleQuestion },
  { value: 'bug-report', label: 'Bug Report', icon: Bug },
  { value: 'general-inquiry', label: 'General Inquiry', icon: HelpCircle },
  { value: 'other', label: 'Other', icon: MoreHorizontal }
];

const internalPriorities = [
  { value: 'low', label: 'Low', color: 'text-gray-600 bg-gray-100 border-gray-300' },
  { value: 'medium', label: 'Medium', color: 'text-gray-800 bg-gray-100 border-gray-300' },
  { value: 'high', label: 'High', color: 'text-orange-600 bg-orange-100 border-orange-300' },
];

// Transform API response to frontend format
function transformTicket(apiTicket: any): SupportTicket {
  return {
    id: apiTicket.id,
    ticketNumber: apiTicket.ticket_number,
    title: apiTicket.title,
    description: apiTicket.description,
    category: apiTicket.category,
    priority: apiTicket.priority,
    status: apiTicket.status,
    createdAt: apiTicket.created_at,
    updatedAt: apiTicket.updated_at,
    assignedAgent: apiTicket.assigned_agent,
    attachments: apiTicket.attachments?.map((a: any) => ({
      id: a.id,
      name: a.file_name,
      size: a.file_size,
      url: a.file_url,
    })),
    responses: apiTicket.responses?.map((r: any) => ({
      id: r.id,
      from: r.from_type as 'user' | 'support',
      message: r.message,
      timestamp: r.timestamp,
      agentName: r.agent_name,
    })),
  };
}

interface SupportCenterProps {
  isAdmin?: boolean;
}

export default function SupportCenter({ isAdmin = false }: SupportCenterProps) {
  // Active tab: 'external' for TalentFlow support, 'team' for internal team tickets
  const [activeTab, setActiveTab] = useState<'external' | 'team'>('external');
  const [view, setView] = useState<'overview' | 'submit' | 'tickets' | 'detail' | 'knowledge-base'>('overview');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [replyMessage, setReplyMessage] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupportTicket['category']>('technical');
  const [priority, setPriority] = useState<SupportTicket['priority']>('medium');
  const [attachments, setAttachments] = useState<File[]>([]);

  // Data states
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Team/Internal ticket states (for admin)
  const [internalTickets, setInternalTickets] = useState<InternalTicket[]>([]);
  const [internalStats, setInternalStats] = useState<InternalTicketAdminStats | null>(null);
  const [selectedInternalTicket, setSelectedInternalTicket] = useState<InternalTicket | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalActionLoading, setInternalActionLoading] = useState<string | null>(null);
  const [internalFilterAssignment, setInternalFilterAssignment] = useState<string>('all');

  // Prevent duplicate API calls
  const hasFetched = useRef(false);
  const hasInternalFetched = useRef(false);

  const categories = [
    { value: 'resume-upload', label: 'Resume Upload Issues', icon: Upload },
    { value: 'job-posting', label: 'Job Posting', icon: Briefcase },
    { value: 'candidate-management', label: 'Candidate Management', icon: User },
    { value: 'assessment', label: 'Assessment & Scoring', icon: CheckCircle },
    { value: 'billing', label: 'Billing & Subscription', icon: FileText },
    { value: 'technical', label: 'Technical Issue', icon: AlertCircle },
    { value: 'feature-request', label: 'Feature Request', icon: Lightbulb },
    { value: 'other', label: 'Other', icon: HelpCircle }
  ];

  const priorities = [
    { value: 'low', label: 'Low', color: 'text-gray-600 bg-gray-100 border-gray-300' },
    { value: 'medium', label: 'Medium', color: 'text-gray-800 bg-gray-100 border-gray-300' },
    { value: 'high', label: 'High', color: 'text-orange-600 bg-orange-100 border-orange-300' },
    { value: 'urgent', label: 'Urgent', color: 'text-red-600 bg-red-100 border-red-300' }
  ];

  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('accessToken');
    }
    return null;
  };

  const getAuthHeaders = () => {
    const token = getAuthToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  // Build support tickets API URL - uses local backend
  const getSupportApiUrl = (endpoint: string = '') => {
    // URL format: http://localhost:8000/api/v1/support-tickets{endpoint}
    return `${API_BASE_URL}/support-tickets${endpoint}`;
  };

  // Fetch tickets and stats on mount
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    // Check if user is authenticated
    const token = getAuthToken();
    if (!token) {
      console.warn('No auth token found, user may need to login');
      setLoading(false);
      return;
    }

    fetchTickets();
    fetchStats();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterPriority !== 'all') params.append('priority', filterPriority);
      if (searchQuery) params.append('search', searchQuery);

      const url = `${getSupportApiUrl()}?${params.toString()}`;
      console.log('[SupportCenter] Fetching tickets from:', url);

      const response = await fetch(url, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.items.map(transformTicket));
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch tickets:', response.status, errorData);
        // Keep empty array on error
        setTickets([]);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(getSupportApiUrl('/stats'), {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchTicketDetail = async (ticketId: string) => {
    try {
      const response = await fetch(getSupportApiUrl(`/${ticketId}`), {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedTicket(transformTicket(data));
      }
    } catch (error) {
      console.error('Error fetching ticket detail:', error);
    }
  };

  // Re-fetch when filters change
  useEffect(() => {
    if (!hasFetched.current) return;
    fetchTickets();
  }, [filterStatus, filterPriority]);

  // Fetch internal tickets when admin switches to team tab
  useEffect(() => {
    if (activeTab === 'team' && isAdmin && !hasInternalFetched.current) {
      hasInternalFetched.current = true;
      fetchInternalTickets();
      fetchInternalStats();
    }
  }, [activeTab, isAdmin]);

  // Re-fetch internal tickets when filters change
  useEffect(() => {
    if (!hasInternalFetched.current) return;
    fetchInternalTickets();
  }, [filterStatus, filterPriority, internalFilterAssignment]);

  const fetchInternalTickets = async () => {
    try {
      setInternalLoading(true);
      const response = await internalTicketService.adminListAllTickets({
        status: filterStatus !== 'all' ? filterStatus as any : undefined,
        priority: filterPriority !== 'all' ? filterPriority as any : undefined,
        search: searchQuery || undefined,
        assigned_to_me: internalFilterAssignment === 'mine' ? true : undefined,
        unassigned: internalFilterAssignment === 'unassigned' ? true : undefined,
      });
      setInternalTickets(response.items);
    } catch (error) {
      console.error('Error fetching internal tickets:', error);
      setInternalTickets([]);
    } finally {
      setInternalLoading(false);
    }
  };

  const fetchInternalStats = async () => {
    try {
      const data = await internalTicketService.adminGetStats();
      setInternalStats(data);
    } catch (error) {
      console.error('Error fetching internal stats:', error);
    }
  };

  const fetchInternalTicketDetail = async (ticketId: string) => {
    try {
      const ticket = await internalTicketService.getTicket(ticketId);
      setSelectedInternalTicket(ticket);
    } catch (error) {
      console.error('Error fetching internal ticket detail:', error);
    }
  };

  const handleAssignInternalTicket = async (ticketId: string) => {
    try {
      setInternalActionLoading(ticketId);
      const updatedTicket = await internalTicketService.assignTicket(ticketId);
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Ticket assigned to you');
      fetchInternalStats();
    } catch (error) {
      console.error('Error assigning ticket:', error);
      toast.error('Failed to assign ticket');
    } finally {
      setInternalActionLoading(null);
    }
  };

  const handleResolveInternalTicket = async (ticketId: string) => {
    try {
      setInternalActionLoading(ticketId);
      const updatedTicket = await internalTicketService.resolveTicket(ticketId);
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Ticket marked as resolved');
      fetchInternalStats();
    } catch (error) {
      console.error('Error resolving ticket:', error);
      toast.error('Failed to resolve ticket');
    } finally {
      setInternalActionLoading(null);
    }
  };

  const handleCloseInternalTicket = async (ticketId: string) => {
    try {
      setInternalActionLoading(ticketId);
      const updatedTicket = await internalTicketService.closeTicket(ticketId);
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Ticket closed');
      fetchInternalStats();
    } catch (error) {
      console.error('Error closing ticket:', error);
      toast.error('Failed to close ticket');
    } finally {
      setInternalActionLoading(null);
    }
  };

  const handleReopenInternalTicket = async (ticketId: string) => {
    try {
      setInternalActionLoading(ticketId);
      const updatedTicket = await internalTicketService.reopenTicket(ticketId);
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Ticket reopened');
      fetchInternalStats();
    } catch (error) {
      console.error('Error reopening ticket:', error);
      toast.error('Failed to reopen ticket');
    } finally {
      setInternalActionLoading(null);
    }
  };

  const handleSendInternalReply = async () => {
    if (!replyMessage.trim() || !selectedInternalTicket) return;

    try {
      const updatedTicket = await internalTicketService.addResponse(selectedInternalTicket.id, {
        message: replyMessage,
      });

      setSelectedInternalTicket(updatedTicket);
      setInternalTickets(internalTickets.map(t => t.id === selectedInternalTicket.id ? updatedTicket : t));
      setReplyMessage('');
      toast.success('Reply sent successfully');
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error('Failed to send reply');
    }
  };

  const handleUpdateInternalPriority = async (ticketId: string, newPriority: InternalTicketPriority) => {
    try {
      const updatedTicket = await internalTicketService.updateTicket(ticketId, { priority: newPriority });
      setInternalTickets(internalTickets.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedInternalTicket?.id === ticketId) {
        setSelectedInternalTicket(updatedTicket);
      }
      toast.success('Priority updated');
    } catch (error) {
      console.error('Error updating priority:', error);
      toast.error('Failed to update priority');
    }
  };

  const getInternalStatusBadge = (status: string) => {
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

  const getInternalPriorityBadge = (priorityValue: string) => {
    const priorityData = internalPriorities.find(p => p.value === priorityValue);
    return (
      <span className={`px-2.5 py-1 rounded text-xs border ${priorityData?.color}`}>
        {priorityData?.label}
      </span>
    );
  };

  const getInternalCategoryLabel = (categoryValue: string) => {
    return internalCategories.find(c => c.value === categoryValue)?.label || categoryValue;
  };

  const getInternalCategoryIcon = (categoryValue: string) => {
    const cat = internalCategories.find(c => c.value === categoryValue);
    return cat?.icon || HelpCircle;
  };

  const filteredInternalTickets = internalTickets.filter(ticket => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.created_by?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleSubmitTicket = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(getSupportApiUrl(), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title,
          description,
          category,
          priority,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newTicket = transformTicket(data);
        setTickets([newTicket, ...tickets]);

        toast.success(`Ticket #${newTicket.ticketNumber} created. We'll respond within 24 hours.`);

        // Reset form
        setTitle('');
        setDescription('');
        setCategory('technical');
        setPriority('medium');
        setAttachments([]);
        setView('tickets');

        // Refresh stats
        fetchStats();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to create ticket');
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error('Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim() || !selectedTicket) return;

    try {
      const response = await fetch(getSupportApiUrl(`/${selectedTicket.id}/responses`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: replyMessage,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedTicket = transformTicket(data);
        setSelectedTicket(updatedTicket);
        setTickets(tickets.map(t => t.id === selectedTicket.id ? updatedTicket : t));
        setReplyMessage('');
        toast.success('Reply sent successfully');
      } else {
        toast.error('Failed to send reply');
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error('Failed to send reply');
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;

    try {
      const response = await fetch(getSupportApiUrl(`/${selectedTicket.id}/close`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedTicket = transformTicket(data);
        setSelectedTicket(updatedTicket);
        setTickets(tickets.map(t => t.id === selectedTicket.id ? updatedTicket : t));
        toast.success('Ticket closed');
        fetchStats();
      } else {
        toast.error('Failed to close ticket');
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      toast.error('Failed to close ticket');
    }
  };

  const handleReopenTicket = async () => {
    if (!selectedTicket) return;

    try {
      const response = await fetch(getSupportApiUrl(`/${selectedTicket.id}/reopen`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedTicket = transformTicket(data);
        setSelectedTicket(updatedTicket);
        setTickets(tickets.map(t => t.id === selectedTicket.id ? updatedTicket : t));
        toast.success('Ticket reopened');
        fetchStats();
      } else {
        toast.error('Failed to reopen ticket');
      }
    } catch (error) {
      console.error('Error reopening ticket:', error);
      toast.error('Failed to reopen ticket');
    }
  };

  // API 5: Update Ticket - PUT /api/v1/support-tickets/{ticket_id}
  const handleUpdateTicket = async (updates: {
    title?: string;
    description?: string;
    category?: string;
    priority?: string;
    status?: string;
  }) => {
    if (!selectedTicket) return;

    try {
      const response = await fetch(getSupportApiUrl(`/${selectedTicket.id}`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedTicket = transformTicket(data);
        setSelectedTicket(updatedTicket);
        setTickets(tickets.map(t => t.id === selectedTicket.id ? updatedTicket : t));
        toast.success('Ticket updated');
        fetchStats();
        return true;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to update ticket');
        return false;
      }
    } catch (error) {
      console.error('Error updating ticket:', error);
      toast.error('Failed to update ticket');
      return false;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusBadge = (status: SupportTicket['status']) => {
    const styles = {
      'open': { bg: 'bg-gray-100', text: 'text-gray-900', border: 'border-gray-300', icon: Circle },
      'in-progress': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', icon: Clock3 },
      'resolved': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: CheckCircle2 },
      'closed': { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', icon: XCircle }
    };

    const style = styles[status];
    const Icon = style.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${style.bg} ${style.text} ${style.border}`}>
        <Icon className="w-3.5 h-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </span>
    );
  };

  const getPriorityBadge = (priority: SupportTicket['priority']) => {
    const priorityData = priorities.find(p => p.value === priority);
    return (
      <span className={`px-2.5 py-1 rounded text-xs border ${priorityData?.color}`}>
        {priorityData?.label}
      </span>
    );
  };

  const getCategoryLabel = (category: string) => {
    return categories.find(c => c.value === category)?.label || category;
  };

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.value === category);
    return cat?.icon || HelpCircle;
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch =
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });


  // Use stats from API or calculate from tickets
  const openTickets = stats?.open_tickets ?? tickets.filter(t => t.status === 'open').length;
  const inProgressTickets = stats?.in_progress_tickets ?? tickets.filter(t => t.status === 'in-progress').length;
  const resolvedTickets = stats?.resolved_tickets ?? tickets.filter(t => t.status === 'resolved').length;
  const totalTickets = stats?.total_tickets ?? tickets.length;

  // Internal ticket stats
  const internalOpenTickets = internalStats?.open_tickets ?? 0;
  const internalInProgressTickets = internalStats?.in_progress_tickets ?? 0;
  const internalResolvedTickets = internalStats?.resolved_tickets ?? 0;
  const internalUnassignedTickets = internalStats?.unassigned_tickets ?? 0;
  const internalTotalTickets = internalStats?.total_tickets ?? 0;

  return (
    <div className="flex-1 bg-gray-50 h-screen overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-lg">
                <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Support Center</h1>
                <p className="text-xs sm:text-sm text-gray-600">
                  {activeTab === 'external' ? 'Get help from TalentFlow support team' : 'Manage help requests from your team'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {activeTab === 'team' && isAdmin && (
                <button
                  onClick={() => { fetchInternalTickets(); fetchInternalStats(); }}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              )}
              {activeTab === 'external' && view !== 'overview' && view !== 'submit' && (
                <button
                  onClick={() => setView('submit')}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-sm"
                >
                  <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  New Ticket
                </button>
              )}
            </div>
          </div>

          {/* Tab Switcher - Only show for admins */}
          {isAdmin && (
            <div className="flex gap-1 mt-4 sm:mt-6 border-b border-gray-200 -mb-4 sm:-mb-6 overflow-x-auto">
              <button
                onClick={() => { setActiveTab('external'); setView('overview'); setSelectedTicket(null); setSelectedInternalTicket(null); }}
                className={`px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'external'
                    ? 'text-gray-900 border-gray-900'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">My Support Tickets</span>
                  <span className="sm:hidden">My Tickets</span>
                </div>
              </button>
              <button
                onClick={() => { setActiveTab('team'); setView('overview'); setSelectedTicket(null); setSelectedInternalTicket(null); }}
                className={`px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'team'
                    ? 'text-gray-900 border-gray-900'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Inbox className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Team Support Tickets</span>
                  <span className="sm:hidden">Team</span>
                  {internalUnassignedTickets > 0 && (
                    <span className="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs bg-orange-100 text-orange-700 rounded-full">
                      {internalUnassignedTickets}
                    </span>
                  )}
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4 md:p-6 lg:p-8">
        {/* ========== EXTERNAL SUPPORT TICKETS (TalentFlow Support) ========== */}

        {/* Overview */}
        {activeTab === 'external' && view === 'overview' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">Open Tickets</span>
                  <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl text-gray-900 mb-0.5 sm:mb-1">{openTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">Awaiting response</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">In Progress</span>
                  <Clock3 className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl text-gray-900 mb-0.5 sm:mb-1">{inProgressTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">Being worked on</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">Resolved</span>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl text-gray-900 mb-0.5 sm:mb-1">{resolvedTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">Successfully solved</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">Total Tickets</span>
                  <Ticket className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl text-gray-900 mb-0.5 sm:mb-1">{totalTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">All time</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              <button
                onClick={() => setView('submit')}
                className="bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-xl shadow-lg p-4 sm:p-6 md:p-8 text-left hover:from-blue-700 hover:to-blue-800 transition-all"
              >
                <Send className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-4" />
                <h3 className="text-white text-sm sm:text-base mb-1 sm:mb-2">Submit New Ticket</h3>
                <p className="text-xs sm:text-sm text-gray-100">
                  Report an issue or request help from our support team
                </p>
              </button>

              <button
                onClick={() => setView('tickets')}
                className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-4 sm:p-6 md:p-8 text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <Ticket className="w-6 h-6 sm:w-8 sm:h-8 text-gray-800 mb-2 sm:mb-4" />
                <h3 className="text-gray-900 text-sm sm:text-base mb-1 sm:mb-2">View My Tickets</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  Track and manage all your support requests
                </p>
              </button>
            </div>

            {/* Recent Tickets */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
                <h3 className="text-sm sm:text-base text-gray-900 font-semibold">Recent Tickets</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="text-sm text-gray-800 hover:text-gray-900"
                >
                  View All
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-gray-800" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <Ticket className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-gray-400" />
                  <p className="text-xs sm:text-sm text-gray-600">No tickets yet</p>
                  <button
                    onClick={() => setView('submit')}
                    className="mt-4 text-sm text-gray-800 hover:text-gray-900"
                  >
                    Create your first ticket
                  </button>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {tickets.slice(0, 5).map(ticket => (
                    <button
                      key={ticket.id}
                      onClick={() => {
                        setSelectedTicket(ticket);
                        fetchTicketDetail(ticket.id);
                        setView('detail');
                      }}
                      className="w-full text-left p-3 sm:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-1.5 sm:mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-600 block mb-0.5 sm:mb-1">{ticket.ticketNumber}</span>
                          <h4 className="text-xs sm:text-sm text-gray-900 truncate">{ticket.title}</h4>
                        </div>
                        {getStatusBadge(ticket.status)}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-600 flex-wrap">
                        <span className="truncate max-w-[80px] sm:max-w-none">{getCategoryLabel(ticket.category)}</span>
                        <span className="hidden sm:inline">-</span>
                        {getPriorityBadge(ticket.priority)}
                        <span className="hidden sm:inline">-</span>
                        <span>{formatISTDate(ticket.updatedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Help Resources */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
              <button
                onClick={() => setView('knowledge-base')}
                className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <Book className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800 mb-2 sm:mb-3" />
                <h4 className="text-sm sm:text-base text-gray-900 mb-1 sm:mb-2">Knowledge Base</h4>
                <p className="text-xs sm:text-sm text-gray-600">
                  Browse articles and guides
                </p>
              </button>

              <a
                href="#"
                className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <Video className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800 mb-2 sm:mb-3" />
                <h4 className="text-sm sm:text-base text-gray-900 mb-1 sm:mb-2">Video Tutorials</h4>
                <p className="text-xs sm:text-sm text-gray-600">
                  Watch step-by-step guides
                </p>
              </a>

              <a
                href="#"
                className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <FileQuestion className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800 mb-2 sm:mb-3" />
                <h4 className="text-sm sm:text-base text-gray-900 mb-1 sm:mb-2">FAQs</h4>
                <p className="text-xs sm:text-sm text-gray-600">
                  Find quick answers
                </p>
              </a>
            </div>

            {/* Contact Information */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4 md:p-6">
              <h3 className="text-sm sm:text-base text-gray-900 font-semibold mb-3 sm:mb-4">Need Immediate Help?</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] sm:text-xs text-gray-600">Email</div>
                    <div className="text-xs sm:text-sm text-gray-900 truncate">support@talentflow.com</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 flex-shrink-0" />
                  <div>
                    <div className="text-[10px] sm:text-xs text-gray-600">Phone</div>
                    <div className="text-xs sm:text-sm text-gray-900">1-800-TALENT-1</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 flex-shrink-0" />
                  <div>
                    <div className="text-[10px] sm:text-xs text-gray-600">Hours</div>
                    <div className="text-xs sm:text-sm text-gray-900">Mon-Fri, 9AM-6PM EST</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Ticket Form */}
        {activeTab === 'external' && view === 'submit' && (
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 hover:text-gray-900 mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8">
              <h2 className="text-sm sm:text-base md:text-lg text-gray-900 font-semibold mb-4 sm:mb-6">Submit Support Ticket</h2>

              <div className="space-y-4 sm:space-y-6">
                <div>
                  <label className="block text-xs sm:text-sm text-gray-700 mb-1.5 sm:mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of your issue"
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 placeholder-gray-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-700 mb-1.5 sm:mb-2">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm text-gray-700 mb-1.5 sm:mb-2">
                      Priority <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as SupportTicket['priority'])}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      {priorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm text-gray-700 mb-1.5 sm:mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide detailed information about your issue..."
                    rows={6}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm text-gray-700 mb-1.5 sm:mb-2">
                    Attachments (Optional)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 md:p-8 text-center hover:border-gray-400 transition-colors">
                    <input
                      type="file"
                      id="file-upload"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <Upload className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-gray-400 mb-2 sm:mb-3" />
                      <span className="text-xs sm:text-sm text-gray-900 mb-1">
                        Click to upload files
                      </span>
                      <span className="text-[10px] sm:text-xs text-gray-600">
                        Screenshots, logs, or documents (Max 10MB each)
                      </span>
                    </label>
                  </div>

                  {attachments.length > 0 && (
                    <div className="mt-3 sm:mt-4 space-y-2">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm text-gray-900 truncate">{file.name}</div>
                              <div className="text-[10px] sm:text-xs text-gray-600">
                                {(file.size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => removeAttachment(index)}
                            className="p-1.5 sm:p-2 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 sm:gap-4 pt-3 sm:pt-4">
                  <button
                    onClick={() => setView('overview')}
                    className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitTicket}
                    disabled={submitting}
                    className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-600"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                    {submitting ? 'Submitting...' : 'Submit Ticket'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All Tickets List */}
        {activeTab === 'external' && view === 'tickets' && (
          <div>
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 hover:text-gray-900 mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Filters */}
              <div className="p-3 sm:p-4 md:p-6 border-b border-gray-200">
                <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tickets..."
                      className="w-full pl-9 sm:pl-11 pr-3 sm:pr-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 placeholder-gray-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3 md:gap-4">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-2.5 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
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
                      className="px-2.5 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="all">All Priority</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tickets */}
              {loading ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-gray-800" />
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="md:hidden divide-y divide-gray-200">
                    {filteredTickets.map(ticket => {
                      const CategoryIcon = getCategoryIcon(ticket.category);
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => {
                            setSelectedTicket(ticket);
                            fetchTicketDetail(ticket.id);
                            setView('detail');
                          }}
                          className="w-full text-left p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] sm:text-xs text-gray-600 block mb-0.5">{ticket.ticketNumber}</span>
                              <h4 className="text-xs sm:text-sm text-gray-900 font-medium truncate">{ticket.title}</h4>
                            </div>
                            {getStatusBadge(ticket.status)}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-1.5">
                            <div className="flex items-center gap-1">
                              <CategoryIcon className="w-3 h-3 text-gray-600 flex-shrink-0" />
                              <span className="text-[10px] sm:text-xs text-gray-600">{getCategoryLabel(ticket.category)}</span>
                            </div>
                            {getPriorityBadge(ticket.priority)}
                            <span className="text-[10px] sm:text-xs text-gray-600">{formatISTDate(ticket.updatedAt)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs text-gray-600">Ticket #</th>
                          <th className="px-6 py-4 text-left text-xs text-gray-600">Title</th>
                          <th className="px-6 py-4 text-left text-xs text-gray-600">Category</th>
                          <th className="px-6 py-4 text-left text-xs text-gray-600">Priority</th>
                          <th className="px-6 py-4 text-left text-xs text-gray-600">Status</th>
                          <th className="px-6 py-4 text-left text-xs text-gray-600">Updated</th>
                          <th className="px-6 py-4 text-left text-xs text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredTickets.map(ticket => {
                          const CategoryIcon = getCategoryIcon(ticket.category);
                          return (
                            <tr key={ticket.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-900">{ticket.ticketNumber}</span>
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
                                <span className="text-sm text-gray-600">{formatISTDate(ticket.updatedAt)}</span>
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => {
                                    setSelectedTicket(ticket);
                                    fetchTicketDetail(ticket.id);
                                    setView('detail');
                                  }}
                                  className="text-sm text-gray-800 hover:text-gray-900"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {filteredTickets.length === 0 && (
                    <div className="text-center py-8 sm:py-12">
                      <Ticket className="w-10 h-10 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-400" />
                      <p className="text-xs sm:text-sm text-gray-600">No tickets found</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Ticket Detail View */}
        {activeTab === 'external' && view === 'detail' && selectedTicket && (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setView('tickets')}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 hover:text-gray-900 mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Back to All Tickets
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                {/* Ticket Header */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div>
                      <span className="text-[10px] sm:text-xs text-gray-600 block mb-1 sm:mb-2">{selectedTicket.ticketNumber}</span>
                      <h2 className="text-sm sm:text-base md:text-lg text-gray-900 font-semibold mb-2 sm:mb-3">{selectedTicket.title}</h2>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {getStatusBadge(selectedTicket.status)}
                        {getPriorityBadge(selectedTicket.priority)}
                        <span className="text-[10px] sm:text-xs text-gray-600">
                          {getCategoryLabel(selectedTicket.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conversation */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <h3 className="text-sm sm:text-base text-gray-900 font-semibold mb-4 sm:mb-6">Conversation</h3>

                  <div className="space-y-4 sm:space-y-6">
                    {selectedTicket.responses?.map((response) => (
                      <div
                        key={response.id}
                        className={`${
                          response.from === 'user'
                            ? 'bg-gray-50 border-gray-200'
                            : 'bg-gray-50 border-gray-200'
                        } border rounded-lg p-3 sm:p-4 md:p-5`}
                      >
                        <div className="flex items-start gap-2.5 sm:gap-4 mb-2 sm:mb-3">
                          {response.from === 'user' ? (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-800 rounded-full flex items-center justify-center text-white text-xs sm:text-sm flex-shrink-0">
                              U
                            </div>
                          ) : (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-600 rounded-full flex items-center justify-center text-white text-xs sm:text-sm flex-shrink-0">
                              S
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <span className="text-xs sm:text-sm text-gray-900 font-medium truncate">
                                {response.from === 'user' ? 'You' : response.agentName || 'Support Team'}
                              </span>
                              <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{formatISTDate(response.timestamp)}</span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">{response.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box */}
                  {selectedTicket.status !== 'closed' && (
                    <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                      <label className="block text-xs sm:text-sm text-gray-700 mb-1.5 sm:mb-2">Add Reply</label>
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your message..."
                        rows={3}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none placeholder-gray-500"
                      />
                      <div className="flex justify-end mt-2 sm:mt-3">
                        <button
                          onClick={handleSendReply}
                          disabled={!replyMessage.trim()}
                          className="px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2"
                        >
                          <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Send Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4 sm:space-y-6">
                {/* Ticket Info */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm text-gray-900 font-semibold mb-3 sm:mb-4">Ticket Information</h4>

                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Created</div>
                      <div className="text-xs sm:text-sm text-gray-900">{formatIST(selectedTicket.createdAt)}</div>
                    </div>

                    <div>
                      <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Last Updated</div>
                      <div className="text-xs sm:text-sm text-gray-900">{formatIST(selectedTicket.updatedAt)}</div>
                    </div>

                    {selectedTicket.assignedAgent && (
                      <div>
                        <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Assigned Agent</div>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-green-600 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs flex-shrink-0">
                            {selectedTicket.assignedAgent.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-900">{selectedTicket.assignedAgent}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Responses</div>
                      <div className="text-xs sm:text-sm text-gray-900">{selectedTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Update Priority */}
                {selectedTicket.status !== 'closed' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                    <h4 className="text-xs sm:text-sm text-gray-900 font-semibold mb-3 sm:mb-4">Update Priority</h4>
                    <select
                      value={selectedTicket.priority}
                      onChange={(e) => handleUpdateTicket({ priority: e.target.value })}
                      className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      {priorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm text-gray-900 font-semibold mb-3 sm:mb-4">Actions</h4>

                  <div className="space-y-2">
                    <button className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2">
                      <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                      Download Transcript
                    </button>

                    {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && (
                      <button
                        onClick={handleReopenTicket}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2"
                      >
                        <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        Reopen Ticket
                      </button>
                    )}

                    {selectedTicket.status !== 'closed' && (
                      <button
                        onClick={handleCloseTicket}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2"
                      >
                        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        Close Ticket
                      </button>
                    )}
                  </div>
                </div>

                {/* Related Articles */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm text-gray-900 font-semibold mb-3 sm:mb-4">Related Help Articles</h4>

                  <div className="space-y-2">
                    <a href="#" className="block text-xs sm:text-sm text-gray-800 hover:text-gray-900">
                      How to upload resumes
                    </a>
                    <a href="#" className="block text-xs sm:text-sm text-gray-800 hover:text-gray-900">
                      Resume upload troubleshooting
                    </a>
                    <a href="#" className="block text-xs sm:text-sm text-gray-800 hover:text-gray-900">
                      File format requirements
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Knowledge Base */}
        {activeTab === 'external' && view === 'knowledge-base' && (
          <div>
            <button
              onClick={() => setView('overview')}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 hover:text-gray-900 mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8">
              <h2 className="text-sm sm:text-base md:text-lg text-gray-900 font-semibold mb-4 sm:mb-6">Knowledge Base</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                {categories.slice(0, 6).map(cat => {
                  const Icon = cat.icon;
                  return (
                    <a
                      key={cat.value}
                      href="#"
                      className="p-3 sm:p-4 md:p-6 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all"
                    >
                      <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-gray-800 mb-2 sm:mb-3" />
                      <h4 className="text-sm sm:text-base text-gray-900 mb-1 sm:mb-2">{cat.label}</h4>
                      <p className="text-xs sm:text-sm text-gray-600">View articles and guides</p>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========== TEAM SUPPORT TICKETS (Admin Only) ========== */}

        {/* Team Tickets Overview */}
        {activeTab === 'team' && isAdmin && view === 'overview' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">Open</span>
                  <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold text-gray-900 mb-0.5 sm:mb-1">{internalOpenTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">Awaiting action</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">In Progress</span>
                  <Clock3 className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold text-gray-900 mb-0.5 sm:mb-1">{internalInProgressTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">Being handled</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">Resolved</span>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold text-gray-900 mb-0.5 sm:mb-1">{internalResolvedTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">Successfully resolved</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">Unassigned</span>
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold text-gray-900 mb-0.5 sm:mb-1">{internalUnassignedTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">Need assignment</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">Total</span>
                  <Ticket className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold text-gray-900 mb-0.5 sm:mb-1">{internalTotalTickets}</div>
                <div className="text-[10px] sm:text-xs text-gray-600">All time</div>
              </div>
            </div>

            {/* Category Breakdown */}
            {internalStats?.tickets_by_category && Object.keys(internalStats.tickets_by_category).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3 sm:mb-4">Tickets by Category</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
                  {Object.entries(internalStats.tickets_by_category).map(([cat, count]) => {
                    const CategoryIcon = getInternalCategoryIcon(cat);
                    return (
                      <div key={cat} className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-gray-50 rounded-lg">
                        <CategoryIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm sm:text-lg font-semibold text-gray-900">{count}</div>
                          <div className="text-[10px] sm:text-xs text-gray-600 truncate">{getInternalCategoryLabel(cat)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
              <button
                onClick={() => { setInternalFilterAssignment('unassigned'); setView('tickets'); }}
                className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl shadow-lg p-4 sm:p-6 text-left hover:from-orange-600 hover:to-red-600 transition-all"
              >
                <Users className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3" />
                <h3 className="text-sm sm:text-lg font-semibold text-white mb-0.5 sm:mb-1">Unassigned Tickets</h3>
                <p className="text-xs sm:text-sm text-orange-100">
                  {internalUnassignedTickets} tickets need attention
                </p>
              </button>

              <button
                onClick={() => { setInternalFilterAssignment('mine'); setView('tickets'); }}
                className="bg-gradient-to-r from-gray-700 to-gray-900 text-white rounded-xl shadow-lg p-4 sm:p-6 text-left hover:from-gray-800 hover:to-black transition-all"
              >
                <UserCheck className="w-6 h-6 sm:w-8 sm:h-8 mb-2 sm:mb-3" />
                <h3 className="text-sm sm:text-lg font-semibold text-white mb-0.5 sm:mb-1">My Assigned Tickets</h3>
                <p className="text-xs sm:text-sm text-gray-300">
                  View tickets assigned to you
                </p>
              </button>

              <button
                onClick={() => { setInternalFilterAssignment('all'); setView('tickets'); }}
                className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-4 sm:p-6 text-left hover:border-gray-300 hover:shadow-md transition-all"
              >
                <Ticket className="w-6 h-6 sm:w-8 sm:h-8 text-gray-700 mb-2 sm:mb-3" />
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1">All Team Tickets</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  View all team support requests
                </p>
              </button>
            </div>

            {/* Recent Team Tickets */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">Recent Team Tickets</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="text-xs sm:text-sm text-gray-700 hover:text-gray-900"
                >
                  View All
                </button>
              </div>

              {internalLoading ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-gray-600" />
                </div>
              ) : internalTickets.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <Inbox className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-gray-400" />
                  <p className="text-xs sm:text-sm text-gray-600">No team tickets yet</p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {internalTickets.slice(0, 5).map(ticket => (
                    <button
                      key={ticket.id}
                      onClick={() => {
                        setSelectedInternalTicket(ticket);
                        fetchInternalTicketDetail(ticket.id);
                        setView('detail');
                      }}
                      className="w-full text-left p-3 sm:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-1.5 sm:mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1 flex-wrap">
                            <span className="text-[10px] sm:text-xs text-gray-600">{ticket.ticket_number}</span>
                            <span className="text-[10px] sm:text-xs text-gray-400 hidden sm:inline">-</span>
                            <span className="text-[10px] sm:text-xs text-gray-600 truncate">from {ticket.created_by?.name}</span>
                          </div>
                          <h4 className="text-xs sm:text-sm font-medium text-gray-900 truncate">{ticket.title}</h4>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          {!ticket.assigned_to && (
                            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-orange-100 text-orange-700 text-[10px] sm:text-xs rounded border border-orange-200">
                              Unassigned
                            </span>
                          )}
                          {getInternalStatusBadge(ticket.status)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-600 flex-wrap">
                        <span className="truncate max-w-[80px] sm:max-w-none">{getInternalCategoryLabel(ticket.category)}</span>
                        <span className="hidden sm:inline">-</span>
                        {getInternalPriorityBadge(ticket.priority)}
                        <span className="hidden sm:inline">-</span>
                        <span>{formatISTDate(ticket.updated_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team Tickets List */}
        {activeTab === 'team' && isAdmin && view === 'tickets' && (
          <div>
            <button
              onClick={() => { setInternalFilterAssignment('all'); setView('overview'); }}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 hover:text-gray-900 mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Filters */}
              <div className="p-3 sm:p-4 md:p-6 border-b border-gray-200">
                <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by ticket, title, or user..."
                      className="w-full pl-9 sm:pl-11 pr-3 sm:pr-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500 placeholder-gray-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-2.5 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="all">All Status</option>
                      <option value="open">Open</option>
                      <option value="in-progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>

                    <select
                      value={internalFilterAssignment}
                      onChange={(e) => setInternalFilterAssignment(e.target.value)}
                      className="px-2.5 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="all">All Tickets</option>
                      <option value="mine">Assigned to Me</option>
                      <option value="unassigned">Unassigned</option>
                    </select>

                    <select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                      className="px-2.5 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500 col-span-2 sm:col-span-1"
                    >
                      <option value="all">All Priority</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tickets */}
              {internalLoading ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-gray-600" />
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="md:hidden divide-y divide-gray-200">
                    {filteredInternalTickets.map(ticket => {
                      const CategoryIcon = getInternalCategoryIcon(ticket.category);
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => {
                            setSelectedInternalTicket(ticket);
                            fetchInternalTicketDetail(ticket.id);
                            setView('detail');
                          }}
                          className="w-full text-left p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <span className="text-[10px] sm:text-xs text-gray-600">{ticket.ticket_number}</span>
                                <span className="text-[10px] sm:text-xs text-gray-600 truncate">from {ticket.created_by?.name}</span>
                              </div>
                              <h4 className="text-xs sm:text-sm text-gray-900 font-medium truncate">{ticket.title}</h4>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {getInternalStatusBadge(ticket.status)}
                              {!ticket.assigned_to && (
                                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded border border-orange-200">
                                  Unassigned
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-1.5">
                            <div className="flex items-center gap-1">
                              <CategoryIcon className="w-3 h-3 text-gray-600 flex-shrink-0" />
                              <span className="text-[10px] sm:text-xs text-gray-600">{getInternalCategoryLabel(ticket.category)}</span>
                            </div>
                            {getInternalPriorityBadge(ticket.priority)}
                            <span className="text-[10px] sm:text-xs text-gray-600">{formatISTDate(ticket.updated_at)}</span>
                            {ticket.assigned_to && (
                              <span className="text-[10px] sm:text-xs text-gray-600 truncate max-w-[80px]">{ticket.assigned_to.name}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
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
                        {filteredInternalTickets.map(ticket => {
                          const CategoryIcon = getInternalCategoryIcon(ticket.category);
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
                                  <span className="text-sm text-gray-600">{getInternalCategoryLabel(ticket.category)}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {getInternalPriorityBadge(ticket.priority)}
                              </td>
                              <td className="px-6 py-4">
                                {getInternalStatusBadge(ticket.status)}
                              </td>
                              <td className="px-6 py-4">
                                {ticket.assigned_to ? (
                                  <span className="text-sm text-gray-600">{ticket.assigned_to.name}</span>
                                ) : (
                                  <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">Unassigned</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-600">{formatISTDate(ticket.updated_at)}</span>
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => {
                                    setSelectedInternalTicket(ticket);
                                    fetchInternalTicketDetail(ticket.id);
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
                  </div>

                  {filteredInternalTickets.length === 0 && (
                    <div className="text-center py-8 sm:py-12">
                      <Inbox className="w-10 h-10 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-400" />
                      <p className="text-xs sm:text-sm text-gray-600">No tickets found</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Team Ticket Detail View */}
        {activeTab === 'team' && isAdmin && view === 'detail' && selectedInternalTicket && (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setView('tickets')}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 hover:text-gray-900 mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Back to Tickets
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                {/* Ticket Header */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div>
                      <span className="text-[10px] sm:text-xs text-gray-600 block mb-1 sm:mb-2">{selectedInternalTicket.ticket_number}</span>
                      <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-2 sm:mb-3">{selectedInternalTicket.title}</h2>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {getInternalStatusBadge(selectedInternalTicket.status)}
                        {getInternalPriorityBadge(selectedInternalTicket.priority)}
                        <span className="text-[10px] sm:text-xs text-gray-600">
                          {getInternalCategoryLabel(selectedInternalTicket.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 sm:pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 flex-wrap">
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span>Submitted by <strong>{selectedInternalTicket.created_by?.name}</strong></span>
                      {selectedInternalTicket.created_by?.email && (
                        <span className="text-gray-500 truncate text-[10px] sm:text-xs">({selectedInternalTicket.created_by.email})</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conversation */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-4 sm:mb-6">Conversation</h3>

                  <div className="space-y-4 sm:space-y-6">
                    {selectedInternalTicket.responses?.map((response) => (
                      <div
                        key={response.id}
                        className={`${
                          response.user_role === 'admin'
                            ? 'bg-gray-100 border-gray-300'
                            : 'bg-blue-50 border-blue-200'
                        } border rounded-lg p-3 sm:p-4 md:p-5`}
                      >
                        <div className="flex items-start gap-2.5 sm:gap-4 mb-2 sm:mb-3">
                          {response.user_role === 'admin' ? (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700 rounded-full flex items-center justify-center text-white flex-shrink-0 text-xs sm:text-sm font-medium">
                              A
                            </div>
                          ) : (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-500 rounded-full flex items-center justify-center text-white flex-shrink-0 text-xs sm:text-sm font-medium">
                              {response.user_name?.charAt(0) || 'U'}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <span className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                                {response.user_role === 'admin' ? `${response.user_name} (Admin)` : response.user_name}
                              </span>
                              <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{formatISTDate(response.created_at)}</span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{response.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box */}
                  {selectedInternalTicket.status !== 'closed' && (
                    <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Reply to User</label>
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your response..."
                        rows={3}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none placeholder-gray-500"
                      />
                      <div className="flex justify-end mt-2 sm:mt-3">
                        <button
                          onClick={handleSendInternalReply}
                          disabled={!replyMessage.trim()}
                          className="px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2"
                        >
                          <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Send Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4 sm:space-y-6">
                {/* Ticket Info */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-3 sm:mb-4">Ticket Information</h4>

                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Created</div>
                      <div className="text-xs sm:text-sm text-gray-900">{formatIST(selectedInternalTicket.created_at)}</div>
                    </div>

                    <div>
                      <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Last Updated</div>
                      <div className="text-xs sm:text-sm text-gray-900">{formatIST(selectedInternalTicket.updated_at)}</div>
                    </div>

                    <div>
                      <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Assigned To</div>
                      {selectedInternalTicket.assigned_to ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-700 rounded-full flex items-center justify-center text-white text-[10px] sm:text-xs flex-shrink-0">
                            {selectedInternalTicket.assigned_to.name.charAt(0)}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-900">{selectedInternalTicket.assigned_to.name}</div>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm text-orange-600">Not assigned</span>
                      )}
                    </div>

                    <div>
                      <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Responses</div>
                      <div className="text-xs sm:text-sm text-gray-900">{selectedInternalTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Update Priority */}
                {selectedInternalTicket.status !== 'closed' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                    <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-3 sm:mb-4">Update Priority</h4>
                    <select
                      value={selectedInternalTicket.priority}
                      onChange={(e) => handleUpdateInternalPriority(selectedInternalTicket.id, e.target.value as InternalTicketPriority)}
                      className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      {internalPriorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-3 sm:mb-4">Actions</h4>

                  <div className="space-y-2">
                    {!selectedInternalTicket.assigned_to && selectedInternalTicket.status !== 'closed' && (
                      <button
                        onClick={() => handleAssignInternalTicket(selectedInternalTicket.id)}
                        disabled={internalActionLoading === selectedInternalTicket.id}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2 disabled:bg-gray-400"
                      >
                        {internalActionLoading === selectedInternalTicket.id ? (
                          <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        )}
                        Assign to Me
                      </button>
                    )}

                    {(selectedInternalTicket.status === 'open' || selectedInternalTicket.status === 'in-progress') && (
                      <button
                        onClick={() => handleResolveInternalTicket(selectedInternalTicket.id)}
                        disabled={internalActionLoading === selectedInternalTicket.id}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2 disabled:bg-green-400"
                      >
                        {internalActionLoading === selectedInternalTicket.id ? (
                          <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        )}
                        Mark as Resolved
                      </button>
                    )}

                    {(selectedInternalTicket.status === 'resolved' || selectedInternalTicket.status === 'closed') && (
                      <button
                        onClick={() => handleReopenInternalTicket(selectedInternalTicket.id)}
                        disabled={internalActionLoading === selectedInternalTicket.id}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2 disabled:bg-gray-50"
                      >
                        {internalActionLoading === selectedInternalTicket.id ? (
                          <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        )}
                        Reopen Ticket
                      </button>
                    )}

                    {selectedInternalTicket.status !== 'closed' && (
                      <button
                        onClick={() => handleCloseInternalTicket(selectedInternalTicket.id)}
                        disabled={internalActionLoading === selectedInternalTicket.id}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2 disabled:bg-red-50"
                      >
                        {internalActionLoading === selectedInternalTicket.id ? (
                          <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
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

// Helper icon component
function Lightbulb({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

function Briefcase({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
