'use client';

import { User, Bell, Shield, Palette, Mail, Save, Check, Lock, Phone, MapPin, Briefcase, Target, Filter, Calendar, Loader2, Eye, EyeOff, KeyRound, Sparkles, Key, ScrollText, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/hooks/useAuth';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { userSettingsApi, UserSettings, UserProfile, UserSettingsUpdate, UserProfileUpdate } from '@/lib/services/settingsService';
import { toast } from 'sonner';

export default function Settings() {
  const { user, logout, hasPermission, isTenantAdmin } = useAuth();
  const { setTheme, theme: currentTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const canEditSettings = isTenantAdmin || hasPermission('canManageSettings');

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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
        // Apply saved theme preference to next-themes
        if (userSettings.theme) {
          setTheme(userSettings.theme === 'auto' ? 'system' : userSettings.theme);
        }
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
    if (!canEditSettings) {
      toast.error('You have view-only access to these settings');
      return;
    }

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setIsChangingPassword(true);
    try {
      await userSettingsApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully. Please log in again.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => logout(), 1500);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const canAccessJobPreferences = isTenantAdmin || hasPermission('canCreateJD') || hasPermission('canUpdateJD') || hasPermission('canReadJD');
  const canAccessWorkflow = isTenantAdmin ||
    hasPermission('canCreateJD') ||
    hasPermission('canUpdateJD') ||
    hasPermission('canViewResumes') ||
    hasPermission('canViewInternalDB') ||
    hasPermission('canViewScoring') ||
    hasPermission('canViewAiMatch');

  const tabs = [
    { id: 'profile', label: 'My Profile', icon: User, visible: true },
    { id: 'notifications', label: 'Notifications', icon: Bell, visible: true },
    { id: 'job-preferences', label: 'Job Preferences', icon: Briefcase, visible: canAccessJobPreferences },
    { id: 'workflow', label: 'Workflow', icon: Filter, visible: canAccessWorkflow },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield, visible: true },
    { id: 'appearance', label: 'Appearance', icon: Palette, visible: true },
    { id: 'change-password', label: 'Change Password', icon: KeyRound, visible: true },
  ];
  const visibleTabs = tabs.filter(tab => tab.visible);

  // Quick links to the workspace / admin settings pages. These are separate routes,
  // so they are shown as plain navigation links (not tabs and not a dropdown).
  const adminSettingsLinks = [
    { id: 'permissions', label: 'Permissions & Roles', icon: Shield, href: '/settings/permissions', visible: isTenantAdmin || hasPermission('canViewRoles') },
    { id: 'api-management', label: 'API Management', icon: Key, href: '/settings/api-management', visible: isTenantAdmin || hasPermission('canViewApiManagement') },
    { id: 'branding', label: 'Branding & White Label', icon: Palette, href: '/settings/branding', visible: isTenantAdmin || hasPermission('canViewBranding') },
    { id: 'security', label: 'Security Settings', icon: Lock, href: '/settings/security', visible: isTenantAdmin || hasPermission('canViewSecuritySettings') },
    { id: 'legal', label: 'Legal & Compliance', icon: ScrollText, href: '/settings/legal', visible: isTenantAdmin || hasPermission('canManageSettings') },
  ];
  const visibleAdminSettingsLinks = adminSettingsLinks.filter(link => link.visible);

  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'profile');
    }
  }, [activeTab, visibleTabs]);

  // Persist scroll position + the active settings tab so returning to this page
  // lands the user on the same section, scrolled where they left off. Called
  // unconditionally, before the loading early-return. activeTab is a scroll dep
  // because switching tabs swaps content of very different heights.
  const rootRef = useScrollRestoration<HTMLElement>('settings-general', !isLoading, [activeTab]);
  useListStatePersistence(
    'settings-general',
    { activeTab },
    (s) => {
      if (typeof s.activeTab === 'string') setActiveTab(s.activeTab);
    },
  );

  if (isLoading) {
    return (
      <main className="flex-1 overflow-x-hidden bg-slate-50 flex items-center justify-center">
        <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
          <p className="font-semibold text-gray-600 dark:text-slate-400">Loading settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings' }]} />

      {/* SaaS Hero Header */}
      <section className="relative mb-6 overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-5 sm:p-6">
        <div className="relative flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
            <User className="h-5 w-5 text-brand-blue" />
          </div>
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-orange/5 ring-1 ring-brand-orange/20 px-2.5 py-0.5 text-[11px] font-semibold text-brand-orange-deep">
              <Sparkles className="h-3 w-3 text-brand-orange-deep" />
              Personal preferences
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl text-gray-900 dark:text-slate-50">Recruiter Settings</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-slate-400 sm:text-base">Manage your personal preferences, notifications, and workflow defaults.</p>
          </div>
        </div>
      </section>

      {/* Tabs + Content Layout */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Left Sidebar - Tabs */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-2 lg:sticky lg:top-8">
            <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 lg:flex-shrink ${
                      activeTab === tab.id
                        ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}

              {/* Workspace & admin settings — plain links to their own pages (not a dropdown) */}
              {visibleAdminSettingsLinks.length > 0 && (
                <>
                  <div className="hidden lg:block my-1.5 border-t border-gray-100 dark:border-slate-700/60" />
                  <span className="hidden lg:block px-4 pb-1 text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-[0.1em]">
                    Workspace &amp; Admin
                  </span>
                  {visibleAdminSettingsLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.id}
                        href={link.href}
                        className="group w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 lg:flex-shrink text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue"
                      >
                        <Icon className="w-5 h-5" />
                        <span>{link.label}</span>
                        <ChevronRight className="hidden lg:block w-4 h-4 ml-auto text-gray-300 dark:text-slate-500 group-hover:text-brand-blue" />
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>

            {/* Role Info */}
            <div className="hidden lg:block mt-4 p-3 rounded-lg bg-brand-blue/5 border border-brand-blue/15 ring-1 ring-brand-blue/5">
              <div className="text-[10px] font-semibold text-brand-blue uppercase tracking-wider mb-1">Role</div>
              <div className="text-sm text-gray-900 dark:text-slate-50 font-semibold">{user?.role || 'Recruiter'}</div>
              <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">Access Level: {(user?.role as string) === 'admin' || user?.role === 'tenant_admin' ? 'Admin' : 'Standard'}</div>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1">
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-4 sm:p-6 lg:p-8">
            {!canEditSettings && activeTab !== 'change-password' && (
              <div className="mb-6 rounded-lg ring-1 ring-brand-orange/20 bg-brand-orange/5 px-4 py-3 text-sm text-brand-orange-deep">
                View-only access. You can review these settings, but you do not have permission to edit them.
              </div>
            )}

            {/* Profile Settings */}
            {activeTab === 'profile' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">My Profile</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Update your personal information and recruiter profile</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  {/* Profile Picture */}
                  <div className="mb-8 pb-8 border-b border-gray-200 dark:border-slate-700">
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3">Profile Picture</label>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-brand-blue text-white flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 text-2xl flex-shrink-0">
                        {profileData.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                      </div>
                      <div className="text-center sm:text-left">
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                          <button
                            type="button"
                            className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Upload New
                          </button>
                          <button
                            type="button"
                            className="px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Remove
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">JPG, PNG or GIF. Max size 5MB.</p>
                      </div>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Full Name</label>
                        <input
                          type="text"
                          value={profileData.full_name || ''}
                          onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Email Address</label>
                        <input
                          type="email"
                          value={profileData.email || ''}
                          disabled
                          className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-slate-500 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Email cannot be changed</p>
                      </div>
                    </div>

                    <div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Phone Number</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                            <input
                              type="tel"
                              value={profileData.phone || ''}
                              onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Job Title</label>
                          <div className="relative">
                            <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                            <input
                              type="text"
                              value={profileData.job_title || ''}
                              onChange={(e) => setProfileData({ ...profileData, job_title: e.target.value })}
                              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Department</label>
                      <input
                        type="text"
                        value={profileData.department || ''}
                        onChange={(e) => setProfileData({ ...profileData, department: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                      />
                    </div>
                  </div>
                </fieldset>
              </div>
            )}

            {/* Notification Settings */}
            {activeTab === 'notifications' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">Notification Settings</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Choose how you want to be notified about recruitment activities</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  <div className="space-y-6">
                    {/* Email Notifications */}
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-4 flex items-center gap-2">
                        <Mail className="w-5 h-5 text-brand-blue" />
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
                          <div key={item.key} className="flex items-start justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-1">{item.label}</div>
                              <div className="text-xs text-gray-600 dark:text-slate-400">{item.desc}</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                              <input
                                type="checkbox"
                                checked={settings[item.key as keyof typeof settings] as boolean}
                                onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-blue/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Push Notifications */}
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-4 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-brand-blue" />
                        Push Notifications
                      </h3>
                      <div className="space-y-3">
                        {[
                          { key: 'push_new_applicant', label: 'New applicant alerts', desc: 'Browser notifications for new applications' },
                          { key: 'push_assessment_complete', label: 'Assessment completion', desc: 'Instant alerts for completed assessments' },
                          { key: 'push_interview_reminder', label: 'Interview reminders', desc: 'Get reminded 15 minutes before interviews' },
                          { key: 'push_candidate_viewed', label: 'Candidate profile views', desc: 'When candidates view your job postings' },
                        ].map((item) => (
                          <div key={item.key} className="flex items-start justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-1">{item.label}</div>
                              <div className="text-xs text-gray-600 dark:text-slate-400">{item.desc}</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                              <input
                                type="checkbox"
                                checked={settings[item.key as keyof typeof settings] as boolean}
                                onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-blue/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Digest Notifications */}
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-brand-cyan" />
                        Digest & Reports
                      </h3>
                      <div className="space-y-3">
                        {[
                          { key: 'weekly_digest', label: 'Weekly activity digest', desc: 'Summary of weekly recruitment activity' },
                          { key: 'monthly_report', label: 'Monthly performance report', desc: 'Detailed monthly analytics and insights' },
                        ].map((item) => (
                          <div key={item.key} className="flex items-start justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-1">{item.label}</div>
                              <div className="text-xs text-gray-600 dark:text-slate-400">{item.desc}</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                              <input
                                type="checkbox"
                                checked={settings[item.key as keyof typeof settings] as boolean}
                                onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-blue/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </fieldset>
              </div>
            )}

            {/* Job Preferences */}
            {activeTab === 'job-preferences' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">Job Posting Preferences</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Set default values for new job postings</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  <div className="space-y-6">
                    <div className="p-4 bg-brand-blue/5 ring-1 ring-brand-blue/15 border border-brand-blue/15 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Target className="w-5 h-5 text-brand-blue mt-0.5" />
                        <div>
                          <div className="text-sm font-semibold text-brand-blue mb-1">Quick Tip</div>
                          <div className="text-sm text-gray-900 dark:text-slate-50">These settings will be pre-filled when you create a new job posting, saving you time.</div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Default Job Type</label>
                      <select
                        value={settings.default_job_type || 'Full-time'}
                        onChange={(e) => setSettings({ ...settings, default_job_type: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900"
                      >
                        <option>Full-time</option>
                        <option>Part-time</option>
                        <option>Contract</option>
                        <option>Internship</option>
                        <option>Temporary</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Default Location</label>
                      <select
                        value={settings.default_location || 'Remote'}
                        onChange={(e) => setSettings({ ...settings, default_location: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900"
                      >
                        <option>Remote</option>
                        <option>Hybrid</option>
                        <option>On-site</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Default Job Expiry (Days)</label>
                      <input
                        type="number"
                        value={settings.default_expiry_days || 30}
                        onChange={(e) => setSettings({ ...settings, default_expiry_days: parseInt(e.target.value) || 30 })}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                        min="1"
                        max="90"
                      />
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Job postings will automatically expire after this many days</p>
                    </div>

                    <div className="space-y-3">
                      {[
                        { key: 'auto_save_jd', label: 'Auto-save job drafts', desc: 'Automatically save your progress when creating jobs' },
                        { key: 'require_assessment', label: 'Require assessment by default', desc: 'Automatically require candidates to complete an assessment' },
                        { key: 'auto_publish', label: 'Auto-publish jobs', desc: 'Automatically publish jobs after creation (skip draft)' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600 dark:text-slate-400">{item.desc}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer ml-4">
                            <input
                              type="checkbox"
                              checked={settings[item.key as keyof typeof settings] as boolean}
                              onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-blue/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </fieldset>
              </div>
            )}

            {/* Workflow Preferences */}
            {activeTab === 'workflow' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">Workflow Preferences</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Customize how you interact with the platform</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-4">Resume Management</h3>
                      <div className="space-y-3">
                        {[
                          { key: 'auto_screen_resumes', label: 'AI-powered auto-screening', desc: 'Automatically screen and rank resumes using AI' },
                          { key: 'ai_assistance', label: 'AI assistance suggestions', desc: 'Get AI-powered suggestions while reviewing candidates' },
                          { key: 'bulk_action_confirmation', label: 'Confirm bulk actions', desc: 'Show confirmation dialog for bulk operations' },
                          { key: 'show_advanced_filters', label: 'Show advanced filters by default', desc: 'Display advanced filter options when searching resumes' },
                        ].map((item) => (
                          <div key={item.key} className="flex items-start justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-1">{item.label}</div>
                              <div className="text-xs text-gray-600 dark:text-slate-400">{item.desc}</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                              <input
                                type="checkbox"
                                checked={settings[item.key as keyof typeof settings] as boolean}
                                onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-blue/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-4">Default Sort Order</h3>
                      <select
                        value={settings.default_sort_order || 'latest'}
                        onChange={(e) => setSettings({ ...settings, default_sort_order: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900"
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
                </fieldset>
              </div>
            )}

            {/* Privacy & Security Settings */}
            {activeTab === 'privacy' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">Privacy & Security</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Manage your privacy settings and account security</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  <div className="space-y-6">
                    {/* Privacy Settings */}
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-brand-blue" />
                        Privacy Settings
                      </h3>
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                          <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Profile Visibility</label>
                          <select
                            value={settings.profile_visibility || 'team'}
                            onChange={(e) => setSettings({ ...settings, profile_visibility: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900"
                          >
                            <option value="team">Team Only - Visible to team members</option>
                            <option value="private">Private - Only visible to me</option>
                          </select>
                          <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">Controls who can see your recruiter profile</p>
                        </div>

                        {[
                          { key: 'show_email', label: 'Show email in profile', desc: 'Display your email address on your profile' },
                          { key: 'show_phone', label: 'Show phone number', desc: 'Display your phone number on your profile' },
                          { key: 'show_activity_status', label: 'Show activity status', desc: "Let team members see when you're online" },
                        ].map((item) => (
                          <div key={item.key} className="flex items-start justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-1">{item.label}</div>
                              <div className="text-xs text-gray-600 dark:text-slate-400">{item.desc}</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                              <input
                                type="checkbox"
                                checked={settings[item.key as keyof typeof settings] as boolean}
                                onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-blue/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                  {/* Security Settings */}
                  <div className="pt-6 border-t border-gray-200 dark:border-slate-700">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-4 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-red-600" />
                      Security Settings
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                      For advanced security settings including password change, 2FA, and session management,
                      please visit the <a href="/settings/security" className="text-brand-blue hover:text-brand-blue-2 hover:underline font-semibold">Security Settings</a> page.
                    </p>
                  </div>
                  </div>
                </fieldset>
              </div>
            )}

            {/* Appearance Settings */}
            {activeTab === 'appearance' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">Appearance Settings</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Customize how TalentFlow looks and feels</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                <div className="space-y-6">
                  {/* Theme */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3">Theme</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                      {[
                        { value: 'light', label: 'Light', desc: 'Classic bright theme' },
                        { value: 'dark', label: 'Dark', desc: 'Easy on the eyes' },
                        { value: 'auto', label: 'Auto', desc: 'Match system' },
                      ].map((theme) => (
                        <button
                          key={theme.value}
                          onClick={() => {
                            setSettings({ ...settings, theme: theme.value });
                            setTheme(theme.value === 'auto' ? 'system' : theme.value);
                          }}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            settings.theme === theme.value
                              ? 'border-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/15'
                              : 'border-gray-200 dark:border-slate-700 hover:border-brand-blue/30'
                          }`}
                        >
                          <div className={`w-full h-20 rounded-md mb-3 ${
                            theme.value === 'light' ? 'bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700' :
                            theme.value === 'dark' ? 'bg-gray-900' :
                            'bg-gradient-to-br from-white to-gray-900'
                          }`}></div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-slate-50">{theme.label}</div>
                          <div className="text-xs text-gray-600 dark:text-slate-400">{theme.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Language</label>
                    <select
                      value={settings.language || 'en'}
                      onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900"
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
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Date Format</label>
                    <select
                      value={settings.date_format || 'MM/DD/YYYY'}
                      onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900"
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
                    </select>
                  </div>

                  {/* Time Format */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Time Format</label>
                    <select
                      value={settings.time_format || '12h'}
                      onChange={(e) => setSettings({ ...settings, time_format: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900"
                    >
                      <option value="12h">12-hour (3:30 PM)</option>
                      <option value="24h">24-hour (15:30)</option>
                    </select>
                  </div>

                  {/* Default Landing Page */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Default Landing Page</label>
                    <select
                      value={settings.default_view || 'dashboard'}
                      onChange={(e) => setSettings({ ...settings, default_view: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900"
                    >
                      <option value="dashboard">Dashboard</option>
                      <option value="jobs">Jobs Listing</option>
                      <option value="my-resumes">My Resumes</option>
                      <option value="internal-db">Internal Database</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">The page you'll see first when you log in</p>
                  </div>
                </div>
                </fieldset>
              </div>
            )}

            {/* Change Password */}
            {activeTab === 'change-password' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">Change Password</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Update your password. You will be logged out after changing it.</p>
                  </div>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
                  {/* Current Password */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Current Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        className="w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-brand-blue"
                      >
                        {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-brand-blue"
                      >
                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {newPassword.length > 0 && newPassword.length < 6 && (
                      <p className="text-xs text-red-500 mt-1">Password must be at least 6 characters</p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-brand-blue"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                      <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                    )}
                    {confirmPassword.length > 0 && newPassword === confirmPassword && newPassword.length >= 6 && (
                      <p className="text-xs text-brand-cyan mt-1 flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Passwords match
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isChangingPassword ||
                      !currentPassword ||
                      newPassword.length < 6 ||
                      newPassword !== confirmPassword
                    }
                    className="w-full sm:w-auto px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isChangingPassword ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Changing...
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        Change Password
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Save Button — hidden on change-password tab */}
            {activeTab !== 'change-password' && canEditSettings && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200 dark:border-slate-700 flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600 dark:text-slate-400">
                {saveSuccess && (
                  <div className="flex items-center gap-2 text-brand-cyan font-semibold">
                    <Check className="w-4 h-4" />
                    Settings saved successfully!
                  </div>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full sm:w-auto px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
            )}
          </div>
        </div>
      </div>
      </div>
      </div>
    </main>
  );
}
