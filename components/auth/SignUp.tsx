'use client';

// MIRROR PAGE: This file and app/(auth)/complete-payment/page.tsx share the same
// plan display logic (quota rendering, feature list, formatQuotaValue, etc.).
// Any changes made here must also be applied to complete-payment/page.tsx and vice versa.

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Briefcase, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft,
  Building2, User, CheckCircle, Loader2, Phone, ShieldCheck, CreditCard, Check, Sparkles,
  FileText, Shield, X
} from 'lucide-react';
import { decodePlanId } from '@/lib/utils/planEncoder';
import { toast } from 'sonner';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import PlanSelectionModal from './PlanSelectionModal';
import { AUTH_THEME_CSS } from './authTheme';
import AuthBrandPanel from './AuthBrandPanel';
import type { TermsAndConditions } from '@/lib/types/terms';
// Auto-login support after paid signup payment — see handlePaymentSubmit.
import { setTokens, clearTokens } from '@/lib/services/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// List of blocked personal email domains
const BLOCKED_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com',
  'yandex.com', 'gmx.com', 'inbox.com', 'fastmail.com', 'tutanota.com',
  'me.com', 'mac.com', 'msn.com', 'qq.com', '163.com', '126.com',
  'rediffmail.com', 'yahoo.co.in', 'yahoo.co.uk', 'googlemail.com'
];

// Validate that email is a business email (not personal)
const validateBusinessEmail = (email: string): boolean => {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !BLOCKED_EMAIL_DOMAINS.includes(domain);
};

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

type SignUpStep = 'form' | 'verification' | 'payment' | 'success';

interface PlanDetails {
  id: number;
  plan_name: string;
  plan_tier: string;
  description: string;
  base_price: number;
  monthly_price: number;
  currency: string;
  billing_period: string;
  included_seats: number;
  discount_percentage?: number;
  features?: { feature_name: string; is_enabled: boolean }[];
  quotas?: {
    max_seats?: number;
    max_jobs?: number;
    RS?: number;
    RU?: number;
    AS?: number;
    AIU?: number;
    api_rate_limit?: number;
  };
}

export default function SignUp({ onSwitchToLogin, onBackToPublic }: SignUpProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get encoded plan from URL query params (e.g., /signup?plan=ENCODED_ID)
  const encodedPlanFromUrl = searchParams.get('plan');

  // Check if user explicitly selected free trial
  const isExplicitFreeTrial = encodedPlanFromUrl === 'free_trial';

  // State for plan selection modal - show when no plan in URL
  const [showPlanModal, setShowPlanModal] = useState(!encodedPlanFromUrl);
  const [freeTrialAcknowledged, setFreeTrialAcknowledged] = useState(isExplicitFreeTrial);

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
  const [companyNameError, setCompanyNameError] = useState('');
  const [adminNameError, setAdminNameError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(14);

  // OTP state (inline, not popup)
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Success state
  const [step, setStep] = useState<SignUpStep>('form');

  // Payment step state (for plan purchase during signup)
  const billingIntervalFromUrl = searchParams.get('billing');
  const [billingInterval, setBillingInterval] = useState<'MONTHLY' | 'ANNUAL'>(
    billingIntervalFromUrl === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
  );
  const [selectedPlanDetails, setSelectedPlanDetails] = useState<PlanDetails | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const [createdSubdomain, setCreatedSubdomain] = useState<string | null>(null);
  const { openCheckout, isProcessing: razorpayProcessing } = useRazorpay();

  // Terms & Conditions state for signup flow
  const [acceptedTermsId, setAcceptedTermsId] = useState<string | null>(null);
  const [showTermsConsentModal, setShowTermsConsentModal] = useState(false);
  const [termsConsentContent, setTermsConsentContent] = useState<{ terms: TermsAndConditions | null; privacy: TermsAndConditions | null }>({ terms: null, privacy: null });
  const [termsConsentLoading, setTermsConsentLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [activeTermsTab, setActiveTermsTab] = useState<'terms' | 'privacy'>('terms');
  // Tracks which tabs the user has actually opened — checkbox only enabled after viewing
  const [visitedTabs, setVisitedTabs] = useState<Set<'terms' | 'privacy'>>(new Set(['terms']));

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const openTermsConsentModal = async () => {
    setShowTermsConsentModal(true);
    setAgreedToTerms(false);
    setAgreedToPrivacy(false);
    setActiveTermsTab('terms');
    setVisitedTabs(new Set(['terms']));
    setTermsConsentLoading(true);
    try {
      const [termsRes, privacyRes] = await Promise.allSettled([
        fetch(`${API_URL}/public/terms-and-conditions/current?document_type=TERMS_AND_CONDITIONS`),
        fetch(`${API_URL}/public/terms-and-conditions/current?document_type=PRIVACY_POLICY`),
      ]);
      let termsData: TermsAndConditions | null = null;
      let privacyData: TermsAndConditions | null = null;
      if (termsRes.status === 'fulfilled' && termsRes.value.ok) {
        const json = await termsRes.value.json();
        termsData = json?.data || json;
      }
      if (privacyRes.status === 'fulfilled' && privacyRes.value.ok) {
        const json = await privacyRes.value.json();
        privacyData = json?.data || json;
      }
      setTermsConsentContent({ terms: termsData, privacy: privacyData });
    } catch {
      setTermsConsentContent({ terms: null, privacy: null });
    } finally {
      setTermsConsentLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    const termsId = termsConsentContent.terms?.id || null;
    setAcceptedTermsId(termsId);
    setShowTermsConsentModal(false);
    await completeRegistration(termsId);
  };

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

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Update modal state when URL changes (e.g., user comes from pricing page with plan)
  useEffect(() => {
    if (encodedPlanFromUrl) {
      setShowPlanModal(false);
      if (encodedPlanFromUrl === 'free_trial') {
        setFreeTrialAcknowledged(true);
      }
    }
  }, [encodedPlanFromUrl]);

  // Fetch plan details when plan ID is present in URL
  useEffect(() => {
    const fetchPlanDetails = async () => {
      if (!encodedPlanFromUrl || encodedPlanFromUrl === 'free_trial') return;

      const planId = decodePlanId(encodedPlanFromUrl);
      if (!planId) return;

      setPlanLoading(true);
      try {
        const response = await fetch(`${API_URL}/subscription/public/plans`);
        if (response.ok) {
          const result = await response.json();
          const plansArray = result.data?.plans || result.plans || [];

          // Find the plan with matching ID in billing_options
          for (const groupedPlan of plansArray) {
            const monthly = groupedPlan.billing_options?.monthly;
            const annual = groupedPlan.billing_options?.annual;

            if (monthly?.id === parseInt(planId) || annual?.id === parseInt(planId)) {
              // Determine which plan variant to use based on billingInterval
              const planVariant = billingInterval === 'ANNUAL' ? (annual || monthly) : (monthly || annual);
              if (planVariant) {
                setSelectedPlanDetails({
                  id: planVariant.id,
                  plan_name: groupedPlan.plan_name,
                  plan_tier: groupedPlan.plan_tier,
                  description: groupedPlan.description,
                  base_price: planVariant.base_price,
                  monthly_price: planVariant.monthly_price,
                  currency: planVariant.currency,
                  billing_period: planVariant.billing_period,
                  included_seats: planVariant.included_seats,
                  discount_percentage: (groupedPlan as any).discount_percentage ?? planVariant.discount_percentage,
                  features: planVariant.features,
                  quotas: planVariant.quotas,
                });
              }
              break;
            }
          }
        }
      } catch (err) {
        console.error('Error fetching plan details:', err);
      } finally {
        setPlanLoading(false);
      }
    };

    fetchPlanDetails();
  }, [encodedPlanFromUrl, billingInterval]);

  // Company name validation: letters, numbers, spaces, & . - ' ( ) allowed; min 2, max 100
  const validateCompanyName = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'Company name is required';
    if (trimmed.length < 2) return 'Company name must be at least 2 characters';
    if (trimmed.length > 100) return 'Company name must be 100 characters or less';
    if (!/^[a-zA-Z0-9 &.\-'()]+$/.test(trimmed))
      return "Only letters, numbers, spaces and & . - ' ( ) are allowed";
    return '';
  };

  // Name validation: letters, spaces, hyphen, apostrophe only; min 2, max 100
  const validateName = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'Your name is required';
    if (trimmed.length < 2) return 'Name must be at least 2 characters';
    if (trimmed.length > 100) return 'Name must be 100 characters or less';
    if (/[0-9]/.test(trimmed)) return 'Name must not contain numbers';
    if (!/^[a-zA-Z \-']+$/.test(trimmed))
      return "Only letters, spaces, hyphens and apostrophes are allowed";
    return '';
  };

  // Comprehensive email validation
  const validateEmail = (email: string): { isValid: boolean; error: string } => {
    // Check if email is empty
    if (!email || !email.trim()) {
      return { isValid: false, error: 'Email is required' };
    }

    // Convert to lowercase for validation
    const lowerEmail = email.toLowerCase().trim();

    // Check basic email format
    const emailRegex = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    if (!emailRegex.test(lowerEmail)) {
      return { isValid: false, error: 'Invalid email format. Email must be lowercase and follow standard format (e.g., name@company.com)' };
    }

    // Check for uppercase letters (not allowed)
    if (email !== lowerEmail) {
      return { isValid: false, error: 'Email must be in lowercase only' };
    }

    // Extract domain
    const domain = lowerEmail.split('@')[1];
    if (!domain) {
      return { isValid: false, error: 'Invalid email domain' };
    }

    // Check if it's a personal email domain
    if (BLOCKED_EMAIL_DOMAINS.includes(domain)) {
      return { isValid: false, error: `Personal email domains (${domain}) are not allowed. Please use your company email address.` };
    }

    // Additional validation checks
    if (lowerEmail.length > 254) {
      return { isValid: false, error: 'Email address is too long' };
    }

    const localPart = lowerEmail.split('@')[0];
    if (localPart.length > 64) {
      return { isValid: false, error: 'Email username is too long' };
    }

    // Check for consecutive dots
    if (lowerEmail.includes('..')) {
      return { isValid: false, error: 'Email cannot contain consecutive dots' };
    }

    // Check if starts or ends with dot
    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      return { isValid: false, error: 'Email cannot start or end with a dot' };
    }

    return { isValid: true, error: '' };
  };

  const handleChange = (field: keyof SignUpForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Auto-convert email to lowercase
    if (field === 'adminEmail') {
      value = value.toLowerCase().trim();
    }

    setForm(prev => ({ ...prev, [field]: value }));
    setError('');

    // Validate email in real-time
    if (field === 'adminEmail' && value) {
      const validation = validateEmail(value);
      setEmailError(validation.error);
    } else if (field === 'adminEmail') {
      setEmailError('');
    }

    // Validate company name in real-time
    if (field === 'companyName') {
      setCompanyNameError(validateCompanyName(value));
    }

    // Validate admin name in real-time
    if (field === 'adminName') {
      setAdminNameError(validateName(value));
    }
  };

  // Password strength validation (live feedback)
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

  const { strength: passwordStrength, checks: passwordChecks } = getPasswordStrength(form.password);
  const passwordsMatch = form.password && form.confirmPassword && form.password === form.confirmPassword;

  // All required fields are filled and valid — gates the "View Terms & Conditions" button
  const isFormComplete =
    (freeTrialAcknowledged || !!selectedPlanDetails) &&
    form.companyName.trim().length >= 2 &&
    !companyNameError &&
    !emailError &&
    otpVerified &&
    form.adminName.trim().length >= 2 &&
    !adminNameError &&
    /^[0-9+\-\s()]{10,}$/.test(form.phoneNumber.trim()) &&
    form.password.length >= 8 &&
    /[A-Z]/.test(form.password) &&
    /[a-z]/.test(form.password) &&
    /[0-9]/.test(form.password) &&
    /[!@#$%^&*(),.?":{}|<>]/.test(form.password) &&
    form.password === form.confirmPassword;

  const validateForm = (): string | null => {
    // Plan selection validation - user must explicitly choose a plan
    if (!freeTrialAcknowledged && !selectedPlanDetails) {
      setShowPlanModal(true);
      return 'Please select a plan to continue';
    }

    // Company name validation
    const companyErr = validateCompanyName(form.companyName);
    if (companyErr) return companyErr;

    // Email validation
    const emailValidation = validateEmail(form.adminEmail);
    if (!emailValidation.isValid) {
      return emailValidation.error;
    }

    // OTP verification
    if (!otpVerified) {
      return 'Please verify your email with OTP first';
    }

    // Admin name validation
    const nameErr = validateName(form.adminName);
    if (nameErr) return nameErr;

    // Phone number validation
    if (!form.phoneNumber.trim()) {
      return 'Phone number is required';
    }
    const phoneRegex = /^[0-9+\-\s()]{10,}$/;
    if (!phoneRegex.test(form.phoneNumber.trim())) {
      return 'Please enter a valid phone number (at least 10 digits)';
    }

    // Password validation
    if (!form.password) {
      return 'Password is required';
    }
    if (form.password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(form.password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(form.password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(form.password)) {
      return 'Password must contain at least one number';
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(form.password)) {
      return 'Password must contain at least one special character';
    }

    // Confirm password validation
    if (!form.confirmPassword) {
      return 'Please confirm your password';
    }
    if (form.password !== form.confirmPassword) {
      return 'Passwords do not match';
    }

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
    await openTermsConsentModal();
  };

  // Complete registration - calls API with plan_id if selected
  const completeRegistration = async (overrideTermsId?: string | null) => {
    setIsLoading(true);

    try {
      // Call complete-registration endpoint to create tenant
      const requestBody: any = {
        email: form.adminEmail,
        password: form.password,
        full_name: form.adminName,
        company_name: form.companyName,
        phone_number: form.phoneNumber,
      };

      // Add plan details if a paid plan is selected from URL
      if (encodedPlanFromUrl && encodedPlanFromUrl !== 'free_trial' && selectedPlanDetails) {
        requestBody.plan_id = selectedPlanDetails.id;
        requestBody.billing_interval = billingInterval;
      }

      // Include accepted terms ID if user accepted T&C during signup
      const termsId = overrideTermsId !== undefined ? overrideTermsId : acceptedTermsId;
      if (termsId) {
        requestBody.terms_id = termsId;
      }

      // Note: If freeTrialAcknowledged is true and no plan_id, backend handles as trial
      // The key difference is user has now EXPLICITLY acknowledged they want free trial

      // Abort after 90s to avoid infinite spinner if backend is unresponsive
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await fetch(`${API_URL}/signup/complete-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
          } else if (typeof data.detail === 'object') {
            if (data.detail.errors && Array.isArray(data.detail.errors) && data.detail.errors.length > 0) {
              errorMessage = data.detail.errors.join(', ');
            } else if (data.detail.message) {
              errorMessage = data.detail.message;
            }
          }
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      // Store tenant_id and subdomain for payment processing and redirect
      if (data.tenant_id) {
        setCreatedTenantId(data.tenant_id);
      }
      if (data.subdomain) {
        setCreatedSubdomain(data.subdomain);
      }

      // If paid signup, show payment step to complete purchase
      // If trial signup (user explicitly acknowledged), go directly to success
      if (data.purchase_intent === 'paid' && data.tenant_id) {
        setStep('payment'); // Show payment step
        toast.success('Account created!', { description: 'Please complete your payment to activate your plan.' });
      } else {
        setStep('success');
        toast.success('Welcome aboard!', {
          description: freeTrialAcknowledged
            ? `Your ${trialDays}-${trialDays === 1 ? 'day' : 'days'} free trial has started. Explore all features!`
            : 'Your account has been created successfully.',
        });
        // Redirect to org subdomain login after brief success message
        setTimeout(() => {
          const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'talentflow.data.mo.vc';
          const sub = data.subdomain;
          if (sub) {
            window.location.href = `https://${sub}.${baseDomain}/login?email=${encodeURIComponent(form.adminEmail)}`;
          } else {
            router.push(`/login?email=${encodeURIComponent(form.adminEmail)}`);
          }
        }, 2000);
      }

    } catch (err: any) {
      console.error('Signup error:', err);
      let message = err.message || 'Registration failed. Please try again.';
      if (err.name === 'AbortError') {
        message = 'Workspace creation is taking longer than expected. Please try logging in — your account may already be ready.';
      }
      setError(message);
      toast.error('Registration failed', { description: message });
    } finally {
      setIsLoading(false);
      setPaymentProcessing(false);
    }
  };

  // Handle payment submission — 3-step Razorpay flow
  const handlePaymentSubmit = async () => {
    if (!createdTenantId || !selectedPlanDetails) {
      setError('Missing tenant or plan information');
      return;
    }

    setPaymentProcessing(true);
    setError('');

    try {
      // Step 1: Create Razorpay order
      const orderRes = await fetch(`${API_URL}/signup/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: createdTenantId,
          plan_id: selectedPlanDetails.id,
          billing_interval: billingInterval,
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to create order: ${orderRes.status}`);
      }

      const orderData = await orderRes.json();
      console.log('[Signup] Razorpay order created:', orderData);

      // Step 2: Open Razorpay checkout modal
      let paymentResponse;
      try {
        paymentResponse = await openCheckout({
          orderId: orderData.order_id,
          amount: orderData.amount,
          currency: orderData.currency,
          planName: selectedPlanDetails.plan_name || 'Plan',
          userName: form.adminName || '',
          userEmail: form.adminEmail || '',
          userPhone: form.phoneNumber || '',
        });
      } catch (checkoutErr: any) {
        setPaymentProcessing(false);
        if (checkoutErr?.message?.includes('cancelled')) {
          toast.info('Payment cancelled');
        } else {
          toast.error(checkoutErr?.message || 'Payment failed');
        }
        return;
      }

      // Step 3: Verify payment with backend
      const response = await fetch(`${API_URL}/signup/process-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: createdTenantId,
          plan_id: selectedPlanDetails.id,
          billing_interval: billingInterval,
          user_email: form.adminEmail,
          payment_method: 'razorpay',
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_signature: paymentResponse.razorpay_signature,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Payment verification failed');
      }

      // Payment successful — auto-login the new tenant admin if the backend
      // returned tokens (process-payment issues them via create_tokens_for_tenant_admin).
      // Falls back to the login page when tokens are missing (older backend,
      // token issuance failure, etc.) so the flow still completes manually.
      toast.success('Payment successful!', { description: 'Your plan is now active.' });
      setStep('success');

      const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'talentflow.data.mo.vc';
      const hasTokens = Boolean(data?.access_token && data?.refresh_token);

      setTimeout(() => {
        if (hasTokens) {
          // Always cross-domain redirect when we have tokens so they land on
          // the tenant subdomain. Pass tokens via URL fragment so the new
          // subdomain origin can pick them up (localStorage is per-origin).
          const target = createdSubdomain
            ? `https://${createdSubdomain}.${baseDomain}/auth/handoff#access_token=${encodeURIComponent(data.access_token)}&refresh_token=${encodeURIComponent(data.refresh_token)}`
            : `/auth/handoff#access_token=${encodeURIComponent(data.access_token)}&refresh_token=${encodeURIComponent(data.refresh_token)}`;
          // Wipe any stale tokens on the current origin so we don't leave a
          // mismatched token behind.
          try { clearTokens(); } catch {}
          window.location.href = target;
        } else {
          if (createdSubdomain) {
            window.location.href = `https://${createdSubdomain}.${baseDomain}/login?email=${encodeURIComponent(form.adminEmail)}`;
          } else {
            router.push(`/login?email=${encodeURIComponent(form.adminEmail)}`);
          }
        }
      }, 2000);

    } catch (err: any) {
      console.error('Payment error:', err);
      const message = err.message || 'Payment failed. Please try again.';
      setError(message);
      toast.error('Payment failed', { description: message });
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Handle continue to login (skip payment - stay on trial)
  const handleSkipPayment = () => {
    toast.info('Starting with free trial', { description: 'You can upgrade anytime from your dashboard.' });
    const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'talentflow.data.mo.vc';
    if (createdSubdomain) {
      window.location.href = `https://${createdSubdomain}.${baseDomain}/login?email=${encodeURIComponent(form.adminEmail)}`;
    } else {
      router.push(`/login?email=${encodeURIComponent(form.adminEmail)}`);
    }
  };

  // Check if email is valid for OTP
  const isEmailValidForOtp = () => {
    if (!form.adminEmail.trim()) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) return false;
    const emailValidation = validateEmail(form.adminEmail);
    if (!emailValidation.isValid) return false;
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
      // Generate subdomain from company name (not email domain)
      let subdomain = '';
      if (form.companyName) {
        subdomain = form.companyName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
      }

      // Fallback to email domain if company name doesn't produce valid subdomain
      if (subdomain.length < 3) {
        const emailParts = form.adminEmail.split('@');
        if (emailParts.length === 2 && emailParts[1]) {
          const domainParts = emailParts[1].split('.');
          if (domainParts.length >= 1 && domainParts[0]) {
            subdomain = domainParts[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
          }
        }
      }

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
          plan_id: (encodedPlanFromUrl && encodedPlanFromUrl !== 'free_trial') ? parseInt(decodePlanId(encodedPlanFromUrl) || '0') : null,
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
          } else if (typeof data.detail === 'object') {
            // Handle nested error object with errors array
            if (data.detail.errors && Array.isArray(data.detail.errors) && data.detail.errors.length > 0) {
              errorMessage = data.detail.errors.join(', ');
            } else if (data.detail.message) {
              errorMessage = data.detail.message;
            }
          }
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      setOtpSent(true);
      setResendTimer(60);
      setEmailError('');
      // Focus first OTP input
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);

    } catch (err: any) {
      console.error('Send OTP error:', err);
      const errorMessage = err.message || 'Failed to send OTP. Please try again.';

      // Show email-related errors under the email field for better UX
      if (errorMessage.toLowerCase().includes('email') &&
          (errorMessage.toLowerCase().includes('already') ||
           errorMessage.toLowerCase().includes('registered') ||
           errorMessage.toLowerCase().includes('exists'))) {
        setEmailError(errorMessage);
      } else {
        setError(errorMessage);
      }
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
          } else if (typeof data.detail === 'object') {
            if (data.detail.errors && Array.isArray(data.detail.errors) && data.detail.errors.length > 0) {
              errorMessage = data.detail.errors.join(', ');
            } else if (data.detail.message) {
              errorMessage = data.detail.message;
            }
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
          } else if (typeof data.detail === 'object') {
            if (data.detail.errors && Array.isArray(data.detail.errors) && data.detail.errors.length > 0) {
              errorMessage = data.detail.errors.join(', ');
            } else if (data.detail.message) {
              errorMessage = data.detail.message;
            }
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

  const handleChangeEmail = () => {
    // Reset OTP-related states to allow email change
    setOtpSent(false);
    setOtpVerified(false);
    setOtpCode(['', '', '', '', '', '']);
    setResendTimer(0);
    setError('');
    setEmailError('');
    // Clear the email field focus
    setTimeout(() => {
      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      if (emailInput) {
        emailInput.focus();
      }
    }, 100);
  };

  // Handle plan selection from modal
  const handlePlanSelected = (planParam: string, billingInterval?: 'MONTHLY' | 'ANNUAL') => {
    setShowPlanModal(false);

    if (planParam === 'free_trial') {
      // User explicitly acknowledged free trial
      setFreeTrialAcknowledged(true);
      // Update URL to reflect the choice
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('plan', 'free_trial');
      window.history.replaceState({}, '', newUrl.toString());
      toast.success('Free Trial Selected', {
        description: `You've chosen the free trial. Complete your signup to get started!`,
      });
    } else {
      // User selected a paid plan - update URL to trigger plan fetch via useEffect
      const params = new URLSearchParams(window.location.search);
      params.set('plan', planParam);
      if (billingInterval) {
        params.set('billing', billingInterval);
        setBillingInterval(billingInterval);
      }
      router.replace(`/signup?${params.toString()}`);
    }
  };

  // The Sign Up card is wider than Login's (it carries two-column fields), which
  // is the only geometry that differs between the two pages — everything else
  // comes from the shared tokens in authTheme.ts.
  const formWidthVar = { ['--tf-form-width' as string]: '520px' } as React.CSSProperties;

  // Helper function to format currency with up to 2 decimal places
  const formatCurrency = (amount: number, currency: string): string => {
    const currencySymbols: Record<string, string> = {
      'USD': '$',
      'INR': '₹',
      'EUR': '€',
      'GBP': '£',
    };
    const symbol = currencySymbols[currency] || currency + ' ';
    const formatted = amount % 1 === 0
      ? amount.toLocaleString()
      : amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${formatted}`;
  };

  // Payment Step UI (shown after account created - user needs to complete payment)
  if (step === 'payment' && selectedPlanDetails) {
    // Helper to get quota label
    const getQuotaLabel = (key: string): string => {
      const labels: Record<string, string> = {
        max_seats: 'Max Users',
        max_jobs: 'Max Jobs',
        RS: 'Resume Scores',
        RU: 'Resume Storage',
        AS: 'Assessments',
        AIU: 'AI Interviews',
        api_rate_limit: 'API Rate Limit',
      };
      return labels[key] || key;
    };

    // Helper to format quota value
    const formatQuotaValue = (key: string, value: number | string | undefined): string => {
      if (value === undefined || value === null) return 'Unlimited';
      if (value === -1) return 'Unlimited';
      if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return 'Unlimited';
      return Number(value).toLocaleString();
    };

    return (
      <div className="tf-auth">
        <style>{AUTH_THEME_CSS}</style>

        <div className="tf-auth-main" style={{ ['--tf-form-width' as string]: '600px' } as React.CSSProperties}>
          <div className="tf-auth-card" style={{ maxHeight: '88vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
              <div className="tf-auth-feature-icon" style={{ width: 42, height: 42 }}>
                <CreditCard style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <h2 className="tf-auth-title" style={{ fontSize: 21, marginBottom: 2 }}>Complete your purchase</h2>
                <p className="tf-auth-subtitle" style={{ marginBottom: 0 }}>
                  Your account is ready. Complete payment to activate your plan.
                </p>
              </div>
            </div>

            {error && (
              <div className="tf-auth-alert tf-auth-alert--danger">
                <AlertCircle style={{ width: 17, height: 17 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Plan Summary Card */}
            <div className="tf-auth-panel" style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 650, color: 'var(--tf-ink)', letterSpacing: '-0.01em' }}>
                    {selectedPlanDetails.plan_name}
                  </span>
                  <span style={{
                    background: 'var(--tf-brand-tint-solid)',
                    color: 'var(--tf-brand-ink)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}>
                    {selectedPlanDetails.plan_tier}
                  </span>
                </div>
                <p style={{ color: 'var(--tf-ink-subtle)', fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>
                  {selectedPlanDetails.description}
                </p>
              </div>

              {/* Price Display with GST Breakdown */}
              <div style={{ padding: '14px 0', borderTop: '1px solid var(--tf-border)', borderBottom: '1px solid var(--tf-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)' }}>Billing</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tf-ink)' }}>
                    {billingInterval === 'ANNUAL' ? 'Annual' : 'Monthly'}
                  </span>
                </div>
                {/* Strikethrough price and Save badge for annual plans */}
                {billingInterval === 'ANNUAL' && selectedPlanDetails.monthly_price && (selectedPlanDetails.monthly_price * 12) > selectedPlanDetails.base_price && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 13.5, color: 'var(--tf-ink-faint)', textDecoration: 'line-through' }}>
                      {formatCurrency(selectedPlanDetails.monthly_price * 12, selectedPlanDetails.currency)}
                    </span>
                    {selectedPlanDetails.discount_percentage && selectedPlanDetails.discount_percentage > 0 && (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        background: 'var(--tf-success-tint)',
                        color: 'var(--tf-success-ink)',
                        borderRadius: 999,
                      }}>
                        Save {Math.round(selectedPlanDetails.discount_percentage)}%
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)' }}>Plan price</span>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--tf-ink)' }}>
                    {formatCurrency(selectedPlanDetails.base_price, selectedPlanDetails.currency)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)' }}>GST (18%)</span>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--tf-ink)' }}>
                    {formatCurrency(Math.round(selectedPlanDetails.base_price * 0.18 * 100) / 100, selectedPlanDetails.currency)}
                  </span>
                </div>
                <div style={{ height: 1, background: 'var(--tf-border)', marginBottom: 12 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tf-ink)' }}>Total</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 26, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--tf-ink)' }}>
                      {formatCurrency(Math.round((selectedPlanDetails.base_price * 1.18) * 100) / 100, selectedPlanDetails.currency)}
                    </span>
                    <span style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', marginLeft: 4 }}>
                      /{billingInterval === 'ANNUAL' ? 'year' : 'month'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Included Seats */}
              {selectedPlanDetails.included_seats && (
                <div style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  background: 'var(--tf-brand-tint)',
                  border: '1px solid var(--tf-brand-border)',
                  borderRadius: 'var(--tf-radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 13.5, color: 'var(--tf-brand-ink)', fontWeight: 500 }}>Included team seats</span>
                  <span style={{ fontSize: 15, fontWeight: 650, color: 'var(--tf-brand-ink)' }}>{selectedPlanDetails.included_seats}</span>
                </div>
              )}
            </div>

            {/* Plan Quotas */}
            {selectedPlanDetails.quotas && Object.keys(selectedPlanDetails.quotas).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--tf-ink-muted)', margin: '0 0 10px' }}>Plan quotas</h4>
                <div className="tf-auth-panel">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {Object.entries(selectedPlanDetails.quotas)
                      .filter(([key, value]) => !['storage_gb', 'support_level', 'api_rate_limit'].includes(key) && value !== 0 && value !== null && value !== undefined)
                      .map(([key, value]) => (
                      <div key={key} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '8px 12px',
                        background: 'var(--tf-surface)',
                        borderRadius: 'var(--tf-radius-sm)',
                        border: '1px solid var(--tf-border)',
                      }}>
                        <span style={{ fontSize: 12.5, color: 'var(--tf-ink-subtle)' }}>{getQuotaLabel(key)}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tf-ink)' }}>{formatQuotaValue(key, value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Features List */}
            {selectedPlanDetails.features && selectedPlanDetails.features.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--tf-ink-muted)', margin: '0 0 10px' }}>Included features</h4>
                <div className="tf-auth-panel">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {selectedPlanDetails.features
                      .filter(f => f.is_enabled)
                      .map((feature, index) => (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <Check style={{ width: 15, height: 15, color: 'var(--tf-brand-ink)', flexShrink: 0 }} />
                          <span style={{ fontSize: 12.5, color: 'var(--tf-ink-muted)' }}>{feature.feature_name}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Account Summary */}
            <div className="tf-auth-alert tf-auth-alert--success" style={{ display: 'block', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <CheckCircle style={{ width: 16, height: 16 }} />
                <span style={{ fontWeight: 600 }}>Account details confirmed</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12.5 }}>
                <div><strong style={{ fontWeight: 600 }}>Company:</strong> {form.companyName}</div>
                <div><strong style={{ fontWeight: 600 }}>Name:</strong> {form.adminName}</div>
                <div><strong style={{ fontWeight: 600 }}>Email:</strong> {form.adminEmail}</div>
                <div><strong style={{ fontWeight: 600 }}>Phone:</strong> {form.phoneNumber}</div>
              </div>
            </div>

            {/* Complete Purchase Button */}
            <button
              onClick={handlePaymentSubmit}
              disabled={paymentProcessing || razorpayProcessing}
              className={`tf-auth-btn${paymentProcessing || razorpayProcessing ? ' tf-auth-btn--busy' : ''}`}
            >
              {paymentProcessing || razorpayProcessing ? (
                <>
                  <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
                  Processing payment…
                </>
              ) : (
                <>
                  <CreditCard style={{ width: 17, height: 17 }} />
                  Pay and activate — {formatCurrency(Math.round((selectedPlanDetails.base_price * 1.18) * 100) / 100, selectedPlanDetails.currency)}
                </>
              )}
            </button>

            {/* Security Notice */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, color: 'var(--tf-ink-subtle)', fontSize: 12.5 }}>
              <ShieldCheck style={{ width: 15, height: 15 }} />
              <span>Secure payment processing</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success Step UI
  if (step === 'success') {
    return (
      <div className="tf-auth">
        <style>{AUTH_THEME_CSS}</style>

        <div className="tf-auth-main">
          <div className="tf-auth-card" style={{ textAlign: 'center' }}>
            <div
              className="tf-auth-feature-icon"
              style={{
                width: 52,
                height: 52,
                margin: '0 auto 20px',
                background: 'var(--tf-success-tint)',
                color: 'var(--tf-success-ink)',
              }}
            >
              <CheckCircle style={{ width: 26, height: 26 }} />
            </div>
            <h2 className="tf-auth-title">Welcome to TalentFlow</h2>
            <p className="tf-auth-subtitle" style={{ marginBottom: 20 }}>Your account has been created successfully.</p>

            {/* Show plan info */}
            {freeTrialAcknowledged && (
              <div className="tf-auth-alert tf-auth-alert--success" style={{ display: 'block', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                  <Sparkles style={{ width: 17, height: 17 }} />
                  <span style={{ fontWeight: 600 }}>
                    {trialDays}-{trialDays === 1 ? 'day' : 'day'} free trial activated
                  </span>
                </div>
                <p style={{ margin: 0, opacity: 0.85 }}>
                  Explore all premium features. Upgrade anytime from your dashboard.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--tf-ink-subtle)', fontSize: 13.5 }}>
              <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
              Redirecting to sign in…
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Form UI
  return (
    <div className="tf-auth tf-auth--split">
      <style>{AUTH_THEME_CSS}</style>

      {/* Plan Selection Modal - shown when no plan in URL */}
      <PlanSelectionModal
        isOpen={showPlanModal}
        onPlanSelected={handlePlanSelected}
        onClose={() => router.push('/pricing')}
      />

      <div className="tf-auth-shell">
        {/* Left column — the same shared brand panel Login uses, so the two
            screens read as one product. */}
        <AuthBrandPanel
          onBackToPublic={onBackToPublic}
          label="TalentFlow sign up overview"
          headline={<>
            Start your<br />
            <span className="tf-accent">recruitment journey</span>
          </>}
          lede={<>
            Create your organization&apos;s recruitment workspace in minutes and start
            hiring smarter with AI-powered tools.
          </>}
        />

        {/* Right column — the form */}
        <div className="tf-auth-main" style={formWidthVar}>
          <div className="tf-auth-card">
            {/* Back Button */}
            {onBackToPublic && (
              <button type="button" onClick={onBackToPublic} className="tf-auth-back">
                <ArrowLeft style={{ width: 15, height: 15 }} />
                <span>Back to home</span>
              </button>
            )}

            {/* Compact lockup — only rendered visibly on narrow viewports */}
            <div className="tf-auth-lockup tf-auth-lockup--card">
              <div className="tf-auth-brandmark tf-auth-brandmark--sm">
                <Briefcase style={{ width: 19, height: 19 }} />
              </div>
              <div>
                <div className="tf-auth-wordmark" style={{ fontSize: 18 }}>TalentFlow</div>
                <div className="tf-auth-wordmark-sub">Recruitment Platform</div>
              </div>
            </div>

            <h2 className="tf-auth-title">Create account</h2>
            <p className="tf-auth-subtitle">Set up your recruitment workspace.</p>

            {/* Selected Plan Indicator */}
            {(freeTrialAcknowledged || selectedPlanDetails) && (
              <div
                className="tf-auth-panel"
                style={{
                  marginBottom: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div className="tf-auth-feature-icon">
                    {freeTrialAcknowledged
                      ? <Sparkles style={{ width: 18, height: 18 }} />
                      : <CreditCard style={{ width: 18, height: 18 }} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tf-ink)' }}>
                      {freeTrialAcknowledged ? `Free trial (${trialDays} days)` : selectedPlanDetails?.plan_name}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--tf-ink-subtle)' }}>
                      {freeTrialAcknowledged
                        ? 'No credit card required'
                        : `${formatCurrency(selectedPlanDetails?.base_price || 0, selectedPlanDetails?.currency || 'INR')} / ${billingInterval === 'ANNUAL' ? 'year' : 'month'}`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlanModal(true)}
                  className="tf-auth-btn tf-auth-btn--outline tf-auth-btn--auto tf-auth-btn--sm"
                  style={{ flexShrink: 0 }}
                >
                  Change plan
                </button>
              </div>
            )}

            {error && (
              <div className="tf-auth-alert tf-auth-alert--danger">
                <AlertCircle style={{ width: 17, height: 17 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Company Name */}
              <div className="tf-auth-field">
                <label className="tf-auth-label" htmlFor="tf-signup-company">Company name</label>
                <div className="tf-auth-control">
                  <span className="tf-auth-control-icon">
                    <Building2 style={{ width: 17, height: 17 }} />
                  </span>
                  <input
                    id="tf-signup-company"
                    type="text"
                    value={form.companyName}
                    onChange={handleChange('companyName')}
                    placeholder="Acme Corporation"
                    required
                    maxLength={100}
                    className={`tf-auth-input${companyNameError ? ' is-invalid' : ''}`}
                  />
                </div>
                {companyNameError && (
                  <p className="tf-auth-field-error">
                    <AlertCircle style={{ width: 13, height: 13 }} />
                    {companyNameError}
                  </p>
                )}
              </div>

              {/* Admin Name */}
              <div className="tf-auth-field">
                <label className="tf-auth-label" htmlFor="tf-signup-name">Your name</label>
                <div className="tf-auth-control">
                  <span className="tf-auth-control-icon">
                    <User style={{ width: 17, height: 17 }} />
                  </span>
                  <input
                    id="tf-signup-name"
                    type="text"
                    value={form.adminName}
                    onChange={handleChange('adminName')}
                    placeholder="John Smith"
                    required
                    maxLength={100}
                    className={`tf-auth-input${adminNameError ? ' is-invalid' : ''}`}
                  />
                </div>
                {adminNameError && (
                  <p className="tf-auth-field-error">
                    <AlertCircle style={{ width: 13, height: 13 }} />
                    {adminNameError}
                  </p>
                )}
              </div>

              {/* Work Email with OTP */}
              <div className="tf-auth-field">
                <label className="tf-auth-label" htmlFor="tf-signup-email">
                  Work email <span className="tf-auth-label-note">(business email only)</span>
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div className="tf-auth-control" style={{ flex: 1 }}>
                    <span className="tf-auth-control-icon">
                      <Mail style={{ width: 17, height: 17 }} />
                    </span>
                    <input
                      id="tf-signup-email"
                      type="email"
                      value={form.adminEmail}
                      onChange={handleChange('adminEmail')}
                      placeholder="john@acme.com"
                      required
                      disabled={otpSent}
                      className={`tf-auth-input${otpVerified ? ' is-valid tf-auth-input--reveal' : emailError ? ' is-invalid' : ''}`}
                    />
                    {otpVerified && (
                      <CheckCircle style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', width: 17, height: 17, color: 'var(--tf-success)' }} />
                    )}
                  </div>
                  {!otpVerified && (
                    <button
                      type="button"
                      onClick={handleGetOtp}
                      disabled={!isEmailValidForOtp() || isSendingOtp || otpSent}
                      className={`tf-auth-btn tf-auth-btn--auto${otpSent || isSendingOtp ? ' tf-auth-btn--busy' : ''}`}
                      style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      {isSendingOtp ? (
                        <>
                          <Loader2 className="tf-auth-spin" style={{ width: 15, height: 15 }} />
                          Sending…
                        </>
                      ) : otpSent ? (
                        <>
                          <CheckCircle style={{ width: 15, height: 15 }} />
                          Code sent
                        </>
                      ) : (
                        'Get code'
                      )}
                    </button>
                  )}
                </div>
                {emailError && (
                  <p className="tf-auth-field-error">
                    <AlertCircle style={{ width: 13, height: 13 }} />
                    {emailError}
                  </p>
                )}

                {/* Inline OTP Input */}
                {otpSent && !otpVerified && (
                  <div className="tf-auth-panel" style={{ marginTop: 14 }}>
                    <p style={{ fontSize: 13, color: 'var(--tf-ink-muted)', margin: '0 0 12px', textAlign: 'center' }}>
                      Enter the 6-digit code sent to{' '}
                      <strong style={{ color: 'var(--tf-ink)', fontWeight: 600 }}>{form.adminEmail}</strong>
                    </p>
                    <div className="tf-auth-otp-row" style={{ marginBottom: 12 }}>
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
                          aria-label={`Digit ${index + 1} of 6`}
                          className="tf-auth-otp"
                          style={{ width: 40, height: 46, fontSize: 18 }}
                        />
                      ))}
                    </div>
                    {isVerifying && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--tf-brand-ink)', fontSize: 12.5, marginBottom: 10 }}>
                        <Loader2 className="tf-auth-spin" style={{ width: 15, height: 15 }} />
                        Verifying…
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, fontSize: 13 }}>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={isSendingOtp || resendTimer > 0}
                        className="tf-auth-link"
                      >
                        {isSendingOtp ? 'Sending…' : resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
                      </button>
                      <span aria-hidden="true" style={{ color: 'var(--tf-border-strong)' }}>|</span>
                      <button
                        type="button"
                        onClick={handleChangeEmail}
                        className="tf-auth-link"
                        style={{ color: 'var(--tf-ink-muted)' }}
                      >
                        Change email
                      </button>
                    </div>
                  </div>
                )}

                {/* OTP Verified Success */}
                {otpVerified && (
                  <p className="tf-auth-field-success">
                    <CheckCircle style={{ width: 13, height: 13 }} />
                    Email verified successfully
                  </p>
                )}
              </div>

              {/* Phone Number */}
              <div className="tf-auth-field">
                <label className="tf-auth-label" htmlFor="tf-signup-phone">Phone number</label>
                <div className="tf-auth-control">
                  <span className="tf-auth-control-icon">
                    <Phone style={{ width: 17, height: 17 }} />
                  </span>
                  <input
                    id="tf-signup-phone"
                    type="tel"
                    value={form.phoneNumber}
                    onChange={handleChange('phoneNumber')}
                    placeholder="+91 98765 43210"
                    required
                    className="tf-auth-input"
                  />
                </div>
              </div>

              {/* Passwords */}
              <div className="tf-auth-grid-2">
                <div className="tf-auth-field">
                  <label className="tf-auth-label" htmlFor="tf-signup-password">Password</label>
                  <div className="tf-auth-control">
                    <span className="tf-auth-control-icon">
                      <Lock style={{ width: 17, height: 17 }} />
                    </span>
                    <input
                      id="tf-signup-password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={handleChange('password')}
                      placeholder="Min 8 characters"
                      required
                      className={`tf-auth-input tf-auth-input--reveal${form.password ? (passwordStrength === 5 ? ' is-valid' : passwordStrength >= 3 ? '' : ' is-invalid') : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="tf-auth-reveal"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
                <div className="tf-auth-field">
                  <label className="tf-auth-label" htmlFor="tf-signup-confirm">Confirm password</label>
                  <div className="tf-auth-control">
                    <span className="tf-auth-control-icon">
                      <Lock style={{ width: 17, height: 17 }} />
                    </span>
                    <input
                      id="tf-signup-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={handleChange('confirmPassword')}
                      placeholder="Re-enter password"
                      required
                      className={`tf-auth-input tf-auth-input--reveal${form.confirmPassword ? (passwordsMatch ? ' is-valid' : ' is-invalid') : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="tf-auth-reveal"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Requirements - Live Validation */}
              {(form.password || form.confirmPassword) && (
                <div className="tf-auth-panel" style={{ marginBottom: 18 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tf-ink-muted)', margin: '0 0 10px' }}>
                    Password requirements
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                    {[
                      { label: 'At least 8 characters', check: passwordChecks.length },
                      { label: 'One uppercase letter', check: passwordChecks.uppercase },
                      { label: 'One lowercase letter', check: passwordChecks.lowercase },
                      { label: 'One number', check: passwordChecks.number },
                      { label: 'One special character', check: passwordChecks.special },
                      { label: 'Passwords match', check: passwordsMatch },
                    ].map((req, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle style={{
                          width: 15,
                          height: 15,
                          flexShrink: 0,
                          color: req.check ? 'var(--tf-success)' : 'var(--tf-border-strong)',
                          transition: 'color 0.2s',
                        }} />
                        <span style={{
                          fontSize: 12.5,
                          color: req.check ? 'var(--tf-ink-muted)' : 'var(--tf-ink-subtle)',
                          transition: 'color 0.2s',
                        }}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Strength Bar */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--tf-ink-subtle)' }}>Password strength</span>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: passwordStrength <= 2
                          ? 'var(--tf-danger)'
                          : passwordStrength <= 3
                            ? 'var(--tf-warning)'
                            : passwordStrength <= 4
                              ? 'var(--tf-brand-ink)'
                              : 'var(--tf-success-ink)',
                      }}>
                        {passwordStrength === 0 ? 'Too weak' : passwordStrength <= 2 ? 'Weak' : passwordStrength <= 3 ? 'Fair' : passwordStrength <= 4 ? 'Good' : 'Strong'}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--tf-surface-sunken)', border: '1px solid var(--tf-border)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(passwordStrength / 5) * 100}%`,
                        background: passwordStrength <= 2
                          ? 'var(--tf-danger)'
                          : passwordStrength <= 3
                            ? 'var(--tf-warning)'
                            : passwordStrength <= 4
                              ? 'var(--tf-brand)'
                              : 'var(--tf-success)',
                        borderRadius: 999,
                        transition: 'width 0.3s ease, background-color 0.3s ease',
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || !isFormComplete}
                className={`tf-auth-btn${isLoading ? ' tf-auth-btn--busy' : ''}`}
                style={{ marginTop: 4 }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
                    Creating your workspace…
                  </>
                ) : !otpVerified ? (
                  <>
                    <Mail style={{ width: 17, height: 17 }} />
                    Verify email first
                  </>
                ) : (
                  <>
                    <FileText style={{ width: 17, height: 17 }} />
                    Review terms and continue
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="tf-auth-footer">
              Already have an account?{' '}
              <button type="button" onClick={onSwitchToLogin} className="tf-auth-link">
                Sign in
              </button>
            </div>
          </div>

          <div className="tf-auth-legal">© 2026 TalentFlow. All rights reserved.</div>
        </div>
      </div>

      {/* Terms Consent Modal */}
      {showTermsConsentModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16, 24, 40, 0.55)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Review legal documents"
            style={{
              background: 'var(--tf-surface)',
              border: '1px solid var(--tf-border)',
              borderRadius: 'var(--tf-radius)',
              boxShadow: 'var(--tf-shadow)',
              width: '100%',
              maxWidth: 720,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--tf-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="tf-auth-feature-icon">
                  <FileText style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 16.5, fontWeight: 650, letterSpacing: '-0.01em', color: 'var(--tf-ink)', margin: 0 }}>
                    Review legal documents
                  </h2>
                  <p style={{ fontSize: 12.5, color: 'var(--tf-ink-subtle)', margin: '2px 0 0' }}>
                    Accept both documents to create your account
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsConsentModal(false)}
                className="tf-auth-reveal"
                style={{ position: 'static', transform: 'none', width: 28, height: 28 }}
                aria-label="Close"
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid var(--tf-border)',
              background: 'var(--tf-surface-subtle)',
              flexShrink: 0,
            }}>
              {([
                { key: 'terms' as const, label: 'Terms & Conditions', Icon: FileText, agreed: agreedToTerms },
                { key: 'privacy' as const, label: 'Privacy Policy', Icon: Shield, agreed: agreedToPrivacy },
              ]).map(({ key, label, Icon, agreed }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setActiveTermsTab(key); setVisitedTabs(prev => new Set([...prev, key])); }}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontFamily: 'inherit',
                    fontSize: 13.5,
                    fontWeight: activeTermsTab === key ? 600 : 500,
                    color: activeTermsTab === key ? 'var(--tf-brand-ink)' : 'var(--tf-ink-subtle)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTermsTab === key ? '2px solid var(--tf-brand)' : '2px solid transparent',
                    marginBottom: -1,
                    cursor: 'pointer',
                    transition: 'color 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <Icon style={{ width: 15, height: 15 }} />
                  {label}
                  {agreed && <CheckCircle style={{ width: 14, height: 14, color: 'var(--tf-success)' }} />}
                </button>
              ))}
            </div>

            {/* Document Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
              {termsConsentLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 14 }}>
                  <Loader2 className="tf-auth-spin" style={{ width: 28, height: 28, color: 'var(--tf-brand-ink)' }} />
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', margin: 0 }}>Loading documents…</p>
                </div>
              ) : activeTermsTab === 'terms' ? (
                termsConsentContent.terms ? (
                  <div dangerouslySetInnerHTML={{ __html: termsConsentContent.terms.content_html }} style={{ fontSize: 13.5, color: 'var(--tf-ink-muted)', lineHeight: 1.7 }} />
                ) : (
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', textAlign: 'center', padding: 40 }}>Terms &amp; Conditions content is currently unavailable. You may still proceed.</p>
                )
              ) : (
                termsConsentContent.privacy ? (
                  <div dangerouslySetInnerHTML={{ __html: termsConsentContent.privacy.content_html }} style={{ fontSize: 13.5, color: 'var(--tf-ink-muted)', lineHeight: 1.7 }} />
                ) : (
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', textAlign: 'center', padding: 40 }}>Privacy Policy content is currently unavailable. You may still proceed.</p>
                )
              )}
            </div>

            {/* Footer — Checkboxes + Create Account */}
            <div style={{
              padding: '18px 22px',
              borderTop: '1px solid var(--tf-border)',
              background: 'var(--tf-surface-subtle)',
              flexShrink: 0,
            }}>
              {/* Acceptance Checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {/* Terms & Conditions checkbox — enabled only after content has loaded */}
                <label
                  className="tf-auth-check"
                  style={{
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    background: agreedToTerms ? 'var(--tf-brand-tint)' : 'var(--tf-surface)',
                    border: `1px solid ${agreedToTerms ? 'var(--tf-brand-border)' : 'var(--tf-border)'}`,
                    borderRadius: 'var(--tf-radius-sm)',
                    cursor: termsConsentLoading ? 'not-allowed' : 'pointer',
                    opacity: termsConsentLoading ? 0.6 : 1,
                    transition: 'background-color 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    disabled={termsConsentLoading}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    style={{ marginTop: 1 }}
                  />
                  <span style={{ lineHeight: 1.5 }}>
                    I have read and agree to the{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setActiveTermsTab('terms'); setVisitedTabs(prev => new Set([...prev, 'terms' as const])); }}
                      className="tf-auth-link"
                      style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}
                    >
                      Terms &amp; Conditions
                    </button>
                  </span>
                  {agreedToTerms && <CheckCircle style={{ width: 16, height: 16, color: 'var(--tf-success)', flexShrink: 0, marginLeft: 'auto' }} />}
                </label>

                {/* Privacy Policy checkbox — disabled until content loads and user clicks the Privacy Policy tab */}
                <label
                  className="tf-auth-check"
                  title={termsConsentLoading ? 'Please wait for documents to load' : !visitedTabs.has('privacy') ? 'Please read the Privacy Policy tab first' : undefined}
                  style={{
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    background: agreedToPrivacy ? 'var(--tf-brand-tint)' : 'var(--tf-surface)',
                    border: `1px solid ${agreedToPrivacy ? 'var(--tf-brand-border)' : 'var(--tf-border)'}`,
                    borderRadius: 'var(--tf-radius-sm)',
                    cursor: termsConsentLoading || !visitedTabs.has('privacy') ? 'not-allowed' : 'pointer',
                    opacity: termsConsentLoading || !visitedTabs.has('privacy') ? 0.6 : 1,
                    transition: 'background-color 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={agreedToPrivacy}
                    disabled={termsConsentLoading || !visitedTabs.has('privacy')}
                    onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                    style={{ marginTop: 1 }}
                  />
                  <span style={{ lineHeight: 1.5 }}>
                    I have read and agree to the{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setActiveTermsTab('privacy'); setVisitedTabs(prev => new Set([...prev, 'privacy' as const])); }}
                      className="tf-auth-link"
                      style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}
                    >
                      Privacy Policy
                    </button>
                    {!visitedTabs.has('privacy') && (
                      <span style={{ fontSize: 12, color: 'var(--tf-warning)', marginLeft: 6, fontWeight: 500 }}>
                        Read this tab first
                      </span>
                    )}
                  </span>
                  {agreedToPrivacy && <CheckCircle style={{ width: 16, height: 16, color: 'var(--tf-success)', flexShrink: 0, marginLeft: 'auto' }} />}
                </label>
              </div>

              {/* Create Account Button */}
              <button
                type="button"
                onClick={handleCreateAccount}
                disabled={!agreedToTerms || !agreedToPrivacy || isLoading || termsConsentLoading}
                className={`tf-auth-btn${isLoading ? ' tf-auth-btn--busy' : ''}`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
                    Creating your workspace…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight style={{ width: 17, height: 17 }} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
