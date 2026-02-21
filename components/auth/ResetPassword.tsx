'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getLoginUrl } from '@/lib/services/authService';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

export default function ResetPassword() {
  const router = useRouter();
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
    background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 50%, #E0E7FF 100%)',
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
    background: 'linear-gradient(135deg, #2563EB, #4338CA)',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 40px rgba(37, 99, 235, 0.3)',
  };

  const gradientTextStyle: React.CSSProperties = {
    background: 'linear-gradient(to right, #2563EB, #4338CA)',
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
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    padding: isMobile ? '32px' : '40px',
    border: '1px solid #F3F4F6',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  };

  const inputIconStyle: React.CSSProperties = {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    paddingLeft: '48px',
    paddingRight: '48px',
    paddingTop: '14px',
    paddingBottom: '14px',
    border: '1px solid #D1D5DB',
    borderRadius: '12px',
    fontSize: '16px',
    color: '#111827',
    backgroundColor: '#F9FAFB',
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
    color: '#9CA3AF',
  };

  const submitButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 24px',
    background: 'linear-gradient(to right, #2563EB, #4338CA)',
    color: '#ffffff',
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
    color: '#9CA3AF',
  };

  // ── Success screen ─────────────────────────────────────────────────────────

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={{ position: 'absolute', top: 80, left: 40, width: 288, height: 288, backgroundColor: '#93C5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
        <div style={{ position: 'absolute', top: 160, right: 40, width: 288, height: 288, backgroundColor: '#C4B5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
        <div style={{ position: 'absolute', bottom: -32, left: '50%', width: 288, height: 288, backgroundColor: '#A5B4FC', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>

        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={formCardStyle}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 10px 40px rgba(16, 185, 129, 0.3)',
            }}>
              <CheckCircle style={{ width: 36, height: 36, color: '#ffffff' }} />
            </div>
            <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Password Set!</h2>
            <p style={{ color: '#6B7280', fontSize: '16px' }}>Taking you to your dashboard...</p>
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
      <div style={{ position: 'absolute', top: 80, left: 40, width: 288, height: 288, backgroundColor: '#93C5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', top: 160, right: 40, width: 288, height: 288, backgroundColor: '#C4B5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', bottom: -32, left: '50%', width: 288, height: 288, backgroundColor: '#A5B4FC', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>

      <div style={contentStyle}>
        {/* Left Side - Branding */}
        <div style={leftSideStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div style={logoBoxStyle}>
              <Briefcase style={{ width: 28, height: 28, color: '#ffffff' }} />
            </div>
            <div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#111827' }}>TalentFlow</div>
              <div style={{ fontSize: '14px', color: '#2563EB' }}>Recruitment Platform</div>
            </div>
          </div>

          <h2 style={{ fontSize: '48px', fontWeight: 700, color: '#111827', lineHeight: 1.2, marginBottom: '24px' }}>
            Secure Your<br />
            <span style={gradientTextStyle}>Account Access</span>
          </h2>

          <p style={{ fontSize: '18px', color: '#6B7280', lineHeight: 1.6, marginBottom: '32px', maxWidth: '480px' }}>
            Set a strong password to protect your recruitment dashboard and team data.
          </p>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={featureIconBoxStyle('#DBEAFE')}>
                <Sparkles style={{ width: 20, height: 20, color: '#2563EB' }} />
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 500 }}>AI-Powered Resume Parsing</div>
                <div style={{ fontSize: 14, color: '#6B7280' }}>Automated candidate screening and matching</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={featureIconBoxStyle('#E0E7FF')}>
                <Sparkles style={{ width: 20, height: 20, color: '#4338CA' }} />
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 500 }}>Smart Assessment Tools</div>
                <div style={{ fontSize: 14, color: '#6B7280' }}>LLM-driven candidate evaluations</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={featureIconBoxStyle('#EDE9FE')}>
                <Sparkles style={{ width: 20, height: 20, color: '#7C3AED' }} />
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 500 }}>Centralized Database</div>
                <div style={{ fontSize: 14, color: '#6B7280' }}>Organize and track all candidates in one place</div>
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
                <Briefcase style={{ width: 24, height: 24, color: '#ffffff' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>TalentFlow</div>
                <div style={{ fontSize: 12, color: '#2563EB' }}>Recruitment Platform</div>
              </div>
            </div>

            <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Set Your Password</h2>
            <p style={{ color: '#6B7280', marginBottom: '32px' }}>Welcome! Please choose a new password to continue.</p>

            {/* API error banner */}
            {error && (
              <div style={{
                marginBottom: '24px',
                padding: '16px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}>
                <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: '#991B1B' }}>{error}</span>
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
                      e.target.style.borderColor = '#2563EB';
                      e.target.style.backgroundColor = '#ffffff';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#D1D5DB';
                      e.target.style.backgroundColor = '#F9FAFB';
                    }}
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)} style={eyeButtonStyle}>
                    {showNew ? <EyeOff style={{ width: 20, height: 20 }} /> : <Eye style={{ width: 20, height: 20 }} />}
                  </button>
                </div>
                {newPassword.length > 0 && !newPasswordValid && (
                  <p style={{ marginTop: '6px', fontSize: '13px', color: '#DC2626' }}>
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
                      borderColor: confirmTouched && !passwordsMatch ? '#EF4444' : '#D1D5DB',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = confirmTouched && !passwordsMatch ? '#EF4444' : '#2563EB';
                      e.target.style.backgroundColor = '#ffffff';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = confirmTouched && !passwordsMatch ? '#EF4444' : '#D1D5DB';
                      e.target.style.backgroundColor = '#F9FAFB';
                    }}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={eyeButtonStyle}>
                    {showConfirm ? <EyeOff style={{ width: 20, height: 20 }} /> : <Eye style={{ width: 20, height: 20 }} />}
                  </button>
                </div>
                {confirmTouched && !passwordsMatch && (
                  <p style={{ marginTop: '6px', fontSize: '13px', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle style={{ width: 13, height: 13 }} />
                    Passwords do not match.
                  </p>
                )}
                {confirmTouched && passwordsMatch && newPasswordValid && (
                  <p style={{ marginTop: '6px', fontSize: '13px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                    <div style={{ width: 20, height: 20, border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
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
