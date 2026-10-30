'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle, Copy, FileSpreadsheet, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import readXlsxFile from 'read-excel-file/browser';
import { EMAIL_FORMAT_ERROR, isValidEmailFormat } from '@/lib/utils/email';
import { NAME_FORMAT_ERROR, isValidCandidateName } from '@/lib/utils/name';
import ListPagination from '@/components/ListPagination';
import type { BulkExtraCandidate } from '@/lib/services/bulkInviteService';

/** The backend takes at most this many typed-in candidates per send. */
export const MAX_EXTRA_CANDIDATES = 500;

const INPUT = 'h-10 w-full min-w-0 px-3 border rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent disabled:opacity-60';

const EMAIL_HEADER = /^(email|e.?mail|candidate.?email|email.?address)$/i;
const NAME_HEADER = /^(name|full.?name|candidate.?name|first.?name)$/i;

interface EntryRow {
  id: string;
  name: string;
  email: string;
  /** "Manual", or the sheet it came from. */
  origin: string;
  /** Copy Link already invited this row by link — it is not emailed. */
  linked?: boolean;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* A minimal CSV reader (quoted fields, doubled quotes). */
const parseCsvRows = (text: string): string[][] => {
  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  return text.trim().split(/\r?\n/).filter((l) => l.trim()).map(parseRow);
};

/* A sheet row with no name: one made from the email ("john.doe@x" → "john
   doe"), when that is a valid name. */
const nameFromEmail = (email: string) => email.split('@')[0].replace(/[^A-Za-z]+/g, ' ').trim().replace(/\s+/g, ' ');

/* Rows of one sheet (header row first) → candidates. Needs an Email column;
   Name is optional. Rows with a missing or malformed email, or a name that is
   not letters and spaces, are counted as invalid and left out. */
const candidatesFromRows = (rows: unknown[][]): { found: { name: string; email: string }[]; invalid: number; hasEmailColumn: boolean } => {
  if (rows.length < 2) return { found: [], invalid: 0, hasEmailColumn: false };
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const emailIdx = headers.findIndex((h) => EMAIL_HEADER.test(h));
  if (emailIdx === -1) return { found: [], invalid: 0, hasEmailColumn: false };
  const nameIdx = headers.findIndex((h) => NAME_HEADER.test(h));
  const found: { name: string; email: string }[] = [];
  let invalid = 0;
  for (const row of rows.slice(1)) {
    const cell = (i: number) => (i === -1 ? '' : String(row[i] ?? '').trim());
    if (row.every((v) => !String(v ?? '').trim())) continue;
    const email = cell(emailIdx).toLowerCase();
    if (!email || !isValidEmailFormat(email)) { invalid += 1; continue; }
    const name = cell(nameIdx) || nameFromEmail(email);
    if (!isValidCandidateName(name)) { invalid += 1; continue; }
    found.push({ name: name.replace(/\s+/g, ' '), email });
  }
  return { found, invalid, hasEmailColumn: true };
};

/* The rows that will be emailed: not invited by link already. */
const toCandidates = (rows: EntryRow[]): BulkExtraCandidate[] =>
  rows.filter((r) => !r.linked).map((r) => ({ name: r.name, email: r.email }));

/**
 * Candidates added by email: one quick-add row (Enter adds), Upload Excel,
 * then a compact table of everyone added this way — search, Manual / sheet
 * tags, a per-row Copy Link (invites by link, no email) and remove. The rows
 * not invited by link are handed up as `extra_candidates`; the backend
 * applies the same skips as every other row.
 */
export default function ExtraCandidatesInput({
  onChange,
  disabled = false,
  onCopyLink,
  takenEmail,
}: {
  onChange: (next: BulkExtraCandidate[]) => void;
  disabled?: boolean;
  /** Per-row Copy Link: creates this candidate's invitation without an email
   *  and resolves to the link; the row is then left out of the email send. */
  onCopyLink?: (c: { name: string; email: string }) => Promise<string>;
  /** Where else this email is already picked (a list), if anywhere. */
  takenEmail?: (email: string) => string | null;
}) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [linking, setLinking] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const commit = (next: EntryRow[]) => {
    setRows(next);
    onChange(toCandidates(next));
  };

  const add = () => {
    const n = name.trim();
    const e = email.trim().toLowerCase();
    if (!n || !e) { setError('Enter a name and an email address.'); return; }
    // The invite flows' own rules: letters and spaces only; a valid email.
    if (!isValidCandidateName(n)) { setError(NAME_FORMAT_ERROR); return; }
    if (!isValidEmailFormat(e)) { setError(EMAIL_FORMAT_ERROR); return; }
    if (rows.some((r) => r.email === e)) { setError(`${e} is already added.`); return; }
    if (rows.length >= MAX_EXTRA_CANDIDATES) { setError(`At most ${MAX_EXTRA_CANDIDATES} candidates can be added by email.`); return; }
    const elsewhere = takenEmail?.(e);
    if (elsewhere) { setError(`${e} is already picked from ${elsewhere}.`); return; }
    commit([{ id: newId(), name: n.replace(/\s+/g, ' '), email: e, origin: 'Manual' }, ...rows]);
    setName('');
    setEmail('');
    setError(null);
    setPage(1);
    nameRef.current?.focus();
  };

  const remove = (id: string) => commit(rows.filter((r) => r.id !== id));
  const copyLink = async (row: EntryRow) => {
    if (!onCopyLink) return;
    setLinking(row.id);
    try {
      const link = await onCopyLink({ name: row.name, email: row.email });
      try { await navigator.clipboard.writeText(link); } catch { /* shown in the toast below */ }
      commit(rows.map((r) => (r.id === row.id ? { ...r, linked: true } : r)));
      toast.success(`Invitation link for ${row.name} copied`, { description: link });
    } catch (err) {
      toast.error(friendlyErrorMessage(err, 'Could not create the link. Please try again.'));
    } finally {
      setLinking(null);
    }
  };

  const onFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      let found: { name: string; email: string }[] = [];
      let invalid = 0;
      let anyEmailColumn = false;
      if (file.name.toLowerCase().endsWith('.csv')) {
        const r = candidatesFromRows(parseCsvRows(await file.text()));
        ({ found, invalid } = r);
        anyEmailColumn = r.hasEmailColumn;
      } else {
        // Either [{ sheet, data: Row[][] }] (every sheet) or Row[][] (one sheet).
        const raw = (await readXlsxFile(file)) as unknown;
        const sheets = Array.isArray(raw) && raw.length && !Array.isArray(raw[0]) && typeof raw[0] === 'object' && raw[0] !== null && 'data' in (raw[0] as object)
          ? (raw as { data: unknown[][] }[]).map((s) => s.data)
          : [raw as unknown[][]];
        for (const data of sheets) {
          const r = candidatesFromRows(data ?? []);
          anyEmailColumn = anyEmailColumn || r.hasEmailColumn;
          found.push(...r.found);
          invalid += r.invalid;
        }
      }
      if (!anyEmailColumn) {
        toast.error('Could not find an "Email" column in the file. Expected headers: Name, Email.');
        return;
      }
      const have = new Set(rows.map((r) => r.email));
      const fresh: EntryRow[] = [];
      let repeated = 0;
      for (const c of found) {
        if (have.has(c.email) || takenEmail?.(c.email)) { repeated += 1; continue; }
        have.add(c.email);
        fresh.push({ id: newId(), name: c.name, email: c.email, origin: file.name });
      }
      const kept = fresh.slice(0, Math.max(0, MAX_EXTRA_CANDIDATES - rows.length));
      const over = fresh.length - kept.length;
      const notes = [
        repeated ? `${repeated} already added` : '',
        invalid ? `${invalid} with an invalid name or email` : '',
        over ? `${over} over the ${MAX_EXTRA_CANDIDATES} limit` : '',
      ].filter(Boolean).join(' · ');
      if (kept.length === 0) {
        toast.error(`Nothing added from ${file.name}${notes ? ` · ${notes}` : ''}`);
        return;
      }
      commit([...rows, ...kept]);
      setPage(1);
      toast.success(`Added ${kept.length} from ${file.name}`, notes ? { description: notes } : undefined);
    } catch {
      toast.error('Could not read that file. Use an .xlsx, .xls or .csv with Name and Email columns.');
    }
  };

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.includes(q)) : rows),
    [rows, q],
  );
  const pageRows = shown.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_auto] gap-2">
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Full name"
          aria-label="Full name"
          disabled={disabled}
          className={`${INPUT} border-gray-200 dark:border-slate-700`}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Email address"
          aria-label="Email address"
          aria-invalid={!!error || undefined}
          disabled={disabled}
          className={`${INPUT} ${error ? 'border-destructive-line' : 'border-gray-200 dark:border-slate-700'}`}
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="h-10 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-medium border border-brand-blue/30 text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="h-10 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          title="An .xlsx, .xls or .csv with Name and Email columns"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Upload Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void onFile(e)} className="hidden" aria-label="Upload a sheet of candidates" />
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-slate-400 tabular-nums">{rows.length.toLocaleString()} added</span>
            <div className="flex items-center gap-3">
              {rows.length > 10 && (
                <label className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                    placeholder="Search"
                    aria-label="Search added candidates"
                    className="h-8 w-44 pl-8 pr-2 text-xs border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                  />
                </label>
              )}
              <button type="button" onClick={() => commit([])} disabled={disabled} className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:hover:text-slate-100 disabled:opacity-50">
                Clear all
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full table-fixed text-sm">
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {pageRows.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-slate-900">
                    <td className="px-3 py-2 w-[34%]">
                      <span className="block truncate font-medium text-gray-900 dark:text-slate-50" title={r.name}>{r.name}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-slate-400 sm:hidden">{r.email}</span>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-gray-600 dark:text-slate-400"><span className="block truncate" title={r.email}>{r.email}</span></td>
                    <td className="hidden md:table-cell px-3 py-2 w-36">
                      <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 text-2xs text-gray-600 dark:text-slate-300" title={r.origin}>
                        {r.origin !== 'Manual' && <FileSpreadsheet className="w-3 h-3 shrink-0 text-emerald-600" aria-hidden="true" />}
                        <span className="truncate">{r.origin}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 w-[8.5rem] text-right whitespace-nowrap">
                      {onCopyLink && (
                        <button
                          type="button"
                          onClick={() => { if (!r.linked) void copyLink(r); }}
                          disabled={disabled || linking === r.id}
                          title={r.linked ? 'Invited by link — not emailed' : 'Create and copy this candidate’s link (no email is sent)'}
                          className={`inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs border disabled:opacity-50 ${
                            r.linked
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
                              : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {linking === r.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : r.linked ? <><CheckCircle className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy link</>}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={disabled}
                        aria-label={`Remove ${r.name}`}
                        title="Remove"
                        className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-destructive hover:bg-destructive-subtle disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500 dark:text-slate-400">No one matches your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {shown.length > 10 && (
            <ListPagination
              currentPage={page}
              itemsPerPage={pageSize}
              totalItems={shown.length}
              onPageChange={setPage}
              onItemsPerPageChange={(n) => { setPageSize(n); setPage(1); }}
              pageSizeOptions={[10, 25, 50]}
              itemLabel="candidates"
              compact
              attached
              minimalOnMobile
            />
          )}
        </div>
      )}
    </div>
  );
}
