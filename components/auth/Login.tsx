'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Sparkles, ArrowLeft, Shield, KeyRound, Building2 } from 'lucide-react';
import { User } from '@/lib/types/tenant';
import { authService, isTwoFactorRequired, LoginResponse } from '@/lib/services';
import { useAuth } from '@/lib/hooks/useAuth';
import { detectSubdomain } from '@/lib/utils/subdomain';
import ForgotPasswordModal from './ForgotPasswordModal';

interface LoginProps {
  onSwitchToSignUp?: () => void;
  onBackToPublic?: () => void;
}

export default function Login({ onSwitchToSignUp, onBackToPublic }: LoginProps) {
  const router = useRouter();
  const { login } = useAuth();
  const searchParams = useSearchParams();

  // Get plan and email from URL params (from signup redirect)
  const encodedPlanFromUrl = searchParams.get('plan');
  const emailFromUrl = searchParams.get('email');

  const [email, setEmail] = useState(emailFromUrl || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Subdomain (tenant) detection
  const [subdomain, setSubdomain] = useState<string | null>(null);

  useEffect(() => {
    const detected = detectSubdomain(new URLSearchParams(searchParams.toString()));
    if (detected) setSubdomain(detected);
  }, [searchParams]);

  // 2FA State
  const [show2FA, setShow2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [userEmail2FA, setUserEmail2FA] = useState('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load saved email from localStorage on mount
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('rememberedEmail');
      const savedRememberMe = localStorage.getItem('rememberMe') === 'true';

      if (savedEmail && savedRememberMe && !emailFromUrl) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch (error) {
      console.error('Error loading saved credentials:', error);
    }
  }, [emailFromUrl]);

  const handleLoginSuccess = (response: LoginResponse) => {
    const user: User = {
      id: response.user.id,
      tenantId: response.user.tenant_id,
      email: response.user.email,
      name: response.user.name,
      role: response.user.role,
      phone: response.user.phone,
      avatarUrl: response.user.avatar_url,
      isActive: response.user.is_active,
      permissions: {
        // Job Descriptions - Granular CRUD
        canReadJD: response.user.permissions.can_view_jd,
        canCreateJD: response.user.permissions.can_create_jd,
        canUpdateJD: response.user.permissions.can_update_jd,
        canDeleteJD: response.user.permissions.can_delete_jd,
        canManageJD: response.user.permissions.can_manage_jd,
        // Resumes - Granular CRUD
        canViewResumes: response.user.permissions.can_view_resumes,
        canUploadResumes: response.user.permissions.can_upload_resumes,
        canUpdateResumes: response.user.permissions.can_update_resumes,
        canDeleteResumes: response.user.permissions.can_delete_resumes,
        // Resume Database - Granular CRUD
        canAccessInternalDB: response.user.permissions.can_access_internal_db,
        canViewInternalDB: response.user.permissions.can_view_internal_db,
        // Assessments - Granular CRUD
        canViewAssessments: response.user.permissions.can_view_assessments,
        canCreateAssessments: response.user.permissions.can_create_assessments,
        canUpdateAssessments: response.user.permissions.can_update_assessments,
        canDeleteAssessments: response.user.permissions.can_delete_assessments,
        // Analytics & Reports
        canViewAnalytics: response.user.permissions.can_view_analytics,
        // Settings & Admin
        canManageSettings: response.user.permissions.can_manage_settings,
        canManageUsers: response.user.permissions.can_manage_users,
        // Billing permissions
        canViewBilling: response.user.permissions.can_view_billing,
        canViewInvoices: response.user.permissions.can_view_invoices,
        canViewUsage: response.user.permissions.can_view_usage,
        // Feature permissions
        canViewScoring: response.user.permissions.can_view_scoring,
        canRunScoring: response.user.permissions.can_run_scoring,
        canRunAiInterviews: response.user.permissions.can_run_ai_interviews,
        canViewAiMatch: response.user.permissions.can_view_ai_match,
        canRunAiMatch: response.user.permissions.can_run_ai_match,
        canBulkOperations: response.user.permissions.can_bulk_operations,
        canExport: response.user.permissions.can_export,
        canApiAccess: response.user.permissions.can_api_access,
      },
      lastLogin: response.user.last_login,
      createdAt: response.user.created_at,
      // Feature flags and tenant status
      featureFlags: response.user.feature_flags,
      enabledFeatures: response.user.enabled_features,
      tenantStatus: response.user.tenant_status,
    };

    // Pass tenant name from login response
    login(user, response.tenant_name);

    // Save or clear email based on "Remember me" checkbox
    try {
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberedEmail');
        localStorage.removeItem('rememberMe');
      }
    } catch (error) {
      console.error('Error saving remember me preference:', error);
    }

    // Check if tenant has pending payment - redirect to payment page first
    if (response.pending_payment && response.pending_payment_redirect) {
      console.log('[LOGIN] Tenant has pending payment, redirecting to:', response.pending_payment_redirect);
      router.push(response.pending_payment_redirect);
      return;
    }

    // Redirect to current-plan page with selected plan if coming from pricing
    if (encodedPlanFromUrl) {
      router.push(`/subscription/current-plan?plan=${encodedPlanFromUrl}`);
    } else {
      router.push('/dashboard');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await authService.login({ email, password, subdomain: subdomain || undefined });

      // Check if 2FA is required
      if (isTwoFactorRequired(response)) {
        console.log('[LOGIN] 2FA required, showing OTP input');
        setTempToken(response.temp_token);
        setUserEmail2FA(response.user_email);
        setShow2FA(true);
        setIsLoading(false);
        // Focus first OTP input
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
        return;
      }

      // Normal login success
      handleLoginSuccess(response);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid email or password. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otpCode];
    newOtp[index] = value.slice(-1); // Only take last digit
    setOtpCode(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otpCode];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtpCode(newOtp);
    if (pastedData.length === 6) {
      otpInputRefs.current[5]?.focus();
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpCode.join('');
    if (code.length !== 6) {
      setError('Please enter a 6-digit verification code');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await authService.verify2FALogin(tempToken, code);
      handleLoginSuccess(response);
    } catch (err: any) {
      console.error('2FA verification error:', err);
      setError(err.message || 'Invalid verification code. Please try again.');
      setOtpCode(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack2FA = () => {
    setShow2FA(false);
    setTempToken('');
    setOtpCode(['', '', '', '', '', '']);
    setUserEmail2FA('');
    setError('');
  };

  // Styles
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

  const logoContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
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

  const brandNameStyle: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 700,
    color: '#111827',
  };

  const brandSubtitleStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#2563EB',
  };

  const headlineStyle: React.CSSProperties = {
    fontSize: '48px',
    fontWeight: 700,
    color: '#111827',
    lineHeight: 1.2,
    marginBottom: '24px',
  };

  const gradientTextStyle: React.CSSProperties = {
    background: 'linear-gradient(to right, #2563EB, #4338CA)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: '18px',
    color: '#6B7280',
    lineHeight: 1.6,
    marginBottom: '32px',
    maxWidth: '480px',
  };

  const featureItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
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

  const backButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#6B7280',
    fontSize: '14px',
    marginBottom: '24px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  };

  const mobileLogoStyle: React.CSSProperties = {
    display: isMobile ? 'flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '32px',
  };

  const formTitleStyle: React.CSSProperties = {
    fontSize: '28px',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '8px',
  };

  const formSubtitleStyle: React.CSSProperties = {
    color: '#6B7280',
    marginBottom: '32px',
  };

  const errorBoxStyle: React.CSSProperties = {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  };

  const inputGroupStyle: React.CSSProperties = {
    marginBottom: '20px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
  };

  const inputContainerStyle: React.CSSProperties = {
    position: 'relative',
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
    paddingRight: '16px',
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

  const rememberRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  };

  const checkboxLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  };

  const forgotLinkStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#2563EB',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
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
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: '0 10px 40px rgba(37, 99, 235, 0.3)',
    transition: 'all 0.2s',
  };

  const footerStyle: React.CSSProperties = {
    marginTop: '32px',
    paddingTop: '24px',
    borderTop: '1px solid #E5E7EB',
  };

  const footerTextStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: '14px',
    color: '#4B5563',
    marginBottom: '12px',
  };

  const switchLinkStyle: React.CSSProperties = {
    color: '#2563EB',
    fontWeight: 500,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  };

  const copyrightStyle: React.CSSProperties = {
    marginTop: '24px',
    textAlign: 'center',
    fontSize: '14px',
    color: '#9CA3AF',
  };

  return (
    <div style={containerStyle}>
      {/* Background Blobs */}
      <div style={{ position: 'absolute', top: 80, left: 40, width: 288, height: 288, backgroundColor: '#93C5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', top: 160, right: 40, width: 288, height: 288, backgroundColor: '#C4B5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', bottom: -32, left: '50%', width: 288, height: 288, backgroundColor: '#A5B4FC', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>

      <div style={contentStyle}>
        {/* Left Side - Branding */}
        <div style={leftSideStyle}>
          <div style={logoContainerStyle}>
            <div style={logoBoxStyle}>
              <Briefcase style={{ width: 28, height: 28, color: '#ffffff' }} />
            </div>
            <div>
              <div style={brandNameStyle}>TalentFlow</div>
              <div style={brandSubtitleStyle}>Recruitment Platform</div>
            </div>
          </div>

          <h2 style={headlineStyle}>
            Streamline Your<br />
            <span style={gradientTextStyle}>Recruitment Process</span>
          </h2>

          <p style={descriptionStyle}>
            Manage candidates, track applications, and make data-driven hiring decisions with our all-in-one recruitment platform.
          </p>

          <div>
            <div style={featureItemStyle}>
              <div style={featureIconBoxStyle('#DBEAFE')}>
                <Sparkles style={{ width: 20, height: 20, color: '#2563EB' }} />
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 500 }}>AI-Powered Resume Parsing</div>
                <div style={{ fontSize: 14, color: '#6B7280' }}>Automated candidate screening and matching</div>
              </div>
            </div>
            <div style={featureItemStyle}>
              <div style={featureIconBoxStyle('#E0E7FF')}>
                <Sparkles style={{ width: 20, height: 20, color: '#4338CA' }} />
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 500 }}>Smart Assessment Tools</div>
                <div style={{ fontSize: 14, color: '#6B7280' }}>LLM-driven candidate evaluations</div>
              </div>
            </div>
            <div style={featureItemStyle}>
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
            {/* Back Button */}
            {onBackToPublic && (
              <button type="button" onClick={onBackToPublic} style={backButtonStyle}>
                <ArrowLeft style={{ width: 16, height: 16 }} />
                <span>Back to Home</span>
              </button>
            )}

            {/* Mobile Logo */}
            <div style={mobileLogoStyle}>
              <div style={{ ...logoBoxStyle, width: 48, height: 48 }}>
                <Briefcase style={{ width: 24, height: 24, color: '#ffffff' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>TalentFlow</div>
                <div style={{ fontSize: 12, color: '#2563EB' }}>Recruitment Platform</div>
              </div>
            </div>

            {/* 2FA Verification View */}
            {show2FA ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <button type="button" onClick={handleBack2FA} style={backButtonStyle}>
                    <ArrowLeft style={{ width: 16, height: 16 }} />
                    <span>Back</span>
                  </button>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    boxShadow: '0 10px 40px rgba(16, 185, 129, 0.3)',
                  }}>
                    <Shield style={{ width: 32, height: 32, color: '#ffffff' }} />
                  </div>
                  <h2 style={formTitleStyle}>Two-Factor Authentication</h2>
                  <p style={{ ...formSubtitleStyle, marginBottom: '8px' }}>
                    Enter the 6-digit code from your authenticator app
                  </p>
                  <p style={{ fontSize: '14px', color: '#9CA3AF' }}>
                    Logging in as <strong style={{ color: '#374151' }}>{userEmail2FA}</strong>
                  </p>
                </div>

                {error && (
                  <div style={errorBoxStyle}>
                    <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: '#991B1B' }}>{error}</span>
                  </div>
                )}

                <form onSubmit={handleVerify2FA}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
                    {otpCode.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => { otpInputRefs.current[index] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={index === 0 ? handleOtpPaste : undefined}
                        style={{
                          width: '48px',
                          height: '56px',
                          textAlign: 'center',
                          fontSize: '24px',
                          fontWeight: 600,
                          border: '2px solid #D1D5DB',
                          borderRadius: '12px',
                          backgroundColor: '#F9FAFB',
                          outline: 'none',
                          transition: 'all 0.2s',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#2563EB';
                          e.target.style.backgroundColor = '#ffffff';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#D1D5DB';
                          e.target.style.backgroundColor = '#F9FAFB';
                        }}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otpCode.join('').length !== 6}
                    style={{
                      ...submitButtonStyle,
                      opacity: isLoading || otpCode.join('').length !== 6 ? 0.5 : 1,
                      cursor: isLoading || otpCode.join('').length !== 6 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <div style={{ width: 20, height: 20, border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        Verifying...
                      </>
                    ) : (
                      <>
                        <KeyRound style={{ width: 20, height: 20 }} />
                        Verify & Sign In
                      </>
                    )}
                  </button>
                </form>

                <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: '#6B7280' }}>
                  Open your authenticator app (Google Authenticator, Authy, etc.) to view your verification code.
                </p>
              </>
            ) : (
              <>
                {/* Tenant subdomain banner */}
                {subdomain && (
                  <div style={{
                    marginBottom: '20px',
                    padding: '10px 14px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <Building2 style={{ width: 16, height: 16, color: '#2563EB', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: '#1D4ED8' }}>
                      Signing in to <strong style={{ textTransform: 'capitalize' }}>{subdomain}</strong> workspace
                    </span>
                  </div>
                )}

                <h2 style={formTitleStyle}>Welcome Back</h2>
                <p style={formSubtitleStyle}>Sign in to access your recruitment dashboard</p>

                {error && (
                  <div style={errorBoxStyle}>
                    <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: '#991B1B' }}>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
              {/* Email */}
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Email Address</label>
                <div style={inputContainerStyle}>
                  <Mail style={{ ...inputIconStyle, width: 20, height: 20 }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Password</label>
                <div style={inputContainerStyle}>
                  <Lock style={{ ...inputIconStyle, width: 20, height: 20 }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    style={{ ...inputStyle, paddingRight: 48 }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeButtonStyle}>
                    {showPassword ? <EyeOff style={{ width: 20, height: 20 }} /> : <Eye style={{ width: 20, height: 20 }} />}
                  </button>
                </div>
              </div>

              {/* Remember & Forgot */}
              <div style={rememberRowStyle}>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ borderRadius: 4, cursor: 'pointer' }}
                  />
                  <span style={{ cursor: 'pointer' }}>Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(true)}
                  style={forgotLinkStyle}
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  ...submitButtonStyle,
                  opacity: isLoading ? 0.5 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? (
                  <>
                    <div style={{ width: 20, height: 20, border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In to Dashboard
                    <ArrowRight style={{ width: 20, height: 20 }} />
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div style={footerStyle}>
              {onSwitchToSignUp && (
                <p style={footerTextStyle}>
                  Don't have an account?{' '}
                  <button type="button" onClick={onSwitchToSignUp} style={switchLinkStyle}>
                    Create Account
                  </button>
                </p>
              )}
            </div>
              </>
            )}
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

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
      />
    </div>
  );
}
