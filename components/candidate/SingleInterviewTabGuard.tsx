'use client';

/**
 * One interview tab per browser.
 *
 * Opening the invite link a second time in the SAME browser used to start a
 * full second copy of the interview page: the single-active-session lease is
 * keyed on a per-browser client id, so the new tab counted as the same holder
 * and was let straight in — a second OTP / setup flow, or even a second live
 * interview WebSocket, next to the first tab.
 *
 * The FIRST tab now owns the interview for this token (a Web Lock — atomic and
 * released automatically when that tab closes or crashes). A later tab never
 * mounts the portal: it asks the owning tab to come to the front, tries to close
 * itself, and otherwise shows "already open in another tab". When the owning tab
 * goes away this tab takes over by itself (fresh mount → normal resume + OTP).
 *
 * Browsers only let a page focus or close a tab within limits: a tab opened from
 * an email link usually can't close itself, and focusing another tab is
 * best-effort. The notice covers those cases.
 *
 * Without Web Locks support (very old browsers) the guard steps aside and the
 * existing cross-device lease still applies.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';

type TabRole = 'checking' | 'owner' | 'duplicate';

function useSingleInterviewTab(token: string): TabRole {
  const [role, setRole] = useState<TabRole>('checking');

  useEffect(() => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!token || !locks?.request) {
      // No token / no Web Locks → step aside (the cross-device lease still applies).
      void Promise.resolve().then(() => setRole('owner'));
      return;
    }

    const lockName = `tf-ai-interview-tab-${token}`;
    let disposed = false;
    let releaseHold: (() => void) | null = null;
    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(lockName)
      : null;

    // Holds the lock until this tab unmounts / closes.
    const hold = () => new Promise<void>((resolve) => {
      releaseHold = resolve;
      if (disposed) resolve();
    });

    const becomeOwner = () => {
      if (disposed) return;
      setRole('owner');
      // A duplicate tab asks the owner to come forward.
      if (channel) {
        channel.onmessage = (e) => {
          if (e.data === 'focus-request') {
            try { window.focus(); } catch { /* best-effort */ }
          }
        };
      }
    };

    locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (lock) { becomeOwner(); await hold(); return; }
      if (disposed) return;
      // Already open in another tab of this browser.
      setRole('duplicate');
      channel?.postMessage('focus-request');
      try { window.close(); } catch { /* not script-opened — notice stays */ }
      // Take over once the owning tab is gone.
      locks.request(lockName, async () => { becomeOwner(); await hold(); }).catch(() => {});
    }).catch(() => { if (!disposed) setRole('owner'); });

    return () => {
      disposed = true;
      releaseHold?.();
      channel?.close();
    };
  }, [token]);

  return role;
}

function AlreadyOpenInAnotherTab() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[var(--raw-0f2347)] via-[var(--raw-1d3a6b)] to-[var(--raw-0f2347)] flex items-center justify-center px-4 py-6 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] px-6 py-8 text-center">
        <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center" aria-hidden>
          <Copy className="w-8 h-8 text-amber-600" strokeWidth={2} />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--raw-0f1d40)] mb-3">
          This interview is already open in another tab
        </h1>
        <p className="tf-body-secondary sm:text-base leading-relaxed">
          Please switch to the tab where you first opened this interview link to continue.
          You can close this tab.
        </p>
        <p className="tf-body-muted leading-relaxed mt-4">
          If you closed that tab, this page continues automatically.
        </p>
      </div>
    </div>
  );
}

/** Renders `children` only in the first tab that opened this interview link. */
export function SingleInterviewTabGuard({ token, children }: { token: string; children: ReactNode }) {
  const role = useSingleInterviewTab(token);
  if (role === 'duplicate') return <AlreadyOpenInAnotherTab />;
  if (role === 'checking') return null; // a few ms — never start a second session meanwhile
  return <>{children}</>;
}
