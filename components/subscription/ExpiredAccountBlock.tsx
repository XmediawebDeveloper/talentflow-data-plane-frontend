'use client';

import { Clock, LogOut, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { getLoginUrl } from '@/lib/services/authService';

interface ExpiredAccountBlockProps {
  adminEmail?: string;
}

/**
 * Full-page block for non-admin users when the tenant subscription has expired.
 * Admins are redirected to /subscription/current-plan to renew.
 * Regular users cannot renew — they must contact their admin.
 * Only action allowed: Sign Out.
 */
export default function ExpiredAccountBlock({ adminEmail }: ExpiredAccountBlockProps) {
  const router = useRouter();
  const { logout } = useAuth();

  const handleSignOut = async () => {
    const loginUrl = getLoginUrl();
    await logout();
    router.push(loginUrl);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl border-2 border-orange-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Subscription Expired</h1>
                <p className="text-orange-100 text-sm mt-1">
                  Your organization's subscription has ended
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-8">
            {/* Main Message */}
            <div className="bg-orange-50 border-l-4 border-orange-500 p-6 rounded-r-lg mb-8">
              <p className="text-orange-900 font-medium mb-2">
                Access to this application has been temporarily suspended because the subscription plan has expired.
              </p>
              <p className="text-orange-700 text-sm">
                You cannot log in or use any features until the subscription is renewed by your administrator.
              </p>
            </div>

            {/* What to do */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">What should you do?</h3>
                  <p className="text-gray-600 text-sm">
                    Contact your organization's administrator and ask them to renew the subscription plan.
                    Once the plan is renewed, you will regain full access automatically.
                  </p>
                </div>
              </div>

              {adminEmail && (
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-orange-600 text-sm font-bold">@</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Your Administrator</h3>
                    <a
                      href={`mailto:${adminEmail}?subject=Subscription Renewal Required`}
                      className="text-blue-600 hover:text-blue-700 font-medium underline text-sm"
                    >
                      {adminEmail}
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 border border-gray-300"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            Your data is safe. Access will be restored once your administrator renews the plan.
          </p>
        </div>
      </div>
    </div>
  );
}
