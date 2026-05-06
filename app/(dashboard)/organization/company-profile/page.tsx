'use client';

import { Building2, Save, Edit2, Loader2, ChevronDown, X, Sparkles, AlertCircle, CheckCircle2, MapPin, FileText } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';
import authService from '@/lib/services/authService';
import { handleUnauthorized } from '@/lib/services/api';
import { PageSkeleton } from '@/components/ui/skeleton';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const POLL_INTERVAL_MS = 30_000; // 30 seconds

const COMPANY_SIZE_OPTIONS = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5000+',
];

const INDUSTRY_OPTIONS = [
  'Technology',
  'Healthcare',
  'Finance & Banking',
  'Education',
  'Retail & E-Commerce',
  'Manufacturing',
  'Media & Entertainment',
  'Logistics & Supply Chain',
  'Real Estate',
  'Hospitality & Tourism',
  'Construction',
  'Consulting',
  'Legal',
  'Non-Profit',
  'Government',
  'Other',
];

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

interface ValidationErrors {
  name?: string;
  website?: string;
  email?: string;
  phone?: string;
  founded?: string;
  zipCode?: string;
  description?: string;
  industry?: string;
}

function validate(data: typeof initialFormState): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!data.name.trim()) {
    errors.name = 'Company name is required.';
  } else if (data.name.trim().length < 2) {
    errors.name = 'Company name must be at least 2 characters.';
  }

  if (data.website && !/^https?:\/\/.+\..+/.test(data.website.trim())) {
    errors.website = 'Enter a valid URL starting with http:// or https://';
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (data.phone && !/^[+\d][\d\s\-().]{6,19}$/.test(data.phone.trim())) {
    errors.phone = 'Enter a valid phone number (e.g. +91 9876543210).';
  }

  if (data.founded) {
    const year = parseInt(data.founded, 10);
    const currentYear = new Date().getFullYear();
    if (!/^\d{4}$/.test(data.founded) || year < 1800 || year > currentYear) {
      errors.founded = `Enter a valid year between 1800 and ${currentYear}.`;
    }
  }

  if (data.zipCode && !/^[A-Za-z0-9\s\-]{3,10}$/.test(data.zipCode.trim())) {
    errors.zipCode = 'Enter a valid ZIP / postal code.';
  }

  if (data.description && data.description.length > 2000) {
    errors.description = 'Description must be under 2000 characters.';
  }

  if (data.industry === '__other__') {
    errors.industry = 'Please specify your industry.';
  }

  return errors;
}

const initialFormState = {
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
};

// Company Size field: dropdown + manual input fallback
function CompanySizeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
}) {
  const isPreset = COMPANY_SIZE_OPTIONS.includes(value) || value === '';
  const [mode, setMode] = useState<'select' | 'manual'>(isPreset ? 'select' : 'manual');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (disabled) {
    return (
      <input
        type="text"
        value={value}
        disabled
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600"
      />
    );
  }

  if (mode === 'manual') {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 250 or 1000-2000"
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
        />
        <button
          type="button"
          onClick={() => { setMode('select'); onChange(''); }}
          className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-brand-cyan/[0.06] hover:text-brand-blue hover:border-brand-blue/30 transition whitespace-nowrap"
          aria-label="Switch to dropdown" title="Switch to dropdown"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue text-left flex items-center justify-between"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || 'Select company size'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-xl shadow-brand-blue/10 ring-1 ring-black/[0.02] max-h-60 overflow-y-auto">
          {COMPANY_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition hover:bg-brand-cyan/[0.06] hover:text-brand-blue ${value === opt ? 'bg-brand-blue/[0.06] text-brand-blue font-medium' : 'text-gray-700'}`}
            >
              {opt}
            </button>
          ))}
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => { setMode('manual'); setOpen(false); onChange(''); }}
              className="w-full text-left px-4 py-2 text-sm font-medium text-brand-blue hover:bg-brand-cyan/[0.06]"
            >
              Enter custom value...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompanyProfilePage() {
  const router = useRouter();
  const { tenant } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [companyData, setCompanyData] = useState(initialFormState);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const hasFetched = useRef(false);

  useEffect(() => {
    const checkPermission = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        const hasPermission = currentUser.role === 'tenant_admin' || currentUser.permissions?.can_manage_settings;
        if (!hasPermission) {
          toast.error('You do not have permission to access Company Profile');
          router.push('/dashboard');
        }
      } catch {
        router.push('/dashboard');
      }
    };
    checkPermission();
  }, [router]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchOrganizationProfile();
  }, []);

  // Listen for admin-triggered updates via WebSocket — refresh only if not currently editing
  useEffect(() => {
    const handler = () => {
      if (!isEditing) {
        fetchOrganizationProfile();
        toast.info('Company profile was updated by your admin.', { duration: 4000 });
      }
    };
    window.addEventListener('company-profile-updated', handler);
    return () => window.removeEventListener('company-profile-updated', handler);
  }, [isEditing]);

  const fetchOrganizationProfile = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) { setError('Session expired. Please log in again.'); return; }

      const response = await fetch(`${API_URL}/settings/organization-profile`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

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
    } catch {
      setError('Failed to load organization profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const errors = validate(companyData);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) throw new Error('Session expired. Please log in again.');

      const response = await fetch(`${API_URL}/settings/organization-profile`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyData.name,
          website: companyData.website || null,
          contact_email: companyData.email || null,
          contact_phone: companyData.phone || null,
          industry: (companyData.industry && companyData.industry !== '__other__') ? companyData.industry : null,
          company_size: companyData.size || null,
          founded_year: companyData.founded || null,
          description: companyData.description || null,
          street_address: companyData.address || null,
          city: companyData.city || null,
          state: companyData.state || null,
          country: companyData.country || null,
          zip_code: companyData.zipCode || null,
        }),
      });

      if (response.ok) {
        setSuccessMessage('Organization profile saved successfully');
        setIsEditing(false);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const data = await response.json();
        if (response.status === 401) { handleUnauthorized(); return; }
        throw new Error(data.detail || 'Failed to save');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save organization profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setValidationErrors({});
    fetchOrganizationProfile();
  };

  const field = (label: string, key: keyof typeof companyData, opts?: {
    type?: string; placeholder?: string;
  }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input
        type={opts?.type || 'text'}
        value={companyData[key]}
        placeholder={isEditing ? opts?.placeholder : undefined}
        onChange={(e) => {
          setCompanyData({ ...companyData, [key]: e.target.value });
          if (validationErrors[key as keyof ValidationErrors]) {
            setValidationErrors({ ...validationErrors, [key]: undefined });
          }
        }}
        disabled={!isEditing}
        className={`w-full rounded-xl border px-4 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue disabled:bg-gray-50 disabled:text-gray-600
          ${validationErrors[key as keyof ValidationErrors] ? 'border-red-300 bg-red-50/60 focus:ring-red-200 focus:border-red-400' : 'border-gray-200'}`}
      />
      {validationErrors[key as keyof ValidationErrors] && (
        <p className="mt-1 text-xs font-medium text-red-600">{validationErrors[key as keyof ValidationErrors]}</p>
      )}
    </div>
  );

  if (isLoading) {
    return <PageSkeleton variant="form" showStats={false} />;
  }

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-4 md:p-8">
      <div className="mx-auto w-full max-w-[1400px]">

        {/* SaaS Hero Header */}
        <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-brand-orange" />
                Organization details
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Company Profile</h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">Maintain your organization&apos;s identity, contact info, and address — visible across your dashboard.</p>
                </div>
              </div>
            </div>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-brand-blue shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Edit2 className="h-4 w-4" />
                Edit Profile
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15 disabled:translate-y-0 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-brand-blue shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </section>

        {successMessage && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-brand-teal/20 bg-brand-teal/[0.06] p-4 ring-1 ring-brand-teal/10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal/15 text-brand-teal">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-brand-teal">{successMessage}</p>
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 ring-1 ring-red-100">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Basic Information */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
              <Building2 className="h-5 w-5 text-brand-blue" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Basic Information</h2>
              <p className="text-xs text-gray-500">Identity, contact, and industry details.</p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {field('Company Name *', 'name', { placeholder: 'Acme Corp' })}
            {field('Website', 'website', { placeholder: 'https://example.com' })}
            {field('Contact Email', 'email', { type: 'email', placeholder: 'admin@company.com' })}
            {field('Phone', 'phone', { placeholder: '+91 9876543210' })}

            {/* Industry — dropdown + free text when "Other" */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
              {isEditing ? (() => {
                // A value is "custom" if it's non-empty and not one of the preset options
                const PRESET = INDUSTRY_OPTIONS.filter(o => o !== 'Other');
                const isCustom = companyData.industry !== '' && !PRESET.includes(companyData.industry);
                const selectValue = isCustom ? 'Other' : companyData.industry;
                return (
                  <div className="space-y-2">
                    <select
                      value={selectValue}
                      onChange={(e) => {
                        if (e.target.value === 'Other') {
                          setCompanyData({ ...companyData, industry: '__other__' });
                        } else {
                          setCompanyData({ ...companyData, industry: e.target.value });
                        }
                      }}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                    >
                      <option value="">Select industry</option>
                      {INDUSTRY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {(isCustom || companyData.industry === '__other__') && (
                      <input
                        type="text"
                        value={companyData.industry === '__other__' ? '' : companyData.industry}
                        onChange={(e) => setCompanyData({ ...companyData, industry: e.target.value || '__other__' })}
                        placeholder="Specify your industry"
                        autoFocus
                        className={`w-full rounded-xl border px-4 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue ${validationErrors.industry ? 'border-red-300 bg-red-50/60 focus:ring-red-200 focus:border-red-400' : 'border-gray-200'}`}
                      />
                    )}
                    {validationErrors.industry && (
                      <p className="text-xs font-medium text-red-600">{validationErrors.industry}</p>
                    )}
                  </div>
                );
              })() : (
                <input
                  type="text"
                  value={companyData.industry}
                  disabled
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600"
                />
              )}
            </div>

            {/* Company Size — dropdown + manual */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Size</label>
              <CompanySizeField
                value={companyData.size}
                onChange={(val) => setCompanyData({ ...companyData, size: val })}
                disabled={!isEditing}
              />
            </div>

            {field('Founded Year', 'founded', { placeholder: '2010' })}
          </div>
          </div>
        </div>

        {/* Address */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
              <MapPin className="h-5 w-5 text-brand-teal" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Address</h2>
              <p className="text-xs text-gray-500">Where your organization is headquartered.</p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="space-y-4 sm:space-y-6">
              {field('Street Address', 'address', { placeholder: '123 Main Street' })}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {field('City', 'city', { placeholder: 'Chennai' })}
                {field('State', 'state', { placeholder: 'Tamil Nadu' })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {field('Country', 'country', { placeholder: 'India' })}
                {field('ZIP / Postal Code', 'zipCode', { placeholder: '600001' })}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
          <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-blue-2/15 to-brand-blue/10 ring-1 ring-brand-blue-2/15 shadow-sm shadow-brand-blue/10">
              <FileText className="h-5 w-5 text-brand-blue-2" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Company Description</h2>
              <p className="text-xs text-gray-500">A short summary of what your company does.</p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <textarea
              value={companyData.description}
              onChange={(e) => {
                setCompanyData({ ...companyData, description: e.target.value });
                if (validationErrors.description) setValidationErrors({ ...validationErrors, description: undefined });
              }}
              disabled={!isEditing}
              rows={4}
              placeholder={isEditing ? 'Describe your company...' : ''}
              maxLength={2000}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue disabled:bg-gray-50 disabled:text-gray-600
                ${validationErrors.description ? 'border-red-300 bg-red-50/60 focus:ring-red-200 focus:border-red-400' : 'border-gray-200'}`}
            />
            <div className="flex justify-between mt-1.5">
              {validationErrors.description
                ? <p className="text-xs font-medium text-red-600">{validationErrors.description}</p>
                : <span />}
              {isEditing && (
                <p className="text-xs text-gray-400 text-right">{companyData.description.length}/2000</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
