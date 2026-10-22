'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import OrganizationTabs from '@/components/organization/OrganizationTabs';
import { useState, useRef, useEffect, Fragment } from 'react';
import {
  Search,
  Hash,
  Users,
  Send,
  Smile,
  Paperclip,
  MoreVertical,
  Plus,
  MessageCircle,
  Bell,
  BellOff,
  Pin,
  Loader2,
  Lock,
  Globe,
  ArrowUpRight,
  LogOut,
  Trash2,
  ChevronLeft,
  X,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import chatService, {
  ChatConnectionStatus,
  Channel,
  Message,
} from '@/lib/services/chatService';
import { getTokens } from '@/lib/services/api';
import userService, { ApiUser } from '@/lib/services/userService';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { useSearchParams } from 'next/navigation';
import { formatISTTime, formatISTDate } from '@/lib/utils/dateUtils';
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import AppModal from '@/components/ui/app-modal';
import NameAvatar from '@/components/ui/name-avatar';

const quickEmojis = ['👍', '❤️', '😄', '🎉', '👀', '✅'];


export default function TeamChatPage() {
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();
  const dialog = useGlobalDialog();
  const [activeTab, setActiveTab] = useState<'all' | 'channels' | 'direct'>('all');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [directMessages, setDirectMessages] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showMembersSidebar, setShowMembersSidebar] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<{ can_create_channel: boolean; role: string }>({
    can_create_channel: false,
    role: '',
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<ApiUser[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDescription, setNewChannelDescription] = useState('');
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showNewDMModal, setShowNewDMModal] = useState(false);
  const [isCreatingDM, setIsCreatingDM] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  // Phones show one pane at a time: the conversation list, or the open chat.
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [showComposerEmoji, setShowComposerEmoji] = useState(false);
  const [isRefreshingChat, setIsRefreshingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  // Live-socket state, and the open conversation's id for async callbacks
  // (sockets, timers) that would otherwise read a stale `selectedChannel`.
  const [connectionStatus, setConnectionStatus] = useState<ChatConnectionStatus>('connecting');
  const selectedChannelIdRef = useRef<string | null>(null);
  // Typing indicator: who else is typing in the open conversation (id → name),
  // plus the timers for our own outgoing typing signal.
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingExpiryRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typingSentAtRef = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const removeTypingUser = (userId: string) => {
    clearTimeout(typingExpiryRef.current[userId]);
    delete typingExpiryRef.current[userId];
    setTypingUsers((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  // Our own signal: "typing" at most every 3s while keys are pressed, and
  // "stopped" after 3s idle (or on send / channel switch).
  const stopTyping = () => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = null;
    if (typingSentAtRef.current) {
      chatService.sendTyping(false);
      typingSentAtRef.current = 0;
    }
  };
  const notifyTyping = () => {
    const now = Date.now();
    if (now - typingSentAtRef.current > 3000) {
      chatService.sendTyping(true);
      typingSentAtRef.current = now;
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(stopTyping, 3000);
  };

  // Declared first so it's current before the fetch effects below run.
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id ?? null;
  }, [selectedChannel?.id]);

  useEffect(() => {
    fetchChannels();
    fetchPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel?.id]);

  useEffect(() => {
    if (!selectedChannel) return;

    const { accessToken } = getTokens();
    if (!accessToken) return;

    const channelId = selectedChannel.id;
    // After a drop, the socket reconnects on its own — then catch up on
    // whatever was sent while it was down.
    let wasDisconnected = false;
    const unsubscribeStatus = chatService.onStatus((status) => {
      setConnectionStatus(status);
      if (status === 'closed') wasDisconnected = true;
      if (status === 'open' && wasDisconnected) {
        wasDisconnected = false;
        fetchMessages(channelId, { silent: true });
        refreshChannelsSilently();
      }
    });

    chatService.connectWebSocket(channelId, accessToken);

    const unsubscribe = chatService.onMessage((data: any) => {
      if (!data || !data.type) return;

      switch (data.type) {
        case 'message': {
          if (data.message) {
            // Their message landed — they've stopped typing.
            if (data.message.user_id) removeTypingUser(data.message.user_id);
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.message.id)) return prev;
              return [...prev, data.message];
            });
            const channelId = data.message.channel_id;
            setChannels((prev) =>
              prev.map((ch) =>
                ch.id === channelId
                  ? { ...ch, last_message: data.message.content, last_message_by: data.message.user_name, last_message_at: data.message.created_at }
                  : ch
              )
            );
            setDirectMessages((prev) =>
              prev.map((dm) =>
                dm.id === channelId
                  ? { ...dm, last_message: data.message.content, last_message_by: data.message.user_name, last_message_at: data.message.created_at }
                  : dm
              )
            );
            chatService.markAsRead(selectedChannel.id);
          }
          break;
        }
        case 'message_update': {
          if (data.message) {
            setMessages((prev) => prev.map((m) => (m.id === data.message.id ? data.message : m)));
          }
          break;
        }
        case 'message_deleted': {
          if (data.message_id) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === data.message_id ? { ...m, is_deleted: true, content: '[Message deleted]' } : m
              )
            );
          }
          break;
        }
        case 'reaction_add':
        case 'reaction_remove': {
          fetchMessages(channelId, { silent: true });
          break;
        }
        case 'typing': {
          // Accept the common payload shapes: { user_id, user_name, is_typing }
          // or { user: { id, name }, is_typing }. Missing is_typing = typing.
          const userId: string | undefined = data.user_id ?? data.user?.id;
          if (!userId || userId === currentUser?.id) break;
          if (data.is_typing === false) {
            removeTypingUser(userId);
            break;
          }
          const name: string =
            data.user_name ??
            data.user?.name ??
            selectedChannel.members.find((m) => m.user_id === userId)?.name ??
            'Someone';
          setTypingUsers((prev) => (prev[userId] === name ? prev : { ...prev, [userId]: name }));
          // A lost "stopped" signal must not leave the indicator up forever.
          clearTimeout(typingExpiryRef.current[userId]);
          typingExpiryRef.current[userId] = setTimeout(() => removeTypingUser(userId), 6000);
          break;
        }
      }
    });

    return () => {
      // Leaving this conversation: tell others we stopped, forget who was typing here.
      stopTyping();
      Object.values(typingExpiryRef.current).forEach(clearTimeout);
      typingExpiryRef.current = {};
      setTypingUsers({});
      unsubscribe();
      unsubscribeStatus();
      chatService.disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel?.id]);

  // Keep the conversation list fresh (other channels' unread counts and
  // previews aren't on the open channel's socket), and catch up whenever the
  // tab comes back into view.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshChannelsSilently();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      refreshChannelsSilently();
      const openId = selectedChannelIdRef.current;
      if (openId) fetchMessages(openId, { silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // While the live socket is down, poll the open conversation so new messages
  // still appear (every 10s) until it reconnects.
  useEffect(() => {
    if (connectionStatus === 'open' || !selectedChannel) return;
    const interval = window.setInterval(() => {
      const openId = selectedChannelIdRef.current;
      if (openId && document.visibilityState === 'visible') fetchMessages(openId, { silent: true });
    }, 10000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus, selectedChannel?.id]);

  const fetchPermissions = async () => {
    try {
      const perms = await chatService.getPermissions();
      setPermissions(perms);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  };

  const fetchChannels = async () => {
    try {
      setIsLoading(true);
      const response = await chatService.listChannels();
      setChannels(response.channels);
      setDirectMessages(response.direct_messages);
      setTotalUnread(response.total_unread);

      const channelIdFromUrl = searchParams.get('channel');
      if (channelIdFromUrl) {
        const allChannels = [...response.channels, ...response.direct_messages];
        const targetChannel = allChannels.find((ch) => ch.id === channelIdFromUrl);
        if (targetChannel) {
          setSelectedChannel(targetChannel);
          if (targetChannel.type === 'direct') {
            setActiveTab('direct');
          } else {
            setActiveTab('channels');
          }
          return;
        }
      }

      if (!selectedChannel && response.channels.length > 0) {
        setSelectedChannel(response.channels[0]);
      }
    } catch (error: any) {
      console.error('Error fetching channels:', error);
      if (error.response?.status !== 404) {
        toast.error('Failed to load channels');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load muted-channel preferences (no backend mute endpoint; persisted locally).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chatMutedChannels');
      if (raw) setMutedChannels(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);

  const toggleMute = () => {
    if (!selectedChannel) return;
    setShowHeaderMenu(false);
    setMutedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(selectedChannel.id)) {
        next.delete(selectedChannel.id);
        toast.success('Notifications unmuted');
      } else {
        next.add(selectedChannel.id);
        toast.success('Notifications muted');
      }
      try { localStorage.setItem('chatMutedChannels', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const handleLeaveChannel = async () => {
    if (!selectedChannel) return;
    setShowHeaderMenu(false);
    const ok = await dialog.confirm({
      title: 'Leave channel',
      message: `Leave "${selectedChannel.name}"? You'll need to be re-added to rejoin.`,
      variant: 'warning',
      confirmText: 'Leave',
    });
    if (!ok) return;
    try {
      await chatService.leaveChannel(selectedChannel.id);
      toast.success('Left channel');
      setSelectedChannel(null);
      setMessages([]);
      await fetchChannels();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to leave channel');
    }
  };

  const handleDeleteChannel = async () => {
    if (!selectedChannel) return;
    setShowHeaderMenu(false);
    const ok = await dialog.confirm({
      title: 'Delete Channel',
      message: 'Are you sure you want to delete this channel?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Channel',
      item: { label: 'CHANNEL', name: selectedChannel.name },
      warningNote: 'Deleting this channel will permanently remove it and all its messages.',
    });
    if (!ok) return;
    try {
      await chatService.deleteChannel(selectedChannel.id);
      toast.success('Channel deleted');
      setSelectedChannel(null);
      setMessages([]);
      await fetchChannels();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete channel');
    }
  };

  // `silent`: a background catch-up (reconnect, polling, tab refocus) — no
  // skeleton, no error toast.
  const fetchMessages = async (channelId: string, { silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setIsLoadingMessages(true);
      const response = await chatService.listMessages(channelId);
      // A slow response for a channel the user has already left must not
      // overwrite the open conversation.
      if (selectedChannelIdRef.current !== channelId) return;
      setMessages(response.messages);
      await chatService.markAsRead(channelId);

      setChannels((prev) => {
        const updated = prev.map((ch) => (ch.id === channelId ? { ...ch, unread_count: 0 } : ch));
        setDirectMessages((prevDMs) => {
          const updatedDMs = prevDMs.map((dm) => (dm.id === channelId ? { ...dm, unread_count: 0 } : dm));
          const newTotal = [...updated, ...updatedDMs].reduce((sum, c) => sum + (c.unread_count || 0), 0);
          setTotalUnread(newTotal);
          return updatedDMs;
        });
        return updated;
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      if (!silent) toast.error('Failed to load messages');
    } finally {
      if (!silent) setIsLoadingMessages(false);
    }
  };

  // Background refresh of the conversation list — keeps unread counts and
  // previews of OTHER conversations current (the live socket only covers the
  // open one). No page skeleton.
  const refreshChannelsSilently = async () => {
    try {
      const response = await chatService.listChannels();
      const openId = selectedChannelIdRef.current;
      // The open conversation is being read right now — it has no unread.
      const clearOpen = (list: Channel[]) =>
        list.map((ch) => (ch.id === openId ? { ...ch, unread_count: 0 } : ch));
      const nextChannels = clearOpen(response.channels);
      const nextDMs = clearOpen(response.direct_messages);
      setChannels(nextChannels);
      setDirectMessages(nextDMs);
      setTotalUnread([...nextChannels, ...nextDMs].reduce((sum, c) => sum + (c.unread_count || 0), 0));
      // Fresh member/online info for the open conversation (same id, so no refetch).
      const fresh = [...nextChannels, ...nextDMs].find((ch) => ch.id === openId);
      if (fresh) setSelectedChannel(fresh);
    } catch (error) {
      console.error('Error refreshing channels:', error);
    }
  };

  const fetchAvailableUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const users = await userService.listUsers({ is_active: true });
      setAvailableUsers(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load team members');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel);
    setMobileListOpen(false);
    setShowPinnedPanel(false);
    setShowHeaderMenu(false);
  };

  // Manual refresh of the chat only (open conversation + conversation list) —
  // no page reload. A stopgap while live updates aren't arriving reliably.
  const handleRefreshChat = async () => {
    const openId = selectedChannelIdRef.current;
    if (!openId || isRefreshingChat) return;
    setIsRefreshingChat(true);
    try {
      await Promise.all([fetchMessages(openId, { silent: true }), refreshChannelsSilently()]);
    } finally {
      setIsRefreshingChat(false);
    }
  };

  // Composer emoji picker: insert at the caret, keep focus in the box.
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? messageInput.length;
    const end = el?.selectionEnd ?? messageInput.length;
    setMessageInput(messageInput.slice(0, start) + emoji + messageInput.slice(end));
    setShowComposerEmoji(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedChannel) return;
    stopTyping();

    try {
      const newMessage = await chatService.sendMessage(selectedChannel.id, {
        content: messageInput,
      });
      // Functional + de-duplicated: messages that arrived over the socket while
      // this request was in flight must not be dropped, and the socket may
      // already have delivered this one.
      setMessages((prev) => (prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]));
      setMessageInput('');
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const ALLOWED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

  const handleAttachmentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !selectedChannel) return;

    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      toast.error('Only image files (PNG, JPG, GIF, WebP) can be attached.');
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      toast.error('Image exceeds the 5MB size limit.');
      return;
    }

    setIsUploadingAttachment(true);
    try {
      const newMessage = await chatService.uploadAttachment(selectedChannel.id, file);
      setMessages((prev) => (prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]));
    } catch (error: any) {
      console.error('Error uploading attachment:', error);
      toast.error(error?.response?.data?.detail || 'Failed to upload image');
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleAddReaction = async (messageId: string, emoji: string) => {
    try {
      await chatService.addReaction(messageId, emoji);
      if (selectedChannel) {
        await fetchMessages(selectedChannel.id);
      }
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
    setShowEmojiPicker(null);
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) {
      toast.error('Please enter a channel name');
      return;
    }

    setIsCreating(true);
    try {
      const channel = await chatService.createChannel({
        name: newChannelName.trim().toLowerCase().replace(/\s+/g, '-'),
        description: newChannelDescription.trim() || undefined,
        is_private: newChannelPrivate,
        member_ids: selectedMemberIds,
      });

      toast.success('Channel created successfully');
      setShowCreateModal(false);
      setNewChannelName('');
      setNewChannelDescription('');
      setNewChannelPrivate(false);
      setSelectedMemberIds([]);

      await fetchChannels();
      setSelectedChannel(channel);
    } catch (error: any) {
      console.error('Error creating channel:', error);
      toast.error(error.response?.data?.detail || 'Failed to create channel');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddMembers = async () => {
    if (!selectedChannel || selectedMemberIds.length === 0) return;

    try {
      await chatService.addMembers(selectedChannel.id, selectedMemberIds);
      toast.success('Members added successfully');
      setShowAddMembersModal(false);
      setSelectedMemberIds([]);

      const updatedChannel = await chatService.getChannel(selectedChannel.id);
      setSelectedChannel(updatedChannel);
    } catch (error: any) {
      console.error('Error adding members:', error);
      toast.error(error.response?.data?.detail || 'Failed to add members');
    }
  };

  const openCreateModal = async () => {
    // Locked controls are greyed with a hover tooltip; the click is a no-op.
    if (!permissions.can_create_channel) return;
    await fetchAvailableUsers();
    setShowCreateModal(true);
  };

  const openNewDMModal = async () => {
    await fetchAvailableUsers();
    setShowNewDMModal(true);
  };

  const handleStartDM = async (userId: string, userName: string) => {
    setIsCreatingDM(true);
    try {
      const channel = await chatService.createChannel({
        name: `dm-${Date.now()}`,
        type: 'direct',
        is_private: true,
        member_ids: [userId],
      });

      toast.success(`Started conversation with ${userName}`);
      setShowNewDMModal(false);

      await fetchChannels();
      setSelectedChannel(channel);
    } catch (error: any) {
      console.error('Error creating DM:', error);
      if (error.response?.data?.detail?.includes('already exists')) {
        const existingDM = directMessages.find((dm) => dm.members.some((m) => m.user_id === userId));
        if (existingDM) {
          setSelectedChannel(existingDM);
          setShowNewDMModal(false);
          return;
        }
      }
      toast.error(error.response?.data?.detail || 'Failed to start conversation');
    } finally {
      setIsCreatingDM(false);
    }
  };

  const toggleMemberSelection = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const filteredChannels = channels.filter((channel) =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDMs = directMessages.filter((dm) =>
    dm.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onlineMembersCount = selectedChannel?.members?.filter((m) => m.is_online).length || 0;
  const isMuted = selectedChannel ? mutedChannels.has(selectedChannel.id) : false;
  const pinnedMessages = messages.filter((m) => m.is_pinned && !m.is_deleted);

  // Composer grows with its text, up to ~5 lines, then scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [messageInput, selectedChannel?.id]);

  if (isLoading) {
    return <PageSkeleton variant="cards" showStats={false} />;
  }

  const todayLabel = formatISTDate(new Date().toISOString());
  const lastMessageLabel = (iso: string | null) => {
    if (!iso) return '';
    return formatISTDate(iso) === todayLabel ? formatISTTime(iso) : formatISTDate(iso);
  };
  // The other person in a DM (falls back to the first member).
  const dmPartner = (c: Channel) => c.members.find((m) => m.user_id !== currentUser?.id) ?? c.members[0];
  // Phones show one pane: the list until a conversation is open, then the chat.
  const showListOnMobile = !selectedChannel || mobileListOpen;
  const partner = selectedChannel?.type === 'direct' ? dmPartner(selectedChannel) : null;
  const sortedMembers = [...(selectedChannel?.members ?? [])].sort(
    (a, b) => Number(b.is_online) - Number(a.is_online) || a.name.localeCompare(b.name),
  );
  const tabIndex = activeTab === 'all' ? 0 : activeTab === 'channels' ? 1 : 2;
  const typingNames = Object.values(typingUsers);

  const iconButtonClass = (active: boolean) =>
    `inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
      active
        ? 'bg-brand-blue/[0.08] text-brand-blue'
        : 'text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:text-slate-400 dark:hover:bg-slate-800'
    }`;

  const renderConversationRow = (conv: Channel) => {
    const isActive = selectedChannel?.id === conv.id;
    const unread = conv.unread_count > 0;
    const dm = conv.type === 'direct' ? dmPartner(conv) : null;
    const preview = conv.last_message
      ? conv.type === 'channel' && conv.last_message_by
        ? `${conv.last_message_by}: ${conv.last_message}`
        : conv.last_message
      : conv.type === 'channel'
        ? `${conv.member_count} members`
        : 'No messages yet';
    return (
      <button
        key={conv.id}
        type="button"
        onClick={() => handleSelectChannel(conv)}
        aria-current={isActive ? 'true' : undefined}
        className={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
          isActive
            ? 'bg-brand-blue/[0.07] ring-1 ring-brand-blue/15'
            : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
        }`}
      >
        {dm ? (
          <span className="relative shrink-0">
            <NameAvatar name={dm.name} fallback={dm.email} size="sm" />
            {dm.is_online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-teal ring-2 ring-white dark:ring-slate-900" />
            )}
          </span>
        ) : (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              isActive
                ? 'bg-brand-blue/10 text-brand-blue'
                : 'bg-gray-100 text-gray-500 group-hover:text-brand-blue dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {conv.is_private ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-4 w-4" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span
              className={`truncate text-sm ${
                unread ? 'font-semibold text-gray-900 dark:text-slate-50' : 'font-medium text-gray-700 dark:text-slate-300'
              }`}
            >
              {conv.name}
            </span>
            {conv.last_message_at && (
              <span className={`shrink-0 text-xs ${unread ? 'font-medium text-brand-blue' : 'text-gray-400 dark:text-slate-500'}`}>
                {lastMessageLabel(conv.last_message_at)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={`truncate text-xs ${unread ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500'}`}>
              {preview}
            </span>
            {unread && (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue px-1.5 text-xs font-semibold text-white">
                {conv.unread_count}
              </span>
            )}
          </span>
        </span>
      </button>
    );
  };

  const groupHeader = (label: string, onAdd: () => void, canAdd: boolean, addLabel: string, denyTitle?: string) => (
    <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{label}</span>
      <button
        type="button"
        onClick={onAdd}
        aria-disabled={!canAdd}
        aria-label={addLabel}
        title={canAdd ? addLabel : denyTitle}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
          canAdd ? 'text-gray-400 hover:bg-brand-blue/[0.06] hover:text-brand-blue' : 'cursor-not-allowed text-gray-300 opacity-60'
        }`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 overflow-x-clip">
      <div className="mx-auto w-full max-w-[1400px] flex flex-col flex-1 min-h-0">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl flex flex-col flex-1 min-h-0">
      <div className="shrink-0">
        <PageBreadcrumb className="mb-4" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users', href: '/organization/user-management' }, { label: 'Chat' }]} />
        <OrganizationTabs />
      </div>
      <div className="flex flex-1 min-h-0 flex-col rounded-xl border border-gray-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 p-4 sm:p-5 lg:-mt-5 lg:rounded-t-none lg:border-t-0">
        {/* One chat window — conversations | conversation | members — split by
            dividers instead of three floating cards. */}
        <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm shadow-brand-blue/5 dark:border-slate-700 dark:bg-slate-900">

        {/* ── Conversations ── */}
        <aside
          className={`${showListOnMobile ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-gray-200 dark:border-slate-700 md:flex md:w-72 md:border-r lg:w-80`}
        >
          <div className="space-y-3 border-b border-gray-100 p-3 dark:border-slate-700/60">
            <div className="flex items-center gap-2 px-1">
              <h1 className="text-base font-semibold text-gray-900 dark:text-slate-50">Team Chat</h1>
              {totalUnread > 0 && (
                <span className="rounded-full bg-brand-blue px-2 py-0.5 text-xs font-semibold text-white" title={`${totalUnread} unread`}>
                  {totalUnread}
                </span>
              )}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-blue/60" />
              <input
                aria-label="Search conversations"
                type="text"
                placeholder="Search conversations"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus-visible:!outline-none transition-colors placeholder:text-gray-400 hover:border-brand-blue/40 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {/* All / Channels / Direct — the sliding white-tile toggle used across modules. */}
            <div
              role="radiogroup"
              aria-label="Show conversations"
              className="relative grid h-[38px] grid-cols-3 rounded-lg bg-brand-blue/5 p-1 ring-1 ring-brand-blue/10"
            >
              <span
                aria-hidden
                style={{ transform: `translateX(${tabIndex * 100}%)` }}
                className="absolute bottom-1 left-1 top-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out dark:bg-slate-800"
              />
              {(['all', 'channels', 'direct'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="radio"
                  aria-checked={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative z-10 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors duration-300 ${
                    activeTab === tab ? 'text-brand-blue' : 'text-gray-600 hover:text-brand-blue dark:text-slate-400'
                  }`}
                >
                  {tab === 'all' ? 'All' : tab === 'channels' ? 'Channels' : 'Direct'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {(activeTab === 'all' || activeTab === 'channels') && (
              <div className="mb-2">
                {groupHeader('Channels', openCreateModal, permissions.can_create_channel, 'Create channel', 'You do not have permission to create channels')}
                {filteredChannels.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">
                    {searchQuery ? 'No channels match your search' : 'No channels yet'}
                  </p>
                ) : (
                  <div className="space-y-0.5">{filteredChannels.map(renderConversationRow)}</div>
                )}
              </div>
            )}

            {(activeTab === 'all' || activeTab === 'direct') && (
              <div>
                {groupHeader('Direct messages', openNewDMModal, true, 'New direct message')}
                {filteredDMs.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">
                    {searchQuery ? 'No conversations match your search' : 'No direct messages yet'}
                  </p>
                ) : (
                  <div className="space-y-0.5">{filteredDMs.map(renderConversationRow)}</div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 px-3 py-2.5 dark:border-slate-700/60">
            <p className="text-center text-xs text-gray-400">Messages are kept for 90 days</p>
          </div>
        </aside>

        {/* ── Conversation ── */}
        <section className={`${showListOnMobile ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col md:flex`}>
          {selectedChannel ? (
            <>
              <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-2 sm:px-4 dark:border-slate-700">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMobileListOpen(true)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand-blue md:hidden"
                    aria-label="Back to conversations"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  {partner ? (
                    <span className="relative shrink-0">
                      <NameAvatar name={partner.name} fallback={partner.email} size="md" />
                      {partner.is_online && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-teal ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </span>
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                      {selectedChannel.is_private ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate text-base font-semibold text-gray-900 dark:text-slate-50">{selectedChannel.name}</h2>
                      {isMuted && <BellOff className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="Muted" />}
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                      {connectionStatus === 'closed' && (
                        <span className="mr-1 inline-flex items-center gap-1 text-brand-orange-deep" title="Live updates paused — checking for new messages every few seconds">
                          <Loader2 className="h-3 w-3 animate-spin" /> Reconnecting… ·
                        </span>
                      )}
                      {selectedChannel.type === 'channel'
                        ? `${selectedChannel.is_private ? 'Private · ' : ''}${selectedChannel.member_count} members · ${onlineMembersCount} online`
                        : partner?.is_online
                          ? 'Online'
                          : 'Offline'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {/* Refresh this chat */}
                  <button
                    type="button"
                    onClick={handleRefreshChat}
                    disabled={isRefreshingChat}
                    className={`${iconButtonClass(false)} disabled:cursor-wait`}
                    aria-label="Refresh chat"
                    title="Refresh chat"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshingChat ? 'animate-spin text-brand-blue' : ''}`} />
                  </button>

                  {/* Pinned messages */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowPinnedPanel((v) => !v); setShowHeaderMenu(false); }}
                      className={`relative ${iconButtonClass(showPinnedPanel)}`}
                      aria-label="Pinned messages"
                      title="Pinned messages"
                    >
                      <Pin className="h-4 w-4" />
                      {pinnedMessages.length > 0 && (
                        <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-blue px-1 text-2xs font-semibold text-white">
                          {pinnedMessages.length}
                        </span>
                      )}
                    </button>
                    {showPinnedPanel && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowPinnedPanel(false)} />
                        <div className="absolute right-0 top-full z-50 mt-2 max-h-96 w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                            <Pin className="h-3.5 w-3.5" /> Pinned messages
                          </div>
                          {pinnedMessages.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-gray-400">No pinned messages yet</p>
                          ) : (
                            <div className="space-y-0.5">
                              {pinnedMessages.map((m) => (
                                <div key={m.id} className="rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/60">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-xs font-semibold text-gray-900 dark:text-slate-100">{m.user_name}</span>
                                    <span className="shrink-0 text-xs text-gray-400">{formatISTTime(m.created_at)}</span>
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 text-sm text-gray-700 dark:text-slate-300">{m.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Members panel (wide screens, channels only) */}
                  {selectedChannel.type === 'channel' && (
                    <button
                      type="button"
                      onClick={() => setShowMembersSidebar(!showMembersSidebar)}
                      className={`hidden lg:inline-flex ${iconButtonClass(showMembersSidebar)}`}
                      aria-label={showMembersSidebar ? 'Hide members' : 'Show members'}
                      aria-pressed={showMembersSidebar}
                      title={showMembersSidebar ? 'Hide members' : 'Show members'}
                    >
                      <Users className="h-4 w-4" />
                    </button>
                  )}

                  {/* More: mute, leave, delete */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowHeaderMenu((v) => !v); setShowPinnedPanel(false); }}
                      className={iconButtonClass(showHeaderMenu)}
                      aria-label="More options"
                      title="More options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {showHeaderMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} />
                        <div className="absolute right-0 top-full z-50 mt-2 w-52 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                          <button
                            type="button"
                            onClick={() => { toggleMute(); setShowHeaderMenu(false); }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                          >
                            {isMuted ? <Bell className="h-4 w-4 text-gray-400" /> : <BellOff className="h-4 w-4 text-gray-400" />}
                            {isMuted ? 'Unmute notifications' : 'Mute notifications'}
                          </button>
                          {selectedChannel.type === 'channel' && (
                            <>
                              <button
                                type="button"
                                onClick={handleLeaveChannel}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                              >
                                <LogOut className="h-4 w-4 text-gray-400" /> Leave channel
                              </button>
                              <div className="my-1 h-px bg-gray-100 dark:bg-slate-700/60" />
                              <button
                                type="button"
                                onClick={() => { if (permissions.can_create_channel) handleDeleteChannel(); }}
                                aria-disabled={!permissions.can_create_channel}
                                title={!permissions.can_create_channel ? 'You do not have permission to delete channels' : undefined}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                                  permissions.can_create_channel
                                    ? 'text-destructive hover:bg-destructive-subtle'
                                    : 'cursor-not-allowed text-gray-400 opacity-60'
                                }`}
                              >
                                <Trash2 className="h-4 w-4" /> Delete channel
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {selectedChannel.description && (
                <div className="shrink-0 border-b border-gray-100 px-4 py-2 sm:px-5 dark:border-slate-700/60">
                  <p className="truncate text-xs text-gray-500 dark:text-slate-400" title={selectedChannel.description}>
                    {selectedChannel.description}
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto bg-slate-50/60 px-3 py-4 sm:px-5 dark:bg-slate-950/30">
                {isLoadingMessages ? (
                  <div className="flex flex-col gap-4">
                    {/* Mirrors the message list: received (avatar + bubble, left)
                        and sent (bubble only, right). */}
                    {[false, false, true, false, true, true, false].map((isSender, i) => (
                      <div key={i} className={`flex gap-2.5 ${isSender ? 'justify-end' : ''}`}>
                        {!isSender && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
                        <div className={`flex max-w-[70%] flex-col gap-1.5 ${isSender ? 'items-end' : 'items-start'}`}>
                          {!isSender && <Skeleton className="h-3 w-24" />}
                          <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-56' : 'w-40'}`} />
                          <Skeleton className="h-2.5 w-12" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15">
                      <MessageCircle className="h-6 w-6 text-brand-blue" />
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-slate-50">No messages yet</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {selectedChannel.type === 'channel'
                        ? `Start the conversation in #${selectedChannel.name}.`
                        : `Say hello to ${selectedChannel.name}.`}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {messages.map((message, idx) => {
                      const isSender = message.user_id === currentUser?.id;
                      const prev = messages[idx - 1];
                      const next = messages[idx + 1];
                      const dayLabel = formatISTDate(message.created_at);
                      const showDateSeparator = !prev || formatISTDate(prev.created_at) !== dayLabel;
                      // Group consecutive messages from the same sender on the same day.
                      const groupStart = showDateSeparator || !prev || prev.user_id !== message.user_id;
                      const groupEnd =
                        !next || formatISTDate(next.created_at) !== dayLabel || next.user_id !== message.user_id;
                      const showMeta = groupEnd || message.is_pinned || message.is_edited;
                      const isImage = message.message_type === 'file' && !message.is_deleted && message.metadata?.file_url;
                      const bubbleRadius = isSender
                        ? `rounded-2xl${groupStart ? ' rounded-tr-md' : ''}`
                        : `rounded-2xl${groupStart ? ' rounded-tl-md' : ''}`;
                      const bubbleClass = isImage
                        ? `overflow-hidden ${bubbleRadius} ring-1 ${isSender ? 'ring-brand-blue/30' : 'ring-gray-200 dark:ring-slate-700'}`
                        : message.is_deleted
                          ? `px-3.5 py-2 ${bubbleRadius} bg-transparent italic text-gray-400 ring-1 ring-gray-200 dark:ring-slate-700`
                          : `px-3.5 py-2 ${bubbleRadius} ${
                              isSender
                                ? 'bg-brand-blue text-white'
                                : 'bg-white text-gray-900 ring-1 ring-gray-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
                            }`;
                      return (
                        <Fragment key={message.id}>
                          {showDateSeparator && (
                            <div className="flex items-center gap-3 py-3">
                              <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
                              <span className="rounded-full bg-white px-3 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
                                {dayLabel === todayLabel ? 'Today' : dayLabel}
                              </span>
                              <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
                            </div>
                          )}
                          <div className={`group flex gap-2.5 ${isSender ? 'justify-end' : ''} ${groupStart ? 'mt-3 first:mt-0' : 'mt-0.5'}`}>
                            {/* Your own messages need no avatar — the right side and blue bubble say it. */}
                            {!isSender && (groupStart ? (
                              <NameAvatar name={message.user_name} size="md" />
                            ) : (
                              <div className="w-9 shrink-0" aria-hidden />
                            ))}

                            <div className={`flex max-w-[80%] flex-col sm:max-w-[65%] ${isSender ? 'items-end' : 'items-start'}`}>
                              {groupStart && !isSender && (
                                <span className="mb-1 px-1 text-xs font-semibold text-gray-700 dark:text-slate-300">
                                  {message.user_name}
                                </span>
                              )}

                              <div className={`flex items-center gap-1 ${isSender ? 'flex-row-reverse' : ''}`}>
                                <div className={bubbleClass}>
                                  {isImage ? (
                                    <a href={message.metadata!.file_url} target="_blank" rel="noopener noreferrer">
                                      <img
                                        src={message.metadata!.file_url}
                                        alt={message.metadata!.file_name || 'Image attachment'}
                                        className="block max-h-64 max-w-full object-contain"
                                      />
                                    </a>
                                  ) : (
                                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                      {message.is_deleted ? 'This message was deleted' : message.content}
                                    </p>
                                  )}
                                </div>

                                {/* React — on every message, revealed on hover/focus. */}
                                {!message.is_deleted && (
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id)}
                                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-opacity hover:bg-white hover:text-brand-blue focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800 ${
                                        showEmojiPicker === message.id ? 'opacity-100' : 'opacity-0'
                                      }`}
                                      aria-label="Add reaction"
                                      title="Add reaction"
                                    >
                                      <Smile className="h-4 w-4" />
                                    </button>
                                    {showEmojiPicker === message.id && (
                                      <>
                                        <div className="fixed inset-0 z-[9]" onClick={() => setShowEmojiPicker(null)} />
                                        <div
                                          className={`absolute bottom-full z-10 mb-1 flex gap-0.5 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${
                                            isSender ? 'right-0' : 'left-0'
                                          }`}
                                        >
                                          {quickEmojis.map((emoji) => (
                                            <button
                                              key={emoji}
                                              type="button"
                                              onClick={() => { handleAddReaction(message.id, emoji); setShowEmojiPicker(null); }}
                                              className="rounded-md p-1.5 text-lg transition-transform hover:scale-110 hover:bg-brand-blue/[0.06]"
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>

                              {message.reactions.length > 0 && (
                                <div className={`mt-1 flex flex-wrap gap-1 ${isSender ? 'justify-end' : 'justify-start'}`}>
                                  {message.reactions.map((reaction, rIdx) => (
                                    <button
                                      key={rIdx}
                                      type="button"
                                      onClick={() => handleAddReaction(message.id, reaction.emoji)}
                                      className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-sm ring-1 ring-gray-200 transition-colors hover:ring-brand-blue/40 dark:bg-slate-800 dark:ring-slate-700"
                                      title={reaction.users.join(', ')}
                                    >
                                      <span>{reaction.emoji}</span>
                                      <span className="text-xs font-medium text-gray-600 dark:text-slate-300">{reaction.count}</span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              {showMeta && (
                                <div className={`mt-1 flex items-center gap-1.5 px-1 ${isSender ? 'justify-end' : 'justify-start'}`}>
                                  <span className="text-xs text-gray-400">{formatISTTime(message.created_at)}</span>
                                  {message.is_edited && <span className="text-xs text-gray-400">· edited</span>}
                                  {message.is_pinned && (
                                    <span className="inline-flex items-center gap-0.5 text-xs text-brand-blue">
                                      · <Pin className="h-3 w-3" /> Pinned
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </Fragment>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="relative shrink-0 border-t border-gray-200 bg-white px-3 py-3 sm:px-4 dark:border-slate-700 dark:bg-slate-900">
                {/* Typing indicator — floats just above the composer so the
                    conversation doesn't jump when it appears. */}
                <div aria-live="polite" className="pointer-events-none absolute bottom-full left-3 mb-2 sm:left-4">
                  {typingNames.length > 0 && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700">
                      <span className="flex items-center gap-0.5" aria-hidden>
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-blue/60 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-blue/60 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-blue/60" />
                      </span>
                      {typingNames.length === 1
                        ? `${typingNames[0]} is typing…`
                        : typingNames.length === 2
                          ? `${typingNames[0]} and ${typingNames[1]} are typing…`
                          : 'Several people are typing…'}
                    </span>
                  )}
                </div>
                <div className="flex items-end gap-1 rounded-xl border border-gray-200 bg-white p-1.5 transition-colors focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/30 dark:border-slate-700 dark:bg-slate-900">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleAttachmentSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={isUploadingAttachment}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
                    aria-label="Attach image"
                    title="Attach image (PNG, JPG, GIF, WebP · up to 5 MB)"
                  >
                    {isUploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </button>
                  <textarea
                    ref={inputRef}
                    value={messageInput}
                    onChange={(e) => {
                      setMessageInput(e.target.value);
                      if (e.target.value.trim()) notifyTyping();
                      else stopTyping();
                    }}
                    onBlur={stopTyping}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${selectedChannel.type === 'channel' ? '#' : ''}${selectedChannel.name}`}
                    rows={1}
                    className="min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-gray-900 outline-none focus-visible:!outline-none placeholder:text-gray-400 dark:text-slate-100"
                  />
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowComposerEmoji((v) => !v)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                        showComposerEmoji ? 'bg-brand-blue/[0.08] text-brand-blue' : 'text-gray-400 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800'
                      }`}
                      aria-label="Insert emoji"
                      title="Insert emoji"
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                    {showComposerEmoji && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowComposerEmoji(false)} />
                        <div className="absolute bottom-full right-0 z-50 mb-2 flex gap-0.5 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                          {quickEmojis.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => insertEmoji(emoji)}
                              className="rounded-md p-1.5 text-lg transition-transform hover:scale-110 hover:bg-brand-blue/[0.06]"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim()}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 transition-colors hover:bg-brand-blue/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-slate-700"
                    aria-label="Send message"
                    title="Send (Enter)"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1.5 hidden px-1 text-xs text-gray-400 sm:block">
                  Enter to send · Shift + Enter for a new line
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-slate-50/60 p-8 dark:bg-slate-950/30">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <MessageCircle className="h-6 w-6 text-brand-blue" />
                </div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50">Welcome to Team Chat</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {channels.length === 0
                    ? 'No channels yet. Create one to bring your team into the conversation.'
                    : 'Pick a channel or direct message to start the conversation.'}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button
                    variant="primary"
                    onClick={openCreateModal}
                    aria-disabled={!permissions.can_create_channel}
                    title={!permissions.can_create_channel ? 'You do not have permission to create channels' : undefined}
                    className={!permissions.can_create_channel ? 'cursor-not-allowed opacity-60' : undefined}
                    icon={<Hash className="h-4 w-4" />}
                  >
                    New channel
                  </Button>
                  <Button variant="secondary" onClick={openNewDMModal} icon={<MessageCircle className="h-4 w-4" />}>
                    New message
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Members (wide screens, channels) ── */}
        {showMembersSidebar && selectedChannel && selectedChannel.type === 'channel' && (
          <aside className="hidden w-64 shrink-0 flex-col border-l border-gray-200 lg:flex xl:w-72 dark:border-slate-700">
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 dark:border-slate-700">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">Members</h3>
                <p className="text-xs text-gray-500">
                  {selectedChannel.member_count} total · {onlineMembersCount} online
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMembersSidebar(false)}
                className={iconButtonClass(false)}
                aria-label="Hide members"
                title="Hide members"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {sortedMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60">
                  <span className="relative shrink-0">
                    <NameAvatar name={member.name} fallback={member.email} size="md" />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                        member.is_online ? 'bg-brand-teal' : 'bg-gray-300'
                      }`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">
                      {member.name}
                      {member.user_id === currentUser?.id && <span className="font-normal text-gray-400"> (You)</span>}
                    </p>
                    <p className="truncate text-xs capitalize text-gray-500">{member.role?.replace(/_/g, ' ') || 'Member'}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
        </div>

        {/* Create Channel Modal */}
        <AppModal
          open={showCreateModal}
          onCancel={() => setShowCreateModal(false)}
          size="md"
          icon={<Hash />}
          title="Create channel"
          subtitle="Bring teammates together around a topic."
          cancelDisabled={isCreating}
          bodyClassName="space-y-5"
          actions={[
            {
              label: isCreating ? 'Creating...' : 'Create channel',
              onClick: handleCreateChannel,
              disabled: isCreating || !newChannelName.trim(),
              loading: isCreating,
              icon: <ArrowUpRight className="h-4 w-4" />,
            },
          ]}
        >
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    Channel name <span className="text-brand-orange">*</span>
                  </span>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 transition-all focus-within:border-brand-blue/30 focus-within:ring-4 focus-within:ring-brand-blue/10">
                    <Hash className="h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="e.g. engineering-team"
                      className="flex-1 bg-transparent text-sm text-gray-900 outline-none focus-visible:!outline-none placeholder:text-gray-400"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">Description</span>
                  <textarea
                    value={newChannelDescription}
                    onChange={(e) => setNewChannelDescription(e.target.value)}
                    placeholder="What's this channel about?"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus-visible:!outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                  />
                </label>

                <div>
                  <span className="mb-2 block text-sm font-medium text-gray-700">Visibility</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setNewChannelPrivate(false)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                        !newChannelPrivate
                          ? 'border-brand-blue bg-brand-blue text-white shadow-sm shadow-brand-blue/20'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04]'
                      }`}
                    >
                      <Globe className="h-4 w-4" />
                      <div className="text-left">
                        <div className="text-sm font-semibold">Public</div>
                        <div className={`text-xs ${!newChannelPrivate ? 'text-white/75' : 'text-gray-500'}`}>
                          Anyone can join
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setNewChannelPrivate(true)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                        newChannelPrivate
                          ? 'border-brand-blue bg-brand-blue text-white shadow-sm shadow-brand-blue/20'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04]'
                      }`}
                    >
                      <Lock className="h-4 w-4" />
                      <div className="text-left">
                        <div className="text-sm font-semibold">Private</div>
                        <div className={`text-xs ${newChannelPrivate ? 'text-white/75' : 'text-gray-500'}`}>
                          Invite only
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <span className="mb-2 block text-sm font-medium text-gray-700">Add members (optional)</span>
                  {availableUsers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-6 text-center">
                      <Users className="mx-auto mb-2 h-6 w-6 text-gray-300" />
                      <p className="text-xs text-gray-500">No teammates available</p>
                    </div>
                  ) : (
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                      {availableUsers.map((user) => {
                        const checked = selectedMemberIds.includes(user.id);
                        return (
                          <button
                            key={user.id}
                            onClick={() => toggleMemberSelection(user.id)}
                            type="button"
                            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                              checked ? 'bg-brand-blue/[0.04]' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                checked
                                  ? 'border-brand-blue bg-brand-blue text-white'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {checked && <span className="text-2xs">✓</span>}
                            </span>
                            <NameAvatar name={user.name} fallback={user.email} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                              <p className="truncate text-xs text-gray-500">{user.email}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
        </AppModal>

        {/* Add Members Modal */}
        <AppModal
          open={showAddMembersModal}
          onCancel={() => {
            setShowAddMembersModal(false);
            setSelectedMemberIds([]);
          }}
          size="md"
          icon={<Users />}
          title="Add members"
          subtitle="Invite teammates to this channel."
          actions={[
            {
              label: `Add${selectedMemberIds.length > 0 ? ` (${selectedMemberIds.length})` : ''}`,
              onClick: handleAddMembers,
              disabled: selectedMemberIds.length === 0,
              icon: <Plus className="h-4 w-4" />,
            },
          ]}
        >
                {availableUsers.filter((user) => !selectedChannel?.members.some((m) => m.user_id === user.id))
                  .length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center">
                    <Users className="mx-auto mb-2 h-7 w-7 text-gray-300" />
                    <p className="text-sm text-gray-500">No teammates left to add.</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                    {availableUsers
                      .filter((user) => !selectedChannel?.members.some((m) => m.user_id === user.id))
                      .map((user) => {
                        const checked = selectedMemberIds.includes(user.id);
                        return (
                          <button
                            key={user.id}
                            onClick={() => toggleMemberSelection(user.id)}
                            type="button"
                            className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                              checked ? 'bg-brand-blue/[0.04]' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                checked
                                  ? 'border-brand-blue bg-brand-blue text-white'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {checked && <span className="text-2xs">✓</span>}
                            </span>
                            <NameAvatar name={user.name} fallback={user.email} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                              <p className="truncate text-xs text-gray-500">{user.email}</p>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
        </AppModal>

        {/* New Direct Message Modal */}
        <AppModal
          open={showNewDMModal}
          onCancel={() => setShowNewDMModal(false)}
          size="md"
          icon={<MessageCircle />}
          title="New direct message"
          subtitle="Pick a teammate to start a private chat."
          cancelDisabled={isCreatingDM}
        >
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {isLoadingUsers ? (
                    <div className="max-h-80 overflow-y-auto">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex w-full items-center gap-3 px-3 py-3">
                          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="h-3 w-44" />
                          </div>
                          <Skeleton className="hidden sm:block h-6 w-16 rounded-full" />
                        </div>
                      ))}
                    </div>
                  ) : availableUsers.filter((u) => u.id !== currentUser?.id).length === 0 ? (
                    <div className="px-4 py-10 text-center text-gray-500">
                      <Users className="mx-auto mb-2 h-7 w-7 text-gray-300" />
                      <p className="text-sm">No team members found</p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {availableUsers
                        .filter((u) => u.id !== currentUser?.id)
                        .map((user) => (
                          <button
                            key={user.id}
                            onClick={() => handleStartDM(user.id, user.name)}
                            disabled={isCreatingDM}
                            className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-brand-blue/[0.04] disabled:opacity-50"
                          >
                            <NameAvatar name={user.name} fallback={user.email} size="lg" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                              <p className="truncate text-xs text-gray-500">{user.email}</p>
                            </div>
                            <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-600 sm:inline-flex">
                              {user.role?.replace(/_/g, ' ') || 'User'}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
        </AppModal>
      </div>
      </div>
      </div>
    </div>
  );
}
