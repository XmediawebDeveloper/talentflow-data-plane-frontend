'use client';

import { useState, useCallback } from 'react';

const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';

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

/**
 * Hook to open Razorpay checkout modal and return payment details.
 * Resolves with RazorpayResponse on success, rejects on failure/dismiss.
 */
export function useRazorpay(): UseRazorpayReturn {
  const [isProcessing, setIsProcessing] = useState(false);

  const openCheckout = useCallback(
    (params: CheckoutParams): Promise<RazorpayResponse> => {
      return new Promise((resolve, reject) => {
        if (!window.Razorpay) {
          reject(new Error('Razorpay SDK not loaded. Please refresh the page.'));
          return;
        }

        if (!RAZORPAY_KEY_ID) {
          reject(new Error('Razorpay key not configured.'));
          return;
        }

        setIsProcessing(true);

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
            setIsProcessing(false);
            resolve(response);
          },
          modal: {
            ondismiss: () => {
              setIsProcessing(false);
              reject(new Error('Payment cancelled by user'));
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
