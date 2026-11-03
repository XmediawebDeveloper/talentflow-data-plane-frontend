'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle, Copy, FileSpreadsheet, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import readXlsxFile from 'read-excel-file/browser';
import { EMAIL_FORMAT_ERROR, isValidEmailFormat } from '@/lib/utils/email';
import { NAME_FORMAT_ERROR, isValidCandidateName } from '@/lib/utils/name';
import ListPagination from '@/components/ListPagination';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import type { BulkExtraCandidate } from '@/lib/services/bulkInviteService';

/** The backend takes at most this many typed-in candidates per send. */
export const MAX_EXTRA_CANDIDATES = 500;

const PAGE_SIZE = 10;
const INPUT = 'h-10 w-full min-w-0 px-3 border rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent disabled:opacity-60';
const CHIP = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border whitespace-nowrap max-w-full';
const CHIP_ON = 'border-brand-blue bg-brand-blue/10 text-brand-blue';
const CHIP_OFF = 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800';

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

/** A sheet row that was not added, as the upload summary lists it. */
interface InvalidRow { row: number; email: string; problem: string }

/** The last sheet uploaded: what came of it. */
interface UploadSummary { file: string; added: number; repeated: number; over: number; invalid: InvalidRow[]; open: boolean }

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
   not letters and spaces, are listed as invalid (with their sheet row number)
   and left out. */
const candidatesFromRows = (rows: unknown[][]): { found: { name: string; email: string }[]; invalid: InvalidRow[]; hasEmailColumn: boolean } => {
  if (rows.length < 2) return { found: [], invalid: [], hasEmailColumn: false };
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const emailIdx = headers.findIndex((h) => EMAIL_HEADER.test(h));
  if (emailIdx === -1) return { found: [], invalid: [], hasEmailColumn: false };
  const nameIdx = headers.findIndex((h) => NAME_HEADER.test(h));
  const found: { name: string; email: string }[] = [];
  const invalid: InvalidRow[] = [];
  rows.slice(1).forEach((row, i) => {
    const cell = (c: number) => (c === -1 ? '' : String(row[c] ?? '').trim());
    if (row.every((v) => !String(v ?? '').trim())) return;
    const sheetRow = i + 2; // the header is row 1
    const email = cell(emailIdx).toLowerCase();
    if (!email) { invalid.push({ row: sheetRow, email: '', problem: 'Missing email' }); return; }
    if (!isValidEmailFormat(email)) { invalid.push({ row: sheetRow, email, problem: 'Invalid email' }); return; }
    const name = cell(nameIdx) || nameFromEmail(email);
    if (!isValidCandidateName(name)) { invalid.push({ row: sheetRow, email, problem: 'Invalid name' }); return; }
    found.push({ name: name.replace(/\s+/g, ' '), email });
  });
  return { found, invalid, hasEmailColumn: true };
};

/* The rows that will be emailed: not invited by link already. */
const toCandidates = (rows: EntryRow[]): BulkExtraCandidate[] =>
  rows.filter((r) => !r.linked).map((r) => ({ name: r.name, email: r.email }));

/** How the rows added here split, for the popup's summary. */
export interface ExtraCounts { manual: number; excel: number }

/**
 * Candidates added directly: one quick-add row (name, email, Add Candidate;
 * Enter adds) and Upload Excel, then a compact table of everyone added this
 * way — search, All / Manual / per-sheet chips (a sheet's chip can remove
 * every row it brought), a per-row Copy Link (invites by link, no email) and
 * remove, 10 a page. Each upload leaves a summary — added, invalid (row by
 * row), repeated. The rows not invited by link are handed up as
 * `extra_candidates`; the backend applies the same skips as every other row.
 */
export default function ExtraCandidatesInput({
  onChange,
  onCounts,
  disabled = false,
  onCopyLink,
  takenEmail,
}: {
  onChange: (next: BulkExtraCandidate[]) => void;
  /** Manual vs sheet rows that will be emailed, for the summary. */
  onCounts?: (counts: ExtraCounts) => void;
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
  const [origin, setOrigin] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [linking, setLinking] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadSummary | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const commit = (next: EntryRow[]) => {
    setRows(next);
    const emailed = next.filter((r) => !r.linked);
    onChange(toCandidates(next));
    onCounts?.({
      manual: emailed.filter((r) => r.origin === 'Manual').length,
      excel: emailed.filter((r) => r.origin !== 'Manual').length,
    });
  };

  const add = () => {
    const n = name.trim();
    const e = email.trim().toLowerCase();
    if (!n || !e) { setError('Enter a full name and an email address.'); return; }
    // The invite flows' own rules: letters and spaces only; a valid email.
    if (!isValidCandidateName(n)) { setError(NAME_FORMAT_ERROR); return; }
    if (!isValidEmailFormat(e)) { setError(EMAIL_FORMAT_ERROR); return; }
    const same = rows.find((r) => r.email === e);
    if (same) { setError(`${e} is already added${same.origin === 'Manual' ? '' : ` from ${same.origin}`}.`); return; }
    if (rows.length >= MAX_EXTRA_CANDIDATES) { setError(`At most ${MAX_EXTRA_CANDIDATES} candidates can be added directly.`); return; }
    const elsewhere = takenEmail?.(e);
    if (elsewhere) { setError(`${e} is already added from ${elsewhere}.`); return; }
    commit([{ id: newId(), name: n.replace(/\s+/g, ' '), email: e, origin: 'Manual' }, ...rows]);
    setName('');
    setEmail('');
    setError(null);
    setPage(1);
    nameRef.current?.focus();
  };

  const remove = (id: string) => commit(rows.filter((r) => r.id !== id));
  const removeFile = (file: string) => {
    commit(rows.filter((r) => r.origin !== file));
    if (upload?.file === file) setUpload(null);
    setOrigin('all');
    setPage(1);
  };
  const clearAll = () => {
    commit([]);
    setUpload(null);
    setOrigin('all');
    setPage(1);
  };
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
      const found: { name: string; email: string }[] = [];
      const invalid: InvalidRow[] = [];
      let anyEmailColumn = false;
      if (file.name.toLowerCase().endsWith('.csv')) {
        const r = candidatesFromRows(parseCsvRows(await file.text()));
        found.push(...r.found);
        invalid.push(...r.invalid);
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
          invalid.push(...r.invalid);
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
      setUpload({ file: file.name, added: kept.length, repeated, over, invalid, open: false });
      if (kept.length === 0) return;
      commit([...rows, ...kept]);
      setOrigin('all');
      setPage(1);
    } catch {
      toast.error('Could not read that file. Use an .xlsx, .xls or .csv with Name and Email columns.');
    }
  };

  const files = useMemo(() => [...new Set(rows.filter((r) => r.origin !== 'Manual').map((r) => r.origin))], [rows]);
  const manualCount = rows.filter((r) => r.origin === 'Manual').length;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => rows.filter((r) => (origin === 'all' || r.origin === origin)
      && (!q || r.name.toLowerCase().includes(q) || r.email.includes(q))),
    [rows, origin, q],
  );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const pageRows = shown.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const chips: { key: string; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: rows.length },
    ...(manualCount ? [{ key: 'Manual', label: 'Manual', n: manualCount }] : []),
    ...files.map((f) => ({ key: f, label: f, n: rows.filter((r) => r.origin === f).length })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="tf-body-secondary">Add people directly: type them in, or upload a sheet with Name and Email columns.</p>
        <div className="flex items-center gap-2 shrink-0">
          {rows.length > 0 && (
            <button type="button" onClick={clearAll} disabled={disabled} className="h-9 px-3 rounded-lg text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-slate-100 dark:hover:bg-slate-800 disabled:opacity-50">
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="tf-btn tf-btn-secondary h-9 gap-1.5 px-3 text-sm border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 whitespace-normal font-normal"
            title="An .xlsx, .xls or .csv with Name and Email columns"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Upload Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void onFile(e)} className="hidden" aria-label="Upload a sheet of candidates" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-2">
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
          className="h-10 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-medium border border-brand-blue/30 text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Candidate
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {upload && (
        <div className="tf-panel px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <b className="truncate font-semibold text-gray-900 dark:text-slate-50">{upload.file}</b>
            </span>
            <span className="font-medium text-success-strong tabular-nums">{upload.added.toLocaleString()} added</span>
            {upload.invalid.length > 0 && <span className="font-medium text-destructive tabular-nums">{upload.invalid.length.toLocaleString()} invalid</span>}
            {upload.repeated > 0 && <span className="text-gray-500 dark:text-slate-400 tabular-nums">{upload.repeated.toLocaleString()} repeated (already in the list)</span>}
            {upload.over > 0 && <span className="text-gray-500 dark:text-slate-400 tabular-nums">{upload.over.toLocaleString()} over the {MAX_EXTRA_CANDIDATES} limit</span>}
            {upload.invalid.length > 0 && (
              <button type="button" onClick={() => setUpload({ ...upload, open: !upload.open })} className="text-xs font-medium text-brand-blue hover:underline underline-offset-2">
                {upload.open ? 'Hide' : 'View'} invalid rows
              </button>
            )}
            <button type="button" onClick={() => setUpload(null)} aria-label="Dismiss" className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800">
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          {upload.open && upload.invalid.length > 0 && (
            <>
            <div className={`mt-2.5 max-h-48 overflow-y-auto ${DESKTOP_TABLE_ONLY}`}>
              <table className="w-full table-fixed text-xs">
                <thead className="text-left text-gray-600 dark:text-slate-400">
                  <tr><th className="tf-th-cell w-16 font-semibold">Row</th><th className="tf-th-cell font-semibold">Email in the sheet</th><th className="tf-th-cell w-28 font-semibold">Problem</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60 border-t border-gray-100 dark:border-slate-700/60">
                  {upload.invalid.map((r) => (
                    <tr key={`${r.row}-${r.email}`}>
                      <td className="tf-td tabular-nums">{r.row}</td>
                      <td className="tf-td"><span className="block truncate" title={r.email}>{r.email || <i className="text-gray-400">empty</i>}</span></td>
                      <td className="tf-td">{r.problem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MobileRecordList className="mt-2.5 max-h-48 overflow-y-auto">
              {upload.invalid.map((r) => (
                <MobileRecordCard
                  key={`${r.row}-${r.email}`}
                  idBadge={<span className="tf-meta tabular-nums">Row {r.row}</span>}
                  title={<span className="block truncate" title={r.email}>{r.email || <i className="text-gray-400">empty</i>}</span>}
                  fields={[{ label: 'Problem', value: r.problem }]}
                />
              ))}
            </MobileRecordList>
            </>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="tf-row-title tabular-nums">{rows.length.toLocaleString()} added directly</b>
            <label className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search name or email"
                aria-label="Search added candidates"
                className="tf-input h-8 pl-8 pr-2 text-xs"
              />
            </label>
          </div>
          {chips.length > 2 && (
            <div role="group" aria-label="Added from" className="flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <button key={c.key} type="button" aria-pressed={origin === c.key} onClick={() => { setOrigin(c.key); setPage(1); }} className={`${CHIP} ${origin === c.key ? CHIP_ON : CHIP_OFF}`}>
                  {c.key !== 'all' && c.key !== 'Manual' && <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
                  <span className="truncate">{c.label}</span>
                  <span className="tabular-nums text-gray-400">{c.n.toLocaleString()}</span>
                </button>
              ))}
              {origin !== 'all' && origin !== 'Manual' && (
                <button type="button" onClick={() => removeFile(origin)} disabled={disabled} className="text-xs font-medium text-destructive hover:underline underline-offset-2 disabled:opacity-50">
                  Remove all from this file
                </button>
              )}
            </div>
          )}
          <div className={`overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700 ${DESKTOP_TABLE_ONLY}`}>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 tf-meta">
                <tr>
                  <th className="tf-th-cell text-left font-semibold">Name</th>
                  <th className="tf-th-cell hidden sm:table-cell text-left font-semibold">Email</th>
                  <th className="tf-th-cell hidden md:table-cell w-40 text-left font-semibold">Source</th>
                  {onCopyLink && <th className="tf-th-cell w-[6.75rem] text-center font-semibold">Link</th>}
                  <th className="tf-th-cell w-11"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {pageRows.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-slate-900">
                    <td className="tf-td">
                      <span className="block truncate font-medium text-gray-900 dark:text-slate-50" title={r.name}>{r.name}</span>
                      <span className="block truncate tf-meta sm:hidden">{r.email}</span>
                    </td>
                    <td className="tf-td hidden sm:table-cell text-gray-600 dark:text-slate-400"><span className="block truncate" title={r.email}>{r.email}</span></td>
                    <td className="tf-td hidden md:table-cell">
                      <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 tf-micro-hint" title={r.origin}>
                        {r.origin !== 'Manual' && <FileSpreadsheet className="w-3 h-3 shrink-0 text-emerald-600" aria-hidden="true" />}
                        <span className="truncate">{r.origin}</span>
                      </span>
                    </td>
                    {onCopyLink && (
                      <td className="tf-td text-center whitespace-nowrap">
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
                      </td>
                    )}
                    <td className="tf-td text-center">
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={disabled}
                        aria-label={`Remove ${r.name}`}
                        title="Remove"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-destructive hover:bg-destructive-subtle disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={5} className="tf-td text-center tf-body-muted">No one matches your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <MobileRecordList empty={<p className="tf-td text-center tf-body-muted">No one matches your search.</p>}>
            {pageRows.map((r) => (
              <MobileRecordCard
                key={r.id}
                badges={
                  <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 tf-micro-hint" title={r.origin}>
                    {r.origin !== 'Manual' && <FileSpreadsheet className="w-3 h-3 shrink-0 text-emerald-600" aria-hidden="true" />}
                    <span className="truncate">{r.origin}</span>
                  </span>
                }
                title={<span className="block truncate" title={r.name}>{r.name}</span>}
                actions={
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    disabled={disabled}
                    aria-label={`Remove ${r.name}`}
                    title="Remove"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-destructive hover:bg-destructive-subtle disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                }
                fields={[{ label: 'Email', value: <span className="break-all" title={r.email}>{r.email}</span> }]}
                footer={onCopyLink ? (
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
                ) : undefined}
              />
            ))}
          </MobileRecordList>
          {shown.length > 0 && (
            <ListPagination
              currentPage={curPage}
              itemsPerPage={PAGE_SIZE}
              totalItems={shown.length}
              onPageChange={setPage}
              onItemsPerPageChange={() => setPage(1)}
              pageSizeOptions={[PAGE_SIZE]}
              itemLabel="candidates"
              compact
              attached
              minimalOnMobile
              alwaysShow
            />
          )}
        </div>
      )}
    </div>
  );
}
