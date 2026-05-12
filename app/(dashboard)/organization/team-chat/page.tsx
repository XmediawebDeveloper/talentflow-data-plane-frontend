'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useState, useRef, useEffect } from 'react';
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
  Pin,
  Loader2,
  X,
  Lock,
  Globe,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import chatService, {
  Channel,
  Message,
} from '@/lib/services/chatService';
import { getTokens } from '@/lib/services/api';
import userService, { ApiUser } from '@/lib/services/userService';
import { useAuth } from '@/components/providers/AuthProvider';
import { useSearchParams } from 'next/navigation';
import { formatISTTime } from '@/lib/utils/dateUtils';
import { PageSkeleton } from '@/components/ui/skeleton';

const quickEmojis = ['👍', '❤️', '😄', '🎉', '👀', '✅'];

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export default function TeamChatPage() {
  const searchParams = useSearchParams();
  const { user: currentUser } = useAuth();
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

    chatService.connectWebSocket(selectedChannel.id, accessToken);

    const unsubscribe = chatService.onMessage((data: any) => {
      if (!data || !data.type) return;

      switch (data.type) {
        case 'message': {
          if (data.message) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.message.id)) return prev;
              return [...prev, data.message];
            });
            const channelId = data.message.channel_id;
            setChannels((prev) =>
              prev.map((ch) =>
                ch.id === channelId
                  ? { ...ch, last_message: data.message.content, last_message_by: data.message.user_name }
                  : ch
              )
            );
            setDirectMessages((prev) =>
              prev.map((dm) =>
                dm.id === channelId
                  ? { ...dm, last_message: data.message.content, last_message_by: data.message.user_name }
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
          if (selectedChannel) {
            fetchMessages(selectedChannel.id);
          }
          break;
        }
        case 'typing':
          break;
      }
    });

    return () => {
      unsubscribe();
      chatService.disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel?.id]);

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

  const fetchMessages = async (channelId: string) => {
    try {
      setIsLoadingMessages(true);
      const response = await chatService.listMessages(channelId);
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
      toast.error('Failed to load messages');
    } finally {
      setIsLoadingMessages(false);
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
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedChannel) return;

    try {
      const newMessage = await chatService.sendMessage(selectedChannel.id, {
        content: messageInput,
      });
      setMessages([...messages, newMessage]);
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
    if (!permissions.can_create_channel) {
      toast.error('Only administrators and team leads can create channels');
      return;
    }
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

  if (isLoading) {
    return <PageSkeleton variant="cards" showStats={false} />;
  }

  return (
    <div className="flex h-[calc(100dvh-80px)] flex-col bg-slate-50 overflow-x-hidden">
      <div className="shrink-0 w-full max-w-[1400px] mx-auto px-3 pt-3 md:px-4 md:pt-4">
        <PageBreadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Users', href: '/organization/user-management' }, { label: 'Chat' }]} className="mb-0" />
      </div>
      <div className="flex flex-1 min-h-0 w-full max-w-[1400px] mx-auto p-3 md:p-4 gap-3 md:gap-4">
        {/* Left Sidebar - Channels List */}
        <aside className="hidden md:flex md:w-72 lg:w-80 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal px-4 py-4 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-cyan/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-brand-orange/20 blur-3xl" />
            <div className="relative">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3 w-3 text-brand-orange" />
                Real-time workspace
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <div>
                    <h1 className="text-base font-semibold tracking-tight">Team Chat</h1>
                    <p className="text-[11px] text-white/70">{channels.length + directMessages.length} conversations</p>
                  </div>
                </div>
                {totalUnread > 0 && (
                  <span className="inline-flex items-center rounded-full bg-brand-orange px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
                    {totalUnread} unread
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="border-b border-gray-100 px-3 pb-3 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                aria-label="Search channels"
                type="text"
                placeholder="Search conversations"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
              />
            </div>
          </div>

          <div className="border-b border-gray-100 px-2 pb-2 pt-2">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-50 p-1">
              {(['all', 'channels', 'direct'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                    activeTab === tab
                      ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                      : 'text-gray-600 hover:bg-white hover:text-brand-blue'
                  }`}
                >
                  {tab === 'all' ? 'All' : tab === 'channels' ? 'Channels' : 'Direct'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {(activeTab === 'all' || activeTab === 'channels') && (
              <div className="mb-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Channels</span>
                  {permissions.can_create_channel && (
                    <button
                      onClick={openCreateModal}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                      aria-label="Create channel" title="Create channel"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {filteredChannels.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">No channels yet</p>
                ) : (
                  <div className="space-y-0.5">
                    {filteredChannels.map((channel) => {
                      const isActive = selectedChannel?.id === channel.id;
                      return (
                        <button
                          key={channel.id}
                          onClick={() => handleSelectChannel(channel)}
                          className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all ${
                            isActive
                              ? 'bg-gradient-to-r from-brand-blue/[0.08] to-brand-cyan/[0.05] ring-1 ring-brand-blue/15'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div
                            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                              isActive
                                ? 'bg-brand-blue/10 ring-1 ring-brand-blue/15'
                                : 'bg-slate-100 group-hover:bg-brand-blue/[0.06]'
                            }`}
                          >
                            <Hash className={`h-4 w-4 ${isActive ? 'text-brand-blue' : 'text-gray-500'}`} />
                            {channel.is_private && (
                              <Lock className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-gray-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`truncate text-sm ${
                                  channel.unread_count > 0 ? 'font-semibold text-gray-900' : 'text-gray-700'
                                }`}
                              >
                                {channel.name}
                              </span>
                              {channel.unread_count > 0 && (
                                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-brand-orange px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  {channel.unread_count}
                                </span>
                              )}
                            </div>
                            {channel.last_message && (
                              <p className="truncate text-[11px] text-gray-400">
                                {channel.last_message_by}: {channel.last_message}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {(activeTab === 'all' || activeTab === 'direct') && (
              <div>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Direct</span>
                  <button
                    onClick={openNewDMModal}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                    aria-label="New direct message" title="New direct message"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {filteredDMs.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">No direct messages</p>
                ) : (
                  <div className="space-y-0.5">
                    {filteredDMs.map((dm) => {
                      const isActive = selectedChannel?.id === dm.id;
                      return (
                        <button
                          key={dm.id}
                          onClick={() => handleSelectChannel(dm)}
                          className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all ${
                            isActive
                              ? 'bg-gradient-to-r from-brand-blue/[0.08] to-brand-cyan/[0.05] ring-1 ring-brand-blue/15'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="relative">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue text-[11px] font-semibold text-white shadow-sm shadow-brand-blue/20">
                              {dm.members[0]?.initials || '?'}
                            </div>
                            {dm.members[0]?.is_online && (
                              <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-teal" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`truncate text-sm ${
                                  dm.unread_count > 0 ? 'font-semibold text-gray-900' : 'text-gray-700'
                                }`}
                              >
                                {dm.name}
                              </span>
                              {dm.unread_count > 0 && (
                                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-brand-orange px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  {dm.unread_count}
                                </span>
                              )}
                            </div>
                            {dm.last_message && (
                              <p className="truncate text-[11px] text-gray-400">{dm.last_message}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 bg-slate-50/50 px-3 py-2.5">
            <p className="text-center text-[11px] text-gray-400">Message retention: 90 days</p>
          </div>
        </aside>

        {/* Main Chat Area */}
        <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          {selectedChannel ? (
            <>
              <div className="flex h-16 items-center justify-between border-b border-gray-100 bg-gray-50 px-4 sm:px-6">
                <div className="flex items-center gap-3 min-w-0">
                  {selectedChannel.type === 'channel' ? (
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                      <Hash className="h-5 w-5 text-brand-blue" />
                      {selectedChannel.is_private && (
                        <Lock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-gray-500" />
                      )}
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue text-sm font-semibold text-white shadow-sm shadow-brand-blue/20">
                      {selectedChannel.members[0]?.initials || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
                        {selectedChannel.name}
                      </h2>
                      {selectedChannel.is_private && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange/10 px-2 py-0.5 text-[10px] font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                          <Lock className="h-2.5 w-2.5" />
                          Private
                        </span>
                      )}
                    </div>
                    {selectedChannel.type === 'channel' && (
                      <p className="text-xs text-gray-500">
                        {selectedChannel.member_count} members · {onlineMembersCount} online
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                    aria-label="Notifications" title="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                  </button>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                    aria-label="Pinned messages" title="Pinned messages"
                  >
                    <Pin className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowMembersSidebar(!showMembersSidebar)}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                      showMembersSidebar
                        ? 'bg-brand-blue/[0.08] text-brand-blue ring-1 ring-brand-blue/15'
                        : 'text-gray-500 hover:bg-brand-blue/[0.06] hover:text-brand-blue'
                    }`}
                    aria-label="Toggle members" title="Toggle members"
                  >
                    <Users className="h-4 w-4" />
                  </button>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                    aria-label="More" title="More"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {selectedChannel.description && (
                <div className="border-b border-gray-100 bg-slate-50/60 px-4 py-2.5 sm:px-6">
                  <p className="text-sm text-gray-600">{selectedChannel.description}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {isLoadingMessages ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-gray-500">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                      <MessageCircle className="h-7 w-7 text-brand-blue" />
                    </div>
                    <p className="text-base font-semibold text-gray-900">No messages yet</p>
                    <p className="mt-1 text-sm text-gray-500">Be the first to start the conversation.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const isSender = message.user_id === currentUser?.id;
                      return (
                        <div
                          key={message.id}
                          className={`group flex gap-2.5 ${isSender ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm ${
                              isSender
                                ? 'bg-brand-blue shadow-brand-blue/20'
                                : 'bg-brand-cyan shadow-brand-cyan/20'
                            }`}
                          >
                            {message.user_initials}
                          </div>

                          <div className={`max-w-[70%] ${isSender ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`px-4 py-2.5 rounded-2xl ${
                                isSender
                                  ? 'bg-brand-blue text-white rounded-tr-sm shadow-sm shadow-brand-blue/20'
                                  : 'bg-slate-100 text-gray-900 rounded-tl-sm ring-1 ring-gray-100'
                              }`}
                            >
                              {!isSender && (
                                <p className="mb-1 text-xs font-semibold text-brand-blue">
                                  {message.user_name}
                                </p>
                              )}
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                {message.is_deleted ? '[Message deleted]' : message.content}
                              </p>
                            </div>

                            <div
                              className={`mt-1 flex items-center gap-1.5 px-1 ${
                                isSender ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              <span className="text-[11px] text-gray-400">
                                {formatISTTime(message.created_at)}
                              </span>
                              {message.is_pinned && (
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-brand-orange-deep">
                                  <Pin className="h-3 w-3" /> Pinned
                                </span>
                              )}
                              {message.is_edited && (
                                <span className="text-[11px] text-gray-400">(edited)</span>
                              )}
                            </div>

                            {message.reactions.length > 0 && (
                              <div
                                className={`mt-1 flex flex-wrap gap-1.5 ${
                                  isSender ? 'justify-end' : 'justify-start'
                                }`}
                              >
                                {message.reactions.map((reaction, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleAddReaction(message.id, reaction.emoji)}
                                    className="inline-flex items-center gap-1 rounded-full bg-brand-blue/[0.06] px-2 py-0.5 text-sm text-brand-blue ring-1 ring-brand-blue/10 transition-colors hover:bg-brand-blue/[0.12]"
                                    title={reaction.users.join(', ')}
                                  >
                                    <span>{reaction.emoji}</span>
                                    <span className="text-xs font-medium">{reaction.count}</span>
                                  </button>
                                ))}
                                <div className="relative">
                                  <button
                                    onClick={() =>
                                      setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id)
                                    }
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-brand-blue group-hover:opacity-100"
                                  >
                                    <Smile className="h-3.5 w-3.5" />
                                  </button>
                                  {showEmojiPicker === message.id && (
                                    <div
                                      className={`absolute bottom-full z-10 mb-1 flex gap-1 rounded-xl border border-gray-100 bg-white p-2 shadow-lg ring-1 ring-black/[0.04] ${
                                        isSender ? 'right-0' : 'left-0'
                                      }`}
                                    >
                                      {quickEmojis.map((emoji) => (
                                        <button
                                          key={emoji}
                                          onClick={() => handleAddReaction(message.id, emoji)}
                                          className="rounded-md p-1.5 text-lg transition-colors hover:bg-brand-blue/[0.06]"
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 p-3 sm:p-4">
                <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white p-2.5 transition-all focus-within:border-brand-blue/30 focus-within:ring-4 focus-within:ring-brand-blue/10">
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                    aria-label="Attach file" title="Attach file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <textarea
                    ref={inputRef}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${selectedChannel.type === 'channel' ? '#' : ''}${selectedChannel.name}`}
                    rows={1}
                    className="flex-1 resize-none bg-transparent py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400"
                    style={{ maxHeight: '120px' }}
                  />
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                    aria-label="Add emoji" title="Add emoji"
                  >
                    <Smile className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim()}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all ${
                      messageInput.trim()
                        ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 hover:-translate-y-0.5 hover:shadow-md'
                        : 'cursor-not-allowed bg-slate-100 text-gray-400'
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                </div>
                <p className="mt-2 px-2 text-[11px] text-gray-400">
                  Press Enter to send · Shift + Enter for a new line · Use @name to mention someone
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                  <MessageCircle className="h-7 w-7 text-brand-blue" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Welcome to Team Chat</h2>
                <p className="mt-2 text-sm text-gray-500">
                  {channels.length === 0
                    ? 'No channels yet. Create one to bring your team into the conversation.'
                    : 'Pick a channel or direct message from the left to start the conversation.'}
                </p>
                {permissions.can_create_channel && channels.length === 0 && (
                  <button
                    onClick={openCreateModal}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <Plus className="h-4 w-4" />
                    Create your first channel
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar - Members */}
        {showMembersSidebar && selectedChannel && selectedChannel.type === 'channel' && (
          <aside className="hidden lg:flex w-72 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                  <Users className="h-5 w-5 text-brand-teal" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900">Members</h3>
                  <p className="text-xs text-gray-500">
                    {selectedChannel.member_count} total · {onlineMembersCount} online
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {selectedChannel.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-slate-50"
                >
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue text-sm font-semibold text-white shadow-sm shadow-brand-blue/20">
                      {member.initials}
                    </div>
                    <div
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                        member.is_online ? 'bg-brand-teal' : 'bg-gray-300'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {member.name}
                      {member.user_id === currentUser?.id && (
                        <span className="font-normal text-gray-400"> (You)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-500 capitalize">
                      {member.role?.replace(/_/g, ' ') || 'Member'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Create Channel Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl ring-1 ring-black/5">
              <div className="relative overflow-hidden bg-brand-blue px-5 py-4 text-white">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <Hash className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">Create channel</h2>
                      <p className="mt-0.5 text-sm text-white/75">Bring teammates together around a topic.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(90vh-180px)] overflow-y-auto p-5 space-y-5">
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
                      className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
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
                    className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
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
                        <div className={`text-[11px] ${!newChannelPrivate ? 'text-white/75' : 'text-gray-500'}`}>
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
                        <div className={`text-[11px] ${newChannelPrivate ? 'text-white/75' : 'text-gray-500'}`}>
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
                              {checked && <span className="text-[10px]">✓</span>}
                            </span>
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-blue/10 text-[11px] font-semibold text-brand-blue ring-1 ring-brand-blue/10">
                              {getInitials(user.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                              <p className="truncate text-[11px] text-gray-500">{user.email}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateChannel}
                  disabled={isCreating || !newChannelName.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-70"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="h-4 w-4" />
                      Create channel
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Members Modal */}
        {showAddMembersModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl ring-1 ring-black/5">
              <div className="relative overflow-hidden bg-brand-blue px-5 py-4 text-white">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <Users className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">Add members</h2>
                      <p className="mt-0.5 text-sm text-white/75">Invite teammates to this channel.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowAddMembersModal(false);
                      setSelectedMemberIds([]);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(90vh-180px)] overflow-y-auto p-5">
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
                              {checked && <span className="text-[10px]">✓</span>}
                            </span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-blue text-xs font-semibold text-white shadow-sm shadow-brand-blue/20">
                              {getInitials(user.name)}
                            </div>
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

              <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  onClick={() => {
                    setShowAddMembersModal(false);
                    setSelectedMemberIds([]);
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMembers}
                  disabled={selectedMemberIds.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-70"
                >
                  <Plus className="h-4 w-4" />
                  Add {selectedMemberIds.length > 0 ? `(${selectedMemberIds.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Direct Message Modal */}
        {showNewDMModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl ring-1 ring-black/5">
              <div className="relative overflow-hidden bg-brand-blue px-5 py-4 text-white">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">New direct message</h2>
                      <p className="mt-0.5 text-sm text-white/75">Pick a teammate to start a private chat.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNewDMModal(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(90vh-180px)] overflow-y-auto p-5">
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {isLoadingUsers ? (
                    <div className="px-4 py-10 text-center">
                      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-brand-blue" />
                      <p className="text-sm text-gray-500">Loading team members...</p>
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
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue text-xs font-semibold text-white shadow-sm shadow-brand-blue/20">
                              {getInitials(user.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                              <p className="truncate text-xs text-gray-500">{user.email}</p>
                            </div>
                            <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium capitalize text-gray-600 sm:inline-flex">
                              {user.role?.replace(/_/g, ' ') || 'User'}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setShowNewDMModal(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
