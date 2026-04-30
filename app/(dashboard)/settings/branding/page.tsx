'use client';

import { Palette, Upload, Save, Eye, Check, Loader2, X, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { brandingApi, BrandingSettings, BrandingUpdate } from '@/lib/services/settingsService';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';

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
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading branding settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-12 sm:h-12 bg-gradient-to-br from-pink-600 to-pink-700 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <Palette className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900">Branding & White Label</h1>
                <p className="text-xs sm:text-sm text-gray-600">Customize your platform appearance</p>
              </div>
            </div>
            {canManage && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors flex-shrink-0 w-full sm:w-auto"
              >
                {saved ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : isSaving ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Logo</h2>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300 flex-shrink-0 relative overflow-hidden">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain rounded-xl" />
              ) : isUploadingLogo ? (
                <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 animate-spin" />
              ) : (
                <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
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
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo || !canManage}
                  className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isUploadingLogo ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Uploading...</>
                  ) : (
                    <><Upload className="w-3.5 h-3.5" />Upload Logo</>
                  )}
                </button>
                {branding.logo_url && canManage && (
                  <button
                    onClick={() => setBranding(prev => ({ ...prev, logo_url: '' }))}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    title="Remove logo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">Recommended: 200x200px, PNG, SVG, or JPG (max 2MB)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Brand Colors</h2>
          <p className="text-xs sm:text-sm text-gray-700 mb-2 sm:mb-3">Color Presets</p>
          <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6">
            {colorPresets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setBranding({ ...branding, primary_color: preset.primary, secondary_color: preset.secondary })}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-shrink-0">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full" style={{ backgroundColor: preset.primary }} />
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full -ml-1.5 sm:-ml-2" style={{ backgroundColor: preset.secondary }} />
                </div>
                <span className="text-xs sm:text-sm text-gray-700">{preset.name}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Primary Color</label>
              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  type="color"
                  value={branding.primary_color}
                  onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg cursor-pointer border border-gray-200 flex-shrink-0"
                />
                <input
                  type="text"
                  value={branding.primary_color}
                  onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                  className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Secondary Color</label>
              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  type="color"
                  value={branding.secondary_color}
                  onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg cursor-pointer border border-gray-200 flex-shrink-0"
                />
                <input
                  type="text"
                  value={branding.secondary_color}
                  onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                  className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Custom Domain</h2>
            {domainVerified && branding.custom_domain && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified
              </span>
            )}
            {!domainVerified && branding.custom_domain && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                <ShieldAlert className="w-3.5 h-3.5" /> Not verified
              </span>
            )}
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Domain URL</label>
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
                className="flex-1 px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none placeholder-gray-500"
              />
              <button
                onClick={handleVerifyDomain}
                disabled={isVerifyingDomain || !branding.custom_domain?.trim() || !canManage}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              >
                {isVerifyingDomain ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking...</>
                ) : domainVerified ? (
                  <><RefreshCw className="w-3.5 h-3.5" />Re-verify</>
                ) : (
                  <><ShieldCheck className="w-3.5 h-3.5" />Verify DNS</>
                )}
              </button>
            </div>

            {/* DNS Instructions */}
            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-2">DNS Setup Instructions:</p>
              <div className="space-y-1 text-xs text-gray-600 font-mono">
                <div className="flex gap-3">
                  <span className="text-gray-400 w-12">Type</span>
                  <span className="font-semibold text-gray-800">CNAME</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400 w-12">Name</span>
                  <span className="font-semibold text-gray-800">{branding.custom_domain || 'careers'}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-gray-400 w-12">Value</span>
                  <span className="font-semibold text-blue-700">{cnameTarget || 'loading...'}</span>
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
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                {domainError}
              </p>
            )}
            {domainVerified && (
              <p className="mt-2 text-xs text-green-600 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                DNS verified. Your custom domain is active.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Preview</h2>
            <button
              onClick={() => setShowPreviewModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Open Full Preview</span>
              <span className="sm:hidden">Preview</span>
            </button>
          </div>
          <div className="bg-gray-100 rounded-lg p-4 sm:p-6 flex items-center justify-center h-36 sm:h-48">
            <div className="text-center">
              <div
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl mx-auto mb-2 sm:mb-3 flex items-center justify-center"
                style={{ backgroundColor: branding.primary_color }}
              >
                <span className="text-white text-xl sm:text-2xl font-bold">{branding.company_name?.[0] || 'T'}</span>
              </div>
              <p className="font-semibold text-sm sm:text-base text-gray-900">{branding.company_name || 'TalentFlow'}</p>
              <p className="text-xs sm:text-sm text-gray-600">Your branded career portal</p>
            </div>
          </div>
        </div>
      </div>

      {/* Full Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Branded Career Portal Preview</h3>
                <p className="text-xs text-gray-500 mt-0.5">How candidates will see your portal</p>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Simulated browser chrome */}
            <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-b border-gray-200 flex-shrink-0">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-gray-500 border border-gray-200">
                {branding.custom_domain && domainVerified
                  ? `https://${branding.custom_domain}/careers`
                  : 'https://careers.talentflow.com'}
              </div>
            </div>

            {/* Portal preview content */}
            <div className="overflow-y-auto flex-1">
              {/* Nav bar */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100" style={{ backgroundColor: branding.primary_color }}>
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
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Join Our Team</h1>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  We're looking for talented people to help us build the future. Explore open roles below.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <div className="px-5 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: branding.primary_color }}>
                    Browse Jobs
                  </div>
                  <div className="px-5 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 bg-white">
                    Learn More
                  </div>
                </div>
              </div>

              {/* Job listings */}
              <div className="px-6 pb-8">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Open Positions</h2>
                {[
                  { title: 'Senior Frontend Engineer', dept: 'Engineering', loc: 'Remote', type: 'Full-time' },
                  { title: 'Product Designer', dept: 'Design', loc: 'Hybrid', type: 'Full-time' },
                  { title: 'Sales Development Rep', dept: 'Sales', loc: 'On-site', type: 'Full-time' },
                ].map((job, i) => (
                  <div key={i} className="flex items-center justify-between p-4 mb-2 border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{job.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{job.dept} · {job.loc}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{job.type}</span>
                      <div className="text-xs font-medium px-3 py-1 rounded-lg text-white" style={{ backgroundColor: branding.primary_color }}>
                        Apply
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">{branding.email_footer || 'Powered by TalentFlow'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
