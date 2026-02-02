'use client';

import { Lock, Shield, Smartphone, Clock, MapPin, Save, Check, Loader2, X, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { userSettingsApi, sessionsApi, Session, UserSettings } from '@/lib/services/settingsService';
import { toast } from 'sonner';

export default function SecurityPage() {
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

  // 2FA state
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState('');
  const [twoFAQRCode, setTwoFAQRCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  // Session timeout state
  const [isSavingTimeout, setIsSavingTimeout] = useState(false);

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

    if (passwordForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      await userSettingsApi.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );
      setPasswordChanged(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed successfully');
      setTimeout(() => setPasswordChanged(false), 3000);
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast.error(error.message || 'Failed to change password');
    } finally {
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

  const handleDisable2FA = async () => {
    if (!confirm('Are you sure you want to disable two-factor authentication?')) {
      return;
    }

    setIs2FALoading(true);
    try {
      await userSettingsApi.disable2FA();
      setSettings({ ...settings, two_factor_enabled: false });
      toast.success('Two-factor authentication disabled');
    } catch (error: any) {
      console.error('Error disabling 2FA:', error);
      toast.error(error.message || 'Failed to disable 2FA');
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

  const handleRevokeAllOtherSessions = async () => {
    if (!confirm('Are you sure you want to revoke all other sessions?')) {
      return;
    }

    try {
      await sessionsApi.revokeOthers();
      setSessions(sessions.filter(s => s.is_current));
      toast.success('All other sessions revoked');
    } catch (error) {
      console.error('Error revoking sessions:', error);
      toast.error('Failed to revoke sessions');
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
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          <p className="text-gray-600">Loading security settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Security Settings</h1>
              <p className="text-sm text-gray-600">Manage your account security and authentication</p>
            </div>
          </div>
        </div>

        {/* Password Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Password</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="Enter current password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Enter new password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={isChangingPassword}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h2>
                <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
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
            <div className="mt-4 p-6 bg-gray-50 rounded-lg border border-gray-200">
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none text-center text-2xl tracking-widest"
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
        </div>

        {/* Session Timeout */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-gray-800" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Session Timeout</h2>
              <p className="text-sm text-gray-500">Automatically log out after inactivity</p>
            </div>
          </div>
          <div className="relative">
            <select
              value={settings.session_timeout_minutes?.toString() || '30'}
              onChange={(e) => handleSessionTimeoutChange(e.target.value)}
              disabled={isSavingTimeout}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none bg-white disabled:opacity-50"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Active Sessions</h2>
            {sessions.filter(s => !s.is_current).length > 0 && (
              <button
                onClick={handleRevokeAllOtherSessions}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Revoke All Other Sessions
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No active sessions found</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Shield className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{session.device_info || 'Unknown Device'}</p>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <MapPin className="w-3 h-3" />
                        {session.location || session.ip_address || 'Unknown Location'}
                        <span>•</span>
                        {session.is_current ? 'Current session' : formatLastActive(session.last_active_at)}
                      </div>
                    </div>
                  </div>
                  {session.is_current ? (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      Current
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
