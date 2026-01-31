'use client';

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
} from 'lucide-react';
import { toast } from 'sonner';
import chatService, {
  Channel,
  Message,
  ChannelMember,
  ChatPermissions,
} from '@/lib/services/chatService';
import userService, { ApiUser } from '@/lib/services/userService';
import { useAuth } from '@/components/providers/AuthProvider';
import { useSearchParams } from 'next/navigation';

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
  const [permissions, setPermissions] = useState<ChatPermissions>({ can_create_channel: false, role: '' });
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

  // Fetch channels and permissions on mount or when URL changes
  useEffect(() => {
    fetchChannels();
    fetchPermissions();
  }, [searchParams]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load messages when channel changes
  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel.id);
    }
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

      // Check if there's a channel ID in URL query params
      const channelIdFromUrl = searchParams.get('channel');
      if (channelIdFromUrl) {
        // Find the channel in channels or direct messages
        const allChannels = [...response.channels, ...response.direct_messages];
        const targetChannel = allChannels.find(ch => ch.id === channelIdFromUrl);
        if (targetChannel) {
          setSelectedChannel(targetChannel);
          // Switch to appropriate tab
          if (targetChannel.type === 'direct') {
            setActiveTab('direct');
          } else {
            setActiveTab('channels');
          }
          return;
        }
      }

      // Select first channel if none selected
      if (!selectedChannel && response.channels.length > 0) {
        setSelectedChannel(response.channels[0]);
      }
    } catch (error: any) {
      console.error('Error fetching channels:', error);
      // Don't show error toast for 404 - might just be no channels yet
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

      // Update unread count in local state after marking as read
      setChannels(prev => prev.map(ch =>
        ch.id === channelId ? { ...ch, unread_count: 0 } : ch
      ));
      setDirectMessages(prev => prev.map(dm =>
        dm.id === channelId ? { ...dm, unread_count: 0 } : dm
      ));
      // Recalculate total unread
      setTotalUnread(prev => {
        const channel = [...channels, ...directMessages].find(c => c.id === channelId);
        return Math.max(0, prev - (channel?.unread_count || 0));
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
      // Refresh messages to get updated reactions
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

      // Refresh channels and select new one
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

      // Refresh channel to get updated members
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

  const openAddMembersModal = async () => {
    await fetchAvailableUsers();
    setShowAddMembersModal(true);
  };

  const openNewDMModal = async () => {
    await fetchAvailableUsers();
    setShowNewDMModal(true);
  };

  const handleStartDM = async (userId: string, userName: string) => {
    setIsCreatingDM(true);
    try {
      // Create a DM channel with the selected user
      const channel = await chatService.createChannel({
        name: `dm-${Date.now()}`,  // Temporary name, will be replaced by backend
        type: 'direct',
        is_private: true,
        member_ids: [userId],
      });

      toast.success(`Started conversation with ${userName}`);
      setShowNewDMModal(false);

      // Refresh channels and select the new DM
      await fetchChannels();
      setSelectedChannel(channel);
    } catch (error: any) {
      console.error('Error creating DM:', error);
      // Check if DM already exists
      if (error.response?.data?.detail?.includes('already exists')) {
        // Find existing DM and select it
        const existingDM = directMessages.find((dm) =>
          dm.members.some((m) => m.user_id === userId)
        );
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
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const filteredChannels = channels.filter((channel) =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDMs = directMessages.filter((dm) =>
    dm.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const quickEmojis = ['👍', '❤️', '😄', '🎉', '👀', '✅'];

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-80px)] items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] bg-gray-100">
      {/* Left Sidebar - Channels List */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-gray-800" />
              <h1 className="text-lg font-bold text-gray-900">Team Chat</h1>
            </div>
            {totalUnread > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                {totalUnread} unread
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['all', 'channels', 'direct'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-gray-900 border-b-2 border-gray-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'channels' ? 'Channels' : 'Direct'}
            </button>
          ))}
        </div>

        {/* Channels List */}
        <div className="flex-1 overflow-y-auto">
          {/* Channels Section */}
          {(activeTab === 'all' || activeTab === 'channels') && (
            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold text-gray-500 uppercase">Channels</span>
                {permissions.can_create_channel && (
                  <button
                    onClick={openCreateModal}
                    className="p-1 hover:bg-gray-100 rounded"
                    title="Create channel"
                  >
                    <Plus className="w-4 h-4 text-gray-500" />
                  </button>
                )}
              </div>
              {filteredChannels.length === 0 ? (
                <p className="px-3 py-4 text-sm text-gray-500 text-center">No channels yet</p>
              ) : (
                filteredChannels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleSelectChannel(channel)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      selectedChannel?.id === channel.id
                        ? 'bg-gray-100'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="relative">
                      <Hash className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      {channel.is_private && (
                        <Lock className="w-2.5 h-2.5 text-gray-400 absolute -bottom-0.5 -right-0.5" />
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-sm truncate ${
                            channel.unread_count > 0 ? 'font-semibold text-gray-900' : 'text-gray-700'
                          }`}
                        >
                          {channel.name}
                        </span>
                        {channel.unread_count > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                            {channel.unread_count}
                          </span>
                        )}
                      </div>
                      {channel.last_message && (
                        <p className="text-xs text-gray-500 truncate">
                          {channel.last_message_by}: {channel.last_message}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Direct Messages Section */}
          {(activeTab === 'all' || activeTab === 'direct') && (
            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1.5 mt-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">Direct</span>
                <button
                  onClick={openNewDMModal}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="New direct message"
                >
                  <Plus className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              {filteredDMs.length === 0 ? (
                <p className="px-3 py-4 text-sm text-gray-500 text-center">No direct messages</p>
              ) : (
                filteredDMs.map((dm) => (
                  <button
                    key={dm.id}
                    onClick={() => handleSelectChannel(dm)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      selectedChannel?.id === dm.id ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center text-xs font-semibold">
                        {dm.members[0]?.initials || '?'}
                      </div>
                      {dm.members[0]?.is_online && (
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-sm truncate ${
                            dm.unread_count > 0 ? 'font-semibold text-gray-900' : 'text-gray-700'
                          }`}
                        >
                          {dm.name}
                        </span>
                        {dm.unread_count > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                            {dm.unread_count}
                          </span>
                        )}
                      </div>
                      {dm.last_message && (
                        <p className="text-xs text-gray-500 truncate">{dm.last_message}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">Message data retention: 90 days</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedChannel ? (
          <>
            {/* Channel Header */}
            <div className="h-16 border-b border-gray-200 px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedChannel.type === 'channel' ? (
                  <div className="relative">
                    <Hash className="w-5 h-5 text-gray-500" />
                    {selectedChannel.is_private && (
                      <Lock className="w-3 h-3 text-gray-400 absolute -bottom-0.5 -right-0.5" />
                    )}
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center text-sm font-semibold">
                    {selectedChannel.members[0]?.initials || '?'}
                  </div>
                )}
                <div>
                  <h2 className="font-semibold text-gray-900">{selectedChannel.name}</h2>
                  {selectedChannel.type === 'channel' && (
                    <p className="text-xs text-gray-500">
                      {selectedChannel.member_count} members
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Bell className="w-5 h-5 text-gray-500" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Pin className="w-5 h-5 text-gray-500" />
                </button>
                <button
                  onClick={() => setShowMembersSidebar(!showMembersSidebar)}
                  className={`p-2 rounded-lg transition-colors ${
                    showMembersSidebar ? 'bg-gray-100' : 'hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-5 h-5 text-gray-500" />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <MoreVertical className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Channel Description */}
            {selectedChannel.description && (
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                <p className="text-sm text-gray-600">{selectedChannel.description}</p>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <MessageCircle className="w-12 h-12 mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No messages yet</p>
                  <p className="text-sm">Start the conversation!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className="group flex gap-3 relative">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {message.user_initials}
                      </div>

                      {/* Message Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{message.user_name}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(message.created_at).toLocaleString()}
                          </span>
                          {message.is_pinned && (
                            <span className="flex items-center gap-1 text-xs text-amber-600">
                              <Pin className="w-3 h-3" /> Pinned
                            </span>
                          )}
                          {message.is_edited && (
                            <span className="text-xs text-gray-400">(edited)</span>
                          )}
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">
                          {message.is_deleted ? '[Message deleted]' : message.content}
                        </p>

                        {/* Reactions */}
                        {message.reactions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {message.reactions.map((reaction, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleAddReaction(message.id, reaction.emoji)}
                                className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition-colors"
                                title={reaction.users.join(', ')}
                              >
                                <span>{reaction.emoji}</span>
                                <span className="text-gray-600">{reaction.count}</span>
                              </button>
                            ))}
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setShowEmojiPicker(
                                    showEmojiPicker === message.id ? null : message.id
                                  )
                                }
                                className="p-1 hover:bg-gray-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Smile className="w-4 h-4 text-gray-500" />
                              </button>
                              {showEmojiPicker === message.id && (
                                <div className="absolute bottom-full left-0 mb-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg flex gap-1 z-10">
                                  {quickEmojis.map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={() => handleAddReaction(message.id, emoji)}
                                      className="p-1.5 hover:bg-gray-100 rounded text-lg"
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
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex items-end gap-2 bg-gray-50 rounded-xl p-3 border border-gray-200 focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-gray-200">
                <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                  <Paperclip className="w-5 h-5 text-gray-500" />
                </button>
                <textarea
                  ref={inputRef}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message #${selectedChannel.name}`}
                  rows={1}
                  className="flex-1 bg-transparent resize-none outline-none text-gray-700 placeholder-gray-400 py-2"
                  style={{ maxHeight: '120px' }}
                />
                <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                  <Smile className="w-5 h-5 text-gray-500" />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className={`p-2 rounded-lg transition-colors ${
                    messageInput.trim()
                      ? 'bg-gray-800 hover:bg-gray-900 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2 px-2">
                Press Enter to send, Shift+Enter for new line. Use @name to mention someone.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Team Chat</h2>
              <p className="text-gray-600 mb-6">
                {channels.length === 0
                  ? 'No channels yet. Create one to start chatting!'
                  : 'Select a channel to start chatting'}
              </p>
              {permissions.can_create_channel && channels.length === 0 && (
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Create Your First Channel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Members */}
      {showMembersSidebar && selectedChannel && selectedChannel.type === 'channel' && (
        <div className="w-64 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">
              Members ({selectedChannel.member_count})
            </h3>
            <p className="text-xs text-gray-500">
              {selectedChannel.members.filter((m) => m.is_online).length} online
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {selectedChannel.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center text-sm font-semibold">
                    {member.initials}
                  </div>
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full ${
                      member.is_online ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                  <p className="text-xs text-gray-500 truncate">{member.role}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-gray-200">
            <button
              onClick={openAddMembersModal}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Members
            </button>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Create Channel</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Channel Name <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <Hash className="w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="e.g., engineering-team"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={newChannelDescription}
                  onChange={(e) => setNewChannelDescription(e.target.value)}
                  placeholder="What's this channel about?"
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none resize-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setNewChannelPrivate(!newChannelPrivate)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    newChannelPrivate
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {newChannelPrivate ? (
                    <>
                      <Lock className="w-4 h-4" /> Private
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" /> Public
                    </>
                  )}
                </button>
                <span className="text-sm text-gray-500">
                  {newChannelPrivate
                    ? 'Only invited members can see this channel'
                    : 'Anyone can join this channel'}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add Members (Optional)
                </label>
                <div className="border border-gray-300 rounded-lg max-h-40 overflow-y-auto">
                  {availableUsers.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => toggleMemberSelection(user.id)}
                      className={`flex items-center gap-3 p-2 cursor-pointer hover:bg-gray-50 ${
                        selectedMemberIds.includes(user.id) ? 'bg-gray-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(user.id)}
                        onChange={() => {}}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">{user.name}</span>
                      <span className="text-xs text-gray-500">{user.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateChannel}
                disabled={isCreating || !newChannelName.trim()}
                className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Channel'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showAddMembersModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add Members</h2>
              <button
                onClick={() => setShowAddMembersModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                {availableUsers
                  .filter(
                    (user) =>
                      !selectedChannel?.members.some((m) => m.user_id === user.id)
                  )
                  .map((user) => (
                    <div
                      key={user.id}
                      onClick={() => toggleMemberSelection(user.id)}
                      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 ${
                        selectedMemberIds.includes(user.id) ? 'bg-gray-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(user.id)}
                        onChange={() => {}}
                        className="w-4 h-4"
                      />
                      <div className="w-8 h-8 rounded-full bg-gray-700 text-white flex items-center justify-center text-sm font-semibold">
                        {user.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowAddMembersModal(false);
                  setSelectedMemberIds([]);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMembers}
                disabled={selectedMemberIds.length === 0}
                className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add {selectedMemberIds.length > 0 ? `(${selectedMemberIds.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Direct Message Modal */}
      {showNewDMModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">New Direct Message</h2>
              <button
                onClick={() => setShowNewDMModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">Select a team member to start a conversation</p>
              <div className="border border-gray-300 rounded-lg max-h-80 overflow-y-auto">
                {isLoadingUsers ? (
                  <div className="p-4 text-center">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-spin" />
                    <p className="text-sm text-gray-500">Loading team members...</p>
                  </div>
                ) : availableUsers.filter(u => u.id !== currentUser?.id).length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">No team members found</p>
                  </div>
                ) : (
                  availableUsers
                    .filter(u => u.id !== currentUser?.id)
                    .map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleStartDM(user.id, user.name)}
                        disabled={isCreatingDM}
                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center text-sm font-semibold">
                          {user.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                        <span className="text-xs text-gray-400 capitalize">{user.role?.replace('_', ' ') || 'User'}</span>
                      </button>
                    ))
                )}
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setShowNewDMModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
