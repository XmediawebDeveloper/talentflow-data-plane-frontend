'use client';

import { Link as LinkIcon, Plus, Settings, Trash2, Loader2, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { integrationsApi, Integration } from '@/lib/services/settingsService';
import { toast } from 'sonner';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const rootRef = useScrollRestoration<HTMLElement>('settings-integrations', !isLoading);
  useListStatePersistence(
    'settings-integrations',
    { filter },
    (s) => { if (typeof s.filter === 'string') setFilter(s.filter); },
  );

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async (category?: string) => {
    try {
      const response = await integrationsApi.list(category === 'all' ? undefined : category);
      setIntegrations(response.integrations);
    } catch (error) {
      console.error('Error loading integrations:', error);
      toast.error('Failed to load integrations');
    } finally {
      setIsLoading(false);
    }
  };

  const categories = ['all', ...new Set(integrations.map(i => i.category).filter(Boolean))];

  const filteredIntegrations = filter === 'all'
    ? integrations
    : integrations.filter(i => i.category === filter);

  const connectIntegration = async (integrationType: string) => {
    setConnectingId(integrationType);
    try {
      await integrationsApi.connect(integrationType);
      setIntegrations(prev =>
        prev.map(i => i.integration_type === integrationType ? { ...i, is_connected: true } : i)
      );
      toast.success('Integration connected successfully');
    } catch (error) {
      console.error('Error connecting integration:', error);
      toast.error('Failed to connect integration');
    } finally {
      setConnectingId(null);
    }
  };

  const disconnectIntegration = async (integrationType: string) => {
    setDisconnectingId(integrationType);
    try {
      await integrationsApi.disconnect(integrationType);
      setIntegrations(prev =>
        prev.map(i => i.integration_type === integrationType ? { ...i, is_connected: false } : i)
      );
      toast.success('Integration disconnected');
    } catch (error) {
      console.error('Error disconnecting integration:', error);
      toast.error('Failed to disconnect integration');
    } finally {
      setDisconnectingId(null);
    }
  };

  if (isLoading) {
    return (
      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="tf-page-sheet">
            {/* Hero */}
            <section className="tf-panel relative mb-4 sm:mb-6 overflow-hidden p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-80 max-w-full" />
                </div>
              </div>
            </section>
            {/* Category filter chips */}
            <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-20 rounded-lg" />
              ))}
            </div>
            {/* Integration cards grid */}
            <div className="tf-grid-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="tf-panel p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      <Skeleton className="w-12 h-12 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-24 shrink-0 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings', href: '/settings/general-settings' }, { label: 'Integrations' }]} />

        {/* SaaS Hero Header */}
        <section className="relative mb-4 sm:mb-6 overflow-hidden tf-card-soft p-4 sm:p-6">
          <div className="relative flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <LinkIcon className="h-5 w-5 text-brand-blue" />
            </div>
            <div>
              <div className="tf-badge mb-2 gap-1.5 bg-brand-orange/5 ring-1 ring-brand-orange/20 text-2xs text-brand-orange-deep">
                <Sparkles className="h-3 w-3 text-brand-orange-deep" />
                Connected apps
              </div>
              <h1 className="tf-page-title">Integrations</h1>
              <p className="mt-2 max-w-2xl tf-body-secondary">Connect TalentFlow with your favorite tools and services.</p>
            </div>
          </div>
        </section>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-4 sm:mb-6 overflow-x-auto scrollbar-hide">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setFilter(category)}
              className={`inline-flex items-center justify-center h-9 px-3 sm:px-4 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                filter === category
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                  : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue border border-gray-200 dark:border-slate-700 hover:border-brand-blue/30'
              }`}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>

        {/* Integrations Grid */}
        <div className="tf-grid-2">
          {filteredIntegrations.length === 0 ? (
            <div className="md:col-span-2 tf-card-soft p-10 text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <LinkIcon className="w-6 h-6 text-brand-blue" />
              </span>
              <h3 className="tf-section-title mb-1">No integrations found</h3>
              <p className="tf-body-muted">No integrations available in this category.</p>
            </div>
          ) : (
            filteredIntegrations.map((integration) => (
              <div
                key={integration.id}
                className="tf-card-soft p-4 sm:p-6 hover:shadow-md hover:border-brand-blue/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-12 h-12 bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center text-2xl shrink-0">
                      {integration.icon || '🔗'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-slate-50">{integration.name}</h3>
                        {integration.is_connected && (
                          <span className="tf-badge bg-brand-cyan/5 text-brand-cyan ring-1 ring-brand-cyan/20">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="tf-body-muted mt-1">{integration.description}</p>
                      {integration.category && (
                        <span className="tf-badge inline-block mt-2 bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/15">
                          {integration.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {integration.is_connected ? (
                      <>
                        <Button variant="secondary" size="sm" aria-label="Settings" title="Settings">
                          <Settings className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => disconnectIntegration(integration.integration_type)}
                          disabled={disconnectingId === integration.integration_type}
                          className=""
                          aria-label="Disconnect" title="Disconnect"
                        >
                          {disconnectingId === integration.integration_type ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={() => connectIntegration(integration.integration_type)}
                        disabled={connectingId === integration.integration_type}
                      >
                        {connectingId === integration.integration_type ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        {connectingId === integration.integration_type ? 'Connecting...' : 'Connect'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Request Integration */}
        <div className="mt-6 sm:mt-8 tf-card-soft p-4 sm:p-6 text-center">
          <h3 className="tf-section-title mb-1.5">Need a different integration?</h3>
          <p className="tf-body-muted mb-4">
            Let us know what tools you&apos;d like to connect with TalentFlow.
          </p>
          <Button variant="secondary">
            Request Integration
          </Button>
        </div>
      </div>
      </div>
    </main>
  );
}
