/**
 * Internal Support Ticket Service
 *
 * Handles API calls for internal tickets (users -> tenant_admin)
 */
import api from './api';

const API_BASE = '/internal-tickets';

// Types
export interface UserInfo {
  id: string;
  name: string;
  email?: string;
}

export interface InternalTicketResponseItem {
  id: string;
  user_id: string;
  user_name?: string;
  user_role: 'user' | 'admin';
  message: string;
  created_at: string;
}

export interface InternalTicket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  category: InternalTicketCategory;
  priority: InternalTicketPriority;
  status: InternalTicketStatus;
  created_by: UserInfo;
  assigned_to?: UserInfo;
  created_at: string;
  updated_at: string;
  responses: InternalTicketResponseItem[];
}

export type InternalTicketCategory =
  | 'account-access'
  | 'permission-request'
  | 'feature-question'
  | 'bug-report'
  | 'general-inquiry'
  | 'other';

export type InternalTicketPriority = 'low' | 'medium' | 'high';

export type InternalTicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

export interface InternalTicketListResponse {
  items: InternalTicket[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface InternalTicketStats {
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  total_tickets: number;
}

export interface InternalTicketAdminStats extends InternalTicketStats {
  unassigned_tickets: number;
  tickets_by_category: Record<string, number>;
}

export interface CreateInternalTicketRequest {
  title: string;
  description: string;
  category?: InternalTicketCategory;
  priority?: InternalTicketPriority;
}

export interface UpdateInternalTicketRequest {
  title?: string;
  description?: string;
  category?: InternalTicketCategory;
  priority?: InternalTicketPriority;
  status?: InternalTicketStatus;
}

export interface CreateInternalTicketResponseRequest {
  message: string;
}

export interface InternalTicketFilterParams {
  status?: InternalTicketStatus | 'all';
  priority?: InternalTicketPriority | 'all';
  category?: InternalTicketCategory | 'all';
  search?: string;
  created_by_id?: string;
  assigned_to_me?: boolean;
  unassigned?: boolean;
  /** Server-side order: newest (created), updated (default), or priority (high first). */
  sort?: 'newest' | 'updated' | 'priority';
  page?: number;
  page_size?: number;
}

// Helper to trigger notification refresh for the other party
function triggerNotificationRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notificationTrigger'));
  }
}

// Helper to build query string
function buildQueryString(params: InternalTicketFilterParams): string {
  const queryParams = new URLSearchParams();

  if (params.status && params.status !== 'all') {
    queryParams.append('status', params.status);
  }
  if (params.priority && params.priority !== 'all') {
    queryParams.append('priority', params.priority);
  }
  if (params.category && params.category !== 'all') {
    queryParams.append('category', params.category);
  }
  if (params.search) {
    queryParams.append('search', params.search);
  }
  if (params.created_by_id) {
    queryParams.append('created_by_id', params.created_by_id);
  }
  if (params.assigned_to_me !== undefined) {
    queryParams.append('assigned_to_me', String(params.assigned_to_me));
  }
  if (params.unassigned !== undefined) {
    queryParams.append('unassigned', String(params.unassigned));
  }
  if (params.sort) {
    queryParams.append('sort', params.sort);
  }
  if (params.page) {
    queryParams.append('page', String(params.page));
  }
  if (params.page_size) {
    queryParams.append('page_size', String(params.page_size));
  }

  const qs = queryParams.toString();
  return qs ? `?${qs}` : '';
}

export const internalTicketService = {
  // ==========================================================================
  // USER ENDPOINTS (for all users - non-admin see only their own tickets)
  // ==========================================================================

  /**
   * List tickets (users see their own, admin sees all)
   */
  async listTickets(params: InternalTicketFilterParams = {}): Promise<InternalTicketListResponse> {
    const response = await api.get<InternalTicketListResponse>(`${API_BASE}${buildQueryString(params)}`);
    return response.data;
  },

  /**
   * Get ticket statistics
   */
  async getStats(): Promise<InternalTicketStats> {
    const response = await api.get<InternalTicketStats>(`${API_BASE}/stats`);
    return response.data;
  },

  /**
   * Get a specific ticket by ID
   */
  async getTicket(ticketId: string): Promise<InternalTicket> {
    const response = await api.get<InternalTicket>(`${API_BASE}/${ticketId}`);
    return response.data;
  },

  /**
   * Create a new internal ticket (non-admin users only)
   */
  async createTicket(data: CreateInternalTicketRequest): Promise<InternalTicket> {
    const response = await api.post<InternalTicket>(API_BASE, data);
    triggerNotificationRefresh(); // Trigger for admin to see new ticket
    return response.data;
  },

  /**
   * Update a ticket
   */
  async updateTicket(ticketId: string, data: UpdateInternalTicketRequest): Promise<InternalTicket> {
    const response = await api.put<InternalTicket>(`${API_BASE}/${ticketId}`, data);
    return response.data;
  },

  /**
   * Add a response to a ticket
   */
  async addResponse(ticketId: string, data: CreateInternalTicketResponseRequest): Promise<InternalTicket> {
    const response = await api.post<InternalTicket>(`${API_BASE}/${ticketId}/responses`, data);
    triggerNotificationRefresh(); // Trigger for other party to see response
    return response.data;
  },

  // ==========================================================================
  // ADMIN ENDPOINTS (for tenant_admin only)
  // ==========================================================================

  /**
   * [ADMIN] List all team tickets with advanced filters
   */
  async adminListAllTickets(params: InternalTicketFilterParams = {}): Promise<InternalTicketListResponse> {
    const response = await api.get<InternalTicketListResponse>(`${API_BASE}/admin/all${buildQueryString(params)}`);
    return response.data;
  },

  /**
   * [ADMIN] Get comprehensive ticket statistics
   */
  async adminGetStats(): Promise<InternalTicketAdminStats> {
    const response = await api.get<InternalTicketAdminStats>(`${API_BASE}/admin/stats`);
    return response.data;
  },

  /**
   * [ADMIN] Assign ticket to self
   */
  async assignTicket(ticketId: string): Promise<InternalTicket> {
    const response = await api.post<InternalTicket>(`${API_BASE}/${ticketId}/assign`);
    triggerNotificationRefresh(); // Trigger for user to see assignment
    return response.data;
  },

  /**
   * [ADMIN] Close a ticket
   */
  async closeTicket(ticketId: string): Promise<InternalTicket> {
    const response = await api.post<InternalTicket>(`${API_BASE}/${ticketId}/close`);
    triggerNotificationRefresh(); // Trigger for user to see ticket closed
    return response.data;
  },

  /**
   * [ADMIN] Resolve a ticket
   */
  async resolveTicket(ticketId: string): Promise<InternalTicket> {
    const response = await api.post<InternalTicket>(`${API_BASE}/${ticketId}/resolve`);
    triggerNotificationRefresh(); // Trigger for user to see ticket resolved
    return response.data;
  },

  /**
   * [ADMIN] Reopen a ticket
   */
  async reopenTicket(ticketId: string): Promise<InternalTicket> {
    const response = await api.post<InternalTicket>(`${API_BASE}/${ticketId}/reopen`);
    triggerNotificationRefresh(); // Trigger for user to see ticket reopened
    return response.data;
  },
};

export default internalTicketService;
