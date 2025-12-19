import { useState, useEffect } from 'react';
import { Briefcase, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Sparkles, Globe, ArrowLeft } from 'lucide-react';
import { User, Tenant } from '@/lib/types/tenant';
import { authService } from '../services/authService';

interface LoginProps {
  onLogin: (user: User, tenant?: Tenant) => void;
  onSwitchToSignUp?: () => void;
  onBackToPublic?: () => void;
}

export default function Login({ onLogin, onSwitchToSignUp, onBackToPublic }: LoginProps) {
  const [subdomain, setSubdomain] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!subdomain.trim()) {
      setError('Please enter your company subdomain');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authService.login({ subdomain: subdomain.toLowerCase(), email, password });

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
          canCreateJD: response.user.permissions.can_create_jd,
          canManageJD: response.user.permissions.can_manage_jd,
          canUploadResumes: response.user.permissions.can_upload_resumes,
          canViewResumes: response.user.permissions.can_view_resumes,
          canAccessInternalDB: response.user.permissions.can_access_internal_db,
          canCreateAssessments: response.user.permissions.can_create_assessments,
          canViewAnalytics: response.user.permissions.can_view_analytics,
          canManageSettings: response.user.permissions.can_manage_settings,
          canManageUsers: response.user.permissions.can_manage_users,
        },
        lastLogin: response.user.last_login,
        createdAt: response.user.created_at,
      };

      onLogin(user);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid subdomain, email or password. Please check your credentials.');
    } finally {
      setIsLoading(false);
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

  const subdomainInputStyle: React.CSSProperties = {
    ...inputStyle,
    paddingRight: '130px',
  };

  const subdomainSuffixStyle: React.CSSProperties = {
    position: 'absolute',
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
    fontSize: '14px',
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

            <h2 style={formTitleStyle}>Welcome Back</h2>
            <p style={formSubtitleStyle}>Sign in to access your recruitment dashboard</p>

            {error && (
              <div style={errorBoxStyle}>
                <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: '#991B1B' }}>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Subdomain */}
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Company Subdomain</label>
                <div style={inputContainerStyle}>
                  <Globe style={{ ...inputIconStyle, width: 20, height: 20 }} />
                  <input
                    type="text"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="your-company"
                    required
                    style={subdomainInputStyle}
                  />
                  <div style={subdomainSuffixStyle}>.talentflow.com</div>
                </div>
                <p style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>Enter your company's subdomain to sign in</p>
              </div>

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
                  <input type="checkbox" style={{ borderRadius: 4 }} />
                  <span>Remember me</span>
                </label>
                <button type="button" style={forgotLinkStyle}>Forgot password?</button>
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
              <p style={footerTextStyle}>
                Need help accessing your account?{' '}
                <button type="button" style={switchLinkStyle}>Contact Support</button>
              </p>
            </div>
          </div>

          <div style={copyrightStyle}>
            © 2025 TalentFlow. All rights reserved.
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
