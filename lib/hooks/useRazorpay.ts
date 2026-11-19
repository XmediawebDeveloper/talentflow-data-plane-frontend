'use client';

import { useState, useCallback } from 'react';

const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
// Bypass switch — when true, openCheckout returns a fake success without
// opening the Razorpay modal. Backend must also have RAZORPAY_BYPASS_ENABLED=true.
// Both values are inlined at build time, so a production build compiles the
// bypass branch out entirely ("full application" #20).
const RAZORPAY_BYPASS_ENABLED =
  process.env.NEXT_PUBLIC_RAZORPAY_BYPASS_ENABLED === 'true' &&
  process.env.NEXT_PUBLIC_ENVIRONMENT !== 'production' &&
  process.env.NEXT_PUBLIC_ENVIRONMENT !== 'prod';

interface CheckoutParams {
  orderId: string;
  amount: number; // in paise
  currency: string;
  planName: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
}

interface UseRazorpayReturn {
  openCheckout: (params: CheckoutParams) => Promise<RazorpayResponse>;
  isProcessing: boolean;
}

/** Inject the Razorpay script tag and wait for it to load.
 *  No-ops if the script is already present or Razorpay is already on window. */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(false); return; }
    if (window.Razorpay) { resolve(true); return; }

    // Avoid double-injecting
    if (document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`)) {
      // Script tag exists but may not have finished loading yet — poll briefly
      const poll = setInterval(() => {
        if (window.Razorpay) { clearInterval(poll); resolve(true); }
      }, 100);
      setTimeout(() => { clearInterval(poll); resolve(!!window.Razorpay); }, 5000);
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * Hook to open Razorpay checkout modal and return payment details.
 * Loads the Razorpay SDK on-demand (only when openCheckout is called)
 * so it never loads on pages that don't need it.
 * Resolves with RazorpayResponse on success, rejects on failure/dismiss.
 */
export function useRazorpay(): UseRazorpayReturn {
  const [isProcessing, setIsProcessing] = useState(false);

  const openCheckout = useCallback(
    async (params: CheckoutParams): Promise<RazorpayResponse> => {
      // ─── BYPASS MODE ───
      // Skip the Razorpay modal entirely and resolve with a synthetic
      // success response. Backend verify_payment_signature returns true
      // when its own RAZORPAY_BYPASS_ENABLED flag is on.
      if (RAZORPAY_BYPASS_ENABLED) {
        // eslint-disable-next-line no-console
        console.warn(
          '[Razorpay] BYPASS MODE — skipping checkout modal, returning fake success.'
        );
        setIsProcessing(true);
        const rand = () =>
          Math.random().toString(36).slice(2, 16) + Date.now().toString(36);
        // brief tick so callers see a non-instant resolve (matches modal UX)
        await new Promise((r) => setTimeout(r, 400));
        setIsProcessing(false);
        return {
          razorpay_payment_id: `bypass_pay_${rand()}`,
          razorpay_order_id: params.orderId,
          razorpay_signature: `bypass_sig_${rand()}`,
        };
      }

      // Load SDK on demand — no global <Script> tag required
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        throw new Error('Razorpay SDK could not be loaded. Please check your connection and try again.');
      }

      if (!RAZORPAY_KEY_ID) {
        throw new Error('Razorpay key not configured.');
      }

      return new Promise((resolve, reject) => {
        setIsProcessing(true);

        // Track whether payment succeeded — prevents ondismiss from
        // rejecting after the modal auto-closes post-payment (Razorpay quirk)
        let paymentSucceeded = false;

        const options: RazorpayOptions = {
          key: RAZORPAY_KEY_ID,
          amount: params.amount,
          currency: params.currency,
          name: 'TalentFlow',
          description: `${params.planName} Plan`,
          order_id: params.orderId,
          prefill: {
            name: params.userName || '',
            email: params.userEmail || '',
            contact: params.userPhone || '',
          },
          theme: {
            color: '#2563EB',
          },
          handler: (response: RazorpayResponse) => {
            paymentSucceeded = true;
            setIsProcessing(false);
            resolve(response);
          },
          modal: {
            ondismiss: () => {
              setIsProcessing(false);
              // Only reject if payment was NOT already captured
              // (ondismiss fires on modal auto-close after success too)
              if (!paymentSucceeded) {
                reject(new Error('Payment cancelled by user'));
              }
            },
            escape: true,
            confirm_close: true,
          },
        };

        const rzp = new window.Razorpay(options);

        rzp.on('payment.failed', (response: RazorpayError) => {
          setIsProcessing(false);
          reject(
            new Error(
              response.description || 'Payment failed. Please try again.'
            )
          );
        });

        rzp.open();
      });
    },
    []
  );

  return { openCheckout, isProcessing };
}
