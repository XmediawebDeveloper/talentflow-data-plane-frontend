'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Lock, Shield, Smartphone, Clock, MapPin, Save, Check, Loader2, X, AlertTriangle, Eye, EyeOff, CheckCircle, KeyRound, Sparkles } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { userSettingsApi, sessionsApi, Session, UserSettings } from '@/lib/services/settingsService';
import { clearTokens } from '@/lib/services/api';
import { toast } from 'sonner';
import FeatureGate from '@/components/shared/FeatureGate';
import { useAuth } from '@/lib/hooks/useAuth';
import { PageSkeleton } from '@/components/ui/skeleton';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';

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
    session_timeout_minutes: 30,
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
      toast.error(error.message || 'Failed to change password');
      setIsChangingPassword(false);
    }
  };

  const handleEnable2FA = async () => {
    setIs2FALoading(true);
    try {
      const response = await userSettingsApi.enable2FA();
      setTwoFASecret(response.secret || '');
      setTwoFAQRCode(response.qr_code_url || '');
      setShow2FASetup(true);
    } catch (error: any) {
      console.error('Error enabling 2FA:', error);
      toast.error(error.message || 'Failed to enable 2FA');
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
      toast.error(error.message || 'Invalid verification code');
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
      toast.error(error.message || 'Invalid verification code');
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
    return <PageSkeleton variant="form" showStats={false} />;
  }

  return (
    <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-8" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings', href: '/settings/general-settings' }, { label: 'Security Settings' }]} />

        {/* SaaS Hero Header */}
        <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3 w-3 text-brand-orange" />
                Account protection
              </div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Security Settings</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">Manage password, two-factor auth, sessions, and trust controls.</p>
            </div>
          </div>
        </section>

        {/* Password Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 overflow-hidden">
          <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2 sm:mb-3 md:mb-4">Password</h2>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Current Password</label>
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
                  className="w-full px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 pr-9 sm:pr-10 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue focus:outline-none text-black text-xs sm:text-sm md:text-base"
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
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">New Password</label>
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
                  className={`w-full px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 pr-9 sm:pr-10 border rounded-lg focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue focus:outline-none transition-colors text-black text-xs sm:text-sm md:text-base ${
                    passwordForm.newPassword
                      ? passwordStrength === 5
                        ? 'border-green-500'
                        : passwordStrength >= 3
                        ? 'border-yellow-500'
                        : 'border-red-500'
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
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Confirm New Password</label>
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
                  className={`w-full px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 pr-9 sm:pr-10 border rounded-lg focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue focus:outline-none transition-colors text-black text-xs sm:text-sm md:text-base ${
                    passwordForm.confirmPassword
                      ? passwordsMatch
                        ? 'border-green-500'
                        : 'border-red-500'
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
                <p className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2 sm:mb-3">Password Requirements:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                  {[
                    { label: 'At least 8 characters', check: passwordChecks.length },
                    { label: 'One uppercase letter', check: passwordChecks.uppercase },
                    { label: 'One lowercase letter', check: passwordChecks.lowercase },
                    { label: 'One number', check: passwordChecks.number },
                    { label: 'One special character', check: passwordChecks.special },
                    { label: 'Passwords match', check: passwordsMatch },
                  ].map((req, i) => (
                    <div key={i} className="flex items-center gap-1.5 sm:gap-2">
                      <CheckCircle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 transition-colors ${req.check ? 'text-green-500' : 'text-gray-300 dark:text-slate-500'}`} />
                      <span className={`text-xs sm:text-sm transition-colors ${req.check ? 'text-green-600' : 'text-gray-500 dark:text-slate-500'}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Strength Bar */}
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500 dark:text-slate-500">Password Strength</span>
                    <span className={`text-xs font-semibold ${
                      passwordStrength <= 2 ? 'text-red-500' : passwordStrength <= 3 ? 'text-yellow-500' : passwordStrength <= 4 ? 'text-blue-500' : 'text-green-500'
                    }`}>
                      {passwordStrength === 0 ? 'Too Weak' : passwordStrength <= 2 ? 'Weak' : passwordStrength <= 3 ? 'Fair' : passwordStrength <= 4 ? 'Good' : 'Strong'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength <= 2 ? 'bg-red-500' : passwordStrength <= 3 ? 'bg-yellow-500' : passwordStrength <= 4 ? 'bg-blue-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${(passwordStrength / 5) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {canManage && (
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword || (passwordForm.newPassword && passwordStrength < 3)}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-brand-blue text-white rounded-xl ring-1 ring-white/10 shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed text-xs sm:text-sm md:text-base w-full sm:w-auto justify-center sm:justify-start"
              >
                {isChangingPassword ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : passwordChanged ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {passwordChanged ? 'Password Updated!' : isChangingPassword ? 'Changing...' : 'Change Password'}
              </button>
            )}
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-3 md:mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50">Two-Factor Authentication</h2>
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 dark:text-slate-500">Add an extra layer of security</p>
              </div>
            </div>
            {!show2FASetup && canManage && (
              <button
                onClick={settings.two_factor_enabled ? handleDisable2FA : handleEnable2FA}
                disabled={is2FALoading}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.two_factor_enabled ? 'bg-green-600' : 'bg-gray-300'
                } ${is2FALoading ? 'opacity-50' : ''}`}
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
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-green-50 rounded-lg">
              <p className="text-xs sm:text-sm text-green-700">
                Two-factor authentication is enabled. You'll need to enter a code from your authenticator app when signing in.
              </p>
            </div>
          )}

          {/* 2FA Setup Modal */}
          {show2FASetup && (
            <div className="mt-2 sm:mt-3 md:mt-4 p-3 sm:p-4 md:p-6 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="font-medium text-xs sm:text-sm md:text-base text-gray-900 dark:text-slate-50">Setup Two-Factor Authentication</h3>
                <button
                  onClick={() => setShow2FASetup(false)}
                  className="p-1 hover:bg-gray-200 rounded"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-2 sm:mb-3">
                    1. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                  {twoFAQRCode && (
                    <div className="flex justify-center p-3 sm:p-4 bg-white dark:bg-slate-900 rounded-lg border">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFAQRCode)}`}
                        alt="2FA QR Code"
                        className="w-36 h-36 sm:w-48 sm:h-48"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-2">
                    Or manually enter this secret key:
                  </p>
                  <code className="block p-2 sm:p-3 bg-gray-800 text-green-400 rounded-lg font-mono text-[10px] sm:text-xs md:text-sm break-all">
                    {twoFASecret}
                  </code>
                </div>

                <div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-2">
                    2. Enter the 6-digit code from your authenticator app:
                  </p>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue focus:outline-none text-center text-lg sm:text-xl md:text-2xl tracking-widest text-black"
                    maxLength={6}
                  />
                </div>

                <button
                  onClick={handleVerify2FA}
                  disabled={is2FALoading || verificationCode.length !== 6}
                  className="w-full flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {is2FALoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Verify and Enable
                </button>
              </div>
            </div>
          )}

          {/* Disable 2FA Confirmation Dialog */}
          {showDisable2FADialog && (
            <div className="mt-2 sm:mt-3 md:mt-4 p-3 sm:p-4 md:p-6 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="font-medium text-xs sm:text-sm md:text-base text-gray-900 dark:text-slate-50">Disable Two-Factor Authentication</h3>
                <button
                  onClick={() => {
                    setShowDisable2FADialog(false);
                    setDisable2FACode('');
                  }}
                  className="p-1 hover:bg-red-100 rounded"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start gap-2 p-2.5 sm:p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-yellow-800">
                    Disabling 2FA will make your account less secure. You'll only need your password to sign in.
                  </p>
                </div>

                <div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-2">
                    Enter the 6-digit code from your authenticator app to confirm:
                  </p>
                  <input
                    type="text"
                    value={disable2FACode}
                    onChange={(e) => setDisable2FACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none text-center text-lg sm:text-xl md:text-2xl tracking-widest text-black"
                    maxLength={6}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    onClick={() => {
                      setShowDisable2FADialog(false);
                      setDisable2FACode('');
                    }}
                    className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDisable2FA}
                    disabled={is2FALoading || disable2FACode.length !== 6}
                    className="flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm sm:text-base"
                  >
                    {is2FALoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    Disable 2FA
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session Timeout */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3 md:mb-4">
            <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-gray-800 dark:text-slate-100" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50">Session Timeout</h2>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 dark:text-slate-500">Auto log out after inactivity</p>
            </div>
          </div>
          <div className="relative">
            <select
              value={settings.session_timeout_minutes?.toString() || '30'}
              onChange={(e) => handleSessionTimeoutChange(e.target.value)}
              disabled={!canManage || isSavingTimeout}
              className="w-full px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue focus:outline-none bg-white dark:bg-slate-900 disabled:opacity-50 text-black text-xs sm:text-sm md:text-base"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="480">8 hours</option>
            </select>
            {isSavingTimeout && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-slate-500" />
              </div>
            )}
          </div>
        </div>

        {/* SSO (Single Sign-On) */}
        <FeatureGate feature="sso" mode="section">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 overflow-hidden">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3 md:mb-4">
              <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50">Single Sign-On (SSO)</h2>
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 dark:text-slate-500">Configure SSO for your organization</p>
              </div>
            </div>
            <div className="p-2.5 sm:p-3 md:p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs sm:text-sm text-blue-700">
                SSO is available for your plan. Contact your administrator to configure SAML or OIDC integration.
              </p>
            </div>
          </div>
        </FeatureGate>

        {/* Active Sessions */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm shadow-brand-blue/5 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-3 sm:p-4 md:p-6 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 mb-2 sm:mb-3 md:mb-4">
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-slate-50">Active Sessions</h2>
            {canManage && sessions.filter(s => !s.is_current).length > 0 && (
              <button
                onClick={handleRevokeAllOtherSessions}
                className="text-xs sm:text-sm text-red-600 hover:text-red-700 self-start sm:self-auto"
              >
                Revoke All Other Sessions
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <p className="text-gray-500 dark:text-slate-500 text-center py-6 sm:py-8 text-xs sm:text-sm md:text-base">No active sessions found</p>
          ) : (
            <div className="space-y-2 sm:space-y-3 md:space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 md:p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg gap-2 sm:gap-3 md:gap-4 overflow-hidden"
                >
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-gray-600 dark:text-slate-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-slate-50 text-xs sm:text-sm md:text-base truncate">{session.device_info || 'Unknown Device'}</p>
                      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 md:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-500 dark:text-slate-500">
                        <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                        <span className="truncate max-w-[100px] sm:max-w-none">{session.location || 'Unknown Location'}</span>
                        {session.ip_address && (
                          <span className="text-gray-400 dark:text-slate-500 truncate">({session.ip_address})</span>
                        )}
                        <span className="hidden sm:inline">•</span>
                        <span className="text-[10px] sm:text-xs md:text-sm">{session.is_current ? 'Current session' : formatLastActive(session.last_active_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 self-end sm:self-auto">
                    {session.is_current ? (
                      <span className="px-1.5 sm:px-2 md:px-3 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] sm:text-xs md:text-sm font-medium whitespace-nowrap">
                        Current
                      </span>
                    ) : canManage ? (
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        className="text-[10px] sm:text-xs md:text-sm text-red-600 hover:text-red-700 whitespace-nowrap"
                      >
                        Revoke
                      </button>
                    ) : null}
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
            <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-md p-3 sm:p-4 md:p-6 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <h3 className="text-xs sm:text-sm md:text-lg font-semibold text-gray-900 dark:text-slate-50">Revoke All Other Sessions</h3>
                <button
                  onClick={() => setShowRevokeAllDialog(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors flex-shrink-0"
                 aria-label="Close">
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>

              <div className="space-y-2.5 sm:space-y-3 md:space-y-4">
                <div className="flex items-start gap-2 p-2.5 sm:p-3 md:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] sm:text-xs md:text-sm text-yellow-800">
                    This will sign you out from all other devices and browsers. Only your current session will remain active.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2">
                  <button
                    onClick={() => setShowRevokeAllDialog(false)}
                    className="flex-1 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors font-medium text-xs sm:text-sm md:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRevokeAllOtherSessions}
                    disabled={isRevokingSession}
                    className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 font-medium text-xs sm:text-sm md:text-base"
                  >
                    {isRevokingSession ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                    Revoke All
                  </button>
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
