'use client';

import { FileText, LogOut, Mail, ExternalLink } from 'lucide-react';
import { useTerms } from '@/components/providers/TermsProvider';
import { useAuth } from '@/lib/hooks/useAuth';
import { getLoginUrl } from '@/lib/services/authService';
import { useRouter } from 'next/navigation';
import { ModalA11y } from '@/components/ui/modal-a11y';

interface TermsBlockingOverlayProps {
  accountSuspended?: boolean;
}

export default function TermsBlockingOverlay({ accountSuspended }: TermsBlockingOverlayProps) {
  const { isBlocked, openAcceptanceModal, currentTerms } = useTerms();
  const { logout, isTenantAdmin, user } = useAuth();
  const router = useRouter();

  // Don't render if not blocked, or if account is suspended (suspension overlay takes priority)
  if (!isBlocked || accountSuspended) return null;

  const handleSignOut = async () => {
    const loginUrl = getLoginUrl();
    await logout();
    router.push(loginUrl);
  };

  const handleContactSupport = () => {
    window.location.href = 'mailto:support@talentflow.com?subject=Terms & Conditions - Support Request';
  };

  return (
    <ModalA11y><div className="fixed inset-0 z-[95]">
      <div className="min-h-[100dvh] bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="max-w-[95vw] sm:max-w-2xl w-full">
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-blue-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <FileText className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="tf-page-title text-white">Terms & Conditions Update</h1>
                  <p className="text-blue-100 text-sm mt-1">Action required to continue using TalentFlow</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-8 py-8">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg mb-8">
                {isTenantAdmin ? (
                  <>
                    <p className="text-blue-800 font-medium mb-2">
                      Our Terms & Conditions have been updated and require your acceptance to continue.
                    </p>
                    <p className="text-blue-600 text-sm">
                      The grace period for accepting the updated terms has expired. Please review and accept them to regain access.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-blue-800 font-medium mb-2">
                      Your organization&apos;s administrator needs to accept the updated Terms & Conditions.
                    </p>
                    <p className="text-blue-600 text-sm">
                      Access has been restricted until the account owner accepts the updated terms. Please contact your administrator{user?.tenantAdminEmail ? ` at ${user.tenantAdminEmail}` : ''} to restore access.
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-indigo-600 text-sm font-bold">!</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">What do I need to do?</h3>
                    <p className="tf-body-secondary">
                      Review the updated terms and accept them to restore full access to your account and all features.
                    </p>
                  </div>
                </div>

                {currentTerms && (
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">Updated Terms</h3>
                      <p className="tf-body-secondary">
                        {currentTerms.title} - Version {currentTerms.version}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-4">
                {isTenantAdmin && (
                  <button
                    onClick={openAcceptanceModal}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    Review & Accept Terms
                  </button>
                )}

                <button
                  onClick={handleSignOut}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 border border-gray-300"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>

              {/* Support footer */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <p className="text-center tf-body-muted">
                  Need help? Contact us at{' '}
                  <button
                    onClick={handleContactSupport}
                    className="text-blue-600 hover:text-blue-700 font-medium underline inline-flex items-center gap-1"
                  >
                    support@talentflow.com
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div></ModalA11y>
  );
}
