'use client';

import { useState, useEffect } from 'react';
import { Building2, Plus, Search, Edit2, Trash2, Check, X, Users, Calendar } from 'lucide-react';
import { Tenant } from '@/lib/types/tenant';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';

interface TenantsManagementProps {
  currentTenant?: Tenant;
  onSelectTenant?: (tenant: Tenant) => void;
}

// Mock tenants data - will be replaced with API calls
const mockTenants = [
  {
    id: '1',
    name: 'TalentFlow Demo Company',
    email: 'demo@talentflow.com',
    isActive: true,
    userCount: 5,
    createdAt: '2024-01-15',
    subscription: { planName: 'Professional', status: 'active' }
  },
  {
    id: '2',
    name: 'Tech Recruiters Inc',
    email: 'admin@techrecruiters.com',
    isActive: true,
    userCount: 12,
    createdAt: '2024-02-20',
    subscription: { planName: 'Enterprise', status: 'active' }
  },
  {
    id: '3',
    name: 'Startup Hiring Co',
    email: 'hr@startuphiring.io',
    isActive: false,
    userCount: 3,
    createdAt: '2024-03-10',
    subscription: { planName: 'Basic', status: 'inactive' }
  },
];

export default function TenantsManagement({ currentTenant, onSelectTenant }: TenantsManagementProps) {
  const dialog = useGlobalDialog();
  const [tenants, setTenants] = useState(mockTenants);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<typeof mockTenants[0] | null>(null);
  const [newTenant, setNewTenant] = useState({ name: '', email: '' });

  const filteredTenants = tenants.filter(tenant =>
    tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tenant.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTenant = () => {
    if (newTenant.name && newTenant.email) {
      const tenant = {
        id: Date.now().toString(),
        name: newTenant.name,
        email: newTenant.email,
        isActive: true,
        userCount: 0,
        createdAt: new Date().toISOString().split('T')[0],
        subscription: { planName: 'Basic', status: 'active' as const }
      };
      setTenants([...tenants, tenant]);
      setNewTenant({ name: '', email: '' });
      setIsCreateModalOpen(false);
    }
  };

  const handleDeleteTenant = async (id: string) => {
    if (await dialog.confirm({ title: 'Delete Tenant', message: 'Are you sure you want to delete this tenant? This action cannot be undone.', variant: 'error', confirmText: 'Delete' })) {
      setTenants(tenants.filter(t => t.id !== id));
    }
  };

  const handleToggleActive = (id: string) => {
    setTenants(tenants.map(t =>
      t.id === id ? { ...t, isActive: !t.isActive } : t
    ));
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Tenants</h1>
              <p className="text-sm text-gray-600">Manage your organization tenants</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Add Tenant
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search tenants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Tenants</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">{tenants.length}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-gray-800" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Tenants</p>
              <p className="text-3xl font-semibold text-green-600 mt-1">
                {tenants.filter(t => t.isActive).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1">
                {tenants.reduce((acc, t) => acc + t.userCount, 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-gray-800" />
            </div>
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tenant
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Users
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredTenants.map((tenant) => (
              <tr
                key={tenant.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelectTenant && onSelectTenant(tenant as unknown as Tenant)}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {tenant.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                      <div className="text-xs text-gray-500">{tenant.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                    tenant.subscription.planName === 'Enterprise'
                      ? 'bg-gray-100 text-gray-900'
                      : tenant.subscription.planName === 'Professional'
                      ? 'bg-gray-100 text-gray-900'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {tenant.subscription.planName}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-900">{tenant.userCount}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleActive(tenant.id);
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      tenant.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {tenant.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="w-4 h-4" />
                    {tenant.createdAt}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTenant(tenant);
                      }}
                      className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTenant(tenant.id);
                      }}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredTenants.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No tenants found</p>
          </div>
        )}
      </div>

      {/* Create Tenant Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Create New Tenant</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tenant Name
                </label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  placeholder="Enter tenant name"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newTenant.email}
                  onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                  placeholder="admin@company.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTenant}
                className="px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
              >
                Create Tenant
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
