'use client';

import { useState } from 'react';
import { Shield, Mail, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IdentityVerificationScreenProps {
  onVerified: () => void;
  token: string;
}

export function IdentityVerificationScreen({ onVerified, token }: IdentityVerificationScreenProps) {
  const [candidateEmail, setCandidateEmail] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    // Validation
    if (!candidateEmail.trim()) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(candidateEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

      const response = await fetch(`${API_URL}/candidate/assessment/${token}/verify-identity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          candidate_email: candidateEmail.trim().toLowerCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Verification failed');
      }

      if (data.verified) {
        // Store verification in session
        sessionStorage.setItem(`identity_verified_${token}`, 'true');
        // SECURITY: Store verified email for use when starting assessment
        sessionStorage.setItem(`verified_email_${token}`, candidateEmail.trim().toLowerCase());
        onVerified();
      } else {
        setError(data.message || 'Identity verification failed. Please check your email address.');
      }
    } catch (err: any) {
      console.error('[IDENTITY] Verification error:', err);
      setError(err.message || 'Failed to verify identity. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isVerifying) {
      handleVerify();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Lock Icon */}
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield className="w-10 h-10 text-blue-600" />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-3 text-center">
          Identity Verification
        </h1>

        <p className="text-gray-600 text-center mb-8">
          To ensure assessment security, please verify your identity by entering the email address where you received the invitation.
        </p>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-destructive-subtle border border-destructive-line rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive-strong">Verification Failed</p>
              <p className="text-sm text-destructive mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="space-y-5">
          {/* Email Address */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="email"
                type="email"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="your.email@example.com"
                disabled={isVerifying}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                autoFocus
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Use the email address where you received the invitation
            </p>
          </div>

          {/* Verify Button */}
          <Button
            onClick={handleVerify}
            disabled={isVerifying || !candidateEmail.trim()}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Verify Identity
              </>
            )}
          </Button>
        </div>

        {/* Security Notice */}
        <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-gray-900 mb-1">Security Notice</p>
              <p className="text-xs text-gray-600">
                This verification ensures that only the invited candidate can access this assessment.
                Your email must match the address where you received the invitation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
