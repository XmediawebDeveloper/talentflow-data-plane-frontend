import { AlertCircle, Lock, CreditCard, UserX, CheckCircle } from 'lucide-react';
import { User, Tenant, isSubscriptionActive, hasAvailableUnits, getRemainingUnits } from '@/lib/types/tenant';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface PreConditionGuardProps {
  user: User;
  tenant: Tenant;
  requiredPermission: keyof User['permissions'];
  requiredUnits?: 'jobPostings' | 'assessments' | 'resumeUploads' | 'aiInterviews';
  children: React.ReactNode;
  onUpgradePlan?: () => void;
}

interface PreConditionError {
  type: 'subscription' | 'permission' | 'units';
  title: string;
  message: string;
  action?: string;
}

export default function PreConditionGuard({
  user,
  tenant,
  requiredPermission,
  requiredUnits,
  children,
  onUpgradePlan,
}: PreConditionGuardProps) {
  const errors: PreConditionError[] = [];

  // Check 1: Tenant subscription is active
  if (!isSubscriptionActive(tenant.subscription)) {
    errors.push({
      type: 'subscription',
      title: 'Subscription Inactive',
      message: `Your ${tenant.subscription.planName} subscription has ${tenant.subscription.status === 'expired' ? 'expired' : 'been suspended'}. Please renew your subscription to continue using this feature.`,
      action: 'Renew Subscription',
    });
  }

  // Check 2: User has required permission
  if (!user.permissions[requiredPermission]) {
    const roleNames = {
      tenant_admin: 'Owner',
      recruiter: 'Recruiter',
      viewer: 'Viewer',
    };

    errors.push({
      type: 'permission',
      title: 'Permission Required',
      message: `Your role (${roleNames[user.role]}) does not have permission to access this feature. Please contact your Owner to request the necessary permissions.`,
      action: 'Contact Admin',
    });
  }

  // Check 3: Required units are available
  if (requiredUnits && !hasAvailableUnits(requiredUnits, tenant.subscription)) {
    const remaining = getRemainingUnits(requiredUnits, tenant.subscription);
    const unitNames = {
      jobPostings: 'Job Posting',
      assessments: 'Assessment',
      resumeUploads: 'Resume Storage',
      aiInterviews: 'AI Interview',
    };

    errors.push({
      type: 'units',
      title: 'No Units Available',
      message: `You have used all ${tenant.subscription.limits[requiredUnits]} ${unitNames[requiredUnits]} units in your current plan. Please upgrade your plan or wait for renewal on ${formatISTDate(tenant.subscription.renewalDate)}.`,
      action: 'Upgrade Plan',
    });
  }

  // If all conditions are met, render children
  if (errors.length === 0) {
    return <>{children}</>;
  }

  // Otherwise, show error state
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-gray-900 text-2xl mb-2">Access Restricted</h2>
          <p className="text-gray-600">
            Please complete the following requirements to access this feature:
          </p>
        </div>

        {/* Pre-Condition Checklist */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-gray-400" />
            Pre-Conditions Required
          </h3>
          
          <div className="space-y-4">
            {/* Tenant & Subscription Check */}
            <div className="flex items-start gap-3">
              {isSubscriptionActive(tenant.subscription) ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`${isSubscriptionActive(tenant.subscription) ? 'text-gray-900' : 'text-gray-700'}`}>
                  Tenant registered with active subscription
                </p>
                {!isSubscriptionActive(tenant.subscription) && (
                  <p className="text-sm text-red-600 mt-1">
                    Your subscription is {tenant.subscription.status}
                  </p>
                )}
              </div>
            </div>

            {/* User Login Check - Always passes if viewing this */}
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-gray-900">User successfully logged in</p>
                <p className="text-sm text-gray-500 mt-1">
                  Logged in as: {user.email}
                </p>
              </div>
            </div>

            {/* Permission Check */}
            <div className="flex items-start gap-3">
              {user.permissions[requiredPermission] ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`${user.permissions[requiredPermission] ? 'text-gray-900' : 'text-gray-700'}`}>
                  User has required role and permissions
                </p>
                {!user.permissions[requiredPermission] && (
                  <p className="text-sm text-red-600 mt-1">
                    Your role ({user.role}) lacks this permission
                  </p>
                )}
              </div>
            </div>

            {/* Units Check */}
            {requiredUnits && (
              <div className="flex items-start gap-3">
                {hasAvailableUnits(requiredUnits, tenant.subscription) ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`${hasAvailableUnits(requiredUnits, tenant.subscription) ? 'text-gray-900' : 'text-gray-700'}`}>
                    Active units available for this feature
                  </p>
                  {!hasAvailableUnits(requiredUnits, tenant.subscription) ? (
                    <p className="text-sm text-red-600 mt-1">
                      {tenant.subscription.usage[requiredUnits]} / {tenant.subscription.limits[requiredUnits]} units used
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 mt-1">
                      {getRemainingUnits(requiredUnits, tenant.subscription)} units remaining
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Cards */}
        <div className="space-y-4">
          {errors.map((error, index) => (
            <div
              key={index}
              className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3"
            >
              <div className="flex-shrink-0 mt-0.5">
                {error.type === 'subscription' && <CreditCard className="w-5 h-5 text-red-600" />}
                {error.type === 'permission' && <UserX className="w-5 h-5 text-red-600" />}
                {error.type === 'units' && <AlertCircle className="w-5 h-5 text-red-600" />}
              </div>
              <div className="flex-1">
                <h4 className="text-red-900 mb-1">{error.title}</h4>
                <p className="text-sm text-red-700">{error.message}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3 justify-center">
          {errors.some(e => e.type === 'subscription' || e.type === 'units') && onUpgradePlan && (
            <button
              onClick={onUpgradePlan}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              Upgrade Plan
            </button>
          )}
          {errors.some(e => e.type === 'permission') && (
            <button
              onClick={() => {
                // In real app, this would open a contact modal or redirect
                toast.warning('Please contact your Owner to request permissions.');
              }}
              className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Contact Admin
            </button>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-gray-800 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700">
              <p className="mb-1">
                <strong>Need help?</strong>
              </p>
              <p>
                Contact your Owner ({tenant.email}) or our support team for assistance with access requirements.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
