/**
 * Chat Service
 * Handles chat API calls and WebSocket connections
 */

import api, { getTokens } from './api';

export type ChatConnectionStatus = 'connecting' | 'open' | 'closed';

// Types
export interface ChannelMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  is_online: boolean;
  joined_at: string;
}

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  type: 'channel' | 'direct';
  is_private: boolean;
  created_by: string;
  created_by_name: string | null;
  member_count: number;
  unread_count: number;
  last_message: string | null;
  last_message_by: string | null;
  last_message_at: string | null;
  members: ChannelMember[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[];
  user_ids: string[];
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  user_name: string;
  user_initials: string;
  content: string;
  message_type: string;
  reply_to_id: string | null;
  reply_to_preview: string | null;
  is_pinned: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  reactions: Reaction[];
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelListResponse {
  channels: Channel[];
  direct_messages: Channel[];
  total_unread: number;
}

export interface MessageListResponse {
  messages: Message[];
  has_more: boolean;
  total: number;
}

export interface CreateChannelRequest {
  name: string;
  description?: string;
  type?: 'channel' | 'direct';
  is_private?: boolean;
  member_ids?: string[];
}

export interface CreateMessageRequest {
  content: string;
  message_type?: string;
  reply_to_id?: string;
  metadata?: Record<string, any>;
}

export interface ChatPermissions {
  can_create_channel: boolean;
  role: string;
}

class ChatService {
  private ws: WebSocket | null = null;
  private messageHandlers: ((data: any) => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private statusHandlers: ((status: ChatConnectionStatus) => void)[] = [];
  private currentChannelId: string | null = null;
  private currentToken: string | null = null;

  /**
   * Get chat permissions for current user
   */
  async getPermissions(): Promise<ChatPermissions> {
    try {
      const response = await api.get('/chat/permissions');
      return response.data;
    } catch (error) {
      console.error('Error getting chat permissions:', error);
      return { can_create_channel: false, role: 'unknown' };
    }
  }

  /**
   * List all channels for the current user
   */
  async listChannels(): Promise<ChannelListResponse> {
    try {
      const response = await api.get('/chat/channels');
      return response.data;
    } catch (error) {
      console.error('Error listing channels:', error);
      throw error;
    }
  }

  /**
   * Get a specific channel
   */
  async getChannel(channelId: string): Promise<Channel> {
    try {
      const response = await api.get(`/chat/channels/${channelId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting channel:', error);
      throw error;
    }
  }

  /**
   * Create a new channel
   */
  async createChannel(request: CreateChannelRequest): Promise<Channel> {
    try {
      const response = await api.post('/chat/channels', request);
      return response.data;
    } catch (error) {
      console.error('Error creating channel:', error);
      throw error;
    }
  }

  /**
   * Update a channel
   */
  async updateChannel(channelId: string, data: Partial<CreateChannelRequest>): Promise<Channel> {
    try {
      const response = await api.put(`/chat/channels/${channelId}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating channel:', error);
      throw error;
    }
  }

  /**
   * Delete a channel
   */
  async deleteChannel(channelId: string): Promise<void> {
    try {
      await api.delete(`/chat/channels/${channelId}`);
    } catch (error) {
      console.error('Error deleting channel:', error);
      throw error;
    }
  }

  /**
   * Join a public channel
   */
  async joinChannel(channelId: string): Promise<void> {
    try {
      await api.post(`/chat/channels/${channelId}/join`);
    } catch (error) {
      console.error('Error joining channel:', error);
      throw error;
    }
  }

  /**
   * Leave a channel
   */
  async leaveChannel(channelId: string): Promise<void> {
    try {
      await api.post(`/chat/channels/${channelId}/leave`);
    } catch (error) {
      console.error('Error leaving channel:', error);
      throw error;
    }
  }

  /**
   * List messages in a channel
   */
  async listMessages(channelId: string, limit: number = 50, before?: string): Promise<MessageListResponse> {
    try {
      const params: any = { limit };
      if (before) params.before = before;
      const response = await api.get(`/chat/channels/${channelId}/messages`, { params });
      return response.data;
    } catch (error) {
      console.error('Error listing messages:', error);
      throw error;
    }
  }

  /**
   * Send a message
   */
  async sendMessage(channelId: string, request: CreateMessageRequest): Promise<Message> {
    try {
      const response = await api.post(`/chat/channels/${channelId}/messages`, request);
      return response.data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Upload an image attachment to a channel (delivered as a 'file' message).
   * Images only — the backend re-validates MIME type/extension/size regardless
   * of what the browser reports.
   */
  async uploadAttachment(channelId: string, file: File): Promise<Message> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post(`/chat/channels/${channelId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      console.error('Error uploading attachment:', error);
      throw error;
    }
  }

  /**
   * Update a message
   */
  async updateMessage(messageId: string, content: string): Promise<Message> {
    try {
      const response = await api.put(`/chat/messages/${messageId}`, { content });
      return response.data;
    } catch (error) {
      console.error('Error updating message:', error);
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      await api.delete(`/chat/messages/${messageId}`);
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Pin a message
   */
  async pinMessage(messageId: string): Promise<Message> {
    try {
      const response = await api.post(`/chat/messages/${messageId}/pin`);
      return response.data;
    } catch (error) {
      console.error('Error pinning message:', error);
      throw error;
    }
  }

  /**
   * Unpin a message
   */
  async unpinMessage(messageId: string): Promise<Message> {
    try {
      const response = await api.delete(`/chat/messages/${messageId}/pin`);
      return response.data;
    } catch (error) {
      console.error('Error unpinning message:', error);
      throw error;
    }
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(messageId: string, emoji: string): Promise<void> {
    try {
      await api.post(`/chat/messages/${messageId}/reactions`, { emoji });
    } catch (error) {
      console.error('Error adding reaction:', error);
      throw error;
    }
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(messageId: string, emoji: string): Promise<void> {
    try {
      await api.delete(`/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
    } catch (error) {
      console.error('Error removing reaction:', error);
      throw error;
    }
  }

  /**
   * Add members to a channel
   */
  async addMembers(channelId: string, userIds: string[]): Promise<void> {
    try {
      await api.post(`/chat/channels/${channelId}/members`, { user_ids: userIds });
    } catch (error) {
      console.error('Error adding members:', error);
      throw error;
    }
  }

  /**
   * Remove a member from a channel
   */
  async removeMember(channelId: string, userId: string): Promise<void> {
    try {
      await api.delete(`/chat/channels/${channelId}/members/${userId}`);
    } catch (error) {
      console.error('Error removing member:', error);
      throw error;
    }
  }

  /**
   * Mark channel as read
   */
  async markAsRead(channelId: string): Promise<void> {
    try {
      await api.post(`/chat/channels/${channelId}/read`);
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket(channelId: string, token: string): void {
    // Clear any pending reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Detach first: the old socket's onclose must not schedule a reconnect
      // that would overwrite the new one (and leak a second live socket).
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.close(1000, 'Switching channel');
      this.ws = null;
    }

    this.currentChannelId = channelId;
    this.currentToken = token;
    this.reconnectAttempts = 0;

    this._connect(channelId, token);
  }

  private setStatus(status: ChatConnectionStatus): void {
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private _connect(channelId: string, initialToken: string): void {
    // Always use the CURRENT access token — it is refreshed in the background,
    // and reconnecting with the one captured at first connect gets rejected
    // once it expires.
    const token = getTokens().accessToken || initialToken;
    // Auto-detect WebSocket protocol based on page protocol
    const getWsBaseUrl = () => {
      if (process.env.NEXT_PUBLIC_WS_URL) {
        return process.env.NEXT_PUBLIC_WS_URL;
      }
      // Use wss:// for https://, ws:// for http://
      if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//localhost:8001`;
      }
      return 'ws://localhost:8001';
    };

    const wsUrl = `${getWsBaseUrl()}/api/v1/chat/ws/${channelId}?token=${token}`;
    const socket = new WebSocket(wsUrl);
    this.ws = socket;
    this.setStatus('connecting');

    socket.onopen = () => {
      if (this.ws !== socket) return;
      console.log('[ChatService] WebSocket connected to channel', channelId);
      this.reconnectAttempts = 0;
      this.setStatus('open');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.messageHandlers.forEach(handler => handler(data));
      } catch (error) {
        console.error('[ChatService] Error parsing WebSocket message:', error);
      }
    };

    socket.onclose = (event) => {
      // A socket we already replaced — ignore it.
      if (this.ws !== socket) return;
      console.log('[ChatService] WebSocket disconnected', event.code);
      this.ws = null;
      this.setStatus('closed');
      // Keep reconnecting while this channel is still open in the UI — idle
      // connections get dropped by proxies, and giving up after a few tries
      // left the chat silently stale until a page refresh. Backoff caps at 30s.
      if (event.code !== 1000 && this.currentChannelId === channelId) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`[ChatService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempts++;
          this._connect(channelId, initialToken);
        }, delay);
      }
    };

    socket.onerror = (error) => {
      console.error('[ChatService] WebSocket error:', error);
    };
  }

  /**
   * Register a handler for connection status changes ('connecting' | 'open' |
   * 'closed'). Lets the page catch up on anything missed while disconnected.
   */
  onStatus(handler: (status: ChatConnectionStatus) => void): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    this.currentChannelId = null;
    this.currentToken = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.onclose = null;
      socket.onmessage = null;
      socket.close(1000, 'Client disconnect');
    }
  }

  /**
   * Register a handler for WebSocket messages
   */
  onMessage(handler: (data: any) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Send typing indicator
   */
  sendTyping(isTyping: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'typing', is_typing: isTyping }));
    }
  }
}

const chatService = new ChatService();
export default chatService;
