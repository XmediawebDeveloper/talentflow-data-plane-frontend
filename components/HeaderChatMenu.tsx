'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, CheckCheck, Hash, Loader2, Lock, Reply, Send } from 'lucide-react';
import { ChatAnimatedIcon } from '@/components/icons/HeaderAnimatedIcons';
import { toast } from 'sonner';
import chatService, { type Channel } from '@/lib/services/chatService';
import NameAvatar from '@/components/ui/name-avatar';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';

/**
 * The header's chat icon.
 *
 * Click toggles a small box of the conversations with unread messages —
 * newest first — each with Reply (a one-line quick reply, sent without leaving
 * the current page), Open (that conversation in Chat) and Mark as read. The
 * box's "Open Chat" goes to the full page (/chat). Outside click or Escape
 * closes it.
 *
 * Uses the REST endpoints only. chatService's WebSocket is one connection tied
 * to the conversation open on the Chat page, so the dropdown never touches it.
 */

const MAX_BADGE_COUNT = 9;
const MAX_ROWS = 6;

const chatHref = (channelId?: string) => (channelId ? `/chat?channel=${encodeURIComponent(channelId)}` : '/chat');

const todayLabel = () => formatISTDate(new Date().toISOString());
const timeLabel = (iso: string | null) => {
  if (!iso) return '';
  return formatISTDate(iso) === todayLabel() ? formatISTTime(iso) : formatISTDate(iso);
};

interface HeaderChatMenuProps {
  /** Unread messages across every conversation (the badge). */
  unread: number;
  /** The badge count should be re-read (after a reply or mark-as-read). */
  onUnreadChanged: () => void;
  /** Close the header's other menus before navigating / opening. */
  onActivate?: () => void;
  /** Set by the user's id, to tell a DM's other person apart from yourself. */
  currentUserId?: string;
}

export default function HeaderChatMenu({ unread, onUnreadChanged, onActivate, currentUserId }: HeaderChatMenuProps) {
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<Channel[]>([]);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadUnread = useCallback(async () => {
    setLoading(true);
    try {
      const res = await chatService.listChannels();
      const unreadOnes = [...(res.direct_messages || []), ...(res.channels || [])]
        .filter((c) => c.unread_count > 0)
        .sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
      setConversations(unreadOnes);
    } catch (err) {
      console.error('[HeaderChatMenu] Could not load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setReplyingId(null);
    setDraft('');
  }, []);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    onActivate?.();
    setOpen(true);
    void loadUnread();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const removeConversation = (id: string) => setConversations((list) => list.filter((c) => c.id !== id));

  const markRead = async (conv: Channel) => {
    setMarkingId(conv.id);
    try {
      await chatService.markAsRead(conv.id);
      removeConversation(conv.id);
      if (replyingId === conv.id) setReplyingId(null);
      onUnreadChanged();
    } finally {
      setMarkingId(null);
    }
  };

  const sendReply = async (conv: Channel) => {
    const content = draft.trim();
    if (!content || sendingId) return;
    setSendingId(conv.id);
    try {
      await chatService.sendMessage(conv.id, { content });
      // Replying means it's been read.
      await chatService.markAsRead(conv.id);
      toast.success(`Reply sent to ${conv.type === 'direct' ? conv.name : `#${conv.name}`}`);
      setDraft('');
      setReplyingId(null);
      removeConversation(conv.id);
      onUnreadChanged();
    } catch (err) {
      toast.error(friendlyErrorMessage(err, "Couldn't send your reply. Please try again."));
    } finally {
      setSendingId(null);
    }
  };

  const openConversation = (conv?: Channel) => {
    close();
    router.push(chatHref(conv?.id));
  };

  const partnerOf = (conv: Channel) =>
    conv.members?.find((m) => m.user_id !== currentUserId) ?? conv.members?.[0];

  const shown = conversations.slice(0, MAX_ROWS);
  const hiddenCount = conversations.length - shown.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        data-active={open || undefined}
        className={`tf-hbtn relative p-1.5 sm:p-2 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors ${
          open ? 'bg-brand-blue/5 text-brand-blue' : 'text-gray-500'
        }`}
        aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <ChatAnimatedIcon className="w-4 h-4 sm:w-5 sm:h-5" />
        {unread > 0 && (
          <span className="absolute top-0 right-0 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-brand-blue/60 animate-ping motion-reduce:hidden" aria-hidden="true" />
            <span
              className="relative flex items-center justify-center min-w-[0.875rem] sm:min-w-[1rem] h-3.5 sm:h-4 px-0.5 sm:px-1 bg-brand-blue text-white rounded-full ring-1 ring-white dark:ring-slate-900 font-semibold text-2xs leading-none tabular-nums"
              aria-hidden="true"
            >
              {unread > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unread}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Unread messages"
          className="absolute right-0 top-full z-50 pt-2 max-sm:fixed max-sm:inset-x-3 max-sm:top-14"
        >
          <div className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg shadow-slate-900/10 animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 max-sm:w-full">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 dark:border-slate-800">
              <p className="text-xs font-semibold text-gray-900 dark:text-slate-100">
                Unread messages
                {conversations.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-brand-blue/10 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-brand-blue dark:bg-brand-blue/25">
                    {unread > 0 ? unread : conversations.reduce((n, c) => n + c.unread_count, 0)}
                  </span>
                )}
              </p>
              <Link
                href="/chat"
                onClick={close}
                className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-blue hover:underline"
              >
                Open Chat <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Body */}
            <div className="max-h-[min(24rem,calc(100dvh-9rem))] overflow-y-auto overscroll-contain">
              {loading && conversations.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-gray-500 dark:text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading messages…
                </div>
              ) : conversations.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <CheckCheck className="mx-auto h-5 w-5 text-success" />
                  <p className="mt-1.5 text-xs font-medium text-gray-700 dark:text-slate-200">You&apos;re all caught up</p>
                  <p className="mt-0.5 text-2xs text-gray-500 dark:text-slate-400">No unread messages.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                  {shown.map((conv) => {
                    const partner = conv.type === 'direct' ? partnerOf(conv) : null;
                    const replying = replyingId === conv.id;
                    const sending = sendingId === conv.id;
                    return (
                      <li key={conv.id} className="group/row px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <div className="flex items-start gap-2.5">
                          {partner ? (
                            <NameAvatar name={partner.name} fallback={partner.email} userId={partner.user_id} size="sm" />
                          ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20">
                              {conv.is_private ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => openConversation(conv)}
                                className="truncate text-left text-sm font-semibold text-gray-900 hover:text-brand-blue dark:text-slate-100"
                                title={`Open ${conv.name} in Chat`}
                              >
                                {conv.name}
                              </button>
                              <span className="shrink-0 text-2xs font-medium text-brand-blue">{timeLabel(conv.last_message_at)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-2">
                              <p className="truncate text-xs text-gray-600 dark:text-slate-300">
                                {conv.type !== 'direct' && conv.last_message_by && (
                                  <span className="font-medium text-gray-800 dark:text-slate-200">{conv.last_message_by}: </span>
                                )}
                                {conv.last_message || 'New message'}
                              </p>
                              <span className="shrink-0 rounded-full bg-brand-blue px-1.5 py-px text-2xs font-semibold tabular-nums text-white">
                                {conv.unread_count > 99 ? '99+' : conv.unread_count}
                              </span>
                            </div>

                            {/* Actions */}
                            {!replying && (
                              <div className="mt-1.5 flex items-center gap-3 text-2xs font-medium">
                                <button
                                  type="button"
                                  onClick={() => { setReplyingId(conv.id); setDraft(''); }}
                                  className="inline-flex items-center gap-1 text-brand-blue hover:underline"
                                >
                                  <Reply className="h-3 w-3" /> Reply
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openConversation(conv)}
                                  className="inline-flex items-center gap-1 text-gray-600 hover:text-brand-blue dark:text-slate-300"
                                >
                                  <ArrowUpRight className="h-3 w-3" /> Open
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void markRead(conv)}
                                  disabled={markingId === conv.id}
                                  className="inline-flex items-center gap-1 text-gray-600 hover:text-success disabled:opacity-50 dark:text-slate-300"
                                >
                                  {markingId === conv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                                  Mark as read
                                </button>
                              </div>
                            )}

                            {/* Quick reply */}
                            {replying && (
                              <form
                                className="mt-2 flex items-center gap-1.5"
                                onSubmit={(e) => { e.preventDefault(); void sendReply(conv); }}
                              >
                                <input
                                  autoFocus
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') { e.stopPropagation(); setReplyingId(null); setDraft(''); }
                                  }}
                                  maxLength={4000}
                                  disabled={sending}
                                  placeholder={`Reply to ${conv.type === 'direct' ? conv.name : `#${conv.name}`}`}
                                  aria-label={`Reply to ${conv.name}`}
                                  className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-brand-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                                />
                                <button
                                  type="submit"
                                  disabled={!draft.trim() || sending}
                                  aria-label="Send reply"
                                  title="Send (Enter)"
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-blue text-white transition-colors hover:bg-brand-blue-2 disabled:opacity-40"
                                >
                                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setReplyingId(null); setDraft(''); }}
                                  className="shrink-0 px-1 text-2xs font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
                                >
                                  Cancel
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {hiddenCount > 0 && (
              <Link
                href="/chat"
                onClick={close}
                className="block border-t border-gray-100 px-3 py-2 text-center text-xs font-medium text-brand-blue hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                {hiddenCount} more {hiddenCount === 1 ? 'conversation' : 'conversations'} in Chat
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
