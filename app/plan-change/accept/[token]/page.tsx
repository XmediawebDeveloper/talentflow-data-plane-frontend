'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, LogIn } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function PlanChangeAcceptPage() {
  const params = useParams();
  const token = params.token as string;

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid acceptance link.');
      return;
    }

    const acceptViaToken = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/plan-changes/accept/${token}`);
        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage('Plan changes have been accepted successfully. Your subscription will continue with the updated terms.');
        } else {
          setStatus('error');
          setMessage(data.detail || 'Failed to accept plan changes. The link may have expired.');
        }
      } catch {
        setStatus('error');
        setMessage('Unable to process your request. Please try again later.');
      }
    };

    acceptViaToken();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className={`px-8 py-6 ${
            status === 'success' ? 'bg-gradient-to-r from-green-600 to-emerald-600'
            : status === 'error' ? 'bg-gradient-to-r from-red-600 to-orange-600'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                {status === 'loading' && <Loader2 className="w-6 h-6 text-white animate-spin" />}
                {status === 'success' && <CheckCircle className="w-6 h-6 text-white" />}
                {status === 'error' && <XCircle className="w-6 h-6 text-white" />}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {status === 'loading' && 'Processing...'}
                  {status === 'success' && 'Changes Accepted'}
                  {status === 'error' && 'Acceptance Failed'}
                </h1>
                <p className="text-white/80 text-sm mt-0.5">Plan Change Acceptance</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-8">
            <p className="text-gray-700 text-sm leading-relaxed">{message || 'Processing your acceptance...'}</p>

            {status !== 'loading' && (
              <div className="mt-6">
                <a
                  href="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  <LogIn className="w-4 h-4" />
                  Go to Login
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-gray-500 text-xs">TalentFlow &mdash; Plan Change Acceptance</p>
        </div>
      </div>
    </div>
  );
}
