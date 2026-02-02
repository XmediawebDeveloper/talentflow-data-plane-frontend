'use client';

import { Link as LinkIcon, Plus, Settings, Trash2, Loader2 } from 'lucide-react';
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
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading integrations...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl flex items-center justify-center shadow-lg">
              <LinkIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
              <p className="text-sm text-gray-600">Connect TalentFlow with your favorite tools</p>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-6">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setFilter(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === category
                  ? 'bg-gray-800 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-2 gap-4">
          {filteredIntegrations.length === 0 ? (
            <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <LinkIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Integrations Found</h3>
              <p className="text-gray-500">No integrations available in this category.</p>
            </div>
          ) : (
            filteredIntegrations.map((integration) => (
              <div
                key={integration.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl">
                      {integration.icon || '🔗'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900">{integration.name}</h3>
                        {integration.is_connected && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{integration.description}</p>
                      {integration.category && (
                        <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {integration.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {integration.is_connected ? (
                      <>
                        <button className="p-2 hover:bg-gray-100 rounded-lg" title="Settings">
                          <Settings className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => disconnectIntegration(integration.integration_type)}
                          disabled={disconnectingId === integration.integration_type}
                          className="p-2 hover:bg-red-50 rounded-lg disabled:opacity-50"
                          title="Disconnect"
                        >
                          {disconnectingId === integration.integration_type ? (
                            <Loader2 className="w-4 h-4 text-red-600 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-red-600" />
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => connectIntegration(integration.integration_type)}
                        disabled={connectingId === integration.integration_type}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50"
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
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <h3 className="font-medium text-gray-900 mb-2">Need a different integration?</h3>
          <p className="text-sm text-gray-500 mb-4">
            Let us know what tools you'd like to connect with TalentFlow.
          </p>
          <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            Request Integration
          </button>
        </div>
      </div>
    </main>
  );
}
