import { AlertTriangle, CheckCircle, Info, XCircle, Loader2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'warning' | 'danger' | 'info' | 'success';
  /**
   * Replaces the icon `type` would pick, when the dialog is about a specific
   * kind of thing rather than a severity — a document, a candidate, a job.
   * Keeps the type's colour and disc so the tone still reads correctly.
   */
  icon?: LucideIcon;
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
  icon,
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

  const { icon: typeIcon, iconColor, iconBg, confirmButton } = config[type];
  const Icon = icon ?? typeIcon;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-md w-full animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        {/* Header */}
        <div className="px-6 sm:px-8 py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between shrink-0">
          <h2 className="tf-section-title sm:text-lg">{title}</h2>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="p-1.5 text-gray-500 dark:text-slate-500 hover:bg-slate-100 hover:text-gray-700 dark:hover:text-slate-300 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 sm:px-8 py-5 flex-1 overflow-y-auto">
          <div className="flex justify-center mb-4">
            <div className={`${iconBg} rounded-full p-3`}>
              <Icon className={`w-8 h-8 ${iconColor}`} />
            </div>
          </div>
          <p className="text-center tf-body-secondary leading-relaxed">{message}</p>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-950 flex flex-col-reverse sm:flex-row gap-3 shrink-0">
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
