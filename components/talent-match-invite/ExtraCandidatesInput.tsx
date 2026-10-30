'use client';

import { useRef, useState } from 'react';
import { CheckCircle, Copy, FileSpreadsheet, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import readXlsxFile from 'read-excel-file/browser';
import { isValidEmailFormat } from '@/lib/utils/email';
import type { BulkExtraCandidate } from '@/lib/services/bulkInviteService';
import { inviteEntryModeTabClass } from './InviteEntryModeTabs';

/** The backend takes at most this many typed-in candidates per send. */
export const MAX_EXTRA_CANDIDATES = 500;

const INPUT = 'w-full h-10 px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-inset disabled:opacity-60';
const INPUT_OK = 'border-gray-200 dark:border-slate-700 focus:ring-brand-blue/40 focus:border-transparent';
const INPUT_BAD = 'border-destructive-line focus:ring-destructive-line';

const EMAIL_HEADER = /^(email|e.?mail|candidate.?email|email.?address)$/i;
const NAME_HEADER = /^(name|full.?name|candidate.?name|first.?name)$/i;
const PHONE_HEADER = /^(phone|mobile|phone.?number|mobile.?number|contact)$/i;

interface EntryRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  origin: 'manual' | 'excel';
  /** Copy Link already invited this row by link — it is not emailed. */
  linked?: boolean;
}

const newRow = (partial: Partial<EntryRow> = {}): EntryRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  email: '',
  phone: '',
  origin: 'manual',
  ...partial,
});

/* A minimal CSV reader (quoted fields, doubled quotes) — the invite modal's own. */
const parseCsvRows = (text: string): string[][] => {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
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
  return lines.map(parseRow);
};

/* Rows of one sheet (header row first) → candidates. Needs an Email column;
   Name and Phone are optional. */
const candidatesFromRows = (rows: unknown[][]): { found: BulkExtraCandidate[]; hasEmailColumn: boolean } => {
  if (rows.length < 2) return { found: [], hasEmailColumn: false };
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const emailIdx = headers.findIndex((h) => EMAIL_HEADER.test(h));
  if (emailIdx === -1) return { found: [], hasEmailColumn: false };
  const nameIdx = headers.findIndex((h) => NAME_HEADER.test(h));
  const phoneIdx = headers.findIndex((h) => PHONE_HEADER.test(h));
  const found: BulkExtraCandidate[] = [];
  for (const row of rows.slice(1)) {
    const cell = (i: number) => (i === -1 ? '' : String(row[i] ?? '').trim());
    const email = cell(emailIdx).toLowerCase();
    if (!email || !isValidEmailFormat(email)) continue;
    found.push({ name: cell(nameIdx) || email.split('@')[0], email, phone: cell(phoneIdx) || undefined });
  }
  return { found, hasEmailColumn: true };
};

/* The rows that will be sent: a valid email, not repeated (the first keeps
   it), and a name. Blank rows are simply ignored. */
const toCandidates = (rows: EntryRow[]): BulkExtraCandidate[] => {
  const seen = new Set<string>();
  const out: BulkExtraCandidate[] = [];
  for (const r of rows) {
    if (r.linked) continue;
    const email = r.email.trim().toLowerCase();
    const name = r.name.trim();
    if (!email || !name || !isValidEmailFormat(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ name, email, phone: r.phone.trim() || undefined });
  }
  return out.slice(0, MAX_EXTRA_CANDIDATES);
};

/**
 * The invite modal's Manual / Upload Excel entry, inside the bulk Create /
 * Send popup: candidate cards with Full Name and Email Address, "Add
 * Candidate" for another, and an .xlsx / .csv import that fills the same
 * cards. The valid rows are handed up as `extra_candidates`, sent on top of
 * whatever is ticked in the lists above; the backend applies the same skips
 * as every other row (team member, repeated email, already invited).
 */
export default function ExtraCandidatesInput({
  onChange,
  disabled = false,
  onCopyLink,
}: {
  onChange: (next: BulkExtraCandidate[]) => void;
  disabled?: boolean;
  /** Per-row Copy Link: creates this candidate's invitation without an email
   *  and resolves to the link; the row is then left out of the email send. */
  onCopyLink?: (c: { name: string; email: string }) => Promise<string>;
}) {
  const [linking, setLinking] = useState<string | null>(null);
  // Opens with one empty card, like every other invite popup. Upload Excel
  // only opens the file chooser; its rows land in these cards.
  const [rows, setRows] = useState<EntryRow[]>(() => [newRow()]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Manual never goes empty: removing the last card leaves a blank one.
  const commit = (next: EntryRow[]) => {
    const kept = next.length > 0 ? next : [newRow()];
    setRows(kept);
    onChange(toCandidates(kept));
  };

  const addRow = () => commit([...rows, newRow()]);
  const updateRow = (id: string, field: 'name' | 'email' | 'phone', value: string) =>
    commit(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeRow = (id: string) => commit(rows.filter((r) => r.id !== id));
  const copyLink = async (row: EntryRow) => {
    if (!onCopyLink) return;
    setLinking(row.id);
    try {
      const link = await onCopyLink({ name: row.name.trim(), email: row.email.trim().toLowerCase() });
      try { await navigator.clipboard.writeText(link); } catch { /* shown in the toast below */ }
      commit(rows.map((r) => (r.id === row.id ? { ...r, linked: true } : r)));
      toast.success(`Invitation link for ${row.name.trim()} copied`, { description: link });
    } catch (err) {
      toast.error(friendlyErrorMessage(err, 'Could not create the link. Please try again.'));
    } finally {
      setLinking(null);
    }
  };
  const clearAll = () => commit([]);

  const emailOf = (r: EntryRow) => r.email.trim().toLowerCase();
  const isDuplicate = (row: EntryRow) => {
    const e = emailOf(row);
    if (!e) return false;
    const first = rows.find((r) => emailOf(r) === e);
    return !!first && first.id !== row.id;
  };

  const onFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      let found: BulkExtraCandidate[] = [];
      let anyEmailColumn = false;
      if (file.name.toLowerCase().endsWith('.csv')) {
        const r = candidatesFromRows(parseCsvRows(await file.text()));
        found = r.found;
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
        }
      }
      if (!anyEmailColumn) {
        toast.error('Could not find an "Email" column in the file. Expected headers: Name, Email.');
        return;
      }
      const have = new Set(rows.map(emailOf).filter(Boolean));
      const fresh: EntryRow[] = [];
      let repeated = 0;
      for (const c of found) {
        if (have.has(c.email)) { repeated += 1; continue; }
        have.add(c.email);
        fresh.push(newRow({ name: c.name, email: c.email, phone: c.phone || '', origin: 'excel' }));
      }
      const room = Math.max(0, MAX_EXTRA_CANDIDATES - rows.filter((r) => emailOf(r)).length);
      const kept = fresh.slice(0, room);
      if (kept.length === 0) {
        toast.error(repeated ? `Every email in ${file.name} is already in the list` : `No valid candidates found in ${file.name}`);
        return;
      }
      // Imported rows join the cards; an untouched blank card is dropped.
      commit([...rows.filter((r) => r.name || r.email || r.phone), ...kept]);
      const notes = [repeated ? `${repeated} already in the list` : '', fresh.length > kept.length ? `${fresh.length - kept.length} over the ${MAX_EXTRA_CANDIDATES} limit` : ''].filter(Boolean);
      toast.success(`Added ${kept.length} candidate${kept.length === 1 ? '' : 's'} from ${file.name}${notes.length ? ` · ${notes.join(', ')}` : ''}`);
    } catch {
      toast.error('Could not read that file. Use an .xlsx, .xls or .csv with Name and Email columns.');
    }
  };

  const ready = toCandidates(rows).length;

  return (
    <section aria-label="Add candidates" className="space-y-3">
      {/* One row: the hint, then Clear all · Add Candidate · Upload Excel. No
          section heading and no Manual tab — typing into the cards below is
          the only manual mode there is. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-slate-400">
          Enter candidate details manually{ready > 0 ? ` · ${ready.toLocaleString()} ready` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button type="button" onClick={clearAll} disabled={disabled} className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:hover:text-slate-100 disabled:opacity-50">
            Clear all
          </button>
          <button
            type="button"
            onClick={addRow}
            disabled={disabled || rows.length >= MAX_EXTRA_CANDIDATES}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-brand-blue hover:text-brand-blue-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Candidate
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled} className={inviteEntryModeTabClass(false)}>
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Upload Excel
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void onFile(e)} className="hidden" aria-label="Upload a sheet of candidates" />
      </div>

      <>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-0.5">
            {rows.map((row) => {
              const email = row.email.trim();
              const badEmail = !!email && !isValidEmailFormat(email);
              const dup = !badEmail && isDuplicate(row);
              const missingName = !!email && !row.name.trim();
              return (
                <div key={row.id} className="relative p-4 border rounded-lg bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700">
                  <span className={`absolute top-2 right-3 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${
                    row.origin === 'excel'
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20'
                      : 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                  }`}>
                    {row.origin === 'excel' ? 'Excel' : 'Manual'}
                  </span>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="min-w-0">
                        <label className="text-xs text-gray-600 dark:text-slate-400 mb-1 block">Full Name *</label>
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                          placeholder="e.g., John Doe"
                          disabled={disabled || row.linked}
                          aria-invalid={missingName || undefined}
                          className={`${INPUT} ${missingName ? INPUT_BAD : INPUT_OK}`}
                        />
                        {missingName && <p className="text-xs text-destructive mt-1">Name is required</p>}
                      </div>
                      <div className="min-w-0">
                        <label className="text-xs text-gray-600 dark:text-slate-400 mb-1 block">Email Address *</label>
                        <input
                          type="email"
                          value={row.email}
                          onChange={(e) => updateRow(row.id, 'email', e.target.value)}
                          placeholder="e.g., john.doe@example.com"
                          disabled={disabled || row.linked}
                          aria-invalid={badEmail || dup || undefined}
                          className={`${INPUT} ${badEmail || dup ? INPUT_BAD : INPUT_OK}`}
                        />
                        {badEmail && <p className="text-xs text-destructive mt-1">Please enter a valid email (e.g., user@example.com)</p>}
                        {dup && <p className="text-xs text-destructive mt-1">This email is already in the list</p>}
                      </div>
                    </div>
                    {onCopyLink && (
                      <button
                        type="button"
                        onClick={() => { if (!row.linked) void copyLink(row); }}
                        disabled={disabled || linking === row.id || (!row.linked && (!row.name.trim() || !email || badEmail || dup))}
                        title={row.linked ? 'Invited by link — not emailed' : "Create and copy this candidate’s invitation link (no email is sent)"}
                        className={`mt-6 shrink-0 flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-xs border transition-colors whitespace-nowrap disabled:opacity-50 ${
                          row.linked
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
                            : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {linking === row.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : row.linked ? <><CheckCircle className="w-3.5 h-3.5" /><span>Copied</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy Link</span></>}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={disabled}
                      aria-label="Remove candidate"
                      title="Remove"
                      className="mt-6 shrink-0 p-2 rounded-lg text-gray-400 hover:text-destructive hover:bg-destructive-subtle transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
      </>
    </section>
  );
}
