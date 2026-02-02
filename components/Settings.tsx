'use client';

import { User, Bell, Shield, Palette, Mail, Save, Check, Lock, Phone, MapPin, Briefcase, Target, Filter, Calendar, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { userSettingsApi, UserSettings, UserProfile, UserSettingsUpdate, UserProfileUpdate } from '@/lib/services/settingsService';
import { toast } from 'sonner';

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Profile Settings
  const [profileData, setProfileData] = useState<UserProfileUpdate & { email?: string }>({
    full_name: '',
    phone: '',
    job_title: '',
    department: '',
  });

  // User Settings (combined)
  const [settings, setSettings] = useState<UserSettingsUpdate>({
    // Notification Settings
    email_new_applicant: true,
    email_assessment_complete: true,
    email_interview_scheduled: true,
    email_candidate_message: false,
    email_job_expiring: true,
    push_new_applicant: true,
    push_assessment_complete: false,
    push_interview_reminder: true,
    push_candidate_viewed: false,
    weekly_digest: true,
    monthly_report: true,
    // Job Preferences
    auto_save_jd: true,
    default_job_type: 'Full-time',
    default_location: 'Remote',
    require_assessment: false,
    auto_publish: false,
    default_expiry_days: 30,
    // Workflow Preferences
    auto_screen_resumes: true,
    ai_assistance: true,
    bulk_action_confirmation: true,
    show_advanced_filters: true,
    default_sort_order: 'latest',
    // Privacy Settings
    profile_visibility: 'team',
    show_email: false,
    show_phone: false,
    show_activity_status: true,
    // Appearance Settings
    theme: 'light',
    language: 'en',
    date_format: 'MM/DD/YYYY',
    time_format: '12h',
    default_view: 'dashboard',
  });

  // Load user profile and settings on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load profile
        const profile = await userSettingsApi.getProfile();
        setProfileData({
          full_name: profile.full_name || '',
          email: profile.email,
          phone: profile.phone || '',
          job_title: profile.job_title || '',
          department: profile.department || '',
        });

        // Load settings
        const userSettings = await userSettingsApi.getSettings();
        setSettings({
          email_new_applicant: userSettings.email_new_applicant,
          email_assessment_complete: userSettings.email_assessment_complete,
          email_interview_scheduled: userSettings.email_interview_scheduled,
          email_candidate_message: userSettings.email_candidate_message,
          email_job_expiring: userSettings.email_job_expiring,
          push_new_applicant: userSettings.push_new_applicant,
          push_assessment_complete: userSettings.push_assessment_complete,
          push_interview_reminder: userSettings.push_interview_reminder,
          push_candidate_viewed: userSettings.push_candidate_viewed,
          weekly_digest: userSettings.weekly_digest,
          monthly_report: userSettings.monthly_report,
          auto_save_jd: userSettings.auto_save_jd,
          default_job_type: userSettings.default_job_type,
          default_location: userSettings.default_location,
          require_assessment: userSettings.require_assessment,
          auto_publish: userSettings.auto_publish,
          default_expiry_days: userSettings.default_expiry_days,
          auto_screen_resumes: userSettings.auto_screen_resumes,
          ai_assistance: userSettings.ai_assistance,
          bulk_action_confirmation: userSettings.bulk_action_confirmation,
          show_advanced_filters: userSettings.show_advanced_filters,
          default_sort_order: userSettings.default_sort_order,
          profile_visibility: userSettings.profile_visibility,
          show_email: userSettings.show_email,
          show_phone: userSettings.show_phone,
          show_activity_status: userSettings.show_activity_status,
          theme: userSettings.theme,
          language: userSettings.language,
          date_format: userSettings.date_format,
          time_format: userSettings.time_format,
          default_view: userSettings.default_view,
        });
      } catch (error) {
        console.error('Error loading settings:', error);
        // Use default values on error
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save profile if on profile tab
      if (activeTab === 'profile') {
        await userSettingsApi.updateProfile({
          full_name: profileData.full_name,
          phone: profileData.phone,
          job_title: profileData.job_title,
          department: profileData.department,
        });
      }

      // Save settings
      await userSettingsApi.updateSettings(settings);

      setSaveSuccess(true);
      toast.success('Settings saved successfully');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'job-preferences', label: 'Job Preferences', icon: Briefcase },
    { id: 'workflow', label: 'Workflow', icon: Filter },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  if (isLoading) {
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
            <User className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-gray-900">Recruiter Settings</h1>
            <p className="text-sm text-gray-600">Manage your personal preferences and workflow settings</p>
          </div>
        </div>
      </div>

      {/* Tabs + Content Layout */}
      <div className="flex gap-6">
        {/* Left Sidebar - Tabs */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 sticky top-8">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all ${
                      activeTab === tab.id
                        ? 'bg-gray-800 text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Role Info */}
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="text-xs text-gray-800 uppercase tracking-wider mb-1">Role</div>
              <div className="text-sm text-gray-800 font-medium">{user?.role || 'Recruiter'}</div>
              <div className="text-xs text-gray-900 mt-1">Access Level: {user?.role === 'admin' || user?.role === 'tenant_admin' ? 'Admin' : 'Standard'}</div>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            {/* Profile Settings */}
            {activeTab === 'profile' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">My Profile</h2>
                    <p className="text-sm text-gray-600">Update your personal information and recruiter profile</p>
                  </div>
                </div>

                {/* Profile Picture */}
                <div className="mb-8 pb-8 border-b border-gray-200">
                  <label className="block text-sm font-medium text-gray-900 mb-3">Profile Picture</label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 text-white flex items-center justify-center shadow-lg text-2xl">
                      {profileData.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <button className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm mr-2">
                        Upload New
                      </button>
                      <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                        Remove
                      </button>
                      <p className="text-xs text-gray-500 mt-2">JPG, PNG or GIF. Max size 5MB.</p>
                    </div>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Full Name</label>
                      <input
                        type="text"
                        value={profileData.full_name || ''}
                        onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Email Address</label>
                      <input
                        type="email"
                        value={profileData.email || ''}
                        disabled
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="tel"
                          value={profileData.phone || ''}
                          onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Job Title</label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={profileData.job_title || ''}
                          onChange={(e) => setProfileData({ ...profileData, job_title: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Department</label>
                    <input
                      type="text"
                      value={profileData.department || ''}
                      onChange={(e) => setProfileData({ ...profileData, department: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notification Settings */}
            {activeTab === 'notifications' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Notification Settings</h2>
                    <p className="text-sm text-gray-600">Choose how you want to be notified about recruitment activities</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Email Notifications */}
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Mail className="w-5 h-5 text-gray-800" />
                      Email Notifications
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: 'email_new_applicant', label: 'New applicant submitted', desc: 'Get notified when a candidate applies to your job' },
                        { key: 'email_assessment_complete', label: 'Assessment completed', desc: 'Receive alerts when candidates complete assessments' },
                        { key: 'email_interview_scheduled', label: 'Interview scheduled', desc: 'Notifications for upcoming interviews' },
                        { key: 'email_candidate_message', label: 'Candidate messages', desc: 'Get emails when candidates send you messages' },
                        { key: 'email_job_expiring', label: 'Job expiring soon', desc: 'Reminders when your job postings are about to expire' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={settings[item.key as keyof typeof settings] as boolean}
                              onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-800"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Push Notifications */}
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Bell className="w-5 h-5 text-gray-800" />
                      Push Notifications
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: 'push_new_applicant', label: 'New applicant alerts', desc: 'Browser notifications for new applications' },
                        { key: 'push_assessment_complete', label: 'Assessment completion', desc: 'Instant alerts for completed assessments' },
                        { key: 'push_interview_reminder', label: 'Interview reminders', desc: 'Get reminded 15 minutes before interviews' },
                        { key: 'push_candidate_viewed', label: 'Candidate profile views', desc: 'When candidates view your job postings' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={settings[item.key as keyof typeof settings] as boolean}
                              onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-800"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Digest Notifications */}
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-green-600" />
                      Digest & Reports
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: 'weekly_digest', label: 'Weekly activity digest', desc: 'Summary of weekly recruitment activity' },
                        { key: 'monthly_report', label: 'Monthly performance report', desc: 'Detailed monthly analytics and insights' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={settings[item.key as keyof typeof settings] as boolean}
                              onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-800"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Job Preferences */}
            {activeTab === 'job-preferences' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Job Posting Preferences</h2>
                    <p className="text-sm text-gray-600">Set default values for new job postings</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Target className="w-5 h-5 text-gray-800 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-gray-800 mb-1">Quick Tip</div>
                        <div className="text-sm text-gray-900">These settings will be pre-filled when you create a new job posting, saving you time.</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Default Job Type</label>
                    <select
                      value={settings.default_job_type || 'Full-time'}
                      onChange={(e) => setSettings({ ...settings, default_job_type: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                    >
                      <option>Full-time</option>
                      <option>Part-time</option>
                      <option>Contract</option>
                      <option>Internship</option>
                      <option>Temporary</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Default Location</label>
                    <select
                      value={settings.default_location || 'Remote'}
                      onChange={(e) => setSettings({ ...settings, default_location: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                    >
                      <option>Remote</option>
                      <option>Hybrid</option>
                      <option>On-site</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Default Job Expiry (Days)</label>
                    <input
                      type="number"
                      value={settings.default_expiry_days || 30}
                      onChange={(e) => setSettings({ ...settings, default_expiry_days: parseInt(e.target.value) || 30 })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
                      min="1"
                      max="90"
                    />
                    <p className="text-xs text-gray-500 mt-1">Job postings will automatically expire after this many days</p>
                  </div>

                  <div className="space-y-3">
                    {[
                      { key: 'auto_save_jd', label: 'Auto-save job drafts', desc: 'Automatically save your progress when creating jobs' },
                      { key: 'require_assessment', label: 'Require assessment by default', desc: 'Automatically require candidates to complete an assessment' },
                      { key: 'auto_publish', label: 'Auto-publish jobs', desc: 'Automatically publish jobs after creation (skip draft)' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                          <div className="text-xs text-gray-600">{item.desc}</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer ml-4">
                          <input
                            type="checkbox"
                            checked={settings[item.key as keyof typeof settings] as boolean}
                            onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-800"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Workflow Preferences */}
            {activeTab === 'workflow' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Workflow Preferences</h2>
                    <p className="text-sm text-gray-600">Customize how you interact with the platform</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4">Resume Management</h3>
                    <div className="space-y-3">
                      {[
                        { key: 'auto_screen_resumes', label: 'AI-powered auto-screening', desc: 'Automatically screen and rank resumes using AI' },
                        { key: 'ai_assistance', label: 'AI assistance suggestions', desc: 'Get AI-powered suggestions while reviewing candidates' },
                        { key: 'bulk_action_confirmation', label: 'Confirm bulk actions', desc: 'Show confirmation dialog for bulk operations' },
                        { key: 'show_advanced_filters', label: 'Show advanced filters by default', desc: 'Display advanced filter options when searching resumes' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={settings[item.key as keyof typeof settings] as boolean}
                              onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-800"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4">Default Sort Order</h3>
                    <select
                      value={settings.default_sort_order || 'latest'}
                      onChange={(e) => setSettings({ ...settings, default_sort_order: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                    >
                      <option value="latest">Latest First</option>
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                      <option value="experience-high">Experience (High to Low)</option>
                      <option value="experience-low">Experience (Low to High)</option>
                      <option value="lastUpdated">Last Updated</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Privacy & Security Settings */}
            {activeTab === 'privacy' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Privacy & Security</h2>
                    <p className="text-sm text-gray-600">Manage your privacy settings and account security</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Privacy Settings */}
                  <div>
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-gray-800" />
                      Privacy Settings
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="block text-sm text-gray-900 mb-2">Profile Visibility</label>
                        <select
                          value={settings.profile_visibility || 'team'}
                          onChange={(e) => setSettings({ ...settings, profile_visibility: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                        >
                          <option value="team">Team Only - Visible to team members</option>
                          <option value="private">Private - Only visible to me</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-2">Controls who can see your recruiter profile</p>
                      </div>

                      {[
                        { key: 'show_email', label: 'Show email in profile', desc: 'Display your email address on your profile' },
                        { key: 'show_phone', label: 'Show phone number', desc: 'Display your phone number on your profile' },
                        { key: 'show_activity_status', label: 'Show activity status', desc: "Let team members see when you're online" },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <div className="text-sm text-gray-900 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={settings[item.key as keyof typeof settings] as boolean}
                              onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-800"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Security Settings */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-red-600" />
                      Security Settings
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      For advanced security settings including password change, 2FA, and session management,
                      please visit the <a href="/settings/security" className="text-blue-600 hover:underline">Security Settings</a> page.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Settings */}
            {activeTab === 'appearance' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl text-gray-900 mb-1">Appearance Settings</h2>
                    <p className="text-sm text-gray-600">Customize how TalentFlow looks and feels</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Theme */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-3">Theme</label>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { value: 'light', label: 'Light', desc: 'Classic bright theme' },
                        { value: 'dark', label: 'Dark', desc: 'Easy on the eyes' },
                        { value: 'auto', label: 'Auto', desc: 'Match system' },
                      ].map((theme) => (
                        <button
                          key={theme.value}
                          onClick={() => setSettings({ ...settings, theme: theme.value })}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            settings.theme === theme.value
                              ? 'border-gray-800 bg-gray-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-full h-20 rounded-md mb-3 ${
                            theme.value === 'light' ? 'bg-white border-2 border-gray-200' :
                            theme.value === 'dark' ? 'bg-gray-900' :
                            'bg-gradient-to-br from-white to-gray-900'
                          }`}></div>
                          <div className="text-sm font-medium text-gray-900">{theme.label}</div>
                          <div className="text-xs text-gray-600">{theme.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Language</label>
                    <select
                      value={settings.language || 'en'}
                      onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                    >
                      <option value="en">English (US)</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="ja">日本語</option>
                    </select>
                  </div>

                  {/* Date Format */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Date Format</label>
                    <select
                      value={settings.date_format || 'MM/DD/YYYY'}
                      onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
                    </select>
                  </div>

                  {/* Time Format */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Time Format</label>
                    <select
                      value={settings.time_format || '12h'}
                      onChange={(e) => setSettings({ ...settings, time_format: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                    >
                      <option value="12h">12-hour (3:30 PM)</option>
                      <option value="24h">24-hour (15:30)</option>
                    </select>
                  </div>

                  {/* Default Landing Page */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Default Landing Page</label>
                    <select
                      value={settings.default_view || 'dashboard'}
                      onChange={(e) => setSettings({ ...settings, default_view: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                    >
                      <option value="dashboard">Dashboard</option>
                      <option value="jobs">Jobs Listing</option>
                      <option value="my-resumes">My Resumes</option>
                      <option value="internal-db">Internal Database</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">The page you'll see first when you log in</p>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {saveSuccess && (
                  <div className="flex items-center gap-2 text-green-600">
                    <Check className="w-4 h-4" />
                    Settings saved successfully!
                  </div>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-8 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors shadow-lg hover:shadow-xl flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
