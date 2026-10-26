'use client';

import React from 'react';
import rbacService from '@/lib/services/rbacService';
import {
  ALWAYS_ON_PERMISSION_CODES,
  getPermissionDisplaySections,
  PermissionDisplaySection,
} from '@/lib/constants/permissionCategories';

/**
 * Read-only "which permissions does this have" view, shared by every screen that
 * shows a role's / user's permissions without editing them:
 *   - Role details popup        (components/roles/RoleManagement.tsx)
 *   - View Role Permissions     (components/users/UserManagement.tsx)
 *   - Invite New User summary   (components/users/UserManagement.tsx)
 * Sections, labels, badge letters and colours match the Edit User popup, which
 * renders the same catalogue (lib/constants/permissionCategories.ts) as toggles.
 */

/** 'jd:create' -> 'create'. View codes are 'read' / 'view'. */
export const permissionActionOf = (code: string): string => code.split(':')[1] || '';

/** Badge colour by action type — also used by the Edit User popup's tiles. */
export const permissionBadgeClass = (action: string): string =>
  action === 'read' || action === 'view'
    ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15'
    : action === 'create'
    ? 'bg-brand-teal/10 text-brand-teal ring-brand-teal/15'
    : action === 'update'
    ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15'
    : action === 'delete'
    ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/15'
    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-gray-200 dark:ring-slate-700';

/** Catalogue sections narrowed to the given codes; empty sections dropped. Codes
 *  with no catalogue entry are not configurable from any screen, so not listed. */
export const getGrantedPermissionSections = (codes: Iterable<string>): PermissionDisplaySection[] => {
  const granted = new Set(codes);
  return getPermissionDisplaySections()
    .map((section) => ({ ...section, items: section.items.filter((item) => granted.has(item.code)) }))
    .filter((section) => section.items.length > 0);
};

/** A role's codes plus the always-on baseline every user gets. */
export const withAlwaysOnPermissions = (codes: Iterable<string>): string[] =>
  Array.from(new Set([...codes, ...ALWAYS_ON_PERMISSION_CODES]));

/** One-line explanation shown above a role's permission list. */
export function AlwaysOnPermissionsNote() {
  return (
    <p className="mb-4 rounded-xl border border-brand-blue/15 bg-brand-blue/5 px-3 py-2 text-xs text-gray-600 dark:text-slate-400">
      <span className="font-semibold text-brand-blue">View Analytics</span> and{' '}
      <span className="font-semibold text-brand-blue">View Support</span>
      {' '}are always included for every user, whatever their role — they are counted here and can&apos;t be switched off.
    </p>
  );
}

export const countGrantedPermissions = (codes: Iterable<string>): number =>
  getGrantedPermissionSections(codes).reduce((sum, section) => sum + section.items.length, 0);

/**
 * Each role's count as shown everywhere (role list, role popup, role chips):
 * tickable permissions + the always-on pair. The role-list API only returns a
 * raw DB total, so each role's codes are fetched (a handful of roles). Roles
 * whose fetch fails are simply absent from the map — callers fall back.
 */
export async function fetchRoleShownCounts(roleIds: number[]): Promise<Record<number, number>> {
  const details = await Promise.allSettled(roleIds.map((id) => rbacService.getRoleById(id)));
  const counts: Record<number, number> = {};
  details.forEach((d, i) => {
    if (d.status === 'fulfilled') {
      counts[roleIds[i]] = countGrantedPermissions(withAlwaysOnPermissions((d.value.permissions || []).map((p) => p.code)));
    }
  });
  return counts;
}

interface PermissionSectionsViewProps {
  codes: Iterable<string>;
  /** Return a replacement node for a section the plan doesn't include, or null to render it normally. */
  renderLockedSection?: (sectionId: string, sectionName: string) => React.ReactNode | null;
  /**
   * List EVERY permission in the catalogue: granted ones look normal, the rest
   * are greyed out — so a role's popup always shows the full picture of what it
   * can and can't do. Default false = only the granted ones.
   */
  showAll?: boolean;
}

export default function PermissionSectionsView({ codes, renderLockedSection, showAll = false }: PermissionSectionsViewProps) {
  const granted = new Set(codes);
  const sections = showAll ? getPermissionDisplaySections() : getGrantedPermissionSections(granted);
  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const locked = renderLockedSection?.(section.id, section.name);
        if (locked) return <React.Fragment key={section.id}>{locked}</React.Fragment>;
        const grantedCount = section.items.filter((item) => granted.has(item.code)).length;
        const noneGranted = showAll && grantedCount === 0;
        return (
          <section
            key={section.id}
            className="overflow-hidden rounded-2xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3 sm:px-5">
              <div>
                <h3 className={`text-base max-sm:text-sm font-semibold ${noneGranted ? 'text-gray-400 dark:text-slate-500' : 'text-gray-900 dark:text-slate-50'}`}>{section.name}</h3>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  {showAll
                    ? `${grantedCount} of ${section.items.length} permission${section.items.length !== 1 ? 's' : ''}`
                    : `${section.items.length} permission${section.items.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => {
                const isGranted = granted.has(item.code);
                return (
                  <div
                    key={item.code}
                    aria-disabled={!isGranted || undefined}
                    title={isGranted ? undefined : 'Not granted'}
                    className={
                      isGranted
                        ? 'rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-white to-gray-50 dark:from-slate-900 dark:to-slate-800/50 p-4 transition-colors hover:border-brand-blue/15'
                        : 'rounded-2xl border border-dashed border-gray-200 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/30 p-4 opacity-50'
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${
                          isGranted
                            ? permissionBadgeClass(permissionActionOf(item.code))
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 ring-gray-200 dark:ring-slate-700'
                        }`}
                      >
                        <span className="text-xs font-semibold uppercase">{item.label[0] || 'P'}</span>
                      </span>
                      <p className={`min-w-0 text-sm max-sm:text-[13px] font-semibold ${isGranted ? 'text-gray-900 dark:text-slate-50' : 'text-gray-400 dark:text-slate-500'}`}>
                        {item.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Loading placeholder in the same shape. */
export function PermissionSectionsSkeleton({ sections = 2, Skeleton }: { sections?: number; Skeleton: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: sections }).map((_, si) => (
        <div key={si} className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm">
          <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3 sm:px-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1.5 h-3 w-20" />
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, pi) => (
              <div key={pi} className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-slate-700/60 p-4">
                <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
