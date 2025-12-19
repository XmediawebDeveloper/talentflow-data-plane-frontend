'use client';

import { Link as LinkIcon, Check, Plus, Settings, ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';

const availableIntegrations = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Get notifications and updates in Slack',
    icon: '💬',
    category: 'Communication',
    connected: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync interviews with Google Calendar',
    icon: '📅',
    category: 'Scheduling',
    connected: true,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Import candidate profiles from LinkedIn',
    icon: '💼',
    category: 'Sourcing',
    connected: false,
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    description: 'Sync with Greenhouse ATS',
    icon: '🌱',
    category: 'ATS',
    connected: false,
  },
  {
    id: 'workday',
    name: 'Workday',
    description: 'Connect to Workday HCM',
    icon: '☀️',
    category: 'HCM',
    connected: false,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connect to 5000+ apps via Zapier',
    icon: '⚡',
    category: 'Automation',
    connected: false,
  },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState(availableIntegrations);
  const [filter, setFilter] = useState('all');

  const categories = ['all', ...new Set(integrations.map(i => i.category))];

  const filteredIntegrations = filter === 'all'
    ? integrations
    : integrations.filter(i => i.category === filter);

  const toggleConnection = (id: string) => {
    setIntegrations(prev =>
      prev.map(i => i.id === id ? { ...i, connected: !i.connected } : i)
    );
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
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
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-2 gap-4">
          {filteredIntegrations.map((integration) => (
            <div
              key={integration.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl">
                    {integration.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{integration.name}</h3>
                      {integration.connected && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{integration.description}</p>
                    <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      {integration.category}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {integration.connected ? (
                    <>
                      <button className="p-2 hover:bg-gray-100 rounded-lg">
                        <Settings className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => toggleConnection(integration.id)}
                        className="p-2 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => toggleConnection(integration.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
