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
import { AlertTriangle, CheckCircle, Info, XCircle, HelpCircle, Trash2, AlertCircle, FileText, LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** `delete` is its own variant (not reusing `error`) so a destructive confirm
 *  always gets the trash-in-a-circle treatment, while `error` stays free for
 *  actual failure alerts (showError) that have nothing to do with deleting. */
type DialogVariant = 'error' | 'warning' | 'success' | 'confirm' | 'info' | 'delete';

/** The bordered "what you're about to delete" card — icon + category label +
 *  name + optional badge (e.g. a version pill) — shown between the message
 *  and the Important callout when provided. */
interface DialogItemPreview {
  icon?: LucideIcon;
  /** Small uppercase category label above the name, e.g. "JOB OPENING". */
  label?: string;
  name: string;
  badge?: string;
}

interface DialogOptions {
  title: string;
  message: string;
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string;
  /** If true the cancel / secondary button is hidden (used for simple alerts) */
  hideCancelButton?: boolean;
  /** Renders the item-preview card below the message. */
  item?: DialogItemPreview;
  /** Renders the red "Important" callout below the item card, explaining what
   *  permanently happens — e.g. "Deleting this job opening will permanently
   *  remove it from your job openings and cannot be restored." */
  warningNote?: string;
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
  delete: {
    icon: Trash2,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-500',
    confirmBtn: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600',
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

  // Focus the primary button when dialog opens
  useEffect(() => {
    if (dialog.open) {
      // Small delay to let the DOM render
      const id = setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(id);
    }
  }, [dialog.open]);

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
          item: options.item,
          warningNote: options.warningNote,
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
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full pointer-events-auto animate-in zoom-in-95 fade-in duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* No top-right X — the dialog is dismissed via the Cancel button
                  (confirm-style), the OK button (alerts), the backdrop, or Esc. */}
              <div className="p-6 pt-8">
                {/* Icon */}
                <div
                  className={`w-16 h-16 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-4`}
                >
                  <Icon className={`w-7 h-7 ${config.iconColor}`} />
                </div>

                {/* Title */}
                <h3
                  id="global-dialog-title"
                  className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2 leading-snug"
                >
                  {dialog.title}
                </h3>

                {/* Message */}
                <p
                  id="global-dialog-desc"
                  className="text-gray-600 dark:text-gray-400 text-center text-sm whitespace-pre-line mb-4"
                >
                  {dialog.message}
                </p>

                {/* Item preview — what's about to be deleted/acted on. */}
                {dialog.item && (() => {
                  const ItemIcon = dialog.item.icon ?? FileText;
                  return (
                    <div className="mb-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <ItemIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {dialog.item.label && (
                          <p className="text-2xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 uppercase">
                            {dialog.item.label}
                          </p>
                        )}
                        <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{dialog.item.name}</p>
                        {dialog.item.badge && (
                          <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            {dialog.item.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Important callout — what permanently happens. */}
                {dialog.warningNote && (
                  <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-700 dark:text-red-400">Important</p>
                      <p className="text-sm text-red-700/90 dark:text-red-300/90 mt-0.5">{dialog.warningNote}</p>
                    </div>
                  </div>
                )}

                {/* Buttons — right-aligned, sized like ArchiveJobModal /
                    DisableJobModal's footer rather than stretched flex-1s. */}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  {!dialog.hideCancelButton && (
                    <button
                      type="button"
                      onClick={() => handleClose(false)}
                      className="px-6 py-2.5 rounded-lg transition-colors text-sm font-semibold border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
                    >
                      {dialog.cancelText}
                    </button>
                  )}
                  <button
                    ref={confirmBtnRef}
                    type="button"
                    onClick={() => handleClose(true)}
                    className={`px-6 py-2.5 text-white rounded-lg transition-colors text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 flex items-center justify-center gap-2 ${config.confirmBtn}`}
                  >
                    {dialog.variant === 'delete' && <Trash2 className="w-4 h-4" />}
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
