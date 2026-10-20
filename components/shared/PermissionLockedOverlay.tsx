'use client';

import type { ReactNode } from 'react';

/** Default hover text for RBAC-locked UI (same wording as the menu tiles). */
export const PERMISSION_DENIED_MESSAGE = 'You do not have permission to access this';

/**
 * RBAC counterpart of PlanLockedOverlay: keeps permission-gated UI VISIBLE
 * when the user lacks the permission. `locked` greys the children out,
 * swallows clicks, and shows `message` on hover. Unlocked, it renders the
 * children untouched. Use instead of `canX && <...>` — permission-gated
 * controls are never hidden.
 */
export default function PermissionLockedOverlay({
  locked,
  children,
  message = PERMISSION_DENIED_MESSAGE,
  className = '',
}: {
  locked: boolean;
  children: ReactNode;
  message?: string;
  className?: string;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div aria-disabled="true" title={message} className={`cursor-not-allowed opacity-50 grayscale ${className}`}>
      <div className="pointer-events-none select-none h-full" inert>
        {children}
      </div>
    </div>
  );
}
