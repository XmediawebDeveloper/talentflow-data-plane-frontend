'use client';

import { Link as LinkIcon, Plus, Settings, Trash2, Loader2, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { integrationsApi, Integration } from '@/lib/services/settingsService';
import { toast } from 'sonner';

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

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
      <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
          <p className="text-sm font-medium text-gray-600">Loading integrations...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-50">
      <div className="max-w-7xl mx-auto">
        {/* SaaS Hero Header */}
        <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
              <LinkIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3 w-3 text-brand-orange" />
                Connected apps
              </div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Integrations</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">Connect TalentFlow with your favorite tools and services.</p>
            </div>
          </div>
        </section>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-5 sm:mb-6 overflow-x-auto scrollbar-hide">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setFilter(category)}
              className={`inline-flex items-center justify-center h-9 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                filter === category
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/20 ring-1 ring-white/10'
                  : 'bg-white text-gray-700 hover:bg-brand-cyan/[0.06] hover:text-brand-blue border border-gray-200 hover:border-brand-blue/30'
              }`}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {filteredIntegrations.length === 0 ? (
            <div className="md:col-span-2 rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <LinkIcon className="w-6 h-6 text-brand-blue" />
              </span>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">No integrations found</h3>
              <p className="text-sm text-gray-500">No integrations available in this category.</p>
            </div>
          ) : (
            filteredIntegrations.map((integration) => (
              <div
                key={integration.id}
                className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 lg:p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] hover:-translate-y-0.5 hover:shadow-md hover:border-brand-blue/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-12 h-12 bg-gradient-to-br from-brand-blue/[0.06] to-brand-cyan/[0.06] ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center text-2xl shrink-0">
                      {integration.icon || '🔗'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                        {integration.is_connected && (
                          <span className="px-2 py-0.5 bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/15 rounded-full text-xs font-medium">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{integration.description}</p>
                      {integration.category && (
                        <span className="inline-block mt-2 px-2 py-0.5 bg-brand-blue/[0.06] text-brand-blue ring-1 ring-brand-blue/15 rounded-full text-xs font-medium">
                          {integration.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {integration.is_connected ? (
                      <>
                        <button className="p-2 rounded-lg text-gray-500 transition hover:bg-brand-cyan/[0.06] hover:text-brand-blue" aria-label="Settings" title="Settings">
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => disconnectIntegration(integration.integration_type)}
                          disabled={disconnectingId === integration.integration_type}
                          className="p-2 rounded-lg text-brand-orange-deep transition hover:bg-brand-orange/10 disabled:opacity-50"
                          aria-label="Disconnect" title="Disconnect"
                        >
                          {disconnectingId === integration.integration_type ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => connectIntegration(integration.integration_type)}
                        disabled={connectingId === integration.integration_type}
                        className="inline-flex items-center justify-center gap-1.5 sm:gap-2 h-9 px-3 sm:px-4 bg-brand-blue text-white text-sm font-medium rounded-xl ring-1 ring-white/10 shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-50 disabled:translate-y-0"
                      >
                        {connectingId === integration.integration_type ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        {connectingId === integration.integration_type ? 'Connecting...' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Request Integration */}
        <div className="mt-6 sm:mt-8 rounded-2xl border border-brand-blue/15 bg-gray-50 p-5 sm:p-6 text-center ring-1 ring-brand-blue/5">
          <h3 className="text-base font-semibold text-gray-900 mb-1.5">Need a different integration?</h3>
          <p className="text-xs sm:text-sm text-gray-500 mb-4">
            Let us know what tools you&apos;d like to connect with TalentFlow.
          </p>
          <button className="inline-flex items-center justify-center h-10 px-5 bg-white border border-gray-200 text-sm text-brand-blue font-semibold rounded-xl hover:border-brand-blue/30 hover:bg-brand-cyan/[0.04] transition-colors">
            Request Integration
          </button>
        </div>
      </div>
    </main>
  );
}
