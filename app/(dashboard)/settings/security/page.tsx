'use client';

import { Lock, Shield, Smartphone, Clock, MapPin, Save, Check, Loader2, X, AlertTriangle, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { userSettingsApi, sessionsApi, Session, UserSettings } from '@/lib/services/settingsService';
import { clearTokens } from '@/lib/services/api';
import { toast } from 'sonner';

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
  const [isLoading, setIsLoading] = useState(true);
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
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading security settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
              <Lock className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Security Settings</h1>
              <p className="text-sm text-gray-600">Manage your account security and authentication</p>
            </div>
          </div>
        </div>

        {/* Password Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Password</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="Enter current password"
                  className="w-full px-3 sm:px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none text-black text-sm sm:text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="Enter new password"
                  className={`w-full px-3 sm:px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none transition-colors text-black text-sm sm:text-base ${
                    passwordForm.newPassword
                      ? passwordStrength === 5
                        ? 'border-green-500'
                        : passwordStrength >= 3
                        ? 'border-yellow-500'
                        : 'border-red-500'
                      : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="Confirm new password"
                  className={`w-full px-3 sm:px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none transition-colors text-black text-sm sm:text-base ${
                    passwordForm.confirmPassword
                      ? passwordsMatch
                        ? 'border-green-500'
                        : 'border-red-500'
                      : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Requirements - Live Validation */}
            {(passwordForm.newPassword || passwordForm.confirmPassword) && (
              <div className="p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">Password Requirements:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: 'At least 8 characters', check: passwordChecks.length },
                    { label: 'One uppercase letter', check: passwordChecks.uppercase },
                    { label: 'One lowercase letter', check: passwordChecks.lowercase },
                    { label: 'One number', check: passwordChecks.number },
                    { label: 'One special character', check: passwordChecks.special },
                    { label: 'Passwords match', check: passwordsMatch },
                  ].map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className={`w-4 h-4 transition-colors ${req.check ? 'text-green-500' : 'text-gray-300'}`} />
                      <span className={`text-sm transition-colors ${req.check ? 'text-green-600' : 'text-gray-500'}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Strength Bar */}
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">Password Strength</span>
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

            <button
              onClick={handleChangePassword}
              disabled={isChangingPassword || (passwordForm.newPassword && passwordStrength < 3)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base w-full sm:w-auto justify-center sm:justify-start"
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
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Two-Factor Authentication</h2>
                <p className="text-xs sm:text-sm text-gray-500">Add an extra layer of security to your account</p>
              </div>
            </div>
            {!show2FASetup && (
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
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-700">
                Two-factor authentication is enabled. You'll need to enter a code from your authenticator app when signing in.
              </p>
            </div>
          )}

          {/* 2FA Setup Modal */}
          {show2FASetup && (
            <div className="mt-3 sm:mt-4 p-4 sm:p-6 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Setup Two-Factor Authentication</h3>
                <button
                  onClick={() => setShow2FASetup(false)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    1. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                  {twoFAQRCode && (
                    <div className="flex justify-center p-4 bg-white rounded-lg border">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFAQRCode)}`}
                        alt="2FA QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    Or manually enter this secret key:
                  </p>
                  <code className="block p-3 bg-gray-800 text-green-400 rounded-lg font-mono text-sm break-all">
                    {twoFASecret}
                  </code>
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    2. Enter the 6-digit code from your authenticator app:
                  </p>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none text-center text-xl sm:text-2xl tracking-widest text-black"
                    maxLength={6}
                  />
                </div>

                <button
                  onClick={handleVerify2FA}
                  disabled={is2FALoading || verificationCode.length !== 6}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
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
            <div className="mt-3 sm:mt-4 p-4 sm:p-6 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Disable Two-Factor Authentication</h3>
                <button
                  onClick={() => {
                    setShowDisable2FADialog(false);
                    setDisable2FACode('');
                  }}
                  className="p-1 hover:bg-red-100 rounded"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    Disabling 2FA will make your account less secure. You'll only need your password to sign in.
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    Enter the 6-digit code from your authenticator app to confirm:
                  </p>
                  <input
                    type="text"
                    value={disable2FACode}
                    onChange={(e) => setDisable2FACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none text-center text-xl sm:text-2xl tracking-widest text-black"
                    maxLength={6}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    onClick={() => {
                      setShowDisable2FADialog(false);
                      setDisable2FACode('');
                    }}
                    className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Session Timeout</h2>
              <p className="text-xs sm:text-sm text-gray-500">Automatically log out after inactivity</p>
            </div>
          </div>
          <div className="relative">
            <select
              value={settings.session_timeout_minutes?.toString() || '30'}
              onChange={(e) => handleSessionTimeoutChange(e.target.value)}
              disabled={isSavingTimeout}
              className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none bg-white disabled:opacity-50 text-black text-sm sm:text-base"
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="480">8 hours</option>
            </select>
            {isSavingTimeout && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            )}
          </div>
        </div>

        {/* Active Sessions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Active Sessions</h2>
            {sessions.filter(s => !s.is_current).length > 0 && (
              <button
                onClick={handleRevokeAllOtherSessions}
                className="text-xs sm:text-sm text-red-600 hover:text-red-700 self-start sm:self-auto"
              >
                Revoke All Other Sessions
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <p className="text-gray-500 text-center py-6 sm:py-8 text-sm sm:text-base">No active sessions found</p>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg gap-3 sm:gap-4"
                >
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{session.device_info || 'Unknown Device'}</p>
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-500">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{session.location || 'Unknown Location'}</span>
                        {session.ip_address && (
                          <span className="text-gray-400 truncate">({session.ip_address})</span>
                        )}
                        <span className="hidden sm:inline">•</span>
                        <span className="text-xs sm:text-sm">{session.is_current ? 'Current session' : formatLastActive(session.last_active_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 self-end sm:self-auto">
                    {session.is_current ? (
                      <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-green-100 text-green-700 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap">
                        Current
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        className="text-xs sm:text-sm text-red-600 hover:text-red-700 whitespace-nowrap"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowRevokeAllDialog(false)}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-4 sm:p-6 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Revoke All Other Sessions</h3>
                <button
                  onClick={() => setShowRevokeAllDialog(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-yellow-800">
                    This will sign you out from all other devices and browsers. Only your current session will remain active.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 sm:pt-2">
                  <button
                    onClick={() => setShowRevokeAllDialog(false)}
                    className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRevokeAllOtherSessions}
                    disabled={isRevokingSession}
                    className="flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 font-medium text-sm sm:text-base"
                  >
                    {isRevokingSession ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    Revoke All
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
