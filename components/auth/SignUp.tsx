'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Briefcase, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft,
  Building2, User, CheckCircle, Loader2, Phone, ShieldCheck
} from 'lucide-react';
import { User as UserType } from '@/lib/types/tenant';
import { useAuth } from '@/lib/hooks/useAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

// List of blocked personal email domains
const BLOCKED_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com',
  'yandex.com', 'gmx.com', 'inbox.com', 'fastmail.com', 'tutanota.com',
  'me.com', 'mac.com', 'msn.com', 'qq.com', '163.com', '126.com',
  'rediffmail.com', 'yahoo.co.in', 'yahoo.co.uk', 'googlemail.com'
];

interface SignUpProps {
  onSwitchToLogin: () => void;
  onBackToPublic?: () => void;
}

interface SignUpForm {
  companyName: string;
  adminEmail: string;
  adminName: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
}

type SignUpStep = 'form' | 'verification' | 'success';

export default function SignUp({ onSwitchToLogin, onBackToPublic }: SignUpProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  // Get plan_id from URL query params (e.g., /signup?plan_id=21)
  const planIdFromUrl = searchParams.get('plan_id');

  const [form, setForm] = useState<SignUpForm>({
    companyName: '',
    adminEmail: '',
    adminName: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // OTP state (inline, not popup)
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Success state
  const [step, setStep] = useState<SignUpStep>('form');

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Validate business email
  const validateBusinessEmail = (email: string): boolean => {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;
    return !BLOCKED_EMAIL_DOMAINS.includes(domain);
  };

  const handleChange = (field: keyof SignUpForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');

    // Validate email in real-time
    if (field === 'adminEmail') {
      if (value && !validateBusinessEmail(value)) {
        setEmailError('Please use a business email address. Personal emails (Gmail, Yahoo, etc.) are not allowed.');
      } else {
        setEmailError('');
      }
    }
  };

  const validateForm = (): string | null => {
    if (!form.companyName.trim()) return 'Company name is required';
    if (!form.adminEmail.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) return 'Invalid email format';
    if (!validateBusinessEmail(form.adminEmail)) return 'Please use a business email address';
    if (!otpVerified) return 'Please verify your email with OTP first';
    if (!form.adminName.trim()) return 'Your name is required';
    if (!form.phoneNumber.trim()) return 'Phone number is required';
    if (form.password.length < 8) return 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      // Call complete-registration endpoint to create tenant
      const response = await fetch(`${API_URL}/signup/complete-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.adminEmail,
          password: form.password,
          full_name: form.adminName,
          company_name: form.companyName,
          phone_number: form.phoneNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle different error formats from backend
        let errorMessage = 'Registration failed. Please try again.';

        if (data.detail) {
          if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (Array.isArray(data.detail)) {
            errorMessage = data.detail.map((err: any) => {
              const field = err.loc ? err.loc[err.loc.length - 1] : '';
              const msg = err.msg || err.message || 'Invalid value';
              return field ? `${field}: ${msg}` : msg;
            }).join(', ');
          } else if (typeof data.detail === 'object' && data.detail.message) {
            errorMessage = data.detail.message;
          }
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      // Create user object from response
      const user: UserType = {
        id: data.tenant_id || crypto.randomUUID(),
        tenantId: data.tenant_id || crypto.randomUUID(),
        email: data.email || form.adminEmail,
        name: data.full_name || form.adminName,
        role: 'tenant_admin',
        isActive: true,
        permissions: {
          canCreateJD: true,
          canManageJD: true,
          canUploadResumes: true,
          canViewResumes: true,
          canAccessInternalDB: true,
          canCreateAssessments: true,
          canViewAnalytics: true,
          canManageSettings: true,
          canManageUsers: true,
        },
        createdAt: new Date().toISOString(),
      };

      // If we got tokens, store them
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
      }
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }

      login(user);
      setStep('success');

      // Redirect to dashboard after brief success message
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);

    } catch (err: any) {
      console.error('Signup error:', err);
      const message = err.message || 'Registration failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if email is valid for OTP
  const isEmailValidForOtp = () => {
    if (!form.adminEmail.trim()) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) return false;
    if (!validateBusinessEmail(form.adminEmail)) return false;
    return true;
  };

  // Send OTP to email
  const handleGetOtp = async () => {
    if (!isEmailValidForOtp()) {
      setEmailError('Please enter a valid business email first');
      return;
    }

    setIsSendingOtp(true);
    setError('');

    try {
      // Validate email format before proceeding
      const emailParts = form.adminEmail.split('@');
      if (emailParts.length !== 2 || !emailParts[1]) {
        throw new Error('Please enter a valid email address');
      }

      const domainParts = emailParts[1].split('.');
      if (domainParts.length < 2 || !domainParts[0]) {
        throw new Error('Please enter a valid email address with a domain');
      }

      const emailDomain = domainParts[0].toLowerCase();
      let subdomain = emailDomain.replace(/[^a-z0-9]/g, '').slice(0, 20);

      // Ensure subdomain is at least 3 characters
      if (subdomain.length < 3) {
        subdomain = subdomain.padEnd(3, '0');
      }

      const response = await fetch(`${API_URL}/signup/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_name: form.companyName || 'Pending',
          subdomain: subdomain,
          email: form.adminEmail,
          full_name: form.adminName || 'Pending',
          phone_number: form.phoneNumber || '',
          password: 'PLACEHOLDER_PENDING',  // Actual password sent in complete-registration
          terms_accepted: true,
          privacy_accepted: true,
          plan_id: planIdFromUrl ? parseInt(planIdFromUrl) : null,
        }),
      });

      const data = await response.json();
      console.log('API Response:', response.status, data);

      if (!response.ok) {
        // Handle different error formats from backend
        let errorMessage = 'Failed to send OTP. Please try again.';

        if (data.detail) {
          if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (Array.isArray(data.detail)) {
            // FastAPI validation errors - include field name for better clarity
            errorMessage = data.detail.map((err: any) => {
              const field = err.loc ? err.loc[err.loc.length - 1] : '';
              const msg = err.msg || err.message || 'Invalid value';
              return field ? `${field}: ${msg}` : msg;
            }).join(', ');
          } else if (typeof data.detail === 'object' && data.detail.message) {
            errorMessage = data.detail.message;
          }
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      setOtpSent(true);
      setResendTimer(60);
      // Focus first OTP input
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);

    } catch (err: any) {
      console.error('Send OTP error:', err);
      const errorMessage = err.message || 'Failed to send OTP. Please try again.';
      setError(errorMessage);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Handle OTP input
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...otpCode];
      digits.forEach((digit, i) => {
        if (index + i < 6) newCode[index + i] = digit;
      });
      setOtpCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      otpInputRefs.current[nextIndex]?.focus();

      // Auto verify if complete
      if (newCode.join('').length === 6) {
        verifyOtpCode(newCode.join(''));
      }
    } else {
      const newCode = [...otpCode];
      newCode[index] = value.replace(/\D/g, '');
      setOtpCode(newCode);

      if (value && index < 5) {
        otpInputRefs.current[index + 1]?.focus();
      }

      // Auto verify if complete
      if (newCode.join('').length === 6) {
        verifyOtpCode(newCode.join(''));
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Verify OTP code
  const verifyOtpCode = async (code: string) => {
    if (code.length !== 6) return;

    setIsVerifying(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/signup/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.adminEmail,
          code: code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle different error formats from backend
        let errorMessage = 'Invalid OTP code. Please try again.';

        if (data.detail) {
          if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (Array.isArray(data.detail)) {
            errorMessage = data.detail.map((err: any) => {
              const field = err.loc ? err.loc[err.loc.length - 1] : '';
              const msg = err.msg || err.message || 'Invalid value';
              return field ? `${field}: ${msg}` : msg;
            }).join(', ');
          } else if (typeof data.detail === 'object' && data.detail.message) {
            errorMessage = data.detail.message;
          }
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      setOtpVerified(true);

    } catch (err: any) {
      console.error('Verification error:', err);
      const errorMessage = err.message || 'Invalid OTP. Please try again.';
      setError(errorMessage);
      setOtpCode(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;

    setIsSendingOtp(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/signup/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.adminEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle different error formats from backend
        let errorMessage = 'Failed to resend OTP. Please try again.';

        if (data.detail) {
          if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (Array.isArray(data.detail)) {
            errorMessage = data.detail.map((err: any) => {
              const field = err.loc ? err.loc[err.loc.length - 1] : '';
              const msg = err.msg || err.message || 'Invalid value';
              return field ? `${field}: ${msg}` : msg;
            }).join(', ');
          } else if (typeof data.detail === 'object' && data.detail.message) {
            errorMessage = data.detail.message;
          }
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      setResendTimer(60);
      setOtpCode(['', '', '', '', '', '']);

    } catch (err: any) {
      const errorMessage = err.message || 'Failed to resend OTP. Please try again.';
      setError(errorMessage);
    } finally {
      setIsSendingOtp(false);
    }
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

  const formContainerStyle: React.CSSProperties = {
    width: isMobile ? '100%' : '520px',
    flexShrink: 0,
  };

  const formCardStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    padding: isMobile ? '32px' : '40px',
    border: '1px solid #F3F4F6',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    paddingLeft: '48px',
    paddingRight: '16px',
    paddingTop: '12px',
    paddingBottom: '12px',
    border: '1px solid #D1D5DB',
    borderRadius: '12px',
    fontSize: '16px',
    color: '#111827',
    backgroundColor: '#F9FAFB',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.2s',
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

  // Verification step removed - now handled inline in the form

  // Success Step UI
  if (step === 'success') {
    return (
      <div style={containerStyle}>
        <div style={{ ...formCardStyle, maxWidth: 440, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle style={{ width: 40, height: 40, color: '#16A34A' }} />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Welcome to TalentFlow!</h2>
          <p style={{ color: '#6B7280', marginBottom: 24 }}>Your account has been created successfully.</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6B7280' }}>
            <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
            Redirecting to dashboard...
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Main Form UI
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
              <div style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>TalentFlow</div>
              <div style={{ fontSize: 14, color: '#2563EB' }}>Recruitment Platform</div>
            </div>
          </div>

          <h2 style={{ fontSize: 48, fontWeight: 700, color: '#111827', lineHeight: 1.2, marginBottom: 24 }}>
            Start Your<br />
            <span style={{ background: 'linear-gradient(to right, #2563EB, #4338CA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Recruitment Journey</span>
          </h2>

          <p style={{ fontSize: 18, color: '#6B7280', lineHeight: 1.6, marginBottom: 32, maxWidth: 480 }}>
            Create your organization's recruitment workspace in minutes. Start hiring smarter today with AI-powered tools.
          </p>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle style={{ width: 20, height: 20, color: '#16A34A' }} />
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 500 }}>14-Day Free Trial</div>
                <div style={{ fontSize: 14, color: '#6B7280' }}>No credit card required</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck style={{ width: 20, height: 20, color: '#2563EB' }} />
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 500 }}>Business Email Verification</div>
                <div style={{ fontSize: 14, color: '#6B7280' }}>Secure account setup</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 style={{ width: 20, height: 20, color: '#7C3AED' }} />
              </div>
              <div>
                <div style={{ color: '#111827', fontWeight: 500 }}>Isolated Workspace</div>
                <div style={{ fontSize: 14, color: '#6B7280' }}>Secure, dedicated database for your data</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div style={formContainerStyle}>
          <div style={formCardStyle}>
            {/* Back Button */}
            {onBackToPublic && (
              <button type="button" onClick={onBackToPublic} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6B7280', fontSize: 14, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer' }}>
                <ArrowLeft style={{ width: 16, height: 16 }} />
                <span>Back to Home</span>
              </button>
            )}

            {/* Mobile Logo */}
            {isMobile && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
                <div style={{ ...logoBoxStyle, width: 48, height: 48 }}>
                  <Briefcase style={{ width: 24, height: 24, color: '#ffffff' }} />
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>TalentFlow</div>
                  <div style={{ fontSize: 12, color: '#2563EB' }}>Recruitment Platform</div>
                </div>
              </div>
            )}

            <h2 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Create Account</h2>
            <p style={{ color: '#6B7280', marginBottom: 24 }}>Set up your recruitment workspace</p>

            {error && (
              <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: '#991B1B' }}>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Company Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Company Name</label>
                <div style={{ position: 'relative' }}>
                  <Building2 style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#9CA3AF' }} />
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={handleChange('companyName')}
                    placeholder="Acme Corporation"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Admin Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Your Name</label>
                <div style={{ position: 'relative' }}>
                  <User style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#9CA3AF' }} />
                  <input
                    type="text"
                    value={form.adminName}
                    onChange={handleChange('adminName')}
                    placeholder="John Smith"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Work Email with OTP */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  Work Email <span style={{ color: '#6B7280', fontWeight: 400 }}>(Business email only)</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Mail style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#9CA3AF' }} />
                    <input
                      type="email"
                      value={form.adminEmail}
                      onChange={handleChange('adminEmail')}
                      placeholder="john@acme.com"
                      required
                      disabled={otpVerified}
                      style={{
                        ...inputStyle,
                        borderColor: otpVerified ? '#10B981' : emailError ? '#EF4444' : '#D1D5DB',
                        backgroundColor: otpVerified ? '#F0FDF4' : '#F9FAFB',
                      }}
                    />
                    {otpVerified && (
                      <CheckCircle style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#10B981' }} />
                    )}
                  </div>
                  {!otpVerified && (
                    <button
                      type="button"
                      onClick={handleGetOtp}
                      disabled={!isEmailValidForOtp() || isSendingOtp || otpSent}
                      style={{
                        padding: '12px 20px',
                        background: otpSent ? '#10B981' : isEmailValidForOtp() ? 'linear-gradient(to right, #2563EB, #4338CA)' : '#E5E7EB',
                        color: otpSent || isEmailValidForOtp() ? '#fff' : '#9CA3AF',
                        fontSize: 14,
                        fontWeight: 500,
                        borderRadius: 12,
                        border: 'none',
                        cursor: !isEmailValidForOtp() || isSendingOtp ? 'not-allowed' : 'pointer',
                        opacity: isSendingOtp ? 0.7 : 1,
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {isSendingOtp ? (
                        <>
                          <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                          Sending...
                        </>
                      ) : otpSent ? (
                        <>
                          <CheckCircle style={{ width: 16, height: 16 }} />
                          OTP Sent
                        </>
                      ) : (
                        'Get OTP'
                      )}
                    </button>
                  )}
                </div>
                {emailError && (
                  <p style={{ marginTop: 6, fontSize: 13, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle style={{ width: 14, height: 14 }} />
                    {emailError}
                  </p>
                )}

                {/* Inline OTP Input */}
                {otpSent && !otpVerified && (
                  <div style={{ marginTop: 16, padding: 16, backgroundColor: '#F0F9FF', borderRadius: 12, border: '1px solid #BAE6FD' }}>
                    <p style={{ fontSize: 13, color: '#0369A1', marginBottom: 12 }}>
                      Enter the 6-digit code sent to <strong>{form.adminEmail}</strong>
                    </p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                      {otpCode.map((digit, index) => (
                        <input
                          key={index}
                          ref={el => { otpInputRefs.current[index] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={digit}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(index, e)}
                          disabled={isVerifying}
                          style={{
                            width: 44,
                            height: 48,
                            textAlign: 'center',
                            fontSize: 20,
                            fontWeight: 600,
                            border: '2px solid #D1D5DB',
                            borderRadius: 8,
                            outline: 'none',
                            transition: 'all 0.2s',
                            backgroundColor: isVerifying ? '#F3F4F6' : '#fff',
                          }}
                          onFocus={(e) => { e.target.style.borderColor = '#2563EB'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#D1D5DB'; }}
                        />
                      ))}
                    </div>
                    {isVerifying && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#2563EB', fontSize: 13 }}>
                        <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                        Verifying...
                      </div>
                    )}
                    <div style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={isSendingOtp || resendTimer > 0}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: resendTimer > 0 ? '#9CA3AF' : '#2563EB',
                          fontWeight: 500,
                          cursor: resendTimer > 0 ? 'default' : 'pointer',
                          fontSize: 13,
                        }}
                      >
                        {isSendingOtp ? 'Sending...' : resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                      </button>
                    </div>
                  </div>
                )}

                {/* OTP Verified Success */}
                {otpVerified && (
                  <p style={{ marginTop: 8, fontSize: 13, color: '#059669', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle style={{ width: 14, height: 14 }} />
                    Email verified successfully
                  </p>
                )}
              </div>

              {/* Phone Number */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Phone Number</label>
                <div style={{ position: 'relative' }}>
                  <Phone style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#9CA3AF' }} />
                  <input
                    type="tel"
                    value={form.phoneNumber}
                    onChange={handleChange('phoneNumber')}
                    placeholder="+1 (555) 123-4567"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Passwords */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#9CA3AF' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={handleChange('password')}
                      placeholder="Min 8 chars"
                      required
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                      {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Confirm</label>
                  <div style={{ position: 'relative' }}>
                    <Lock style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#9CA3AF' }} />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={handleChange('confirmPassword')}
                      placeholder="Confirm"
                      required
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                      {showConfirmPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Terms */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 24 }}>
                <input type="checkbox" id="terms" required style={{ marginTop: 4 }} />
                <label htmlFor="terms" style={{ fontSize: 14, color: '#4B5563' }}>
                  I agree to the{' '}
                  <button type="button" style={{ color: '#2563EB', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Terms of Service</button>
                  {' '}and{' '}
                  <button type="button" style={{ color: '#2563EB', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Privacy Policy</button>
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || !!emailError || !otpVerified}
                style={{
                  ...submitButtonStyle,
                  opacity: isLoading || emailError || !otpVerified ? 0.5 : 1,
                  cursor: isLoading || emailError || !otpVerified ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
                    Creating your workspace...
                  </>
                ) : !otpVerified ? (
                  <>
                    Verify Email First
                    <Mail style={{ width: 20, height: 20 }} />
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight style={{ width: 20, height: 20 }} />
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #E5E7EB', textAlign: 'center' }}>
              <span style={{ fontSize: 14, color: '#4B5563' }}>
                Already have an account?{' '}
                <button onClick={onSwitchToLogin} style={{ color: '#2563EB', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Sign In
                </button>
              </span>
            </div>
          </div>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>
            © 2025 TalentFlow. All rights reserved.
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
