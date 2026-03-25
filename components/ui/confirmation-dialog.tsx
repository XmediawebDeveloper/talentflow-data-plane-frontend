import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { ReactNode } from 'react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  children?: ReactNode;
}

/**
 * Confirmation dialog for important actions
 */
export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  children,
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  const variantConfig = {
    danger: {
      icon: XCircle,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      buttonBg: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      icon: AlertTriangle,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      buttonBg: 'bg-amber-600 hover:bg-amber-700',
    },
    info: {
      icon: Info,
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-800',
      buttonBg: 'bg-gray-800 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500',
    },
    success: {
      icon: CheckCircle,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      buttonBg: 'bg-green-600 hover:bg-green-700',
    },
  };

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full pointer-events-auto animate-in zoom-in-95 duration-200">
          <div className="p-6">
            {/* Icon */}
            <div className={`w-12 h-12 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Icon className={`w-6 h-6 ${config.iconColor}`} />
            </div>

            {/* Title */}
            <h3 className="text-xl text-gray-900 text-center mb-2">{title}</h3>

            {/* Description */}
            <p className="text-gray-600 text-center text-sm mb-6">{description}</p>

            {/* Custom content */}
            {children && <div className="mb-6">{children}</div>}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 px-4 py-2.5 ${config.buttonBg} text-white rounded-lg transition-colors text-sm font-medium shadow-sm`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
