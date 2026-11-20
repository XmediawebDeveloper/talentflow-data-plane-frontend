'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { userService, type ApiUser } from '@/lib/services/userService';
import NameAvatar from '@/components/ui/name-avatar';
import { IconButton } from '@/components/ui/icon-button';

export interface PickedUser {
  id: string;
  name: string;
  email: string;
  /** Their current role's name (shown as "moves from …"). */
  currentRole?: string;
}

interface RoleUserPickerProps {
  value: PickedUser[];
  onChange: (next: PickedUser[]) => void;
  /** role code -> role name, to show each person's current role. */
  roleNames: Record<string, string>;
  /** Not allowed (no permission): field stays visible, greyed, with this tooltip. */
  lockedReason?: string;
  /** People who already have this role show as "Has this role" and can't be picked. */
  currentRoleCode?: string;
}

/** Rows drawn at a time; scrolling near the bottom draws the next batch. */
const BATCH = 100;

/**
 * "Give this role to" field (Create / Duplicate Role, and the role's View
 * popup). Loads every active person once when the list first opens, then
 * filters on each letter typed (name or email) with no server round trip; the
 * whole list scrolls, drawn 100 rows at a time. The account owner can't be picked.
 */
export default function RoleUserPicker({ value, onChange, roleNames, lockedReason, currentRoleCode }: RoleUserPickerProps) {
  const [query, setQuery] = useState('');
  const [everyone, setEveryone] = useState<ApiUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(BATCH);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const locked = !!lockedReason;

  // Load the full list once, the first time it opens (a failed load retries on the next open).
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    if (!open || locked || everyone || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);
    userService.listAllActiveUsers()
      .then((users) => {
        if (!mounted.current) return;
        setEveryone(
          users
            .filter((u) => (u.role || '').toLowerCase() !== 'tenant_admin')
            .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '', undefined, { sensitivity: 'base' })),
        );
      })
      .catch(() => { if (mounted.current) setFailed(true); })
      .finally(() => {
        inFlight.current = false;
        if (mounted.current) setLoading(false);
      });
  }, [open, locked, everyone]);

  // Close the list on a click outside the field.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Letter-by-letter filter on name or email.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!everyone) return [];
    if (!q) return everyone;
    return everyone.filter((u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  }, [everyone, query]);

  // A new search starts at the top again.
  useEffect(() => {
    setShown(BATCH);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  const onListScroll = (e: React.UIEvent<HTMLUListElement>) => {
    const el = e.currentTarget;
    if (shown < matches.length && el.scrollTop + el.clientHeight >= el.scrollHeight - 80) setShown((n) => n + BATCH);
  };

  const pickedIds = new Set(value.map((u) => u.id));
  const hasRole = (u: ApiUser) => !!currentRoleCode && (u.role || '').toLowerCase() === currentRoleCode.toLowerCase();
  const add = (u: ApiUser) => {
    if (pickedIds.has(u.id) || hasRole(u)) return;
    onChange([...value, { id: u.id, name: u.name || u.email, email: u.email, currentRole: roleNames[(u.role || '').toLowerCase()] || u.role }]);
    setQuery('');
  };
  const remove = (id: string) => onChange(value.filter((u) => u.id !== id));

  return (
    <div ref={boxRef} className="relative" title={lockedReason}>
      <label
        className={`flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm ${
          locked ? 'cursor-not-allowed bg-gray-50 opacity-60 dark:bg-slate-800/50' : 'bg-white focus-within:border-brand-blue focus-within:ring-[3px] focus-within:ring-brand-blue/20 dark:bg-slate-900'
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (!locked) setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
          placeholder="Search people by name or email"
          aria-label="Give this role to"
          aria-disabled={locked || undefined}
          readOnly={locked}
          // The field's own border shows focus; the site-wide input outline
          // (globals.css input:focus-visible) would draw a second box inside it.
          style={{ outline: 'none' }}
          className="min-w-0 flex-1 border-0 bg-transparent text-gray-900 outline-none placeholder:text-gray-500 dark:text-slate-100"
        />
        {loading && open && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-500" aria-hidden />}
      </label>

      {open && !locked && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {everyone && (
            <div className="border-b border-gray-100 px-3 py-1.5 text-[11.5px] text-gray-500 dark:border-slate-800 dark:text-slate-400">
              {query.trim() ? `${matches.length} of ${everyone.length} people` : `${everyone.length} people`}
            </div>
          )}
          <ul ref={listRef} role="listbox" onScroll={onListScroll} className="max-h-72 overflow-y-auto py-1">
            {loading && !everyone && (
              <li className="flex items-center gap-2 px-3 py-2 text-[13px] text-gray-500 dark:text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading people…
              </li>
            )}
            {failed && <li className="px-3 py-2 text-[13px] text-red-600">Couldn&apos;t load people. Close and open the list to try again.</li>}
            {everyone && matches.length === 0 && (
              <li className="px-3 py-2 text-[13px] text-gray-500 dark:text-slate-400">{query.trim() ? 'No one matches' : 'No people to show'}</li>
            )}
            {matches.slice(0, shown).map((u) => {
              const picked = pickedIds.has(u.id);
              const already = hasRole(u);
              const roleName = roleNames[(u.role || '').toLowerCase()] || u.role;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={picked}
                    disabled={picked || already}
                    onClick={() => add(u)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-brand-blue/[0.06] disabled:cursor-default disabled:opacity-50"
                  >
                    <NameAvatar name={u.name || u.email} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-gray-900 dark:text-slate-100">{u.name || u.email}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-slate-400">{u.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-slate-500">{already ? 'Has this role' : picked ? 'Added' : roleName}</span>
                  </button>
                </li>
              );
            })}
            {shown < matches.length && (
              <li className="px-3 py-2 text-center text-xs text-gray-500 dark:text-slate-500">Scroll for more…</li>
            )}
          </ul>
        </div>
      )}

      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((u) => (
            <span
              key={u.id}
              title={u.currentRole ? `${u.email} · moves from ${u.currentRole}` : u.email}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-blue dark:bg-brand-blue/20 dark:text-blue-300"
            >
              {u.name}
              {u.currentRole && <span className="font-normal opacity-70">· from {u.currentRole}</span>}
              <IconButton bare label={`Remove ${u.name}`}
                type="button"
                onClick={() => remove(u.id)}
                className="grid h-4 w-4 place-items-center rounded-full hover:bg-brand-blue/20"
              >
                <X className="h-3 w-3" />
              </IconButton>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
