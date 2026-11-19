'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { Button } from './button';

/** Below Tailwind's `sm` (640px) — where `mobileSheet` turns into a bottom sheet. */
const PHONE_QUERY = '(max-width: 639.98px)';
function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isPhone;
}

/**
 * Standard popup frame — every popup uses the same format:
 *   - brand header (icon, title, subtitle) with NO top-right ✕
 *   - scrollable body
 *   - footer: Cancel + action button(s), identical size/width/text style
 * Esc = Cancel. Backdrop clicks do nothing (no accidental loss of a half-filled form).
 * Exception: read-only views may pass `closeButton` — they get a top-right ✕
 * instead of the footer Cancel (the footer keeps any `actions`, e.g. Edit).
 *
 * Sizes (one per popup type, so the same kind of popup is always the same width):
 *   sm  ~448px  confirm / delete / short prompts
 *   md  ~672px  forms (invite, edit team, add seats, export…)
 *   lg  ~896px  permission grids and other wide read/edit views
 * On phones every size is full width minus an 8px gutter, and footer buttons
 * stack full-width with the primary action on top.
 *
 * Tone: `brand` (default) is the brand-blue header. `warning` is the white
 * header with a brand-orange icon disc and an orange primary button — the
 * warning confirm's look (ConfirmationDialog type="warning"), for "leave /
 * discard?" prompts. `plain` is a white header with a brand-blue icon tile
 * and dark title — no coloured bar — for screens that want a lighter popup
 * (the Teams pages); its buttons stay the standard brand ones.
 */

export type AppModalTone = 'brand' | 'warning' | 'plain';

export type AppModalSize = 'sm' | 'md' | 'lg' | 'xl';

export const APP_MODAL_WIDTH: Record<AppModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
  /* Wide tables (bulk invite results: candidate, status, sent for, source, date, action). */
  xl: 'sm:max-w-6xl',
};

/** Shared footer-button sizing: same height (Button size md), full-width on phones.
 *  Use for every popup footer button, incl. Cancel, inside MODAL_FOOTER_ROW_CLASS. */
export const MODAL_FOOTER_BUTTON_CLASS = 'w-full sm:min-w-[128px]';

/** Footer row: on phones the buttons stack full-width (action on top); from `sm`
 *  up they sit right-aligned in equal-width columns, so Cancel is always exactly
 *  as wide as the widest action button. */
export const MODAL_FOOTER_ROW_CLASS =
  'flex flex-col-reverse gap-2 sm:ml-auto sm:grid sm:w-fit sm:auto-cols-fr sm:grid-flow-col sm:gap-3';

/** `compactFooter`: small buttons sized to their labels, one right-aligned row
 *  (primary rightmost). On a narrow phone the row wraps and each line's buttons
 *  grow to fill it, so nothing overflows. */
const MODAL_FOOTER_COMPACT_ROW_CLASS = 'flex flex-wrap items-center justify-end gap-2 sm:ml-auto';
const MODAL_FOOTER_COMPACT_BUTTON_CLASS = 'max-sm:grow';

/** The warning tone's primary button: ConfirmationDialog's warning confirm. */
const WARNING_PRIMARY_BUTTON_CLASS =
  'bg-brand-orange! hover:bg-brand-orange-deep! shadow-brand-orange/25!';

export interface AppModalAction {
  label: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  /** Not allowed (RBAC): stays visible and greyed with `title` as the tooltip,
   *  click does nothing. Uses aria-disabled, not native disabled, so the
   *  tooltip still shows. */
  locked?: boolean;
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
  /** Content at the very start of the header, before the icon (e.g. a Back button). */
  headerStart?: ReactNode;
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
  /** Read-only views only: top-right ✕ (calls onCancel) replaces the footer
   *  Cancel. The footer is dropped unless `actions`, `footerStart` or `footer`
   *  give it content. */
  closeButton?: boolean;
  /** Header and primary-button colours; see the file header. */
  tone?: AppModalTone;
  /** Small, label-width footer buttons in one row; see MODAL_FOOTER_COMPACT_ROW_CLASS. */
  compactFooter?: boolean;
  /** Overrides the `size` width (e.g. `sm:max-w-[840px]`). Rare — prefer `size`. */
  widthClassName?: string;
  /** Phones (below sm): a bottom sheet (vaul) instead of a centred box —
   *  rounded top with a drag handle, as tall as its content (max 92% of the
   *  screen), footer pinned at the bottom. Swipe down = Cancel (so a popup
   *  that asks "discard changes?" on Cancel still asks); tapping outside does
   *  nothing, as on the centred box. From sm up nothing changes. Off by default. */
  mobileSheet?: boolean;
}

export function AppModalFooterButtons({
  onCancel,
  cancelLabel = 'Cancel',
  cancelDisabled,
  actions = [],
  hideCancel = false,
  tone = 'brand',
  compactFooter = false,
}: Pick<AppModalProps, 'onCancel' | 'cancelLabel' | 'cancelDisabled' | 'actions' | 'tone' | 'compactFooter'> & { hideCancel?: boolean }) {
  const buttonSize = compactFooter ? 'sm' : 'md';
  const buttonClass = compactFooter ? MODAL_FOOTER_COMPACT_BUTTON_CLASS : MODAL_FOOTER_BUTTON_CLASS;
  return (
    <div className={compactFooter ? MODAL_FOOTER_COMPACT_ROW_CLASS : MODAL_FOOTER_ROW_CLASS}>
      {!hideCancel && (
        <Button
          type="button"
          variant="secondary"
          size={buttonSize}
          onClick={onCancel}
          disabled={cancelDisabled}
          className={buttonClass}
        >
          {cancelLabel}
        </Button>
      )}
      {actions.map((action, i) => (
        <Button
          key={i}
          type={action.type ?? 'button'}
          form={action.form}
          variant={action.variant ?? 'primary'}
          size={buttonSize}
          onClick={action.locked ? undefined : action.onClick}
          disabled={action.disabled}
          aria-disabled={action.locked || undefined}
          loading={action.loading}
          icon={action.icon}
          title={action.title}
          className={`${buttonClass} ${tone === 'warning' && (action.variant ?? 'primary') === 'primary' ? WARNING_PRIMARY_BUTTON_CLASS : ''} ${action.locked ? 'cursor-not-allowed opacity-60' : ''}`}
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
  headerStart,
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
  closeButton = false,
  tone = 'brand',
  compactFooter = false,
  widthClassName,
  mobileSheet = false,
}: AppModalProps) {
  const warning = tone === 'warning';
  // White header (warning's frame) — `plain` keeps a brand-blue icon tile.
  const lightHeader = warning || tone === 'plain';
  const showFooter = !closeButton || !!footer || !!footerStart || (actions?.length ?? 0) > 0;
  const isPhone = useIsPhone();
  const asSheet = mobileSheet && isPhone;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cancelDisabled) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel, cancelDisabled]);

  const TitleTag = asSheet ? DrawerPrimitive.Title : 'h2';
  const frame = (
      <>
        {/* Header — no close button unless `closeButton`; otherwise Cancel in the footer is the way out. */}
        <div
          className={`flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6 ${
            lightHeader ? 'border-b border-gray-100 bg-white dark:border-slate-700/60 dark:bg-slate-900' : 'bg-brand-blue'
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {headerStart}
            {icon && (
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5 ${
                  warning
                    ? 'rounded-full bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/15 dark:bg-orange-500/15 dark:text-orange-300'
                    : tone === 'plain'
                      ? 'rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30'
                      : 'rounded-xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm'
                }`}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <TitleTag
                className={`line-clamp-2 break-words text-base font-bold leading-snug sm:text-lg ${
                  lightHeader ? 'text-gray-900 dark:text-slate-50' : 'text-white'
                }`}
              >
                {title}
              </TitleTag>
              {subtitle && (
                <p
                  className={`text-xs sm:text-sm ${
                    warning ? 'text-gray-600 dark:text-slate-400' : tone === 'plain' ? 'truncate text-gray-600 dark:text-slate-400' : 'truncate text-white/80'
                  }`}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {headerExtra && <div className="shrink-0">{headerExtra}</div>}
          {closeButton && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelDisabled}
              aria-label="Close"
              title="Close"
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 ${
                lightHeader
                  ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:ring-brand-blue/40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  : 'text-white/80 hover:bg-white/15 hover:text-white focus-visible:ring-white/60'
              }`}
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 ${bodyClassName}`}>{children}</div>

        {showFooter && (footer ?? (
          <div className="flex shrink-0 flex-col gap-3 border-t border-gray-100 bg-slate-50/50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            {footerStart && <div className="min-w-0 tf-body-muted">{footerStart}</div>}
            <AppModalFooterButtons
              onCancel={onCancel}
              cancelLabel={cancelLabel}
              cancelDisabled={cancelDisabled}
              actions={actions}
              hideCancel={closeButton}
              tone={tone}
              compactFooter={compactFooter}
            />
          </div>
        ))}
      </>
  );

  /* Phone + mobileSheet: the same header / body / footer in a vaul bottom
     sheet. `open` stays controlled by the caller; any close the sheet asks
     for (a swipe down) goes through onCancel, exactly like the Cancel button. */
  if (asSheet) {
    return (
      <DrawerPrimitive.Root
        open={open}
        onOpenChange={(next) => { if (!next && !cancelDisabled) onCancel(); }}
        dismissible={!cancelDisabled}
        repositionInputs={false}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className={`fixed inset-0 ${zIndexClass} bg-gray-900/60 backdrop-blur-sm`} />
          <DrawerPrimitive.Content
            aria-describedby={undefined}
            aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
            /* Tapping outside never closes (half-filled forms); Esc is the
               window listener above, so Radix's own Esc is switched off. */
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            className={`fixed inset-x-0 bottom-0 ${zIndexClass} flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900`}
          >
            {/* Drag handle — swipe down from here (or the header) to cancel. */}
            <div className="flex shrink-0 justify-center bg-white py-2 dark:bg-slate-900" aria-hidden="true">
              <span className="h-1.5 w-10 rounded-full bg-gray-300 dark:bg-slate-600" />
            </div>
            {frame}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    );
  }

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-gray-900/60 p-2 backdrop-blur-sm sm:p-6`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
    >
      <div
        className={`tf-round-edges flex max-h-[calc(100dvh-1rem)] w-full max-w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)] ${widthClassName ?? APP_MODAL_WIDTH[size]}`}
      >
        {frame}
      </div>
    </div>
  );
}
