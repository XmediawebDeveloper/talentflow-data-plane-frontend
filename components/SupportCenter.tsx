'use client';

import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/empty-state';
import { useState, useEffect, useRef } from 'react';
import {
  HelpCircle, Send, Ticket, Clock, CheckCircle, MessageSquare, AlertCircle,
  FileText, Upload, Trash2, Search, X, ArrowLeft, Filter, Download, ExternalLink,
  CheckCircle2, Circle, Clock3, XCircle, ChevronDown, Mail, Phone, Globe, Book,
  Video, FileQuestion, Tag, User, Calendar, Paperclip, Loader2, Inbox,
  Users, UserCheck, RefreshCw, KeyRound, Bug, MessageCircleQuestion, MoreHorizontal, Sparkles, Lock,
  LifeBuoy
} from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { internalTicketService, InternalTicket, InternalTicketAdminStats, InternalTicketPriority } from '@/lib/services';
import ListPagination from '@/components/ListPagination';
import FeatureGate from '@/components/shared/FeatureGate';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { PageHeader } from '@/components/ui/page-header';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

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
  { value: 'low', label: 'Low', color: 'text-[var(--text-secondary)] bg-[var(--surface-hover)] border-[var(--border)]' },
  { value: 'medium', label: 'Medium', color: 'text-[var(--text-primary)] bg-[var(--surface-hover)] border-[var(--border)]' },
  { value: 'high', label: 'High', color: 'text-warning bg-warning-subtle border-warning-line' },
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

  // Pagination state — separate per tab
  const [myCurrentPage, setMyCurrentPage] = useState(1);
  const [myItemsPerPage, setMyItemsPerPage] = useState(10);
  const [teamCurrentPage, setTeamCurrentPage] = useState(1);
  const [teamItemsPerPage, setTeamItemsPerPage] = useState(10);

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

  // Persist scroll + list view state so returning to Support restores it.
  // 'detail'/'submit' are excluded from restore since they depend on a selected
  // ticket / in-progress form that don't survive the remount.
  const rootRef = useScrollRestoration('support-tickets', !loading);
  useListStatePersistence(
    'support-tickets',
    { activeTab, view, searchQuery, filterStatus, filterPriority, internalFilterAssignment,
      myCurrentPage, myItemsPerPage, teamCurrentPage, teamItemsPerPage },
    (s) => {
      if (s.activeTab === 'external' || s.activeTab === 'team') setActiveTab(s.activeTab);
      if (s.view === 'overview' || s.view === 'tickets' || s.view === 'knowledge-base') setView(s.view);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterStatus === 'string') setFilterStatus(s.filterStatus);
      if (typeof s.filterPriority === 'string') setFilterPriority(s.filterPriority);
      if (typeof s.internalFilterAssignment === 'string') setInternalFilterAssignment(s.internalFilterAssignment);
      if (typeof s.myCurrentPage === 'number') setMyCurrentPage(s.myCurrentPage);
      if (typeof s.myItemsPerPage === 'number') setMyItemsPerPage(s.myItemsPerPage);
      if (typeof s.teamCurrentPage === 'number') setTeamCurrentPage(s.teamCurrentPage);
      if (typeof s.teamItemsPerPage === 'number') setTeamItemsPerPage(s.teamItemsPerPage);
    },
  );

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
    { value: 'low', label: 'Low', color: 'text-[var(--text-secondary)] bg-[var(--surface-hover)] border-[var(--border)]' },
    { value: 'medium', label: 'Medium', color: 'text-[var(--text-primary)] bg-[var(--surface-hover)] border-[var(--border)]' },
    { value: 'high', label: 'High', color: 'text-warning bg-warning-subtle border-warning-line' },
    { value: 'urgent', label: 'Urgent', color: 'text-destructive bg-destructive-subtle border-destructive-line' }
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
    const map = {
      'open': { variant: 'info' as const, icon: Circle },
      'in-progress': { variant: 'warning' as const, icon: Clock3 },
      'resolved': { variant: 'success' as const, icon: CheckCircle2 },
      'closed': { variant: 'muted' as const, icon: XCircle },
    };

    const { variant, icon: Icon } = map[status as keyof typeof map] || map['open'];

    return (
      <Badge variant={variant} className="gap-1.5 px-3 py-1.5">
        <Icon className="w-3.5 h-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </Badge>
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

  const paginatedInternalTickets = filteredInternalTickets.slice(
    (teamCurrentPage - 1) * teamItemsPerPage,
    teamCurrentPage * teamItemsPerPage
  );

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
    const map = {
      'open': { variant: 'warning' as const, icon: Circle },
      'in-progress': { variant: 'info' as const, icon: Clock3 },
      'resolved': { variant: 'success' as const, icon: CheckCircle2 },
      'closed': { variant: 'muted' as const, icon: XCircle },
    };
    const { variant, icon: Icon } = map[status];
    return (
      <Badge variant={variant} className="gap-1.5 px-3 py-1.5">
        <Icon className="w-3.5 h-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
      </Badge>
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

  const paginatedTickets = filteredTickets.slice(
    (myCurrentPage - 1) * myItemsPerPage,
    myCurrentPage * myItemsPerPage
  );

  // Reset pagination on filter / tab changes
  useEffect(() => {
    setMyCurrentPage(1);
  }, [searchQuery, filterStatus, filterPriority, activeTab]);

  useEffect(() => {
    setTeamCurrentPage(1);
  }, [searchQuery, filterStatus, filterPriority, internalFilterAssignment, activeTab]);


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
    <div ref={rootRef} className="flex-1 bg-slate-50 overflow-x-clip">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Support Tickets' }]} />
      <div className="mb-5 flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <LifeBuoy className="h-5 w-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">Support Center</h1>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-400">{activeTab === 'external' ? 'Get help from the TalentFlow support team.' : 'Manage help requests from your team in one place.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Not in plan → the same pill, muted, with the plan-locked hover (never hidden). */}
          <FeatureGate
            feature="priority_support"
            mode="hidden"
            fallback={
              <Badge
                variant="secondary"
                aria-disabled="true"
                title={PLAN_LOCKED_MESSAGE}
                className="gap-1.5 cursor-not-allowed"
              >
                <Lock className="h-3 w-3" />
                Priority Support is not included in your current plan.
              </Badge>
            }
          >
            <Badge variant="success" className="gap-1.5">
              <Sparkles className="h-3 w-3" />
              Priority Support enabled — tickets handled with higher priority and faster response times.
            </Badge>
          </FeatureGate>
          <div className="flex items-center gap-2 sm:gap-3">
            {activeTab === 'team' && isAdmin && (
              <Button
                variant="secondary"
                onClick={() => { fetchInternalTickets(); fetchInternalStats(); }}
                icon={<RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />}
              >
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}
            {activeTab === 'external' && view !== 'overview' && view !== 'submit' && (
              <Button
                variant="primary"
                onClick={() => setView('submit')}
                icon={<Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />}
              >
                New Ticket
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Tab Switcher - Only show for admins */}
      {isAdmin && (
        <div className="flex gap-1 -mt-2 mb-5 border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('external'); setView('overview'); setSelectedTicket(null); setSelectedInternalTicket(null); }}
            className={`px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'external'
                ? 'text-brand-blue border-brand-blue'
                : 'text-gray-500 dark:text-slate-400 border-transparent hover:text-gray-800 dark:hover:text-slate-200 hover:border-gray-300'
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
                ? 'text-brand-blue border-brand-blue'
                : 'text-gray-500 dark:text-slate-400 border-transparent hover:text-gray-800 dark:hover:text-slate-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Inbox className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Team Support Tickets</span>
              <span className="sm:hidden">Team</span>
              {internalUnassignedTickets > 0 && (
                <span className="px-1.5 sm:px-2 py-0.5 text-2xs sm:text-xs bg-brand-orange/15 text-brand-orange ring-1 ring-brand-orange/20 rounded-full font-semibold">
                  {internalUnassignedTickets}
                </span>
              )}
            </div>
          </button>
        </div>
      )}

      {/* Content */}
      <div>
        {/* ========== EXTERNAL SUPPORT TICKETS (TalentFlow Support) ========== */}

        {/* Overview */}
        {activeTab === 'external' && view === 'overview' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Stats Cards — clicking a card drills into the tickets list pre-filtered by that status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              <button
                type="button"
                onClick={() => { setFilterStatus('open'); setView('tickets'); }}
                className="text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">Open Tickets</span>
                  <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{openTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Awaiting response</div>
              </button>

              <button
                type="button"
                onClick={() => { setFilterStatus('in_progress'); setView('tickets'); }}
                className="text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">In Progress</span>
                  <Clock3 className="w-4 h-4 sm:w-5 sm:h-5 text-warning flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{inProgressTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Being worked on</div>
              </button>

              <button
                type="button"
                onClick={() => { setFilterStatus('resolved'); setView('tickets'); }}
                className="text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">Resolved</span>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-success flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{resolvedTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Successfully solved</div>
              </button>

              <button
                type="button"
                onClick={() => { setFilterStatus('all'); setView('tickets'); }}
                className="text-left w-full bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">Total Tickets</span>
                  <Ticket className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{totalTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">All time</div>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              <button
                onClick={() => setView('submit')}
                className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6 md:p-8 text-left hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <Send className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue mb-2 sm:mb-4" />
                <h3 className="text-gray-900 dark:text-slate-50 text-sm sm:text-base mb-1 sm:mb-2">Submit New Ticket</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  Report an issue or request help from our support team
                </p>
              </button>

              <button
                onClick={() => setView('tickets')}
                className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6 md:p-8 text-left hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <Ticket className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue mb-2 sm:mb-4" />
                <h3 className="text-gray-900 dark:text-slate-50 text-sm sm:text-base mb-1 sm:mb-2">View My Tickets</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  Track and manage all your support requests
                </p>
              </button>
            </div>

            {/* Recent Tickets */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Recent Tickets</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="text-sm font-medium text-brand-blue hover:text-brand-blue/80"
                >
                  View All
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 sm:py-12 tf-loader-center">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-brand-blue" />
                </div>
              ) : tickets.length === 0 ? (
                <EmptyState
                  icon={Ticket}
                  title="No tickets yet"
                  description="You haven't created any support tickets yet. Create your first ticket to get help from our support team."
                  action={{ label: 'Create your first ticket', onClick: () => setView('submit') }}
                />
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
                      className="w-full text-left p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors border border-gray-200 dark:border-slate-700/60"
                    >
                      <div className="flex items-start justify-between mb-1.5 sm:mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 block mb-0.5 sm:mb-1">{ticket.ticketNumber}</span>
                          <h4 className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 truncate">{ticket.title}</h4>
                        </div>
                        {getStatusBadge(ticket.status)}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 text-2xs sm:text-xs text-gray-600 dark:text-slate-400 flex-wrap">
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
                className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl shadow-sm shadow-brand-blue/5 p-3 sm:p-4 md:p-6 text-left hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <Book className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue mb-2 sm:mb-3" />
                <h4 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-1 sm:mb-2">Knowledge Base</h4>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  Browse articles and guides
                </p>
              </button>

              <a
                href="#"
                className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl shadow-sm shadow-brand-blue/5 p-3 sm:p-4 md:p-6 text-left hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <Video className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue mb-2 sm:mb-3" />
                <h4 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-1 sm:mb-2">Video Tutorials</h4>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  Watch step-by-step guides
                </p>
              </a>

              <a
                href="#"
                className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] rounded-xl shadow-sm shadow-brand-blue/5 p-3 sm:p-4 md:p-6 text-left hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <FileQuestion className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue mb-2 sm:mb-3" />
                <h4 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-1 sm:mb-2">FAQs</h4>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  Find quick answers
                </p>
              </a>
            </div>

            {/* Contact Information */}
            <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-4 md:p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Need Immediate Help?</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Email</div>
                    <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 truncate">support@talentflow.com</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Phone</div>
                    <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">1-800-TALENT-1</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Hours</div>
                    <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">Mon-Fri, 9AM-6PM EST</div>
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
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-4 sm:p-6 md:p-8">
              <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-4 sm:mb-6">Submit Support Ticket</h2>

              <div className="space-y-4 sm:space-y-6">
                <div>
                  <Label className="mb-1.5">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of your issue"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <Label className="mb-1.5">
                      Category <span className="text-destructive">*</span>
                    </Label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    >
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="mb-1.5">
                      Priority <span className="text-destructive">*</span>
                    </Label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as SupportTicket['priority'])}
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    >
                      {priorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="mb-1.5">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide detailed information about your issue..."
                    rows={6}
                  />
                </div>

                <div>
                  <Label className="mb-1.5">
                    Attachments (Optional)
                  </Label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-lg p-4 sm:p-6 md:p-8 text-center hover:border-brand-blue/40 transition-colors">
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
                      <Upload className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-brand-blue mb-2 sm:mb-3" />
                      <span className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 mb-1">
                        Click to upload files
                      </span>
                      <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">
                        Screenshots, logs, or documents (Max 10MB each)
                      </span>
                    </label>
                  </div>

                  {attachments.length > 0 && (
                    <div className="mt-3 sm:mt-4 space-y-2">
                      {attachments.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 truncate">{file.name}</div>
                              <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">
                                {(file.size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                          </div>
                          <Tooltip content="Remove attachment">
                            <button
                              onClick={() => removeAttachment(index)}
                              aria-label="Remove attachment"
                              className="p-1.5 sm:p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive" />
                            </button>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 sm:gap-4 pt-3 sm:pt-4">
                  <Button
                    variant="secondary"
                    onClick={() => setView('overview')}
                    disabled={submitting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSubmitTicket}
                    disabled={submitting}
                    className="flex-1"
                    icon={submitting ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  >
                    {submitting ? 'Submitting...' : 'Submit Ticket'}
                  </Button>
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
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              {/* Filters */}
              <div className="p-3 sm:p-4 md:p-6 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue/60 z-10" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tickets..."
                      className="pl-9 pr-4 w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 md:gap-4">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
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
                      className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
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
                <div className="flex items-center justify-center py-8 sm:py-12 tf-loader-center">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-brand-blue" />
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700/60">
                    {paginatedTickets.map(ticket => {
                      const CategoryIcon = getCategoryIcon(ticket.category);
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => {
                            setSelectedTicket(ticket);
                            fetchTicketDetail(ticket.id);
                            setView('detail');
                          }}
                          className="w-full text-left p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 block mb-0.5">{ticket.ticketNumber}</span>
                              <h4 className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 font-medium truncate">{ticket.title}</h4>
                            </div>
                            {getStatusBadge(ticket.status)}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-1.5">
                            <div className="flex items-center gap-1 min-w-0">
                              <CategoryIcon className="w-3 h-3 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                              <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 truncate">{getCategoryLabel(ticket.category)}</span>
                            </div>
                            {getPriorityBadge(ticket.priority)}
                            <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">{formatISTDate(ticket.updatedAt)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto tf-table-shell">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Ticket #</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Title</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Category</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Priority</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Status</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Updated</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400 tf-sticky-col">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                        {paginatedTickets.map(ticket => {
                          const CategoryIcon = getCategoryIcon(ticket.category);
                          return (
                            <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-900 dark:text-slate-50">{ticket.ticketNumber}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-900 dark:text-slate-50 max-w-md truncate">{ticket.title}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 min-w-0">
                                  <CategoryIcon className="w-4 h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                                  <span className="text-sm text-gray-600 dark:text-slate-400 truncate">{getCategoryLabel(ticket.category)}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {getPriorityBadge(ticket.priority)}
                              </td>
                              <td className="px-6 py-4">
                                {getStatusBadge(ticket.status)}
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-600 dark:text-slate-400">{formatISTDate(ticket.updatedAt)}</span>
                              </td>
                              <td className="px-6 py-4 tf-sticky-col">
                                <button
                                  onClick={() => {
                                    setSelectedTicket(ticket);
                                    fetchTicketDetail(ticket.id);
                                    setView('detail');
                                  }}
                                  className="text-sm font-medium text-brand-blue hover:text-brand-blue/80"
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
                    <EmptyState
                      icon={Ticket}
                      title="No tickets found"
                      description="Try adjusting your search or filters to find what you're looking for."
                    />
                  )}
                </>
              )}
            </div>

            {/* Pagination — My Support Tickets */}
            {!loading && filteredTickets.length > 0 && (
              <ListPagination
                currentPage={myCurrentPage}
                itemsPerPage={myItemsPerPage}
                totalItems={filteredTickets.length}
                onPageChange={setMyCurrentPage}
                onItemsPerPageChange={setMyItemsPerPage}
                itemLabel="tickets"
              />
            )}
          </div>
        )}

        {/* Ticket Detail View */}
        {activeTab === 'external' && view === 'detail' && selectedTicket && (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setView('tickets')}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Back to All Tickets
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                {/* Ticket Header */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="min-w-0">
                      <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 block mb-1 sm:mb-2">{selectedTicket.ticketNumber}</span>
                      <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2 sm:mb-3">{selectedTicket.title}</h2>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {getStatusBadge(selectedTicket.status)}
                        {getPriorityBadge(selectedTicket.priority)}
                        <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">
                          {getCategoryLabel(selectedTicket.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conversation */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-4 sm:mb-6">Conversation</h3>

                  <div className="space-y-4 sm:space-y-6">
                    {selectedTicket.responses?.map((response) => (
                      <div
                        key={response.id}
                        className={`${
                          response.from === 'user'
                            ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700/60'
                            : 'bg-brand-blue/5 border-brand-blue/20'
                        } border rounded-lg p-3 sm:p-4 md:p-5`}
                      >
                        <div className="flex items-start gap-2.5 sm:gap-4 mb-2 sm:mb-3">
                          {response.from === 'user' ? (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700 dark:bg-slate-600 rounded-full flex items-center justify-center text-white text-xs sm:text-sm flex-shrink-0">
                              U
                            </div>
                          ) : (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue rounded-full flex items-center justify-center text-white text-xs sm:text-sm flex-shrink-0">
                              S
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 truncate">
                                {response.from === 'user' ? 'You' : response.agentName || 'Support Team'}
                              </span>
                              <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap flex-shrink-0">{formatISTDate(response.timestamp)}</span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300 leading-relaxed">{response.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box */}
                  {selectedTicket.status !== 'closed' && (
                    <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-100 dark:border-slate-700/60">
                      <Label className="mb-1.5">Add Reply</Label>
                      <Textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your message..."
                        rows={3}
                      />
                      <div className="flex justify-end mt-2 sm:mt-3">
                        <Button
                          variant="primary"
                          onClick={handleSendReply}
                          disabled={!replyMessage.trim()}
                          icon={<MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                        >
                          Send Reply
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4 sm:space-y-6">
                {/* Ticket Info */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Ticket Information</h4>

                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1">Created</div>
                      <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">{formatIST(selectedTicket.createdAt)}</div>
                    </div>

                    <div>
                      <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1">Last Updated</div>
                      <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">{formatIST(selectedTicket.updatedAt)}</div>
                    </div>

                    {selectedTicket.assignedAgent && (
                      <div>
                        <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1">Assigned Agent</div>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-brand-blue rounded-full flex items-center justify-center text-white text-2xs sm:text-xs flex-shrink-0">
                            {selectedTicket.assignedAgent.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 truncate">{selectedTicket.assignedAgent}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1">Responses</div>
                      <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">{selectedTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Update Priority */}
                {selectedTicket.status !== 'closed' && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                    <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Update Priority</h4>
                    <select
                      value={selectedTicket.priority}
                      onChange={(e) => handleUpdateTicket({ priority: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    >
                      {priorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Actions */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Actions</h4>

                  <div className="space-y-2">
                    <button className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2">
                      <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                      Download Transcript
                    </button>

                    {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && (
                      <button
                        onClick={handleReopenTicket}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2"
                      >
                        <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        Reopen Ticket
                      </button>
                    )}

                    {selectedTicket.status !== 'closed' && (
                      <button
                        onClick={handleCloseTicket}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-destructive-subtle text-destructive rounded-lg hover:bg-destructive-subtle transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2"
                      >
                        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        Close Ticket
                      </button>
                    )}
                  </div>
                </div>

                {/* Related Articles */}
                <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Related Help Articles</h4>

                  <div className="space-y-2">
                    <a href="#" className="block text-xs sm:text-sm text-brand-blue hover:text-brand-blue/80">
                      How to upload resumes
                    </a>
                    <a href="#" className="block text-xs sm:text-sm text-brand-blue hover:text-brand-blue/80">
                      Resume upload troubleshooting
                    </a>
                    <a href="#" className="block text-xs sm:text-sm text-brand-blue hover:text-brand-blue/80">
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
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-4 sm:p-6 md:p-8">
              <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-4 sm:mb-6">Knowledge Base</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                {categories.slice(0, 6).map(cat => {
                  const Icon = cat.icon;
                  return (
                    <a
                      key={cat.value}
                      href="#"
                      className="p-3 sm:p-4 md:p-6 border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 rounded-lg hover:border-brand-blue/30 hover:shadow-md transition-all"
                    >
                      <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue mb-2 sm:mb-3" />
                      <h4 className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-1 sm:mb-2">{cat.label}</h4>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">View articles and guides</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">Open</span>
                  <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{internalOpenTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Awaiting action</div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">In Progress</span>
                  <Clock3 className="w-4 h-4 sm:w-5 sm:h-5 text-warning flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{internalInProgressTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Being handled</div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">Resolved</span>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-success flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{internalResolvedTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Successfully resolved</div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">Unassigned</span>
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-brand-orange flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{internalUnassignedTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">Need assignment</div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-2xs sm:text-xs md:text-sm text-gray-600 dark:text-slate-400">Total</span>
                  <Ticket className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                </div>
                <div className="text-lg sm:text-2xl md:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">{internalTotalTickets}</div>
                <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">All time</div>
              </div>
            </div>

            {/* Category Breakdown */}
            {internalStats?.tickets_by_category && Object.keys(internalStats.tickets_by_category).length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Tickets by Category</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
                  {Object.entries(internalStats.tickets_by_category).map(([cat, count]) => {
                    const CategoryIcon = getInternalCategoryIcon(cat);
                    return (
                      <div key={cat} className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                        <CategoryIcon className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50">{count}</div>
                          <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 truncate">{getInternalCategoryLabel(cat)}</div>
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
                className="bg-brand-orange/5 ring-1 ring-brand-orange/15 border border-brand-orange/10 rounded-xl shadow-sm shadow-brand-orange/5 p-4 sm:p-6 text-left hover:ring-brand-orange/30 hover:shadow-md transition-all"
              >
                <Users className="w-6 h-6 sm:w-8 sm:h-8 text-brand-orange mb-2 sm:mb-3" />
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">Unassigned Tickets</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  {internalUnassignedTickets} tickets need attention
                </p>
              </button>

              <button
                onClick={() => { setInternalFilterAssignment('mine'); setView('tickets'); }}
                className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6 text-left hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <UserCheck className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue mb-2 sm:mb-3" />
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">My Assigned Tickets</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  View tickets assigned to you
                </p>
              </button>

              <button
                onClick={() => { setInternalFilterAssignment('all'); setView('tickets'); }}
                className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6 text-left hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <Ticket className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue mb-2 sm:mb-3" />
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">All Team Tickets</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  View all team support requests
                </p>
              </button>
            </div>

            {/* Recent Team Tickets */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Recent Team Tickets</h3>
                <button
                  onClick={() => setView('tickets')}
                  className="text-xs sm:text-sm font-medium text-brand-blue hover:text-brand-blue/80"
                >
                  View All
                </button>
              </div>

              {internalLoading ? (
                <div className="flex items-center justify-center py-8 sm:py-12 tf-loader-center">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-brand-blue" />
                </div>
              ) : internalTickets.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <Inbox className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-gray-400 dark:text-slate-500" />
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">No team tickets yet</p>
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
                      className="w-full text-left p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors border border-gray-200 dark:border-slate-700/60"
                    >
                      <div className="flex items-start justify-between mb-1.5 sm:mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1 flex-wrap">
                            <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">{ticket.ticket_number}</span>
                            <span className="text-2xs sm:text-xs text-gray-400 dark:text-slate-500 hidden sm:inline">-</span>
                            <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 truncate">from {ticket.created_by?.name}</span>
                          </div>
                          <h4 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{ticket.title}</h4>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          {!ticket.assigned_to && (
                            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-warning-subtle text-warning-strong text-2xs sm:text-xs rounded border border-warning-line">
                              Unassigned
                            </span>
                          )}
                          {getInternalStatusBadge(ticket.status)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 text-2xs sm:text-xs text-gray-600 dark:text-slate-400 flex-wrap">
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
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </button>

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              {/* Filters */}
              <div className="p-3 sm:p-4 md:p-6 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue/60 z-10" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by ticket, title, or user..."
                      className="pl-9 pr-4 w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
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
                      className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    >
                      <option value="all">All Tickets</option>
                      <option value="mine">Assigned to Me</option>
                      <option value="unassigned">Unassigned</option>
                    </select>

                    <select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                      className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10 col-span-2 sm:col-span-1"
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
                <div className="flex items-center justify-center py-8 sm:py-12 tf-loader-center">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-brand-blue" />
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700/60">
                    {paginatedInternalTickets.map(ticket => {
                      const CategoryIcon = getInternalCategoryIcon(ticket.category);
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => {
                            setSelectedInternalTicket(ticket);
                            fetchInternalTicketDetail(ticket.id);
                            setView('detail');
                          }}
                          className="w-full text-left p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">{ticket.ticket_number}</span>
                                <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 truncate">from {ticket.created_by?.name}</span>
                              </div>
                              <h4 className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 font-medium truncate">{ticket.title}</h4>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {getInternalStatusBadge(ticket.status)}
                              {!ticket.assigned_to && (
                                <span className="px-1.5 py-0.5 bg-warning-subtle text-warning-strong text-2xs rounded border border-warning-line">
                                  Unassigned
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-1.5">
                            <div className="flex items-center gap-1 min-w-0">
                              <CategoryIcon className="w-3 h-3 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                              <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 truncate">{getInternalCategoryLabel(ticket.category)}</span>
                            </div>
                            {getInternalPriorityBadge(ticket.priority)}
                            <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">{formatISTDate(ticket.updated_at)}</span>
                            {ticket.assigned_to && (
                              <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 truncate max-w-[80px]">{ticket.assigned_to.name}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto tf-table-shell">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Ticket #</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Title</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">From</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Category</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Priority</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Status</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Assigned</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400">Updated</th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-600 dark:text-slate-400 tf-sticky-col">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                        {paginatedInternalTickets.map(ticket => {
                          const CategoryIcon = getInternalCategoryIcon(ticket.category);
                          return (
                            <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <td className="px-6 py-4">
                                <span className="text-sm font-medium text-gray-900 dark:text-slate-50">{ticket.ticket_number}</span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-900 dark:text-slate-50 max-w-xs truncate">{ticket.title}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center text-xs font-medium text-brand-blue flex-shrink-0">
                                    {ticket.created_by?.name?.charAt(0) || 'U'}
                                  </div>
                                  <span className="text-sm text-gray-600 dark:text-slate-400 truncate">{ticket.created_by?.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 min-w-0">
                                  <CategoryIcon className="w-4 h-4 text-gray-600 dark:text-slate-400 flex-shrink-0" />
                                  <span className="text-sm text-gray-600 dark:text-slate-400 truncate">{getInternalCategoryLabel(ticket.category)}</span>
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
                                  <span className="text-sm text-gray-600 dark:text-slate-400">{ticket.assigned_to.name}</span>
                                ) : (
                                  <span className="text-xs text-warning-strong bg-warning-subtle px-2 py-1 rounded">Unassigned</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-600 dark:text-slate-400">{formatISTDate(ticket.updated_at)}</span>
                              </td>
                              <td className="px-6 py-4 tf-sticky-col">
                                <button
                                  onClick={() => {
                                    setSelectedInternalTicket(ticket);
                                    fetchInternalTicketDetail(ticket.id);
                                    setView('detail');
                                  }}
                                  className="text-sm font-medium text-brand-blue hover:text-brand-blue/80"
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
                      <Inbox className="w-10 h-10 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-400 dark:text-slate-500" />
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">No tickets found</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Pagination — Team Support Tickets */}
            {!internalLoading && filteredInternalTickets.length > 0 && (
              <ListPagination
                currentPage={teamCurrentPage}
                itemsPerPage={teamItemsPerPage}
                totalItems={filteredInternalTickets.length}
                onPageChange={setTeamCurrentPage}
                onItemsPerPageChange={setTeamItemsPerPage}
                itemLabel="tickets"
              />
            )}
          </div>
        )}

        {/* Team Ticket Detail View */}
        {activeTab === 'team' && isAdmin && view === 'detail' && selectedInternalTicket && (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setView('tickets')}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue mb-4 sm:mb-6"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Back to Tickets
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                {/* Ticket Header */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="min-w-0">
                      <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 block mb-1 sm:mb-2">{selectedInternalTicket.ticket_number}</span>
                      <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2 sm:mb-3">{selectedInternalTicket.title}</h2>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {getInternalStatusBadge(selectedInternalTicket.status)}
                        {getInternalPriorityBadge(selectedInternalTicket.priority)}
                        <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400">
                          {getInternalCategoryLabel(selectedInternalTicket.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 sm:pt-4 border-t border-gray-100 dark:border-slate-700/60">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400 flex-wrap">
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0" />
                      <span>Submitted by <strong className="text-gray-900 dark:text-slate-100">{selectedInternalTicket.created_by?.name}</strong></span>
                      {selectedInternalTicket.created_by?.email && (
                        <span className="text-gray-500 dark:text-slate-500 truncate text-2xs sm:text-xs">({selectedInternalTicket.created_by.email})</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conversation */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-4 sm:mb-6">Conversation</h3>

                  <div className="space-y-4 sm:space-y-6">
                    {selectedInternalTicket.responses?.map((response) => (
                      <div
                        key={response.id}
                        className={`${
                          response.user_role === 'admin'
                            ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700/60'
                            : 'bg-brand-blue/5 border-brand-blue/20'
                        } border rounded-lg p-3 sm:p-4 md:p-5`}
                      >
                        <div className="flex items-start gap-2.5 sm:gap-4 mb-2 sm:mb-3">
                          {response.user_role === 'admin' ? (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700 dark:bg-slate-600 rounded-full flex items-center justify-center text-white flex-shrink-0 text-xs sm:text-sm font-medium">
                              A
                            </div>
                          ) : (
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue rounded-full flex items-center justify-center text-white flex-shrink-0 text-xs sm:text-sm font-medium">
                              {response.user_name?.charAt(0) || 'U'}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 truncate">
                                {response.user_role === 'admin' ? `${response.user_name} (Admin)` : response.user_name}
                              </span>
                              <span className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap flex-shrink-0">{formatISTDate(response.created_at)}</span>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{response.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box */}
                  {selectedInternalTicket.status !== 'closed' && (
                    <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-100 dark:border-slate-700/60">
                      <Label className="mb-1.5">Reply to User</Label>
                      <Textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Type your response..."
                        rows={3}
                      />
                      <div className="flex justify-end mt-2 sm:mt-3">
                        <Button
                          variant="primary"
                          onClick={handleSendInternalReply}
                          disabled={!replyMessage.trim()}
                          icon={<MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                        >
                          Send Reply
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4 sm:space-y-6">
                {/* Ticket Info */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Ticket Information</h4>

                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1">Created</div>
                      <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">{formatIST(selectedInternalTicket.created_at)}</div>
                    </div>

                    <div>
                      <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1">Last Updated</div>
                      <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">{formatIST(selectedInternalTicket.updated_at)}</div>
                    </div>

                    <div>
                      <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1">Assigned To</div>
                      {selectedInternalTicket.assigned_to ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-brand-blue rounded-full flex items-center justify-center text-white text-2xs sm:text-xs flex-shrink-0">
                            {selectedInternalTicket.assigned_to.name.charAt(0)}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 truncate">{selectedInternalTicket.assigned_to.name}</div>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm text-warning-strong">Not assigned</span>
                      )}
                    </div>

                    <div>
                      <div className="text-2xs sm:text-xs text-gray-600 dark:text-slate-400 mb-0.5 sm:mb-1">Responses</div>
                      <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">{selectedInternalTicket.responses?.length || 0} messages</div>
                    </div>
                  </div>
                </div>

                {/* Update Priority */}
                {selectedInternalTicket.status !== 'closed' && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                    <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Update Priority</h4>
                    <select
                      value={selectedInternalTicket.priority}
                      onChange={(e) => handleUpdateInternalPriority(selectedInternalTicket.id, e.target.value as InternalTicketPriority)}
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    >
                      {internalPriorities.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Actions */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3 sm:mb-4">Actions</h4>

                  <div className="space-y-2">
                    {!selectedInternalTicket.assigned_to && selectedInternalTicket.status !== 'closed' && (
                      <button
                        onClick={() => handleAssignInternalTicket(selectedInternalTicket.id)}
                        disabled={internalActionLoading === selectedInternalTicket.id}
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-brand-blue text-white rounded-lg ring-1 ring-white/10 shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2 disabled:bg-gray-400"
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
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-success text-white rounded-lg hover:bg-success transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2 disabled:bg-success/60"
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
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2 disabled:bg-gray-50"
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
                        className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-destructive-subtle text-destructive rounded-lg hover:bg-destructive-subtle transition-colors text-xs sm:text-sm text-left flex items-center gap-1.5 sm:gap-2 disabled:bg-destructive-subtle"
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
