import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Sparkles, Globe, ArrowLeft } from 'lucide-react';
import { User, Tenant } from '@/lib/types/tenant';
import { authService, type LoginResponse } from '@/lib/services/authService';
import { encodeParam, encodePlanId } from '@/lib/utils/planEncoder';

interface LoginProps {
  onLogin: (user: User, tenant?: Tenant) => void;
  onSwitchToSignUp?: () => void;
  onBackToPublic?: () => void;
}

export default function Login({ onLogin, onSwitchToSignUp, onBackToPublic }: LoginProps) {
  const router = useRouter();
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
      // login() returns LoginResult = LoginResponse | TwoFactorRequiredResponse, and
      // only the first has `user`. This screen has never handled the 2FA variant -
      // it reads response.user straight away - so the cast states that existing
      // assumption instead of silently widening it. Runtime behaviour is unchanged;
      // adding a 2FA branch here would be a feature change, not a type fix.
      const response = (await authService.login({
        subdomain: subdomain.toLowerCase(), email, password,
      })) as LoginResponse;

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

      // Check if tenant has pending payment - redirect to payment page with encoded params
      if (response.pending_payment && response.pending_payment_redirect) {
        try {
          const url = new URL(response.pending_payment_redirect, window.location.origin);
          const rawTenantId = url.searchParams.get('tenant_id');
          const rawPlanId = url.searchParams.get('plan_id');
          if (rawTenantId && rawPlanId) {
            const encodedUrl = `/complete-payment?t=${encodeURIComponent(encodeParam(rawTenantId))}&p=${encodeURIComponent(encodePlanId(rawPlanId))}`;
            console.log('[LOGIN] Tenant has pending payment, redirecting to encoded URL');
            router.push(encodedUrl);
            return;
          }
        } catch {
          // Fallback to raw URL if parsing fails
        }
        console.log('[LOGIN] Tenant has pending payment, redirecting to:', response.pending_payment_redirect);
        router.push(response.pending_payment_redirect);
        return;
      }

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
    width: isMobile ? '100%' : '480px',
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
    marginBottom: '32px',
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
    marginBottom: '20px',
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
    paddingTop: '14px',
    paddingBottom: '14px',
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
    paddingRight: '130px',
  };

  const subdomainSuffixStyle: React.CSSProperties = {
    position: 'absolute',
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--raw-9ca3af)',
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
    color: 'var(--raw-9ca3af)',
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
    color: 'var(--raw-374151)',
    cursor: 'pointer',
  };

  const forgotLinkStyle: React.CSSProperties = {
    fontSize: '14px',
    color: 'var(--raw-2563eb)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
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
    marginTop: '32px',
    paddingTop: '24px',
    borderTop: '1px solid var(--raw-e5e7eb)',
  };

  const footerTextStyle: React.CSSProperties = {
    textAlign: 'center',
    fontSize: '14px',
    color: 'var(--raw-4b5563)',
    marginBottom: '12px',
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
            Streamline Your<br />
            <span style={gradientTextStyle}>Recruitment Process</span>
          </h2>

          <p style={descriptionStyle}>
            Manage candidates, track applications, and make data-driven hiring decisions with our all-in-one recruitment platform.
          </p>

          <div>
            <div style={featureItemStyle}>
              <div style={featureIconBoxStyle('var(--raw-dbeafe)')}>
                <Sparkles style={{ width: 20, height: 20, color: 'var(--raw-2563eb)' }} />
              </div>
              <div>
                <div style={{ color: 'var(--raw-111827)', fontWeight: 500 }}>AI-Powered Resume Parsing</div>
                <div style={{ fontSize: 14, color: 'var(--raw-6b7280)' }}>Automated candidate screening and matching</div>
              </div>
            </div>
            <div style={featureItemStyle}>
              <div style={featureIconBoxStyle('var(--raw-e0e7ff)')}>
                <Sparkles style={{ width: 20, height: 20, color: 'var(--raw-4338ca)' }} />
              </div>
              <div>
                <div style={{ color: 'var(--raw-111827)', fontWeight: 500 }}>Smart Assessment Tools</div>
                <div style={{ fontSize: 14, color: 'var(--raw-6b7280)' }}>LLM-driven candidate evaluations</div>
              </div>
            </div>
            <div style={featureItemStyle}>
              <div style={featureIconBoxStyle('var(--raw-ede9fe)')}>
                <Sparkles style={{ width: 20, height: 20, color: 'var(--raw-7c3aed)' }} />
              </div>
              <div>
                <div style={{ color: 'var(--raw-111827)', fontWeight: 500 }}>Centralized Database</div>
                <div style={{ fontSize: 14, color: 'var(--raw-6b7280)' }}>Organize and track all candidates in one place</div>
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

            <h2 style={formTitleStyle}>Welcome Back</h2>
            <p style={formSubtitleStyle}>Sign in to access your recruitment dashboard</p>

            {error && (
              <div style={errorBoxStyle}>
                <AlertCircle style={{ width: 20, height: 20, color: 'var(--raw-dc2626)', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: 'var(--raw-991b1b)' }}>{error}</span>
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
                <p style={{ marginTop: 6, fontSize: 12, color: 'var(--raw-6b7280)' }}>Enter your company's subdomain to sign in</p>
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
                    <div style={{ width: 20, height: 20, border: '2px solid var(--raw-ffffff)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
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
