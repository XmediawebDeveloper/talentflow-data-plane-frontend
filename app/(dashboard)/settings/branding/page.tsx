'use client';

import { Palette, Upload, Save, Eye, Check } from 'lucide-react';
import { useState } from 'react';

export default function BrandingPage() {
  const [branding, setBranding] = useState({
    primaryColor: '#2563eb',
    secondaryColor: '#7c3aed',
    logoUrl: '',
    companyName: 'TalentFlow',
    favicon: '',
    emailFooter: 'Powered by TalentFlow',
    customDomain: '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // Save logic
    setTimeout(() => {
      setIsSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 1000);
  };

  const colorPresets = [
    { name: 'Blue', primary: '#2563eb', secondary: '#7c3aed' },
    { name: 'Green', primary: '#059669', secondary: '#0891b2' },
    { name: 'Purple', primary: '#7c3aed', secondary: '#db2777' },
    { name: 'Orange', primary: '#ea580c', secondary: '#ca8a04' },
  ];

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-600 to-pink-700 rounded-xl flex items-center justify-center shadow-lg">
                <Palette className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Branding & White Label</h1>
                <p className="text-sm text-gray-600">Customize your platform appearance</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Logo Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Logo</h2>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain rounded-xl" />
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

        {/* Colors */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand Colors</h2>

          {/* Presets */}
          <p className="text-sm text-gray-600 mb-3">Color Presets</p>
          <div className="flex gap-3 mb-6">
            {colorPresets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setBranding({ ...branding, primaryColor: preset.primary, secondaryColor: preset.secondary })}
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

          {/* Custom Colors */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  className="w-12 h-12 rounded-lg cursor-pointer border border-gray-200"
                />
                <input
                  type="text"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={branding.secondaryColor}
                  onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
                  className="w-12 h-12 rounded-lg cursor-pointer border border-gray-200"
                />
                <input
                  type="text"
                  value={branding.secondaryColor}
                  onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Custom Domain */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Domain</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Domain URL</label>
            <input
              type="text"
              value={branding.customDomain}
              onChange={(e) => setBranding({ ...branding, customDomain: e.target.value })}
              placeholder="careers.yourcompany.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-2">Point your CNAME record to app.talentflow.com</p>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
            <button className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
              <Eye className="w-4 h-4" />
              Open Full Preview
            </button>
          </div>
          <div className="bg-gray-100 rounded-lg p-6 flex items-center justify-center h-48">
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-xl mx-auto mb-3 flex items-center justify-center"
                style={{ backgroundColor: branding.primaryColor }}
              >
                <span className="text-white text-2xl font-bold">T</span>
              </div>
              <p className="font-semibold text-gray-900">{branding.companyName}</p>
              <p className="text-sm text-gray-500">Your branded career portal</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
