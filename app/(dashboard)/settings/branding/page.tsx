'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Palette, Upload, Save, Eye, Check, Loader2, X, ShieldCheck, ShieldAlert, RefreshCw, Sparkles, Image as ImageIcon, Globe, Layers } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { brandingApi, BrandingSettings, BrandingUpdate } from '@/lib/services/settingsService';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function BrandingPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('canManageBranding');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isVerifyingDomain, setIsVerifyingDomain] = useState(false);
  const [domainVerified, setDomainVerified] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [cloudflareProxied, setCloudflareProxied] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [cnameTarget, setCnameTarget] = useState<string>('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [branding, setBranding] = useState<BrandingSettings>({
    primary_color: '#2563eb',
    secondary_color: '#7c3aed',
    logo_url: '',
    company_name: 'TalentFlow',
    favicon_url: '',
    email_footer: 'Powered by TalentFlow',
    custom_domain: '',
  });

  const rootRef = useScrollRestoration<HTMLElement>('settings-branding', !isLoading);

  useEffect(() => {
    const loadBranding = async () => {
      setIsLoading(true);
      try {
        const [data, domainConfig] = await Promise.all([
          brandingApi.get(),
          brandingApi.getDomainConfig(),
        ]);
        setBranding(data);
        setDomainVerified((data as any).domain_verified || false);
        setCnameTarget(domainConfig.cname_target);
      } catch (error) {
        console.error('Error loading branding:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadBranding();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updateData: BrandingUpdate = {
        primary_color: branding.primary_color,
        secondary_color: branding.secondary_color,
        custom_domain: branding.custom_domain,
        email_footer: branding.email_footer,
        logo_url: branding.logo_url,
        favicon_url: branding.favicon_url,
      };
      await brandingApi.update(updateData);
      setSaved(true);
      toast.success('Branding saved successfully');
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Error saving branding:', error);
      toast.error('Failed to save branding');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerifyDomain = async () => {
    const domain = branding.custom_domain?.trim();
    if (!domain) {
      toast.error('Please enter a domain first');
      return;
    }
    setIsVerifyingDomain(true);
    setDomainError(null);
    try {
      const result = await brandingApi.verifyDomain(domain);
      if (result.verified) {
        setDomainVerified(true);
        setCloudflareProxied(false);
        toast.success(`Domain verified! CNAME correctly points to ${cnameTarget}`);
      } else {
        setDomainVerified(false);
        setCloudflareProxied(!!(result as any).cloudflare_proxied);
        setDomainError(result.error || 'Verification failed');
        toast.error((result as any).cloudflare_proxied ? 'Cloudflare proxy detected — switch to DNS only' : result.error || 'Domain verification failed');
      }
    } catch (error) {
      setDomainVerified(false);
      setDomainError('Network error during verification');
      toast.error('Verification request failed');
    } finally {
      setIsVerifyingDomain(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload PNG, SVG, JPG, or WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 2MB.');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const result = await brandingApi.uploadLogo(file);
      setBranding(prev => ({ ...prev, logo_url: result.logo_url }));
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Logo upload failed:', error);
      toast.error('Failed to upload logo. Please try again.');
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const colorPresets = [
    { name: 'Blue', primary: '#2563eb', secondary: '#7c3aed' },
    { name: 'Green', primary: '#059669', secondary: '#0891b2' },
    { name: 'Purple', primary: '#7c3aed', secondary: '#db2777' },
    { name: 'Orange', primary: '#ea580c', secondary: '#ca8a04' },
  ];

  if (isLoading) {
    return (
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Hero */}
            <section className="relative mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 lg:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32 rounded-full" />
                    <Skeleton className="h-6 w-52" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                  </div>
                </div>
                <Skeleton className="h-10 w-32 rounded-xl" />
              </div>
            </section>
            {/* Section cards: header + fields, mirroring Logo / Colors / Domain */}
            {[2, 2, 1].map((fields, s) => (
              <div key={s} className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-56 max-w-full" />
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${fields > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {Array.from({ length: fields }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings', href: '/settings/general-settings' }, { label: 'Branding & White Label' }]} />

        {/* SaaS Hero Header */}
        <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                <Palette className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-2xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                  <Sparkles className="h-3 w-3 text-brand-orange" />
                  White-label studio
                </div>
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Branding & White Label</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">Customize your portal&apos;s look — logo, colors, custom domain.</p>
              </div>
            </div>
            <Button
              tone="onColor"
              variant="primary"
              onClick={() => {
                if (!canManage) {
                  toast.error('You do not have permission to manage branding');
                  return;
                }
                handleSave();
              }}
              disabled={isSaving || !canManage}
              title={!canManage ? 'You do not have permission to manage branding' : ''}
              icon={saved ? <Check className="w-4 h-4" /> : isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              className="rounded-xl px-4 py-2.5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0"
            >
              {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </section>

        <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
              <ImageIcon className="h-5 w-5 text-brand-blue" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50">Logo</h2>
              <p className="text-xs text-gray-500 dark:text-slate-500">Visual identity used across the portal.</p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 dark:bg-slate-800 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-slate-700 flex-shrink-0 relative overflow-hidden">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain rounded-xl" />
              ) : isUploadingLogo ? (
                <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-slate-500 animate-spin" />
              ) : (
                <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-slate-500" />
              )}
            </div>
            <div className="text-center sm:text-left">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!canManage) {
                      toast.error('You do not have permission to manage branding');
                      return;
                    }
                    logoInputRef.current?.click();
                  }}
                  disabled={isUploadingLogo}
                  aria-disabled={!canManage}
                  className={`text-xs sm:text-sm ${!canManage ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={!canManage ? 'You do not have permission to manage branding' : ''}
                >
                  {isUploadingLogo ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading...</>
                  ) : (
                    <><Upload className="w-3.5 h-3.5" />Upload Logo</>
                  )}
                </Button>
                {branding.logo_url && (
                  <button
                    onClick={() => {
                      if (!canManage) {
                        toast.error('You do not have permission to manage branding');
                        return;
                      }
                      setBranding(prev => ({ ...prev, logo_url: '' }));
                    }}
                    aria-disabled={!canManage}
                    className={`p-2 rounded-lg transition-colors ${
                      canManage
                        ? 'text-gray-400 dark:text-slate-500 hover:text-destructive hover:bg-destructive-subtle'
                        : 'text-gray-300 dark:text-slate-700 cursor-not-allowed opacity-60'
                    }`}
                    aria-label="Remove logo" title={!canManage ? 'You do not have permission to manage branding' : 'Remove logo'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mt-2">Recommended: 200x200px, PNG, SVG, or JPG (max 2MB)</p>
            </div>
          </div>
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue-2/15 shadow-sm shadow-brand-blue/10">
              <Palette className="h-5 w-5 text-brand-blue-2" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50">Brand Colors</h2>
              <p className="text-xs text-gray-500 dark:text-slate-500">Primary and secondary color used throughout your portal.</p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
          <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-300 mb-2 sm:mb-3">Color Presets</p>
          <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6">
            {colorPresets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setBranding({ ...branding, primary_color: preset.primary, secondary_color: preset.secondary })}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-cyan/[0.04] transition-colors"
              >
                <div className="flex flex-shrink-0">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full" style={{ backgroundColor: preset.primary }} />
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full -ml-1.5 sm:-ml-2" style={{ backgroundColor: preset.secondary }} />
                </div>
                <span className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">{preset.name}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 sm:mb-2">Primary Color</label>
              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  type="color"
                  value={branding.primary_color}
                  onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg cursor-pointer border border-gray-200 dark:border-slate-700 flex-shrink-0"
                />
                <input
                  type="text"
                  value={branding.primary_color}
                  onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-900 dark:text-slate-50 transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 sm:mb-2">Secondary Color</label>
              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  type="color"
                  value={branding.secondary_color}
                  onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg cursor-pointer border border-gray-200 dark:border-slate-700 flex-shrink-0"
                />
                <input
                  type="text"
                  value={branding.secondary_color}
                  onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-900 dark:text-slate-50 transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                />
              </div>
            </div>
          </div>
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
              <Globe className="h-5 w-5 text-brand-teal" />
            </span>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50">Custom Domain</h2>
              <p className="text-xs text-gray-500 dark:text-slate-500">Use your own domain for the candidate portal.</p>
            </div>
            {domainVerified && branding.custom_domain && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-brand-teal bg-brand-teal/10 ring-1 ring-brand-teal/15 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified
              </span>
            )}
            {!domainVerified && branding.custom_domain && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-warning bg-warning-subtle ring-1 ring-warning-line px-2.5 py-1 rounded-full">
                <ShieldAlert className="w-3.5 h-3.5" /> Not verified
              </span>
            )}
          </div>
          <div className="p-5 sm:p-6">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5 sm:mb-2">Domain URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={branding.custom_domain || ''}
                onChange={(e) => {
                  setBranding({ ...branding, custom_domain: e.target.value });
                  setDomainVerified(false);
                  setDomainError(null);
                  setCloudflareProxied(false);
                }}
                placeholder="careers.yourcompany.com"
                className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-900 dark:text-slate-50 transition focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue placeholder-gray-400"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleVerifyDomain}
                disabled={isVerifyingDomain || !branding.custom_domain?.trim() || !canManage}
                className="text-xs sm:text-sm"
              >
                {isVerifyingDomain ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking...</>
                ) : domainVerified ? (
                  <><RefreshCw className="w-3.5 h-3.5" />Re-verify</>
                ) : (
                  <><ShieldCheck className="w-3.5 h-3.5" />Verify DNS</>
                )}
              </Button>
            </div>

            {/* DNS Instructions */}
            <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-brand-blue/[0.04] to-brand-cyan/[0.03] border border-brand-blue/15 ring-1 ring-brand-blue/5">
              <p className="text-xs font-semibold text-brand-blue mb-2">DNS Setup Instructions:</p>
              <div className="space-y-1 text-xs text-gray-600 dark:text-slate-400 font-mono">
                <div className="flex gap-3">
                  <span className="text-gray-400 dark:text-slate-500 w-12">Type</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-50">CNAME</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400 dark:text-slate-500 w-12">Name</span>
                  <span className="font-semibold text-gray-900 dark:text-slate-50">{branding.custom_domain || 'careers'}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400 dark:text-slate-500 w-12">Value</span>
                  <span className="font-semibold text-brand-blue">{cnameTarget || 'loading...'}</span>
                </div>
              </div>
            </div>

            {cloudflareProxied && (
              <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs font-semibold text-orange-800 mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Cloudflare Proxy Detected — Action Required
                </p>
                <ol className="text-xs text-orange-700 space-y-1.5 list-decimal list-inside">
                  <li>Go to <strong>Cloudflare Dashboard</strong> → your domain → <strong>DNS</strong> → <strong>Records</strong></li>
                  <li>Find the CNAME record for <strong>{branding.custom_domain}</strong></li>
                  <li>Click the <strong>orange cloud icon</strong> — it must turn <strong>grey</strong> (DNS only)</li>
                  <li>Save, wait ~1 minute, then click <strong>Verify DNS</strong> again</li>
                </ol>
                <p className="text-xs text-orange-600 mt-2">
                  ⚠️ Orange cloud = Cloudflare hides your CNAME, blocking verification.
                  Grey cloud = DNS passthrough, required for custom domain setup.
                </p>
              </div>
            )}
            {!cloudflareProxied && domainError && (
              <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                {domainError}
              </p>
            )}
            {domainVerified && (
              <p className="mt-2 text-xs text-brand-teal flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                DNS verified. Your custom domain is active.
              </p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
          <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-5 py-4 sm:px-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
              <Layers className="h-5 w-5 text-brand-orange-deep" />
            </span>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50">Preview</h2>
              <p className="text-xs text-gray-500 dark:text-slate-500">See your candidate-facing portal at a glance.</p>
            </div>
            <button
              onClick={() => setShowPreviewModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-brand-blue hover:text-brand-blue-2 font-semibold"
            >
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Open Full Preview</span>
              <span className="sm:hidden">Preview</span>
            </button>
          </div>
          <div className="p-5 sm:p-6">
          <div className="bg-slate-100 rounded-xl p-4 sm:p-6 flex items-center justify-center h-36 sm:h-48">
            <div className="text-center">
              <div
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl mx-auto mb-2 sm:mb-3 flex items-center justify-center"
                style={{ backgroundColor: branding.primary_color }}
              >
                <span className="text-white text-xl sm:text-2xl font-bold">{branding.company_name?.[0] || 'T'}</span>
              </div>
              <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-slate-50">{branding.company_name || 'TalentFlow'}</p>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">Your branded career portal</p>
            </div>
          </div>
          </div>
        </div>
      </div>
      </div>

      {/* Full Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-brand-blue/20 ring-1 ring-black/[0.03] w-full max-w-[95vw] sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">Branded Career Portal Preview</h3>
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">How candidates will see your portal</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPreviewModal(false)}
                className="px-2"
               aria-label="Close">
                <X className="w-4 h-4 text-gray-500 dark:text-slate-500" />
              </Button>
            </div>

            {/* Simulated browser chrome */}
            <div className="bg-gray-100 dark:bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 bg-white dark:bg-slate-900 rounded-md px-3 py-1 text-xs text-gray-500 dark:text-slate-500 border border-gray-200 dark:border-slate-700">
                {branding.custom_domain && domainVerified
                  ? `https://${branding.custom_domain}/careers`
                  : 'https://careers.talentflow.com'}
              </div>
            </div>

            {/* Portal preview content */}
            <div className="overflow-y-auto flex-1">
              {/* Nav bar */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-slate-700/60" style={{ backgroundColor: branding.primary_color }}>
                <div className="flex items-center gap-3">
                  {branding.logo_url ? (
                    <img src={branding.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{branding.company_name?.[0] || 'T'}</span>
                    </div>
                  )}
                  <span className="text-white font-semibold text-sm">{branding.company_name || 'TalentFlow'}</span>
                </div>
                <div
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white border border-white/30"
                  style={{ backgroundColor: branding.secondary_color }}
                >
                  View All Jobs
                </div>
              </div>

              {/* Hero */}
              <div className="px-6 py-10 text-center" style={{ background: `linear-gradient(135deg, ${branding.primary_color}15, ${branding.secondary_color}15)` }}>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-50 mb-2">Join Our Team</h1>
                <p className="text-sm text-gray-600 dark:text-slate-400 max-w-md mx-auto">
                  We're looking for talented people to help us build the future. Explore open roles below.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <div className="px-5 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: branding.primary_color }}>
                    Browse Jobs
                  </div>
                  <div className="px-5 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                    Learn More
                  </div>
                </div>
              </div>

              {/* Job listings */}
              <div className="px-6 pb-8">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">Open Positions</h2>
                {[
                  { title: 'Senior Frontend Engineer', dept: 'Engineering', loc: 'Remote', type: 'Full-time' },
                  { title: 'Product Designer', dept: 'Design', loc: 'Hybrid', type: 'Full-time' },
                  { title: 'Sales Development Rep', dept: 'Sales', loc: 'On-site', type: 'Full-time' },
                ].map((job, i) => (
                  <div key={i} className="flex items-center justify-between p-4 mb-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 hover:border-gray-300 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-50">{job.title}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{job.dept} · {job.loc}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{job.type}</span>
                      <div className="text-xs font-medium px-3 py-1 rounded-lg text-white" style={{ backgroundColor: branding.primary_color }}>
                        Apply
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700/60 text-center">
                <p className="text-xs text-gray-400 dark:text-slate-500">{branding.email_footer || 'Powered by TalentFlow'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
