'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { userService, type ApiUser } from '@/lib/services/userService';
import NameAvatar from '@/components/ui/name-avatar';

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
}

/**
 * Optional "Give this role to" field in Create / Duplicate Role. Searches the
 * server as you type (works for any number of users), picked people show as
 * chips with the role they move from. The account owner can't be picked.
 */
export default function RoleUserPicker({ value, onChange, roleNames, lockedReason }: RoleUserPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!open || lockedReason) return;
    const id = ++requestId.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await userService.listUsersPaged({ search: q || undefined, is_active: true, page: 1, page_size: 8 });
        if (id === requestId.current) setResults((res.items || []).filter((u) => (u.role || '').toLowerCase() !== 'tenant_admin'));
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, open, lockedReason]);

  // Close the list on a click outside the field.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pickedIds = new Set(value.map((u) => u.id));
  const add = (u: ApiUser) => {
    if (pickedIds.has(u.id)) return;
    onChange([...value, { id: u.id, name: u.name || u.email, email: u.email, currentRole: roleNames[(u.role || '').toLowerCase()] || u.role }]);
    setQuery('');
  };
  const remove = (id: string) => onChange(value.filter((u) => u.id !== id));
  const locked = !!lockedReason;

  return (
    <div ref={boxRef} className="relative" title={lockedReason}>
      <label
        className={`flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm ${
          locked ? 'cursor-not-allowed bg-gray-50 opacity-60 dark:bg-slate-800/50' : 'bg-white focus-within:border-brand-blue focus-within:ring-[3px] focus-within:ring-brand-blue/20 dark:bg-slate-900'
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (!locked) setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
          placeholder="Search people by name or email"
          aria-label="Give this role to"
          aria-disabled={locked || undefined}
          readOnly={locked}
          className="min-w-0 flex-1 border-0 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-slate-100"
        />
        {loading && open && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" aria-hidden />}
      </label>

      {open && !locked && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-gray-500 dark:text-slate-400">{query.trim() ? 'No one matches' : 'No people to show'}</li>
          )}
          {results.map((u) => {
            const picked = pickedIds.has(u.id);
            const roleName = roleNames[(u.role || '').toLowerCase()] || u.role;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={picked}
                  disabled={picked}
                  onClick={() => add(u)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-brand-blue/[0.06] disabled:cursor-default disabled:opacity-50"
                >
                  <NameAvatar name={u.name || u.email} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-gray-900 dark:text-slate-100">{u.name || u.email}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-slate-400">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-slate-500">{picked ? 'Added' : roleName}</span>
                </button>
              </li>
            );
          })}
        </ul>
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
              <button
                type="button"
                onClick={() => remove(u.id)}
                aria-label={`Remove ${u.name}`}
                className="grid h-4 w-4 place-items-center rounded-full hover:bg-brand-blue/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
