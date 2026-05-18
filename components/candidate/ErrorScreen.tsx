'use client';

import { AlertCircle, RefreshCw, CheckCircle, Clock, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorScreenProps {
  message: string;
  onRetry?: () => void;
  variant?: 'error' | 'expired' | 'completed' | 'revoked';
}

export function ErrorScreen({ message, onRetry, variant = 'error' }: ErrorScreenProps) {
  const config = {
    error: {
      iconBg: 'bg-red-100',
      icon: <AlertCircle className="w-8 h-8 text-red-600" />,
      title: 'Something went wrong',
    },
    expired: {
      iconBg: 'bg-amber-100',
      icon: <Clock className="w-8 h-8 text-amber-600" />,
      title: 'Link Expired',
    },
    completed: {
      iconBg: 'bg-green-100',
      icon: <CheckCircle className="w-8 h-8 text-green-600" />,
      title: 'Already Completed',
    },
    revoked: {
      iconBg: 'bg-red-100',
      icon: <Ban className="w-8 h-8 text-red-600" />,
      title: 'Invitation Revoked',
    },
  }[variant];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
        <div className={`w-16 h-16 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-6`}>
          {config.icon}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          {config.title}
        </h2>
        <p className="text-gray-600 mb-6">
          {message}
        </p>
        {onRetry && (
          <Button onClick={onRetry} variant="primary">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        )}
        {variant === 'error' && (
          <p className="text-sm text-gray-500 mt-6">
            If the problem persists, please contact support.
          </p>
        )}
      </div>
    </div>
  );
}
