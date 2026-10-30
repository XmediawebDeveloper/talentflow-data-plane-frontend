'use client';

import FilterSelect from '@/components/ui/filter-select';
import { CANDIDATE_NAME_PLACEHOLDER, EXPIRY_OPTIONS } from './inviteDefaults';
import type { InviteKind } from './inviteVersions';

const LABEL = 'text-sm font-medium text-gray-800 dark:text-slate-200';

/**
 * The invite popup's last step: the email message (opens on the template;
 * empty sends the standard invitation) and the link expiry.
 */
export default function InviteMessageStep({
  kind,
  message,
  onMessage,
  template,
  expiryDays,
  onExpiry,
}: {
  kind: InviteKind;
  message: string;
  onMessage: (message: string) => void;
  /** What "Reset to template" puts back. */
  template: string;
  expiryDays: number;
  onExpiry: (days: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`invite-message-${kind}`} className={LABEL}>Email message</label>
          {message !== template && (
            <button type="button" onClick={() => onMessage(template)} className="text-xs font-medium text-brand-blue hover:underline underline-offset-2">
              Reset to template
            </button>
          )}
        </div>
        <textarea
          id={`invite-message-${kind}`}
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          rows={8}
          placeholder="Leave empty to send the standard invitation."
          className="mt-1.5 w-full px-3 py-2.5 text-sm leading-6 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent resize-y"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
          <code className="px-1 rounded bg-gray-100 dark:bg-slate-800">{CANDIDATE_NAME_PLACEHOLDER}</code> becomes each candidate’s name. Their personal link is added below the message.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`invite-expiry-${kind}`} className={LABEL}>Link expires in</label>
        <FilterSelect
          id={`invite-expiry-${kind}`}
          value={String(expiryDays)}
          onChange={(v) => onExpiry(Number(v))}
          options={EXPIRY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          className="w-auto sm:w-auto text-sm px-2 sm:pl-2 sm:pr-2 py-1 sm:py-1 rounded-lg sm:rounded-lg text-gray-700 dark:text-slate-300"
        />
      </div>
    </div>
  );
}
