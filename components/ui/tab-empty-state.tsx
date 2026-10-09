'use client';

import * as React from 'react';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';

/**
 * The empty state for a results tab that has no records at all.
 *
 * This is the AI Talent Match Results tab's empty state, lifted out so every
 * other tab on Job Details renders the identical thing: grey outline icon,
 * heading, one supporting line, and the action that would produce the missing
 * data. Tabs used to hand-roll these and drifted — some drew the full table
 * shell with live column headers over zero rows, some showed a message with no
 * way forward. Reach for this whenever a tab has nothing to show yet.
 *
 * NOT for a list that a search or filter narrowed to zero: that needs the
 * controls left on screen and a "clear it" exit. Use `ListEmptyState` there.
 */
/**
 * Styling for a button passed as `action`, so the CTA looks the same whichever
 * tab is empty. Tabs that reuse a toolbar button they already build (Create,
 * Send Invite) pass that through instead — those carry the same treatment.
 */
export const TAB_EMPTY_ACTION_CLASS =
  'px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none';

export interface TabEmptyStateProps {
  icon: LucideIcon;
  /** Optional illustration shown in place of the default icon. */
  imageSrc?: string;
  imageAlt?: string;
  /** Heading, e.g. "No Assessment Results". */
  title: string;
  /** One line on what would fill this tab. */
  description: string;
  /**
   * Buttons that produce the missing data (Run AI Match, Create, Send Invite).
   * Omit when the user lacks the permission or plan feature to act — the
   * message alone is still worth showing.
   */
  action?: React.ReactNode;
  /**
   * Draw the shared results-table frame (rounded border + subtle ring/shadow)
   * around the message, so an empty tab keeps the same outer card the populated
   * table would show. Off by default — only the Job Details results tabs that
   * sit beside a bordered table turn it on.
   */
  bordered?: boolean;
  className?: string;
}

export default function TabEmptyState({
  icon: Icon,
  imageSrc,
  imageAlt = '',
  title,
  description,
  action,
  bordered = false,
  className,
}: TabEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center',
        bordered &&
          'px-4 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 bg-white dark:bg-slate-900',
        className,
      )}
    >
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={144}
          height={144}
          className="mb-4 h-32 w-32 object-contain sm:h-36 sm:w-36"
        />
      ) : (
        <Icon className="w-12 h-12 text-gray-300 dark:text-slate-500 mb-3" />
      )}
      <h3 className="text-base font-medium text-gray-700 dark:text-slate-300 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-slate-500 max-w-sm">{description}</p>
      {action && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
