'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Lock, Shield, Smartphone, Clock, MapPin, Save, Check, Loader2, X, AlertTriangle, Eye, EyeOff, CheckCircle, KeyRound, Sparkles, Info } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { useRouter } from 'next/navigation';
import { userSettingsApi, sessionsApi, Session, UserSettings } from '@/lib/services/settingsService';
import { clearTokens } from '@/lib/services/api';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';
import FilterSelect from '@/components/ui/filter-select';

// Neutral-gray skeleton that mirrors the Security page: password form card,
// 2FA card, session-timeout card and active-sessions list.
function SecuritySkeleton() {
  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          {/* Breadcrumb */}
          <Skeleton className="h-4 w-64 mb-4 md:mb-6" />

          {/* Hero */}
          <section className="mb-4 sm:mb-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
            </div>
          </section>

          {/* Password card */}
          <div className="tf-panel p-4 sm:p-6 mb-4 sm:mb-6">
            <Skeleton className="h-5 w-24 mb-4" />
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ))}
              <Skeleton className="h-9 w-40 rounded-xl" />
            </div>
          </div>

          {/* Two-Factor Authentication card */}
          <div className="tf-panel p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          </div>

          {/* Session Timeout card */}
          <div className="tf-panel p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>

          {/* Active Sessions card */}
          <div className="tf-panel p-4 sm:p-6">
            <Skeleton className="h-5 w-36 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 p-3 md:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Password strength validation
const getPasswordStrength = (password: string) => {
  let strength = 0;
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password),
  };

  Object.values(checks).forEach(check => {
    if (check) strength++;
  });

  return { strength, checks };
};

export default function SecurityPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('canManageSecuritySettings');
  const [isLoading, setIsLoading] = useState(true);
  // Scroll-only: forms + sessions list + transient dialogs; no filters/tabs/pagination.
  const rootRef = useScrollRestoration<HTMLElement>('settings-security', !isLoading);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<Partial<UserSettings>>({
    two_factor_enabled: false,
    session_timeout_minutes: 1440,
  });

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password strength validation (live feedback)
  const { strength: passwordStrength, checks: passwordChecks } = useMemo(
    () => getPasswordStrength(passwordForm.newPassword),
    [passwordForm.newPassword]
  );
  const passwordsMatch = passwordForm.newPassword && passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword;

  // 2FA state
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFAInfoOpen, setTwoFAInfoOpen] = useState(false);
  const [timeoutInfoOpen, setTimeoutInfoOpen] = useState(false);
  const [ssoInfoOpen, setSsoInfoOpen] = useState(false);
  const [sessionsInfoOpen, setSessionsInfoOpen] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAQRCode, setTwoFAQRCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showDisable2FADialog, setShowDisable2FADialog] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState('');

  // Session timeout state
  const [isSavingTimeout, setIsSavingTimeout] = useState(false);

  // Session revoke state
  const [isRevokingSession, setIsRevokingSession] = useState(false);
  const [showRevokeAllDialog, setShowRevokeAllDialog] = useState(false);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load sessions
        const sessionsData = await sessionsApi.list();
        setSessions(sessionsData.sessions || []);

        // Load settings
        const settingsData = await userSettingsApi.getSettings();
        setSettings({
          two_factor_enabled: settingsData.two_factor_enabled,
          session_timeout_minutes: settingsData.session_timeout_minutes,
        });
      } catch (error) {
        console.error('Error loading security data:', error);
        toast.error('Failed to load security settings');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    // Validate password strength
    const { strength, checks } = getPasswordStrength(passwordForm.newPassword);
    if (strength < 3) {
      toast.error('Password is too weak. Please meet at least 3 requirements.');
      return;
    }

    if (!checks.length) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      await userSettingsApi.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );
      toast.success('Password changed successfully. Please login with your new password.');

      // Clear tokens and redirect to login
      clearTokens();
      localStorage.removeItem('user');
      sessionStorage.clear();

      // Short delay to show toast before redirect
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't change password. Please try again."));
      setIsChangingPassword(false);
    }
  };

  const handleEnable2FA = async () => {
    setIs2FALoading(true);
    try {
      const response = await userSettingsApi.enable2FA();
      setTwoFASecret(response.secret || '');
      // Server-rendered PNG. The otpauth:// URI carries the shared secret, so it
      // is never handed to an external image service — if the server could not
      // render, the setup card falls back to the manual key below.
      setTwoFAQRCode(response.qr_code_image || '');
      setShow2FASetup(true);
    } catch (error: any) {
      console.error('Error enabling 2FA:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't enable 2FA. Please try again."));
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    setIs2FALoading(true);
    try {
      await userSettingsApi.verify2FA(verificationCode);
      setSettings({ ...settings, two_factor_enabled: true });
      setShow2FASetup(false);
      setVerificationCode('');
      toast.success('Two-factor authentication enabled');
    } catch (error: any) {
      console.error('Error verifying 2FA:', error);
      toast.error(friendlyErrorMessage(error, "Invalid verification code. Please try again."));
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleDisable2FA = () => {
    // Show dialog to enter OTP code
    setDisable2FACode('');
    setShowDisable2FADialog(true);
  };

  const confirmDisable2FA = async () => {
    if (!disable2FACode || disable2FACode.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    setIs2FALoading(true);
    try {
      await userSettingsApi.disable2FA(disable2FACode);
      setSettings({ ...settings, two_factor_enabled: false });
      setShowDisable2FADialog(false);
      setDisable2FACode('');
      toast.success('Two-factor authentication disabled');
    } catch (error: any) {
      console.error('Error disabling 2FA:', error);
      toast.error(friendlyErrorMessage(error, "Invalid verification code. Please try again."));
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleSessionTimeoutChange = async (value: string) => {
    const minutes = parseInt(value);
    setSettings({ ...settings, session_timeout_minutes: minutes });

    setIsSavingTimeout(true);
    try {
      await userSettingsApi.updateSettings({ session_timeout_minutes: minutes });
      toast.success('Session timeout updated');
    } catch (error) {
      console.error('Error updating session timeout:', error);
      toast.error('Failed to update session timeout');
    } finally {
      setIsSavingTimeout(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await sessionsApi.revoke(sessionId);
      setSessions(sessions.filter(s => s.id !== sessionId));
      toast.success('Session revoked');
    } catch (error) {
      console.error('Error revoking session:', error);
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeAllOtherSessions = () => {
    setShowRevokeAllDialog(true);
  };

  const confirmRevokeAllOtherSessions = async () => {
    setIsRevokingSession(true);
    try {
      await sessionsApi.revokeOthers();
      setSessions(sessions.filter(s => s.is_current));
      setShowRevokeAllDialog(false);
      toast.success('All other sessions revoked');
    } catch (error) {
      console.error('Error revoking sessions:', error);
      toast.error('Failed to revoke sessions');
    } finally {
      setIsRevokingSession(false);
    }
  };

  const formatLastActive = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  if (isLoading) {
    return <SecuritySkeleton />;
  }

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings', href: '/settings/general-settings' }, { label: 'Security Settings' }]} />

        {/* SaaS Hero Header */}
        <section className="relative mb-4 sm:mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-4 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="tf-badge mb-2 gap-1.5 bg-white/10 text-2xs text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3 w-3 text-brand-orange" />
                Account protection
              </div>
              <h1 className="tf-page-title">Security Settings</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/80">Manage password, two-factor auth, sessions, and trust controls.</p>
            </div>
          </div>
        </section>

        {/* Password Section */}
        <div className="tf-card-soft p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden">
          <h2 className="tf-section-title mb-4">Password</h2>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block tf-label mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="Enter current password"
                  autoComplete="new-password"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  className="tf-input pr-9 sm:pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-gray-600"
                >
                  {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block tf-label mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  className={`w-full px-3 h-9 pr-9 sm:pr-10 border rounded-lg focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue focus:outline-none transition-colors text-black text-sm ${
                    passwordForm.newPassword
                      ? passwordStrength === 5
                        ? 'border-success'
                        : passwordStrength >= 3
                        ? 'border-warning'
                        : 'border-destructive'
                      : 'border-gray-300 dark:border-slate-700'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block tf-label mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  className={`w-full px-3 h-9 pr-9 sm:pr-10 border rounded-lg focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue focus:outline-none transition-colors text-black text-sm ${
                    passwordForm.confirmPassword
                      ? passwordsMatch
                        ? 'border-success'
                        : 'border-destructive'
                      : 'border-gray-300 dark:border-slate-700'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>

            {/* Password Requirements - Live Validation */}
            {(passwordForm.newPassword || passwordForm.confirmPassword) && (
              <div className="p-2.5 sm:p-3 md:p-4 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
                <p className="tf-row-title mb-2 sm:mb-3">Password Requirements:</p>
                <div className="tf-grid-2">
                  {[
                    { label: 'At least 8 characters', check: passwordChecks.length },
                    { label: 'One uppercase letter', check: passwordChecks.uppercase },
                    { label: 'One lowercase letter', check: passwordChecks.lowercase },
                    { label: 'One number', check: passwordChecks.number },
                    { label: 'One special character', check: passwordChecks.special },
                    { label: 'Passwords match', check: passwordsMatch },
                  ].map((req, i) => (
                    <div key={i} className="flex items-center gap-1.5 sm:gap-2">
                      <CheckCircle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 transition-colors ${req.check ? 'text-success' : 'text-gray-300 dark:text-slate-500'}`} />
                      <span className={`text-sm transition-colors ${req.check ? 'text-success' : 'text-gray-500 dark:text-slate-500'}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Strength Bar */}
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="tf-meta">Password Strength</span>
                    <span className={`text-xs font-semibold ${
                      passwordStrength <= 2 ? 'text-destructive' : passwordStrength <= 3 ? 'text-warning' : passwordStrength <= 4 ? 'text-blue-500' : 'text-success'
                    }`}>
                      {passwordStrength === 0 ? 'Too Weak' : passwordStrength <= 2 ? 'Weak' : passwordStrength <= 3 ? 'Fair' : passwordStrength <= 4 ? 'Good' : 'Strong'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength <= 2 ? 'bg-destructive' : passwordStrength <= 3 ? 'bg-warning' : passwordStrength <= 4 ? 'bg-blue-500' : 'bg-success'
                      }`}
                      style={{ width: `${(passwordStrength / 5) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <Button
              variant="primary"
              onClick={() => {
                if (!canManage) return;
                handleChangePassword();
              }}
              disabled={Boolean(isChangingPassword || (passwordForm.newPassword && passwordStrength < 3) || !canManage)}
              title={!canManage ? 'You do not have permission to change the password' : ''}
              className="text-sm w-full sm:w-auto justify-center sm:justify-start"
            >
              {isChangingPassword ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : passwordChanged ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {passwordChanged ? 'Password Updated!' : isChangingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="tf-card-soft p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 bg-success-subtle rounded-lg flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-5 h-5 text-success" />
              </div>
              <div className="min-w-0">
                {/* Hovering the ⓘ shows the guide (same pattern as My Profile → Time Zone).
                    Hover/focus opens it; a tap toggles it on touch screens. */}
                <HoverCard open={twoFAInfoOpen} onOpenChange={setTwoFAInfoOpen} openDelay={100} closeDelay={150}>
                  <div className="flex items-center gap-1.5">
                    <h2 className="tf-section-title">Two-Factor Authentication</h2>
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        aria-label="How does two-factor authentication work?"
                        onClick={() => setTwoFAInfoOpen(open => !open)}
                        className="rounded-full p-0.5 text-gray-400 hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-slate-500"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </HoverCardTrigger>
                  </div>
                  <HoverCardContent
                    align="start"
                    collisionPadding={8}
                    className="w-[26rem] max-w-[calc(100vw-1rem)] max-h-[var(--radix-hover-card-content-available-height)] overflow-y-auto space-y-4 tf-body-secondary"
                  >
                    <h3 className="tf-row-title">How does two-factor authentication work?</h3>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">What it is</h4>
                      <p>
                        After your password, you also enter a 6-digit code from an authenticator app on your phone.
                        The code changes every 30 seconds, so even if someone learns your password they can&apos;t sign in without your phone.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">How to turn it on</h4>
                      <ol className="list-decimal pl-5 space-y-1">
                        <li>Install an authenticator app, such as Google Authenticator, Microsoft Authenticator or Authy.</li>
                        <li>Switch on the toggle on the right.</li>
                        <li>Scan the QR code with the app, or type in the secret key shown below it.</li>
                        <li>Enter the 6-digit code the app shows, then click <span className="font-medium text-gray-900 dark:text-slate-50">Verify and Enable</span>.</li>
                      </ol>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Signing in afterwards</h4>
                      <p>Enter your email and password as usual, then the current 6-digit code from the app.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Turning it off</h4>
                      <p>Switch the toggle off and confirm with a current code from the app.</p>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-subtle p-2.5 sm:p-3">
                      <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                      <ul className="space-y-1 text-warning-strong">
                        <li>There are no backup codes — if you lose access to the app, you can be locked out. Before changing phones, turn 2FA off and set it up again on the new phone.</li>
                        <li>Each code is valid only for the time shown in the app (about 30 seconds). Once that time runs out the code expires, and an expired code will not be accepted — enter the new code the app shows instead.</li>
                        <li>Codes depend on the time, so keep your phone&apos;s clock set automatically. If a code is rejected, wait for the next one.</li>
                      </ul>
                    </div>
                  </HoverCardContent>
                </HoverCard>
                <p className="tf-body-muted">Add an extra layer of security</p>
              </div>
            </div>
            {!show2FASetup && (
              <button
                onClick={() => {
                  if (!canManage) return;
                  (settings.two_factor_enabled ? handleDisable2FA : handleEnable2FA)();
                }}
                disabled={is2FALoading || !canManage}
                title={!canManage ? 'You do not have permission to manage security settings' : ''}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.two_factor_enabled ? 'bg-success' : 'bg-gray-300'
                } ${(is2FALoading || !canManage) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                    settings.two_factor_enabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            )}
          </div>

          {settings.two_factor_enabled && !show2FASetup && (
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-success-subtle rounded-lg">
              <p className="text-sm text-success">
                Two-factor authentication is enabled. You'll need to enter a code from your authenticator app when signing in.
              </p>
            </div>
          )}

          {/* 2FA Setup Modal */}
          {show2FASetup && (
            <div className="mt-2 sm:mt-3 md:mt-4 p-4 sm:p-6 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="tf-row-name">Setup Two-Factor Authentication</h3>
                <button
                  onClick={() => setShow2FASetup(false)}
                  className="p-1 hover:bg-gray-200 rounded"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div>
                  <p className="tf-body-secondary mb-2 sm:mb-3">
                    1. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                  {twoFAQRCode ? (
                    <div className="flex justify-center p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI, nothing for the image optimizer to fetch */}
                      <img
                        src={twoFAQRCode}
                        alt="2FA QR Code"
                        className="w-36 h-36 sm:w-48 sm:h-48"
                      />
                    </div>
                  ) : (
                    <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-lg border tf-body-secondary">
                      QR code unavailable. Enter the setup key below into your authenticator app instead.
                    </div>
                  )}
                </div>

                <div>
                  <p className="tf-body-secondary mb-2">
                    Or manually enter this secret key:
                  </p>
                  <code className="block p-2 sm:p-3 bg-gray-800 text-green-400 rounded-lg font-mono text-sm break-all">
                    {twoFASecret}
                  </code>
                </div>

                <div>
                  <p className="tf-body-secondary mb-2">
                    2. Enter the 6-digit code from your authenticator app:
                  </p>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-3 h-9 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue focus:outline-none text-center text-lg sm:text-xl md:text-2xl tracking-widest text-black"
                    maxLength={6}
                  />
                </div>

                <Button
                  variant="primary"
                  onClick={handleVerify2FA}
                  disabled={is2FALoading || verificationCode.length !== 6}
                  className="w-full"
                >
                  {is2FALoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Verify and Enable
                </Button>
              </div>
            </div>
          )}

          {/* Disable 2FA Confirmation Dialog */}
          {showDisable2FADialog && (
            <div className="mt-2 sm:mt-3 md:mt-4 p-4 sm:p-6 bg-destructive-subtle rounded-lg border border-destructive-line">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="tf-row-name">Disable Two-Factor Authentication</h3>
                <button
                  onClick={() => {
                    setShowDisable2FADialog(false);
                    setDisable2FACode('');
                  }}
                  className="p-1 hover:bg-destructive-subtle rounded"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start gap-2 p-2.5 sm:p-3 bg-warning-subtle border border-warning-line rounded-lg">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-warning-strong">
                    Disabling 2FA will make your account less secure. You'll only need your password to sign in.
                  </p>
                </div>

                <div>
                  <p className="tf-body-secondary mb-2">
                    Enter the 6-digit code from your authenticator app to confirm:
                  </p>
                  <input
                    type="text"
                    value={disable2FACode}
                    onChange={(e) => setDisable2FACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-3 h-9 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-destructive-line focus:outline-none text-center text-lg sm:text-xl md:text-2xl tracking-widest text-black"
                    maxLength={6}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Button
                    variant="destructive"
                    onClick={confirmDisable2FA}
                    disabled={is2FALoading || disable2FACode.length !== 6}
                    className="flex-1 text-sm"
                  >
                    {is2FALoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    Disable 2FA
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session Timeout */}
        <div className="tf-card-soft p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-gray-800 dark:text-slate-100" />
            </div>
            <div className="min-w-0">
              {/* Same hover ⓘ as Two-Factor Authentication. Facts from
                  components/SessionTimeoutProvider.tsx (activity events, 60 s warning)
                  and dependencies.py (server-side inactivity check). */}
              <HoverCard open={timeoutInfoOpen} onOpenChange={setTimeoutInfoOpen} openDelay={100} closeDelay={150}>
                <div className="flex items-center gap-1.5">
                  <h2 className="tf-section-title">Session Timeout</h2>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      aria-label="How does session timeout work?"
                      onClick={() => setTimeoutInfoOpen(open => !open)}
                      className="rounded-full p-0.5 text-gray-400 hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-slate-500"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </HoverCardTrigger>
                </div>
                <HoverCardContent
                  align="start"
                  collisionPadding={8}
                  className="w-[26rem] max-w-[calc(100vw-1rem)] max-h-[var(--radix-hover-card-content-available-height)] overflow-y-auto space-y-4 tf-body-secondary"
                >
                  <h3 className="tf-row-title">How does session timeout work?</h3>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">What it does</h4>
                    <p>
                      If you don&apos;t use TalentFlow for the time you choose here, you are signed out automatically.
                      This protects your account if you walk away from an unlocked or shared computer.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">What counts as activity</h4>
                    <p>
                      Moving the mouse, clicking, typing, scrolling or touching the screen in TalentFlow. Just leaving the page open
                      does not count — an open tab you aren&apos;t using still times out.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Before you are signed out</h4>
                    <p>
                      One minute before the time runs out, a warning with a countdown appears. Click
                      {' '}<span className="font-medium text-gray-900 dark:text-slate-50">Continue Session</span> to stay signed in,
                      and the timer starts again from the beginning.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">After you are signed out</h4>
                    <p>
                      Sign in again to carry on. Anything you hadn&apos;t saved yet — for example a half-filled form — may be lost,
                      so save your work before stepping away.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Which time to choose</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><span className="font-medium text-gray-900 dark:text-slate-50">15–30 minutes</span> — shared or public computers, or if you handle sensitive candidate data.</li>
                      <li><span className="font-medium text-gray-900 dark:text-slate-50">1–2 hours</span> — your own computer in the office.</li>
                      <li><span className="font-medium text-gray-900 dark:text-slate-50">8 hours</span> — a personal device you use all day and keep locked.</li>
                    </ul>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-brand-blue/20 bg-brand-blue/5 p-2.5">
                    <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                    <p>
                      This setting applies to your account only, on every device you use. It is saved as soon as you pick a new
                      time, and the server enforces it too — not just the open page.
                    </p>
                  </div>
                </HoverCardContent>
              </HoverCard>
              <p className="tf-body-muted">Auto log out after inactivity</p>
            </div>
          </div>
          <div className="relative" title={!canManage ? 'You do not have permission to manage security settings' : undefined}>
            <FilterSelect
              value={settings.session_timeout_minutes?.toString() || '1440'}
              onChange={(v) => {
                if (!canManage) return;
                handleSessionTimeoutChange(v);
              }}
              disabled={isSavingTimeout || !canManage}
              ariaLabel="Session timeout"
              options={[
                { value: '15', label: '15 minutes' },
                { value: '30', label: '30 minutes' },
                { value: '60', label: '1 hour' },
                { value: '120', label: '2 hours' },
                { value: '480', label: '8 hours' },
                { value: '1440', label: '24 hours' },
              ]}
              className={`w-full sm:w-full pl-3 sm:pl-3 pr-3 sm:pr-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300 text-black disabled:opacity-50 ${!canManage ? 'opacity-50 cursor-not-allowed disabled:cursor-not-allowed' : ''}`}
            />
            {isSavingTimeout && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-slate-500" />
              </div>
            )}
          </div>
        </div>

        {/* SSO (Single Sign-On) */}
        <FeatureGate feature="sso" mode="section">
          <div className="tf-card-soft p-4 sm:p-6 mb-4 sm:mb-6 overflow-hidden">
            <div className="flex items-center gap-2 sm:gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                {/* Same hover ⓘ as Two-Factor / Session Timeout. Keep it truthful: there is no
                    SAML/OIDC sign-in in this backend yet — SSO is gated by plan ("sso" feature)
                    and set up with support, not from this page. Update the text if that changes. */}
                <HoverCard open={ssoInfoOpen} onOpenChange={setSsoInfoOpen} openDelay={100} closeDelay={150}>
                  <div className="flex items-center gap-1.5">
                    <h2 className="tf-section-title">Single Sign-On (SSO)</h2>
                    <HoverCardTrigger asChild>
                      <button
                        type="button"
                        aria-label="How does single sign-on work?"
                        onClick={() => setSsoInfoOpen(open => !open)}
                        className="rounded-full p-0.5 text-gray-400 hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-slate-500"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </HoverCardTrigger>
                  </div>
                  <HoverCardContent
                    align="start"
                    collisionPadding={8}
                    className="w-[26rem] max-w-[calc(100vw-1rem)] max-h-[var(--radix-hover-card-content-available-height)] overflow-y-auto space-y-4 tf-body-secondary"
                  >
                    <h3 className="tf-row-title">How does single sign-on work?</h3>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">What it is</h4>
                      <p>
                        Single sign-on lets your team sign in to TalentFlow with the work account your company already uses —
                        for example Microsoft (Entra ID / Azure AD), Google Workspace or Okta — instead of a separate TalentFlow password.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Why companies use it</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>One password to remember, managed by your IT team.</li>
                        <li>Your company&apos;s own security rules (such as its sign-in checks) apply to TalentFlow too.</li>
                        <li>When someone leaves and IT disables their work account, their access goes with it.</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">SAML and OIDC</h4>
                      <p>
                        These are the two standard ways a company sign-in system connects to an app. Your IT team will know which one
                        your company uses — you don&apos;t need to choose yourself.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Setting it up</h4>
                      <p>
                        SSO is included in your plan, but it can&apos;t be switched on from this page. It is set up once for the whole
                        organization: ask your TalentFlow administrator to contact TalentFlow support, with your IT team&apos;s details ready.
                      </p>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border border-brand-blue/20 bg-brand-blue/5 p-2.5">
                      <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                      <p>Until SSO is set up, everyone keeps signing in with their email and password as usual.</p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
                <p className="tf-body-muted">Configure SSO for your organization</p>
              </div>
            </div>
            <div className="p-2.5 sm:p-3 md:p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                SSO is available for your plan. Contact your administrator to configure SAML or OIDC integration.
              </p>
            </div>
          </div>
        </FeatureGate>

        {/* Active Sessions */}
        <div className="tf-card-soft p-4 sm:p-6 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 mb-4">
            {/* Same hover ⓘ as the cards above. Keep it truthful: DELETE /sessions/{id} only
                marks the row invalid — JWTs aren't bound to a session, so a revoked device keeps
                working until its token expires (JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 480).
                Update the "Revoking" text if revocation becomes immediate. */}
            <HoverCard open={sessionsInfoOpen} onOpenChange={setSessionsInfoOpen} openDelay={100} closeDelay={150}>
              <div className="flex items-center gap-1.5">
                <h2 className="tf-section-title">Active Sessions</h2>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    aria-label="What are active sessions?"
                    onClick={() => setSessionsInfoOpen(open => !open)}
                    className="rounded-full p-0.5 text-gray-400 hover:text-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 dark:text-slate-500"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </HoverCardTrigger>
              </div>
              <HoverCardContent
                align="start"
                collisionPadding={8}
                className="w-[26rem] max-w-[calc(100vw-1rem)] max-h-[var(--radix-hover-card-content-available-height)] overflow-y-auto space-y-4 tf-body-secondary"
              >
                <h3 className="tf-row-title">What are active sessions?</h3>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">What you see here</h4>
                  <p>
                    Each row is a device or browser where your account is signed in. It shows the device, its location and IP
                    address, and when it was last used. The one marked <span className="font-medium text-gray-900 dark:text-slate-50">Current</span> is
                    the device you&apos;re using right now.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Check it now and then</h4>
                  <p>
                    If you see a device, place or time you don&apos;t recognise, someone else may have your password.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-slate-50 mb-1">Revoking</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><span className="font-medium text-gray-900 dark:text-slate-50">Revoke</span> removes one session from the list.</li>
                    <li><span className="font-medium text-gray-900 dark:text-slate-50">Revoke All Other Sessions</span> removes every session except this one, after you confirm.</li>
                    <li>A device that is already signed in can keep working until its current sign-in expires — up to 8 hours.</li>
                  </ul>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-subtle p-2.5 sm:p-3">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-warning-strong">
                    Don&apos;t recognise a session? Revoke it, change your password above, turn on two-factor authentication,
                    and tell your administrator.
                  </p>
                </div>
              </HoverCardContent>
            </HoverCard>
            {sessions.filter(s => !s.is_current).length > 0 && (
              <button
                onClick={() => {
                  if (!canManage) return;
                  handleRevokeAllOtherSessions();
                }}
                aria-disabled={!canManage}
                title={!canManage ? 'You do not have permission to manage security settings' : ''}
                className={`text-sm self-start sm:self-auto ${
                  canManage ? 'text-destructive hover:text-destructive' : 'text-gray-400 cursor-not-allowed opacity-60'
                }`}
              >
                Revoke All Other Sessions
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <p className="tf-body-muted text-center py-6 sm:py-8">No active sessions found</p>
          ) : (
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 md:p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg gap-2 sm:gap-3 md:gap-4 overflow-hidden"
                >
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shield className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="tf-row-name truncate">{session.device_info || 'Unknown Device'}</p>
                      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 md:gap-2 tf-body-muted">
                        <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                        <span className="truncate max-w-[100px] sm:max-w-none">{session.location || 'Unknown Location'}</span>
                        {session.ip_address && (
                          <span className="text-gray-400 dark:text-slate-500 truncate">({session.ip_address})</span>
                        )}
                        <span className="hidden sm:inline">•</span>
                        <span className="text-sm">{session.is_current ? 'Current session' : formatLastActive(session.last_active_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 self-end sm:self-auto">
                    {session.is_current ? (
                      <span className="tf-badge sm:px-2 md:px-3 bg-success-subtle text-success">
                        Current
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          if (!canManage) return;
                          handleRevokeSession(session.id);
                        }}
                        aria-disabled={!canManage}
                        title={!canManage ? 'You do not have permission to manage security settings' : ''}
                        className={`text-sm whitespace-nowrap ${
                          canManage ? 'text-destructive hover:text-destructive' : 'text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Revoke All Other Sessions Popup Modal */}
        {showRevokeAllDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowRevokeAllDialog(false)}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-md p-4 sm:p-6 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="tf-section-title">Revoke All Other Sessions</h3>
                <button
                  onClick={() => setShowRevokeAllDialog(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors flex-shrink-0"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>

              <div className="space-y-2.5 sm:space-y-3 md:space-y-4">
                <div className="flex items-start gap-2 p-2.5 sm:p-3 md:p-4 bg-warning-subtle border border-warning-line rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-warning-strong">
                    This will sign you out from all other devices and browsers. Only your current session will remain active.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2">
                  <Button
                    variant="destructive"
                    onClick={confirmRevokeAllOtherSessions}
                    disabled={isRevokingSession}
                    className="flex-1 font-medium text-sm"
                  >
                    {isRevokingSession ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                    Revoke All
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
