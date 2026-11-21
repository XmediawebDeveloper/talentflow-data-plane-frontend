'use client';

/* Team Chat — the ChatNav sidebar, ConversationList, ChatHeader,
   MessageList, Composer and popups from components/team-chat, driven by the
   live chat API
   (lib/services/chatService) and its websocket.

   Live data → the UI's shapes: a Channel becomes a Conversation (channel =
   team, direct = direct), a Message becomes the UI Message, people are the
   active users from User Management plus every chat member.

   Kept from the previous page: per-conversation drafts, typing signal,
   reconnect + polling catch-up, refresh on tab return, unread badge
   (`chatUnreadChanged`), muted chats (this browser), 24-hour "delete for
   everyone", image attachments (5 MB), pin / unpin, selection.
   Not in the API, so not shown here: archive, team icons, team admins,
   read receipts. */

import { useState, useRef, useEffect, useLayoutEffect, useCallback, type CSSProperties } from 'react';
import { ArrowDown, Loader2, LogOut, MessageSquareText, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import chatService, {
  ChatConnectionStatus,
  Channel,
  Message as LiveMessage,
  MessageListResponse,
  Reaction as LiveReaction,
} from '@/lib/services/chatService';
import { getTokens } from '@/lib/services/api';
import userService, { ApiUser } from '@/lib/services/userService';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { useSearchParams } from 'next/navigation';
import { parseIST } from '@/lib/utils/dateUtils';
import { Skeleton } from '@/components/ui/skeleton';
import AppModal from '@/components/ui/app-modal';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import ChatAttachmentViewer, { type ChatAttachment } from '@/components/organization/ChatAttachmentViewer';
import ChatDoodle from '@/components/organization/ChatDoodle';
import type { Attachment, Conversation, Message, Person } from '@/components/team-chat/types';
import { registerPeople, titleOf } from '@/components/team-chat/people';
import ChatNav, { type NavCounts, type NavSection } from '@/components/team-chat/ChatNav';
import ConversationList from '@/components/team-chat/ConversationList';
import ChatHeader from '@/components/team-chat/ChatHeader';
import MessageList, { QUICK_EMOJIS } from '@/components/team-chat/MessageList';
import Composer, { type ComposerHandle } from '@/components/team-chat/Composer';
import {
  CreateTeamDialog, TeamDetailsDialog, FilesDialog, ForwardDialog, MembersDialog, NewDirectDialog, PinnedDialog, ProfileDialog,
} from '@/components/team-chat/Dialogs';
import { IconBtn } from '@/components/team-chat/ui';

/** Chat theme: the global Info blue (globals.css --info). Every brand-blue
 *  utility inside the chat window reads var(--brand-blue), so re-pointing it
 *  here colours buttons, own messages, badges and active rows — chat only. */
const CHAT_THEME = { '--brand-blue': 'var(--info)', '--brand-blue-2': 'var(--info)' } as CSSProperties;

const SECTION_TITLE: Record<NavSection, string> = {
  all: 'Messages', teams: 'Teams', direct: 'Direct messages', archived: 'Archived',
};
/** The API has no archive. */
const HIDDEN_SECTIONS: NavSection[] = ['archived'];

type DialogKind = null | 'members' | 'details' | 'profile' | 'pinned' | 'files' | 'new-direct' | 'create-team';

/** Own messages can be deleted for everyone within 24 hours of sending. */
const DELETE_FOR_EVERYONE_MS = 24 * 60 * 60 * 1000;
const ALLOWED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

/** How often this browser reacted with each emoji — favourites come first. */
const EMOJI_USE_KEY = 'chat:emoji-use';
const readEmojiUse = (): Record<string, number> => {
  try {
    return typeof window === 'undefined' ? {} : JSON.parse(localStorage.getItem(EMOJI_USE_KEY) || '{}');
  } catch {
    return {};
  }
};
/** Muted chats — no backend mute endpoint, so kept in this browser. */
const MUTED_KEY = 'chatMutedChannels';
const readMuted = (): Set<string> => {
  try {
    return new Set(typeof window === 'undefined' ? [] : JSON.parse(localStorage.getItem(MUTED_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

/** Server time (IST-aware parse) → ms. */
const ts = (iso?: string | null) => {
  if (!iso) return 0;
  const t = parseIST(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};
const prettyRole = (role?: string) => (role ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (s) => s.toUpperCase());
const isImageMessage = (m: LiveMessage) => m.message_type === 'file' && !m.is_deleted && !!m.metadata?.file_url;
/** Conversation-list fields for a newly arrived/sent message ("📷 Photo" for images, as the server does). */
const previewFields = (m: LiveMessage) => ({
  last_message: m.message_type === 'file' ? '📷 Photo' : m.content,
  last_message_by: m.user_name,
  last_message_user_id: m.user_id,
  last_message_at: m.created_at,
});

/** A live message in the UI's shape. */
function toUiMessage(m: LiveMessage): Message {
  const image = isImageMessage(m);
  return {
    id: m.id,
    authorId: m.user_id,
    text: m.is_deleted || image ? '' : m.content ?? '',
    at: ts(m.created_at),
    reactions: (m.reactions ?? []).map((r) => ({ emoji: r.emoji, userIds: r.user_ids ?? [] })),
    attachments: image
      ? [{ id: `att-${m.id}`, kind: 'image', name: m.metadata?.file_name || 'Image', size: '', url: m.metadata?.file_url }]
      : undefined,
    replyToId: m.reply_to_id ?? undefined,
    replyQuote: m.reply_to_id && m.reply_to_preview != null
      ? { authorId: m.reply_to_user_id ?? undefined, authorName: m.reply_to_user_name || 'Unknown', text: m.reply_to_preview }
      : undefined,
    editedAt: m.is_edited ? ts(m.updated_at) || 1 : undefined,
    forwardedFrom: m.metadata?.forwarded_from || undefined,
    pinned: m.is_pinned,
    deleted: m.is_deleted,
  };
}

export default function TeamChatPage() {
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();
  const dialog = useGlobalDialog();

  /* ── Live data ── */
  const [channels, setChannels] = useState<Channel[]>([]);
  const [directMessages, setDirectMessages] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [permissions, setPermissions] = useState<{ can_create_channel: boolean; role: string }>({
    can_create_channel: false,
    role: '',
  });
  const [availableUsers, setAvailableUsers] = useState<ApiUser[]>([]);
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(readMuted);
  const [connectionStatus, setConnectionStatus] = useState<ChatConnectionStatus>('connecting');
  // Keep the header's chat badge in step (once the list has loaded — the
  // initial 0 isn't a real count).
  useEffect(() => {
    if (!isLoading) window.dispatchEvent(new CustomEvent('chatUnreadChanged', { detail: totalUnread }));
  }, [totalUnread, isLoading]);

  /* ── UI state ── */
  const [section, setSection] = useState<NavSection>('all');
  const [query, setQuery] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  // Set once leaveOpenConversation is defined (the socket handler is declared above it).
  const leaveOpenConversationRef = useRef<(channelId: string) => Promise<void>>(async () => {});
  const [openDialog, setOpenDialog] = useState<DialogKind>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  // First unread message on opening (the "New messages" divider).
  const [newFromId, setNewFromId] = useState<string | null>(null);
  // The composer's starting text (this conversation's draft) and a nonce to
  // remount it (a failed send gives the text back).
  const [composerText, setComposerText] = useState('');
  const [composerNonce, setComposerNonce] = useState(0);
  const [emojiUse, setEmojiUse] = useState<Record<string, number>>(readEmojiUse);
  const favEmojis = [
    ...Object.entries(emojiUse).sort((a, b) => b[1] - a[1]).map(([e]) => e),
    ...QUICK_EMOJIS,
  ].filter((e, i, all) => all.indexOf(e) === i).slice(0, 6);
  const [viewerAttachment, setViewerAttachment] = useState<ChatAttachment | null>(null);
  const closeViewer = useCallback(() => setViewerAttachment(null), []);
  const [deleteTargets, setDeleteTargets] = useState<LiveMessage[] | null>(null);
  const [deletingScope, setDeletingScope] = useState<'everyone' | 'me' | null>(null);
  const [isPinning, setIsPinning] = useState(false);

  /* ── Refs ── */
  // Unsent text per conversation, so a draft never follows you into another chat.
  const draftsRef = useRef<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<ComposerHandle | null>(null);
  // The open conversation's id for async callbacks (sockets, timers).
  const selectedChannelIdRef = useRef<string | null>(null);
  /* The first conversation's messages, delivered with the channel list on
     landing (GET /chat/channels?include_messages=true) — used once by
     fetchMessages instead of a second round trip. */
  const prefetchedMessagesRef = useRef<{ channelId: string; data: MessageListResponse } | null>(null);
  const connectionStatusRef = useRef<ChatConnectionStatus>('connecting');
  // A message pushed while the tab was hidden stays unread until the reader is back.
  const unreadWhileHiddenRef = useRef(false);
  const channelsRefreshedAtRef = useRef(0);
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

  /* ── Selection ── */
  const isSelecting = selected.size > 0;
  const clearSelection = () => setSelected(new Set());
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setReactFor(null);
  };
  // Esc clears the selection.
  useEffect(() => {
    if (!isSelecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(new Set()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSelecting]);

  // Any unpinned in the selection → pin those; all already pinned → unpin all.
  const handleTogglePinSelected = async () => {
    const chosen = messages.filter((m) => selected.has(m.id) && !m.is_deleted);
    if (chosen.length === 0 || isPinning) return;
    const unpinned = chosen.filter((m) => !m.is_pinned);
    const pin = unpinned.length > 0;
    const targets = pin ? unpinned : chosen;
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
        const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        showErrorToast(firstError?.reason ?? null, `Couldn't ${pin ? 'pin' : 'unpin'} ${failed} message${failed === 1 ? '' : 's'}`);
        // Keep only the failed ones selected so a retry is one tap.
        setSelected(new Set(targets.filter((m) => !done.has(m.id)).map((m) => m.id)));
      } else {
        clearSelection();
      }
    } finally {
      setIsPinning(false);
    }
  };

  const handlePin = async (messageId: string, pin: boolean) => {
    try {
      if (pin) await chatService.pinMessage(messageId);
      else await chatService.unpinMessage(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_pinned: pin } : m)));
      toast.success(pin ? 'Message pinned' : 'Message unpinned');
    } catch (error) {
      showErrorToast(error, pin ? "Couldn't pin message" : "Couldn't unpin message");
    }
  };

  /* Delete: "Delete for everyone" (own messages, within 24 hours of sending —
     the text goes for all and an image is deleted from storage) or "Delete
     for me" (any message, any time — only your view). */
  const canDeleteForEveryone = (m: LiveMessage) =>
    m.user_id === currentUser?.id &&
    !m.is_deleted &&
    Date.now() - ts(m.created_at) < DELETE_FOR_EVERYONE_MS;
  const handleDeleteSelected = () => {
    const chosen = messages.filter((m) => selected.has(m.id));
    if (chosen.length > 0) setDeleteTargets(chosen);
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
        setSelected((prev) => {
          const next = new Set([...prev].filter((id) => !done.has(id)));
          return next.size === prev.size ? prev : next;
        });
        const noun = done.size === 1 ? 'Message' : `${done.size} messages`;
        toast.success(`${noun} deleted${scope === 'me' ? ' for you' : ' for everyone'}`);
      }
      const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (firstError) showErrorToast(firstError.reason, "Couldn't delete message");
      setDeleteTargets(null);
    } finally {
      setDeletingScope(null);
    }
  };

  /* ── Loading ── */
  // Declared first so it's current before the fetch effects below run.
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannel?.id ?? null;
  }, [selectedChannel?.id]);

  // Active users (User Management) — people to chat with, names, avatars, last seen.
  const loadUsers = () => {
    userService.listUsers({ is_active: true }).then(setAvailableUsers).catch((error) => {
      console.error('Error fetching users:', error);
    });
  };
  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    fetchChannels();
    fetchPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* A conversation always opens at its newest message; older ones are a
     scroll up. While the reader is at the bottom the pane stays there as
     content grows (images loading); scrolling up releases it, so someone
     else's new message doesn't yank the reader away — their own always
     brings them back down. */
  const stickToBottomRef = useRef(true);
  const lastMessageIdRef = useRef<string | undefined>(undefined);
  const jumpToEndRef = useRef(true);
  const scrollPaneToEnd = (smooth = false) => {
    const pane = scrollRef.current;
    if (!pane) return;
    if (smooth) pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
    else pane.scrollTop = pane.scrollHeight;
  };
  const handlePaneScroll = (bottom: boolean) => {
    stickToBottomRef.current = bottom;
    setAtBottom(bottom);
  };
  useLayoutEffect(() => {
    if (isLoadingMessages) return;
    const last = messages[messages.length - 1];
    if (jumpToEndRef.current) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoadingMessages]);
  // Images finishing their load push the bottom down — follow while at the bottom.
  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane) return;
    const onLoad = () => { if (stickToBottomRef.current) scrollPaneToEnd(); };
    pane.addEventListener('load', onLoad, true);
    return () => pane.removeEventListener('load', onLoad, true);
  }, [isLoadingMessages, selectedChannel?.id]);
  // The typing bubble appears at the bottom — keep it in view.
  useEffect(() => {
    if (stickToBottomRef.current) scrollPaneToEnd();
  }, [typingUsers]);

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel.id, { unread: selectedChannel.unread_count });
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
      connectionStatusRef.current = status;
      setConnectionStatus(status);
      if (status === 'closed') wasDisconnected = true;
      if (status === 'open' && wasDisconnected) {
        wasDisconnected = false;
        fetchMessages(channelId, { silent: true });
        refreshChannelsSilently();
      }
    });

    chatService.connectWebSocket(channelId, accessToken);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            const msgChannelId = data.message.channel_id;
            const bump = (list: Channel[]) =>
              list.map((ch) =>
                ch.id === msgChannelId
                  ? { ...ch, ...previewFields(data.message) }
                  : ch,
              );
            setChannels(bump);
            setDirectMessages(bump);
            // Away (tab hidden): leave it unread; returning to the tab marks it read.
            if (document.visibilityState === 'visible') void chatService.markAsRead(selectedChannel.id);
            else unreadWhileHiddenRef.current = true;
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
                m.id === data.message_id ? { ...m, is_deleted: true, content: '', metadata: null, is_pinned: false } : m,
              ),
            );
          }
          break;
        }
        case 'reaction_add':
        case 'reaction_remove': {
          if (data.message_id && Array.isArray(data.reactions)) {
            setMessages((prev) => prev.map((m) => (m.id === data.message_id ? { ...m, reactions: data.reactions } : m)));
          } else {
            fetchMessages(channelId, { silent: true });
          }
          break;
        }
        case 'member_removed': {
          if (data.user_id && data.user_id === currentUser?.id) {
            toast.info('You were removed from this team');
            // A private team is gone for them; a public one stays readable.
            if (selectedChannel.is_private) void leaveOpenConversationRef.current(channelId);
            else void refreshChannelsSilently();
          } else {
            void refreshChannelsSilently();
          }
          break;
        }
        case 'members_added':
        case 'channel_update': {
          void refreshChannelsSilently();
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

  // Keep the conversation list fresh (other conversations' unread counts and
  // previews aren't on the open conversation's socket), and catch up whenever
  // the tab comes back into view.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshChannelsSilently();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - channelsRefreshedAtRef.current >= 30000) refreshChannelsSilently();
      const openId = selectedChannelIdRef.current;
      if (!openId) return;
      if (connectionStatusRef.current === 'open') {
        if (unreadWhileHiddenRef.current) {
          unreadWhileHiddenRef.current = false;
          void chatService.markAsRead(openId);
        }
        return;
      }
      fetchMessages(openId, { silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // `initial`: the first load. `selectFirst`: pick the first conversation even
  // though one was open (the open one was just left or deleted).
  const fetchChannels = async ({ initial = true, selectFirst = false }: { initial?: boolean; selectFirst?: boolean } = {}) => {
    try {
      if (initial) {
        setIsLoading(true);
        setLoadError(false);
      }
      const channelIdFromUrl = searchParams.get('channel');
      // Landing: the first conversation's messages ride along with the list.
      const response = await chatService.listChannels(
        initial ? { includeMessages: true, open: channelIdFromUrl } : undefined,
      );
      channelsRefreshedAtRef.current = Date.now();
      prefetchedMessagesRef.current = response.open_channel_id && response.open_messages
        ? { channelId: response.open_channel_id, data: response.open_messages }
        : null;
      setChannels(response.channels);
      setDirectMessages(response.direct_messages);
      setTotalUnread(response.total_unread);

      if (channelIdFromUrl) {
        const target = [...response.channels, ...response.direct_messages].find((ch) => ch.id === channelIdFromUrl);
        if (target) {
          setSelectedChannel(target);
          setSection(target.type === 'direct' ? 'direct' : 'teams');
          setMobileView('chat');
          return;
        }
      }

      // Open the most recent conversation (the server lists them newest first).
      if (selectFirst || !selectedChannel) {
        const first = response.direct_messages[0] ?? response.channels[0];
        if (first) setSelectedChannel(first);
      }
    } catch (error: unknown) {
      console.error('Error fetching channels:', error);
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 404) {
        if (initial) setLoadError(true);
        showErrorToast(error, "Couldn't load conversations", {
          id: 'team-chat-channels',
          retry: () => fetchChannels({ initial, selectFirst }),
        });
      }
    } finally {
      if (initial) setIsLoading(false);
    }
  };

  // `silent`: a background catch-up (reconnect, polling, tab refocus) — no
  // skeleton, no error toast. `unread`: on opening, where the divider goes.
  const fetchMessages = async (
    channelId: string,
    { silent = false, unread = 0 }: { silent?: boolean; unread?: number } = {},
  ) => {
    try {
      if (!silent) {
        setIsLoadingMessages(true);
        // Never show the previous conversation's messages under this one's header.
        setMessages([]);
        setNewFromId(null);
        jumpToEndRef.current = true;
      }
      const prefetched = prefetchedMessagesRef.current;
      prefetchedMessagesRef.current = null;
      const response = !silent && prefetched?.channelId === channelId
        ? prefetched.data
        : await chatService.listMessages(channelId);
      // A slow response for a conversation the user has already left must
      // not overwrite the open one.
      if (selectedChannelIdRef.current !== channelId) return;
      // Merge, don't replace: a message that came over the socket after the
      // server built this snapshot must not vanish.
      setMessages((prev) => {
        const ids = new Set(response.messages.map((m) => m.id));
        const lastAt = response.messages[response.messages.length - 1]?.created_at ?? '';
        const newer = prev.filter((m) => !ids.has(m.id) && m.channel_id === channelId && m.created_at > lastAt);
        return newer.length > 0 ? [...response.messages, ...newer] : response.messages;
      });
      /* No separate POST /read: GET /channels/{id}/messages already marks the
         channel and its chat notifications read server-side. */
      unreadWhileHiddenRef.current = false;
      if (!silent) {
        const others = response.messages.filter((m) => m.user_id !== currentUser?.id);
        setNewFromId(unread > 0 && others.length > 0 ? others[Math.max(0, others.length - unread)].id : null);
      }

      setChannels((prev) => {
        const updated = prev.map((ch) => (ch.id === channelId ? { ...ch, unread_count: 0 } : ch));
        setDirectMessages((prevDMs) => {
          const updatedDMs = prevDMs.map((dm) => (dm.id === channelId ? { ...dm, unread_count: 0 } : dm));
          setTotalUnread([...updated, ...updatedDMs].reduce((sum, c) => sum + (c.unread_count || 0), 0));
          return updatedDMs;
        });
        return updated;
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      if (!silent && selectedChannelIdRef.current === channelId) {
        showErrorToast(error, "Couldn't load messages", {
          id: 'team-chat-messages',
          retry: () => fetchMessages(channelId),
        });
      }
    } finally {
      // A stale request (the user already moved on) must not end the newer one's loading state.
      if (!silent && selectedChannelIdRef.current === channelId) setIsLoadingMessages(false);
    }
  };

  // Background refresh of the conversation list — unread counts and previews
  // of OTHER conversations (the live socket only covers the open one).
  const refreshChannelsSilently = async () => {
    try {
      channelsRefreshedAtRef.current = Date.now();
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

  // Manual refresh of the chat only (open conversation + conversation list).
  const handleRefreshChat = async () => {
    const openId = selectedChannelIdRef.current;
    if (!openId) return;
    await Promise.all([fetchMessages(openId, { silent: true }), refreshChannelsSilently()]);
    toast.success('Chat refreshed');
  };

  /** Opens a conversation, keeping each one's unsent draft. */
  const openChannel = (channel: Channel) => {
    if (selectedChannelIdRef.current !== channel.id) {
      setComposerText(draftsRef.current[channel.id] ?? '');
      setSelectedChannel(channel);
    }
    setMobileView('chat');
    setFindOpen(false);
    setFind('');
    setSelected(new Set());
    setReplyTo(null);
    setEditing(null);
    setReactFor(null);
    stickToBottomRef.current = true;
    setAtBottom(true);
  };
  const openById = (id: string) => {
    const channel = [...channels, ...directMessages].find((c) => c.id === id);
    if (channel) openChannel(channel);
  };

  const toggleMute = (id: string) => {
    setMutedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(MUTED_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
    toast.success(mutedChannels.has(id) ? 'Notifications on' : 'Muted');
  };

  const leaveOpenConversation = async (channelId: string) => {
    delete draftsRef.current[channelId];
    setSelectedChannel(null);
    setMessages([]);
    setMobileView('list');
    setOpenDialog(null);
    await fetchChannels({ initial: false, selectFirst: true });
  };
  useEffect(() => {
    leaveOpenConversationRef.current = leaveOpenConversation;
  });

  const handleLeaveChannel = async () => {
    if (!selectedChannel) return;
    const ok = await dialog.confirm({
      title: 'Leave team',
      message: `Leave "${selectedChannel.name}"? You'll need to be re-added to rejoin.`,
      variant: 'warning',
      confirmText: 'Leave',
    });
    if (!ok) return;
    try {
      await chatService.leaveChannel(selectedChannel.id);
      toast.success('Left team');
      await leaveOpenConversation(selectedChannel.id);
    } catch (e) {
      showErrorToast(e, "Couldn't leave team");
    }
  };

  const handleDeleteChannel = async () => {
    if (!selectedChannel) return;
    const ok = await dialog.confirm({
      title: 'Delete Team',
      message: 'Are you sure you want to delete this team?\nThis action cannot be undone.',
      variant: 'delete',
      confirmText: 'Delete Team',
      item: { label: 'TEAM', name: selectedChannel.name },
      warningNote: 'Deleting this team will permanently remove it and all its messages.',
    });
    if (!ok) return;
    try {
      await chatService.deleteChannel(selectedChannel.id);
      toast.success('Team deleted');
      await leaveOpenConversation(selectedChannel.id);
    } catch (e) {
      showErrorToast(e, "Couldn't delete team");
    }
  };

  // "Delete chat" on a direct conversation — for this user only; the other
  // person keeps the history and a new message brings the chat back.
  const handleDeleteDirectChat = async () => {
    if (!selectedChannel || selectedChannel.type !== 'direct') return;
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
      await leaveOpenConversation(selectedChannel.id);
    } catch (e) {
      showErrorToast(e, "Couldn't delete chat");
    }
  };

  /* ── Sending ── */
  // My own message moves its conversation to the top of the list (the socket
  // only tells the others).
  const bumpConversation = (channelId: string, msg: LiveMessage) => {
    const bump = (list: Channel[]) =>
      list.map((c) =>
        c.id === channelId
          ? { ...c, ...previewFields(msg) }
          : c,
      );
    setChannels(bump);
    setDirectMessages(bump);
  };
  const addSent = (channelId: string, msg: LiveMessage) => {
    // Only into the conversation it was sent to; the socket may already have delivered it.
    if (selectedChannelIdRef.current === channelId) {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    }
    bumpConversation(channelId, msg);
  };

  const handleSend = async ({ text, attachments }: { text: string; attachments: Attachment[] }) => {
    if (!selectedChannel) return;
    const channelId = selectedChannel.id;
    const reply = replyTo;
    setReplyTo(null);
    stopTyping();
    delete draftsRef.current[channelId];
    stickToBottomRef.current = true;
    setAtBottom(true);

    // Images first (each its own message), then the text.
    for (const a of attachments) {
      if (!a.file) continue;
      if (!ALLOWED_ATTACHMENT_TYPES.includes(a.file.type) || a.file.size > MAX_ATTACHMENT_SIZE_BYTES) continue;
      try {
        addSent(channelId, await chatService.uploadAttachment(channelId, a.file));
      } catch (error) {
        console.error('Error uploading attachment:', error);
        showErrorToast(error, `Couldn't upload ${a.name}`);
      } finally {
        if (a.url) URL.revokeObjectURL(a.url);
      }
    }

    const content = text.trim() ? text : '';
    if (!content) return;
    try {
      const sent = await chatService.sendMessage(channelId, reply ? { content, reply_to_id: reply.id } : { content });
      addSent(channelId, sent);
    } catch (error) {
      console.error('Error sending message:', error);
      showErrorToast(error, "Couldn't send message");
      // Give the text back — to the box if still here, else to that chat's draft.
      draftsRef.current[channelId] = content;
      if (selectedChannelIdRef.current === channelId) {
        setComposerText(content);
        setComposerNonce((n) => n + 1);
        if (reply) setReplyTo((cur) => cur ?? reply);
      }
    }
  };

  const handleSaveEdit = async (text: string) => {
    const target = editing;
    setEditing(null);
    if (!target) return;
    const content = text.trim();
    const original = messages.find((m) => m.id === target.id);
    if (!content || content === original?.content.trim()) return;
    try {
      const updated = await chatService.updateMessage(target.id, content);
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, ...updated, is_edited: true } : m)));
      toast.success('Message edited');
    } catch (error) {
      showErrorToast(error, "Couldn't edit message");
    }
  };

  const handleAddReaction = async (messageId: string, emoji: string) => {
    const me = currentUser?.id;
    const myName = currentUser?.name || 'You';
    // Already mine → this click takes it back.
    const alreadyMine = !!me && !!messages
      .find((m) => m.id === messageId)
      ?.reactions.find((r) => r.emoji === emoji)
      ?.user_ids?.includes(me);
    const channelId = selectedChannel?.id;
    // Optimistic: toggle my reaction in place.
    if (me) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === emoji);
          let reactions: LiveReaction[];
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
      showErrorToast(error, alreadyMine ? "Couldn't remove reaction" : "Couldn't add reaction");
    }
    // Reconcile with the server quietly (also undoes the optimistic change on failure).
    if (channelId) void fetchMessages(channelId, { silent: true });
  };
  const handleReact = (messageId: string, emoji: string) => {
    void handleAddReaction(messageId, emoji);
    setEmojiUse((use) => {
      const next = { ...use, [emoji]: (use[emoji] ?? 0) + 1 };
      try { localStorage.setItem(EMOJI_USE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  const handleCopy = async (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.content ?? '');
      setCopiedId(messageId);
      toast.success('Copied');
      setTimeout(() => setCopiedId((id) => (id === messageId ? null : id)), 1500);
    } catch (error) {
      showErrorToast(error, "Couldn't copy message");
    }
  };

  // Forward a message into other conversations (marked "Forwarded from …").
  const handleForward = async (targetIds: string[]) => {
    const source = forwarding ? messages.find((m) => m.id === forwarding.id) : undefined;
    setForwarding(null);
    if (!source || targetIds.length === 0) return;
    // One call for all targets: the server checks access, labels each copy
    // "Forwarded from <original author>" and gives an image its own file copy
    // (re-posting the metadata was refused, and a shared file broke on delete).
    try {
      const sent = await chatService.forwardMessage(source.id, targetIds);
      sent.forEach((msg) => addSent(msg.channel_id, msg));
      if (sent.length > 0) toast.success(`Forwarded to ${sent.length}`);
      if (sent.length < targetIds.length) {
        toast.error(`Couldn't forward to ${targetIds.length - sent.length} conversation(s)`);
      }
    } catch (error) {
      showErrorToast(error, "Couldn't forward message");
    }
  };

  /* ── Teams & people ── */
  const handleCreateTeam = async (input: { name: string; description: string; memberIds: string[] }) => {
    setOpenDialog(null);
    try {
      const channel = await chatService.createChannel({
        name: input.name.trim(),
        description: input.description.trim() || undefined,
        is_private: false,
        member_ids: input.memberIds,
      });
      toast.success(`Team “${input.name.trim()}” created`);
      setSection('teams');
      await fetchChannels({ initial: false });
      openChannel(channel);
    } catch (error) {
      console.error('Error creating team:', error);
      showErrorToast(error, "Couldn't create team");
    }
  };

  const handleUpdateTeam = async (input: { name: string; description: string }) => {
    if (!selectedChannel) return;
    const id = selectedChannel.id;
    const name = input.name.trim();
    const description = input.description.trim();
    try {
      const updated = await chatService.updateChannel(id, { name, description });
      const patch = { name: updated?.name ?? name, description: updated?.description ?? (description || null) };
      setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      setSelectedChannel((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
      toast.success('Team updated');
    } catch (error) {
      showErrorToast(error, "Couldn't update team");
    }
  };

  const reloadOpenChannel = async (id: string) => {
    const updated = await chatService.getChannel(id);
    setChannels((prev) => prev.map((c) => (c.id === id ? updated : c)));
    if (selectedChannelIdRef.current === id) setSelectedChannel(updated);
  };
  const handleAddMembers = async (ids: string[]) => {
    if (!selectedChannel || ids.length === 0) return;
    try {
      await chatService.addMembers(selectedChannel.id, ids);
      toast.success(`${ids.length} added`);
      await reloadOpenChannel(selectedChannel.id);
    } catch (error) {
      showErrorToast(error, "Couldn't add members");
    }
  };
  const handleRemoveMember = async (userId: string) => {
    if (!selectedChannel) return;
    const name = selectedChannel.members.find((m) => m.user_id === userId)?.name ?? 'Member';
    try {
      await chatService.removeMember(selectedChannel.id, userId);
      toast.success(`${name} removed`);
      await reloadOpenChannel(selectedChannel.id);
    } catch (error) {
      showErrorToast(error, "Couldn't remove member");
    }
  };

  const handleStartDM = async (userId: string) => {
    setOpenDialog(null);
    const existing = directMessages.find((dm) => dm.members.some((m) => m.user_id === userId));
    try {
      const channel = await chatService.createChannel({
        name: `dm-${Date.now()}`,
        type: 'direct',
        is_private: true,
        member_ids: [userId],
      });
      setSection('direct');
      await fetchChannels({ initial: false });
      openChannel(channel);
    } catch (error: unknown) {
      console.error('Error creating DM:', error);
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      if (typeof detail === 'string' && detail.includes('already exists') && existing) {
        openChannel(existing);
        return;
      }
      showErrorToast(error, "Couldn't start conversation");
    }
  };

  const openUsersDialog = (kind: DialogKind) => {
    setOpenDialog(kind);
    loadUsers();
  };

  const jumpTo = (id: string) => {
    setOpenDialog(null);
    setFind('');
    setFindOpen(false);
    setTimeout(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(id);
      setTimeout(() => setHighlightId(null), 1600);
    }, 50);
  };

  // Phones: Esc in a conversation goes back to the list (popups keep their own Esc).
  useEffect(() => {
    if (mobileView !== 'chat') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openDialog || forwarding || deleteTargets || selected.size > 0) return;
      if (window.matchMedia('(min-width: 768px)').matches) return;
      setMobileView('list');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileView, openDialog, forwarding, deleteTargets, selected]);

  /* ── Live data → the UI's shapes ── */
  const meId = currentUser?.id ?? 'me';
  const allChannels = [...directMessages, ...channels];
  const onlineIds = new Set<string>();
  allChannels.forEach((c) => c.members.forEach((m) => { if (m.is_online) onlineIds.add(m.user_id); }));

  const peopleMap = new Map<string, Person>();
  // Only active users from User Management can be picked (new message, teams).
  // last_seen_at comes on channel members (any conversation the person is in).
  const lastSeenById = new Map<string, string>();
  allChannels.forEach((c) =>
    c.members.forEach((m) => {
      if (!m.last_seen_at) return;
      const prev = lastSeenById.get(m.user_id);
      if (!prev || m.last_seen_at > prev) lastSeenById.set(m.user_id, m.last_seen_at);
    }),
  );
  const directory: Person[] = availableUsers
    .filter((u) => u.is_active !== false)
    .map((u) => ({
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      roleName: prettyRole(u.role),
      isAdmin: /admin/i.test(u.role ?? ''),
      avatarUrl: u.avatar_url,
      // Real "last seen" (socket heartbeat) when the server has it; else last login.
      lastSeen: ts(lastSeenById.get(u.id)) || ts(u.last_login) || undefined,
      presence: onlineIds.has(u.id) ? 'online' : undefined,
    }));
  directory.forEach((p) => peopleMap.set(p.id, p));
  allChannels.forEach((c) =>
    c.members.forEach((m) => {
      if (!peopleMap.has(m.user_id)) {
        peopleMap.set(m.user_id, {
          id: m.user_id, name: m.name || m.email, email: m.email, roleName: prettyRole(m.role), isAdmin: false,
          presence: m.is_online ? 'online' : undefined,
        });
      }
    }),
  );
  const meBase = peopleMap.get(meId);
  const me: Person = {
    id: meId,
    name: currentUser?.name || meBase?.name || 'You',
    email: meBase?.email ?? '',
    roleName: meBase?.roleName ?? prettyRole(permissions.role),
    avatarUrl: meBase?.avatarUrl,
    // Tenant admins (who may create teams) manage every team.
    isAdmin: permissions.can_create_channel,
    presence: 'online',
  };
  peopleMap.set(meId, me);
  messages.forEach((m) => {
    if (!peopleMap.has(m.user_id)) {
      peopleMap.set(m.user_id, { id: m.user_id, name: m.user_name || 'Former user', email: '', roleName: '', isAdmin: false });
    }
  });
  // Who wrote a conversation's last message (for the list preview).
  const authorOf = (c: Channel) => {
    // By id when the server sends it — two people can share a name.
    if (c.last_message_user_id) {
      const id = c.last_message_user_id;
      if (id !== meId && !peopleMap.has(id)) {
        peopleMap.set(id, { id, name: c.last_message_by || 'Former user', email: '', roleName: '', isAdmin: false });
      }
      return id;
    }
    const by = c.last_message_by;
    if (!by) return 'system';
    if (by === currentUser?.name) return meId;
    const member = c.members.find((m) => m.name === by);
    if (member) return member.user_id;
    const pseudo = `name:${by}`;
    if (!peopleMap.has(pseudo)) peopleMap.set(pseudo, { id: pseudo, name: by, email: '', roleName: '', isAdmin: false });
    return pseudo;
  };

  const typingIds = Object.keys(typingUsers);
  const openMessages = messages.map(toUiMessage);
  const toConversation = (c: Channel): Conversation => {
    const isOpen = c.id === selectedChannel?.id;
    const memberIds = c.members.map((m) => m.user_id);
    const other = c.members.find((m) => m.user_id !== meId)?.user_id ?? memberIds[0] ?? '';
    const preview: Message[] = c.last_message
      ? [{ id: `last-${c.id}`, authorId: authorOf(c), text: c.last_message, at: ts(c.last_message_at), reactions: [] }]
      : [];
    return {
      id: c.id,
      kind: c.type === 'direct' ? 'direct' : 'team',
      name: c.name,
      description: c.description ?? undefined,
      createdBy: c.created_by,
      memberIds,
      adminIds: c.created_by ? [c.created_by] : [],
      participantIds: c.type === 'direct' ? [meId, other] : undefined,
      mutedBy: mutedChannels.has(c.id) ? [meId] : [],
      unreadFor: { [meId]: isOpen ? 0 : c.unread_count },
      typingIds: isOpen ? typingIds : [],
      messages: isOpen && openMessages.length > 0 ? openMessages : preview,
      createdAt: ts(c.created_at),
    };
  };
  const conversations = allChannels.map(toConversation);
  const people = [...peopleMap.values()];
  // The shared components look people up by id.
  registerPeople(people);

  const active = selectedChannel ? conversations.find((c) => c.id === selectedChannel.id) ?? null : null;
  const activeAt = (c: Conversation) => Math.max(c.messages[c.messages.length - 1]?.at ?? 0, c.createdAt);
  const inSection = (s: NavSection) =>
    conversations.filter((c) => (s === 'all' ? true : s === 'teams' ? c.kind === 'team' : s === 'direct' ? c.kind === 'direct' : false));
  const unreadIn = (s: NavSection) =>
    inSection(s).reduce((n, c) => n + (c.mutedBy?.includes(meId) ? 0 : c.unreadFor?.[meId] ?? 0), 0);
  const counts: NavCounts = { all: unreadIn('all'), teams: unreadIn('teams'), direct: unreadIn('direct'), archived: 0 };
  const q = query.trim().toLowerCase();
  const listed = inSection(section)
    .filter((c) => !q
      || titleOf(c, meId).toLowerCase().includes(q)
      || (c.description ?? '').toLowerCase().includes(q)
      || c.messages.some((m) => m.text.toLowerCase().includes(q)))
    .sort((a, b) => activeAt(b) - activeAt(a));

  const shownMessages = (active?.messages ?? []).filter(
    (m) => !find.trim() || m.text.toLowerCase().includes(find.trim().toLowerCase()),
  );
  const pinnedCount = active?.messages.filter((m) => m.pinned && !m.deleted).length ?? 0;
  const filesCount = active?.messages.reduce((n, m) => n + (m.deleted ? 0 : m.attachments?.length ?? 0), 0) ?? 0;
  const isTeam = active?.kind === 'team';

  const deleteModal = deleteTargets && (() => {
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
        tone="warning"
        size="sm"
        density="compact"
        icon={<Trash2 className="h-5 w-5" />}
        title={`Delete ${what}?`}
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
        <p className="tf-body-secondary">
          {forEveryone
            ? `“Delete for everyone” leaves “This message was deleted” for all members${hasImage ? ' and removes the image from storage' : ''}. “Delete for me” only hides it for you.`
            : allMine
              ? 'Delete for everyone is only available for 24 hours after sending. You can still remove it from your view; others keep seeing it.'
              : 'It will be removed from your view only. Others in the chat will keep seeing it.'}
        </p>
      </AppModal>
    );
  })();

  return (
    // Card, breadcrumb and frame come from chat/layout.tsx — this is the chat window.
    <div className="flex flex-1 min-h-0 flex-col [@media(max-height:500px)]:h-[calc(100dvh-4.5rem)] [@media(max-height:500px)]:flex-none">
      {/* A container, so the layout follows the window's width:
            < 768   one panel at a time + bottom navigation
            768+    two panels (list with section tabs · chat)
            1024+   compact three panels (icon rail · list · chat)
            1280+   full three panels (sidebar · list · chat)
          Themed in Info blue (CHAT_THEME). */}
      <div className="@container relative flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-900" style={CHAT_THEME}>

        {/* Sidebar: full (1280+) / icon rail (1024–1279) */}
        <div className="hidden @min-[1280px]:flex"><ChatNav variant="full" section={section} onChange={setSection} unread={counts} hide={HIDDEN_SECTIONS} /></div>
        <div className="hidden @min-[1024px]:flex @min-[1280px]:hidden"><ChatNav variant="rail" section={section} onChange={setSection} unread={counts} hide={HIDDEN_SECTIONS} /></div>

        {/* List — phones: full width while the list is the view */}
        <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col border-r border-gray-200 dark:border-slate-700 @min-[768px]:flex @min-[768px]:w-80 @min-[768px]:flex-none @min-[1024px]:w-72 @min-[1280px]:w-80`}>
          <div className="min-h-0 flex-1">
            <ConversationList
              title={SECTION_TITLE[section]}
              conversations={listed}
              me={me}
              activeId={selectedChannel?.id ?? null}
              onOpen={openById}
              query={query}
              onQuery={setQuery}
              state={isLoading ? 'loading' : loadError ? 'error' : 'ready'}
              onRetry={() => fetchChannels()}
              nav={<div className="hidden @min-[768px]:block @min-[1024px]:hidden"><ChatNav variant="tabs" section={section} onChange={setSection} unread={counts} hide={HIDDEN_SECTIONS} /></div>}
              canNew
              canCreateTeam={permissions.can_create_channel}
              onNew={() => openUsersDialog('new-direct')}
              onCreateTeam={() => openUsersDialog('create-team')}
            />
          </div>
          <div className="@min-[768px]:hidden"><ChatNav variant="bottom" section={section} onChange={(s) => { setSection(s); setMobileView('list'); }} unread={counts} hide={HIDDEN_SECTIONS} /></div>
        </div>

        {/* Conversation */}
        <section
          className={`${mobileView === 'chat' ? 'flex' : 'hidden'} relative min-w-0 flex-1 flex-col bg-slate-50/60 dark:bg-slate-950/40 @min-[768px]:flex`}
          onDragOver={(e) => { if (active) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) composerRef.current?.addFiles(e.dataTransfer.files); }}
        >
          {loadError && !isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Chat is offline</p>
              <p className="tf-meta max-w-xs">We couldn’t reach the chat service. Try again in a moment.</p>
            </div>
          ) : isLoading ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500" aria-busy="true">Loading conversations…</div>
          ) : !active || !selectedChannel ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue"><MessageSquareText className="h-7 w-7" /></span>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">Hiring chat</h2>
                <p className="mx-auto mt-1 max-w-sm tf-body-secondary">Pick a team or a conversation, create a team, or message any active user from User Management.</p>
              </div>
            </div>
          ) : (
            <>
              <ChatHeader
                c={active}
                me={me}
                onBack={() => setMobileView('list')}
                findOpen={findOpen}
                onFind={() => { setFindOpen((v) => !v); setFind(''); }}
                pinnedCount={pinnedCount}
                onPinned={() => setOpenDialog('pinned')}
                filesCount={filesCount}
                onFiles={() => setOpenDialog('files')}
                onDetails={() => setOpenDialog(isTeam ? 'details' : 'profile')}
                onMembers={() => openUsersDialog('members')}
                onMute={() => toggleMute(active.id)}
                onArchive={() => undefined}
                hideArchive
                onSelect={() => {
                  const first = active.messages.find((m) => !m.deleted);
                  if (first) setSelected(new Set([first.id]));
                }}
                selection={{
                  count: selected.size,
                  onClear: clearSelection,
                  onPin: () => void handleTogglePinSelected(),
                  onDelete: handleDeleteSelected,
                }}
                statusExtra={connectionStatus === 'closed' ? (
                  <span className="inline-flex items-center gap-1 text-brand-orange-deep" title="Live updates paused — checking for new messages every few seconds">
                    <Loader2 className="h-3 w-3 animate-spin" />Reconnecting… ·
                  </span>
                ) : null}
                extraMenu={(
                  <>
                    <DropdownMenuItem onSelect={() => void handleRefreshChat()}><RefreshCw className="h-4 w-4" />Refresh chat</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isTeam ? (
                      <>
                        <DropdownMenuItem onSelect={() => void handleLeaveChannel()}><LogOut className="h-4 w-4" />Leave team</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          disabled={!permissions.can_create_channel}
                          onSelect={() => void handleDeleteChannel()}
                        >
                          <Trash2 className="h-4 w-4" />Delete team
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem className="text-destructive" onSelect={() => void handleDeleteDirectChat()}>
                        <Trash2 className="h-4 w-4" />Delete chat
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              />

              {findOpen && (
                <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <Search className="h-4 w-4 text-gray-400" />
                  <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search messages in this chat" aria-label="Search messages" className="h-8 min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
                  {find && <span className="shrink-0 tf-meta tabular-nums">{shownMessages.length} found</span>}
                  <IconBtn label="Close search" onClick={() => { setFindOpen(false); setFind(''); }}><X className="h-4 w-4" /></IconBtn>
                </div>
              )}

              <div className="relative flex min-h-0 flex-1 flex-col">
                <ChatDoodle />
                {isLoadingMessages ? (
                  <div className="relative flex flex-1 flex-col gap-4 px-3 py-4 @min-[768px]:px-5" aria-busy="true">
                    {[false, false, true, false, true, true, false].map((mine, i) => (
                      <div key={i} className={`flex gap-2.5 ${mine ? 'justify-end' : ''}`}>
                        {!mine && <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
                        <div className={`flex max-w-[70%] flex-col gap-1.5 ${mine ? 'items-end' : 'items-start'}`}>
                          {!mine && <Skeleton className="h-3 w-24" />}
                          <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-56' : 'w-40'}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <MessageList
                    key={active.id}
                    ref={scrollRef}
                    c={active}
                    me={me}
                    messages={shownMessages}
                    find={find}
                    selected={selected}
                    unreadStartId={newFromId}
                    reactFor={reactFor}
                    setReactFor={setReactFor}
                    favEmojis={favEmojis}
                    copiedId={copiedId}
                    highlightId={highlightId}
                    onScroll={handlePaneScroll}
                    canDelete={(m) => !m.deleted}
                    actions={{
                      onReact: (m, e) => handleReact(m.id, e),
                      onReply: (m) => { setEditing(null); setReplyTo(m); composerRef.current?.focus(); },
                      onEdit: (m) => { setReplyTo(null); setComposerText(draftsRef.current[active.id] ?? ''); setEditing(m); },
                      onForward: (m) => setForwarding(m),
                      onPin: (m, v) => void handlePin(m.id, v),
                      onCopy: (m) => void handleCopy(m.id),
                      onDelete: (m) => {
                        const live = messages.find((x) => x.id === m.id);
                        if (live) setDeleteTargets([live]);
                      },
                      onToggleSelect: (m) => toggleSelect(m.id),
                      onRetry: () => undefined,
                      onOpenAttachment: (a) => { if (a.url) setViewerAttachment({ url: a.url, name: a.name }); },
                      onJumpTo: jumpTo,
                    }}
                  />
                )}
                {!atBottom && !isLoadingMessages && (
                  <button
                    type="button"
                    onClick={() => scrollPaneToEnd(true)}
                    className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md hover:bg-gray-50"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />Jump to latest
                  </button>
                )}
              </div>

              <Composer
                key={`${active.id}:${editing?.id ?? 'new'}:${composerNonce}`}
                ref={composerRef}
                placeholder={isTeam ? `Message ${titleOf(active, meId)}` : `Message ${titleOf(active, meId).split(' ')[0]}`}
                members={active.memberIds.map((id) => peopleMap.get(id)).filter((p): p is Person => !!p)}
                meId={meId}
                imagesOnly
                initialText={composerText}
                onTextChange={(text) => {
                  // Refs and the socket only — this runs while the composer updates.
                  draftsRef.current[active.id] = text;
                  if (text.trim()) notifyTyping();
                  else stopTyping();
                }}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                editing={editing}
                onCancelEdit={() => setEditing(null)}
                onSend={(input) => void handleSend(input)}
                onSaveEdit={(text) => void handleSaveEdit(text)}
              />

              {dragOver && (
                <div className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-blue bg-brand-blue/5 text-center text-brand-blue">
                  <span className="text-sm font-semibold">Drop images to attach</span>
                  <span className="text-xs">PNG, JPG, GIF, WebP · up to 5 MB</span>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {deleteModal}

      {active && (
        <>
          {active.kind === 'team' && (
            <>
              <MembersDialog
                key={`m-${active.id}`}
                c={active}
                me={me}
                people={directory}
                open={openDialog === 'members'}
                onClose={() => setOpenDialog(null)}
                onAdd={(ids) => void handleAddMembers(ids)}
                onRemove={(id) => void handleRemoveMember(id)}
                onToggleAdmin={() => undefined}
                hideAdminToggle
              />
              <TeamDetailsDialog
                key={`d-${active.id}-${openDialog === 'details'}`}
                c={active}
                me={me}
                open={openDialog === 'details'}
                onClose={() => setOpenDialog(null)}
                showIcon={false}
                hideArchive
                nameTaken={(n) => channels.some((c) => c.id !== active.id && c.name.trim().toLowerCase() === n.trim().toLowerCase())}
                onSave={(input) => void handleUpdateTeam(input)}
                onMembers={() => openUsersDialog('members')}
                onPinned={() => setOpenDialog('pinned')}
                onFiles={() => setOpenDialog('files')}
                onArchive={() => undefined}
              />
            </>
          )}
          {active.kind !== 'team' && (
            <ProfileDialog c={active} me={me} open={openDialog === 'profile'} onClose={() => setOpenDialog(null)} onFiles={() => setOpenDialog('files')} />
          )}
          <PinnedDialog c={active} me={me} open={openDialog === 'pinned'} onClose={() => setOpenDialog(null)} onJump={jumpTo} onUnpin={(id) => void handlePin(id, false)} />
          <FilesDialog
            c={active}
            me={me}
            open={openDialog === 'files'}
            onClose={() => setOpenDialog(null)}
            onOpenFile={(a) => { if (a.url) setViewerAttachment({ url: a.url, name: a.name }); }}
          />
          <ForwardDialog
            key={`f-${forwarding?.id ?? 'none'}`}
            open={!!forwarding}
            onClose={() => setForwarding(null)}
            message={forwarding}
            conversations={conversations}
            me={me}
            onForward={(ids) => void handleForward(ids)}
          />
        </>
      )}
      <NewDirectDialog
        key={`n-${openDialog}`}
        open={openDialog === 'new-direct'}
        onClose={() => setOpenDialog(null)}
        me={me}
        people={directory}
        subtitle="Start a private chat with an active user from User Management."
        onStart={(pid) => void handleStartDM(pid)}
      />
      <CreateTeamDialog
        key={`t-${openDialog === 'create-team'}`}
        open={openDialog === 'create-team'}
        onClose={() => setOpenDialog(null)}
        me={me}
        people={directory}
        showIcon={false}
        nameTaken={(n) => channels.some((c) => c.name.trim().toLowerCase() === n.trim().toLowerCase())}
        onCreate={(input) => void handleCreateTeam(input)}
      />

      <ChatAttachmentViewer attachment={viewerAttachment} onClose={closeViewer} />
    </div>
  );
}
