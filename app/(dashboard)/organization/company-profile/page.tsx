'use client';

import { Building2, Save, Edit2, Loader2, X, AlertCircle, CheckCircle2, MapPin, FileText, Globe, Mail, Phone, Briefcase, Users, CalendarDays, ExternalLink, Copy, Check, Navigation, Map as MapIcon, LocateFixed, ChevronRight, type LucideIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';
import authService from '@/lib/services/authService';
import { handleUnauthorized } from '@/lib/services/api';
import { PageSkeleton } from '@/components/ui/skeleton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip } from '@/components/ui/tooltip';
import FilterSelect from '@/components/ui/filter-select';
import PhoneInput, { isValidPhoneNumber, parsePhoneNumber } from 'react-phone-number-input';
import phoneFlags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const POLL_INTERVAL_MS = 30_000; // 30 seconds
// Saved numbers without a country code (older profiles) are read as Indian.
const DEFAULT_PHONE_COUNTRY = 'IN' as const;

type AddressFields = { address: string; city: string; state: string; country: string; zipCode: string };

/** Browser location → address fields, via OpenStreetMap's free reverse geocoder. */
async function lookupCurrentAddress(): Promise<AddressFields> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Your browser does not support location access.');
  }
  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    }),
  ).catch((err: GeolocationPositionError) => {
    throw new Error(
      err.code === err.PERMISSION_DENIED
        ? 'Location permission was denied. Allow location access for this site and try again.'
        : err.code === err.TIMEOUT
          ? 'Getting your location took too long. Please try again.'
          : 'Could not get your current location.',
    );
  });

  const { latitude, longitude } = pos.coords;
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&lat=${latitude}&lon=${longitude}`,
  ).catch(() => null);
  if (!res?.ok) throw new Error('Could not look up an address for your location.');
  const data = (await res.json()) as { address?: Record<string, string> };
  const a = data.address ?? {};

  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const area = a.suburb || a.neighbourhood || a.quarter || '';
  return {
    address: [street, area].filter(Boolean).join(', '),
    city: a.city || a.town || a.village || a.municipality || a.county || '',
    state: a.state || '',
    country: a.country || '',
    zipCode: a.postcode || '',
  };
}

/** Stored phone → E.164 ("+918899887766"), or '' if it can't be parsed. */
function toE164(phone: string): string {
  if (!phone.trim()) return '';
  try {
    return parsePhoneNumber(phone, DEFAULT_PHONE_COUNTRY)?.number ?? '';
  } catch {
    return '';
  }
}

/** Stored phone → "+91 88998 87766" for display; falls back to the raw text. */
function formatPhoneForDisplay(phone: string): string {
  if (!phone.trim()) return '';
  try {
    return parsePhoneNumber(phone, DEFAULT_PHONE_COUNTRY)?.formatInternational() ?? phone;
  } catch {
    return phone;
  }
}

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

  if (data.phone && !(data.phone.startsWith('+')
    ? isValidPhoneNumber(data.phone)
    : /^[+\d][\d\s\-().]{6,19}$/.test(data.phone.trim()))) {
    errors.phone = 'Enter a valid phone number for the selected country.';
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
const CUSTOM_SIZE = '__custom__';

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

  if (disabled) {
    return (
      <Input
        type="text"
        value={value}
        disabled
      />
    );
  }

  if (mode === 'manual') {
    return (
      <div className="flex gap-2">
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 250 or 1000-2000"
          className="flex-1"
        />
        <Tooltip content="Switch to dropdown">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => { setMode('select'); onChange(''); }}
            className="px-2"
            aria-label="Switch to dropdown"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <FilterSelect
      ariaLabel="Company size"
      placeholder="Select company size"
      value={value}
      onChange={(v) => {
        if (v === CUSTOM_SIZE) { setMode('manual'); onChange(''); }
        else onChange(v);
      }}
      options={[
        ...COMPANY_SIZE_OPTIONS.map((opt) => ({ value: opt, label: opt })),
        { value: CUSTOM_SIZE, label: 'Enter custom value...' },
      ]}
      className="w-full sm:w-full data-[size=default]:h-auto sm:data-[size=default]:h-auto py-2.5 sm:py-2.5 px-3 sm:px-3 rounded-lg sm:rounded-lg focus-visible:ring-4 focus-visible:ring-brand-blue/10 focus-visible:border-brand-blue/30"
    />
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
        // Mirrors AuthProvider's canManageSettings mapping (which the route
        // guard/menu use): can_view_settings / can_update_settings also
        // unlock this page, not just the full can_manage_settings flag.
        const hasPermission =
          currentUser.role === 'tenant_admin' ||
          !!currentUser.permissions?.can_manage_settings ||
          !!(currentUser.permissions as any)?.can_view_settings ||
          !!(currentUser.permissions as any)?.can_update_settings;
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

  // Card "Edit"/"Update" links open edit mode scrolled to their section.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const openEditAt = (id: string) => {
    setScrollTarget(id);
    setIsEditing(true);
  };
  useEffect(() => {
    if (!isEditing || !scrollTarget) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [isEditing, scrollTarget]);

  const [isLocating, setIsLocating] = useState(false);
  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const found = await lookupCurrentAddress();
      // Only overwrite fields the lookup actually returned.
      setCompanyData((prev) => ({
        ...prev,
        ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)),
      }));
      setValidationErrors((prev) => ({ ...prev, zipCode: undefined }));
      toast.success('Address filled from your current location — please review it.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not get your current location.');
    } finally {
      setIsLocating(false);
    }
  };

  const setValue = (key: keyof typeof companyData, value: string) => {
    setCompanyData({ ...companyData, [key]: value });
    if (validationErrors[key as keyof ValidationErrors]) {
      setValidationErrors({ ...validationErrors, [key]: undefined });
    }
  };

  const field = (label: string, key: keyof typeof companyData, opts?: {
    type?: string; placeholder?: string; required?: boolean; className?: string;
  }) => (
    <div className={opts?.className}>
      <Label className="mb-1.5">
        {label}
        {opts?.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      <Input
        type={opts?.type || 'text'}
        value={companyData[key]}
        placeholder={opts?.placeholder}
        onChange={(e) => setValue(key, e.target.value)}
        aria-invalid={!!validationErrors[key as keyof ValidationErrors]}
      />
      {validationErrors[key as keyof ValidationErrors] && (
        <p className="mt-1 text-xs font-medium text-destructive">{validationErrors[key as keyof ValidationErrors]}</p>
      )}
    </div>
  );

  if (isLoading) {
    return <PageSkeleton variant="form" showStats={false} />;
  }

  // ── Derived display values ──
  const industryLabel = companyData.industry === '__other__' ? '' : companyData.industry;
  const initials =
    companyData.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'C';
  const websiteHref = companyData.website
    ? /^https?:\/\//i.test(companyData.website) ? companyData.website : `https://${companyData.website}`
    : '';
  const websiteLabel = companyData.website.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const cityLine = [companyData.city, companyData.state].filter(Boolean).join(', ');
  const addressLines = [
    companyData.address,
    [cityLine, companyData.zipCode].filter(Boolean).join(' '),
    companyData.country,
  ].filter(Boolean);

  // Profile completeness — every editable detail counts once.
  const completenessKeys: (keyof typeof companyData)[] = [
    'name', 'website', 'email', 'phone', 'industry', 'size', 'founded',
    'description', 'address', 'city', 'state', 'country', 'zipCode',
  ];
  const filledCount = completenessKeys.filter((k) => {
    const v = companyData[k];
    return k === 'industry' ? !!industryLabel : !!v.trim();
  }).length;
  const completeness = Math.round((filledCount / completenessKeys.length) * 100);
  const foundedYear = /^\d{4}$/.test(companyData.founded) ? parseInt(companyData.founded, 10) : null;
  const yearsActive = foundedYear !== null ? new Date().getFullYear() - foundedYear : null;

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-3 sm:p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Company Profile' }]} />

        {/* Title row */}
        <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl dark:text-slate-50">Company Profile</h1>
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm dark:text-slate-400">
              {isEditing
                ? 'Update your organization’s details, then save.'
                : 'Your organization’s identity, contact info and address.'}
            </p>
          </div>
          {!isEditing && (
            <Button
              variant="primary"
              onClick={() => setIsEditing(true)}
              icon={<Edit2 className="h-4 w-4" />}
              className="shrink-0"
            >
              <span className="hidden sm:inline">Edit Profile</span>
              <span className="sm:hidden">Edit</span>
            </Button>
          )}
        </div>

        {successMessage && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-brand-teal/20 bg-brand-teal/[0.06] px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-teal" />
            <p className="text-sm font-medium text-brand-teal">{successMessage}</p>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-destructive-line bg-destructive-subtle/80 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* ── Hero: identity + completeness (live preview while editing) ── */}
        {/* Phones: flat (no card frame) — the details below are a list, not boxes. */}
        <section className="relative mb-5 overflow-hidden sm:mb-6 sm:rounded-2xl sm:border sm:border-gray-200 sm:bg-white sm:p-6 sm:shadow-sm sm:dark:border-slate-700/60 sm:dark:bg-slate-900">
          {/* Subtle dot grid for depth */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden opacity-40 sm:block dark:opacity-20"
            style={{
              backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.18) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          />
          <div className="relative flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue to-slate-900 text-xl font-extrabold tracking-wider text-white shadow-md sm:h-20 sm:w-20 sm:text-3xl sm:ring-4 sm:ring-slate-50 sm:dark:ring-slate-800">
                {initials}
              </div>
              <div className="min-w-0 space-y-1 sm:space-y-2">
                <h2 className="truncate text-base font-bold tracking-tight text-gray-900 sm:text-xl dark:text-slate-50">
                  {companyData.name || 'Your company'}
                </h2>
                {websiteHref ? (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{websiteLabel}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-slate-500">No website added</p>
                )}
                {/* Tags hidden on phones — the details list repeats them. */}
                {(industryLabel || companyData.size || companyData.founded) && (
                  <div className="hidden flex-wrap items-center gap-2 pt-1 sm:flex">
                    {industryLabel && <HeroTag icon={Briefcase}>{industryLabel}</HeroTag>}
                    {companyData.size && <HeroTag icon={Users}>{companyData.size} employees</HeroTag>}
                    {companyData.founded && <HeroTag icon={CalendarDays}>Founded {companyData.founded}</HeroTag>}
                  </div>
                )}
              </div>
            </div>

            {/* Completeness */}
            <div className="w-full border-t border-gray-100 pt-3 dark:border-slate-800 sm:rounded-xl sm:border sm:border-gray-200/80 sm:bg-slate-50/80 sm:p-4 lg:w-80 sm:dark:border-slate-700 sm:dark:bg-slate-800/60">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600 dark:text-slate-300">Profile completeness</span>
                <span className="rounded border border-brand-blue/20 bg-brand-blue/[0.06] px-2 py-0.5 text-xs font-bold tabular-nums text-brand-blue dark:bg-brand-blue/20 dark:text-blue-200">
                  {completeness}%
                </span>
              </div>
              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-brand-blue transition-[width] duration-500"
                  style={{ width: `${completeness}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                {completeness === 100 ? (
                  <span className="flex items-center gap-1 font-semibold text-brand-teal">
                    <Check className="h-3.5 w-3.5" />
                    All details completed
                  </span>
                ) : !isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="font-semibold text-brand-blue hover:underline"
                  >
                    Complete profile
                  </button>
                ) : (
                  <span>Keep going…</span>
                )}
                <span className="tabular-nums">{filledCount} of {completenessKeys.length} details</span>
              </div>
            </div>
          </div>
        </section>

        {isEditing ? (
          /* ── Edit mode: the form ── */
          <div className="space-y-4 sm:space-y-5">
            <Section id="cp-edit-basic" icon={Building2} title="Basic information" subtitle="Identity, contact and industry details.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                {field('Company Name', 'name', { placeholder: 'Acme Corp', required: true })}
                {field('Website', 'website', { placeholder: 'https://example.com' })}
                {field('Contact Email', 'email', { type: 'email', placeholder: 'admin@company.com' })}
                <div>
                  <Label className="mb-1.5">Phone</Label>
                  <PhoneField
                    value={companyData.phone}
                    onChange={(v) => setValue('phone', v)}
                    invalid={!!validationErrors.phone}
                  />
                  {validationErrors.phone && (
                    <p className="mt-1 text-xs font-medium text-destructive">{validationErrors.phone}</p>
                  )}
                </div>

                {/* Industry — dropdown + free text when "Other" */}
                <div>
                  <Label className="mb-1.5">Industry</Label>
                  {(() => {
                    const PRESET = INDUSTRY_OPTIONS.filter(o => o !== 'Other');
                    const isCustom = companyData.industry !== '' && !PRESET.includes(companyData.industry);
                    const selectValue = isCustom ? 'Other' : companyData.industry;
                    return (
                      <div className="space-y-2">
                        <FilterSelect
                          ariaLabel="Industry"
                          placeholder="Select industry"
                          value={selectValue}
                          onChange={(v) => setCompanyData({ ...companyData, industry: v === 'Other' ? '__other__' : v })}
                          options={INDUSTRY_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                          className="w-full sm:w-full data-[size=default]:h-auto sm:data-[size=default]:h-auto py-2.5 sm:py-2.5 px-3 sm:px-3 rounded-lg sm:rounded-lg focus-visible:ring-4 focus-visible:ring-brand-blue/10 focus-visible:border-brand-blue/30"
                        />
                        {(isCustom || companyData.industry === '__other__') && (
                          <Input
                            type="text"
                            value={companyData.industry === '__other__' ? '' : companyData.industry}
                            onChange={(e) => setCompanyData({ ...companyData, industry: e.target.value || '__other__' })}
                            placeholder="Specify your industry"
                            autoFocus
                            aria-invalid={!!validationErrors.industry}
                          />
                        )}
                        {validationErrors.industry && (
                          <p className="text-xs font-medium text-destructive">{validationErrors.industry}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <Label className="mb-1.5">Company Size</Label>
                  <CompanySizeField
                    value={companyData.size}
                    onChange={(val) => setCompanyData({ ...companyData, size: val })}
                    disabled={false}
                  />
                </div>

                {field('Founded Year', 'founded', { placeholder: '2010' })}
              </div>
            </Section>

            <Section id="cp-edit-address" icon={MapPin} title="Address" subtitle="Where your organization is headquartered.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="sm:col-span-2">
                  <Label className="mb-1.5">Street Address</Label>
                  {/* "Use current location" sits inside the field, right corner */}
                  <div className="relative">
                    <Input
                      type="text"
                      value={companyData.address}
                      placeholder="123 Main Street"
                      onChange={(e) => setValue('address', e.target.value)}
                      className="pr-11 sm:pr-44"
                    />
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={isLocating}
                      title="Use current location"
                      aria-label="Use current location"
                      className="absolute right-1 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/[0.06] disabled:cursor-wait disabled:opacity-70"
                    >
                      {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{isLocating ? 'Locating…' : 'Use current location'}</span>
                    </button>
                  </div>
                </div>
                {field('City', 'city', { placeholder: 'Chennai' })}
                {field('State', 'state', { placeholder: 'Tamil Nadu' })}
                {field('Country', 'country', { placeholder: 'India' })}
                {field('ZIP / Postal Code', 'zipCode', { placeholder: '600001' })}
              </div>
            </Section>

            <Section id="cp-edit-about" icon={FileText} title="About the company" subtitle="A short summary of what your company does.">
              <Textarea
                value={companyData.description}
                onChange={(e) => setValue('description', e.target.value)}
                rows={5}
                placeholder="Describe your company..."
                maxLength={2000}
                aria-invalid={!!validationErrors.description}
              />
              <div className="mt-1.5 flex justify-between">
                {validationErrors.description
                  ? <p className="text-xs font-medium text-destructive">{validationErrors.description}</p>
                  : <span />}
                <p className="text-right text-xs tabular-nums text-gray-400 dark:text-slate-500">{companyData.description.length}/2000</p>
              </div>
            </Section>

            {/* Form actions — part of the page, not a card */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="hidden text-xs text-gray-500 sm:block dark:text-slate-400">
                Fields marked <span className="text-destructive">*</span> are required.
              </p>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Button variant="secondary" onClick={handleCancel} disabled={isSaving} className="flex-1 sm:flex-none">
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={isSaving}
                  icon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  className="flex-1 sm:flex-none"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ── View mode: read-only details ── */
          <>
          {/* Phones: grouped list (label above, rows with dividers) instead of cards */}
          <div className="space-y-5 sm:hidden">
            <MobileGroup title="Contact" onEdit={() => openEditAt('cp-edit-basic')}>
              <MobileRow
                icon={Mail}
                label="Email"
                href={companyData.email ? `mailto:${companyData.email}` : undefined}
                trailing={companyData.email ? <CopyButton text={companyData.email} label="email" /> : undefined}
              >
                {companyData.email}
              </MobileRow>
              <MobileRow
                icon={Phone}
                label="Phone"
                href={companyData.phone ? `tel:${toE164(companyData.phone) || companyData.phone.replace(/\s/g, '')}` : undefined}
              >
                {companyData.phone ? formatPhoneForDisplay(companyData.phone) : ''}
              </MobileRow>
              <MobileRow icon={Globe} label="Website" href={websiteHref || undefined} external>
                {websiteLabel}
              </MobileRow>
            </MobileGroup>

            <MobileGroup title="Company details" onEdit={() => openEditAt('cp-edit-basic')}>
              <MobileRow icon={Briefcase} label="Industry">{industryLabel}</MobileRow>
              <MobileRow icon={Users} label="Company size">{companyData.size ? `${companyData.size} employees` : ''}</MobileRow>
              <MobileRow icon={CalendarDays} label="Founded">
                {companyData.founded
                  ? `${companyData.founded}${yearsActive !== null && yearsActive > 0 ? ` · ${yearsActive} ${yearsActive === 1 ? 'year' : 'years'}` : ''}`
                  : ''}
              </MobileRow>
            </MobileGroup>

            <MobileGroup title="Headquarters" onEdit={() => openEditAt('cp-edit-address')}>
              <MobileRow
                icon={MapPin}
                label="Address"
                wrap
                trailing={addressLines.length > 0 ? <CopyButton text={addressLines.join(', ')} label="address" /> : undefined}
              >
                {addressLines.join('\n')}
              </MobileRow>
              {addressLines.length > 0 && (
                <MobileRow
                  icon={MapIcon}
                  label="Directions"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLines.join(', '))}`}
                  external
                >
                  View on Google Maps
                </MobileRow>
              )}
            </MobileGroup>

            <MobileGroup title="About" onEdit={() => openEditAt('cp-edit-about')} editLabel="Update">
              {companyData.description ? (
                <p className="whitespace-pre-line break-words px-3 py-3 text-xs leading-relaxed text-gray-600 dark:text-slate-300">
                  {companyData.description}
                </p>
              ) : (
                <MobileRow icon={FileText} label="Description">{''}</MobileRow>
              )}
            </MobileGroup>
          </div>

          <div className="hidden grid-cols-1 gap-4 sm:grid sm:gap-6 lg:grid-cols-2">
            <Section
              icon={Mail}
              title="Contact information"
              subtitle="How candidates and clients reach your team."
              action={<SectionEditButton onClick={() => openEditAt('cp-edit-basic')} />}
            >
              <dl className="space-y-3">
                <InfoRow icon={Mail} label="Email">
                  {companyData.email ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <a href={`mailto:${companyData.email}`} className="truncate transition-colors hover:text-brand-blue">
                        {companyData.email}
                      </a>
                      <CopyButton text={companyData.email} label="email" />
                    </span>
                  ) : null}
                </InfoRow>
                <InfoRow icon={Phone} label="Phone">
                  {companyData.phone ? (
                    <a
                      href={`tel:${toE164(companyData.phone) || companyData.phone.replace(/\s/g, '')}`}
                      className="tracking-wide transition-colors hover:text-brand-blue"
                    >
                      {formatPhoneForDisplay(companyData.phone)}
                    </a>
                  ) : null}
                </InfoRow>
                <InfoRow icon={Globe} label="Website" last>
                  {websiteHref ? (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-w-0 items-center gap-1 font-semibold text-brand-blue hover:underline"
                    >
                      <span className="truncate">{websiteLabel}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : null}
                </InfoRow>
              </dl>
            </Section>

            <Section
              icon={Building2}
              title="Company details"
              subtitle="Industry, size and founding year."
              action={<SectionEditButton onClick={() => openEditAt('cp-edit-basic')} />}
            >
              <dl className="space-y-3">
                <InfoRow icon={Briefcase} label="Industry">
                  {industryLabel ? (
                    <span className="truncate rounded-md border border-gray-200/70 bg-slate-50 px-2.5 py-1 font-semibold dark:border-slate-700 dark:bg-slate-800">
                      {industryLabel}
                    </span>
                  ) : null}
                </InfoRow>
                <InfoRow icon={Users} label="Company size">
                  {companyData.size ? <span className="font-semibold">{companyData.size} employees</span> : null}
                </InfoRow>
                <InfoRow icon={CalendarDays} label="Founded" last>
                  {companyData.founded ? (
                    <span className="font-semibold">
                      {companyData.founded}
                      {yearsActive !== null && yearsActive > 0 && (
                        <span className="ml-1 font-normal text-gray-400 dark:text-slate-500">
                          ({yearsActive} {yearsActive === 1 ? 'year' : 'years'})
                        </span>
                      )}
                    </span>
                  ) : null}
                </InfoRow>
              </dl>
            </Section>

            <Section
              icon={MapPin}
              title="Headquarters address"
              subtitle="Where your organization is based."
              action={<SectionEditButton onClick={() => openEditAt('cp-edit-address')} />}
              footer={
                addressLines.length > 0 ? (
                  <>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLines.join(', '))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
                    >
                      <MapIcon className="h-3.5 w-3.5" />
                      View on Google Maps
                    </a>
                    <CopyButton text={addressLines.join(', ')} label="address" showText />
                  </>
                ) : undefined
              }
            >
              {addressLines.length > 0 ? (
                <div className="flex items-start gap-3 rounded-xl border border-gray-200/70 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <span className="mt-0.5 shrink-0 rounded-lg border border-gray-200 bg-white p-2 text-brand-blue shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <Navigation className="h-4 w-4" />
                  </span>
                  <address className="min-w-0 space-y-1 break-words text-xs not-italic text-gray-600 dark:text-slate-300">
                    {companyData.address && (
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">{companyData.address}</p>
                    )}
                    {(cityLine || companyData.zipCode) && (
                      <p>{[cityLine, companyData.zipCode].filter(Boolean).join(' ')}</p>
                    )}
                    {companyData.country && (
                      <p className="flex items-center gap-1.5 pt-0.5 font-medium text-gray-800 dark:text-slate-200">
                        <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
                        {companyData.country}
                      </p>
                    )}
                  </address>
                </div>
              ) : (
                <EmptyHint text="No address added yet." onAdd={() => openEditAt('cp-edit-address')} />
              )}
            </Section>

            <Section
              icon={FileText}
              title="About the company"
              subtitle="A short summary of what your company does."
              action={<SectionEditButton onClick={() => openEditAt('cp-edit-about')} label="Update" />}
            >
              {companyData.description ? (
                <div className="rounded-xl border border-gray-200/70 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="whitespace-pre-line break-words text-xs leading-relaxed text-gray-600 sm:text-[13px] dark:text-slate-300">
                    {companyData.description}
                  </p>
                </div>
              ) : (
                <EmptyHint text="No description added yet." onAdd={() => openEditAt('cp-edit-about')} />
              )}
            </Section>
          </div>
          </>
        )}

      </div>
      </div>
    </main>
  );
}

// ── Presentational helpers ──

/** Country picker (flag + dial code) + number, capped at the country's max length. */
function PhoneField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <PhoneInput
      international
      countryCallingCodeEditable={false}
      limitMaxLength
      defaultCountry={DEFAULT_PHONE_COUNTRY}
      flags={phoneFlags}
      value={toE164(value)}
      onChange={(v) => onChange(v ?? '')}
      inputComponent={PhoneTextInput}
      placeholder="Enter phone number"
      aria-invalid={invalid}
      className={`tf-phone-input flex h-9 w-full items-center rounded-md border bg-input-background pl-3 transition-[color,box-shadow,border-color] hover:border-[var(--border-dark)] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30 ${
        invalid ? 'border-destructive ring-destructive/20' : 'border-input'
      }`}
    />
  );
}

function PhoneTextInput(props: React.ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-gray-900 outline-none placeholder:text-muted-foreground focus-visible:!outline-none dark:text-slate-50"
    />
  );
}

function Section({
  id,
  icon: Icon,
  title,
  subtitle,
  action,
  footer,
  children,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Phones: no card frame — sections are separated by a rule, like a list.
    <section id={id} className="flex scroll-mt-4 flex-col border-b border-gray-100 pb-5 dark:border-slate-800 sm:rounded-2xl sm:border sm:border-gray-200 sm:bg-white sm:p-6 sm:shadow-sm sm:transition-colors sm:hover:border-gray-300 sm:dark:border-slate-700/60 sm:dark:bg-slate-900 sm:dark:hover:border-slate-600">
      <div className="flex items-start justify-between gap-3 sm:border-b sm:border-gray-100 sm:pb-4 sm:dark:border-slate-700/60">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-blue/10 bg-brand-blue/[0.06] text-brand-blue sm:h-10 sm:w-10 sm:rounded-xl dark:bg-brand-blue/20 dark:text-blue-200">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4 flex-1 sm:mt-5">{children}</div>
      {footer && (
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-slate-700/60">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Phone view: small uppercase group label + Edit link above one bordered list. */
function MobileGroup({
  title,
  onEdit,
  editLabel = 'Edit',
  children,
}: {
  title: string;
  onEdit: () => void;
  editLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">{title}</h3>
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-brand-blue">
          {editLabel}
        </button>
      </div>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white dark:divide-slate-800 dark:border-slate-700/60 dark:bg-slate-900">
        {children}
      </div>
    </section>
  );
}

/** Phone view row: icon, label over value, optional trailing action. A row
    with `href` is tappable as a whole (chevron / external icon on the right). */
function MobileRow({
  icon: Icon,
  label,
  href,
  external,
  wrap,
  trailing,
  children,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  external?: boolean;
  wrap?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const empty = !children;
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-slate-500" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-gray-500 dark:text-slate-400">{label}</p>
        <p
          className={`text-sm ${wrap ? 'whitespace-pre-line break-words' : 'truncate'} ${
            empty
              ? 'text-gray-400 dark:text-slate-500'
              : href
              ? 'font-medium text-brand-blue'
              : 'font-medium text-gray-900 dark:text-slate-50'
          }`}
        >
          {empty ? 'Not added' : children}
        </p>
      </div>
    </>
  );
  const rowClass = 'flex min-h-[52px] items-center gap-3 px-3 py-2.5';
  return (
    <div className="flex items-center">
      {href && !empty ? (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className={`${rowClass} min-w-0 flex-1 active:bg-gray-50 dark:active:bg-slate-800`}
        >
          {body}
          {!trailing && (external
            ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-slate-600" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-slate-600" />)}
        </a>
      ) : (
        <div className={`${rowClass} min-w-0 flex-1`}>{body}</div>
      )}
      {trailing && !empty && <div className="shrink-0 pr-3">{trailing}</div>}
    </div>
  );
}

function SectionEditButton({ onClick, label = 'Edit' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/[0.06]"
    >
      {label}
    </button>
  );
}

function HeroTag({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200/60 bg-slate-100/90 px-2.5 py-1 text-xs font-medium text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-slate-400" />
      {children}
    </span>
  );
}

/** Label on the left, value on the right (stacked on phones). Empty → "Not added". */
function InfoRow({
  icon: Icon,
  label,
  last,
  children,
}: {
  icon: LucideIcon;
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
        last ? '' : 'border-b border-gray-50 pb-3 dark:border-slate-800'
      }`}
    >
      <dt className="flex shrink-0 items-center gap-2 font-medium text-gray-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
        {label}
      </dt>
      <dd className="flex min-w-0 items-center font-medium text-gray-800 sm:justify-end dark:text-slate-100">
        {children ?? <span className="font-normal text-gray-400 dark:text-slate-500">Not added</span>}
      </dd>
    </div>
  );
}

function CopyButton({ text, label, showText }: { text: string; label: string; showText?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`Copied ${label}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(`Couldn't copy ${label}`);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-slate-300"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-brand-teal" /> : <Copy className="h-3.5 w-3.5" />}
      {showText && <span>{copied ? 'Copied' : `Copy ${label}`}</span>}
    </button>
  );
}

function EmptyHint({ text, onAdd }: { text: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-4 dark:border-slate-700">
      <span className="text-xs text-gray-400 dark:text-slate-500">{text}</span>
      <button type="button" onClick={onAdd} className="shrink-0 text-xs font-semibold text-brand-blue hover:underline">
        Add
      </button>
    </div>
  );
}
