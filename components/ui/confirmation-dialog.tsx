import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';
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
      iconBg: 'bg-brand-orange/10',
      iconColor: 'text-brand-orange-deep',
      buttonBg: 'bg-brand-orange hover:bg-brand-orange-deep',
    },
    info: {
      icon: Info,
      iconBg: 'bg-brand-blue/10',
      iconColor: 'text-brand-blue',
      buttonBg: 'bg-brand-blue hover:bg-brand-blue-2',
    },
    success: {
      icon: CheckCircle,
      iconBg: 'bg-brand-teal/10',
      iconColor: 'text-brand-teal',
      buttonBg: 'bg-brand-teal hover:bg-brand-cyan',
    },
  };

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 max-w-[95vw] sm:max-w-md w-full pointer-events-auto animate-in zoom-in-95 duration-200 overflow-hidden">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="p-6">
            {/* Icon */}
            <div className={`w-12 h-12 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Icon className={`w-6 h-6 ${config.iconColor}`} />
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">{title}</h3>

            {/* Description */}
            <p className="text-gray-600 text-center text-sm mb-6">{description}</p>

            {/* Custom content */}
            {children && <div className="mb-6">{children}</div>}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 px-4 py-2.5 ${config.buttonBg} text-white rounded-lg transition-colors text-sm font-medium`}
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
