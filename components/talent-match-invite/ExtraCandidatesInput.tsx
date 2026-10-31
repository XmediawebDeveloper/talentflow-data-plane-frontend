'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle, Copy, Download, FileSpreadsheet, Loader2, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import readXlsxFile from 'read-excel-file/browser';
import { EMAIL_FORMAT_ERROR, isValidEmailFormat } from '@/lib/utils/email';
import { NAME_FORMAT_ERROR, isValidCandidateName } from '@/lib/utils/name';
import ListPagination from '@/components/ListPagination';
import type { BulkExtraCandidate } from '@/lib/services/bulkInviteService';

/** The most candidates one send may carry — the backend's BULK_INVITE_MAX_ROWS
 *  default. The real cap is usually lower: the host passes `maxRows` from the
 *  assessment / interview units still available. */
export const MAX_EXTRA_CANDIDATES = 10000;

const PAGE_SIZE = 10;
const INPUT = 'h-9 min-w-0 px-3 border rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent disabled:opacity-60';
const CHIP = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border whitespace-nowrap max-w-full';
const CHIP_ON = 'border-brand-blue bg-brand-blue/10 text-brand-blue';
const CHIP_OFF = 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800';
const NO_ROOM = 'No units left. Remove someone to add more.';
const LABEL = 'block mb-1 text-xs font-semibold text-gray-600 dark:text-slate-300';
const BROWSE = 'h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';

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
interface UploadSummary { file: string; added: number; repeated: number; over: number; limit: number; byUnits: boolean; invalid: InvalidRow[]; open: boolean }

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

/** Which way of adding is shown: typing people in, or a sheet. */
export type ExtraMode = 'manual' | 'excel';

/* "Download sample file": the headers the upload looks for, and one example row. */
const SAMPLE_CSV = 'Name,Email\nPriya Raman,priya.raman@example.com\n';
const downloadSample = () => {
  const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'candidates-sample.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Candidates added directly, one way at a time (`mode`), the rows kept across
 * both: Type in — labelled name and email, Add Candidate (Enter adds) — or
 * Upload Excel — a slim drop zone (or Browse) with a sample file to download,
 * replaced by "Upload another sheet" once a sheet has added rows. Each
 * shows a compact table of the rows it added — search, per-sheet chips (a
 * sheet's chip can remove every row it brought), a per-row Copy Link (invites
 * by link, no email) and remove, 10 a page. Each upload leaves a summary —
 * added, invalid (row by row), repeated. The rows not invited by link are
 * handed up as `extra_candidates`; the backend applies the same skips as
 * every other row.
 */
export default function ExtraCandidatesInput({
  mode,
  room = null,
  onChange,
  onCounts,
  disabled = false,
  onCopyLink,
  takenEmail,
  maxRows = MAX_EXTRA_CANDIDATES,
  limitByUnits = false,
}: {
  mode: ExtraMode;
  /** How many more the units allow (null = no limit): at 0 nothing more
   *  can be added; a sheet adds its first rows up to it. */
  room?: number | null;
  onChange: (next: BulkExtraCandidate[]) => void;
  /** Manual vs sheet rows that will be emailed, for the summary. */
  onCounts?: (counts: ExtraCounts) => void;
  disabled?: boolean;
  /** Per-row Copy Link: creates this candidate's invitation without an email
   *  and resolves to the link; the row is then left out of the email send. */
  onCopyLink?: (c: { name: string; email: string }) => Promise<string>;
  /** Where else this email is already picked (a list), if anywhere. */
  takenEmail?: (email: string) => string | null;
  /** How many rows here may be emailed — the units left after the other
   *  picks (or the backend cap on unlimited plans). Rows past it are not added. */
  maxRows?: number;
  /** True when `maxRows` comes from the units, for the wording. */
  limitByUnits?: boolean;
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
  const [dragOver, setDragOver] = useState(false);
  const full = room !== null && room <= 0;
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
    if (full) { setError(NO_ROOM); return; }
    if (toCandidates(rows).length >= maxRows) {
      setError(limitByUnits
        ? `No units left for another candidate. ${maxRows.toLocaleString()} can be added with the units available.`
        : `At most ${maxRows.toLocaleString()} candidates can be added directly.`);
      return;
    }
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
  /* Clears the rows of the way shown: typed-in rows, or every sheet's. */
  const clearAll = () => {
    commit(rows.filter((r) => (mode === 'manual' ? r.origin !== 'Manual' : r.origin === 'Manual')));
    if (mode === 'excel') setUpload(null);
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

  const onFile = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (file) void readSheet(file);
  };
  const onDrop = (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    setDragOver(false);
    const file = ev.dataTransfer.files?.[0];
    if (!file || disabled || full) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error('Use an .xlsx, .xls or .csv file with Name and Email columns.');
      return;
    }
    void readSheet(file);
  };

  const readSheet = async (file: File) => {
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
      // The first rows, up to the host's cap and the units left. Rows already
      // invited by Copy Link are not emailed, so they don't count.
      const byCap = Math.max(0, maxRows - toCandidates(rows).length);
      const byRoom = room === null ? Infinity : Math.max(0, room);
      const kept = fresh.slice(0, Math.min(byCap, byRoom));
      setUpload({
        file: file.name, added: kept.length, repeated, over: fresh.length - kept.length,
        limit: maxRows, byUnits: limitByUnits || byRoom < byCap, invalid, open: false,
      });
      if (kept.length === 0) return;
      commit([...rows, ...kept]);
      setOrigin('all');
      setPage(1);
    } catch {
      toast.error('Could not read that file. Use an .xlsx, .xls or .csv with Name and Email columns.');
    }
  };

  const files = useMemo(() => [...new Set(rows.filter((r) => r.origin !== 'Manual').map((r) => r.origin))], [rows]);
  /* The rows of the way shown: typed in, or from the sheets. */
  const modeRows = useMemo(() => rows.filter((r) => (mode === 'manual') === (r.origin === 'Manual')), [rows, mode]);
  const fileOrigin = mode === 'excel' && files.includes(origin) ? origin : 'all';
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => modeRows.filter((r) => (fileOrigin === 'all' || r.origin === fileOrigin)
      && (!q || r.name.toLowerCase().includes(q) || r.email.includes(q))),
    [modeRows, fileOrigin, q],
  );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const pageRows = shown.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const chips: { key: string; label: string; n: number }[] = [
    { key: 'all', label: 'All sheets', n: modeRows.length },
    ...files.map((f) => ({ key: f, label: f, n: rows.filter((r) => r.origin === f).length })),
  ];

  return (
    <div className="space-y-3">
      {mode === 'manual' ? (
        <>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Type a candidate&apos;s name and email, then press <b className="font-semibold text-gray-800 dark:text-slate-200">Enter</b> or <b className="font-semibold text-gray-800 dark:text-slate-200">Add Candidate</b>.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 w-full sm:w-auto">
              <span className={LABEL}>Full name</span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                placeholder="e.g. Priya Raman"
                disabled={disabled || full}
                className={`${INPUT} w-full sm:w-48 border-gray-200 dark:border-slate-700`}
              />
            </label>
            <label className="min-w-0 w-full sm:w-auto">
              <span className={LABEL}>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                placeholder="e.g. priya@company.com"
                aria-invalid={!!error || undefined}
                disabled={disabled || full}
                className={`${INPUT} w-full sm:w-64 ${error ? 'border-destructive-line' : 'border-gray-200 dark:border-slate-700'}`}
              />
            </label>
            <button
              type="button"
              onClick={add}
              disabled={disabled || full}
              title={full ? NO_ROOM : undefined}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-medium border border-brand-blue/30 text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add Candidate
            </button>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </>
      ) : (
        <>
          {files.length === 0 ? (
            <div
              onDragEnter={(e) => { e.preventDefault(); if (!disabled && !full) setDragOver(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false); }}
              onDrop={onDrop}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${
                dragOver ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-gray-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <span className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Upload className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900 dark:text-slate-50">Drag and drop a sheet here</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">
                  .xlsx, .xls or .csv · needs <b className="font-semibold">Name</b> and <b className="font-semibold">Email</b> columns · up to {Math.min(maxRows, MAX_EXTRA_CANDIDATES).toLocaleString()} candidates
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3 shrink-0">
                <button type="button" onClick={downloadSample} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline underline-offset-2">
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Download sample file
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled || full} title={full ? NO_ROOM : undefined} className={BROWSE}>
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Browse file
                </button>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled || full} title={full ? NO_ROOM : undefined} className={BROWSE}>
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Upload another sheet
              </button>
              <button type="button" onClick={downloadSample} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline underline-offset-2">
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download sample file
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" aria-label="Upload a sheet of candidates" />

          {upload && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <b className="truncate font-semibold text-gray-900 dark:text-slate-50">{upload.file}</b>
                </span>
                <span className="font-medium text-success-strong tabular-nums">{upload.added.toLocaleString()} added</span>
                {upload.invalid.length > 0 && <span className="font-medium text-destructive tabular-nums">{upload.invalid.length.toLocaleString()} invalid</span>}
                {upload.repeated > 0 && <span className="text-gray-500 dark:text-slate-400 tabular-nums">{upload.repeated.toLocaleString()} repeated (already in the list)</span>}
                {upload.over > 0 && (upload.byUnits
                  ? <span className="font-medium text-warning-strong tabular-nums">{upload.over.toLocaleString()} not added — no units left</span>
                  : <span className="text-gray-500 dark:text-slate-400 tabular-nums">{upload.over.toLocaleString()} over the {upload.limit.toLocaleString()} limit</span>)}
                {upload.invalid.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUpload({ ...upload, open: !upload.open })}
                    aria-expanded={upload.open}
                    className="inline-flex items-center h-6 px-2 rounded-full text-xs font-medium border border-warning-line bg-warning-subtle text-warning-strong hover:brightness-95"
                  >
                    {upload.open ? 'Hide' : 'View'} invalid rows
                  </button>
                )}
                <button type="button" onClick={() => setUpload(null)} aria-label="Dismiss" className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800">
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
              {upload.open && upload.invalid.length > 0 && (
                <div className="mt-2.5 max-h-48 overflow-y-auto">
                  <table className="w-full table-fixed text-xs">
                    <thead className="text-left text-gray-600 dark:text-slate-400">
                      <tr><th className="w-16 px-2 py-1.5 font-semibold">Row</th><th className="px-2 py-1.5 font-semibold">Email in the sheet</th><th className="w-28 px-2 py-1.5 font-semibold">Problem</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60 border-t border-gray-100 dark:border-slate-700/60">
                      {upload.invalid.map((r) => (
                        <tr key={`${r.row}-${r.email}`}>
                          <td className="px-2 py-1.5 tabular-nums">{r.row}</td>
                          <td className="px-2 py-1.5"><span className="block truncate" title={r.email}>{r.email || <i className="text-gray-400">empty</i>}</span></td>
                          <td className="px-2 py-1.5">{r.problem}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'manual' && modeRows.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-4 text-center text-sm text-gray-500 dark:text-slate-400">
          No one added yet. Type a name and email above.
        </p>
      )}

      {modeRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2.5">
              <b className="text-sm font-semibold text-gray-900 dark:text-slate-50 tabular-nums">
                {modeRows.length.toLocaleString()} {mode === 'manual' ? 'typed in' : 'from sheets'}
              </b>
              <button type="button" onClick={clearAll} disabled={disabled} className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-destructive hover:underline underline-offset-2 disabled:opacity-50">
                Clear all
              </button>
            </span>
            <label className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search name or email"
                aria-label="Search added candidates"
                className="h-8 w-full pl-8 pr-2 text-xs border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
              />
            </label>
          </div>
          {mode === 'excel' && files.length > 1 && (
            <div role="group" aria-label="Added from" className="flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <button key={c.key} type="button" aria-pressed={fileOrigin === c.key} onClick={() => { setOrigin(c.key); setPage(1); }} className={`${CHIP} ${fileOrigin === c.key ? CHIP_ON : CHIP_OFF}`}>
                  {c.key !== 'all' && <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
                  <span className="truncate">{c.label}</span>
                  <span className="tabular-nums text-gray-400">{c.n.toLocaleString()}</span>
                </button>
              ))}
              {files.length > 1 && fileOrigin !== 'all' && (
                <button
                  type="button"
                  onClick={() => removeFile(fileOrigin)}
                  disabled={disabled}
                  className="text-xs font-medium text-destructive hover:underline underline-offset-2 disabled:opacity-50"
                >
                  Remove all from this file
                </button>
              )}
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-gray-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="hidden sm:table-cell px-3 py-2 text-left font-semibold">Email</th>
                  {mode === 'excel' && <th className="hidden md:table-cell w-40 px-3 py-2 text-left font-semibold">Source</th>}
                  {onCopyLink && <th className="w-[6.75rem] px-2 py-2 text-center font-semibold">Link</th>}
                  <th className="w-11 px-2 py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {pageRows.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-slate-900">
                    <td className="px-3 py-2">
                      <span className="block truncate font-medium text-gray-900 dark:text-slate-50" title={r.name}>{r.name}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-slate-400 sm:hidden">{r.email}</span>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-gray-600 dark:text-slate-400"><span className="block truncate" title={r.email}>{r.email}</span></td>
                    {mode === 'excel' && (
                      <td className="hidden md:table-cell px-3 py-2">
                        <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 text-2xs text-gray-600 dark:text-slate-300" title={r.origin}>
                          <FileSpreadsheet className="w-3 h-3 shrink-0 text-emerald-600" aria-hidden="true" />
                          <span className="truncate">{r.origin}</span>
                        </span>
                      </td>
                    )}
                    {onCopyLink && (
                      <td className="px-2 py-2 text-center whitespace-nowrap">
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
                    <td className="px-2 py-2 text-center">
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
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-500 dark:text-slate-400">No one matches your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
