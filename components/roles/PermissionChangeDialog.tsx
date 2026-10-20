'use client';

import React, { useCallback, useRef, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import AppModal, { AppModalAction } from '@/components/ui/app-modal';
import { getPermissionParts } from '@/lib/constants/permissionCategories';
import { permissionActionOf, permissionBadgeClass } from './PermissionSectionsView';

/**
 * Compact confirm popup for permission changes (turning a main permission on/off,
 * a section on/off). Fixed small size: a one-line summary, then the affected
 * permissions grouped section by section, scrolling inside a fixed-height box.
 *
 * Usage:
 *   const { ask, dialog } = usePermissionChangeDialog();
 *   const choice = await ask({ ... actions: [{ id: 'all', label: 'Turn on all' }] });
 *   // choice = action id, or null when cancelled
 *   ...render {dialog} once in the component.
 */

export interface PermissionChangeDetailGroup {
  heading: string;
  /** Permission codes — shown as the same tiles as the Edit User screen. */
  codes: string[];
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
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback((o: PermissionChangeOptions) => {
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

  const detailCount = opts?.details?.reduce((n, g) => n + g.codes.length, 0) ?? 0;
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
            // Always shown (no expander), grouped section by section, scrolling
            // inside a fixed-height box so long lists never grow the popup.
            <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 p-3">
              {opts.details!.filter((g) => g.codes.length > 0).map((g) => {
                const bySection = new Map<string, string[]>();
                g.codes.forEach((code) => {
                  const { section } = getPermissionParts(code);
                  bySection.set(section, [...(bySection.get(section) || []), code]);
                });
                return (
                  <div key={g.heading} className="space-y-2.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-500">{g.heading}</p>
                    {Array.from(bySection.entries()).map(([section, codes]) => (
                      <div key={section}>
                        <p className="mb-1.5 text-xs font-semibold text-gray-800 dark:text-slate-200">{section}</p>
                        {/* Same tile look as the Edit User permission grid. */}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {codes.map((code) => {
                            const { label } = getPermissionParts(code);
                            return (
                              <div
                                key={code}
                                className="flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-white to-gray-50 dark:from-slate-900 dark:to-slate-800/50 p-2.5"
                              >
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${permissionBadgeClass(permissionActionOf(code))}`}>
                                  <span className="text-xs font-semibold uppercase">{label[0] || 'P'}</span>
                                </span>
                                <p className="min-w-0 break-words text-sm font-semibold leading-snug text-gray-900 dark:text-slate-50">{label}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AppModal>
  );

  return { ask, dialog };
}
