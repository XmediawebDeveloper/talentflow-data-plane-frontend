'use client';

import { Key, Plus, Copy, Eye, EyeOff, Trash2, RefreshCw, Clock, Loader2, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiKeysApi, ApiKey, ApiKeyCreateResponse } from '@/lib/services/settingsService';
import { toast } from 'sonner';

export default function ApiManagementPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState<number | undefined>(undefined);
  const [isCreating, setIsCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const response = await apiKeysApi.list();
      setApiKeys(response.api_keys);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleShowKey = (id: string) => {
    setShowKey(prev => prev === id ? null : id);
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }

    setIsCreating(true);
    try {
      const response = await apiKeysApi.create({
        name: newKeyName,
        expires_in_days: newKeyExpiry,
      });
      setNewlyCreatedKey(response.key);
      toast.success('API key created successfully');
      await loadApiKeys();
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewKeyName('');
    setNewKeyExpiry(undefined);
    setNewlyCreatedKey(null);
  };

  const deleteKey = async (id: string) => {
    setDeletingId(id);
    try {
      await apiKeysApi.delete(id);
      setApiKeys(prev => prev.filter(k => k.id !== id));
      toast.success('API key deleted');
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    } finally {
      setDeletingId(null);
    }
  };

  const regenerateKey = async (id: string) => {
    setRegeneratingId(id);
    try {
      const response = await apiKeysApi.regenerate(id);
      setNewlyCreatedKey(response.key);
      setShowCreateModal(true);
      setNewKeyName(response.name);
      await loadApiKeys();
      toast.success('API key regenerated');
    } catch (error) {
      console.error('Error regenerating API key:', error);
      toast.error('Failed to regenerate API key');
    } finally {
      setRegeneratingId(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatLastUsed = (dateString?: string) => {
    if (!dateString) return 'Never used';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading API keys...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-600 to-yellow-700 rounded-xl flex items-center justify-center shadow-lg">
                <Key className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">API Management</h1>
                <p className="text-sm text-gray-600">Manage your API keys and access</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create API Key
            </button>
          </div>
        </div>

        {/* API Keys List */}
        <div className="space-y-4">
          {apiKeys.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
              <p className="text-gray-500 mb-4">Create your first API key to start using the TalentFlow API.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create API Key
              </button>
            </div>
          ) : (
            apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-gray-900">{apiKey.name}</h3>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        {apiKey.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <code className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-mono">
                        {apiKey.key_prefix}
                      </code>
                      <button
                        onClick={() => copyKey(apiKey.key_prefix)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg"
                        title="Copy key prefix"
                      >
                        <Copy className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Created: {formatDate(apiKey.created_at)}
                      </span>
                      <span>Last used: {formatLastUsed(apiKey.last_used_at)}</span>
                      {apiKey.expires_at && (
                        <span>Expires: {formatDate(apiKey.expires_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => regenerateKey(apiKey.id)}
                      disabled={regeneratingId === apiKey.id}
                      className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                      title="Regenerate key"
                    >
                      <RefreshCw className={`w-4 h-4 text-gray-600 ${regeneratingId === apiKey.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => deleteKey(apiKey.id)}
                      disabled={deletingId === apiKey.id}
                      className="p-2 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      title="Delete key"
                    >
                      {deletingId === apiKey.id ? (
                        <Loader2 className="w-4 h-4 text-red-600 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-red-600" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* API Documentation Link */}
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Key className="w-5 h-5 text-gray-800" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-800">API Documentation</h3>
              <p className="text-sm text-gray-900 mt-1">
                Learn how to integrate TalentFlow into your applications. View our comprehensive API documentation for endpoints, authentication, and examples.
              </p>
              <button className="mt-3 text-sm font-medium text-gray-800 hover:text-gray-900">
                View Documentation →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create API Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                {newlyCreatedKey ? 'API Key Created' : 'Create API Key'}
              </h2>
              <button
                onClick={closeCreateModal}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {newlyCreatedKey ? (
              <div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800 font-medium mb-2">
                    Save this key now - you won&apos;t be able to see it again!
                  </p>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm font-mono break-all">
                      {newlyCreatedKey}
                    </code>
                    <button
                      onClick={() => copyKey(newlyCreatedKey)}
                      className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
                    >
                      <Copy className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={closeCreateModal}
                  className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Key Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production API Key"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expiry (optional)
                  </label>
                  <select
                    value={newKeyExpiry || ''}
                    onChange={(e) => setNewKeyExpiry(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
                  >
                    <option value="">Never expires</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="180">180 days</option>
                    <option value="365">1 year</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={closeCreateModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={isCreating || !newKeyName.trim()}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isCreating ? 'Creating...' : 'Create Key'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
