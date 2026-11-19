'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Briefcase, Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getLoginUrl } from '@/lib/services/authService';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

export default function ResetPassword() {
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

  // Real-time password match validation (only show after user starts typing confirm)
  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;
  const newPasswordValid = newPassword.length >= 6;
  const canSubmit = newPasswordValid && passwordsMatch && confirmPassword.length > 0;

  // Guard: if no access token, redirect to the org login page (not bare /login)
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
    setError('');

    if (!newPasswordValid) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/auth/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      if (response.status === 401) {
        router.replace(getLoginUrl());
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.detail || 'Failed to update password. Please try again.');
        return;
      }

      setSuccess(true);
      toast.success('Password set successfully! Redirecting to dashboard...');

      setTimeout(() => {
        router.replace('/dashboard');
      }, 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Styles (mirrored from Login.tsx) ──────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: isDark ? 'linear-gradient(135deg, var(--raw-111827) 0%, var(--raw-1f2937) 50%, var(--raw-1e1b4b) 100%)' : 'linear-gradient(135deg, var(--raw-f8fafc) 0%, var(--raw-eef2ff) 50%, var(--raw-e0e7ff) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    position: 'relative',
    overflow: 'hidden',
  };

  const contentStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: '1200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '48px',
  };

  const leftSideStyle: React.CSSProperties = {
    display: isMobile ? 'none' : 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  };

  const logoBoxStyle: React.CSSProperties = {
    width: '56px',
    height: '56px',
    background: 'linear-gradient(135deg, var(--raw-2563eb), var(--raw-4338ca))',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 40px rgba(37, 99, 235, 0.3)',
  };

  const gradientTextStyle: React.CSSProperties = {
    background: 'linear-gradient(to right, var(--raw-2563eb), var(--raw-4338ca))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const featureIconBoxStyle = (color: string): React.CSSProperties => ({
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const formContainerStyle: React.CSSProperties = {
    width: isMobile ? '100%' : '480px',
    flexShrink: 0,
  };

  const formCardStyle: React.CSSProperties = {
    backgroundColor: isDark ? 'var(--raw-1f2937)' : 'var(--raw-ffffff)',
    borderRadius: '24px',
    boxShadow: isDark ? '0 25px 50px -12px rgba(0, 0, 0, 0.4)' : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    padding: isMobile ? '32px' : '40px',
    border: isDark ? '1px solid var(--raw-374151)' : '1px solid var(--raw-f3f4f6)',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: isDark ? 'var(--raw-d1d5db)' : 'var(--raw-374151)',
    marginBottom: '8px',
  };

  const inputIconStyle: React.CSSProperties = {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--raw-9ca3af)',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    paddingLeft: '48px',
    paddingRight: '48px',
    paddingTop: '14px',
    paddingBottom: '14px',
    border: `1px solid ${isDark ? 'var(--raw-4b5563)' : 'var(--raw-d1d5db)'}`,
    borderRadius: '12px',
    fontSize: '16px',
    color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)',
    backgroundColor: isDark ? 'var(--raw-374151)' : 'var(--raw-f9fafb)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.2s',
  };

  const eyeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--raw-9ca3af)',
  };

  const submitButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 24px',
    background: 'linear-gradient(to right, var(--raw-2563eb), var(--raw-4338ca))',
    color: 'var(--raw-ffffff)',
    fontSize: '16px',
    fontWeight: 500,
    borderRadius: '12px',
    border: 'none',
    cursor: canSubmit && !isLoading ? 'pointer' : 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: '0 10px 40px rgba(37, 99, 235, 0.3)',
    transition: 'all 0.2s',
    opacity: canSubmit && !isLoading ? 1 : 0.5,
  };

  const copyrightStyle: React.CSSProperties = {
    marginTop: '24px',
    textAlign: 'center',
    fontSize: '14px',
    color: isDark ? 'var(--raw-6b7280)' : 'var(--raw-9ca3af)',
  };

  // ── Success screen ─────────────────────────────────────────────────────────

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={{ position: 'absolute', top: 80, left: 40, width: 288, height: 288, backgroundColor: 'var(--raw-93c5fd)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
        <div style={{ position: 'absolute', top: 160, right: 40, width: 288, height: 288, backgroundColor: 'var(--raw-c4b5fd)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
        <div style={{ position: 'absolute', bottom: -32, left: '50%', width: 288, height: 288, backgroundColor: 'var(--raw-a5b4fc)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>

        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={formCardStyle}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--raw-10b981), var(--raw-059669))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 10px 40px rgba(16, 185, 129, 0.3)',
            }}>
              <CheckCircle style={{ width: 36, height: 36, color: 'var(--raw-ffffff)' }} />
            </div>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', marginBottom: '8px' }}>Password Set!</h2>
            <p style={{ color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)', fontSize: '16px' }}>Taking you to your dashboard...</p>
          </div>
          <div style={copyrightStyle}>© 2026 TalentFlow. All rights reserved.</div>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      {/* Background Blobs */}
      <div style={{ position: 'absolute', top: 80, left: 40, width: 288, height: 288, backgroundColor: 'var(--raw-93c5fd)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', top: 160, right: 40, width: 288, height: 288, backgroundColor: 'var(--raw-c4b5fd)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', bottom: -32, left: '50%', width: 288, height: 288, backgroundColor: 'var(--raw-a5b4fc)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>

      <div style={contentStyle}>
        {/* Left Side - Branding */}
        <div style={leftSideStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={logoBoxStyle}>
              <Briefcase style={{ width: 28, height: 28, color: 'var(--raw-ffffff)' }} />
            </div>
            <div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)' }}>TalentFlow</div>
              <div style={{ fontSize: '14px', color: 'var(--raw-2563eb)' }}>Recruitment Platform</div>
            </div>
          </div>

          <h2 style={{ fontSize: '48px', fontWeight: 700, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', lineHeight: 1.2, marginBottom: '24px' }}>
            Secure Your<br />
            <span style={gradientTextStyle}>Account Access</span>
          </h2>

          <p style={{ fontSize: '18px', color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)', lineHeight: 1.6, marginBottom: '32px', maxWidth: '480px' }}>
            Set a strong password to protect your recruitment dashboard and team data.
          </p>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={featureIconBoxStyle('var(--raw-dbeafe)')}>
                <Sparkles style={{ width: 20, height: 20, color: 'var(--raw-2563eb)' }} />
              </div>
              <div>
                <div style={{ color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', fontWeight: 500 }}>AI-Powered Resume Parsing</div>
                <div style={{ fontSize: 14, color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)' }}>Automated candidate screening and matching</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={featureIconBoxStyle('var(--raw-e0e7ff)')}>
                <Sparkles style={{ width: 20, height: 20, color: 'var(--raw-4338ca)' }} />
              </div>
              <div>
                <div style={{ color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', fontWeight: 500 }}>Smart Assessment Tools</div>
                <div style={{ fontSize: 14, color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)' }}>LLM-driven candidate evaluations</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={featureIconBoxStyle('var(--raw-ede9fe)')}>
                <Sparkles style={{ width: 20, height: 20, color: 'var(--raw-7c3aed)' }} />
              </div>
              <div>
                <div style={{ color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', fontWeight: 500 }}>Centralized Database</div>
                <div style={{ fontSize: 14, color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)' }}>Organize and track all candidates in one place</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div style={formContainerStyle}>
          <div style={formCardStyle}>
            {/* Mobile logo */}
            <div style={{ display: isMobile ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '32px' }}>
              <div style={{ ...logoBoxStyle, width: 48, height: 48 }}>
                <Briefcase style={{ width: 24, height: 24, color: 'var(--raw-ffffff)' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)' }}>TalentFlow</div>
                <div style={{ fontSize: 12, color: 'var(--raw-2563eb)' }}>Recruitment Platform</div>
              </div>
            </div>

            <h2 style={{ fontSize: '28px', fontWeight: 700, color: isDark ? 'var(--raw-f9fafb)' : 'var(--raw-111827)', marginBottom: '8px' }}>Set Your Password</h2>
            <p style={{ color: isDark ? 'var(--raw-9ca3af)' : 'var(--raw-6b7280)', marginBottom: '32px' }}>Welcome! Please choose a new password to continue.</p>

            {/* API error banner */}
            {error && (
              <div style={{
                marginBottom: '24px',
                padding: '16px',
                backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'var(--raw-fef2f2)',
                border: `1px solid ${isDark ? 'rgba(239,68,68,0.3)' : 'var(--raw-fecaca)'}`,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}>
                <AlertCircle style={{ width: 20, height: 20, color: 'var(--raw-dc2626)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: isDark ? 'var(--raw-fca5a5)' : 'var(--raw-991b1b)' }}>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* New Password */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock style={{ ...inputIconStyle, width: 20, height: 20 }} />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    style={inputStyle}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--raw-2563eb)';
                      e.target.style.backgroundColor = isDark ? 'var(--raw-4b5563)' : 'var(--raw-ffffff)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = isDark ? 'var(--raw-4b5563)' : 'var(--raw-d1d5db)';
                      e.target.style.backgroundColor = isDark ? 'var(--raw-374151)' : 'var(--raw-f9fafb)';
                    }}
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)} style={eyeButtonStyle}>
                    {showNew ? <EyeOff style={{ width: 20, height: 20 }} /> : <Eye style={{ width: 20, height: 20 }} />}
                  </button>
                </div>
                {newPassword.length > 0 && !newPasswordValid && (
                  <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--raw-dc2626)' }}>
                    Password must be at least 6 characters.
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: '28px' }}>
                <label style={labelStyle}>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock style={{ ...inputIconStyle, width: 20, height: 20 }} />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    style={{
                      ...inputStyle,
                      borderColor: confirmTouched && !passwordsMatch ? 'var(--raw-ef4444)' : (isDark ? 'var(--raw-4b5563)' : 'var(--raw-d1d5db)'),
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = confirmTouched && !passwordsMatch ? 'var(--raw-ef4444)' : 'var(--raw-2563eb)';
                      e.target.style.backgroundColor = isDark ? 'var(--raw-4b5563)' : 'var(--raw-ffffff)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = confirmTouched && !passwordsMatch ? 'var(--raw-ef4444)' : (isDark ? 'var(--raw-4b5563)' : 'var(--raw-d1d5db)');
                      e.target.style.backgroundColor = isDark ? 'var(--raw-374151)' : 'var(--raw-f9fafb)';
                    }}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={eyeButtonStyle}>
                    {showConfirm ? <EyeOff style={{ width: 20, height: 20 }} /> : <Eye style={{ width: 20, height: 20 }} />}
                  </button>
                </div>
                {confirmTouched && !passwordsMatch && (
                  <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--raw-dc2626)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle style={{ width: 13, height: 13 }} />
                    Passwords do not match.
                  </p>
                )}
                {confirmTouched && passwordsMatch && newPasswordValid && (
                  <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--raw-059669)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle style={{ width: 13, height: 13 }} />
                    Passwords match.
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit || isLoading}
                style={submitButtonStyle}
              >
                {isLoading ? (
                  <>
                    <div style={{ width: 20, height: 20, border: '2px solid var(--raw-ffffff)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    Saving...
                  </>
                ) : (
                  <>
                    Set Password & Continue
                    <ArrowRight style={{ width: 20, height: 20 }} />
                  </>
                )}
              </button>
            </form>
          </div>

          <div style={copyrightStyle}>
            © 2026 TalentFlow. All rights reserved.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
