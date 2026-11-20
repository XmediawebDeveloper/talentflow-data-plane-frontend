'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Briefcase, Lock, Mail, Eye, EyeOff, CheckCircle, AlertCircle, ArrowRight, Sparkles, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { authService, getLoginUrl } from '@/lib/services/authService';
import { useAuth } from '@/components/providers/AuthProvider';
import { ensureTokenCookies } from '@/lib/utils/tokenRecovery';
import { hasStoredSession } from '@/lib/services/api';
import { IconButton } from '@/components/ui/icon-button';

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
  // Whose account this is — several invited users can sign in from one
  // browser, and the card alone gives no hint which one is being activated.
  const [accountEmail, setAccountEmail] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { logout } = useAuth();

  // Wrong account, or not now: leave without activating. The reset flag goes
  // first — logout() does not clear it, and a leftover flag would bounce the
  // next sign-in on this browser straight back to this page.
  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    localStorage.removeItem('pending_password_reset');
    await logout(); // records the logout, clears the session, hard-navigates to login
  };

  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;
  const newPasswordValid = newPassword.length >= 6;
  const canSubmit = newPasswordValid && passwordsMatch && confirmPassword.length > 0;

  // Guard: if no access token, redirect to login
  useEffect(() => {
    // Access token is restored from the session cookie asynchronously, so
    // check for a session here, not for the in-memory token.
    if (!hasStoredSession()) {
      router.replace(getLoginUrl());
      return;
    }
    // /auth/me answers with the temp-password session (AuthProvider reads
    // must_reset_password from it). A failure only hides the email line.
    let cancelled = false;
    authService.getCurrentUser()
      .then((me) => { if (!cancelled && me?.email) setAccountEmail(me.email); })
      .catch(() => {});
    return () => { cancelled = true; };
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? 'linear-gradient(135deg, var(--raw-111827) 0%, var(--raw-1f2937) 50%, var(--raw-1e1b4b) 100%)' : 'linear-gradient(135deg, var(--raw-f8fafc) 0%, var(--raw-eef2ff) 50%, var(--raw-e0e7ff) 100%)' }}>
        <div style={{ textAlign: 'center', padding: '48px', background: isDark ? 'var(--raw-1f2937)' : 'var(--raw-ffffff)', borderRadius: '16px', boxShadow: isDark ? '0 4px 24px var(--raw-rgba-0-0-0-0p3)' : '0 4px 24px var(--raw-rgba-0-0-0-0p08)', maxWidth: '420px', width: '100%', border: isDark ? '1px solid var(--raw-374151)' : undefined }}>
          <CheckCircle size={56} color="var(--raw-10b981)" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', marginBottom: '8px' }}>Password set!</h2>
          <p style={{ color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)', fontSize: '15px' }}>Redirecting you to the dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? 'linear-gradient(135deg, var(--raw-111827) 0%, var(--raw-1f2937) 50%, var(--raw-1e1b4b) 100%)' : 'linear-gradient(135deg, var(--raw-f8fafc) 0%, var(--raw-eef2ff) 50%, var(--raw-e0e7ff) 100%)', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', justifyContent: 'center' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--raw-6366f1), var(--raw-8b5cf6))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Briefcase size={22} color="var(--raw-ffffff)" />
          </div>
          <span style={{ fontSize: '22px', fontWeight: 700, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)' }}>TalentFlow</span>
          <Sparkles size={16} color="var(--raw-6366f1)" />
        </div>

        {/* Card */}
        <div style={{ background: isDark ? 'var(--raw-1f2937)' : 'var(--raw-ffffff)', borderRadius: '16px', boxShadow: isDark ? '0 4px 24px var(--raw-rgba-0-0-0-0p3)' : '0 4px 24px var(--raw-rgba-0-0-0-0p08)', padding: isMobile ? '24px' : '40px', border: isDark ? '1px solid var(--raw-374151)' : undefined }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', marginBottom: '8px' }}>Set your password</h1>
          <p style={{ color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)', fontSize: '14px', marginBottom: accountEmail ? '16px' : '28px', lineHeight: '1.5' }}>
            You were invited to TalentFlow. Please set a permanent password to activate your account.
          </p>

          {accountEmail && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isDark ? 'var(--raw-374151)' : 'var(--raw-f8fafc)', border: `1px solid ${isDark ? 'var(--raw-4b5563)' : 'var(--raw-e5e7eb)'}`, borderRadius: '8px', padding: '10px 12px', marginBottom: '24px', minWidth: 0 }}>
              <Mail size={16} color="var(--raw-6366f1)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)', flexShrink: 0 }}>Account</span>
              <span title={accountEmail} style={{ fontSize: '14px', fontWeight: 600, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {accountEmail}
              </span>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isDark ? 'var(--raw-rgba-239-68-68-0p15)' : 'var(--raw-fef2f2)', border: `1px solid ${isDark ? 'var(--raw-rgba-239-68-68-0p3)' : 'var(--raw-fecaca)'}`, borderRadius: '8px', padding: '12px 14px', marginBottom: '20px' }}>
              <AlertCircle size={16} color="var(--raw-ef4444)" />
              <span style={{ color: isDark ? 'var(--raw-fca5a5)' : 'var(--raw-dc2626)', fontSize: '14px' }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* New password */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? 'var(--raw-d1d5db)' : 'var(--raw-374151)', marginBottom: '6px' }}>New password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--raw-9ca3af)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                  style={{ width: '100%', padding: '10px 40px 10px 38px', border: `1px solid ${newPassword && !newPasswordValid ? 'var(--raw-ef4444)' : (isDark ? 'var(--raw-4b5563)' : 'var(--raw-e5e7eb)')}`, borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', background: isDark ? 'var(--raw-374151)' : undefined, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)' }}
                />
                <IconButton bare label={showNew ? 'Hide password' : 'Show password'} type="button" onClick={() => setShowNew(!showNew)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  {showNew ? <EyeOff size={16} color="var(--raw-9ca3af)" /> : <Eye size={16} color="var(--raw-9ca3af)" />}
                </IconButton>
              </div>
              {newPassword && !newPasswordValid && (
                <p style={{ color: 'var(--raw-ef4444)', fontSize: '12px', marginTop: '4px' }}>Password must be at least 6 characters</p>
              )}
            </div>

            {/* Confirm password */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: isDark ? 'var(--raw-d1d5db)' : 'var(--raw-374151)', marginBottom: '6px' }}>Confirm password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--raw-9ca3af)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  style={{ width: '100%', padding: '10px 40px 10px 38px', border: `1px solid ${confirmTouched && !passwordsMatch ? 'var(--raw-ef4444)' : (isDark ? 'var(--raw-4b5563)' : 'var(--raw-e5e7eb)')}`, borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', background: isDark ? 'var(--raw-374151)' : undefined, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)' }}
                />
                <IconButton bare label={showConfirm ? 'Hide confirmed password' : 'Show confirmed password'} type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  {showConfirm ? <EyeOff size={16} color="var(--raw-9ca3af)" /> : <Eye size={16} color="var(--raw-9ca3af)" />}
                </IconButton>
              </div>
              {confirmTouched && !passwordsMatch && (
                <p style={{ color: 'var(--raw-ef4444)', fontSize: '12px', marginTop: '4px' }}>Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || isLoading}
              style={{ width: '100%', padding: '11px', background: canSubmit && !isLoading ? 'linear-gradient(135deg, var(--raw-6366f1), var(--raw-8b5cf6))' : (isDark ? 'var(--raw-374151)' : 'var(--raw-e5e7eb)'), color: canSubmit && !isLoading ? 'var(--raw-ffffff)' : 'var(--raw-9ca3af)', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: canSubmit && !isLoading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
            >
              {isLoading ? 'Setting password…' : 'Activate account'}
              {!isLoading && <ArrowRight size={16} />}
            </button>
          </form>

          {/* Only once /auth/me has confirmed the signed-in account: "Not you?"
              answers the email shown above, and means nothing without it. */}
          {accountEmail && (
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${isDark ? 'var(--raw-374151)' : 'var(--raw-f3f4f6)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)' }}>Not you?</span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut || isLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', padding: '4px 6px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, color: isDark ? 'var(--raw-a5b4fc)' : 'var(--raw-6366f1)', cursor: isSigningOut || isLoading ? 'not-allowed' : 'pointer', opacity: isSigningOut || isLoading ? 0.6 : 1 }}
            >
              <LogOut size={14} />
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
