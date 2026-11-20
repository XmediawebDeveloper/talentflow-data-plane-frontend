'use client';

// MIRROR PAGE: This file and app/(auth)/complete-payment/page.tsx share the same
// plan display logic (quota rendering, feature list, formatQuotaValue, etc.).
// Any changes made here must also be applied to complete-payment/page.tsx and vice versa.

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft,
  Building2, User, CheckCircle, Loader2, Phone, CreditCard, Check, Sparkles,
  FileText, Shield, X, Briefcase
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { decodePlanId } from '@/lib/utils/planEncoder';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import PlanSelectionModal from './PlanSelectionModal';
import { AUTH_THEME_CSS } from './authTheme';
import Image from 'next/image';
import SuccessAnimation from '@/components/ui/success-animation';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import type { TermsAndConditions } from '@/lib/types/terms';
// Auto-login support after paid signup payment — see handlePaymentSubmit.
import { setTokens, clearTokens } from '@/lib/services/api';
import { sanitizeHtml } from '@/lib/utils/sanitizeHtml';

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
  companyType: string;
  adminEmail: string;
  adminName: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
}

type SignUpStep = 'form' | 'terms' | 'payment' | 'success';

// Same two tenant types (and API values) as Tenant Provisioning in the control plane.
const COMPANY_TYPES = [
  { value: 'agencies', label: 'Recruiting Agency' },
  { value: 'companies', label: 'Companies' },
];

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

// onSwitchToLogin stays in SignUpProps for callers; the in-card "Sign in" link was removed.
// Desktop layout (see SIGNUP_FLOW_CSS): both columns share one screen height.
const SIGNUP_FIT_QUERY = '(min-width: 1024px) and (min-height: 480px)';

// Keeps a fixed-height box from ever scrolling: when its content is taller
// than the box, the whole box is zoomed down (text and elements together)
// just enough to fit, never below MIN_FIT_ZOOM. Re-fits on resize and on any
// content change (OTP strip, password checks, step change).
const MIN_FIT_ZOOM = 0.65;
function useFitToHeight(ref: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const mq = window.matchMedia(SIGNUP_FIT_QUERY);
    const style = el.style as CSSStyleDeclaration & { zoom: string };
    const overflows = () => el.scrollHeight > el.clientHeight + 1;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        style.zoom = '';
        if (!mq.matches || !overflows()) return;
        // First guess from the ratio, then step down until it really fits
        // (zoom rounds sizes, so the first guess can be a few px over).
        let z = Math.max(MIN_FIT_ZOOM, Math.floor((el.clientHeight / el.scrollHeight) * 100) / 100);
        style.zoom = String(z);
        while (overflows() && z > MIN_FIT_ZOOM) {
          z = Math.max(MIN_FIT_ZOOM, +(z - 0.01).toFixed(2));
          style.zoom = String(z);
        }
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    const mo = new MutationObserver(fit);
    mo.observe(el, { childList: true, subtree: true });
    mq.addEventListener('change', fit);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener('change', fit);
      window.removeEventListener('resize', fit);
      style.zoom = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function SignUp({ onBackToPublic }: SignUpProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const panelRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  // Get encoded plan from URL query params (e.g., /signup?plan=ENCODED_ID)
  const encodedPlanFromUrl = searchParams.get('plan');

  // Check if user explicitly selected free trial
  const isExplicitFreeTrial = encodedPlanFromUrl === 'free_trial';

  // State for plan selection modal - show when no plan in URL
  const [showPlanModal, setShowPlanModal] = useState(!encodedPlanFromUrl);
  const [freeTrialAcknowledged, setFreeTrialAcknowledged] = useState(isExplicitFreeTrial);

  const [form, setForm] = useState<SignUpForm>({
    companyName: '',
    companyType: '',
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
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
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
  // Where the success screen's buttons go (no more automatic redirect).
  // `dashboard` is the token hand-off that signs the admin straight in; it is
  // only available after a paid checkout that returned tokens.
  const [successLinks, setSuccessLinks] = useState<{ dashboard: string | null; login: string } | null>(null);
  // After a successful payment the success view counts down and then opens
  // the dashboard on its own. `redirectAt` is the deadline; `clockNow` ticks.
  const [redirectAt, setRedirectAt] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(0);
  // Which billing periods the chosen plan is sold in (drives the summary toggle).
  const [availableIntervals, setAvailableIntervals] = useState<{ MONTHLY: boolean; ANNUAL: boolean }>({ MONTHLY: false, ANNUAL: false });
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  useFitToHeight(panelRef, [step]);
  useFitToHeight(summaryRef, [step, planLoading]);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const [createdSubdomain, setCreatedSubdomain] = useState<string | null>(null);
  const { openCheckout, isProcessing: razorpayProcessing } = useRazorpay();

  // Terms & Conditions state for signup flow
  const [acceptedTermsId, setAcceptedTermsId] = useState<string | null>(null);
  const [termsConsentContent, setTermsConsentContent] = useState<{ terms: TermsAndConditions | null; privacy: TermsAndConditions | null }>({ terms: null, privacy: null });
  const [termsConsentLoading, setTermsConsentLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [activeTermsTab, setActiveTermsTab] = useState<'terms' | 'privacy'>('terms');
  // Tracks which tabs the user has actually opened — checkbox only enabled after viewing
  const [visitedTabs, setVisitedTabs] = useState<Set<'terms' | 'privacy'>>(new Set(['terms']));

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Terms are the second step of the signup card (formerly a modal).
  const openTermsConsentModal = async () => {
    setStep('terms');
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
              setAvailableIntervals({
                MONTHLY: !!monthly && monthly.is_active !== false,
                ANNUAL: !!annual && annual.is_active !== false,
              });
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
    if (trimmed.length < 3) return 'Company name must be at least 3 characters';
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
  // Shown inline once something is typed, so a short number doesn't leave the
  // submit button disabled without explanation.
  const phoneInvalid = form.phoneNumber.trim().length > 0 && !/^[0-9+\-\s()]{10,}$/.test(form.phoneNumber.trim());

  const isFormComplete =
    (freeTrialAcknowledged || !!selectedPlanDetails) &&
    form.companyName.trim().length >= 3 &&
    !companyNameError &&
    !!form.companyType &&
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
        tenant_type: form.companyType || null,
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
        // The success screen offers the way in; nothing redirects on its own.
        const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'talentflow.data.mo.vc';
        const sub = data.subdomain;
        setSuccessLinks({
          dashboard: null,
          login: sub
            ? `https://${sub}.${baseDomain}/login?email=${encodeURIComponent(form.adminEmail)}`
            : `/login?email=${encodeURIComponent(form.adminEmail)}`,
        });
      }

    } catch (err: any) {
      console.error('Signup error:', err);
      let message = err.message || 'Registration failed. Please try again.';
      if (err.name === 'AbortError') {
        message = 'Workspace creation is taking longer than expected. Please try logging in — your account may already be ready.';
      }
      setError(message);
      showErrorToast(message, "Couldn't create your account");
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
      // order details are not logged

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
          showErrorToast(checkoutErr, "Couldn't complete the payment");
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

      // The success screen offers both ways in. With tokens, "Go to dashboard"
      // hands them to the tenant subdomain via the URL fragment (localStorage
      // is per-origin) so the admin lands signed in.
      const loginUrl = createdSubdomain
        ? `https://${createdSubdomain}.${baseDomain}/login?email=${encodeURIComponent(form.adminEmail)}`
        : `/login?email=${encodeURIComponent(form.adminEmail)}`;
      setSuccessLinks({
        dashboard: hasTokens
          ? createdSubdomain
            ? `https://${createdSubdomain}.${baseDomain}/auth/handoff#access_token=${encodeURIComponent(data.access_token)}&refresh_token=${encodeURIComponent(data.refresh_token)}`
            : `/auth/handoff#access_token=${encodeURIComponent(data.access_token)}&refresh_token=${encodeURIComponent(data.refresh_token)}`
          : null,
        login: loginUrl,
      });
      setRedirectAt(Date.now() + 5000);

    } catch (err: any) {
      console.error('Payment error:', err);
      const message = err.message || 'Payment failed. Please try again.';
      setError(message);
      showErrorToast(message, "Couldn't complete the payment");
    } finally {
      setPaymentProcessing(false);
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
          tenant_type: form.companyType || null,
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
      // response body is not logged (account data)

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

  /* ── Payment, success and terms render as panels inside the one signup
     card (no separate screens), so the stepper and the left-hand art stay
     in place while the visitor moves through the steps. ── */
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


  /** Leave the success screen. The dashboard link carries fresh tokens, so
   *  any stale ones on this origin are wiped first. */
  const goTo = (url: string, handoff = false) => {
    if (handoff) {
      try { clearTokens(); } catch {}
    }
    if (/^https?:/.test(url)) window.location.href = url;
    else router.push(url);
  };

  useEffect(() => {
    if (!redirectAt || !successLinks) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setClockNow(t);
      if (t >= redirectAt) {
        window.clearInterval(id);
        const target = successLinks.dashboard ?? successLinks.login;
        if (successLinks.dashboard) {
          try { clearTokens(); } catch {}
        }
        if (/^https?:/.test(target)) window.location.href = target;
        else router.push(target);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [redirectAt, successLinks, router]);
  const redirectSeconds = redirectAt ? (clockNow ? Math.max(0, Math.ceil((redirectAt - clockNow) / 1000)) : 5) : null;

  const isPaidCheckout = !freeTrialAcknowledged && !!selectedPlanDetails;
  const checkoutDone = step === 'success';
  const payTotal = selectedPlanDetails ? Math.round(selectedPlanDetails.base_price * 1.18 * 100) / 100 : 0;
  const payCurrency = selectedPlanDetails?.currency || 'INR';
  const periodWord = billingInterval === 'ANNUAL' ? 'year' : 'month';
  const nextSteps = isPaidCheckout
    ? [
        { title: 'Pay securely', text: 'Complete payment in the secure checkout window.' },
        { title: 'Plan activates', text: 'Your units and limits switch on straight away.' },
        { title: 'Sign in', text: 'Open your workspace and start hiring.' },
      ]
    : [
        { title: 'Workspace created', text: 'Your organisation is set up.' },
        { title: 'Trial started', text: `${trialDays} ${trialDays === 1 ? 'day' : 'days'} with the trial plan's limits.` },
        { title: 'Sign in', text: 'Open your workspace and start hiring.' },
      ];
  // 0 = paying now, 1..3 = finished.
  const nextDoneCount = checkoutDone ? nextSteps.length : 0;

  // Cancel leaves signup and returns to pricing (confirming first if
  // anything was typed).
  const handleCancel = () => {
    const typed = Object.values(form).some((v) => typeof v === 'string' && v.trim() !== '');
    if (typed) {
      setShowLeaveConfirm(true);
      return;
    }
    router.push('/pricing');
  };
  const cancelBusy = isLoading || paymentProcessing || razorpayProcessing;
  // Shown beside each step's main button, at the bottom of the left card.
  const cancelButton = (
    <button type="button" onClick={handleCancel} disabled={cancelBusy} className="tf-su-cancel">
      <X style={{ width: 16, height: 16 }} />
      Cancel
    </button>
  );

  // Header for each group of fields on the Details step: number (or a tick
  // once the group is complete), title and a short hint.
  const sectionHead = (n: number, title: string, hint: string, done: boolean) => (
    <div className="tf-su-sec-head">
      <span className={`tf-su-sec-num${done ? ' is-done' : ''}`} aria-hidden="true">
        {done ? <Check style={{ width: 14, height: 14 }} strokeWidth={3} /> : n}
      </span>
      <div className="tf-su-sec-titles">
        <h3>{title}</h3>
        <p>{hint}</p>
      </div>
      {done && <span className="tf-su-sec-done">Complete</span>}
    </div>
  );

  // Payment and Done are one view: it changes in place when payment succeeds.
  const checkoutPanel = (
    <div className={`tf-co${checkoutDone ? ' is-done' : ''}`}>
      <div className="tf-co-hero">
        <div className="tf-co-badge">
          {checkoutDone ? (
            <SuccessAnimation
              className="tf-co-lottie"
              fallback={
                <span className="tf-co-icon tf-co-icon--ok"><CheckCircle style={{ width: 30, height: 30 }} /></span>
              }
              placeholder={<span className="tf-co-icon tf-co-icon--blank" />}
            />
          ) : (
            <span className="tf-co-icon"><CreditCard style={{ width: 26, height: 26 }} /></span>
          )}
        </div>
        <h2 className="tf-auth-title" style={{ margin: 0 }}>
          {checkoutDone ? (isPaidCheckout ? 'Payment successful' : 'Your free trial has started') : 'Complete your purchase'}
        </h2>
        <p className="tf-co-sub">
          {checkoutDone
            ? isPaidCheckout
              ? `${selectedPlanDetails?.plan_name} is now active for ${form.companyName || 'your workspace'}.`
              : `${form.companyName || 'Your workspace'} is ready to use.`
            : 'Your workspace is ready. Pay to activate your plan.'}
        </p>
      </div>

      {error && !checkoutDone && (
        <div className="tf-auth-alert tf-auth-alert--danger" style={{ marginBottom: 0 }}>
          <AlertCircle style={{ width: 17, height: 17 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="tf-co-grid">
        <section className="tf-co-box" aria-label="Your workspace">
          <h3><Building2 style={{ width: 15, height: 15 }} /> Your workspace</h3>
          <dl>
            <div><dt>Company</dt><dd>{form.companyName || '—'}</dd></div>
            <div><dt>Admin</dt><dd>{form.adminName || '—'}</dd></div>
            <div><dt>Email</dt><dd className="tf-co-ellipsis">{form.adminEmail || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{form.phoneNumber || '—'}</dd></div>
          </dl>
        </section>
        <section className="tf-co-box" aria-label="Plan">
          <h3><Sparkles style={{ width: 15, height: 15 }} /> {checkoutDone ? 'Your plan' : "You're paying for"}</h3>
          <dl>
            <div><dt>Plan</dt><dd>{isPaidCheckout ? selectedPlanDetails?.plan_name : 'Free trial'}</dd></div>
            <div><dt>Billing</dt><dd>{isPaidCheckout ? (billingInterval === 'ANNUAL' ? 'Yearly' : 'Monthly') : `${trialDays} ${trialDays === 1 ? 'day' : 'days'}`}</dd></div>
            <div><dt>Total</dt><dd>{isPaidCheckout ? `${formatCurrency(payTotal, payCurrency)} / ${periodWord}` : formatCurrency(0, payCurrency)}</dd></div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`tf-co-status${checkoutDone ? ' is-ok' : ''}`}>
                  {checkoutDone ? (isPaidCheckout ? 'Paid' : 'Active') : 'Awaiting payment'}
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="tf-co-next">
        <p className="tf-co-next-title">{checkoutDone ? "You're all set" : 'What happens next'}</p>
        <ol>
          {nextSteps.map((n, i) => {
            const state = i < nextDoneCount ? 'done' : i === nextDoneCount ? 'current' : 'todo';
            return (
              <li key={n.title} className={`is-${state}`}>
                <span className="tf-co-next-dot">
                  {state === 'done' ? <Check style={{ width: 13, height: 13 }} strokeWidth={3.2} /> : i + 1}
                </span>
                <div>
                  <strong>{n.title}</strong>
                  <span>{n.text}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {checkoutDone ? (
        <div className="tf-co-actions">
          {successLinks?.dashboard ? (
            <>
              <button type="button" className="tf-auth-btn" onClick={() => goTo(successLinks.dashboard as string, true)}>
                Go to dashboard
                <ArrowRight style={{ width: 17, height: 17 }} />
              </button>
              <button type="button" className="tf-auth-btn tf-auth-btn--outline" onClick={() => goTo(successLinks.login)}>
                Go to login
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="tf-auth-btn"
                disabled={!successLinks}
                onClick={() => successLinks && goTo(successLinks.login)}
              >
                Log in to your dashboard
                <ArrowRight style={{ width: 17, height: 17 }} />
              </button>
              <button type="button" className="tf-auth-btn tf-auth-btn--outline" onClick={() => goTo('/')}>
                Back to home
              </button>
            </>
          )}
        </div>
      ) : null}

      {checkoutDone && redirectSeconds !== null && (
        <div className="tf-co-redirect" role="status" aria-live="polite">
          <span className="tf-co-redirect-bar" aria-hidden="true"><i /></span>
          <span>
            Taking you to your {successLinks?.dashboard ? 'dashboard' : 'login'} in <strong>{redirectSeconds}s</strong>
          </span>
          <button type="button" className="tf-auth-link" onClick={() => setRedirectAt(null)}>
            Stay on this page
          </button>
        </div>
      )}

      {!checkoutDone && (
        <div className="tf-co-pay">
          <div className="tf-su-btnrow">
          <button
            onClick={handlePaymentSubmit}
            disabled={paymentProcessing || razorpayProcessing || !selectedPlanDetails}
            className={`tf-auth-btn tf-auth-btn--auto${paymentProcessing || razorpayProcessing ? ' tf-auth-btn--busy' : ''}`}
          >
            {paymentProcessing || razorpayProcessing ? (
              <>
                <Loader2 className="tf-auth-spin" style={{ width: 17, height: 17 }} />
                Processing payment…
              </>
            ) : (
              <>
                <Lock style={{ width: 16, height: 16 }} />
                Pay {formatCurrency(payTotal, payCurrency)} and activate
              </>
            )}
          </button>
          </div>
        </div>
      )}
    </div>
  );

  const termsPanel = (
          <>
            <button
              type="button"
              onClick={() => { setStep('form'); setError(''); }}
              className="tf-auth-back"
              disabled={isLoading}
            >
              <ArrowLeft style={{ width: 15, height: 15 }} />
              <span>Back to details</span>
            </button>
            <h2 className="tf-auth-title">Review and accept</h2>
            <p className="tf-auth-subtitle">Read both documents, then accept them to create your workspace.</p>

            {error && (
              <div className="tf-auth-alert tf-auth-alert--danger">
                <AlertCircle style={{ width: 17, height: 17 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Tabs */}
            <div style={{
              display: 'flex',
              border: '1px solid var(--tf-border)',
              borderRadius: 'var(--tf-radius-sm) var(--tf-radius-sm) 0 0',
              overflow: 'hidden',
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
            <div style={{ maxHeight: 300, overflowY: 'auto', padding: '16px 18px', border: '1px solid var(--tf-border)', borderTop: 'none', borderRadius: '0 0 var(--tf-radius-sm) var(--tf-radius-sm)', marginBottom: 16 }}>
              {termsConsentLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 14 }}>
                  <Loader2 className="tf-auth-spin" style={{ width: 28, height: 28, color: 'var(--tf-brand-ink)' }} />
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', margin: 0 }}>Loading documents…</p>
                </div>
              ) : activeTermsTab === 'terms' ? (
                termsConsentContent.terms ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(termsConsentContent.terms.content_html) }} style={{ fontSize: 13.5, color: 'var(--tf-ink-muted)', lineHeight: 1.7 }} />
                ) : (
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', textAlign: 'center', padding: 40 }}>Terms &amp; Conditions content is currently unavailable. You may still proceed.</p>
                )
              ) : (
                termsConsentContent.privacy ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(termsConsentContent.privacy.content_html) }} style={{ fontSize: 13.5, color: 'var(--tf-ink-muted)', lineHeight: 1.7 }} />
                ) : (
                  <p style={{ fontSize: 13.5, color: 'var(--tf-ink-subtle)', textAlign: 'center', padding: 40 }}>Privacy Policy content is currently unavailable. You may still proceed.</p>
                )
              )}
            </div>

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

              {/* Cancel + Create account, bottom-right */}
              <div className="tf-su-btnrow">
              {cancelButton}
              <button
                type="button"
                onClick={handleCreateAccount}
                disabled={!agreedToTerms || !agreedToPrivacy || isLoading || termsConsentLoading}
                className={`tf-auth-btn tf-auth-btn--auto${isLoading ? ' tf-auth-btn--busy' : ''}`}
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
          </>
  );

  // Steps shown in the card. Payment only appears for a paid plan.
  const isPaidPlan = !freeTrialAcknowledged && !!selectedPlanDetails;
  // Three steps. The last one is Payment for a paid plan (its success view
  // appears in place) and Done for the free trial — never both.
  const stepItems: Array<{ key: SignUpStep; label: string }> = [
    { key: 'form', label: 'Details' },
    { key: 'terms', label: 'Terms' },
    isPaidPlan ? { key: 'payment', label: 'Payment' } : { key: 'success', label: 'Done' },
  ];
  const stepIndex = step === 'success' ? stepItems.length - 1 : Math.max(0, stepItems.findIndex((s) => s.key === step));


  const billingLabel = billingInterval === 'ANNUAL' ? 'Annual' : 'Monthly';

  // Monthly ↔ Yearly from the order summary. The plan-details effect refetches
  // the matching variant (its id is what registration and payment send), and
  // the URL keeps the choice on refresh. Locked once the account exists,
  // because the interval has already been sent with the registration.
  const canSwitchBilling =
    !freeTrialAcknowledged && !!selectedPlanDetails && availableIntervals.MONTHLY && availableIntervals.ANNUAL &&
    (step === 'form' || step === 'terms') && !isLoading;
  const changeBilling = (interval: 'MONTHLY' | 'ANNUAL') => {
    if (!canSwitchBilling || interval === billingInterval) return;
    setBillingInterval(interval);
    const url = new URL(window.location.href);
    url.searchParams.set('billing', interval);
    window.history.replaceState(window.history.state, '', url.toString());
  };
  const yearlySave = Math.round(selectedPlanDetails?.discount_percentage ?? 0);

  // Order summary figures (GST at 18%, as in the payment step).
  const subtotal = selectedPlanDetails?.base_price ?? 0;
  const gst = Math.round(subtotal * 0.18 * 100) / 100;
  const total = Math.round(subtotal * 1.18 * 100) / 100;
  const summaryCurrency = selectedPlanDetails?.currency || 'INR';
  const includedUnits = selectedPlanDetails?.quotas
    ? Object.entries(selectedPlanDetails.quotas).filter(
        ([key, value]) => !['storage_gb', 'support_level', 'api_rate_limit'].includes(key) && value !== 0 && value !== null && value !== undefined
      )
    : [];

  const planDescription = freeTrialAcknowledged
    ? 'Try TalentFlow before you pick a plan. The trial comes with its own limits for users, jobs and AI usage.'
    : selectedPlanDetails?.description?.trim() || '';
  const enabledFeatures = (selectedPlanDetails?.features || []).filter((f) => f.is_enabled).map((f) => f.feature_name);
  const currentStepLabel = stepItems[stepIndex]?.label ?? '';
  const priceOn = !freeTrialAcknowledged && !!selectedPlanDetails;

  const tick = (on: boolean) =>
    on ? (
      <span className="tf-su-dot tf-su-dot--on"><Check style={{ width: 11, height: 11 }} strokeWidth={3.5} /></span>
    ) : (
      <span className="tf-su-dot" />
    );

  const orderSummary = (
    <aside ref={summaryRef} className={`tf-su-summary${planLoading ? ' is-loading' : ''}`} aria-label="Order summary" aria-busy={planLoading || undefined}>
      <div className="tf-su-summary-head">
        <h2>Order summary</h2>
        <span className="tf-su-chip">{summaryCurrency}</span>
      </div>

      {/* Plan — always shown */}
      {freeTrialAcknowledged || selectedPlanDetails ? (
        <div className="tf-su-plan">
          <div className="tf-su-plan-top">
            <div style={{ minWidth: 0 }}>
              <div className="tf-su-plan-name">{freeTrialAcknowledged ? 'Free trial' : selectedPlanDetails?.plan_name}</div>
              <div className="tf-su-plan-sub">
                {freeTrialAcknowledged
                  ? `${trialDays} ${trialDays === 1 ? 'day' : 'days'} · no payment today`
                  : `${selectedPlanDetails?.plan_tier ? `${selectedPlanDetails.plan_tier.charAt(0)}${selectedPlanDetails.plan_tier.slice(1).toLowerCase()} plan · ` : ''}${formatCurrency(subtotal, summaryCurrency)} / ${billingInterval === 'ANNUAL' ? 'year' : 'month'}`}
              </div>
            </div>
            {canSwitchBilling ? (
              <div className="tf-su-toggle" role="radiogroup" aria-label="Billing period" data-period={billingInterval}>
                <span className="tf-su-toggle-thumb" aria-hidden="true" />
                {(['MONTHLY', 'ANNUAL'] as const).map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    role="radio"
                    aria-checked={billingInterval === interval}
                    onClick={() => changeBilling(interval)}
                    className="tf-su-toggle-opt"
                  >
                    {interval === 'MONTHLY' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
            ) : (
              <span className="tf-su-chip tf-su-chip--accent">{freeTrialAcknowledged ? 'Trial' : billingLabel}</span>
            )}
          </div>
          {canSwitchBilling && yearlySave > 0 && (
            <p className="tf-su-save">
              {billingInterval === 'ANNUAL' ? `You save ${yearlySave}% with yearly billing` : `Save ${yearlySave}% by switching to yearly`}
            </p>
          )}
          {planDescription && <p className="tf-su-desc">{planDescription}</p>}
        </div>
      ) : (
        <p className="tf-su-muted" style={{ margin: '18px 0' }}>Choose a plan to see your order summary.</p>
      )}

      {/* Step-aware block — follows the step on the left */}
      <div key={step} className="tf-su-stepblock">
        <p className="tf-su-eyebrow">Step {stepIndex + 1} of {stepItems.length} · {currentStepLabel}</p>

        {step === 'form' && (
          <>
            {/* Two columns: plan limits | features. Both stretch to fill the card. */}
            {(includedUnits.length > 0 || enabledFeatures.length > 0) && (
              <div className={`tf-su-incl${includedUnits.length > 0 && enabledFeatures.length > 0 ? '' : ' is-single'}`}>
                {includedUnits.length > 0 && (
                  <div className="tf-su-box tf-su-incl-col">
                    <p className="tf-su-box-title">Included in your plan</p>
                    <dl className="tf-su-incl-list">
                      {includedUnits.map(([key, value]) => (
                        <div key={key}>
                          <dt>{getQuotaLabel(key)}</dt>
                          <dd>{formatQuotaValue(key, value as number | string | undefined)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {enabledFeatures.length > 0 && (
                  <div className="tf-su-box tf-su-incl-col">
                    <p className="tf-su-box-title">Features</p>
                    <ul className="tf-su-incl-feats">
                      {enabledFeatures.slice(0, 8).map((f) => (
                        <li key={f}><Check style={{ width: 13, height: 13 }} strokeWidth={3} /> <span>{f}</span></li>
                      ))}
                      {enabledFeatures.length > 8 && (
                        <li className="tf-su-more">+{enabledFeatures.length - 8} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {step === 'terms' && (
          <>
            <div className="tf-su-box">
              <p className="tf-su-box-title">Your details</p>
              <dl className="tf-su-rows">
                <div><dt>Company</dt><dd>{form.companyName || '—'}</dd></div>
                <div><dt>Name</dt><dd>{form.adminName || '—'}</dd></div>
                <div>
                  <dt>Email</dt>
                  <dd className="tf-su-ellipsis">{form.adminEmail || '—'}{otpVerified && <CheckCircle style={{ width: 13, height: 13, marginLeft: 5, color: 'var(--tf-success)', verticalAlign: -2 }} />}</dd>
                </div>
                <div><dt>Phone</dt><dd>{form.phoneNumber || '—'}</dd></div>
              </dl>
            </div>
            <div className="tf-su-box">
              <p className="tf-su-box-title">Documents to accept</p>
              <ul className="tf-su-checks">
                <li>{tick(agreedToTerms)} Terms &amp; Conditions</li>
                <li>{tick(agreedToPrivacy)} Privacy Policy</li>
              </ul>
            </div>
          </>
        )}

        {step === 'payment' && (
          <>
            <div className="tf-su-note">
              <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span>Workspace created for <strong>{form.companyName || 'your company'}</strong>. Pay to activate your plan.</span>
            </div>
            <div className="tf-su-box">
              <p className="tf-su-box-title">Account</p>
              <dl className="tf-su-rows">
                <div><dt>Admin</dt><dd>{form.adminName || '—'}</dd></div>
                <div><dt>Email</dt><dd className="tf-su-ellipsis">{form.adminEmail || '—'}</dd></div>
              </dl>
            </div>
          </>
        )}

        {step === 'success' && (
          <div className="tf-su-note">
            <Sparkles style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>
              {freeTrialAcknowledged
                ? `Your ${trialDays}-day free trial is active.`
                : `${selectedPlanDetails?.plan_name || 'Your'} plan is active.`}{' '}
              Sign in as {form.adminEmail || 'your admin account'} to start hiring.
            </span>
          </div>
        )}
      </div>

      {/* Price — shown until the order is complete */}
      {priceOn && step !== 'success' && (
        <>
          <dl className="tf-su-lines">
            {billingInterval === 'ANNUAL' && selectedPlanDetails?.monthly_price && selectedPlanDetails.monthly_price * 12 > subtotal ? (
              <div>
                <dt>12 × monthly</dt>
                <dd className="tf-su-strike">{formatCurrency(selectedPlanDetails.monthly_price * 12, summaryCurrency)}</dd>
              </div>
            ) : null}
            <div><dt>Subtotal</dt><dd>{formatCurrency(subtotal, summaryCurrency)}</dd></div>
            <div><dt>GST (18%)</dt><dd>{formatCurrency(gst, summaryCurrency)}</dd></div>
          </dl>
          <div className="tf-su-total">
            <span>{step === 'payment' ? 'Amount due' : 'Total today'}</span>
            <div style={{ textAlign: 'right' }}>
              <strong>{formatCurrency(total, summaryCurrency)}</strong>
              <small>per {billingInterval === 'ANNUAL' ? 'year' : 'month'}</small>
            </div>
          </div>
        </>
      )}
      {freeTrialAcknowledged && step !== 'success' && (
        <div className="tf-su-total">
          <span>Total today</span>
          <strong>{formatCurrency(0, summaryCurrency)}</strong>
        </div>
      )}

      {step === 'form' && (
        <div className="tf-su-actions">
          <button
            type="button"
            onClick={() => setShowPlanModal(true)}
            className="tf-auth-btn tf-auth-btn--outline tf-auth-btn--sm"
          >
            Change plan
          </button>
        </div>
      )}
    </aside>
  );

  return (
    <div className="tf-auth tf-signup-page">
      <style>{AUTH_THEME_CSS}</style>
      <style>{SIGNUP_FLOW_CSS}</style>

      {/* Plan Selection Modal - shown when no plan in URL */}
      <PlanSelectionModal
        isOpen={showPlanModal}
        onPlanSelected={handlePlanSelected}
        onClose={() => router.push('/pricing')}
      />

      {/* Cancel with details typed — the app's own dialog, not window.confirm(). */}
      <ConfirmationDialog
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={() => router.push('/pricing')}
        title="Leave sign-up?"
        description="The details you entered will be lost."
        confirmText="Leave"
        variant="warning"
      />

      {/* Top bar */}
      <header className="tf-su-top">
        <div className="tf-su-top-inner">
          <button type="button" onClick={onBackToPublic} className="tf-su-logo" aria-label="TalentFlow home">
            <Image src="/logos/talent_flow_logo.png" alt="BION TalentFlow" width={157} height={35} priority />
          </button>
          <h1 className="tf-su-sr-only">Sign up for TalentFlow</h1>
          <a href="/pricing" className="tf-su-backlink">
            <ArrowLeft style={{ width: 15, height: 15 }} />
            Back to pricing
          </a>
        </div>
      </header>

      <div className="tf-su-shell">
        <main className="tf-su-main">
          <div className="tf-auth-card tf-su-card">
            {/* Stepper — same look as the AI interview creation wizard:
                solid brand-blue + white tick when done, gradient + pulse
                when current, grey numbered circle when still to come. */}
            <div className="tf-su-steps">
              <ol className="tf-su-steps-row" aria-label="Signup progress">
                {stepItems.map((s, i) => {
                  const state = step === 'success' || i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo';
                  return (
                    <li key={s.key} className={`tf-su-step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                      <span className="tf-su-step-pill">
                        <span className="tf-su-step-dotwrap">
                          <span className="tf-su-step-dot">
                            {state === 'done' ? <CheckCircle style={{ width: 20, height: 20 }} /> : <span className="tf-su-step-num">{i + 1}</span>}
                          </span>
                          {state === 'current' && <span aria-hidden="true" className="tf-su-step-pulse tf-step-pulse" />}
                        </span>
                        <span className="tf-su-step-label">{s.label}</span>
                      </span>
                      {i < stepItems.length - 1 && <span className="tf-su-step-bar" aria-hidden="true" />}
                    </li>
                  );
                })}
              </ol>
            </div>
  
            <div key={step} ref={panelRef} className="tf-signup-panel">
            {step === 'form' && (
              <>
            <h2 className="tf-auth-title">Create your account</h2>
            <p className="tf-auth-subtitle">Set up your recruitment workspace.</p>

            {error && (
              <div className="tf-auth-alert tf-auth-alert--danger">
                <AlertCircle style={{ width: 17, height: 17 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="tf-su-form">
              <section className="tf-su-sec">
              {sectionHead(1, 'Workspace', 'Your company details', !!form.companyName.trim() && !!form.companyType && !companyNameError)}
              <div className="tf-su-sec-body">
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

              {/* Company Type */}
              <div className="tf-auth-field">
                <label className="tf-auth-label" htmlFor="tf-signup-company-type">Company type</label>
                <div className="tf-auth-control">
                  <span className="tf-auth-control-icon">
                    <Briefcase style={{ width: 17, height: 17 }} />
                  </span>
                  <Select
                    value={form.companyType}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, companyType: value }))}
                  >
                    <SelectTrigger id="tf-signup-company-type" className="tf-auth-input">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              </div>
              </section>

              <section className="tf-su-sec">
              {sectionHead(2, 'Contact & verification', 'Who will manage it — we send a 6-digit code to your work email', !!form.adminName.trim() && !adminNameError && otpVerified && !!form.phoneNumber.trim() && !phoneInvalid)}
              <div className="tf-su-sec-body is-contact">
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
                <div className={`tf-su-email-group${otpVerified ? '' : ' is-joined'}`}>
                  <div className="tf-auth-control">
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
                      className={`tf-auth-btn tf-auth-btn--auto tf-su-email-btn${otpSent || isSendingOtp ? ' tf-auth-btn--busy' : ''}`}
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
                    aria-invalid={phoneInvalid || undefined}
                    aria-describedby={phoneInvalid ? 'tf-signup-phone-error' : undefined}
                    className={`tf-auth-input${phoneInvalid ? ' is-invalid' : ''}`}
                  />
                </div>
                {/* The submit button stays disabled until this passes, so say why. */}
                {phoneInvalid && (
                  <p id="tf-signup-phone-error" className="tf-auth-field-error">
                    <AlertCircle style={{ width: 14, height: 14 }} />
                    Enter a valid phone number (at least 10 digits)
                  </p>
                )}
              </div>

              {/* Inline OTP — one compact full-width strip under email | phone */}
              {otpSent && !otpVerified && (
                <div className="tf-su-otp">
                  <div className="tf-su-otp-text">
                    <strong>Enter the 6-digit code</strong>
                    <span>Sent to <b>{form.adminEmail}</b></span>
                  </div>
                  <div className="tf-auth-otp-row tf-su-otp-row">
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
                        style={{ width: 38, height: 42, fontSize: 17 }}
                      />
                    ))}
                  </div>
                  <div className="tf-su-otp-links">
                    {isVerifying ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--tf-brand-ink)' }}>
                        <Loader2 className="tf-auth-spin" style={{ width: 14, height: 14 }} />
                        Verifying…
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleResendOtp}
                          disabled={isSendingOtp || resendTimer > 0}
                          className="tf-auth-link"
                        >
                          {isSendingOtp ? 'Sending…' : resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
                        </button>
                        <button
                          type="button"
                          onClick={handleChangeEmail}
                          className="tf-auth-link"
                          style={{ color: 'var(--tf-ink-muted)' }}
                        >
                          Change email
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              </div>
              </section>

              <section className="tf-su-sec">
              {sectionHead(3, 'Security', 'Choose a strong password for the admin account', passwordStrength === 5 && passwordsMatch)}
              <div className="tf-su-sec-body">
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

              {/* Password requirements — compact strip: strength bar + 3×2 checks */}
              {(form.password || form.confirmPassword) && (() => {
                const strengthColor = passwordStrength <= 2
                  ? 'var(--tf-danger)'
                  : passwordStrength <= 3
                    ? 'var(--tf-warning)'
                    : passwordStrength <= 4
                      ? 'var(--tf-brand)'
                      : 'var(--tf-success)';
                const strengthLabel = passwordStrength === 0 ? 'Too weak' : passwordStrength <= 2 ? 'Weak' : passwordStrength <= 3 ? 'Fair' : passwordStrength <= 4 ? 'Good' : 'Strong';
                return (
                  <div className="tf-su-pw">
                    <div className="tf-su-pw-head">
                      <span>Password strength</span>
                      <div className="tf-su-pw-bar" aria-hidden="true">
                        <i style={{ width: `${(passwordStrength / 5) * 100}%`, background: strengthColor }} />
                      </div>
                      <strong style={{ color: strengthColor }}>{strengthLabel}</strong>
                    </div>
                    <ul className="tf-su-pw-reqs">
                      {[
                        { label: '8+ characters', check: passwordChecks.length },
                        { label: 'Uppercase letter', check: passwordChecks.uppercase },
                        { label: 'Lowercase letter', check: passwordChecks.lowercase },
                        { label: 'Number', check: passwordChecks.number },
                        { label: 'Special character', check: passwordChecks.special },
                        { label: 'Passwords match', check: passwordsMatch },
                      ].map((req) => (
                        <li key={req.label} className={req.check ? 'is-ok' : ''}>
                          <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                          {req.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              </div>
              </section>

              {/* Cancel + Submit, pinned to the bottom of the card */}
              <div className="tf-su-btnrow tf-su-foot">
              {cancelButton}
              <button
                type="submit"
                disabled={isLoading || !isFormComplete}
                className={`tf-auth-btn tf-auth-btn--auto${isLoading ? ' tf-auth-btn--busy' : ''}`}
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
              </div>
            </form>

              </>
            )}
            {step === 'terms' && termsPanel}
            {(step === 'payment' || step === 'success') && checkoutPanel}
            </div>
          </div>
        </main>

        {orderSummary}

        {/* After the summary, so on stacked (phone/tablet) layouts it is the last line. */}
        <div className="tf-auth-legal">© 2026 TalentFlow. All rights reserved.</div>
      </div>
    </div>
  );
}

const SIGNUP_FLOW_CSS = `
.tf-signup-page { display: block; padding: 0; }
.tf-signup-page::before { opacity: .12; }
/* Primary buttons on signup: solid brand blue instead of the blue→cyan gradient. */
.tf-signup-page .tf-auth-btn:not(.tf-auth-btn--outline):not(:disabled),
.tf-signup-page .tf-auth-btn--busy:disabled { background: var(--brand-blue); filter: none; }
.tf-signup-page .tf-auth-btn:not(.tf-auth-btn--outline):hover:not(:disabled) { background: var(--tf-brand-active, #0a2f7a); filter: none; }

/* top bar */
.tf-su-top { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--tf-surface) 88%, transparent); backdrop-filter: blur(14px); border-bottom: 1px solid var(--tf-border); }
.tf-su-top-inner { max-width: 1560px; margin: 0 auto; padding: 14px clamp(16px, 3vw, 32px); display: flex; align-items: center; gap: 18px; }
.tf-su-logo { display: inline-flex; padding: 0; border: 0; background: none; cursor: pointer; flex-shrink: 0; }
.tf-su-logo img { height: 32px; width: auto; }
.tf-su-backlink { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--tf-brand-ink); text-decoration: none; flex-shrink: 0; }
.tf-su-backlink:hover { text-decoration: underline; text-underline-offset: 3px; }
.tf-su-backlink svg { transition: transform .2s ease; }
.tf-su-backlink:hover svg { transform: translateX(-2px); }
.tf-su-btnrow { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; }
.tf-su-btnrow > .tf-auth-btn { padding: 0 24px; }

/* Details form: three numbered section cards + a footer with the buttons */
.tf-su-form { display: flex; flex-direction: column; gap: 10px; }
.tf-su-sec { position: relative; padding: 12px 18px 2px; border-radius: 14px; border: 1px solid var(--tf-border); background: linear-gradient(180deg, var(--tf-surface-subtle), var(--tf-surface) 70%); transition: border-color .3s ease, box-shadow .3s ease; }
.tf-su-sec::before { content: ""; position: absolute; left: -1px; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--tf-border-strong); transition: background-color .3s ease; }
.tf-su-sec:focus-within { border-color: var(--tf-brand-border); box-shadow: 0 10px 24px -18px color-mix(in srgb, var(--brand-blue) 55%, transparent); }
.tf-su-sec:focus-within::before { background: var(--brand-blue); }
.tf-su-sec:has(.tf-su-sec-num.is-done)::before { background: var(--tf-success); }
.tf-su-sec-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.tf-su-sec-num { display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0; border-radius: 8px; font-size: 12px; font-weight: 800; background: var(--tf-brand-tint-solid); color: var(--tf-brand-ink); border: 1px solid var(--tf-brand-border); transition: background-color .3s ease, color .3s ease, border-color .3s ease; }
.tf-su-sec-num.is-done { background: var(--brand-blue); border-color: var(--brand-blue); color: #fff; }
.tf-su-sec-titles { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 10px; }
.tf-su-sec-titles h3 { margin: 0; font-size: 14.5px; font-weight: 700; color: var(--tf-ink); line-height: 1.25; }
.tf-su-sec-titles p { margin: 0; font-size: 12.5px; color: var(--tf-ink-subtle); line-height: 1.35; }
.tf-su-sec-done { margin-left: auto; display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: var(--tf-success-tint); color: var(--tf-success-ink); border: 1px solid var(--tf-success-border); flex-shrink: 0; animation: tf-signup-rise .3s ease both; }
.tf-su-sec-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 16px; align-items: start; }
.tf-su-sec-body > * { grid-column: 1 / -1; }
.tf-su-sec-body > .tf-auth-field { grid-column: auto; }
/* Work email + Get code as one control: the button sits inside the field's
   right end (like a search box's button), so the two read as a single piece. */
.tf-su-email-group { position: relative; }
.tf-su-email-group.is-joined .tf-auth-input { padding-right: 118px; }
.tf-su-email-group .tf-su-email-btn {
  position: absolute; top: 5px; right: 5px; bottom: 5px; width: auto;
  height: auto !important; min-height: 0 !important; margin: 0;
  padding: 0 14px; gap: 6px; font-size: 13.5px; white-space: nowrap;
  border-radius: calc(var(--tf-radius-md) - 4px); box-shadow: none;
}
.tf-su-email-group .tf-su-email-btn:hover:not(:disabled) { box-shadow: none; }
.tf-su-email-group .tf-su-email-btn:disabled { border-color: transparent; }
/* Contact: name | email (+ Get code, a little wider) | phone on one row; stacks on phones. */
/* One row only where the form column is wide enough for all three. */
@media (min-width: 1280px) {
  .tf-su-sec-body.is-contact { grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr) minmax(0, 1fr); column-gap: 12px; }
}
/* Tablets and small laptops: the two-column grid every other section uses
   (Name | Email, then Phone), with compact text and a tighter Get code; the
   label note drops (the field's placeholder already says "work email"). */
@media (min-width: 641px) and (max-width: 1279px) {
  .tf-su-sec-body.is-contact { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); }
  .tf-su-sec-body.is-contact .tf-auth-label-note { display: none; }
  .tf-su-sec-body.is-contact .tf-auth-input { font-size: 13.5px; padding-left: 34px; padding-right: 8px; }
  .tf-su-sec-body.is-contact .tf-auth-control-icon { left: 11px; }
  .tf-su-sec-body.is-contact .tf-auth-control-icon svg { width: 15px !important; height: 15px !important; }
  .tf-su-sec-body.is-contact .tf-su-email-btn { font-size: 12.5px; padding-left: 10px; padding-right: 10px; }
  .tf-su-sec-body.is-contact .tf-su-email-group.is-joined .tf-auth-input { padding-right: 92px; }
}
.tf-signup-page [data-slot="select-trigger"][data-placeholder] { color: var(--tf-ink-subtle); }
.tf-su-sec-body .tf-auth-field { margin-bottom: 12px; }
.tf-su-foot { padding-top: 12px; border-top: 1px solid var(--tf-border); }
@media (max-width: 640px) {
  .tf-su-sec { padding: 12px 12px 2px; }
  .tf-su-sec-body { grid-template-columns: 1fr; }
  .tf-su-sec-titles p { display: none; }
}

/* OTP strip: text | 6 boxes | links, on one row */
.tf-su-otp { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px; margin: 0 0 14px; padding: 10px 14px; border-radius: var(--tf-radius-sm); border: 1px solid var(--tf-brand-border); background: var(--tf-brand-tint); animation: tf-signup-rise .35s cubic-bezier(.22,1,.36,1) both; }
.tf-su-otp-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 180px; }
.tf-su-otp-text strong { font-size: 13.5px; font-weight: 700; color: var(--tf-ink); }
.tf-su-otp-text span { font-size: 12.5px; color: var(--tf-ink-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tf-su-otp-text b { font-weight: 600; color: var(--tf-ink-muted); }
.tf-su-otp-row { margin: 0 !important; gap: 6px; flex: none; }
.tf-su-otp-links { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 12.5px; flex: none; }

/* Password strip: strength bar on top, 3×2 checks below */
.tf-su-pw { margin: 0 0 14px; padding: 10px 14px; border-radius: var(--tf-radius-sm); border: 1px solid var(--tf-border); background: var(--tf-surface-subtle); }
.tf-su-pw-head { display: flex; align-items: center; gap: 12px; font-size: 12.5px; color: var(--tf-ink-subtle); }
.tf-su-pw-head strong { font-size: 12.5px; font-weight: 700; min-width: 52px; text-align: right; }
.tf-su-pw-bar { flex: 1; height: 5px; border-radius: 999px; background: var(--tf-surface-sunken); border: 1px solid var(--tf-border); overflow: hidden; }
.tf-su-pw-bar > i { display: block; height: 100%; border-radius: 999px; transition: width .3s ease, background-color .3s ease; }
.tf-su-pw-reqs { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px 14px; }
.tf-su-pw-reqs li { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--tf-ink-subtle); white-space: nowrap; transition: color .2s ease; }
.tf-su-pw-reqs svg { color: var(--tf-border-strong); transition: color .2s ease; }
.tf-su-pw-reqs li.is-ok { color: var(--tf-ink-muted); }
.tf-su-pw-reqs li.is-ok svg { color: var(--tf-success); }
@media (max-width: 640px) {
  .tf-su-otp-links { flex-direction: row; gap: 14px; }
  .tf-su-pw-reqs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  /* Let a long label wrap inside its column instead of running into the next. */
  .tf-su-pw-reqs li { white-space: normal; min-width: 0; }
}
/* Narrow phones: two columns are too tight for "Special character", one per line. */
@media (max-width: 420px) {
  .tf-su-pw-reqs { grid-template-columns: 1fr; }
  /* "Password strength" + rating on one line, the bar full width beneath. */
  .tf-su-pw-head { flex-wrap: wrap; row-gap: 6px; white-space: nowrap; }
  .tf-su-pw-head strong { margin-left: auto; }
  .tf-su-pw-bar { order: 3; flex-basis: 100%; }
}
.tf-su-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tf-su-cancel { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: auto; height: 46px; padding: 0 18px; border-radius: var(--tf-radius-md); border: 1px solid var(--tf-border-strong); background: transparent; color: var(--tf-ink-subtle); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: color .2s ease, background-color .2s ease, border-color .2s ease; }
.tf-su-cancel:hover:not(:disabled) { color: #c2410c; background: rgba(234, 88, 12, .07); border-color: rgba(234, 88, 12, .22); }
.tf-su-cancel:disabled { opacity: .5; cursor: not-allowed; }
@keyframes tf-signup-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* layout */
/* Focused fields: no border or ring — a lighter fill, a soft lift and the
   blue icon show where you are. Invalid fields keep their red border. */
.tf-signup-page .tf-auth-input:focus:not(.is-invalid),
.tf-signup-page .tf-auth-otp:focus {
  border-color: transparent;
  box-shadow: 0 6px 18px -10px rgba(15, 60, 153, .35), 0 0 0 1px rgba(15, 60, 153, .06);
  background: var(--tf-surface);
  outline: none;
}
.tf-signup-page .tf-auth-input.is-invalid:focus { box-shadow: none; }

.tf-su-shell { max-width: 1560px; margin: 0 auto; padding: clamp(20px, 3vw, 40px) clamp(16px, 3vw, 32px) 56px; display: grid; grid-template-columns: minmax(0, 1fr) clamp(440px, 34vw, 540px); gap: clamp(24px, 3vw, 40px); align-items: start; }
.tf-su-card { padding: clamp(20px, 2.6vw, 36px); }

/* stepper */
.tf-su-steps { margin: 0 0 22px; padding: 12px 16px; border-radius: 14px; border: 1px solid var(--tf-border); background: linear-gradient(135deg, var(--tf-surface-subtle), var(--tf-surface)); }
.tf-su-steps-row { display: flex; align-items: center; justify-content: center; gap: 12px; list-style: none; margin: 0; padding: 0; }
.tf-su-step { display: flex; align-items: center; gap: 12px; min-width: 0; }
.tf-su-step-pill { display: flex; align-items: center; gap: 10px; }
.tf-su-step-dotwrap { position: relative; flex-shrink: 0; }
.tf-su-step-dot { position: relative; z-index: 1; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; font-size: 14px; font-weight: 600; background: #f3f4f6; color: #9ca3af; box-shadow: 0 0 0 1px #e5e7eb; transition: background .3s ease, color .3s ease, box-shadow .3s ease; }
.tf-su-step-num { font-variant-numeric: tabular-nums; }
.tf-su-step.is-done .tf-su-step-dot { background: var(--brand-blue); color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.tf-su-step.is-current .tf-su-step-dot { background: linear-gradient(135deg, var(--brand-blue), var(--brand-blue-2)); color: #fff; box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-blue) 10%, transparent), 0 10px 18px -6px color-mix(in srgb, var(--brand-blue) 40%, transparent); }
.tf-su-step-pulse { position: absolute; inset: 0; border-radius: 50%; background: color-mix(in srgb, var(--brand-blue) 25%, transparent); pointer-events: none; }
.tf-su-step-label { font-size: 14px; font-weight: 500; white-space: nowrap; color: #9ca3af; transition: color .3s ease; }
.tf-su-step.is-done .tf-su-step-label { color: #374151; }
.tf-su-step.is-current .tf-su-step-label { color: var(--tf-brand-active, #0a2f7a); }
.dark .tf-su-step-dot { background: rgba(255,255,255,.06); color: #94a3b8; box-shadow: 0 0 0 1px rgba(255,255,255,.12); }
.dark .tf-su-step.is-done .tf-su-step-label { color: #e2e8f0; }
.dark .tf-su-step.is-current .tf-su-step-label { color: #93b4ff; }
.tf-su-step-bar { width: clamp(20px, 6vw, 96px); height: 2px; border-radius: 999px; background: #e5e7eb; transition: background-color .5s ease; }
.dark .tf-su-step-bar { background: rgba(255,255,255,.12); }
.tf-su-step.is-done .tf-su-step-bar { background: var(--brand-blue); }

/* order summary */
.tf-su-summary { position: sticky; top: 92px; background: var(--tf-surface); border: 1px solid var(--tf-border); border-radius: var(--tf-radius); box-shadow: var(--tf-shadow); padding: 24px; animation: tf-signup-rise .6s .1s cubic-bezier(.22,1,.36,1) both; }
.tf-su-summary-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tf-su-summary-head h2 { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.015em; color: var(--tf-ink); }
.tf-su-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: var(--tf-surface-subtle); color: var(--tf-ink-subtle); border: 1px solid var(--tf-border); white-space: nowrap; }
.tf-su-chip--accent { background: var(--tf-brand-tint-solid); color: var(--tf-brand-ink); border-color: var(--tf-brand-border); }
.tf-su-plan { margin-top: 18px; padding-bottom: 16px; border-bottom: 1px solid var(--tf-border); }
.tf-su-plan-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.tf-su-toggle { position: relative; display: inline-flex; flex-shrink: 0; padding: 3px; border-radius: 999px; background: var(--tf-surface-subtle); border: 1px solid var(--tf-border); }
.tf-su-toggle-thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); border-radius: 999px; background: var(--brand-blue); box-shadow: 0 6px 14px -6px color-mix(in srgb, var(--brand-blue) 70%, transparent); transition: transform .35s cubic-bezier(.34,1.56,.64,1); }
.tf-su-toggle[data-period="ANNUAL"] .tf-su-toggle-thumb { transform: translateX(100%); }
.tf-su-toggle-opt { position: relative; z-index: 1; min-width: 64px; height: 28px; padding: 0 12px; border: 0; background: none; border-radius: 999px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--tf-ink-subtle); cursor: pointer; transition: color .25s ease; }
.tf-su-toggle-opt[aria-checked="true"] { color: #fff; }
.tf-su-toggle-opt:focus-visible { outline: 2px solid var(--tf-brand); outline-offset: 2px; }
.tf-su-save { margin: 8px 0 0; display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; background: var(--tf-success-tint); color: var(--tf-success-ink); border: 1px solid var(--tf-success-border); }
.tf-su-summary.is-loading .tf-su-lines, .tf-su-summary.is-loading .tf-su-total, .tf-su-summary.is-loading .tf-su-rows, .tf-su-summary.is-loading .tf-su-plan-sub { opacity: .45; transition: opacity .2s ease; }
.tf-su-desc { margin: 10px 0 0; font-size: 13px; line-height: 1.55; color: var(--tf-ink-muted); }
.tf-su-stepblock { animation: tf-signup-panel .45s cubic-bezier(.22,1,.36,1) both; }
.tf-su-eyebrow { margin: 16px 0 0; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tf-brand-ink); }
.tf-su-stepblock .tf-su-box { margin-top: 10px; }
.tf-su-stepblock .tf-su-note { margin-top: 10px; }
.tf-su-features { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 6px 14px; }
.tf-su-features li { min-width: 0; }
.tf-su-features .tf-su-more { grid-column: 1 / -1; }
.tf-su-rows--two { grid-template-columns: minmax(0,1fr) minmax(0,1fr); column-gap: 20px; }
.tf-su-actions { display: flex; gap: 10px; margin-top: 14px; }
.tf-su-actions > * { flex: 1; min-width: 0; margin: 0 !important; }
.tf-su-features li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--tf-ink-muted); }
.tf-su-features svg { flex-shrink: 0; color: var(--tf-brand-ink); }
.tf-su-features .tf-su-more { padding-left: 22px; color: var(--tf-ink-subtle); font-weight: 600; }
.tf-su-ellipsis { max-width: 210px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tf-su-checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.tf-su-checks li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; font-weight: 600; color: var(--tf-ink); }
.tf-su-dot { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--tf-border); flex-shrink: 0; transition: background-color .3s ease, border-color .3s ease, transform .3s cubic-bezier(.34,1.56,.64,1); }
.tf-su-dot--on { background: var(--tf-success); border-color: var(--tf-success); color: #fff; transform: scale(1.08); }
.tf-su-plan-name { font-size: 16.5px; font-weight: 700; color: var(--tf-ink); }
.tf-su-plan-sub { margin-top: 2px; font-size: 13px; color: var(--tf-ink-subtle); }
.tf-su-box { margin-top: 16px; padding: 14px 16px; border-radius: var(--tf-radius-sm); background: var(--tf-surface-subtle); border: 1px solid var(--tf-border); }
/* Form step: plan limits | features, side by side */
.tf-su-incl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; margin-top: 10px; }
.tf-su-incl.is-single { grid-template-columns: 1fr; }
.tf-su-incl .tf-su-incl-col { margin-top: 0; display: flex; flex-direction: column; min-width: 0; }
.tf-su-incl-list { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.tf-su-incl-list > div { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; }
.tf-su-incl-list > div + div { padding-top: 8px; border-top: 1px dashed var(--tf-border); }
.tf-su-incl-list dt { color: var(--tf-ink-subtle); min-width: 0; }
.tf-su-incl-list dd { margin: 0; font-weight: 700; color: var(--tf-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tf-su-incl-feats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tf-su-incl-feats li { display: flex; align-items: flex-start; gap: 7px; font-size: 13px; line-height: 1.35; color: var(--tf-ink-muted); }
.tf-su-incl-feats svg { flex-shrink: 0; margin-top: 2px; color: var(--tf-success); }
.tf-su-incl-feats .tf-su-more { padding-left: 20px; color: var(--tf-brand-ink); font-weight: 600; }
@media (max-width: 420px) { .tf-su-incl { grid-template-columns: 1fr; } }
.tf-su-box-title { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: var(--tf-ink); }
.tf-su-rows { margin: 0; display: grid; gap: 7px; }
.tf-su-rows > div, .tf-su-lines > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; }
.tf-su-rows dt, .tf-su-lines dt { color: var(--tf-ink-subtle); }
.tf-su-rows dd, .tf-su-lines dd { margin: 0; font-weight: 600; color: var(--tf-ink); font-variant-numeric: tabular-nums; }
.tf-su-lines { margin: 18px 0 0; padding-top: 16px; border-top: 1px solid var(--tf-border); display: grid; gap: 9px; }
.tf-su-strike { text-decoration: line-through; color: var(--tf-ink-faint) !important; font-weight: 500 !important; }
.tf-su-total { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--tf-border); }
.tf-su-total > span { font-size: 15px; font-weight: 700; color: var(--tf-ink); }
.tf-su-total strong { display: block; font-size: 28px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; color: var(--tf-ink); font-variant-numeric: tabular-nums; }
.tf-su-total small { display: block; margin-top: 4px; font-size: 12.5px; color: var(--tf-ink-subtle); }
.tf-su-note { display: flex; gap: 10px; margin-top: 18px; padding: 14px; border-radius: var(--tf-radius-sm); background: var(--tf-success-tint); border: 1px solid var(--tf-success-border); color: var(--tf-success-ink); font-size: 13px; line-height: 1.5; }
.tf-su-muted { margin: 0; font-size: 13px; line-height: 1.55; color: var(--tf-ink-subtle); }

/* checkout (payment + done in one view) */
.tf-co { display: flex; flex-direction: column; justify-content: space-evenly; gap: 16px; min-height: 100%; }
.tf-co-hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; }
.tf-co-badge { display: grid; place-items: center; width: 96px; height: 96px; margin-bottom: 2px; }
.tf-co-lottie { width: 120px; height: 120px; }
.tf-co-icon { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 20px; color: #fff;
  background: linear-gradient(135deg, var(--brand-blue), var(--brand-blue-2)); box-shadow: 0 16px 30px -14px color-mix(in srgb, var(--brand-blue) 70%, transparent);
  animation: tf-co-pop .5s cubic-bezier(.34,1.56,.64,1) both; }
.tf-co-icon--ok { background: linear-gradient(135deg, #16a34a, #22c55e); box-shadow: 0 16px 30px -14px rgba(22,163,74,.7); }
.tf-co-icon--blank { background: transparent; box-shadow: none; }
@keyframes tf-co-pop { from { transform: scale(.6); opacity: 0; } to { transform: none; opacity: 1; } }
.tf-co-sub { margin: 0; font-size: 14.5px; color: var(--tf-ink-subtle); }
.tf-co-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
.tf-co-box { padding: 16px 18px; border-radius: var(--tf-radius-sm); border: 1px solid var(--tf-border); background: var(--tf-surface-subtle); }
.tf-co-box h3 { display: flex; align-items: center; gap: 7px; margin: 0 0 10px; font-size: 13px; font-weight: 700; color: var(--tf-ink); }
.tf-co-box h3 svg { color: var(--tf-brand-ink); }
.tf-co-box dl { margin: 0; display: grid; gap: 8px; }
.tf-co-box dl > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; }
.tf-co-box dt { color: var(--tf-ink-subtle); flex-shrink: 0; }
.tf-co-box dd { margin: 0; font-weight: 600; color: var(--tf-ink); text-align: right; min-width: 0; }
.tf-co-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tf-co-status { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 700;
  background: color-mix(in srgb, #f59e0b 16%, transparent); color: #b45309; }
.tf-co-status.is-ok { background: var(--tf-success-tint); color: var(--tf-success-ink); }
.tf-co-next { padding: 14px 18px; border-radius: var(--tf-radius-sm); border: 1px solid var(--tf-border); }
.tf-co-next-title { margin: 0 0 12px; font-size: 13px; font-weight: 700; color: var(--tf-ink); }
.tf-co-next ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.tf-co-next li { position: relative; display: flex; gap: 10px; align-items: flex-start; }
.tf-co-next-dot { position: relative; z-index: 1; display: grid; place-items: center; width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; font-size: 12px; font-weight: 700;
  background: #f3f4f6; color: #9ca3af; box-shadow: 0 0 0 1px #e5e7eb; transition: background .3s ease, color .3s ease; }
.tf-co-next li.is-current .tf-co-next-dot { background: linear-gradient(135deg, var(--brand-blue), var(--brand-blue-2)); color: #fff; box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-blue) 14%, transparent); }
.tf-co-next li.is-done .tf-co-next-dot { background: var(--brand-blue); color: #fff; box-shadow: none; }
.tf-co-next li > div { display: flex; flex-direction: column; gap: 2px; padding-top: 3px; min-width: 0; }
.tf-co-next strong { font-size: 13px; color: var(--tf-ink); }
.tf-co-next span { font-size: 12px; line-height: 1.45; color: var(--tf-ink-subtle); }
.tf-co-pay { display: flex; flex-direction: column; gap: 10px; }
.tf-co-actions { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 12px; }
.tf-co-redirect { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 12px; font-size: 13px; color: var(--tf-ink-subtle); }
.tf-co-redirect strong { color: var(--tf-ink); font-variant-numeric: tabular-nums; }
.tf-co-redirect-bar { flex-basis: 100%; height: 3px; border-radius: 3px; background: var(--tf-border); overflow: hidden; }
.tf-co-redirect-bar > i { display: block; height: 100%; background: var(--tf-grad); transform-origin: left; animation: tf-co-count 5s linear both; }
@keyframes tf-co-count { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.tf-co.is-done .tf-co-hero h2, .tf-co.is-done .tf-co-sub { animation: tf-signup-rise .5s .15s cubic-bezier(.22,1,.36,1) both; }
.dark .tf-co-next-dot { background: rgba(255,255,255,.06); color: #94a3b8; box-shadow: 0 0 0 1px rgba(255,255,255,.12); }
@media (max-width: 640px) {
  .tf-co-grid, .tf-co-actions, .tf-co-next ol { grid-template-columns: 1fr; }
}
.tf-signup-panel { animation: tf-signup-panel .5s cubic-bezier(.22,1,.36,1) both; }
@keyframes tf-signup-panel { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }

/* Desktop: everything fits one screen. The two columns share the height
   below the top bar; long steps (terms, payment) scroll inside the card. */
@media (min-width: 1024px) and (min-height: 480px) {
  .tf-signup-page { --tf-su-top: 63px; }
  .tf-su-shell { height: calc(100dvh - var(--tf-su-top)); padding-top: 20px; padding-bottom: 20px; align-items: stretch; grid-template-rows: minmax(0, 1fr); }
  .tf-su-main { display: flex; flex-direction: column; min-height: 0; }
  .tf-su-steps { margin: 0 0 18px; flex: none; }
  .tf-su-card { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 22px 28px 24px; }
  .tf-su-card > .tf-signup-panel { flex: 1; min-height: 0; overflow-y: auto; margin-right: -10px; padding-right: 10px; scrollbar-width: thin; }
  .tf-su-card .tf-auth-subtitle { margin-bottom: 16px; }
  .tf-su-card .tf-auth-field { margin-bottom: 12px; }
  .tf-su-shell > .tf-auth-legal { display: none; }
  /* Same height as the left card, and never scrolls: the price block sits at
     the bottom, and short-screen rules below keep the content inside. */
  .tf-su-summary { position: static; align-self: stretch; height: 100%; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
  .tf-su-summary { padding: 20px 22px; }
  .tf-su-summary .tf-su-total { margin-top: 12px; padding-top: 12px; }
  .tf-su-summary .tf-su-lines { margin-top: auto; padding-top: 12px; gap: 6px; }
  /* Fill the summary: the step block grows, and on the form step the two
     columns stretch with their rows spread evenly — no empty gap. */
  .tf-su-summary > .tf-su-stepblock { flex: 1 0 auto; display: flex; flex-direction: column; }
  .tf-su-summary .tf-su-incl { flex: 1 1 auto; }
  .tf-su-summary .tf-su-incl-list, .tf-su-summary .tf-su-incl-feats { flex: 1; justify-content: space-evenly; }
  .tf-su-summary .tf-su-lines { margin-top: 14px; }
  /* Details step fills the card: sections share the free height, the
     buttons sit at the bottom. Tiny screens fall back to the panel scroll. */
  .tf-su-card > .tf-signup-panel:has(> .tf-su-form) { display: flex; flex-direction: column; }
  .tf-su-card .tf-su-form { flex: 1 0 auto; }
  .tf-signup-panel:has(> .tf-su-form) > .tf-auth-subtitle { display: none; }
  .tf-signup-panel:has(> .tf-su-form) > .tf-auth-title { margin-bottom: 14px; }
  .tf-su-sec { flex: 1 0 auto; display: flex; flex-direction: column; }
  .tf-su-sec-body { flex: 1; align-content: center; }
  .tf-su-foot { margin-top: auto; }
}

/* Short desktop screens: compact Details form so the card fits without scrolling. */
@media (min-width: 1024px) and (max-height: 900px) {
  .tf-su-steps { margin-bottom: 12px; padding: 8px 14px; }
  .tf-su-step-dot { width: 34px; height: 34px; }
  .tf-signup-panel:has(> .tf-su-form) > .tf-auth-title { display: none; }
  .tf-su-form { gap: 8px; }
  .tf-su-sec { padding: 10px 16px 0; }
  .tf-su-sec-head { margin-bottom: 8px; }
  .tf-su-sec-body .tf-auth-field { margin-bottom: 10px; }
  .tf-su-sec-body .tf-auth-label { margin-bottom: 6px; }
  .tf-su-sec-body .tf-auth-input, .tf-su-sec-body .tf-auth-btn { height: 42px; min-height: 42px; }
  .tf-su-pw, .tf-su-otp { margin-bottom: 10px; padding: 8px 12px; }
  /* Only the checks still to meet, inline. */
  .tf-su-pw-reqs { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; }
  .tf-su-pw-reqs li.is-ok { display: none; }
  .tf-su-pw:not(:has(.tf-su-pw-reqs li:not(.is-ok))) .tf-su-pw-reqs { display: none; }
  .tf-su-foot { padding-top: 10px; }
  .tf-su-foot .tf-auth-btn, .tf-su-foot .tf-su-cancel { height: 42px; min-height: 42px; }
}
@media (min-width: 1024px) and (max-height: 760px) {
  .tf-su-sec-titles p { display: none; }
  .tf-su-sec-body .tf-auth-input, .tf-su-sec-body .tf-auth-btn { height: 40px; min-height: 40px; }
  .tf-su-card { padding-top: 16px; padding-bottom: 16px; }
}

/* Short desktop screens: tighten the summary so it still fits without scrolling. */
@media (min-width: 1024px) and (max-height: 820px) {
  .tf-su-summary { padding: 16px 20px; }
  .tf-su-summary .tf-su-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tf-su-summary .tf-su-box { margin-top: 10px; padding: 10px 14px; }
  .tf-su-summary .tf-su-plan { margin-top: 12px; padding-bottom: 12px; }
  .tf-su-summary .tf-su-total strong { font-size: 24px; }
}
@media (min-width: 1024px) and (max-height: 720px) {
  .tf-su-summary .tf-su-desc, .tf-su-summary .tf-su-features { display: none; }
  .tf-su-summary .tf-su-eyebrow { margin-top: 10px; }
  .tf-su-summary .tf-su-actions { margin-top: 10px; }
}

@media (max-width: 1023px) {
  .tf-su-shell { grid-template-columns: 1fr; max-width: 680px; }
  .tf-su-summary { position: static; }
}
@media (max-width: 640px) {
  .tf-su-logo img { height: 26px; }
  .tf-su-top-inner { gap: 12px; }
  .tf-su-step-dot { width: 36px; height: 36px; }
  .tf-su-step-label { display: none; }
  .tf-su-steps-row, .tf-su-step { gap: 8px; }
  .tf-su-btnrow > * { flex: 1 1 auto; }
  .tf-su-backlink { font-size: 13px; }
  .tf-su-summary { padding: 20px 16px; }
  /* Phones: no outer card around the form — the section boxes, stepper and
     buttons sit straight on the page and use its full width. */
  .tf-su-shell { padding-left: 12px; padding-right: 12px; padding-top: 16px; gap: 20px; }
  .tf-signup-page .tf-su-card { padding: 0; background: none; border: 0; border-radius: 0; box-shadow: none; }
}
/* Narrow phones: the Monthly/Yearly toggle drops under the plan name. */
@media (max-width: 480px) {
  .tf-su-plan-top { flex-wrap: wrap; }
}
`;
