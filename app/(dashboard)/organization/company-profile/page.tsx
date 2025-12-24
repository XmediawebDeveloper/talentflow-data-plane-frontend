'use client';

import { Building2, Save, Globe, Mail, Phone, MapPin, Users, Calendar, Edit2, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface OrganizationProfile {
  id?: string;
  tenant_id?: string;
  company_name?: string;
  website?: string;
  contact_email?: string;
  contact_phone?: string;
  industry?: string;
  company_size?: string;
  founded_year?: string;
  description?: string;
  logo_url?: string;
  street_address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
}

export default function CompanyProfilePage() {
  const { tenant } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [companyData, setCompanyData] = useState({
    name: '',
    website: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    country: '',
    industry: '',
    size: '',
    founded: '',
    description: '',
    zipCode: '',
  });

  // Prevent duplicate fetches in development mode
  const hasFetched = useRef(false);

  // Fetch organization profile on mount
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchOrganizationProfile();
  }, []);

  const fetchOrganizationProfile = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('accessToken');
      console.log('[DEBUG] Fetching organization profile, token exists:', !!token);

      if (!token) {
        console.error('[DEBUG] No token found in localStorage');
        setError('Session expired. Please log in again.');
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/settings/organization-profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('[DEBUG] GET response status:', response.status);

      if (response.ok) {
        const data: OrganizationProfile = await response.json();
        setCompanyData({
          name: data.company_name || tenant?.name || '',
          website: data.website || '',
          email: data.contact_email || '',
          phone: data.contact_phone || '',
          address: data.street_address || '',
          city: data.city || '',
          state: data.state || '',
          country: data.country || '',
          industry: data.industry || '',
          size: data.company_size || '',
          founded: data.founded_year || '',
          description: data.description || '',
          zipCode: data.zip_code || '',
        });
      }
    } catch (err) {
      console.error('Failed to fetch organization profile:', err);
      setError('Failed to load organization profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const token = localStorage.getItem('accessToken');

      // Check if token exists
      if (!token) {
        throw new Error('Session expired. Please log in again.');
      }

      console.log('[DEBUG] Saving organization profile with token:', token.substring(0, 20) + '...');

      const response = await fetch(`${API_URL}/settings/organization-profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_name: companyData.name,
          website: companyData.website,
          contact_email: companyData.email,
          contact_phone: companyData.phone,
          industry: companyData.industry,
          company_size: companyData.size,
          founded_year: companyData.founded,
          description: companyData.description,
          street_address: companyData.address,
          city: companyData.city,
          state: companyData.state,
          country: companyData.country,
          zip_code: companyData.zipCode,
        }),
      });

      console.log('[DEBUG] Response status:', response.status);

      if (response.ok) {
        setSuccessMessage('Organization profile saved successfully');
        setIsEditing(false);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const data = await response.json();
        console.error('[DEBUG] Error response:', data);

        // Handle 401 specifically
        if (response.status === 401) {
          throw new Error('Session expired. Please log in again.');
        }

        throw new Error(data.detail || 'Failed to save');
      }
    } catch (err: any) {
      console.error('Failed to save organization profile:', err);
      setError(err.message || 'Failed to save organization profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="max-w-4xl mx-auto flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
          <span className="ml-2 text-gray-600">Loading organization profile...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Company Profile</h1>
                <p className="text-sm text-gray-600">Manage your organization's information</p>
              </div>
            </div>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Company Info Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                type="text"
                value={companyData.name}
                onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="text"
                value={companyData.website}
                onChange={(e) => setCompanyData({ ...companyData, website: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={companyData.email}
                onChange={(e) => setCompanyData({ ...companyData, email: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={companyData.phone}
                onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
              <input
                type="text"
                value={companyData.industry}
                onChange={(e) => setCompanyData({ ...companyData, industry: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
              <input
                type="text"
                value={companyData.size}
                onChange={(e) => setCompanyData({ ...companyData, size: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
          </div>
        </div>

        {/* Address Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                value={companyData.address}
                onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={companyData.city}
                onChange={(e) => setCompanyData({ ...companyData, city: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={companyData.state}
                onChange={(e) => setCompanyData({ ...companyData, state: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input
                type="text"
                value={companyData.country}
                onChange={(e) => setCompanyData({ ...companyData, country: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP/Postal Code</label>
              <input
                type="text"
                value={companyData.zipCode}
                onChange={(e) => setCompanyData({ ...companyData, zipCode: e.target.value })}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
              />
            </div>
          </div>
        </div>

        {/* Description Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Description</h2>
          <textarea
            value={companyData.description}
            onChange={(e) => setCompanyData({ ...companyData, description: e.target.value })}
            disabled={!isEditing}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-700 disabled:bg-gray-50"
          />
        </div>
      </div>
    </main>
  );
}
