'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Briefcase, Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { authService, getLoginUrl } from '@/lib/services/authService';
import { ensureTokenCookies } from '@/lib/utils/tokenRecovery';

export default function SetPassword() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;
  const newPasswordValid = newPassword.length >= 6;
  const canSubmit = newPasswordValid && passwordsMatch && confirmPassword.length > 0;

  // Guard: if no access token, redirect to login
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace(getLoginUrl());
    }
  }, [router]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setIsLoading(true);

    try {
      await authService.setPassword(newPassword, confirmPassword);
      // Clear the pending_password_reset flag so AuthProvider no longer intercepts navigation.
      localStorage.removeItem('pending_password_reset');
      setSuccess(true);
      toast.success('Password set successfully! Redirecting to dashboard…');
      // Sync tokens to cookies before navigating — middleware checks the cookie server-side
      // before AuthProvider.restoreSession() (which calls ensureTokenCookies) can run.
      ensureTokenCookies();
      // Hard redirect — AuthProvider.restoreSession() re-runs on fresh page load,
      // finds the token, restores session (must_reset_password now false in DB).
      setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to set password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? 'linear-gradient(135deg, #111827 0%, #1F2937 50%, #1E1B4B 100%)' : 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 50%, #E0E7FF 100%)' }}>
        <div style={{ textAlign: 'center', padding: '48px', background: isDark ? '#1F2937' : '#fff', borderRadius: '16px', boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.3)' : '0 4px 24px rgba(0,0,0,0.08)', maxWidth: '420px', width: '100%', border: isDark ? '1px solid #374151' : undefined }}>
          <CheckCircle size={56} color="#10B981" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: isDark ? '#F9FAFB' : '#111827', marginBottom: '8px' }}>Password set!</h2>
          <p style={{ color: isDark ? '#9CA3AF' : '#6B7280', fontSize: '15px' }}>Redirecting you to the dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? 'linear-gradient(135deg, #111827 0%, #1F2937 50%, #1E1B4B 100%)' : 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 50%, #E0E7FF 100%)', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', justifyContent: 'center' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Briefcase size={22} color="#fff" />
          </div>
          <span style={{ fontSize: '22px', fontWeight: 700, color: isDark ? '#F9FAFB' : '#111827' }}>TalentFlow</span>
          <Sparkles size={16} color="#6366F1" />
        </div>

        {/* Card */}
        <div style={{ background: isDark ? '#1F2937' : '#fff', borderRadius: '16px', boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.3)' : '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '24px' : '40px', border: isDark ? '1px solid #374151' : undefined }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: isDark ? '#F9FAFB' : '#111827', marginBottom: '8px' }}>Set your password</h1>
          <p style={{ color: isDark ? '#9CA3AF' : '#6B7280', fontSize: '14px', marginBottom: '28px', lineHeight: '1.5' }}>
            You were invited to TalentFlow. Please set a permanent password to activate your account.
          </p>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2', border: `1px solid ${isDark ? 'rgba(239,68,68,0.3)' : '#FECACA'}`, borderRadius: '8px', padding: '12px 14px', marginBottom: '20px' }}>
              <AlertCircle size={16} color="#EF4444" />
              <span style={{ color: isDark ? '#FCA5A5' : '#DC2626', fontSize: '14px' }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* New password */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#D1D5DB' : '#374151', marginBottom: '6px' }}>New password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="#9CA3AF" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                  style={{ width: '100%', padding: '10px 40px 10px 38px', border: `1px solid ${newPassword && !newPasswordValid ? '#EF4444' : (isDark ? '#4B5563' : '#E5E7EB')}`, borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: isDark ? '#374151' : undefined, color: isDark ? '#F9FAFB' : '#111827' }}
                />
                <button type="button" onClick={() => setShowNew(!showNew)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  {showNew ? <EyeOff size={16} color="#9CA3AF" /> : <Eye size={16} color="#9CA3AF" />}
                </button>
              </div>
              {newPassword && !newPasswordValid && (
                <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px' }}>Password must be at least 6 characters</p>
              )}
            </div>

            {/* Confirm password */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? '#D1D5DB' : '#374151', marginBottom: '6px' }}>Confirm password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="#9CA3AF" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  style={{ width: '100%', padding: '10px 40px 10px 38px', border: `1px solid ${confirmTouched && !passwordsMatch ? '#EF4444' : (isDark ? '#4B5563' : '#E5E7EB')}`, borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: isDark ? '#374151' : undefined, color: isDark ? '#F9FAFB' : '#111827' }}
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  {showConfirm ? <EyeOff size={16} color="#9CA3AF" /> : <Eye size={16} color="#9CA3AF" />}
                </button>
              </div>
              {confirmTouched && !passwordsMatch && (
                <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px' }}>Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || isLoading}
              style={{ width: '100%', padding: '11px', background: canSubmit && !isLoading ? 'linear-gradient(135deg, #6366F1, #8B5CF6)' : (isDark ? '#374151' : '#E5E7EB'), color: canSubmit && !isLoading ? '#fff' : '#9CA3AF', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: canSubmit && !isLoading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
            >
              {isLoading ? 'Setting password…' : 'Activate account'}
              {!isLoading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
