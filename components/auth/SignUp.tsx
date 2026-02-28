'use client';

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
import type { TermsAndConditions } from '@/lib/types/terms';

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
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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
    !emailError &&
    otpVerified &&
    form.adminName.trim().length >= 2 &&
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
    if (!form.companyName.trim()) {
      return 'Company name is required';
    }
    if (form.companyName.trim().length < 2) {
      return 'Company name must be at least 2 characters';
    }

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
    if (!form.adminName.trim()) {
      return 'Your name is required';
    }
    if (form.adminName.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }

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

      const response = await fetch(`${API_URL}/signup/complete-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
            ? `Your ${trialDays}-day free trial has started. Explore all features!`
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
      const message = err.message || 'Registration failed. Please try again.';
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
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_signature: paymentResponse.razorpay_signature,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Payment verification failed');
      }

      // Payment successful - show success and redirect to org subdomain login
      toast.success('Payment successful!', { description: 'Your plan is now active.' });
      setStep('success');
      setTimeout(() => {
        const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'talentflow.data.mo.vc';
        if (createdSubdomain) {
          window.location.href = `https://${createdSubdomain}.${baseDomain}/login?email=${encodeURIComponent(form.adminEmail)}`;
        } else {
          router.push(`/login?email=${encodeURIComponent(form.adminEmail)}`);
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
      // User selected a paid plan - update URL and reload to trigger plan fetch
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('plan', planParam);
      if (billingInterval) {
        newUrl.searchParams.set('billing', billingInterval);
        setBillingInterval(billingInterval);
      }
      window.history.replaceState({}, '', newUrl.toString());
      // Force reload to fetch the new plan details
      window.location.reload();
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

  // Helper function to format currency
  const formatCurrency = (amount: number, currency: string): string => {
    const currencySymbols: Record<string, string> = {
      'USD': '$',
      'INR': '₹',
      'EUR': '€',
      'GBP': '£',
    };
    const symbol = currencySymbols[currency] || currency + ' ';
    return `${symbol}${amount.toLocaleString()}`;
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
    const formatQuotaValue = (key: string, value: number | undefined): string => {
      if (value === undefined || value === null) return 'Unlimited';
      if (value === -1) return 'Unlimited';
      return value.toLocaleString();
    };

    return (
      <div style={containerStyle}>
        {/* Background Blobs */}
        <div style={{ position: 'absolute', top: 80, left: 40, width: 288, height: 288, backgroundColor: '#93C5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
        <div style={{ position: 'absolute', top: 160, right: 40, width: 288, height: 288, backgroundColor: '#C4B5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>

        <div style={{ ...formCardStyle, maxWidth: 600, margin: '0 auto', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #2563EB, #4338CA)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard style={{ width: 24, height: 24, color: '#ffffff' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Complete Your Purchase</h2>
              <p style={{ color: '#6B7280', fontSize: 14 }}>Your account is ready. Complete payment to activate your plan.</p>
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: '#991B1B' }}>{error}</span>
            </div>
          )}

          {/* Plan Summary Card */}
          <div style={{ backgroundColor: '#F9FAFB', borderRadius: 16, padding: 24, marginBottom: 24, border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>{selectedPlanDetails.plan_name}</span>
                  <span style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 12 }}>
                    {selectedPlanDetails.plan_tier}
                  </span>
                </div>
                <p style={{ color: '#6B7280', fontSize: 14 }}>{selectedPlanDetails.description}</p>
              </div>
            </div>

            {/* Price Display with GST Breakdown */}
            <div style={{ padding: '16px 0', borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: '#6B7280' }}>Billing:</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  {billingInterval === 'ANNUAL' ? 'Annual' : 'Monthly'}
                </span>
              </div>
              {/* Strikethrough price and Save badge for annual plans */}
              {billingInterval === 'ANNUAL' && selectedPlanDetails.monthly_price && (selectedPlanDetails.monthly_price * 12) > selectedPlanDetails.base_price && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: '#9CA3AF', textDecoration: 'line-through' }}>
                    {formatCurrency(selectedPlanDetails.monthly_price * 12, selectedPlanDetails.currency)}
                  </span>
                  {selectedPlanDetails.discount_percentage && selectedPlanDetails.discount_percentage > 0 && (
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      borderRadius: 12
                    }}>
                      Save {Math.round(selectedPlanDetails.discount_percentage)}%
                    </span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 14, color: '#6B7280' }}>Plan Price:</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                  {formatCurrency(selectedPlanDetails.base_price, selectedPlanDetails.currency)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: '#6B7280' }}>GST (18%):</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                  {formatCurrency(Math.round(selectedPlanDetails.base_price * 0.18), selectedPlanDetails.currency)}
                </span>
              </div>
              <div style={{ height: 1, backgroundColor: '#E5E7EB', marginBottom: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Total:</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>
                    {formatCurrency(selectedPlanDetails.base_price + Math.round(selectedPlanDetails.base_price * 0.18), selectedPlanDetails.currency)}
                  </span>
                  <span style={{ fontSize: 14, color: '#6B7280', marginLeft: 4 }}>
                    /{billingInterval === 'ANNUAL' ? 'year' : 'month'}
                  </span>
                </div>
              </div>
            </div>

            {/* Included Seats */}
            {selectedPlanDetails.included_seats && (
              <div style={{ marginTop: 12, padding: 12, backgroundColor: '#EEF2FF', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, color: '#4338CA', fontWeight: 500 }}>Included Team Seats</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#4338CA' }}>{selectedPlanDetails.included_seats}</span>
              </div>
            )}
          </div>

          {/* Plan Quotas */}
          {selectedPlanDetails.quotas && Object.keys(selectedPlanDetails.quotas).length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Plan Quotas:</h4>
              <div style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, border: '1px solid #E5E7EB' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {Object.entries(selectedPlanDetails.quotas)
                    .filter(([key]) => !['storage_gb', 'support_level', 'api_rate_limit'].includes(key))
                    .map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                      <span style={{ fontSize: 13, color: '#6B7280' }}>{getQuotaLabel(key)}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{formatQuotaValue(key, value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Features List */}
          {selectedPlanDetails.features && selectedPlanDetails.features.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Included Features:</h4>
              <div style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, border: '1px solid #E5E7EB' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {selectedPlanDetails.features
                    .filter(f => f.is_enabled)
                    .map((feature, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                        <Check style={{ width: 16, height: 16, color: '#10B981', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: '#4B5563' }}>{feature.feature_name}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Account Summary */}
          <div style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #BBF7D0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <CheckCircle style={{ width: 18, height: 18, color: '#16A34A' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>Account Details Confirmed</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: '#166534' }}>
              <div><strong>Company:</strong> {form.companyName}</div>
              <div><strong>Name:</strong> {form.adminName}</div>
              <div><strong>Email:</strong> {form.adminEmail}</div>
              <div><strong>Phone:</strong> {form.phoneNumber}</div>
            </div>
          </div>

          {/* Complete Purchase Button */}
          <button
            onClick={handlePaymentSubmit}
            disabled={paymentProcessing || razorpayProcessing}
            style={{
              ...submitButtonStyle,
              opacity: (paymentProcessing || razorpayProcessing) ? 0.7 : 1,
              cursor: (paymentProcessing || razorpayProcessing) ? 'not-allowed' : 'pointer',
            }}
          >
            {paymentProcessing || razorpayProcessing ? (
              <>
                <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
                Processing Payment...
              </>
            ) : (
              <>
                <CreditCard style={{ width: 20, height: 20 }} />
                Pay & Activate - {formatCurrency(selectedPlanDetails.base_price + Math.round(selectedPlanDetails.base_price * 0.18), selectedPlanDetails.currency)}
              </>
            )}
          </button>

          {/* Security Notice */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, color: '#6B7280', fontSize: 13 }}>
            <ShieldCheck style={{ width: 16, height: 16 }} />
            <span>Secure payment processing</span>
          </div>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Success Step UI
  if (step === 'success') {
    return (
      <div style={containerStyle}>
        <div style={{ ...formCardStyle, maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle style={{ width: 40, height: 40, color: '#16A34A' }} />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Welcome to TalentFlow!</h2>
          <p style={{ color: '#6B7280', marginBottom: 16 }}>Your account has been created successfully.</p>

          {/* Show plan info */}
          {freeTrialAcknowledged && (
            <div style={{
              padding: 16,
              backgroundColor: '#F0FDF4',
              borderRadius: 12,
              border: '1px solid #BBF7D0',
              marginBottom: 24,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                <Sparkles style={{ width: 20, height: 20, color: '#059669' }} />
                <span style={{ fontSize: 16, fontWeight: 600, color: '#166534' }}>
                  {trialDays}-Day Free Trial Activated
                </span>
              </div>
              <p style={{ fontSize: 14, color: '#15803D' }}>
                Explore all premium features. Upgrade anytime from your dashboard.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6B7280' }}>
            <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
            Redirecting to login...
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Main Form UI
  return (
    <div style={containerStyle}>
      {/* Plan Selection Modal - shown when no plan in URL */}
      <PlanSelectionModal
        isOpen={showPlanModal}
        onPlanSelected={handlePlanSelected}
        onClose={() => router.push('/pricing')}
      />

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
                <div style={{ color: '#111827', fontWeight: 500 }}>{trialDays}-Day Free Trial</div>
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
            <p style={{ color: '#6B7280', marginBottom: 16 }}>Set up your recruitment workspace</p>

            {/* Selected Plan Indicator */}
            {(freeTrialAcknowledged || selectedPlanDetails) && (
              <div
                style={{
                  marginBottom: 24,
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: freeTrialAcknowledged ? '#F0FDF4' : '#EFF6FF',
                  border: `1px solid ${freeTrialAcknowledged ? '#BBF7D0' : '#BFDBFE'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: freeTrialAcknowledged ? '#D1FAE5' : '#DBEAFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {freeTrialAcknowledged ? (
                      <Sparkles style={{ width: 20, height: 20, color: '#059669' }} />
                    ) : (
                      <CreditCard style={{ width: 20, height: 20, color: '#2563EB' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: freeTrialAcknowledged ? '#166534' : '#1E40AF' }}>
                      {freeTrialAcknowledged ? `Free Trial (${trialDays} days)` : selectedPlanDetails?.plan_name}
                    </div>
                    <div style={{ fontSize: 12, color: freeTrialAcknowledged ? '#15803D' : '#3B82F6' }}>
                      {freeTrialAcknowledged ? 'No credit card required' : `${formatCurrency(selectedPlanDetails?.base_price || 0, selectedPlanDetails?.currency || 'INR')} / ${billingInterval === 'ANNUAL' ? 'year' : 'month'}`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlanModal(true)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: freeTrialAcknowledged ? '#166534' : '#1E40AF',
                    backgroundColor: 'transparent',
                    border: `1px solid ${freeTrialAcknowledged ? '#86EFAC' : '#93C5FD'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  Change Plan
                </button>
              </div>
            )}

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
                      disabled={otpSent}
                      style={{
                        ...inputStyle,
                        borderColor: otpVerified ? '#10B981' : emailError ? '#EF4444' : '#D1D5DB',
                        backgroundColor: otpSent ? (otpVerified ? '#F0FDF4' : '#F9FAFB') : '#F9FAFB',
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
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
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
                      <span style={{ color: '#D1D5DB' }}>|</span>
                      <button
                        type="button"
                        onClick={handleChangeEmail}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#DC2626',
                          fontWeight: 500,
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Change Email
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
                    placeholder="+91 98765 43210"
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
                      style={{
                        ...inputStyle,
                        paddingRight: 40,
                        borderColor: form.password ? (passwordStrength === 5 ? '#10B981' : passwordStrength >= 3 ? '#F59E0B' : '#EF4444') : '#D1D5DB',
                      }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                      {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, color: '#9CA3AF' }} />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={handleChange('confirmPassword')}
                      placeholder="Confirm password"
                      required
                      style={{
                        ...inputStyle,
                        paddingRight: 40,
                        borderColor: form.confirmPassword ? (passwordsMatch ? '#10B981' : '#EF4444') : '#D1D5DB',
                      }}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                      {showConfirmPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Requirements - Live Validation */}
              {(form.password || form.confirmPassword) && (
                <div style={{
                  marginBottom: 16,
                  padding: 16,
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: 12
                }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Password Requirements:</p>
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
                          width: 16,
                          height: 16,
                          color: req.check ? '#10B981' : '#D1D5DB',
                          transition: 'color 0.2s'
                        }} />
                        <span style={{
                          fontSize: 13,
                          color: req.check ? '#059669' : '#6B7280',
                          transition: 'color 0.2s'
                        }}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Strength Bar */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>Password Strength</span>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: passwordStrength <= 2 ? '#EF4444' : passwordStrength <= 3 ? '#F59E0B' : passwordStrength <= 4 ? '#3B82F6' : '#10B981'
                      }}>
                        {passwordStrength === 0 ? 'Too Weak' : passwordStrength <= 2 ? 'Weak' : passwordStrength <= 3 ? 'Fair' : passwordStrength <= 4 ? 'Good' : 'Strong'}
                      </span>
                    </div>
                    <div style={{
                      height: 6,
                      backgroundColor: '#E5E7EB',
                      borderRadius: 3,
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${(passwordStrength / 5) * 100}%`,
                        backgroundColor: passwordStrength <= 2 ? '#EF4444' : passwordStrength <= 3 ? '#F59E0B' : passwordStrength <= 4 ? '#3B82F6' : '#10B981',
                        borderRadius: 3,
                        transition: 'all 0.3s ease'
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || !isFormComplete}
                style={{
                  ...submitButtonStyle,
                  opacity: isLoading || !isFormComplete ? 0.5 : 1,
                  cursor: isLoading || !isFormComplete ? 'not-allowed' : 'pointer',
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
                    <FileText style={{ width: 20, height: 20 }} />
                    View Terms & Conditions
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
            © 2026 TalentFlow. All rights reserved.
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Terms Consent Modal */}
      {showTermsConsentModal && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #2563EB, #4338CA)', borderRadius: '20px 20px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText style={{ width: 20, height: 20, color: '#fff' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Review Legal Documents</h2>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0 }}>Accept both documents to create your account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsConsentModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB', flexShrink: 0 }}>
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
                    padding: '13px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontSize: 14,
                    fontWeight: activeTermsTab === key ? 600 : 400,
                    color: activeTermsTab === key ? '#2563EB' : '#6B7280',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: activeTermsTab === key ? '2px solid #2563EB' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <Icon style={{ width: 15, height: 15 }} />
                  {label}
                  {agreed && <CheckCircle style={{ width: 14, height: 14, color: '#10B981' }} />}
                </button>
              ))}
            </div>

            {/* Document Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {termsConsentLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 16 }}>
                  <Loader2 style={{ width: 40, height: 40, color: '#2563EB', animation: 'spin 1s linear infinite' }} />
                  <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>Loading documents...</p>
                </div>
              ) : activeTermsTab === 'terms' ? (
                termsConsentContent.terms ? (
                  <div dangerouslySetInnerHTML={{ __html: termsConsentContent.terms.content_html }} style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }} />
                ) : (
                  <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', padding: 40 }}>Terms & Conditions content is currently unavailable. You may still proceed.</p>
                )
              ) : (
                termsConsentContent.privacy ? (
                  <div dangerouslySetInnerHTML={{ __html: termsConsentContent.privacy.content_html }} style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }} />
                ) : (
                  <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', padding: 40 }}>Privacy Policy content is currently unavailable. You may still proceed.</p>
                )
              )}
            </div>

            {/* Footer — Checkboxes + Create Account */}
            <div style={{ padding: '20px 24px', borderTop: '2px solid #E5E7EB', backgroundColor: '#F9FAFB', borderRadius: '0 0 20px 20px', flexShrink: 0 }}>
              {/* Acceptance Checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {/* Terms & Conditions checkbox — always enabled (modal opens on this tab) */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', backgroundColor: agreedToTerms ? '#F0FDF4' : '#fff', border: `1px solid ${agreedToTerms ? '#86EFAC' : '#D1D5DB'}`, borderRadius: 10, transition: 'all 0.2s' }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    style={{ marginTop: 2, width: 17, height: 17, cursor: 'pointer', accentColor: '#2563EB', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
                    I have read and agree to the{' '}
                    <button type="button" onClick={(e) => { e.preventDefault(); setActiveTermsTab('terms'); setVisitedTabs(prev => new Set([...prev, 'terms' as const])); }} style={{ color: '#2563EB', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, textDecoration: 'underline' }}>
                      Terms & Conditions
                    </button>
                  </span>
                  {agreedToTerms && <CheckCircle style={{ width: 18, height: 18, color: '#10B981', flexShrink: 0, marginLeft: 'auto' }} />}
                </label>

                {/* Privacy Policy checkbox — disabled until user clicks the Privacy Policy tab */}
                <label
                  title={!visitedTabs.has('privacy') ? 'Please read the Privacy Policy tab first' : undefined}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: visitedTabs.has('privacy') ? 'pointer' : 'not-allowed', padding: '10px 12px', backgroundColor: !visitedTabs.has('privacy') ? '#F3F4F6' : agreedToPrivacy ? '#F0FDF4' : '#fff', border: `1px solid ${!visitedTabs.has('privacy') ? '#E5E7EB' : agreedToPrivacy ? '#86EFAC' : '#D1D5DB'}`, borderRadius: 10, transition: 'all 0.2s', opacity: visitedTabs.has('privacy') ? 1 : 0.6 }}
                >
                  <input
                    type="checkbox"
                    checked={agreedToPrivacy}
                    disabled={!visitedTabs.has('privacy')}
                    onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                    style={{ marginTop: 2, width: 17, height: 17, cursor: visitedTabs.has('privacy') ? 'pointer' : 'not-allowed', accentColor: '#2563EB', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 14, color: visitedTabs.has('privacy') ? '#374151' : '#9CA3AF', lineHeight: 1.5 }}>
                    I have read and agree to the{' '}
                    <button type="button" onClick={(e) => { e.preventDefault(); setActiveTermsTab('privacy'); setVisitedTabs(prev => new Set([...prev, 'privacy' as const])); }} style={{ color: '#2563EB', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, textDecoration: 'underline' }}>
                      Privacy Policy
                    </button>
                    {!visitedTabs.has('privacy') && <span style={{ fontSize: 12, color: '#F59E0B', marginLeft: 6, fontWeight: 500 }}>← Read first</span>}
                  </span>
                  {agreedToPrivacy && <CheckCircle style={{ width: 18, height: 18, color: '#10B981', flexShrink: 0, marginLeft: 'auto' }} />}
                </label>
              </div>

              {/* Create Account Button */}
              <button
                type="button"
                onClick={handleCreateAccount}
                disabled={!agreedToTerms || !agreedToPrivacy || isLoading}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: agreedToTerms && agreedToPrivacy ? 'linear-gradient(135deg, #2563EB, #4338CA)' : '#E5E7EB',
                  color: agreedToTerms && agreedToPrivacy ? '#ffffff' : '#9CA3AF',
                  fontSize: 16,
                  fontWeight: 600,
                  borderRadius: 12,
                  border: 'none',
                  cursor: agreedToTerms && agreedToPrivacy && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.3s',
                  boxShadow: agreedToTerms && agreedToPrivacy ? '0 8px 30px rgba(37, 99, 235, 0.35)' : 'none',
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
                    Creating your workspace...
                  </>
                ) : (
                  <>
                    <ArrowRight style={{ width: 20, height: 20 }} />
                    Create Account
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
