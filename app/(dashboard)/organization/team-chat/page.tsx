'use client';

import TeamChatSkeleton from '@/components/organization/TeamChatSkeleton';
import { useState, useRef, useEffect, useLayoutEffect, useCallback, Fragment } from 'react';
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
  UserPlus,
  Menu,
  X,
  RefreshCw,
  Copy,
  Check,
  PinOff,
  MessageSquareText,
  MessageCircleMore,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import chatService, {
  ChatConnectionStatus,
  Channel,
  Message,
  Reaction,
} from '@/lib/services/chatService';
import { getTokens } from '@/lib/services/api';
import userService, { ApiUser } from '@/lib/services/userService';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { useSearchParams } from 'next/navigation';
import { formatISTTime, formatISTDate } from '@/lib/utils/dateUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import AppModal from '@/components/ui/app-modal';
import NameAvatar from '@/components/ui/name-avatar';
import ChatAttachmentViewer, { type ChatAttachment } from '@/components/organization/ChatAttachmentViewer';
import { IllustratedEmptyState } from '@/components/ui/illustrated-empty-state';
import TeamChatIllustration from '@/components/teams/TeamChatIllustration';

const quickEmojis = ['👍', '❤️', '😄', '🎉', '👀', '✅'];


export default function TeamChatPage() {
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();
  const dialog = useGlobalDialog();
  // Direct first — it's where most conversations happen.
  const [activeTab, setActiveTab] = useState<'all' | 'channels' | 'direct'>('direct');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [directMessages, setDirectMessages] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  // Unsent text per conversation, so a draft never follows you into another chat.
  const draftsRef = useRef<Record<string, string>>({});
  // One send at a time — Enter twice (or Enter + click) used to post twice.
  const sendingRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  // Keep the header's chat badge in step (once the list has loaded — the
  // initial 0 isn't a real count).
  useEffect(() => {
    if (!isLoading) window.dispatchEvent(new CustomEvent('chatUnreadChanged', { detail: totalUnread }));
  }, [totalUnread, isLoading]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showMembersSidebar, setShowMembersSidebar] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  // Tapped message — shows its time + actions row (touch has no hover).
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  // Image attachment open in the in-page viewer.
  const [viewerAttachment, setViewerAttachment] = useState<ChatAttachment | null>(null);
  const closeViewer = useCallback(() => setViewerAttachment(null), []);
  // Selected messages (long-press on touch, double-click on desktop; once
  // one is selected a tap/click adds or removes more). The header's pin
  // button then pins/unpins them.
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [isPinning, setIsPinning] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const isSelecting = selectedMessageIds.size > 0;

  const clearSelection = () => setSelectedMessageIds(new Set());
  const toggleSelectMessage = (messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    setShowEmojiPicker(null);
    setShowPinnedPanel(false);
  };
  const startLongPress = (messageId: string) => {
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      navigator.vibrate?.(15);
      toggleSelectMessage(messageId);
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  // Esc clears the selection.
  useEffect(() => {
    if (!isSelecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedMessageIds(new Set()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSelecting]);

  // Any unpinned in the selection → pin those; all already pinned → unpin all.
  const handleTogglePinSelected = async () => {
    const selected = messages.filter((m) => selectedMessageIds.has(m.id) && !m.is_deleted);
    if (selected.length === 0 || isPinning) return;
    const unpinned = selected.filter((m) => !m.is_pinned);
    const pin = unpinned.length > 0;
    const targets = pin ? unpinned : selected;
    setIsPinning(true);
    try {
      const results = await Promise.allSettled(
        targets.map((m) => (pin ? chatService.pinMessage(m.id) : chatService.unpinMessage(m.id))),
      );
      const done = new Set(targets.filter((_, i) => results[i].status === 'fulfilled').map((m) => m.id));
      if (done.size > 0) {
        setMessages((prev) => prev.map((m) => (done.has(m.id) ? { ...m, is_pinned: pin } : m)));
        const noun = done.size === 1 ? 'Message' : `${done.size} messages`;
        toast.success(`${noun} ${pin ? 'pinned' : 'unpinned'}`);
      }
      const failed = targets.length - done.size;
      if (failed > 0) {
        toast.error(`Failed to ${pin ? 'pin' : 'unpin'} ${failed} message${failed === 1 ? '' : 's'}`);
        // Keep only the failed ones selected so a retry is one tap.
        setSelectedMessageIds(new Set(targets.filter((m) => !done.has(m.id)).map((m) => m.id)));
      } else {
        clearSelection();
      }
    } finally {
      setIsPinning(false);
    }
  };

  const [unpinningId, setUnpinningId] = useState<string | null>(null);
  const handleUnpinMessage = async (messageId: string) => {
    if (unpinningId) return;
    setUnpinningId(messageId);
    try {
      await chatService.unpinMessage(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_pinned: false } : m)));
      toast.success('Message unpinned');
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to unpin message');
    } finally {
      setUnpinningId(null);
    }
  };

  /* Delete: "Delete for everyone" (own messages, within 24 hours of sending —
     the text goes for all and an image is deleted from storage) or "Delete
     for me" (any message, any time — only your view). One popup for a single
     message (its 🗑) or a selection (header 🗑 while selecting). */
  const DELETE_FOR_EVERYONE_MS = 24 * 60 * 60 * 1000;
  const [deleteTargets, setDeleteTargets] = useState<Message[] | null>(null);
  const [deletingScope, setDeletingScope] = useState<'everyone' | 'me' | null>(null);
  const canDeleteForEveryone = (m: Message) =>
    m.user_id === currentUser?.id &&
    !m.is_deleted &&
    Date.now() - new Date(m.created_at).getTime() < DELETE_FOR_EVERYONE_MS;
  const handleDeleteMessage = (message: Message) => {
    setActiveMessageId(null);
    setShowEmojiPicker(null);
    setDeleteTargets([message]);
  };
  const handleDeleteSelected = () => {
    const selected = messages.filter((m) => selectedMessageIds.has(m.id));
    if (selected.length > 0) setDeleteTargets(selected);
  };
  const performDelete = async (scope: 'everyone' | 'me') => {
    if (!deleteTargets || deletingScope) return;
    const targets = deleteTargets;
    setDeletingScope(scope);
    try {
      const results = await Promise.allSettled(targets.map((m) => chatService.deleteMessage(m.id, scope)));
      const done = new Set(targets.filter((_, i) => results[i].status === 'fulfilled').map((m) => m.id));
      if (done.size > 0) {
        setMessages((prev) =>
          scope === 'me'
            ? prev.filter((m) => !done.has(m.id))
            : prev.map((m) => (done.has(m.id) ? { ...m, is_deleted: true, content: '', metadata: null, is_pinned: false } : m)),
        );
        setSelectedMessageIds((prev) => {
          const next = new Set([...prev].filter((id) => !done.has(id)));
          return next.size === prev.size ? prev : next;
        });
        const noun = done.size === 1 ? 'Message' : `${done.size} messages`;
        toast.success(`${noun} deleted${scope === 'me' ? ' for you' : ' for everyone'}`);
      }
      const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (firstError) {
        toast.error(friendlyErrorMessage(firstError.reason, "Couldn't delete message. Please try again."));
      }
      setDeleteTargets(null);
    } finally {
      setDeletingScope(null);
    }
  };

  const handleCopyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content ?? '');
      setCopiedMessageId(message.id);
      toast.success('Message copied');
      setTimeout(() => setCopiedMessageId((id) => (id === message.id ? null : id)), 1500);
    } catch {
      toast.error('Could not copy message');
    }
  };
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
  // Tablet + phone (< lg): the conversation list is a slide-in drawer, open by
  // default; picking a conversation closes it, the header hamburger reopens it.
  // Desktop ignores this — the list is a fixed column there.
  const [listOpen, setListOpen] = useState(true);
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

  /* A conversation always opens at its newest message; older ones are a
     scroll up. Scrolls the message pane itself (not scrollIntoView, which
     also moved the page) and before paint, so it never shows the top first.
     `stickToBottomRef` says the reader is at the bottom: while it holds, the
     pane stays pinned there as content grows (images loading pushed the last
     message out of view). Scrolling up to read history releases it, so a new
     message from someone else doesn't yank the reader away — their own
     message always brings them back down. */
  const messagesPaneRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastMessageIdRef = useRef<string | undefined>(undefined);
  const jumpToEndRef = useRef(true);
  const scrollPaneToEnd = (smooth = false) => {
    const pane = messagesPaneRef.current;
    if (!pane) return;
    if (smooth) pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
    else pane.scrollTop = pane.scrollHeight;
  };
  const handleMessagesScroll = () => {
    const pane = messagesPaneRef.current;
    if (!pane) return;
    stickToBottomRef.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
  };
  useLayoutEffect(() => {
    if (isLoadingMessages) return;
    const last = messages[messages.length - 1];
    if (jumpToEndRef.current) {
      // Opening a conversation: straight to the newest message.
      if (!last) return;
      jumpToEndRef.current = false;
      lastMessageIdRef.current = last.id;
      stickToBottomRef.current = true;
      scrollPaneToEnd();
      return;
    }
    if (!last || last.id === lastMessageIdRef.current) return;
    lastMessageIdRef.current = last.id;
    if (stickToBottomRef.current || last.user_id === currentUser?.id) {
      stickToBottomRef.current = true;
      scrollPaneToEnd(true);
    }
  }, [messages, isLoadingMessages]);
  // Keep the bottom in view while the list grows under the reader (images,
  // link previews and the like finishing their layout after the first paint).
  useEffect(() => {
    const content = messagesEndRef.current?.parentElement;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) scrollPaneToEnd();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [isLoadingMessages, selectedChannel?.id]);

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
    // whatever was sent while it was down. Starts true: messages sent between
    // the first load and the socket opening would otherwise be missed.
    let wasDisconnected = true;
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
            // Away (tab hidden): leave it unread; returning to the tab refetches and marks it read.
            if (document.visibilityState === 'visible') chatService.markAsRead(selectedChannel.id);
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
                m.id === data.message_id ? { ...m, is_deleted: true, content: '', metadata: null, is_pinned: false } : m
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

  // `initial`: the first load (full-page skeleton). Later reloads (after create,
  // leave, delete, new DM) keep the page. `selectFirst`: pick the first channel
  // even though one was open (the open one was just left or deleted).
  const fetchChannels = async ({ initial = true, selectFirst = false }: { initial?: boolean; selectFirst?: boolean } = {}) => {
    try {
      if (initial) setIsLoading(true);
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

      // Open the most recent conversation (the server lists them newest
      // first), a direct one ahead of a channel — Direct is the default tab.
      if (selectFirst || !selectedChannel) {
        const first = response.direct_messages[0] ?? response.channels[0];
        if (first) setSelectedChannel(first);
      }
    } catch (error: any) {
      console.error('Error fetching channels:', error);
      if (error.response?.status !== 404) {
        toast.error('Failed to load channels');
      }
    } finally {
      if (initial) setIsLoading(false);
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
      delete draftsRef.current[selectedChannel.id];
      setSelectedChannel(null);
      setMessages([]);
      await fetchChannels({ initial: false, selectFirst: true });
    } catch (e: any) {
      toast.error(friendlyErrorMessage(e, "Couldn't leave channel. Please try again."));
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
      delete draftsRef.current[selectedChannel.id];
      setSelectedChannel(null);
      setMessages([]);
      await fetchChannels({ initial: false, selectFirst: true });
    } catch (e: any) {
      toast.error(friendlyErrorMessage(e, "Couldn't delete channel. Please try again."));
    }
  };

  // "Delete chat" on a direct conversation — for this user only; the other
  // person keeps the history and a new message brings the chat back.
  const handleDeleteDirectChat = async () => {
    if (!selectedChannel || selectedChannel.type !== 'direct') return;
    setShowHeaderMenu(false);
    const ok = await dialog.confirm({
      title: 'Delete Chat',
      message: 'Delete this chat and all its messages?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Chat',
      item: { label: 'CHAT WITH', name: selectedChannel.name },
      warningNote: 'The messages are removed for you only. The other person still sees them, and the chat comes back if either of you sends a new message.',
    });
    if (!ok) return;
    try {
      await chatService.clearDirectChat(selectedChannel.id);
      toast.success('Chat deleted');
      delete draftsRef.current[selectedChannel.id];
      setSelectedChannel(null);
      setMessages([]);
      await fetchChannels({ initial: false, selectFirst: true });
    } catch (e: any) {
      toast.error(friendlyErrorMessage(e, "Couldn't delete chat. Please try again."));
    }
  };

  // `silent`: a background catch-up (reconnect, polling, tab refocus) — no
  // skeleton, no error toast.
  const fetchMessages = async (channelId: string, { silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) {
        setIsLoadingMessages(true);
        // Never show the previous conversation's messages under this one's header
        // (they stayed when this load failed, and pin / react acted on them).
        setMessages([]);
        jumpToEndRef.current = true;
      }
      const response = await chatService.listMessages(channelId);
      // A slow response for a channel the user has already left must not
      // overwrite the open conversation.
      if (selectedChannelIdRef.current !== channelId) return;
      // Merge, don't replace: a message that came over the socket after the
      // server built this snapshot (refetch on a reaction, refocus, reconnect)
      // used to vanish until the next refetch.
      setMessages((prev) => {
        const ids = new Set(response.messages.map((m) => m.id));
        const lastAt = response.messages[response.messages.length - 1]?.created_at ?? '';
        const newer = prev.filter((m) => !ids.has(m.id) && m.channel_id === channelId && m.created_at > lastAt);
        return newer.length > 0 ? [...response.messages, ...newer] : response.messages;
      });
      // Only while it's actually on screen.
      if (document.visibilityState === 'visible') await chatService.markAsRead(channelId);

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
      if (!silent && selectedChannelIdRef.current === channelId) toast.error('Failed to load messages');
    } finally {
      // A stale request (the user already moved on) must not end the newer one's loading state.
      if (!silent && selectedChannelIdRef.current === channelId) setIsLoadingMessages(false);
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

  /** Opens a conversation, keeping each one's unsent draft. */
  const openChannel = (channel: Channel) => {
    const prevId = selectedChannelIdRef.current;
    if (prevId !== channel.id) {
      if (prevId) draftsRef.current[prevId] = messageInput;
      setMessageInput(draftsRef.current[channel.id] ?? '');
    }
    setSelectedChannel(channel);
  };

  const handleSelectChannel = (channel: Channel) => {
    openChannel(channel);
    setListOpen(false);
    setShowPinnedPanel(false);
    setShowHeaderMenu(false);
    clearSelection();
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
    const content = messageInput;
    if (sendingRef.current || !content.trim() || !selectedChannel) return;
    const channelId = selectedChannel.id;
    sendingRef.current = true;
    setIsSending(true);
    stopTyping();
    // Cleared now (not after the request), so a second Enter has nothing to send.
    setMessageInput('');
    delete draftsRef.current[channelId];

    try {
      const newMessage = await chatService.sendMessage(channelId, { content });
      // Only into the conversation it was sent from — the user may have switched.
      // Functional + de-duplicated: socket messages that arrived meanwhile stay,
      // and the socket may already have delivered this one.
      if (selectedChannelIdRef.current === channelId) {
        setMessages((prev) => (prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]));
      }
      bumpConversation(channelId, newMessage);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      // Give the text back — to the box if still here, else to that chat's draft.
      if (selectedChannelIdRef.current === channelId) setMessageInput((cur) => cur || content);
      else if (!draftsRef.current[channelId]) draftsRef.current[channelId] = content;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
      if (selectedChannelIdRef.current === channelId) inputRef.current?.focus();
    }
  };

  // My own message moves its conversation to the top of the list (the socket
  // only tells the others).
  const bumpConversation = (channelId: string, msg: Message) => {
    const bump = (list: Channel[]) =>
      list.map((c) =>
        c.id === channelId
          ? { ...c, last_message: msg.content, last_message_by: msg.user_name, last_message_at: msg.created_at }
          : c,
      );
    setChannels(bump);
    setDirectMessages(bump);
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

    const channelId = selectedChannel.id;
    setIsUploadingAttachment(true);
    try {
      const newMessage = await chatService.uploadAttachment(channelId, file);
      // Only into the conversation it was uploaded to.
      if (selectedChannelIdRef.current === channelId) {
        setMessages((prev) => (prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]));
      }
      bumpConversation(channelId, newMessage);
    } catch (error: any) {
      console.error('Error uploading attachment:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't upload image. Please try again."));
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleAddReaction = async (messageId: string, emoji: string) => {
    setShowEmojiPicker(null);
    const me = currentUser?.id;
    const myName = currentUser?.name || 'You';
    // Already mine → this click takes it back.
    const alreadyMine = !!me && !!messages
      .find((m) => m.id === messageId)
      ?.reactions.find((r) => r.emoji === emoji)
      ?.user_ids?.includes(me);
    const channelId = selectedChannel?.id;
    // Optimistic: toggle my reaction in place — no loading skeleton, no scroll.
    if (me) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          let reactions: Reaction[];
          if (!existing) {
            reactions = [...m.reactions, { emoji, count: 1, users: [myName], user_ids: [me] }];
          } else if (existing.user_ids?.includes(me)) {
            reactions = m.reactions
              .map((r) =>
                r.emoji === emoji
                  ? {
                      ...r,
                      count: r.count - 1,
                      user_ids: r.user_ids.filter((id) => id !== me),
                      users: r.users.filter((_, i) => r.user_ids[i] !== me),
                    }
                  : r,
              )
              .filter((r) => r.count > 0);
          } else {
            reactions = m.reactions.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, users: [...r.users, myName], user_ids: [...(r.user_ids ?? []), me] }
                : r,
            );
          }
          return { ...m, reactions };
        }),
      );
    }
    try {
      if (alreadyMine) await chatService.removeReaction(messageId, emoji);
      else await chatService.addReaction(messageId, emoji);
    } catch (error) {
      console.error('Error updating reaction:', error);
      toast.error(alreadyMine ? 'Failed to remove reaction' : 'Failed to add reaction');
    }
    // Reconcile with the server quietly (also undoes the optimistic change on failure).
    if (channelId) void fetchMessages(channelId, { silent: true });
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

      await fetchChannels({ initial: false });
      openChannel(channel);
    } catch (error: any) {
      console.error('Error creating channel:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't create channel. Please try again."));
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
      toast.error(friendlyErrorMessage(error, "Couldn't add members. Please try again."));
    }
  };

  const openCreateModal = async () => {
    // Locked controls are greyed with a hover tooltip; the click is a no-op.
    if (!permissions.can_create_channel) return;
    setShowCreateModal(true);
    await fetchAvailableUsers();
  };

  const openNewDMModal = async () => {
    setShowNewDMModal(true);
    await fetchAvailableUsers();
  };

  // #10 — the Add members popup existed but nothing opened it.
  const openAddMembersModal = async () => {
    setShowHeaderMenu(false);
    setSelectedMemberIds([]);
    setShowAddMembersModal(true);
    await fetchAvailableUsers();
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

      // The server hands back the existing chat with this person, if any.
      if (!directMessages.some((dm) => dm.id === channel.id)) {
        toast.success(`Started conversation with ${userName}`);
      }
      setShowNewDMModal(false);

      await fetchChannels({ initial: false });
      openChannel(channel);
    } catch (error: any) {
      console.error('Error creating DM:', error);
      if (error.response?.data?.detail?.includes('already exists')) {
        const existingDM = directMessages.find((dm) => dm.members.some((m) => m.user_id === userId));
        if (existingDM) {
          openChannel(existingDM);
          setShowNewDMModal(false);
          return;
        }
      }
      toast.error(friendlyErrorMessage(error, "Couldn't start conversation. Please try again."));
    } finally {
      setIsCreatingDM(false);
    }
  };

  const toggleMemberSelection = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Most recent conversation first; one with no messages yet sorts by when it was made.
  const byRecent = (a: Channel, b: Channel) =>
    (b.last_message_at || b.created_at || '').localeCompare(a.last_message_at || a.created_at || '');

  const filteredChannels = channels
    .filter((channel) => channel.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort(byRecent);

  const filteredDMs = directMessages
    .filter((dm) => dm.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort(byRecent);

  const onlineMembersCount = selectedChannel?.members?.filter((m) => m.is_online).length || 0;
  const isMuted = selectedChannel ? mutedChannels.has(selectedChannel.id) : false;
  const pinnedMessages = messages.filter((m) => m.is_pinned && !m.is_deleted);
  const selectedMessages = messages.filter((m) => selectedMessageIds.has(m.id) && !m.is_deleted);
  // The pin button unpins only when everything selected is already pinned.
  const selectionAllPinned = selectedMessages.length > 0 && selectedMessages.every((m) => m.is_pinned);

  // Composer grows with its text, up to ~5 lines, then scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [messageInput, selectedChannel?.id]);

  // Esc closes the conversations drawer (tablet/phone) — unless a popup is
  // open, in which case Esc belongs to the popup.
  useEffect(() => {
    if (!listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showCreateModal || showAddMembersModal || showNewDMModal) return;
      if (window.matchMedia('(min-width: 1024px)').matches) return;
      setListOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listOpen, showCreateModal, showAddMembersModal, showNewDMModal]);

  if (isLoading) {
    return <TeamChatSkeleton />;
  }

  const todayLabel = formatISTDate(new Date().toISOString());
  const lastMessageLabel = (iso: string | null) => {
    if (!iso) return '';
    return formatISTDate(iso) === todayLabel ? formatISTTime(iso) : formatISTDate(iso);
  };
  // The other person in a DM (falls back to the first member).
  const dmPartner = (c: Channel) => c.members.find((m) => m.user_id !== currentUser?.id) ?? c.members[0];
  const partner = selectedChannel?.type === 'direct' ? dmPartner(selectedChannel) : null;
  const sortedMembers = [...(selectedChannel?.members ?? [])].sort(
    (a, b) => Number(b.is_online) - Number(a.is_online) || a.name.localeCompare(b.name),
  );
  const tabIndex = activeTab === 'direct' ? 0 : activeTab === 'channels' ? 1 : 2;
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
            <NameAvatar name={dm.name} fallback={dm.email} userId={dm.user_id} size="sm" />
            {dm.is_online && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-900" />
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
      <span className="tf-eyebrow tracking-wider">{label}</span>
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
    // Card, breadcrumb, organization tabs and the tab panel come from
    // app/(dashboard)/organization/layout.tsx — this renders the panel's content.
    <div className="flex flex-1 min-h-0 flex-col [@media(max-height:500px)]:h-[calc(100dvh-4.5rem)] [@media(max-height:500px)]:flex-none">
        {/* One chat window — conversations | conversation | members — split by
            dividers instead of three floating cards. */}
        {/* The tab panel (organization/layout.tsx) frames it — no card of its own. */}
        <div className="relative flex flex-1 min-h-0 overflow-hidden bg-white dark:bg-slate-900">

        {/* ── Conversations ──
            Below lg: a drawer that slides over the conversation from the left
            (open by default; ☰ in the header toggles it). lg+: the fixed left
            column, exactly as before. */}
        <aside
          id="chat-conversations"
          aria-label="Conversations"
          className={`absolute inset-y-0 left-0 z-30 flex w-[85%] max-w-xs shrink-0 flex-col border-r border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 sm:w-80 sm:max-w-none ${
            listOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:static lg:z-auto lg:w-80 lg:translate-x-0 lg:shadow-none lg:transition-none`}
        >
          <div className="space-y-3 border-b border-gray-100 p-3 dark:border-slate-700/60">
            <div className="flex items-center gap-2 px-1">
              <h1 className="tf-page-title tf-section-title">Team Chat</h1>
              {totalUnread > 0 && (
                <span className="tf-badge bg-brand-blue text-white" title={`${totalUnread} unread`}>
                  {totalUnread}
                </span>
              )}
              {/* Close the drawer (tablet/phone only) */}
              <button
                type="button"
                onClick={() => setListOpen(false)}
                className="-mr-1 ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand-blue lg:hidden dark:hover:bg-slate-800"
                aria-label="Close conversations"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-blue/60" />
              <input
                aria-label="Search conversations"
                type="text"
                placeholder="Search conversations"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="tf-input pl-9 pr-3 focus-visible:!outline-none"
              />
            </div>

            {/* All / Channels / Direct — the sliding white-tile toggle used across modules. */}
            <div
              role="radiogroup"
              aria-label="Show conversations"
              className="relative grid h-9 grid-cols-3 rounded-lg bg-brand-blue/5 p-1 ring-1 ring-brand-blue/10"
            >
              <span
                aria-hidden
                style={{ transform: `translateX(${tabIndex * 100}%)` }}
                className="absolute bottom-1 left-1 top-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out dark:bg-slate-800"
              />
              {(['direct', 'channels', 'all'] as const).map((tab) => (
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
            {(activeTab === 'all' || activeTab === 'direct') && (
              <div className="mb-2">
                {groupHeader('Direct messages', openNewDMModal, true, 'New direct message')}
                {filteredDMs.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    {!searchQuery && <MessageCircleMore className="mx-auto mb-1.5 h-7 w-7 text-[#7FB0FF]" strokeWidth={1.75} />}
                    <p className="tf-hint">{searchQuery ? 'No conversations match your search' : 'No direct messages yet'}</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">{filteredDMs.map(renderConversationRow)}</div>
                )}
              </div>
            )}

            {(activeTab === 'all' || activeTab === 'channels') && (
              <div>
                {groupHeader('Channels', openCreateModal, permissions.can_create_channel, 'Create channel', 'You do not have permission to create channels')}
                {filteredChannels.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    {!searchQuery && <MessageSquareText className="mx-auto mb-1.5 h-7 w-7 text-[#7FB0FF]" strokeWidth={1.75} />}
                    <p className="tf-hint">{searchQuery ? 'No channels match your search' : 'No channels yet'}</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">{filteredChannels.map(renderConversationRow)}</div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 px-3 py-2.5 dark:border-slate-700/60">
            <p className="text-center tf-hint">Messages are kept for 90 days</p>
          </div>
        </aside>

        {/* Dims the conversation while the drawer is open (tablet/phone); tap to close. */}
        <div
          aria-hidden
          onClick={() => setListOpen(false)}
          className={`absolute inset-0 z-20 bg-gray-900/30 transition-opacity duration-300 lg:hidden ${
            listOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />

        {/* ── Conversation ── */}
        <section className="flex min-w-0 flex-1 flex-col">
          {selectedChannel ? (
            <>
              <div className="relative flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-2 sm:px-4 dark:border-slate-700">
                <div className="flex min-w-0 items-center gap-2.5">
                  {/* Conversations drawer toggle — tablet/phone only, top-left
                      corner (where the drawer slides in from). */}
                  <button
                    type="button"
                    onClick={() => setListOpen((v) => !v)}
                    className={`-ml-0.5 shrink-0 lg:hidden ${iconButtonClass(listOpen)}`}
                    aria-label={listOpen ? 'Close conversations' : 'Open conversations'}
                    aria-expanded={listOpen}
                    aria-controls="chat-conversations"
                    title="Conversations"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  {partner ? (
                    <span className="relative shrink-0">
                      <NameAvatar name={partner.name} fallback={partner.email} userId={partner.user_id} size="md" />
                      {partner.is_online && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </span>
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                      {selectedChannel.is_private ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate tf-section-title max-sm:text-sm">{selectedChannel.name}</h2>
                      {isMuted && <BellOff className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="Muted" />}
                    </div>
                    <p className="truncate tf-meta">
                      {connectionStatus === 'closed' && (
                        <span className="mr-1 inline-flex items-center gap-1 text-brand-orange-deep" title="Live updates paused — checking for new messages every few seconds">
                          <Loader2 className="h-3 w-3 animate-spin" /> Reconnecting… ·
                        </span>
                      )}
                      {selectedChannel.type === 'channel'
                        ? `${selectedChannel.is_private ? 'Private · ' : ''}${selectedChannel.member_count} members · ${onlineMembersCount} online`
                        : partner?.is_online
                          ? <span className="font-medium text-green-600 dark:text-green-400">Online</span>
                          : 'Offline'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {/* Clear the message selection */}
                  {isSelecting && (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-blue/10 px-2 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15 transition-colors hover:bg-brand-blue/15"
                      aria-label="Clear selection"
                      title="Clear selection (Esc)"
                    >
                      {selectedMessageIds.size} <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Delete the selected messages */}
                  {isSelecting && (
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className={`${iconButtonClass(false)} hover:text-destructive`}
                      aria-label={`Delete ${selectedMessageIds.size} selected`}
                      title={`Delete selected (${selectedMessageIds.size})`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
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

                  {/* Pinned messages — the panel anchors to the button from sm up,
                      and to the full header width on phones. */}
                  <div className="sm:relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelecting) { void handleTogglePinSelected(); return; }
                        setShowPinnedPanel((v) => !v);
                        setShowHeaderMenu(false);
                      }}
                      disabled={isPinning}
                      className={`relative ${iconButtonClass(showPinnedPanel || isSelecting)} disabled:cursor-wait`}
                      aria-label={isSelecting ? `${selectionAllPinned ? 'Unpin' : 'Pin'} ${selectedMessageIds.size} selected` : 'Pinned messages'}
                      title={isSelecting ? `${selectionAllPinned ? 'Unpin' : 'Pin'} selected (${selectedMessageIds.size})` : 'Pinned messages'}
                    >
                      {/* Tilts while a message is selected — the button now pins it. */}
                      <Pin
                        className={`h-4 w-4 transition-transform duration-300 ${isSelecting ? 'rotate-45 text-brand-blue' : ''} ${
                          selectionAllPinned ? 'fill-brand-blue/20' : ''
                        }`}
                      />
                      {/* Badge: selection count while selecting, else the pinned count. */}
                      {isSelecting && (
                        <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-2xs font-semibold text-white">
                          {selectedMessageIds.size}
                        </span>
                      )}
                      {!isSelecting && pinnedMessages.length > 0 && (
                        <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-blue px-1 text-2xs font-semibold text-white">
                          {pinnedMessages.length}
                        </span>
                      )}
                    </button>
                    {showPinnedPanel && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowPinnedPanel(false)} />
                        <div className="absolute top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-xl max-sm:inset-x-2 sm:right-0 sm:mt-2 sm:max-h-96 sm:w-80 dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-center gap-1.5 px-2 py-1.5 tf-eyebrow tracking-wider">
                            <Pin className="h-3.5 w-3.5" /> Pinned messages
                          </div>
                          {pinnedMessages.length === 0 ? (
                            <p className="px-3 py-6 text-center tf-body-muted">No pinned messages yet</p>
                          ) : (
                            <div className="space-y-0.5">
                              {pinnedMessages.map((m) => (
                                <div key={m.id} className="flex items-start gap-2 rounded-lg px-2.5 py-2 hover:bg-gray-50 sm:px-3 dark:hover:bg-slate-800/60">
                                  <div className="min-w-0 flex-1">
                                    <span className="block truncate tf-caption">{m.user_name}</span>
                                    <p className="mt-0.5 line-clamp-2 break-words tf-body">{m.content}</p>
                                  </div>
                                  {/* Time, with Unpin under it */}
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className="tf-hint">{formatISTTime(m.created_at)}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleUnpinMessage(m.id)}
                                      disabled={unpinningId === m.id}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue disabled:cursor-wait"
                                      aria-label="Unpin message"
                                      title="Unpin"
                                    >
                                      {unpinningId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PinOff className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
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
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 tf-body transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60"
                          >
                            {isMuted ? <Bell className="h-4 w-4 text-gray-400" /> : <BellOff className="h-4 w-4 text-gray-400" />}
                            {isMuted ? 'Unmute notifications' : 'Mute notifications'}
                          </button>
                          {selectedChannel.type === 'channel' && (
                            <>
                              <button
                                type="button"
                                onClick={openAddMembersModal}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 tf-body transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60"
                              >
                                <UserPlus className="h-4 w-4 text-gray-400" /> Add members
                              </button>
                              <button
                                type="button"
                                onClick={handleLeaveChannel}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 tf-body transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60"
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
                          {selectedChannel.type === 'direct' && (
                            <>
                              <div className="my-1 h-px bg-gray-100 dark:bg-slate-700/60" />
                              <button
                                type="button"
                                onClick={handleDeleteDirectChat}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive-subtle"
                              >
                                <Trash2 className="h-4 w-4" /> Delete chat
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
                  <p className="truncate tf-meta" title={selectedChannel.description}>
                    {selectedChannel.description}
                  </p>
                </div>
              )}

              <div
                ref={messagesPaneRef}
                onScroll={handleMessagesScroll}
                className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50/60 px-3 py-4 sm:px-5 dark:bg-slate-950/30"
              >
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
                    <p className="tf-section-title max-sm:text-sm">No messages yet</p>
                    <p className="mt-1 tf-body-muted">
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
                      const showMeta = groupEnd || message.is_pinned || message.is_edited || activeMessageId === message.id;
                      const actionsOpen = activeMessageId === message.id || showEmojiPicker === message.id;
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
                      const actionButtons = (
                                    <div
                                      className={`flex items-center gap-0.5 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${
                                        isSender ? 'order-first flex-row-reverse' : ''
                                      } ${actionsOpen ? 'opacity-100' : 'opacity-0'}`}
                                    >
                                      {!message.is_deleted && (<>
                                      <div className="relative">
                                        <button
                                          type="button"
                                          onClick={() => setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id)}
                                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-white hover:text-brand-blue dark:hover:bg-slate-800 ${
                                            showEmojiPicker === message.id ? 'text-brand-blue' : 'text-gray-400'
                                          }`}
                                          aria-label="Add reaction"
                                          title="Add reaction"
                                        >
                                          <Smile className="h-3.5 w-3.5" />
                                        </button>
                                        {showEmojiPicker === message.id && (
                                          <>
                                            <div className="fixed inset-0 z-[9]" onClick={() => setShowEmojiPicker(null)} />
                                            <div
                                              className={`absolute bottom-full z-10 mb-1 flex gap-0.5 rounded-xl border border-gray-200 bg-white p-1 shadow-lg sm:p-1.5 dark:border-slate-700 dark:bg-slate-900 ${
                                                isSender ? 'right-0' : 'left-0'
                                              }`}
                                            >
                                              {quickEmojis.map((emoji) => (
                                                <button
                                                  key={emoji}
                                                  type="button"
                                                  onClick={() => { handleAddReaction(message.id, emoji); setShowEmojiPicker(null); }}
                                                  className="rounded-md p-1 text-base max-sm:text-sm transition-transform hover:scale-110 hover:bg-brand-blue/[0.06] sm:p-1.5 sm:text-lg"
                                                >
                                                  {emoji}
                                                </button>
                                              ))}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                      {!isImage && message.content && (
                                        <button
                                          type="button"
                                          onClick={() => handleCopyMessage(message)}
                                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-white hover:text-brand-blue dark:hover:bg-slate-800 ${
                                            copiedMessageId === message.id ? 'text-success' : 'text-gray-400'
                                          }`}
                                          aria-label="Copy message"
                                          title="Copy"
                                        >
                                          {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                        </button>
                                      )}
                                      </>)}
                                      {/* Delete for me / for everyone (also clears a "deleted" placeholder). */}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteMessage(message)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-destructive dark:hover:bg-slate-800"
                                        aria-label="Delete message"
                                        title="Delete"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                      );

                      return (
                        <Fragment key={message.id}>
                          {showDateSeparator && (
                            <div className="flex items-center gap-3 py-3">
                              <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
                              <span className="tf-badge bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
                                {dayLabel === todayLabel ? 'Today' : dayLabel}
                              </span>
                              <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
                            </div>
                          )}
                          <div className={`group flex gap-2.5 ${isSender ? 'justify-end' : ''} ${groupStart ? 'mt-3 first:mt-0' : 'mt-0.5'}`}>
                            {/* Your own messages need no avatar — the right side and blue bubble say it. */}
                            {!isSender && (groupStart ? (
                              <NameAvatar name={message.user_name} userId={message.user_id} size="md" />
                            ) : (
                              <div className="w-9 shrink-0" aria-hidden />
                            ))}

                            <div className={`relative flex max-w-[80%] flex-col sm:max-w-[65%] ${isSender ? 'items-end' : 'items-start'}`}>
                              {/* No time row under this one: its actions float beside the
                                  bubble on hover (mouse only — touch taps or long-presses). */}
                              {!showMeta && (
                                <div className={`absolute top-1/2 z-[5] -translate-y-1/2 [@media(hover:none)]:hidden ${isSender ? 'right-full mr-1' : 'left-full ml-1'}`}>
                                  {actionButtons}
                                </div>
                              )}
                              {groupStart && !isSender && (
                                <span className="mb-1 px-1 tf-caption">
                                  {message.user_name}
                                </span>
                              )}

                              <div
                                className={`${bubbleClass} max-w-full transition-shadow [@media(hover:none)]:select-none [-webkit-touch-callout:none] ${
                                  selectedMessageIds.has(message.id) ? 'ring-2 ring-brand-blue/50 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950' : ''
                                }`}
                                aria-selected={selectedMessageIds.has(message.id)}
                                onTouchStart={() => { if (!message.is_deleted) startLongPress(message.id); }}
                                onTouchEnd={cancelLongPress}
                                onTouchMove={cancelLongPress}
                                onContextMenu={(e) => { if (longPressFiredRef.current) e.preventDefault(); }}
                                // Stop the double-click from highlighting text.
                                onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }}
                                onDoubleClick={() => { if (!isSelecting && !message.is_deleted) toggleSelectMessage(message.id); }}
                                onClick={(e) => {
                                  if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
                                  // Selecting: a tap/click adds or removes this message.
                                  if (isSelecting) {
                                    e.preventDefault();
                                    if (!message.is_deleted) toggleSelectMessage(message.id);
                                    return;
                                  }
                                  if ((e.target as HTMLElement).closest('a')) return;
                                  setActiveMessageId((id) => (id === message.id ? null : message.id));
                                }}
                              >
                                {isImage ? (
                                  // Opens the in-page viewer (download / open in new tab live there).
                                  <button
                                    type="button"
                                    className="block cursor-zoom-in"
                                    aria-label={`View ${message.metadata!.file_name || 'image attachment'}`}
                                    onClick={(e) => {
                                      // Long-press or selection mode: let the bubble handle the tap.
                                      if (longPressFiredRef.current || isSelecting) return;
                                      e.stopPropagation();
                                      setViewerAttachment({ url: message.metadata!.file_url!, name: message.metadata!.file_name });
                                    }}
                                  >
                                    <img
                                      src={message.metadata!.file_url}
                                      alt={message.metadata!.file_name || 'Image attachment'}
                                      className="block max-h-64 max-w-full object-contain"
                                    />
                                  </button>
                                ) : (
                                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                    {message.is_deleted ? 'This message was deleted' : message.content}
                                  </p>
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
                                      <span className="tf-caption">{reaction.count}</span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              {showMeta && (
                                <div className={`mt-1 flex items-center gap-1.5 px-1 ${isSender ? 'justify-end' : 'justify-start'}`}>
                                  <span className="tf-hint">{formatISTTime(message.created_at)}</span>
                                  {message.is_edited && <span className="tf-hint">· edited</span>}
                                  {message.is_pinned && (
                                    <span className="inline-flex items-center gap-0.5 text-xs text-brand-blue">
                                      · <Pin className="h-3 w-3" /> Pinned
                                    </span>
                                  )}

                                  {/* React + Copy + Delete — on the inner side of the time (after
                                      it for received, before it for sent, so the time stays flush with
                                      the bubble); on hover/focus, always on touch screens or once tapped. */}
                                  {actionButtons}
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
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 tf-meta shadow-sm ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
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
                <div className="flex items-end gap-1 tf-panel p-1.5 transition-colors focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/30">
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
                              className="rounded-md p-1.5 text-lg max-sm:text-base transition-transform hover:scale-110 hover:bg-brand-blue/[0.06]"
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
                    disabled={!messageInput.trim() || isSending}
                    className="tf-btn tf-btn-primary h-9 w-9 shrink-0 bg-brand-blue shadow-sm shadow-brand-blue/25 transition-colors hover:bg-brand-blue/90 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-slate-700 whitespace-normal gap-0 font-normal"
                    aria-label="Send message"
                    title="Send (Enter)"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1.5 hidden px-1 tf-hint sm:block">
                  Enter to send · Shift + Enter for a new line
                </p>
              </div>
            </>
          ) : (
            <div className="relative flex flex-1 items-center justify-center bg-slate-50/60 p-6 sm:p-8 dark:bg-slate-950/30">
              {/* No conversation open: the same top-left ☰ (tablet/phone) */}
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                className={`absolute left-2 top-2.5 lg:hidden ${iconButtonClass(listOpen)}`}
                aria-label={listOpen ? 'Close conversations' : 'Open conversations'}
                aria-expanded={listOpen}
                aria-controls="chat-conversations"
                title="Conversations"
              >
                <Menu className="h-5 w-5" />
              </button>
              <IllustratedEmptyState
                bordered={false}
                className="max-w-md"
                illustration={<TeamChatIllustration />}
                title="Welcome to Team Chat"
                description={channels.length === 0
                  ? 'No channels yet. Create one to bring your team into the conversation.'
                  : 'Pick a channel or direct message to start the conversation.'}
              >
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="primary"
                    onClick={openCreateModal}
                    aria-disabled={!permissions.can_create_channel}
                    title={!permissions.can_create_channel ? 'You do not have permission to create channels' : undefined}
                    className={`${(!permissions.can_create_channel ? 'cursor-not-allowed opacity-60' : undefined) ?? ''} disabled:opacity-50`}
                    icon={<Hash className="h-4 w-4" />}
                  >
                    New channel
                  </Button>
                  <Button variant="secondary" onClick={openNewDMModal} icon={<MessageCircle className="h-4 w-4" />}>
                    New message
                  </Button>
                </div>
              </IllustratedEmptyState>
            </div>
          )}
        </section>

        {/* ── Members (wide screens, channels) ── */}
        {showMembersSidebar && selectedChannel && selectedChannel.type === 'channel' && (
          <aside className="hidden w-64 shrink-0 flex-col border-l border-gray-200 lg:flex xl:w-72 dark:border-slate-700">
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 dark:border-slate-700">
              <div className="min-w-0">
                <h3 className="tf-section-title max-sm:text-sm">Members</h3>
                <p className="tf-meta">
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
                    <NameAvatar name={member.name} fallback={member.email} userId={member.user_id} size="md" />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                        member.is_online ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate tf-row-name">
                      {member.name}
                      {member.user_id === currentUser?.id && <span className="font-normal text-gray-400"> (You)</span>}
                    </p>
                    <p className="truncate tf-meta capitalize">{member.role?.replace(/_/g, ' ') || 'Member'}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
        </div>

        {/* Create Channel Modal */}
        {deleteTargets && (() => {
          const count = deleteTargets.length;
          const forEveryone = deleteTargets.every(canDeleteForEveryone);
          const allMine = deleteTargets.every((m) => m.user_id === currentUser?.id);
          const hasImage = deleteTargets.some((m) => m.message_type === 'file' && !m.is_deleted);
          const what = count > 1 ? `${count} messages` : hasImage ? 'image' : 'message';
          return (
            <AppModal
              open
              onCancel={() => { if (!deletingScope) setDeleteTargets(null); }}
              cancelDisabled={!!deletingScope}
              size="sm"
              icon={<Trash2 />}
              title={`Delete ${what}?`}
              /* Standard footer row (Cancel + actions, equal widths). Three
                 equal buttons need a little more than the small popup's width
                 for "Delete for everyone" to fit on one line. */
              widthClassName={forEveryone ? 'sm:max-w-[620px]' : undefined}
              actions={[
                {
                  label: deletingScope === 'me' ? 'Deleting…' : 'Delete for me',
                  onClick: () => performDelete('me'),
                  variant: forEveryone ? 'secondary' : 'destructive',
                  disabled: !!deletingScope,
                  loading: deletingScope === 'me',
                },
                ...(forEveryone
                  ? [{
                      label: deletingScope === 'everyone' ? 'Deleting…' : 'Delete for everyone',
                      onClick: () => performDelete('everyone'),
                      variant: 'destructive' as const,
                      disabled: !!deletingScope,
                      loading: deletingScope === 'everyone',
                    }]
                  : []),
              ]}
            >
              <div className="space-y-2 tf-body text-gray-600 dark:text-slate-300">
                {forEveryone ? (
                  <p>
                    <strong>Delete for everyone</strong> removes it for all members of this chat
                    {hasImage ? ', and the image is permanently deleted from storage' : ''}.{' '}
                    <strong>Delete for me</strong> removes it only from your view.
                  </p>
                ) : allMine ? (
                  <p>
                    Delete for everyone is only available for 24 hours after sending. You can still
                    remove it from your view; others in the chat will keep seeing it.
                  </p>
                ) : (
                  <p>It will be removed from your view only. Others in the chat will keep seeing it.</p>
                )}
                <p className="tf-hint">This can&apos;t be undone.</p>
              </div>
            </AppModal>
          );
        })()}

        <AppModal
          open={showCreateModal}
          onCancel={() => setShowCreateModal(false)}
          size="md"
          mobileSheet
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
                  <span className="mb-2 block tf-label">
                    Channel name <span className="text-brand-orange">*</span>
                  </span>
                  <div className="flex items-center gap-2 tf-panel px-3 py-2.5 transition-all focus-within:border-brand-blue/30 focus-within:ring-4 focus-within:ring-brand-blue/10">
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
                  <span className="mb-2 block tf-label">Description</span>
                  <textarea
                    value={newChannelDescription}
                    onChange={(e) => setNewChannelDescription(e.target.value)}
                    placeholder="What's this channel about?"
                    rows={2}
                    className="tf-textarea resize-none rounded-xl py-2.5 focus-visible:!outline-none"
                  />
                </label>

                <div>
                  <span className="mb-2 block tf-label">Visibility</span>
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
                  <span className="mb-2 block tf-label">Add members (optional)</span>
                  {isLoadingUsers ? (
                    <div className="space-y-2 tf-panel p-3">
                      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
                    </div>
                  ) : availableUsers.filter((u) => u.id !== currentUser?.id).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-6 text-center">
                      <Users className="mx-auto mb-2 h-6 w-6 text-gray-300" />
                      <p className="tf-meta">No teammates available</p>
                    </div>
                  ) : (
                    <div className="max-h-44 overflow-y-auto tf-panel">
                      {/* You're in the channel anyway. */}
                      {availableUsers.filter((u) => u.id !== currentUser?.id).map((user) => {
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
                            <NameAvatar name={user.name} fallback={user.email} src={user.avatar_url} userId={user.id} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate tf-row-name">{user.name}</p>
                              <p className="truncate tf-meta">{user.email}</p>
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
          mobileSheet
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
                {isLoadingUsers ? (
                  <div className="space-y-2 tf-panel p-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                  </div>
                ) : availableUsers.filter((user) => !selectedChannel?.members.some((m) => m.user_id === user.id))
                  .length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center">
                    <Users className="mx-auto mb-2 h-7 w-7 text-gray-300" />
                    <p className="tf-body-muted">No teammates left to add.</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto tf-panel">
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
                            <NameAvatar name={user.name} fallback={user.email} src={user.avatar_url} userId={user.id} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate tf-row-name">{user.name}</p>
                              <p className="truncate tf-meta">{user.email}</p>
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
          mobileSheet
          icon={<MessageCircle />}
          title="New direct message"
          subtitle="Pick a teammate to start a private chat."
          cancelDisabled={isCreatingDM}
        >
                <div className="overflow-hidden tf-panel">
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
                            <NameAvatar name={user.name} fallback={user.email} src={user.avatar_url} userId={user.id} size="lg" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate tf-row-name">{user.name}</p>
                              <p className="truncate tf-meta">{user.email}</p>
                            </div>
                            <span className="tf-badge hidden bg-slate-100 capitalize text-gray-600 sm:inline-flex">
                              {user.role?.replace(/_/g, ' ') || 'User'}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
        </AppModal>

      <ChatAttachmentViewer attachment={viewerAttachment} onClose={closeViewer} />
    </div>
  );
}
