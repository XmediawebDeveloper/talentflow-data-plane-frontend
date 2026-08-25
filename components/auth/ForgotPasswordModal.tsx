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

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-md animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold">
            {step === 'email' && 'Reset Your Password'}
            {step === 'otp' && 'Enter Verification Code'}
            {step === 'password' && 'Create New Password'}
            {step === 'success' && 'Password Reset Successful!'}
            {step === 'firstLogin' && 'Finish Setting Up Your Account'}
            {step === 'accountSuspended' && 'Account Suspended'}
            {step === 'userDeactivated' && 'Account Deactivated'}
          </h2>
          <p className="text-blue-100 text-sm mt-1">
            {step === 'email' && 'We\'ll send you a verification code'}
            {step === 'otp' && `Code sent to ${email}`}
            {step === 'password' && 'Choose a strong password'}
            {step === 'success' && 'You can now login with your new password'}
            {step === 'firstLogin' && 'This is your first sign-in'}
            {step === 'accountSuspended' && 'Password reset is unavailable'}
            {step === 'userDeactivated' && 'Password reset is unavailable'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Step 1: Email Entry */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending Code...
                  </>
                ) : (
                  'Send Verification Code'
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-gray-600 dark:text-slate-400 hover:text-gray-800 font-medium transition-colors"
              >
                Back to Login
              </button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === 'otp' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-4 text-center">
                  Enter the 6-digit code we sent to your email
                </label>
                <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
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
                      className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 dark:border-slate-700 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                    />
                  ))}
                </div>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendTimer > 0 || isLoading}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                >
                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend Code'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setStep('email')}
                className="w-full py-3 text-gray-600 dark:text-slate-400 hover:text-gray-800 font-medium transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Change Email
              </button>
            </div>
          )}

          {/* Step 3: New Password */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full pl-11 pr-12 py-3 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-slate-500 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full pl-11 pr-12 py-3 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-slate-500 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Password Requirements */}
              <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Password Requirements:</p>
                <div className="space-y-1">
                  {[
                    { label: 'At least 8 characters', check: checks.length },
                    { label: 'One uppercase letter', check: checks.uppercase },
                    { label: 'One lowercase letter', check: checks.lowercase },
                    { label: 'One number', check: checks.number },
                    { label: 'One special character', check: checks.special },
                  ].map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle className={`w-4 h-4 ${req.check ? 'text-green-600' : 'text-gray-300 dark:text-slate-500'}`} />
                      <span className={`text-sm ${req.check ? 'text-green-700' : 'text-gray-600 dark:text-slate-400'}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || strength < 5}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}

          {/* First-time login: block reset, guide to temporary password */}
          {step === 'firstLogin' && (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
                  <KeyRound className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-gray-700 dark:text-slate-300 text-sm leading-relaxed">
                  {firstLoginMessage ||
                    'This looks like your first time signing in. Please log in with the temporary password from your invite email, then set your own password.'}
                </p>
              </div>

              {tempSentAgain ? (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-800 dark:text-green-300">
                    A new temporary password is on its way to <strong>{email}</strong>. Your previous
                    temporary password no longer works — use the newest one.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Note: clicking <strong>Send Again</strong> will invalidate your previous
                      temporary password. Only the newest one will work.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendAgain}
                    disabled={isLoading}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Again
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-gray-600 dark:text-slate-400 hover:text-gray-800 font-medium transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
            </div>
          )}

          {/* Account Suspended: tenant suspended by super admin */}
          {step === 'accountSuspended' && (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <ShieldOff className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-gray-800 dark:text-slate-200 font-medium">
                    Your organization's account has been suspended
                  </p>
                  <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed">
                    This account was suspended by the platform administrator. Password reset and login are currently unavailable for all users in this organization.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-300 font-medium mb-1">What to do next</p>
                <p className="text-sm text-red-700 dark:text-red-400">
                  Please contact <strong>TalentFlow support</strong> to resolve the suspension and restore access to your account.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-gray-600 dark:text-slate-400 hover:text-gray-800 font-medium transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
            </div>
          )}

          {/* User Deactivated: user deactivated by tenant admin */}
          {step === 'userDeactivated' && (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                  <UserX className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-gray-800 dark:text-slate-200 font-medium">
                    Your account has been deactivated
                  </p>
                  <p className="text-gray-600 dark:text-slate-400 text-sm leading-relaxed">
                    A workspace administrator has deactivated your account. You won't be able to reset your password until the account is reactivated.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">What to do next</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Please contact your <strong>organization administrator</strong> to reactivate your account. Once reactivated, you'll be able to reset your password.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 text-gray-600 dark:text-slate-400 hover:text-gray-800 font-medium transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-slate-50">All Set!</h3>
                <p className="text-gray-600 dark:text-slate-400">
                  Your password has been reset successfully. <br />
                  Redirecting to login...
                </p>
              </div>
              <button
                onClick={onClose}
                className="py-3 px-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-800 transition-all"
              >
                Return to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
