'use client';

import { User, Bell, Info, Shield, Palette, Mail, Save, Check, Lock, MapPin, Briefcase, Target, Filter, Calendar, Loader2, Eye, EyeOff, KeyRound, Key, ScrollText, SlidersHorizontal } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import PageBreadcrumb from '@/components/PageBreadcrumb';
// Workspace & admin pages — rendered inline in the right panel (they keep their own routes too).
import PermissionsPage from '@/app/(dashboard)/settings/permissions/page';
import ApiManagementPage from '@/app/(dashboard)/settings/api-management/page';
import BrandingPage from '@/app/(dashboard)/settings/branding/page';
import SecurityPage from '@/app/(dashboard)/settings/security/page';
import LegalCompliancePage from '@/app/(dashboard)/settings/legal/page';
import { useAuth } from '@/lib/hooks/useAuth';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { userSettingsApi, UserSettings, UserProfile, UserSettingsUpdate, UserProfileUpdate } from '@/lib/services/settingsService';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { Skeleton } from '@/components/ui/skeleton';
import { PERMISSION_DENIED_MESSAGE } from '@/components/shared/PermissionLockedOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CountryPhoneInput, { phoneError } from '@/components/ui/country-phone-input';
import SearchableSelect from '@/components/ui/searchable-select';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { browserTimeZone, timeZoneOptions } from '@/lib/utils/timezones';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ApiError (handleApiError) carries the backend `detail` as its message.
const noopSubscribe = () => () => {};

// Largest original image accepted for a profile picture. (What is uploaded is the
// 256px downscaled copy; the backend separately caps that payload.)
const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

// Fallback when /auth/me sent no role_display (same labels as the header).
const ROLE_LABELS: Record<string, string> = {
  tenant_admin: 'Owner',
  admin: 'Admin',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
  billing_manager: 'Billing Manager',
  standard_user: 'Member',
};
const prettyRoleName = (role?: string) =>
  (role && ROLE_LABELS[role]) || (role ? role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '');

const errorMessage = (error: unknown, fallback: string) =>
  (error instanceof Error && error.message) || fallback;

export default function Settings() {
  const { user, logout, hasPermission, hasPermissionCode, isTenantAdmin, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // General Settings' own "Manage" action (settings:general) — not the broader
  // canManageSettings admin flag, which only decides whether links to the
  // OTHER settings sub-pages (Branding, Legal, ...) are shown below.
  const canEditSettings = isTenantAdmin || hasPermissionCode('settings:general');
  // My Profile is the user's own record — the backend lets every user update
  // it, so it is never gated on settings:general like the shared tabs are.
  const canEditCurrentTab = activeTab === 'profile' || canEditSettings;

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Profile Settings
  const emptyProfile = { full_name: '', phone: '', job_title: '', department: '', timezone: '' };
  const [profileData, setProfileData] = useState<UserProfileUpdate & { email?: string }>(emptyProfile);
  // Last values the server confirmed — drives "unsaved changes" and Discard.
  const [savedProfile, setSavedProfile] = useState(emptyProfile);
  // The picture is a draft like the other fields: it is only saved by Save Changes.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(null);
  const [isAvatarBusy, setIsAvatarBusy] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const profileFormFromApi = (profile: UserProfile) => ({
    full_name: profile.full_name || '',
    phone: profile.phone || '',
    job_title: profile.job_title || '',
    department: profile.department || '',
    timezone: profile.timezone || '',
  });
  const timeZoneChoices = useMemo(() => timeZoneOptions(), []);
  const [tzInfoOpen, setTzInfoOpen] = useState(false);
  // Browser-only value; the server render shows the generic text instead of its own zone.
  const detectedTimeZone = useSyncExternalStore(noopSubscribe, browserTimeZone, () => 'your browser time zone');
  const isAvatarDirty = avatarUrl !== savedAvatarUrl;

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

  // Theme lives in the header's Light / Dark / Auto button (saved per browser),
  // not on this page — so nothing here reads or applies it.
  const isProfileDirty = isAvatarDirty || (Object.keys(emptyProfile) as (keyof typeof emptyProfile)[])
    .some(k => (profileData[k] || '') !== savedProfile[k]);

  // Load user profile and settings on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load profile. Its own try: a profile failure must not also throw
        // away the settings below, and must be visible instead of leaving a
        // blank form that silently can't be saved.
        try {
          const profile = await userSettingsApi.getProfile();
          const form = profileFormFromApi(profile);
          setProfileData({ ...form, email: profile.email });
          setSavedProfile(form);
          setAvatarUrl(profile.avatar_url || null);
          setSavedAvatarUrl(profile.avatar_url || null);
          setProfileLoadError(null);
          // Pick up a role changed in User Management since this session loaded.
          refreshUser().catch(() => {});
        } catch (error) {
          console.error('Error loading profile:', error);
          setProfileLoadError(errorMessage(error, 'Could not load your profile'));
        }

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

  const validateProfile = (): string | null => {
    const name = (profileData.full_name || '').trim();
    if (!name) return 'Full name is required';
    if (name.length > 255) return 'Full name must be 255 characters or fewer';
    return phoneError(profileData.phone);
  };

  const handleSaveProfile = async () => {
    const problem = validateProfile();
    if (problem) {
      toast.error(problem);
      return;
    }
    setIsSaving(true);
    try {
      // Profile only — this used to also PUT every other settings tab, so a
      // failure there reported "Failed to save settings" for a profile save.
      const updated = await userSettingsApi.updateProfile({
        full_name: profileData.full_name,
        phone: profileData.phone,
        job_title: profileData.job_title,
        department: profileData.department,
        timezone: profileData.timezone,
        // "" removes the picture; sent only when it changed (it can be ~40 KB).
        ...(isAvatarDirty ? { avatar_url: avatarUrl || '' } : {}),
      });
      const form = profileFormFromApi(updated);
      setProfileData({ ...form, email: updated.email });
      setSavedProfile(form);
      setAvatarUrl(updated.avatar_url || null);
      setSavedAvatarUrl(updated.avatar_url || null);
      setSaveSuccess(true);
      toast.success('Profile updated');
      setTimeout(() => setSaveSuccess(false), 3000);
      // Header name/avatar come from /auth/me — pull the new values in.
      refreshUser().catch(() => {});
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error(errorMessage(error, 'Failed to save profile'));
    } finally {
      setIsSaving(false);
    }
  };

  // Downscale to a 256px square JPEG in the browser so the stored data URL
  // stays ~20-40 KB regardless of the original file size.
  const resizeImageToDataUrl = (file: File, size = 256): Promise<string> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Image processing is not supported in this browser'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        // Centre-crop to a square, then scale.
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('That file could not be read as an image'));
      };
      img.src = url;
    });

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Please choose a JPG or PNG image');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      toast.error(`This image is ${sizeMb} MB. Profile pictures must be 10 MB or smaller — please choose a smaller image.`);
      return;
    }
    setIsAvatarBusy(true);
    try {
      setAvatarUrl(await resizeImageToDataUrl(file)); // preview only until Save Changes
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to process image'));
    } finally {
      setIsAvatarBusy(false);
    }
  };

  const handleSave = async () => {
    if (activeTab === 'profile') {
      await handleSaveProfile();
      return;
    }
    if (!canEditSettings) {
      toast.error('You have view-only access to these settings');
      return;
    }

    setIsSaving(true);
    try {
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
      toast.error(friendlyErrorMessage(error, "Couldn't change password. Please try again."));
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

  // `visible: false` = the user lacks the permission. The tab is still rendered
  // (greyed, hover tooltip, click is a no-op) - permission-gated tabs are never
  // hidden. `visibleTabs` only drives which tab may be ACTIVE.
  // `hidden: true` removes a tab from the UI entirely (a product decision, not a
  // permission gate); its panel code is kept so it can be re-enabled.
  const tabs: { id: string; label: string; icon: typeof User; visible: boolean; hidden?: boolean; deniedMessage?: string }[] = [
    { id: 'profile', label: 'My Profile', icon: User, visible: true },
    { id: 'notifications', label: 'Notifications', icon: Bell, visible: true },
    { id: 'job-preferences', label: 'Job Preferences', icon: Briefcase, visible: canAccessJobPreferences, hidden: true, deniedMessage: 'You do not have permission to access Job Preferences' },
    { id: 'workflow', label: 'Workflow', icon: Filter, visible: canAccessWorkflow, hidden: true, deniedMessage: 'You do not have permission to access Workflow settings' },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield, visible: true },
    { id: 'appearance', label: 'Appearance', icon: Palette, visible: true, hidden: true },
    { id: 'change-password', label: 'Change Password', icon: KeyRound, visible: true, hidden: true },
  ];
  const shownTabs = tabs.filter(tab => !tab.hidden);
  const visibleTabs = shownTabs.filter(tab => tab.visible);

  // Workspace / admin settings. Each also has its own route, but here they open
  // inline in the right panel like the other tabs. `visible` mirrors the
  // route-access rules for those routes (tenant admin OR the same permission);
  // links without access are shown greyed with a hover tooltip, never hidden.
  const adminSettingsLinks: { id: string; label: string; icon: typeof User; href: string; visible: boolean; hidden?: boolean; deniedMessage: string }[] = [
    { id: 'permissions', label: 'Permissions & Roles', icon: Shield, href: '/settings/permissions', visible: isTenantAdmin || hasPermission('canViewRoles'), hidden: true, deniedMessage: 'You do not have permission to view roles and permissions' },
    { id: 'api-management', label: 'API Management', icon: Key, href: '/settings/api-management', visible: isTenantAdmin || hasPermission('canViewApiManagement'), deniedMessage: 'You do not have permission to view API management', hidden: true },
    { id: 'branding', label: 'Branding & White Label', icon: Palette, href: '/settings/branding', visible: isTenantAdmin || hasPermission('canViewBranding'), deniedMessage: 'You do not have permission to view branding settings' },
    { id: 'security', label: 'Security Settings', icon: Lock, href: '/settings/security', visible: isTenantAdmin || hasPermission('canViewSecuritySettings'), deniedMessage: 'You do not have permission to view security settings' },
    { id: 'legal', label: 'Legal & Compliance', icon: ScrollText, href: '/settings/legal', visible: isTenantAdmin || hasPermission('canManageSettings'), deniedMessage: 'You do not have permission to view legal & compliance settings' },
  ];
  const shownAdminSettingsLinks = adminSettingsLinks.filter(link => !link.hidden);
  const visibleAdminSettingsLinks = shownAdminSettingsLinks.filter(link => link.visible);
  const isAdminTab = visibleAdminSettingsLinks.some(link => link.id === activeTab);

  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab) && !visibleAdminSettingsLinks.some(link => link.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'profile');
    }
  }, [activeTab, visibleTabs, visibleAdminSettingsLinks]);

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
      <main className="tf-page">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="tf-page-sheet">
            {/* Breadcrumb */}
            <div className="mb-4 md:mb-6 flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-28" />
            </div>

            {/* Hero Header */}
            <section className="relative mb-5 overflow-hidden rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-full max-w-md" />
                </div>
              </div>
            </section>

            {/* Tabs + Content Layout */}
            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
              {/* Left Sidebar - Tabs */}
              <div className="w-full lg:w-64 flex-shrink-0">
                <div className="tf-card-soft p-2">
                  <nav className="flex lg:flex-col gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="w-full flex items-center gap-3 px-4 py-2">
                        <Skeleton className="w-5 h-5 rounded" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    ))}
                  </nav>
                  {/* Role Info */}
                  <div className="hidden lg:block mt-4 p-3 rounded-lg bg-brand-blue/5 border border-brand-blue/15 space-y-2">
                    <Skeleton className="h-2.5 w-10" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </div>

              {/* Right Content Area */}
              <div className="flex-1">
                <div className="tf-card-soft p-4 sm:p-5">
                  {/* Section heading */}
                  <div className="mb-6 space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                  </div>
                  {/* Form fields */}
                  <div className="tf-grid-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </div>
                    ))}
                  </div>
                  {/* Save row */}
                  <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200 dark:border-slate-700 flex justify-end">
                    <Skeleton className="h-9 w-32 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings' }]} />

      {/* Header panel — design-flow gray header (icon tile + title + subtitle) */}
      <div className="mb-4 sm:mb-6 flex flex-col gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <SlidersHorizontal className="h-5 w-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="tf-page-title">Profile Settings</h1>
            <p className="mt-0.5 tf-body-secondary">Manage your personal preferences, notifications, and workflow defaults.</p>
          </div>
        </div>
      </div>

      {/* Tabs + Content Layout — sits directly in the page panel (no extra framed box: that
          was a double frame pushing content to 28/44px instead of the 16/32 panel inset) */}
      <div>
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Left Sidebar - Tabs */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <div className="tf-card-soft p-2 lg:sticky lg:top-8">
            <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
              {shownTabs.map((tab) => {
                const Icon = tab.icon;
                const locked = !tab.visible;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { if (!locked) setActiveTab(tab.id); }}
                    aria-disabled={locked}
                    title={locked ? (tab.deniedMessage || PERMISSION_DENIED_MESSAGE) : undefined}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 lg:flex-shrink ${
                      locked
                        ? 'text-gray-400 cursor-not-allowed opacity-60'
                        : activeTab === tab.id
                        ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}

              {/* Workspace & admin settings — open inline in the right panel */}
              {shownAdminSettingsLinks.length > 0 && (
                <>
                  <div className="hidden lg:block my-1.5 border-t border-gray-100 dark:border-slate-700/60" />
                  <span className="hidden lg:block px-4 pb-1 text-2xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-[0.1em]">
                    Workspace &amp; Admin
                  </span>
                  {shownAdminSettingsLinks.map((link) => {
                    const Icon = link.icon;
                    const locked = !link.visible;
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => { if (!locked) setActiveTab(link.id); }}
                        aria-disabled={locked}
                        title={locked ? link.deniedMessage : undefined}
                        aria-current={activeTab === link.id ? 'page' : undefined}
                        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 lg:flex-shrink ${
                          locked
                            ? 'text-gray-400 cursor-not-allowed opacity-60'
                            : activeTab === link.id
                            ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                            : 'text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:text-brand-blue'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{link.label}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </nav>

            {/* Role Info — hidden on request; drop `hidden` and restore `lg:block` to bring it back. */}
            <div className="hidden mt-4 p-3 rounded-lg bg-brand-blue/5 border border-brand-blue/15 ring-1 ring-brand-blue/5">
              <div className="text-2xs font-semibold text-brand-blue uppercase tracking-wider mb-1">Role</div>
              <div className="tf-row-title">{user?.role || 'Recruiter'}</div>
              <div className="tf-meta mt-1">Access Level: {(user?.role as string) === 'admin' || user?.role === 'tenant_admin' ? 'Admin' : 'Standard'}</div>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1">
          <div className="tf-card-soft p-4 sm:p-5">
            {!canEditCurrentTab && activeTab !== 'change-password' && !isAdminTab && (
              <div className="mb-6 rounded-lg ring-1 ring-brand-orange/20 bg-brand-orange/5 px-4 py-3 text-sm text-brand-orange-deep">
                View-only access. You can review these settings, but you do not have permission to edit them.
              </div>
            )}

            {/* Workspace & admin pages, embedded — strips each page's own breadcrumb,
                outer padding and card wrapper (main → div.mx-auto → div.bg-white)
                so it sits flush inside this panel. Modals (div.fixed) are untouched. */}
            {isAdminTab && (
              <section
                className="
                  [&_[data-slot=breadcrumb]]:hidden
                  [&>main]:flex-none
                  [&>main]:overflow-visible
                  [&>main]:bg-transparent
                  [&>main>div:not(.fixed)]:max-w-none
                  [&>main>div:not(.fixed)]:!px-0
                  [&>main>div:not(.fixed)]:!mx-0
                  [&>main>div:not(.fixed)>div]:!bg-transparent
                  [&>main>div:not(.fixed)>div]:!rounded-none
                  [&>main>div:not(.fixed)>div]:!shadow-none
                  [&>main>div:not(.fixed)>div]:!ring-0
                  [&>main>div:not(.fixed)>div]:!border-0
                  [&>main>div:not(.fixed)>div]:!p-0
                  [&>main>div:not(.fixed)>div]:!my-0"
              >
                {activeTab === 'permissions' && <PermissionsPage />}
                {activeTab === 'api-management' && <ApiManagementPage />}
                {activeTab === 'branding' && <BrandingPage />}
                {activeTab === 'security' && <SecurityPage />}
                {activeTab === 'legal' && <LegalCompliancePage />}
              </section>
            )}

            {/* Profile Settings */}
            {activeTab === 'profile' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="tf-section-title mb-1">My Profile</h2>
                    <p className="tf-body-secondary">Update your personal information and recruiter profile</p>
                  </div>
                </div>

                {profileLoadError && (
                  <div className="mb-6 rounded-lg ring-1 ring-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
                    <span>Couldn&apos;t load your profile: {profileLoadError}</span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => window.location.reload()}>
                      Retry
                    </Button>
                  </div>
                )}

                <fieldset disabled={!!profileLoadError}>
                  {/* Profile Picture */}
                  <div className="mb-8 pb-8 border-b border-gray-200 dark:border-slate-700">
                    <Label className="mb-3">Profile Picture</Label>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Profile picture"
                          className="w-20 h-20 rounded-full object-cover shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/10 ring-1 ring-brand-blue/15 text-2xl flex-shrink-0">
                          {profileData.full_name?.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                        </div>
                      )}
                      <div className="text-center sm:text-left">
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={handleAvatarSelected}
                        />
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={isAvatarBusy}
                            onClick={() => avatarInputRef.current?.click()}
                            icon={isAvatarBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
                          >
                            {avatarUrl ? 'Edit Profile' : 'Upload Now'}
                          </Button>
                          {avatarUrl && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={isAvatarBusy}
                              onClick={() => setAvatarUrl(null)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        <p className="tf-meta mt-2">JPG, PNG</p>
                      </div>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="space-y-6">
                    <div className="tf-grid-2">
                      <div>
                        <Label className="mb-1.5">Full Name <span className="text-red-500">*</span></Label>
                        <Input
                          type="text"
                          value={profileData.full_name || ''}
                          maxLength={255}
                          placeholder="Your full name"
                          onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="mb-1.5">Email Address</Label>
                        <Input
                          type="email"
                          value={profileData.email || ''}
                          disabled
                        />
                        <p className="tf-meta mt-1">Email cannot be changed</p>
                      </div>
                    </div>

                    <div>
                      <div className="tf-grid-2">
                        <div>
                          <Label className="mb-1.5">Phone Number</Label>
                          <CountryPhoneInput
                            value={profileData.phone || ''}
                            onChange={(phone) => setProfileData({ ...profileData, phone })}
                          />
                        </div>
                        <div>
                          {/* The role assigned in User Management — read-only here, and
                              refreshed from /auth/me so an edit there shows up. */}
                          <Label className="mb-1.5">Role</Label>
                          <div className="relative">
                            <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500 z-10 pointer-events-none" />
                            <Input
                              type="text"
                              value={user?.roleDisplay || prettyRoleName(user?.role)}
                              disabled
                              className="pl-10"
                            />
                          </div>
                          <p className="tf-meta mt-1">Assigned in User Management</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      {/* Hovering the ⓘ beside the label shows the explainer. Keep it truthful: today the
                          saved zone is NOT applied to displays — lib/utils/dateUtils.ts formats
                          every date in Asia/Kolkata and the backend stores IST (app/utils/tz.py).
                          Update this text if that changes. */}
                      <HoverCard open={tzInfoOpen} onOpenChange={setTzInfoOpen} openDelay={100} closeDelay={150}>
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Label>Time Zone</Label>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            aria-label="How does the time zone work?"
                            // Hover/focus opens it; a tap toggles it on touch screens (no hover there).
                            onClick={() => setTzInfoOpen(open => !open)}
                            className="rounded-full p-0.5 text-gray-400 hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-slate-500"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </HoverCardTrigger>
                      </div>
                      <SearchableSelect
                        value={profileData.timezone || ''}
                        onChange={(timezone) => setProfileData({ ...profileData, timezone })}
                        options={timeZoneChoices}
                        allLabel={`Auto-detect (${detectedTimeZone.replace(/_/g, ' ')})`}
                        placeholder={`Auto-detect (${detectedTimeZone.replace(/_/g, ' ')})`}
                        searchPlaceholder="Search city or zone…"
                        emptyMessage="No matching time zone"
                        ariaLabel="Time zone"
                        className="w-full"
                      />

                      <HoverCardContent align="start" collisionPadding={8} className="w-[26rem] max-w-[calc(100vw-1rem)] max-h-[var(--radix-hover-card-content-available-height)] overflow-y-auto space-y-3 tf-body-secondary">
                          <h3 className="tf-row-title">How does the time zone work?</h3>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">What this setting is</h4>
                            <p>
                              Your time zone tells TalentFlow where you work, so your account knows your local time.
                              It is saved to your profile, so it follows you to every device you sign in on.
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Auto-detect or pick one</h4>
                            <ul className="list-disc pl-5 space-y-1">
                              <li><span className="font-medium text-gray-900 dark:text-slate-50">Auto-detect</span> uses the time zone your computer or phone is set to (right now: {detectedTimeZone.replace(/_/g, ' ')}). If you travel and your device changes zone, this follows it.</li>
                              <li><span className="font-medium text-gray-900 dark:text-slate-50">Pick a zone</span> if you want a fixed one — for example, you work Indian hours while abroad. Search by city (&ldquo;Kolkata&rdquo;, &ldquo;Dubai&rdquo;) or by name (&ldquo;India Standard Time&rdquo;).</li>
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Reading the list</h4>
                            <p>
                              Each zone shows its current difference from UTC, e.g. <span className="font-medium text-gray-900 dark:text-slate-50">(UTC+05:30) Asia/Kolkata</span>.
                              Zones with daylight saving time (such as London or New York) move by an hour during the year; the list always shows the offset in effect today.
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">How dates and times are shown today</h4>
                            <p>
                              For now, TalentFlow shows dates and times across the app — activity and audit logs, tickets, invites, results and
                              reports — in <span className="font-medium text-gray-900 dark:text-slate-50">India Standard Time (IST, UTC+05:30)</span> for everyone,
                              whatever zone is selected here. Keep this in mind if you work in another zone: a time shown as 6:00 PM is 6:00 PM IST.
                            </p>
                          </div>
                          <div className="flex items-start gap-2 rounded-lg border border-brand-blue/20 bg-brand-blue/5 p-2.5">
                            <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                            <p>
                              Your selection is saved now so that, as time-zone support rolls out to dates, scheduling and reminders,
                              they can use your zone without you having to set it again.
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Changing it</h4>
                            <p>Choose a zone (or Auto-detect) and click <span className="font-medium text-gray-900 dark:text-slate-50">Save Changes</span>. Nothing changes until you save.</p>
                          </div>
                      </HoverCardContent>
                      </HoverCard>
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
                    <h2 className="tf-section-title mb-1">Notification Settings</h2>
                    <p className="tf-body-secondary">Choose how you want to be notified about recruitment activities</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  <div className="space-y-6">
                    {/* Email Notifications */}
                    <div>
                      <h3 className="tf-section-title mb-4 flex items-center gap-2">
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
                          <div key={item.key} className="flex items-start justify-between p-4 tf-card-muted">
                            <div className="flex-1">
                              <div className="tf-row-title mb-1">{item.label}</div>
                              <div className="tf-meta">{item.desc}</div>
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
                      <h3 className="tf-section-title mb-4 flex items-center gap-2">
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
                          <div key={item.key} className="flex items-start justify-between p-4 tf-card-muted">
                            <div className="flex-1">
                              <div className="tf-row-title mb-1">{item.label}</div>
                              <div className="tf-meta">{item.desc}</div>
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
                      <h3 className="tf-section-title mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-brand-blue" />
                        Digest & Reports
                      </h3>
                      <div className="space-y-3">
                        {[
                          { key: 'weekly_digest', label: 'Weekly activity digest', desc: 'Summary of weekly recruitment activity' },
                          { key: 'monthly_report', label: 'Monthly performance report', desc: 'Detailed monthly analytics and insights' },
                        ].map((item) => (
                          <div key={item.key} className="flex items-start justify-between p-4 tf-card-muted">
                            <div className="flex-1">
                              <div className="tf-row-title mb-1">{item.label}</div>
                              <div className="tf-meta">{item.desc}</div>
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
                    <h2 className="tf-section-title mb-1">Job Posting Preferences</h2>
                    <p className="tf-body-secondary">Set default values for new job postings</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  <div className="space-y-6">
                    <div className="p-4 bg-brand-blue/5 ring-1 ring-brand-blue/15 border border-brand-blue/15 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Target className="w-5 h-5 text-brand-blue mt-0.5" />
                        <div>
                          <div className="text-sm font-semibold text-brand-blue mb-1">Quick Tip</div>
                          <div className="tf-body">These settings will be pre-filled when you create a new job posting, saving you time.</div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="mb-1.5">Default Job Type</Label>
                      <Select
                        value={settings.default_job_type || 'Full-time'}
                        onValueChange={(value) => setSettings({ ...settings, default_job_type: value })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Full-time">Full-time</SelectItem>
                          <SelectItem value="Part-time">Part-time</SelectItem>
                          <SelectItem value="Contract">Contract</SelectItem>
                          <SelectItem value="Internship">Internship</SelectItem>
                          <SelectItem value="Temporary">Temporary</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-1.5">Default Location</Label>
                      <Select
                        value={settings.default_location || 'Remote'}
                        onValueChange={(value) => setSettings({ ...settings, default_location: value })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Remote">Remote</SelectItem>
                          <SelectItem value="Hybrid">Hybrid</SelectItem>
                          <SelectItem value="On-site">On-site</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-1.5">Default Job Expiry (Days)</Label>
                      <Input
                        type="number"
                        value={settings.default_expiry_days || 30}
                        onChange={(e) => setSettings({ ...settings, default_expiry_days: parseInt(e.target.value) || 30 })}
                        min="1"
                        max="90"
                      />
                      <p className="tf-meta mt-1">Job postings will automatically expire after this many days</p>
                    </div>

                    <div className="space-y-3">
                      {[
                        { key: 'auto_save_jd', label: 'Auto-save job drafts', desc: 'Automatically save your progress when creating jobs' },
                        { key: 'require_assessment', label: 'Require assessment by default', desc: 'Automatically require candidates to complete an assessment' },
                        { key: 'auto_publish', label: 'Auto-publish jobs', desc: 'Automatically publish jobs after creation (skip draft)' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-start justify-between p-4 tf-card-muted">
                          <div className="flex-1">
                            <div className="tf-row-title mb-1">{item.label}</div>
                            <div className="tf-meta">{item.desc}</div>
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
                    <h2 className="tf-section-title mb-1">Workflow Preferences</h2>
                    <p className="tf-body-secondary">Customize how you interact with the platform</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  <div className="space-y-6">
                    <div>
                      <h3 className="tf-section-title mb-4">Resume Management</h3>
                      <div className="space-y-3">
                        {[
                          { key: 'auto_screen_resumes', label: 'AI-powered auto-screening', desc: 'Automatically screen and rank resumes using AI' },
                          { key: 'ai_assistance', label: 'AI assistance suggestions', desc: 'Get AI-powered suggestions while reviewing candidates' },
                          { key: 'bulk_action_confirmation', label: 'Confirm bulk actions', desc: 'Show confirmation dialog for bulk operations' },
                          { key: 'show_advanced_filters', label: 'Show advanced filters by default', desc: 'Display advanced filter options when searching resumes' },
                        ].map((item) => (
                          <div key={item.key} className="flex items-start justify-between p-4 tf-card-muted">
                            <div className="flex-1">
                              <div className="tf-row-title mb-1">{item.label}</div>
                              <div className="tf-meta">{item.desc}</div>
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
                      <h3 className="tf-section-title mb-4">Default Sort Order</h3>
                      <Select
                        value={settings.default_sort_order || 'latest'}
                        onValueChange={(value) => setSettings({ ...settings, default_sort_order: value })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="latest">Latest First</SelectItem>
                          <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                          <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                          <SelectItem value="experience-high">Experience (High to Low)</SelectItem>
                          <SelectItem value="experience-low">Experience (Low to High)</SelectItem>
                          <SelectItem value="lastUpdated">Last Updated</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <h2 className="tf-section-title mb-1">Privacy & Security</h2>
                    <p className="tf-body-secondary">Manage your privacy settings and account security</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                  <div className="space-y-6">
                    {/* Privacy Settings */}
                    <div>
                      <h3 className="tf-section-title mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-brand-blue" />
                        Privacy Settings
                      </h3>
                      <div className="space-y-4">
                        <div className="p-4 tf-card-muted">
                          <Label className="mb-1.5">Profile Visibility</Label>
                          <Select
                            value={settings.profile_visibility || 'team'}
                            onValueChange={(value) => setSettings({ ...settings, profile_visibility: value })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="team">Team Only - Visible to team members</SelectItem>
                              <SelectItem value="private">Private - Only visible to me</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="tf-meta mt-2">Controls who can see your recruiter profile</p>
                        </div>

                        {[
                          { key: 'show_email', label: 'Show email in profile', desc: 'Display your email address on your profile' },
                          { key: 'show_phone', label: 'Show phone number', desc: 'Display your phone number on your profile' },
                          { key: 'show_activity_status', label: 'Show activity status', desc: "Let team members see when you're online" },
                        ].map((item) => (
                          <div key={item.key} className="flex items-start justify-between p-4 tf-card-muted">
                            <div className="flex-1">
                              <div className="tf-row-title mb-1">{item.label}</div>
                              <div className="tf-meta">{item.desc}</div>
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
                    <h3 className="tf-section-title mb-4 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-destructive" />
                      Security Settings
                    </h3>
                    <p className="tf-body-secondary mb-4">
                      For advanced security settings including password change, 2FA, and session management,
                      please visit the{' '}
                      {visibleAdminSettingsLinks.some(link => link.id === 'security') ? (
                        <button type="button" onClick={() => setActiveTab('security')} className="text-brand-blue hover:text-brand-blue-2 hover:underline font-semibold">Security Settings</button>
                      ) : (
                        <a href="/settings/security" className="text-brand-blue hover:text-brand-blue-2 hover:underline font-semibold">Security Settings</a>
                      )}{' '}
                      page.
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
                    <h2 className="tf-section-title mb-1">Appearance Settings</h2>
                    <p className="tf-body-secondary">Customize how TalentFlow looks and feels</p>
                  </div>
                </div>

                <fieldset disabled={!canEditSettings} className={!canEditSettings ? 'opacity-60' : ''}>
                <div className="space-y-6">
                  {/* Language */}
                  <div>
                    <Label className="mb-1.5">Language</Label>
                    <Select
                      value={settings.language || 'en'}
                      onValueChange={(value) => setSettings({ ...settings, language: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English (US)</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="ja">日本語</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Format */}
                  <div>
                    <Label className="mb-1.5">Date Format</Label>
                    <Select
                      value={settings.date_format || 'MM/DD/YYYY'}
                      onValueChange={(value) => setSettings({ ...settings, date_format: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Time Format */}
                  <div>
                    <Label className="mb-1.5">Time Format</Label>
                    <Select
                      value={settings.time_format || '12h'}
                      onValueChange={(value) => setSettings({ ...settings, time_format: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12h">12-hour (3:30 PM)</SelectItem>
                        <SelectItem value="24h">24-hour (15:30)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Default Landing Page */}
                  <div>
                    <Label className="mb-1.5">Default Landing Page</Label>
                    <Select
                      value={settings.default_view || 'dashboard'}
                      onValueChange={(value) => setSettings({ ...settings, default_view: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dashboard">Dashboard</SelectItem>
                        <SelectItem value="jobs">Jobs Listing</SelectItem>
                        <SelectItem value="my-resumes">My Resumes</SelectItem>
                        <SelectItem value="internal-db">Shared Database</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="tf-meta mt-1">The page you'll see first when you log in</p>
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
                    <h2 className="tf-section-title mb-1">Change Password</h2>
                    <p className="tf-body-secondary">Update your password. You will be logged out after changing it.</p>
                  </div>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
                  {/* Current Password */}
                  <div>
                    <Label className="mb-1.5">Current Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500 z-10 pointer-events-none" />
                      <Input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        className="pl-10 pr-10"
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-brand-blue"
                      >
                        {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <Label className="mb-1.5">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500 z-10 pointer-events-none" />
                      <Input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="pl-10 pr-10"
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
                      <p className="text-xs text-destructive mt-1">Password must be at least 6 characters</p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <Label className="mb-1.5">Confirm New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500 z-10 pointer-events-none" />
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="pl-10 pr-10"
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
                      <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                    )}
                    {confirmPassword.length > 0 && newPassword === confirmPassword && newPassword.length >= 6 && (
                      <p className="text-xs text-brand-cyan mt-1 flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Passwords match
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      isChangingPassword ||
                      !currentPassword ||
                      newPassword.length < 6 ||
                      newPassword !== confirmPassword
                    }
                    className="w-full sm:w-auto"
                    icon={isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  >
                    {isChangingPassword ? 'Changing...' : 'Change Password'}
                  </Button>
                </form>
              </div>
            )}

            {/* Save Button — hidden on change-password tab; greyed (never
                hidden) when the user lacks settings:general. */}
            {activeTab !== 'change-password' && !isAdminTab && (
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200 dark:border-slate-700 flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
              <div className="tf-body-secondary">
                {saveSuccess ? (
                  <div className="flex items-center gap-2 text-brand-cyan font-semibold">
                    <Check className="w-4 h-4" />
                    Settings saved successfully!
                  </div>
                ) : activeTab === 'profile' && isProfileDirty ? (
                  <span className="text-brand-orange-deep">You have unsaved changes</span>
                ) : null}
              </div>
              <div className="flex w-full sm:w-auto flex-col-reverse sm:flex-row gap-2">
                {activeTab === 'profile' && isProfileDirty && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSaving}
                    onClick={() => {
                      setProfileData(prev => ({ ...savedProfile, email: prev.email }));
                      setAvatarUrl(savedAvatarUrl);
                    }}
                    className="w-full sm:w-auto"
                  >
                    Discard
                  </Button>
                )}
                <span
                  className={`w-full sm:w-auto ${!canEditCurrentTab ? 'cursor-not-allowed' : ''}`}
                  title={!canEditCurrentTab ? 'You do not have permission to edit settings' : undefined}
                >
                  <Button
                    onClick={() => { if (canEditCurrentTab) handleSave(); }}
                    disabled={isSaving || !canEditCurrentTab || (activeTab === 'profile' && (!isProfileDirty || !!profileLoadError))}
                    aria-disabled={!canEditCurrentTab}
                    variant="primary"
                    className={`w-full sm:w-auto ${!canEditCurrentTab ? 'opacity-60 pointer-events-none' : ''}`}
                    icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </span>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
      </div>
      </div>
      </div>
    </main>
  );
}
