'use client';

import { AlertOctagon, Mail, LogOut, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';

interface SuspendedAccountBlockProps {
  suspensionReason?: string;
  suspendedAt?: string;
  contactEmail?: string;
}

/**
 * Full-page block for suspended accounts
 * Shows when subscription_status === 'suspended'
 * Only allows sign out and contact support
 */
export default function SuspendedAccountBlock({
  suspensionReason = 'Your account has been suspended by the administrator.',
  suspendedAt,
  contactEmail = 'support@talentflow.com'
}: SuspendedAccountBlockProps) {
  const router = useRouter();
  const { logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  const handleContactSupport = () => {
    window.location.href = `mailto:${contactEmail}?subject=Account Suspension - Support Request`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl border-2 border-red-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-orange-600 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <AlertOctagon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Account Suspended</h1>
                <p className="text-red-100 text-sm mt-1">Access to your account has been restricted</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-8">
            {/* Suspension Message */}
            <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg mb-8">
              <p className="text-red-800 font-medium mb-2">
                {suspensionReason}
              </p>
              {suspendedAt && (
                <p className="text-red-600 text-sm">
                  Suspended on: {new Date(suspendedAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              )}
            </div>

            {/* Information */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-orange-600 text-sm font-bold">!</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">What does this mean?</h3>
                  <p className="text-gray-600 text-sm">
                    Your account access has been temporarily restricted. You cannot access any features or data until this suspension is resolved.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">How to resolve this?</h3>
                  <p className="text-gray-600 text-sm">
                    Please contact our support team for assistance. They will help you understand the reason for suspension and guide you through the resolution process.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleContactSupport}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <Mail className="w-5 h-5" />
                Contact Support
                <ExternalLink className="w-4 h-4" />
              </button>

              <button
                onClick={handleSignOut}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 border border-gray-300"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>

            {/* Support Info */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-center text-sm text-gray-500">
                Need immediate assistance? Email us at{' '}
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                >
                  {contactEmail}
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            This is an automated system message. Your account data is safe and secure.
          </p>
        </div>
      </div>
    </div>
  );
}
