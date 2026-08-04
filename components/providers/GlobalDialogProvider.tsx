'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, HelpCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DialogVariant = 'error' | 'warning' | 'success' | 'confirm' | 'info';

interface DialogOptions {
  title: string;
  message: string;
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string;
  /** If true the cancel / secondary button is hidden (used for simple alerts) */
  hideCancelButton?: boolean;
}

interface DialogState extends DialogOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
}

interface GlobalDialogContextType {
  /** Show a confirm-style dialog. Resolves `true` when the user clicks confirm. */
  confirm: (options: Omit<DialogOptions, 'hideCancelButton'>) => Promise<boolean>;
  /** Show an alert-style dialog (single OK button). Resolves when dismissed. */
  alert: (options: Omit<DialogOptions, 'hideCancelButton' | 'cancelText'>) => Promise<void>;
  /** Shorthand: error alert */
  showError: (title: string, message: string) => Promise<void>;
  /** Shorthand: warning alert */
  showWarning: (title: string, message: string) => Promise<void>;
  /** Shorthand: success alert */
  showSuccess: (title: string, message: string) => Promise<void>;
  /** Shorthand: info alert */
  showInfo: (title: string, message: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Variant config
// ---------------------------------------------------------------------------

const variantConfig: Record<
  DialogVariant,
  {
    icon: typeof Info;
    iconBg: string;
    iconColor: string;
    confirmBtn: string;
  }
> = {
  error: {
    icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    confirmBtn: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-600',
  },
  success: {
    icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    confirmBtn: 'bg-green-600 hover:bg-green-700 focus-visible:ring-green-600',
  },
  confirm: {
    icon: HelpCircle,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    confirmBtn: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600',
  },
  info: {
    icon: Info,
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconColor: 'text-gray-800 dark:text-gray-300',
    confirmBtn: 'bg-gray-800 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500 focus-visible:ring-gray-800',
  },
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GlobalDialogContext = createContext<GlobalDialogContextType | undefined>(
  undefined,
);

export function useGlobalDialog() {
  const ctx = useContext(GlobalDialogContext);
  if (!ctx) {
    throw new Error('useGlobalDialog must be used within a GlobalDialogProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const initialState: DialogState = {
  open: false,
  title: '',
  message: '',
  variant: 'info',
  confirmText: 'OK',
  cancelText: 'Cancel',
  hideCancelButton: true,
  resolve: null,
};

export function GlobalDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(initialState);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the primary button when dialog opens
  useEffect(() => {
    if (dialog.open) {
      // Small delay to let the DOM render
      const id = setTimeout(() => {
        if (dialog.hideCancelButton) {
          confirmBtnRef.current?.focus();
        } else {
          cancelBtnRef.current?.focus();
        }
      }, 50);
      return () => clearTimeout(id);
    }
  }, [dialog.open, dialog.hideCancelButton]);

  // Close on Escape
  useEffect(() => {
    if (!dialog.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog.open]);

  // Lock body scroll when open
  useEffect(() => {
    if (dialog.open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [dialog.open]);

  const handleClose = useCallback(
    (result: boolean) => {
      dialog.resolve?.(result);
      setDialog((prev) => ({ ...prev, open: false, resolve: null }));
    },
    [dialog],
  );

  const openDialog = useCallback(
    (options: DialogOptions): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setDialog({
          open: true,
          title: options.title,
          message: options.message,
          variant: options.variant ?? 'info',
          confirmText: options.confirmText ?? 'OK',
          cancelText: options.cancelText ?? 'Cancel',
          hideCancelButton: options.hideCancelButton ?? false,
          resolve,
        });
      });
    },
    [],
  );

  const confirmFn: GlobalDialogContextType['confirm'] = useCallback(
    (options) =>
      openDialog({
        ...options,
        variant: options.variant ?? 'confirm',
        confirmText: options.confirmText ?? 'Confirm',
        hideCancelButton: false,
      }),
    [openDialog],
  );

  const alertFn: GlobalDialogContextType['alert'] = useCallback(
    async (options) => {
      await openDialog({
        ...options,
        hideCancelButton: true,
        confirmText: options.confirmText ?? 'OK',
      });
    },
    [openDialog],
  );

  const showError: GlobalDialogContextType['showError'] = useCallback(
    (title, message) => alertFn({ title, message, variant: 'error' }),
    [alertFn],
  );

  const showWarning: GlobalDialogContextType['showWarning'] = useCallback(
    (title, message) => alertFn({ title, message, variant: 'warning' }),
    [alertFn],
  );

  const showSuccess: GlobalDialogContextType['showSuccess'] = useCallback(
    (title, message) => alertFn({ title, message, variant: 'success' }),
    [alertFn],
  );

  const showInfo: GlobalDialogContextType['showInfo'] = useCallback(
    (title, message) => alertFn({ title, message, variant: 'info' }),
    [alertFn],
  );

  const config = variantConfig[dialog.variant ?? 'info'];
  const Icon = config.icon;

  return (
    <GlobalDialogContext.Provider
      value={{ confirm: confirmFn, alert: alertFn, showError, showWarning, showSuccess, showInfo }}
    >
      {children}

      {/* ---- Dialog Render ---- */}
      {dialog.open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => handleClose(false)}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="global-dialog-title"
            aria-describedby="global-dialog-desc"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-md w-full pointer-events-auto animate-in zoom-in-95 fade-in duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                {/* Icon */}
                <div
                  className={`w-12 h-12 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}
                >
                  <Icon className={`w-6 h-6 ${config.iconColor}`} />
                </div>

                {/* Title */}
                <h3
                  id="global-dialog-title"
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2"
                >
                  {dialog.title}
                </h3>

                {/* Message */}
                <p
                  id="global-dialog-desc"
                  className="text-gray-600 dark:text-gray-400 text-center text-sm whitespace-pre-line mb-6"
                >
                  {dialog.message}
                </p>

                {/* Buttons */}
                <div className="flex gap-3">
                  {!dialog.hideCancelButton && (
                    <button
                      ref={cancelBtnRef}
                      type="button"
                      onClick={() => handleClose(false)}
                      className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
                    >
                      {dialog.cancelText}
                    </button>
                  )}
                  <button
                    ref={confirmBtnRef}
                    type="button"
                    onClick={() => handleClose(true)}
                    className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${config.confirmBtn}`}
                  >
                    {dialog.confirmText}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </GlobalDialogContext.Provider>
  );
}
