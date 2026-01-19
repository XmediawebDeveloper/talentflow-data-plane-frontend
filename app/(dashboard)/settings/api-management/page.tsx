'use client';

import { Key, Plus, Copy, Eye, EyeOff, Trash2, RefreshCw, Clock } from 'lucide-react';
import { useState } from 'react';

const mockApiKeys = [
  {
    id: '1',
    name: 'Production API Key',
    key: 'tf_prod_xxxxxxxxxxxxxxxxxxxxxxxxxx',
    created: 'Dec 1, 2024',
    lastUsed: '2 min ago',
    status: 'active',
  },
  {
    id: '2',
    name: 'Development API Key',
    key: 'tf_dev_yyyyyyyyyyyyyyyyyyyyyyyy',
    created: 'Nov 15, 2024',
    lastUsed: '5 days ago',
    status: 'active',
  },
];

export default function ApiManagementPage() {
  const [apiKeys, setApiKeys] = useState(mockApiKeys);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const toggleShowKey = (id: string) => {
    setShowKey(prev => prev === id ? null : id);
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    // Show toast notification
  };

  const deleteKey = (id: string) => {
    setApiKeys(prev => prev.filter(k => k.id !== id));
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-600 to-yellow-700 rounded-xl flex items-center justify-center shadow-lg">
                <Key className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">API Management</h1>
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
          {apiKeys.map((apiKey) => (
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
                      {showKey === apiKey.id ? apiKey.key : '••••••••••••••••••••••••••'}
                    </code>
                    <button
                      onClick={() => toggleShowKey(apiKey.id)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg"
                    >
                      {showKey === apiKey.id ? (
                        <EyeOff className="w-4 h-4 text-gray-600" />
                      ) : (
                        <Eye className="w-4 h-4 text-gray-600" />
                      )}
                    </button>
                    <button
                      onClick={() => copyKey(apiKey.key)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg"
                    >
                      <Copy className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Created: {apiKey.created}
                    </span>
                    <span>Last used: {apiKey.lastUsed}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-gray-100 rounded-lg">
                    <RefreshCw className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={() => deleteKey(apiKey.id)}
                    className="p-2 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))}
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
    </main>
  );
}
