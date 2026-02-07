'use client';

import { AlertCircle, X, Users, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DowngradeWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeUsers: number;
  newPlanMaxSeats: number;
  usersToDeactivate: number;
  newPlanName: string;
  actionRequired?: string;
}

export default function DowngradeWarningModal({
  isOpen,
  onClose,
  activeUsers,
  newPlanMaxSeats,
  usersToDeactivate,
  newPlanName,
  actionRequired,
}: DowngradeWarningModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleGoToUsers = () => {
    onClose();
    router.push('/organization/user-management');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Cannot Downgrade Plan</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Problem Statement */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900 mb-1">User Limit Exceeded</h3>
                <p className="text-sm text-red-700">
                  You cannot downgrade to <span className="font-semibold">{newPlanName}</span> because you have too many active users.
                </p>
              </div>
            </div>
          </div>

          {/* Current vs New Comparison */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-600 mb-1">Active Users</p>
              <p className="text-2xl font-bold text-gray-900">{activeUsers}</p>
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-gray-400" />
            </div>

            <div className="bg-red-50 rounded-lg p-4 text-center border border-red-200">
              <p className="text-xs text-red-700 mb-1">New Plan Limit</p>
              <p className="text-2xl font-bold text-red-600">{newPlanMaxSeats}</p>
            </div>
          </div>

          {/* Action Required */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-amber-900 mb-2">Required Action</h4>
            <p className="text-sm text-amber-800 mb-3">
              {actionRequired || `You need to deactivate ${usersToDeactivate} user${usersToDeactivate > 1 ? 's' : ''} before downgrading to this plan.`}
            </p>
            <ul className="text-sm text-amber-700 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>Go to User Management</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>Deactivate {usersToDeactivate} user{usersToDeactivate > 1 ? 's' : ''} (consider least recently active users)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>Return here to complete the downgrade</span>
              </li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleGoToUsers}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              Go to User Management
            </button>
            <button
              onClick={onClose}
              className="px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-gray-500 text-center mt-4">
            Need help? Contact support or consider upgrading instead.
          </p>
        </div>
      </div>
    </div>
  );
}
