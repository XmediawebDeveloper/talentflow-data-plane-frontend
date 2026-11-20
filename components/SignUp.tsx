import { useState, useEffect } from 'react';
import {
  Briefcase, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft,
  Building2, User, Globe, CheckCircle, XCircle, Loader2, Phone
} from 'lucide-react';
import { User as UserType } from '@/lib/types/tenant';
import { setTokens } from '@/lib/services/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface SignUpProps {
  onSignUp: (user: UserType) => void;
  onSwitchToLogin: () => void;
  onBackToPublic?: () => void;
}

interface SignUpForm {
  companyName: string;
  subdomain: string;
  adminEmail: string;
  adminName: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
}

export default function SignUp({ onSignUp, onSwitchToLogin, onBackToPublic }: SignUpProps) {
  const [form, setForm] = useState<SignUpForm>({
    companyName: '',
    subdomain: '',
    adminEmail: '',
    adminName: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [subdomainMessage, setSubdomainMessage] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(14);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch trial days from API
  useEffect(() => {
    const fetchTrialDays = async () => {
      try {
        const response = await fetch(`${API_URL}/addons/free-trial`);
        if (response.ok) {
          const result = await response.json();
          const days = result?.data?.trial_days || 14;
          setTrialDays(days);
        }
      } catch (err) {
        console.error('Error fetching trial days:', err);
      }
    };
    fetchTrialDays();
  }, []);

  // Auto-generate subdomain from company name
  useEffect(() => {
    if (form.companyName && !form.subdomain) {
      const generated = form.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20);
      if (generated.length >= 3) {
        setForm(prev => ({ ...prev, subdomain: generated }));
      }
    }
  }, [form.companyName]);

  // Check subdomain availability with debounce
  useEffect(() => {
    if (form.subdomain.length < 3) {
      setSubdomainStatus('idle');
      setSubdomainMessage('');
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSubdomainStatus('checking');
      try {
        const response = await api.post('/signup/check-subdomain', {
          subdomain: form.subdomain
        });
        if (response.data.available) {
          setSubdomainStatus('available');
          setSubdomainMessage(response.data.message);
        } else {
          setSubdomainStatus('taken');
          setSubdomainMessage(response.data.message);
        }
      } catch (err) {
        setSubdomainStatus('idle');
        setSubdomainMessage('Could not check availability');
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [form.subdomain]);

  const handleChange = (field: keyof SignUpForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    setError('');
  };

  const validateForm = (): string | null => {
    if (!form.companyName.trim()) return 'Company name is required';
    if (form.subdomain.length < 3) return 'Subdomain must be at least 3 characters';
    if (subdomainStatus === 'taken') return 'Please choose a different subdomain';
    if (!form.adminEmail.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) return 'Invalid email format';
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
      // Call localhost API only - backend will forward to admin API (192.168.1.110:8000)
      const response = await fetch(`${API_URL}/signup/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_name: form.companyName,
          subdomain: form.subdomain.toLowerCase(),
          email: form.adminEmail,
          full_name: form.adminName,
          password: form.password,
          terms_accepted: true,
          privacy_accepted: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Registration failed');
      }

      // Store tokens if provided
      if (data.access_token && data.refresh_token) {
        await setTokens(data.access_token, data.refresh_token);
      }

      // Convert to User type and login
      const user: UserType = {
        id: data.tenant_id || data.id || crypto.randomUUID(),
        tenantId: data.tenant_id || data.id,
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

      onSignUp(user);
    } catch (err: any) {
      console.error('Signup error:', err);
      const message = err.message || 'Registration failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, var(--raw-f8fafc) 0%, var(--raw-eef2ff) 50%, var(--raw-e0e7ff) 100%)',
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
    background: 'linear-gradient(135deg, var(--raw-2563eb), var(--raw-4338ca))',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 40px var(--raw-rgba-37-99-235-0p3)',
  };

  const brandNameStyle: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 700,
    color: 'var(--raw-111827)',
  };

  const brandSubtitleStyle: React.CSSProperties = {
    fontSize: '14px',
    color: 'var(--raw-2563eb)',
  };

  const headlineStyle: React.CSSProperties = {
    fontSize: '48px',
    fontWeight: 700,
    color: 'var(--raw-111827)',
    lineHeight: 1.2,
    marginBottom: '24px',
  };

  const gradientTextStyle: React.CSSProperties = {
    background: 'linear-gradient(to right, var(--raw-2563eb), var(--raw-4338ca))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: '18px',
    color: 'var(--raw-6b7280)',
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
    width: isMobile ? '100%' : '520px',
    flexShrink: 0,
  };

  const formCardStyle: React.CSSProperties = {
    backgroundColor: 'var(--raw-ffffff)',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px var(--raw-rgba-0-0-0-0p15)',
    padding: isMobile ? '32px' : '40px',
    border: '1px solid var(--raw-f3f4f6)',
  };

  const backButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--raw-6b7280)',
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
    color: 'var(--raw-111827)',
    marginBottom: '8px',
  };

  const formSubtitleStyle: React.CSSProperties = {
    color: 'var(--raw-6b7280)',
    marginBottom: '24px',
  };

  const errorBoxStyle: React.CSSProperties = {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: 'var(--raw-fef2f2)',
    border: '1px solid var(--raw-fecaca)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  };

  const inputGroupStyle: React.CSSProperties = {
    marginBottom: '16px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--raw-374151)',
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
    color: 'var(--raw-9ca3af)',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    paddingLeft: '48px',
    paddingRight: '16px',
    paddingTop: '12px',
    paddingBottom: '12px',
    border: '1px solid var(--raw-d1d5db)',
    borderRadius: '12px',
    fontSize: '16px',
    color: 'var(--raw-111827)',
    backgroundColor: 'var(--raw-f9fafb)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.2s',
  };

  const subdomainInputStyle: React.CSSProperties = {
    ...inputStyle,
    paddingRight: '150px',
  };

  const subdomainSuffixStyle: React.CSSProperties = {
    position: 'absolute',
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--raw-9ca3af)',
    fontSize: '14px',
  };

  const passwordGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  };

  const eyeButtonStyle: React.CSSProperties = {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--raw-9ca3af)',
  };

  const checkboxContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '24px',
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
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: '0 10px 40px var(--raw-rgba-37-99-235-0p3)',
    transition: 'all 0.2s',
  };

  const footerStyle: React.CSSProperties = {
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid var(--raw-e5e7eb)',
    textAlign: 'center',
  };

  const switchLinkStyle: React.CSSProperties = {
    color: 'var(--raw-2563eb)',
    fontWeight: 500,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  };

  const copyrightStyle: React.CSSProperties = {
    marginTop: '24px',
    textAlign: 'center',
    fontSize: '14px',
    color: 'var(--raw-9ca3af)',
  };

  const SubdomainIndicator = () => {
    if (subdomainStatus === 'checking') {
      return <Loader2 style={{ width: 20, height: 20, color: 'var(--raw-9ca3af)', animation: 'spin 1s linear infinite' }} />;
    }
    if (subdomainStatus === 'available') {
      return <CheckCircle style={{ width: 20, height: 20, color: 'var(--raw-22c55e)' }} />;
    }
    if (subdomainStatus === 'taken') {
      return <XCircle style={{ width: 20, height: 20, color: 'var(--raw-ef4444)' }} />;
    }
    return null;
  };

  return (
    <div style={containerStyle}>
      {/* Background Blobs */}
      <div style={{ position: 'absolute', top: 80, left: 40, width: 288, height: 288, backgroundColor: 'var(--raw-93c5fd)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', top: 160, right: 40, width: 288, height: 288, backgroundColor: 'var(--raw-c4b5fd)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', bottom: -32, left: '50%', width: 288, height: 288, backgroundColor: 'var(--raw-a5b4fc)', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>

      <div style={contentStyle}>
        {/* Left Side - Branding */}
        <div style={leftSideStyle}>
          <div style={logoContainerStyle}>
            <div style={logoBoxStyle}>
              <Briefcase style={{ width: 28, height: 28, color: 'var(--raw-ffffff)' }} />
            </div>
            <div>
              <div style={brandNameStyle}>TalentFlow</div>
              <div style={brandSubtitleStyle}>Recruitment Platform</div>
            </div>
          </div>

          <h2 style={headlineStyle}>
            Start Your<br />
            <span style={gradientTextStyle}>Recruitment Journey</span>
          </h2>

          <p style={descriptionStyle}>
            Create your organization's recruitment workspace in minutes. Get your own subdomain and start hiring smarter today.
          </p>

          <div>
            <div style={featureItemStyle}>
              <div style={featureIconBoxStyle('var(--raw-dcfce7)')}>
                <CheckCircle style={{ width: 20, height: 20, color: 'var(--raw-16a34a)' }} />
              </div>
              <div>
                <div style={{ color: 'var(--raw-111827)', fontWeight: 500 }}>{trialDays}-{trialDays === 1 ? 'Day' : 'Days'} Free Trial</div>
                <div style={{ fontSize: 14, color: 'var(--raw-6b7280)' }}>No credit card required</div>
              </div>
            </div>
            <div style={featureItemStyle}>
              <div style={featureIconBoxStyle('var(--raw-dbeafe)')}>
                <Globe style={{ width: 20, height: 20, color: 'var(--raw-2563eb)' }} />
              </div>
              <div>
                <div style={{ color: 'var(--raw-111827)', fontWeight: 500 }}>Your Own Subdomain</div>
                <div style={{ fontSize: 14, color: 'var(--raw-6b7280)' }}>yourcompany.talentflow.app</div>
              </div>
            </div>
            <div style={featureItemStyle}>
              <div style={featureIconBoxStyle('var(--raw-ede9fe)')}>
                <Building2 style={{ width: 20, height: 20, color: 'var(--raw-7c3aed)' }} />
              </div>
              <div>
                <div style={{ color: 'var(--raw-111827)', fontWeight: 500 }}>Isolated Workspace</div>
                <div style={{ fontSize: 14, color: 'var(--raw-6b7280)' }}>Secure, dedicated database for your data</div>
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
                <Briefcase style={{ width: 24, height: 24, color: 'var(--raw-ffffff)' }} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--raw-111827)' }}>TalentFlow</div>
                <div style={{ fontSize: 12, color: 'var(--raw-2563eb)' }}>Recruitment Platform</div>
              </div>
            </div>

            <h2 style={formTitleStyle}>Create Account</h2>
            <p style={formSubtitleStyle}>Set up your recruitment workspace</p>

            {error && (
              <div style={errorBoxStyle}>
                <AlertCircle style={{ width: 20, height: 20, color: 'var(--raw-dc2626)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: 'var(--raw-991b1b)' }}>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Company Name */}
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Company Name</label>
                <div style={inputContainerStyle}>
                  <Building2 style={{ ...inputIconStyle, width: 20, height: 20 }} />
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

              {/* Subdomain */}
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Subdomain</label>
                <div style={inputContainerStyle}>
                  <Globe style={{ ...inputIconStyle, width: 20, height: 20 }} />
                  <input
                    type="text"
                    value={form.subdomain}
                    onChange={handleChange('subdomain')}
                    placeholder="acme"
                    required
                    style={subdomainInputStyle}
                  />
                  <div style={subdomainSuffixStyle}>
                    <span>.talentflow.app</span>
                    <SubdomainIndicator />
                  </div>
                </div>
                {subdomainMessage && (
                  <p style={{ marginTop: 4, fontSize: 12, color: subdomainStatus === 'available' ? 'var(--raw-16a34a)' : 'var(--raw-dc2626)' }}>
                    {subdomainMessage}
                  </p>
                )}
              </div>

              {/* Admin Name */}
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Your Name</label>
                <div style={inputContainerStyle}>
                  <User style={{ ...inputIconStyle, width: 20, height: 20 }} />
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

              {/* Email */}
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Work Email</label>
                <div style={inputContainerStyle}>
                  <Mail style={{ ...inputIconStyle, width: 20, height: 20 }} />
                  <input
                    type="email"
                    value={form.adminEmail}
                    onChange={handleChange('adminEmail')}
                    placeholder="john@acme.com"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Phone Number</label>
                <div style={inputContainerStyle}>
                  <Phone style={{ ...inputIconStyle, width: 20, height: 20 }} />
                  <input
                    type="tel"
                    value={form.phoneNumber}
                    onChange={handleChange('phoneNumber')}
                    placeholder="+91 98765 43210"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Passwords */}
              <div style={passwordGridStyle}>
                <div>
                  <label style={labelStyle}>Password</label>
                  <div style={inputContainerStyle}>
                    <Lock style={{ ...inputIconStyle, width: 20, height: 20 }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={handleChange('password')}
                      placeholder="Min 8 chars"
                      required
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeButtonStyle}>
                      {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Confirm Password</label>
                  <div style={inputContainerStyle}>
                    <Lock style={{ ...inputIconStyle, width: 20, height: 20 }} />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={handleChange('confirmPassword')}
                      placeholder="Confirm password"
                      required
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={eyeButtonStyle}>
                      {showConfirmPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Terms */}
              <div style={checkboxContainerStyle}>
                <input type="checkbox" id="terms" required style={{ marginTop: 4 }} />
                <label htmlFor="terms" style={{ fontSize: 14, color: 'var(--raw-4b5563)' }}>
                  I agree to the{' '}
                  <button type="button" style={{ ...switchLinkStyle, fontSize: 14 }}>Terms of Service</button>
                  {' '}and{' '}
                  <button type="button" style={{ ...switchLinkStyle, fontSize: 14 }}>Privacy Policy</button>
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || subdomainStatus === 'taken'}
                style={{
                  ...submitButtonStyle,
                  opacity: isLoading || subdomainStatus === 'taken' ? 0.5 : 1,
                  cursor: isLoading || subdomainStatus === 'taken' ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
                    Creating your workspace...
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
            <div style={footerStyle}>
              <span style={{ fontSize: 14, color: 'var(--raw-4b5563)' }}>
                Already have an account?{' '}
                <button onClick={onSwitchToLogin} style={switchLinkStyle}>
                  Sign In
                </button>
              </span>
            </div>
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
