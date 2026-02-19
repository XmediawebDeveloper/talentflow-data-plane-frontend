'use client';

import { Palette, Upload, Save, Eye, Check, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { brandingApi, BrandingSettings, BrandingUpdate } from '@/lib/services/settingsService';
import { toast } from 'sonner';

export default function BrandingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
        const data = await brandingApi.get();
        setBranding(data);
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
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-600 to-pink-700 rounded-xl flex items-center justify-center shadow-lg">
                <Palette className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Branding & White Label</h1>
                <p className="text-sm text-gray-600">Customize your platform appearance</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              {saved ? <Check className="w-4 h-4" /> : isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Logo</h2>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain rounded-xl" />
              ) : (
                <Upload className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <div>
              <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                Upload Logo
              </button>
              <p className="text-sm text-gray-500 mt-2">Recommended: 200x200px, PNG or SVG</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand Colors</h2>
          <p className="text-sm text-gray-600 mb-3">Color Presets</p>
          <div className="flex gap-3 mb-6">
            {colorPresets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setBranding({ ...branding, primary_color: preset.primary, secondary_color: preset.secondary })}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex">
                  <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preset.primary }} />
                  <div className="w-5 h-5 rounded-full -ml-2" style={{ backgroundColor: preset.secondary }} />
                </div>
                <span className="text-sm text-gray-700">{preset.name}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={branding.primary_color}
                  onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                  className="w-12 h-12 rounded-lg cursor-pointer border border-gray-200"
                />
                <input
                  type="text"
                  value={branding.primary_color}
                  onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={branding.secondary_color}
                  onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                  className="w-12 h-12 rounded-lg cursor-pointer border border-gray-200"
                />
                <input
                  type="text"
                  value={branding.secondary_color}
                  onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Domain</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Domain URL</label>
            <input
              type="text"
              value={branding.custom_domain || ''}
              onChange={(e) => setBranding({ ...branding, custom_domain: e.target.value })}
              placeholder="careers.yourcompany.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
            />
            <p className="text-sm text-gray-500 mt-2">Point your CNAME record to app.talentflow.com</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
            <button className="flex items-center gap-2 text-sm text-gray-800 hover:text-gray-900">
              <Eye className="w-4 h-4" />
              Open Full Preview
            </button>
          </div>
          <div className="bg-gray-100 rounded-lg p-6 flex items-center justify-center h-48">
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-xl mx-auto mb-3 flex items-center justify-center"
                style={{ backgroundColor: branding.primary_color }}
              >
                <span className="text-white text-2xl font-bold">{branding.company_name?.[0] || 'T'}</span>
              </div>
              <p className="font-semibold text-gray-900">{branding.company_name || 'TalentFlow'}</p>
              <p className="text-sm text-gray-500">Your branded career portal</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
