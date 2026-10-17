'use client';

import React, { useCallback, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import AppModal, { AppModalAction } from '@/components/ui/app-modal';

/**
 * Compact confirm popup for permission changes (turning a main permission on/off,
 * a section on/off). Fixed small size: a one-line summary, and the full list
 * behind "Show details" so long cascades never blow the popup up.
 *
 * Usage:
 *   const { ask, dialog } = usePermissionChangeDialog();
 *   const choice = await ask({ ... actions: [{ id: 'all', label: 'Turn on all' }] });
 *   // choice = action id, or null when cancelled
 *   ...render {dialog} once in the component.
 */

export interface PermissionChangeDetailGroup {
  heading: string;
  items: string[];
}

export interface PermissionChangeOptions {
  title: string;
  summary: React.ReactNode;
  details?: PermissionChangeDetailGroup[];
  tone?: 'on' | 'off';
  /** Action buttons, right of Cancel, in order (last = primary). */
  actions: { id: string; label: string; variant?: 'primary' | 'secondary' | 'destructive' }[];
  cancelLabel?: string;
}

export function usePermissionChangeDialog() {
  const [opts, setOpts] = useState<PermissionChangeOptions | null>(null);
  const [expanded, setExpanded] = useState(false);
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback((o: PermissionChangeOptions) => {
    setExpanded(false);
    setOpts(o);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: string | null) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  const detailCount = opts?.details?.reduce((n, g) => n + g.items.length, 0) ?? 0;
  const actions: AppModalAction[] = (opts?.actions ?? []).map((a) => ({
    label: a.label,
    variant: a.variant,
    onClick: () => close(a.id),
  }));

  const dialog = (
    <AppModal
      open={!!opts}
      onCancel={() => close(null)}
      size="sm"
      zIndexClass="z-[70]"
      icon={opts?.tone === 'on' ? <ShieldCheck /> : <ShieldAlert />}
      title={opts?.title ?? ''}
      cancelLabel={opts?.cancelLabel ?? 'Cancel'}
      actions={actions}
    >
      {opts && (
        <div className="space-y-3 text-sm text-gray-700 dark:text-slate-300">
          <div>{opts.summary}</div>
          {detailCount > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-brand-blue hover:bg-brand-blue/[0.04]"
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {expanded ? 'Hide details' : `Show details (${detailCount})`}
              </button>
              {expanded && (
                <div className="max-h-48 space-y-3 overflow-y-auto border-t border-gray-100 dark:border-slate-700/60 px-3 py-2">
                  {opts.details!.filter((g) => g.items.length > 0).map((g) => (
                    <div key={g.heading}>
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-500">{g.heading}</p>
                      <ul className="space-y-0.5">
                        {g.items.map((item) => (
                          <li key={item} className="text-xs text-gray-700 dark:text-slate-300">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppModal>
  );

  return { ask, dialog };
}
