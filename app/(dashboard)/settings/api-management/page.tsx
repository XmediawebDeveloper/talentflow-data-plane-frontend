'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Key, Plus, Copy, Eye, EyeOff, Trash2, RefreshCw, Clock, Loader2, X, Sparkles, BookOpen } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiKeysApi, ApiKey, ApiKeyCreateResponse } from '@/lib/services/settingsService';
import { toast } from 'sonner';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import FilterSelect from '@/components/ui/filter-select';

export default function ApiManagementPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('canManageApiManagement');
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

  const rootRef = useScrollRestoration<HTMLElement>('settings-api-management', !isLoading);

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
      <FeatureGate feature="api_access">
        <main className="tf-page">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="tf-page-sheet">
              {/* Hero */}
              <section className="tf-panel relative mb-4 sm:mb-6 overflow-hidden p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-28 rounded-full" />
                      <Skeleton className="h-6 w-44" />
                      <Skeleton className="h-4 w-80 max-w-full" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-36 rounded-lg" />
                </div>
              </section>
              {/* API key cards */}
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="tf-panel p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <Skeleton className="h-8 w-40 rounded-lg" />
                          <Skeleton className="h-7 w-7 rounded-lg" />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Skeleton className="h-8 w-8 rounded-lg" />
                        <Skeleton className="h-8 w-8 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </FeatureGate>
    );
  }

  return (
    <FeatureGate feature="api_access">
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings', href: '/settings/general-settings' }, { label: 'API Management' }]} />

        {/* SaaS Hero Header */}
        <section className="relative mb-4 sm:mb-6 overflow-hidden tf-card-soft p-4 sm:p-6">
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Key className="h-5 w-5 text-brand-blue" />
              </div>
              <div>
                <div className="tf-badge mb-2 gap-1.5 bg-brand-orange/5 ring-1 ring-brand-orange/20 text-2xs text-brand-orange-deep">
                  <Sparkles className="h-3 w-3 text-brand-orange-deep" />
                  Developer access
                </div>
                <h1 className="tf-page-title">API Management</h1>
                <p className="mt-2 max-w-2xl tf-body-secondary">Provision, rotate, and revoke keys used to call the TalentFlow API.</p>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                if (!canManage) return;
                setShowCreateModal(true);
              }}
              aria-disabled={!canManage}
              className={`${(!canManage ? 'opacity-50 cursor-not-allowed' : '')} disabled:opacity-50`}
              title={!canManage ? 'You do not have permission to create API keys' : ''}
            >
              <Plus className="w-4 h-4" />
              Create API Key
            </Button>
          </div>
        </section>

        {/* API Keys List */}
        <div className="space-y-4">
          {apiKeys.length === 0 ? (
            <div className="tf-card-soft p-10 text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Key className="w-6 h-6 text-brand-blue" />
              </span>
              <h3 className="tf-section-title mb-2">No API Keys</h3>
              <p className="text-gray-500 dark:text-slate-500 mb-4">Create your first API key to start using the TalentFlow API.</p>
              <Button
                variant="primary"
                onClick={() => {
                  if (!canManage) return;
                  setShowCreateModal(true);
                }}
                aria-disabled={!canManage}
                className={`${(!canManage ? 'opacity-50 cursor-not-allowed' : '')} disabled:opacity-50`}
                title={!canManage ? 'You do not have permission to create API keys' : ''}
              >
                <Plus className="w-4 h-4" />
                Create API Key
              </Button>
            </div>
          ) : (
            apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="tf-card-soft p-4 sm:p-6 transition hover:shadow-md sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                        <Key className="w-4 h-4" />
                      </span>
                      <h3 className="font-semibold text-gray-900 dark:text-slate-50">{apiKey.name}</h3>
                      <span className="tf-badge bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20">
                        {apiKey.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <code className="px-3 py-1.5 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/15 rounded-lg text-sm font-mono">
                        {apiKey.key_prefix}
                      </code>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copyKey(apiKey.key_prefix)}
                        className=""
                        aria-label="Copy key prefix" title="Copy key prefix"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tf-body-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-brand-blue/70" />
                        Created: {formatISTDate(apiKey.created_at)}
                      </span>
                      <span>Last used: {formatLastUsed(apiKey.last_used_at)}</span>
                      {apiKey.expires_at && (
                        <span>Expires: {formatISTDate(apiKey.expires_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!canManage) return;
                        regenerateKey(apiKey.id);
                      }}
                      disabled={regeneratingId === apiKey.id || !canManage}
                      className=""
                      aria-label="Regenerate key" title={!canManage ? 'You do not have permission to regenerate API keys' : 'Regenerate key'}
                    >
                      <RefreshCw className={`w-4 h-4 ${regeneratingId === apiKey.id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (!canManage) return;
                        deleteKey(apiKey.id);
                      }}
                      disabled={deletingId === apiKey.id || !canManage}
                      className=""
                      aria-label="Delete key" title={!canManage ? 'You do not have permission to delete API keys' : 'Delete key'}
                    >
                      {deletingId === apiKey.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* API Documentation Link */}
        <div className="mt-8 tf-card-soft p-6">
          <div className="flex items-start gap-4">
            <span className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <BookOpen className="w-5 h-5 text-brand-blue" />
            </span>
            <div>
              <h3 className="tf-row-title">API Documentation</h3>
              <p className="tf-body-secondary mt-1">
                Learn how to integrate TalentFlow into your applications. View our comprehensive API documentation for endpoints, authentication, and examples.
              </p>
              <button className="mt-3 text-sm font-semibold text-brand-blue hover:text-brand-blue-2">
                View Documentation →
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Create API Key Modal — only renders if user has Manage permission */}
      {showCreateModal && canManage && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-xl bg-white dark:bg-slate-900 shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.03] dark:ring-white/[0.02] border border-gray-100 dark:border-slate-700/60 max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="relative flex-shrink-0 overflow-hidden bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60 px-6 py-5">
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 flex items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                    <Key className="w-5 h-5 text-brand-blue" />
                  </span>
                  <h2 className="tf-section-title">
                    {newlyCreatedKey ? 'API Key Created' : 'Create API Key'}
                  </h2>
                </div>
                <Button variant="secondary" size="sm" onClick={closeCreateModal} aria-label="Close">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6">
            {newlyCreatedKey ? (
              <div>
                <div className="rounded-lg ring-1 ring-brand-orange/20 bg-brand-orange/5 p-4 mb-4">
                  <p className="text-sm text-brand-orange-deep font-semibold">
                    Save this key now — you won&apos;t be able to see it again!
                  </p>
                </div>
                <div className="mb-4">
                  <label className="block tf-row-title mb-2">
                    Your API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/15 rounded-lg text-sm font-mono break-all">
                      {newlyCreatedKey}
                    </code>
                    <Button variant="secondary" size="sm" onClick={() => copyKey(newlyCreatedKey)} className="flex-shrink-0" aria-label="Copy API key">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Button variant="primary" onClick={closeCreateModal} className="w-full">
                  Done
                </Button>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <label className="block tf-row-title mb-1.5">
                    Key Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production API Key"
                    className="tf-input px-4"
                  />
                </div>
                <div className="mb-6">
                  <label className="block tf-row-title mb-1.5">
                    Expiry (optional)
                  </label>
                  <FilterSelect
                    value={String(newKeyExpiry || '')}
                    onChange={(v) => setNewKeyExpiry(v ? Number(v) : undefined)}
                    ariaLabel="Expiry"
                    options={[
                      { value: '', label: 'Never expires' },
                      { value: '30', label: '30 days' },
                      { value: '90', label: '90 days' },
                      { value: '180', label: '180 days' },
                      { value: '365', label: '1 year' },
                    ]}
                    className="w-full sm:w-full pl-4 sm:pl-4 pr-4 sm:pr-4 py-2 sm:py-2 rounded-lg sm:rounded-lg"
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="primary"
                    onClick={handleCreateKey}
                    disabled={isCreating || !newKeyName.trim()}
                    className="flex-1"
                  >
                    {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isCreating ? 'Creating...' : 'Create Key'}
                  </Button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </main>
    </FeatureGate>
  );
}
