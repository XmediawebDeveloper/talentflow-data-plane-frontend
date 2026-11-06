'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { userService, type ApiUser } from '@/lib/services/userService';
import rbacService from '@/lib/services/rbacService';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import type { RoleListItem } from '@/lib/types/rbac';
import { useAuth } from '@/lib/hooks/useAuth';
import RoleUserPicker, { type PickedUser } from './RoleUserPicker';

const PAGE_SIZE = 20;

const errorDetail = (error: unknown) =>
  (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
  ?? (error instanceof Error ? error.message : undefined);

/**
 * "People with this role" in the role's View popup: everyone who has it, one
 * per line and numbered (loaded from the server, 20 at a time), plus two ways
 * to add people — give the role to existing people, or invite a new person
 * with this role (opens Invite User with the role already picked).
 */
export default function RoleMembers({ role, roleNames, onChanged }: {
  role: RoleListItem;
  roleNames: Record<string, string>;
  /** People were added: the caller refreshes its role counts. */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { isTenantAdmin, hasPermissionCode, hasPermission } = useAuth();
  const canAssign = isTenantAdmin || hasPermissionCode('users:assign_role');
  const canInvite = isTenantAdmin || hasPermissionCode('users:create') || hasPermission('canCreateUsers');

  const [people, setPeople] = useState<ApiUser[]>([]);
  const [total, setTotal] = useState(role.user_count);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<PickedUser[]>([]);
  const [saving, setSaving] = useState(false);
  // Bumped after people get the role, so the picker reloads their new roles.
  const [pickerKey, setPickerKey] = useState(0);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const res = await userService.listUsersPaged(
        { role: role.code, page: nextPage, page_size: PAGE_SIZE, sort_by: 'name', sort_dir: 'asc' },
        { fresh: true },
      );
      setPeople((cur) => (nextPage === 1 ? res.items || [] : [...cur, ...(res.items || [])]));
      setTotal(res.total ?? 0);
      setPage(nextPage);
    } catch {
      // Fall back to the few names the role list already has.
      if (nextPage === 1) setPeople((role.holders ?? []).map((h) => ({ id: h.id, name: h.name, email: h.email ?? '' }) as ApiUser));
    } finally {
      setLoading(false);
    }
  }, [role.code, role.holders]);

  useEffect(() => { void load(1); }, [load]);

  const giveRole = async () => {
    setSaving(true);
    const results = await Promise.allSettled(picked.map((u) => rbacService.assignUserRoles(u.id, { role_ids: [role.id] })));
    const failed = picked.filter((_, i) => results[i].status === 'rejected');
    const given = picked.length - failed.length;
    if (failed.length) {
      const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      toast.error(`Couldn't give ${role.name} to ${failed.map((u) => u.name).join(', ')}`, {
        description: friendlyErrorMessage(errorDetail(first?.reason), 'Please try again.'),
      });
    }
    if (given) toast.success(`${role.name} given to ${given === 1 ? picked.find((u) => !failed.includes(u))?.name : `${given} people`}`);
    setPicked(failed);
    setSaving(false);
    if (given) {
      setPickerKey((k) => k + 1);
      void load(1);
      onChanged?.();
    }
  };

  const invite = () => router.push(`/organization/user-management?invite=1&role=${role.id}`);

  return (
    <div className="mt-5 border-t border-gray-100 pt-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
          People with this role · {total}
        </div>
        <button
          type="button"
          aria-disabled={!canInvite || undefined}
          title={canInvite ? `Invite a new person and give them ${role.name}` : 'You do not have permission to invite users'}
          onClick={() => { if (canInvite) invite(); }}
          className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${canInvite ? 'text-brand-blue hover:underline dark:text-blue-300' : 'cursor-not-allowed text-gray-400 dark:text-slate-500'}`}
        >
          <UserPlus className="h-4 w-4" /> Invite a new person
        </button>
      </div>

      {people.length > 0 ? (
        <ol className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-slate-800 dark:border-slate-700">
          {people.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 px-3.5 py-2">
              <span className="w-6 shrink-0 text-right text-[13px] tabular-nums text-gray-400 dark:text-slate-500">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900 dark:text-slate-100">{p.name || p.email}</span>
              {p.email && <span className="hidden min-w-0 truncate text-xs text-gray-500 dark:text-slate-400 sm:block">{p.email}</span>}
            </li>
          ))}
        </ol>
      ) : !loading ? (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">Nobody has this role yet.</p>
      ) : null}
      {loading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading people…
        </div>
      )}
      {!loading && people.length < total && (
        <button type="button" onClick={() => void load(page + 1)} className="mt-2 text-[13px] font-medium text-brand-blue hover:underline dark:text-blue-300">
          Show more ({total - people.length} more)
        </button>
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-[13px] font-medium text-gray-900 dark:text-slate-100">Give this role to more people</label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <RoleUserPicker
              key={pickerKey}
              currentRoleCode={role.code}
              value={picked}
              onChange={setPicked}
              roleNames={roleNames}
              lockedReason={canAssign ? undefined : 'You do not have permission to change user roles'}
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            className="h-9 shrink-0"
            disabled={!picked.length || saving || !canAssign}
            loading={saving}
            onClick={() => void giveRole()}
          >
            Give role
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">Each person has one role, so this replaces their current role.</p>
      </div>
    </div>
  );
}
