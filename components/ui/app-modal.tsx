'use client';

import React, { ReactNode, useEffect } from 'react';
import { Button } from './button';

/**
 * Standard popup frame — every popup uses the same format:
 *   - brand header (icon, title, subtitle) with NO top-right ✕
 *   - scrollable body
 *   - footer: Cancel + action button(s), identical size/width/text style
 * Esc = Cancel. Backdrop clicks do nothing (no accidental loss of a half-filled form).
 *
 * Sizes (one per popup type, so the same kind of popup is always the same width):
 *   sm  ~448px  confirm / delete / short prompts
 *   md  ~672px  forms (invite, edit team, add seats, export…)
 *   lg  ~896px  permission grids and other wide read/edit views
 * On phones every size is full width minus an 8px gutter, and footer buttons
 * stack full-width with the primary action on top.
 */

export type AppModalSize = 'sm' | 'md' | 'lg';

export const APP_MODAL_WIDTH: Record<AppModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
};

/** Shared footer-button sizing: same height (Button size md), full-width on phones.
 *  Use for every popup footer button, incl. Cancel, inside MODAL_FOOTER_ROW_CLASS. */
export const MODAL_FOOTER_BUTTON_CLASS = 'w-full sm:min-w-[128px]';

/** Footer row: on phones the buttons stack full-width (action on top); from `sm`
 *  up they sit right-aligned in equal-width columns, so Cancel is always exactly
 *  as wide as the widest action button. */
export const MODAL_FOOTER_ROW_CLASS =
  'flex flex-col-reverse gap-2 sm:ml-auto sm:grid sm:w-fit sm:auto-cols-fr sm:grid-flow-col sm:gap-3';

export interface AppModalAction {
  label: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  type?: 'button' | 'submit';
  form?: string;
  title?: string;
}

interface AppModalProps {
  open: boolean;
  /** Cancel button, Esc. */
  onCancel: () => void;
  size?: AppModalSize;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Extra content on the right of the header (badges, counters) — never a close button. */
  headerExtra?: ReactNode;
  children: ReactNode;
  /** Main action(s), rendered right of Cancel in the given order. */
  actions?: AppModalAction[];
  cancelLabel?: string;
  /** e.g. while saving. Also blocks Esc. */
  cancelDisabled?: boolean;
  /** Left side of the footer (status text, badges). */
  footerStart?: ReactNode;
  bodyClassName?: string;
  /** Replace the whole footer (rare — prefer `actions`). */
  footer?: ReactNode;
  zIndexClass?: string;
  ariaLabel?: string;
}

export function AppModalFooterButtons({
  onCancel,
  cancelLabel = 'Cancel',
  cancelDisabled,
  actions = [],
}: Pick<AppModalProps, 'onCancel' | 'cancelLabel' | 'cancelDisabled' | 'actions'>) {
  return (
    <div className={MODAL_FOOTER_ROW_CLASS}>
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={onCancel}
        disabled={cancelDisabled}
        className={MODAL_FOOTER_BUTTON_CLASS}
      >
        {cancelLabel}
      </Button>
      {actions.map((action, i) => (
        <Button
          key={i}
          type={action.type ?? 'button'}
          form={action.form}
          variant={action.variant ?? 'primary'}
          size="md"
          onClick={action.onClick}
          disabled={action.disabled}
          loading={action.loading}
          icon={action.icon}
          title={action.title}
          className={MODAL_FOOTER_BUTTON_CLASS}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export default function AppModal({
  open,
  onCancel,
  size = 'md',
  title,
  subtitle,
  icon,
  headerExtra,
  children,
  actions,
  cancelLabel,
  cancelDisabled,
  footerStart,
  bodyClassName = '',
  footer,
  zIndexClass = 'z-[60]',
  ariaLabel,
}: AppModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cancelDisabled) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, cancelDisabled]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-gray-900/60 p-2 backdrop-blur-sm sm:p-6`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
    >
      <div
        className={`tf-round-edges flex max-h-[calc(100dvh-1rem)] w-full max-w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)] ${APP_MODAL_WIDTH[size]}`}
      >
        {/* Header — no close button; Cancel in the footer is the way out. */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-brand-blue px-4 py-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm [&>svg]:h-5 [&>svg]:w-5">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="line-clamp-2 break-words text-base font-bold leading-snug text-white sm:text-lg">{title}</h2>
              {subtitle && <p className="truncate text-xs text-white/80 sm:text-sm">{subtitle}</p>}
            </div>
          </div>
          {headerExtra && <div className="shrink-0">{headerExtra}</div>}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 ${bodyClassName}`}>{children}</div>

        {footer ?? (
          <div className="flex shrink-0 flex-col gap-3 border-t border-gray-100 bg-slate-50/50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            {footerStart && <div className="min-w-0 text-sm text-gray-500 dark:text-slate-500">{footerStart}</div>}
            <AppModalFooterButtons
              onCancel={onCancel}
              cancelLabel={cancelLabel}
              cancelDisabled={cancelDisabled}
              actions={actions}
            />
          </div>
        )}
      </div>
    </div>
  );
}
