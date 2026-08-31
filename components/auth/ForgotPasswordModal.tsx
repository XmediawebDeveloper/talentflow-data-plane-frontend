'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, Eye, EyeOff, CheckCircle, ArrowLeft, Loader2, AlertCircle, KeyRound, Send, ShieldOff, UserX } from 'lucide-react';
import authService from '@/lib/services/authService';
import { detectSubdomain } from '@/lib/utils/subdomain';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalStep = 'email' | 'otp' | 'password' | 'success' | 'firstLogin' | 'accountSuspended' | 'userDeactivated';

export default function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<ModalStep>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  // First-time-login flow (invited user who hasn't set their own password yet)
  const [firstLoginMessage, setFirstLoginMessage] = useState('');
  const [tempSentAgain, setTempSentAgain] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // The tenant this reset is scoped to — taken from the login page URL (subdomain / ?org=).
  const getTenantSubdomain = (): string | null =>
    detectSubdomain(typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : undefined);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('email');
        setEmail('');
        setOtpCode(['', '', '', '', '', '']);
        setNewPassword('');
        setConfirmPassword('');
        setResetToken('');
        setError('');
        setResendTimer(0);
        setFirstLoginMessage('');
        setTempSentAgain(false);
      }, 300);
    }
  }, [isOpen]);

  // Password strength validation
  const getPasswordStrength = (password: string) => {
    let strength = 0;
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password),
    };

    Object.values(checks).forEach(check => {
      if (check) strength++;
    });

    return { strength, checks };
  };

  const { strength, checks } = getPasswordStrength(newPassword);

  // Handle email submission
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await authService.forgotPassword(email, getTenantSubdomain());
      // Organization suspended by super admin — block reset entirely.
      if (res?.account_suspended) {
        setStep('accountSuspended');
        return;
      }
      // User deactivated by tenant admin — block reset entirely.
      if (res?.user_deactivated) {
        setStep('userDeactivated');
        return;
      }
      // Invited user who hasn't set their own password yet — block reset, guide to temp password.
      if (res?.requires_temp_password_login) {
        setFirstLoginMessage(res.message || '');
        setTempSentAgain(false);
        setStep('firstLogin');
        return;
      }
      setStep('otp');
      setResendTimer(60);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // First-time-login: send a fresh temporary password (invalidates the old one)
  const handleSendAgain = async () => {
    setError('');
    setIsLoading(true);
    try {
      await authService.resendTempPassword(email, getTenantSubdomain());
      setTempSentAgain(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send a new temporary password');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP input
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all digits entered
    if (newOtp.every(digit => digit) && newOtp.join('').length === 6) {
      handleOtpSubmit(newOtp.join(''));
    }
  };

  // Handle OTP paste
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(paste)) return;

    const newOtp = paste.split('');
    setOtpCode(newOtp);
    otpRefs.current[5]?.focus();
    handleOtpSubmit(paste);
  };

  // Handle OTP backspace
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Handle OTP submission
  const handleOtpSubmit = async (code?: string) => {
    const otpValue = code || otpCode.join('');
    if (otpValue.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await authService.verifyResetOTP(email, otpValue, getTenantSubdomain());
      setResetToken(response.reset_token);
      setStep('password');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
      setOtpCode(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password reset
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (strength < 5) {
      setError('Please meet all password requirements');
      return;
    }

    setIsLoading(true);

    try {
      await authService.resetPassword(resetToken, newPassword);
      setStep('success');
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;

    setError('');
    setIsLoading(true);

    try {
      await authService.forgotPassword(email, getTenantSubdomain());
      setOtpCode(['', '', '', '', '', '']);
      setResendTimer(60);
      otpRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };
  if (!isOpen) return null;

  // Copy for the header, kept in one place so the two lines never drift apart.
  const HEADINGS: Record<ModalStep, { title: string; subtitle: string }> = {
    email:            { title: 'Reset your password',   subtitle: 'We’ll send you a verification code' },
    otp:              { title: 'Enter verification code', subtitle: `Code sent to ${email}` },
    password:         { title: 'Create new password',    subtitle: 'Choose a strong password' },
    success:          { title: 'Password reset',         subtitle: 'You can now sign in with your new password' },
    firstLogin:       { title: 'Finish setting up your account', subtitle: 'This is your first sign-in' },
    accountSuspended: { title: 'Account suspended',      subtitle: 'Password reset is unavailable' },
    userDeactivated:  { title: 'Account deactivated',    subtitle: 'Password reset is unavailable' },
  };
  const heading = HEADINGS[step];

  return (
    <div
      className="tf-auth-scope"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16, 24, 40, 0.55)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading.title}
        style={{
          background: 'var(--tf-surface)',
          border: '1px solid var(--tf-border)',
          borderRadius: 'var(--tf-radius)',
          boxShadow: 'var(--tf-shadow)',
          width: '100%',
          maxWidth: 440,
          maxHeight: 'calc(100dvh - 2rem)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 22px',
          borderBottom: '1px solid var(--tf-border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.015em', color: 'var(--tf-ink)', margin: 0 }}>
              {heading.title}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--tf-ink-subtle)', margin: '3px 0 0' }}>
              {heading.subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="tf-auth-reveal"
            style={{ position: 'static', transform: 'none', width: 28, height: 28, flexShrink: 0 }}
            aria-label="Close"
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 22, flex: 1, overflowY: 'auto' }}>
          {/* Error Message */}
          {error && (
            <div className="tf-auth-alert tf-auth-alert--danger">
              <AlertCircle style={{ width: 17, height: 17 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Email Entry */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit}>
              <div className="tf-auth-field">
                <label className="tf-auth-label" htmlFor="tf-fp-email">Email address</label>
                <div className="tf-auth-control">
                  <span className="tf-auth-control-icon">
                    <Mail style={{ width: 17, height: 17 }} />
                  </span>
                  <input
                    id="tf-fp-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="tf-auth-input"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email}
                className={`tf-auth-btn${isLoading ? ' tf-auth-btn--busy' : ''}`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
                    Sending code…
                  </>
                ) : (
                  'Send verification code'
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="tf-auth-btn tf-auth-btn--outline"
                style={{ marginTop: 10, borderColor: 'var(--tf-border)', color: 'var(--tf-ink-muted)' }}
              >
                Back to sign in
              </button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === 'otp' && (
            <div>
              <p style={{ fontSize: 13.5, color: 'var(--tf-ink-muted)', textAlign: 'center', margin: '0 0 16px' }}>
                Enter the 6-digit code we sent to your email
              </p>
              <div className="tf-auth-otp-row" onPaste={handleOtpPaste}>
                {otpCode.map((digit, index) => (
                  <input
                    key={index}
                    /* Block body so the callback returns undefined. React 19 treats a
                       ref callback's return value as a cleanup function, and the concise
                       arrow returned the assigned element. */
                    ref={(el) => { otpRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    aria-label={`Digit ${index + 1} of 6`}
                    className="tf-auth-otp"
                  />
                ))}
              </div>

              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendTimer > 0 || isLoading}
                  className="tf-auth-link"
                  style={{ fontSize: 13.5 }}
                >
                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setStep('email')}
                className="tf-auth-btn tf-auth-btn--outline"
                style={{ marginTop: 18, borderColor: 'var(--tf-border)', color: 'var(--tf-ink-muted)' }}
              >
                <ArrowLeft style={{ width: 15, height: 15 }} />
                Change email
              </button>
            </div>
          )}

          {/* Step 3: New Password */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              <div className="tf-auth-field">
                <label className="tf-auth-label" htmlFor="tf-fp-new">New password</label>
                <div className="tf-auth-control">
                  <span className="tf-auth-control-icon">
                    <Lock style={{ width: 17, height: 17 }} />
                  </span>
                  <input
                    id="tf-fp-new"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="tf-auth-input tf-auth-input--reveal"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="tf-auth-reveal"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff style={{ width: 17, height: 17 }} /> : <Eye style={{ width: 17, height: 17 }} />}
                  </button>
                </div>
              </div>

              <div className="tf-auth-field">
                <label className="tf-auth-label" htmlFor="tf-fp-confirm">Confirm password</label>
                <div className="tf-auth-control">
                  <span className="tf-auth-control-icon">
                    <Lock style={{ width: 17, height: 17 }} />
                  </span>
                  <input
                    id="tf-fp-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="tf-auth-input tf-auth-input--reveal"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="tf-auth-reveal"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff style={{ width: 17, height: 17 }} /> : <Eye style={{ width: 17, height: 17 }} />}
                  </button>
                </div>
              </div>

              {/* Password Requirements */}
              <div className="tf-auth-panel" style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tf-ink-muted)', margin: '0 0 10px' }}>
                  Password requirements
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { label: 'At least 8 characters', check: checks.length },
                    { label: 'One uppercase letter', check: checks.uppercase },
                    { label: 'One lowercase letter', check: checks.lowercase },
                    { label: 'One number', check: checks.number },
                    { label: 'One special character', check: checks.special },
                  ].map((req, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle style={{
                        width: 15,
                        height: 15,
                        flexShrink: 0,
                        color: req.check ? 'var(--tf-success)' : 'var(--tf-border-strong)',
                      }} />
                      <span style={{ fontSize: 12.5, color: req.check ? 'var(--tf-ink-muted)' : 'var(--tf-ink-subtle)' }}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || strength < 5}
                className={`tf-auth-btn${isLoading ? ' tf-auth-btn--busy' : ''}`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
                    Resetting password…
                  </>
                ) : (
                  'Reset password'
                )}
              </button>
            </form>
          )}

          {/* First-time login: block reset, guide to temporary password */}
          {step === 'firstLogin' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, marginBottom: 18 }}>
                <div className="tf-auth-feature-icon" style={{ width: 48, height: 48 }}>
                  <KeyRound style={{ width: 22, height: 22 }} />
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--tf-ink-muted)', lineHeight: 1.6, margin: 0 }}>
                  {firstLoginMessage ||
                    'This looks like your first time signing in. Please sign in with the temporary password from your invite email, then set your own password.'}
                </p>
              </div>

              {tempSentAgain ? (
                <div className="tf-auth-alert tf-auth-alert--success">
                  <CheckCircle style={{ width: 17, height: 17 }} />
                  <span>
                    A new temporary password is on its way to <strong style={{ fontWeight: 600 }}>{email}</strong>.
                    Your previous temporary password no longer works — use the newest one.
                  </span>
                </div>
              ) : (
                <>
                  <div className="tf-auth-alert">
                    <AlertCircle style={{ width: 16, height: 16 }} />
                    <span>
                      Clicking <strong style={{ fontWeight: 600 }}>Send again</strong> invalidates your previous
                      temporary password. Only the newest one will work.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendAgain}
                    disabled={isLoading}
                    className={`tf-auth-btn${isLoading ? ' tf-auth-btn--busy' : ''}`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send style={{ width: 15, height: 15 }} />
                        Send again
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="tf-auth-btn tf-auth-btn--outline"
                style={{ marginTop: 10, borderColor: 'var(--tf-border)', color: 'var(--tf-ink-muted)' }}
              >
                <ArrowLeft style={{ width: 15, height: 15 }} />
                Back to sign in
              </button>
            </div>
          )}

          {/* Account Suspended: tenant suspended by super admin */}
          {step === 'accountSuspended' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, marginBottom: 18 }}>
                <div
                  className="tf-auth-feature-icon"
                  style={{ width: 48, height: 48, background: 'var(--tf-danger-tint)', color: 'var(--tf-danger)' }}
                >
                  <ShieldOff style={{ width: 22, height: 22 }} />
                </div>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tf-ink)', margin: '0 0 6px' }}>
                    Your organization&apos;s account has been suspended
                  </p>
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', lineHeight: 1.6, margin: 0 }}>
                    This account was suspended by the platform administrator. Password reset and sign-in
                    are currently unavailable for all users in this organization.
                  </p>
                </div>
              </div>

              <div className="tf-auth-alert tf-auth-alert--danger" style={{ display: 'block' }}>
                <div className="tf-auth-alert-title" style={{ marginBottom: 2 }}>What to do next</div>
                <div className="tf-auth-alert-body">
                  Please contact <strong style={{ fontWeight: 600 }}>TalentFlow support</strong> to resolve
                  the suspension and restore access to your account.
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="tf-auth-btn tf-auth-btn--outline"
                style={{ borderColor: 'var(--tf-border)', color: 'var(--tf-ink-muted)' }}
              >
                <ArrowLeft style={{ width: 15, height: 15 }} />
                Back to sign in
              </button>
            </div>
          )}

          {/* User Deactivated: user deactivated by tenant admin */}
          {step === 'userDeactivated' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, marginBottom: 18 }}>
                <div
                  className="tf-auth-feature-icon"
                  style={{ width: 48, height: 48, background: 'var(--tf-surface-sunken)', color: 'var(--tf-warning)' }}
                >
                  <UserX style={{ width: 22, height: 22 }} />
                </div>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tf-ink)', margin: '0 0 6px' }}>
                    Your account has been deactivated
                  </p>
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', lineHeight: 1.6, margin: 0 }}>
                    A workspace administrator has deactivated your account. You won&apos;t be able to reset
                    your password until the account is reactivated.
                  </p>
                </div>
              </div>

              <div className="tf-auth-alert" style={{ display: 'block' }}>
                <div className="tf-auth-alert-title" style={{ marginBottom: 2 }}>What to do next</div>
                <div className="tf-auth-alert-body">
                  Please contact your <strong style={{ fontWeight: 600 }}>organization administrator</strong> to
                  reactivate your account. Once reactivated, you&apos;ll be able to reset your password.
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="tf-auth-btn tf-auth-btn--outline"
                style={{ borderColor: 'var(--tf-border)', color: 'var(--tf-ink-muted)' }}
              >
                <ArrowLeft style={{ width: 15, height: 15 }} />
                Back to sign in
              </button>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div
                className="tf-auth-feature-icon"
                style={{
                  width: 52,
                  height: 52,
                  margin: '0 auto 18px',
                  background: 'var(--tf-success-tint)',
                  color: 'var(--tf-success-ink)',
                }}
              >
                <CheckCircle style={{ width: 26, height: 26 }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.015em', color: 'var(--tf-ink)', margin: '0 0 6px' }}>
                All set
              </h3>
              <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', lineHeight: 1.6, margin: '0 0 22px' }}>
                Your password has been reset successfully.<br />
                Redirecting to sign in…
              </p>
              <button onClick={onClose} className="tf-auth-btn">
                Return to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
