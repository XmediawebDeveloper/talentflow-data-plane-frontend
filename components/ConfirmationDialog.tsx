import { AlertTriangle, CheckCircle, Info, XCircle, Loader2 } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'warning' | 'danger' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  type = 'info',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  const config = {
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-brand-orange',
      iconBg: 'bg-brand-orange/10 ring-1 ring-brand-orange/15',
      confirmButton: 'bg-brand-orange hover:bg-brand-orange-deep shadow-md shadow-brand-orange/25 ring-1 ring-white/10',
    },
    danger: {
      icon: XCircle,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-100 ring-1 ring-red-200',
      confirmButton: 'bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/25 ring-1 ring-white/10',
    },
    info: {
      icon: Info,
      iconColor: 'text-brand-blue',
      iconBg: 'bg-brand-blue/10 ring-1 ring-brand-blue/15',
      confirmButton: 'bg-brand-blue hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10',
    },
    success: {
      icon: CheckCircle,
      iconColor: 'text-brand-cyan',
      iconBg: 'bg-brand-cyan/10 ring-1 ring-brand-cyan/15',
      confirmButton: 'bg-brand-blue hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10',
    },
  };

  const { icon: Icon, iconColor, iconBg, confirmButton } = config[type];

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-md w-full animate-scale-in max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Icon */}
        <div className="flex justify-center pt-8 pb-4">
          <div className={`${iconBg} rounded-full p-3`}>
            <Icon className={`w-8 h-8 ${iconColor}`} />
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-6">
          <h2 className="text-center text-base sm:text-lg font-semibold text-gray-900 mb-3">{title}</h2>
          <p className="text-center text-gray-600 text-sm leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 px-6 sm:px-8 pb-6 sm:pb-8">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmButton}`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
                Processing...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
