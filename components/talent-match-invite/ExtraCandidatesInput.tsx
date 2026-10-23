'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import readXlsxFile from 'read-excel-file/browser';
import { isValidEmailFormat } from '@/lib/utils/email';
import type { BulkExtraCandidate } from '@/lib/services/bulkInviteService';

/** The backend takes at most this many typed-in candidates per send. */
export const MAX_EXTRA_CANDIDATES = 500;

const SECTION = 'text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500';
const CONTROL = 'text-xs border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 disabled:opacity-60';

const EMAIL_HEADER = /^(email|e.?mail|candidate.?email|email.?address)$/i;
const NAME_HEADER = /^(name|full.?name|candidate.?name|first.?name)$/i;
const PHONE_HEADER = /^(phone|mobile|phone.?number|mobile.?number|contact)$/i;

/* A minimal CSV reader (quoted fields, doubled quotes) — the share step's own. */
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
    const name = cell(nameIdx) || email.split('@')[0];
    const phone = cell(phoneIdx) || undefined;
    found.push({ name, email, phone });
  }
  return { found, hasEmailColumn: true };
};

/**
 * The share step's Manual and Upload Excel entry, for the bulk Create / Send
 * popup: candidates typed in (name, email, phone) or read from a sheet, sent
 * on top of whatever is ticked in the lists above. They go to the backend as
 * `extra_candidates`, which applies the same skips (team member, repeated
 * email, already invited) as every other row.
 */
export default function ExtraCandidatesInput({
  value,
  onChange,
  disabled = false,
}: {
  value: BulkExtraCandidate[];
  onChange: (next: BulkExtraCandidate[]) => void;
  disabled?: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /* Merge new rows in, dropping repeats of an email already in the list. */
  const addMany = (rows: BulkExtraCandidate[], from: string) => {
    const have = new Set(value.map((c) => c.email.toLowerCase()));
    const fresh: BulkExtraCandidate[] = [];
    let repeated = 0;
    for (const r of rows) {
      const key = r.email.toLowerCase();
      if (have.has(key)) { repeated += 1; continue; }
      have.add(key);
      fresh.push({ ...r, email: key });
    }
    const room = MAX_EXTRA_CANDIDATES - value.length;
    const kept = fresh.slice(0, Math.max(0, room));
    if (kept.length) onChange([...value, ...kept]);
    const notes: string[] = [];
    if (repeated) notes.push(`${repeated} already in the list`);
    if (fresh.length > kept.length) notes.push(`${fresh.length - kept.length} over the ${MAX_EXTRA_CANDIDATES} limit`);
    if (kept.length === 0) {
      toast.error(`No new candidates ${from}${notes.length ? ` (${notes.join(', ')})` : ''}`);
    } else {
      toast.success(`Added ${kept.length} candidate${kept.length === 1 ? '' : 's'} ${from}${notes.length ? ` · ${notes.join(', ')}` : ''}`);
    }
  };

  const addTyped = () => {
    const e = email.trim().toLowerCase();
    if (!e) { toast.error('Enter an email address'); return; }
    if (!isValidEmailFormat(e)) { toast.error('That email address does not look right'); return; }
    addMany([{ name: name.trim() || e.split('@')[0], email: e, phone: phone.trim() || undefined }], 'by hand');
    setName('');
    setEmail('');
    setPhone('');
  };

  const onFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      let rows: BulkExtraCandidate[] = [];
      let anyEmailColumn = false;
      if (file.name.toLowerCase().endsWith('.csv')) {
        const r = candidatesFromRows(parseCsvRows(await file.text()));
        rows = r.found;
        anyEmailColumn = r.hasEmailColumn;
      } else {
        // All sheets at once: [{ sheet, data: Row[][] }] (or Row[][] for one sheet).
        const sheets = (await readXlsxFile(file)) as unknown;
        const list = Array.isArray(sheets) && sheets.length && !Array.isArray(sheets[0]) && typeof sheets[0] === 'object' && 'data' in (sheets[0] as object)
          ? (sheets as { data: unknown[][] }[]).map((s) => s.data)
          : [sheets as unknown[][]];
        for (const data of list) {
          const r = candidatesFromRows(data ?? []);
          anyEmailColumn = anyEmailColumn || r.hasEmailColumn;
          rows.push(...r.found);
        }
      }
      if (!anyEmailColumn) {
        toast.error('Could not find an "Email" column in the file. Expected headers: Name, Email, Phone (optional).');
        return;
      }
      addMany(rows, `from ${file.name}`);
    } catch {
      toast.error('Could not read that file. Use an .xlsx, .xls or .csv with Name and Email columns.');
    }
  };

  const remove = (i: number) => onChange(value.filter((_, n) => n !== i));

  return (
    <section aria-labelledby="extra-candidates-heading" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="extra-candidates-heading" className={SECTION}>
          Add by email · {value.length.toLocaleString()} added
        </h3>
        <div className="flex items-center gap-2">
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} disabled={disabled} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 disabled:opacity-50">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || value.length >= MAX_EXTRA_CANDIDATES}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-success" aria-hidden="true" /> Upload Excel / CSV
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void onFile(e)} className="hidden" aria-label="Upload a sheet of candidates" />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={disabled}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-brand-blue/30 bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> {open ? 'Hide form' : 'Enter manually'}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Candidate name" disabled={disabled} className={`${CONTROL} flex-1 min-w-[8rem]`} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } }}
            placeholder="Email (required)"
            aria-label="Candidate email"
            disabled={disabled}
            className={`${CONTROL} flex-1 min-w-[10rem]`}
          />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" aria-label="Candidate phone" disabled={disabled} className={`${CONTROL} w-36`} />
          <button
            type="button"
            onClick={addTyped}
            disabled={disabled || !email.trim() || value.length >= MAX_EXTRA_CANDIDATES}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-brand-blue text-white hover:bg-brand-blue-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add
          </button>
        </div>
      )}

      {value.length > 0 && (
        <ul className="rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700/60 max-h-40 overflow-y-auto">
          {value.map((c, i) => (
            <li key={c.email} className="flex items-center gap-2.5 px-3 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{c.name}</span>
                <span className="block text-xs text-gray-500 dark:text-slate-400 truncate">{c.email}{c.phone ? ` · ${c.phone}` : ''}</span>
              </span>
              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-2xs font-medium border bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700">Manual</span>
              <button type="button" onClick={() => remove(i)} disabled={disabled} aria-label={`Remove ${c.name}`} className="shrink-0 p-1 rounded text-gray-400 hover:text-destructive disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
