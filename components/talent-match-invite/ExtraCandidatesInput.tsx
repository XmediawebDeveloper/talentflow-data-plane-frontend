'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, CheckCircle, Copy, Download, FileSpreadsheet, Info, Link2, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import readXlsxFile from 'read-excel-file/browser';
import { EMAIL_FORMAT_ERROR, isValidEmailFormat } from '@/lib/utils/email';
import { NAME_FORMAT_ERROR, isValidCandidateName } from '@/lib/utils/name';
import ListPagination from '@/components/ListPagination';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { Button } from '@/components/ui/button';
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
  /** Added through "Use that resume": the invite is linked to this resume,
   *  and records where it was found. */
  resumeId?: string;
  inviteSource?: string;
}

/** A typed email that is already a candidate in one of the lists. */
export interface ExistingCandidateMatch {
  resumeId: string;
  name: string;
  email: string;
  /** The list it was found in, as the tab names it ("AI Talent Match"). */
  sourceLabel: string;
  /** The host's own key for that list. */
  sourceKey: string;
  /** What to show beside it: "82% match", "rating 8". */
  detail?: string;
}

/** Someone already in the send from outside this tab: a list pick, or the
 *  page's own candidates. */
export interface PickedPerson {
  name: string;
  email: string;
  /** Where they were picked, as the tab names it ("My Resumes"). */
  sourceLabel: string;
  /** A list pick: its tab and resume, so View can show the row. */
  sourceKey?: string;
  resumeId?: string;
}


/** What the host knows about a typed email beyond this tab. */
export interface EmailCheck {
  /** Already in the send elsewhere (e.g. "AI Talent Match (Select all
   *  matching)") — it cannot be added again. */
  taken?: string | null;
  /** In a list but not picked: offered as "Use that resume". */
  match?: ExistingCandidateMatch | null;
  /** Already invited to the version being sent: why it is not added. */
  invited?: string | null;
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

/* The rows that will be emailed: not invited by link already. Each names its
   source, so the review groups (and badges) sheet rows as Excel, not Manual. */
const toCandidates = (rows: EntryRow[]): BulkExtraCandidate[] =>
  rows.filter((r) => !r.linked).map((r) => ({
    name: r.name,
    email: r.email,
    ...(r.resumeId ? { resume_id: r.resumeId } : {}),
    invite_source: r.inviteSource ?? (r.origin === 'Manual' ? 'Manual' : 'Excel upload'),
  }));

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
 * both: Manual — labelled name and email, Add Candidate (Enter adds) — or
 * Upload Excel — a slim drop zone (or Browse) with a sample file to download,
 * replaced by "Upload another sheet" once a sheet has added rows. Each
 * shows a compact table of the rows it added — search, per-sheet chips (a
 * sheet's chip can remove every row it brought), a per-row Copy Link (invites
 * by link, no email), edit in place and remove, 10 a page. Each upload leaves a summary —
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
  checkEmail,
  checkEmails,
  onUseExisting,
  picked = [],
  onViewPicked,
  noUnitsNoun = null,
  noUnitsAction,
  initialRows,
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
  /** The server-side look-up for a typed email: in a "Select all matching"
   *  selection (cannot be added again), or a candidate in one of the lists
   *  that is not picked (offered as "Use that resume"). */
  checkEmail?: (email: string) => Promise<EmailCheck>;
  /** For a sheet: which of these emails a "Select all matching" selection
   *  already includes — those rows are skipped as repeated. */
  checkEmails?: (emails: string[]) => Promise<Set<string>>;
  /** "Use that resume": the host picks it in its list and returns true; false
   *  (it cannot, e.g. a "Select all matching" selection is on) adds it here,
   *  linked to the resume. */
  onUseExisting?: (match: ExistingCandidateMatch) => boolean;
  /** Everyone already picked outside this tab: a typed email among them is
   *  said to be included (as it is typed), a typed name among them is asked
   *  about (same person, another email?). */
  picked?: PickedPerson[];
  /** View: show that pick in its own tab. */
  onViewPicked?: (p: PickedPerson) => void;
  /** No units left at all ("Assessment" / "AI interview"): the form and the
   *  drop zone are greyed, with the reason above them. */
  noUnitsNoun?: string | null;
  /** Beside that reason: Add units (or who to ask). */
  noUnitsAction?: ReactNode;
  /** Back from Add units: the rows that were here, put back. */
  initialRows?: BulkExtraCandidate[];
  /** How many rows here may be emailed — the units left after the other
   *  picks (or the backend cap on unlimited plans). Rows past it are not added. */
  maxRows?: number;
  /** True when `maxRows` comes from the units, for the wording. */
  limitByUnits?: boolean;
}) {
  const [rows, setRows] = useState<EntryRow[]>(() => (initialRows ?? []).map((c) => ({
    id: newId(),
    name: c.name,
    email: c.email,
    // A sheet's own file name did not travel: its rows come back as one sheet.
    origin: c.invite_source === 'Excel upload' ? 'Excel upload' : 'Manual',
    resumeId: c.resume_id,
    inviteSource: c.invite_source === 'Excel upload' || c.invite_source === 'Manual' ? undefined : c.invite_source,
  })));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [linking, setLinking] = useState<string | null>(null);
  /* The row being edited in place, its draft and what is wrong with it. */
  const [editing, setEditing] = useState<{ id: string; name: string; email: string; error: string | null } | null>(null);
  const [upload, setUpload] = useState<UploadSummary | null>(null);
  /* The server look-up for a typed email is running. */
  const [checking, setChecking] = useState(false);
  /* A typed email found in a list: use that resume, or add it typed. */
  const [offer, setOffer] = useState<{ match: ExistingCandidateMatch; typedName: string } | null>(null);
  /* A typed email already in the send: said calmly, not as an error. */
  const [included, setIncluded] = useState<PickedPerson | null>(null);
  /* The email as typed, read 300ms after the last key: shows "already
     included" before Add Candidate is pressed. */
  const [typedEmail, setTypedEmail] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTypedEmail(email.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [email]);
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

  /* Already in the send, by email: a list pick, or a row added here. */
  const includedAs = (e: string): PickedPerson | null => {
    const pick = picked.find((p) => p.email.trim().toLowerCase() === e);
    if (pick) return pick;
    const row = rows.find((r) => r.email === e);
    return row ? { name: row.name, email: row.email, sourceLabel: row.origin === 'Manual' ? 'Manual' : row.origin } : null;
  };
  const liveIncluded = isValidEmailFormat(typedEmail) && typedEmail === email.trim().toLowerCase() ? includedAs(typedEmail) : null;
  const showIncluded = (p: PickedPerson) => {
    setIncluded(p);
    setError(null);
    setName('');
    setEmail('');
    setTypedEmail('');
  };

  const add = async () => {
    if (checking) return;
    setOffer(null);
    setIncluded(null);
    const n = name.trim();
    const e = email.trim().toLowerCase();
    if (!n || !e) { setError('Enter a full name and an email address.'); return; }
    // The invite flows' own rules: letters and spaces only; a valid email.
    if (!isValidCandidateName(n)) { setError(NAME_FORMAT_ERROR); return; }
    if (!isValidEmailFormat(e)) { setError(EMAIL_FORMAT_ERROR); return; }
    const already = includedAs(e);
    if (already) { showIncluded(already); return; }
    if (full) { setError(NO_ROOM); return; }
    if (toCandidates(rows).length >= maxRows) {
      setError(limitByUnits
        ? `No units left for another candidate. ${maxRows.toLocaleString()} can be added with the units available.`
        : `At most ${maxRows.toLocaleString()} candidates can be added directly.`);
      return;
    }
    const elsewhere = takenEmail?.(e);
    if (elsewhere) { showIncluded({ name: n, email: e, sourceLabel: elsewhere }); return; }
    // Duplicates are by email only: two people may share a name.
    if (checkEmail) {
      setChecking(true);
      let found: EmailCheck = {};
      try { found = await checkEmail(e); } catch { /* the look-up is a help, not a gate */ }
      setChecking(false);
      if (found.taken) { showIncluded({ name: n, email: e, sourceLabel: found.taken }); return; }
      if (found.invited) { setError(found.invited); return; }
      if (found.match) { setOffer({ match: found.match, typedName: n.replace(/\s+/g, ' ') }); return; }
    }
    commit([{ id: newId(), name: n.replace(/\s+/g, ' '), email: e, origin: 'Manual' }, ...rows]);
    setName('');
    setEmail('');
    setError(null);
    setPage(1);
    nameRef.current?.focus();
  };

  const remove = (id: string) => {
    if (editing?.id === id) setEditing(null);
    commit(rows.filter((r) => r.id !== id));
  };
  /* Edit: the add rules again — a name of letters and spaces, a valid email
     not already in this list or picked elsewhere. A row invited by Copy Link
     already has its invitation, so it is not edited. */
  /* The found-in-a-list offer: the resume (picked by the host where it can,
     else added here linked to it), or the email as typed. */
  const useExisting = () => {
    if (!offer) return;
    const { match } = offer;
    if (!onUseExisting?.(match)) {
      commit([{ id: newId(), name: match.name, email: match.email, origin: 'Manual', resumeId: match.resumeId, inviteSource: match.sourceLabel }, ...rows]);
    }
    toast.success(`${match.name} added from ${match.sourceLabel}, linked to their resume`);
    setOffer(null);
    setName('');
    setEmail('');
    nameRef.current?.focus();
  };
  const addTypedAnyway = () => {
    if (!offer) return;
    commit([{ id: newId(), name: offer.typedName, email: offer.match.email, origin: 'Manual' }, ...rows]);
    setOffer(null);
    setName('');
    setEmail('');
    nameRef.current?.focus();
  };

  const startEdit = (r: EntryRow) => setEditing({ id: r.id, name: r.name, email: r.email, error: null });
  const saveEdit = async () => {
    if (!editing || checking) return;
    const n = editing.name.trim();
    const e = editing.email.trim().toLowerCase();
    const fail = (error: string) => setEditing({ ...editing, error });
    if (!n || !e) { fail('Enter a full name and an email address.'); return; }
    if (!isValidCandidateName(n)) { fail(NAME_FORMAT_ERROR); return; }
    if (!isValidEmailFormat(e)) { fail(EMAIL_FORMAT_ERROR); return; }
    const before = rows.find((r) => r.id === editing.id);
    if (!before) { setEditing(null); return; }
    if (e !== before.email) {
      const same = rows.find((r) => r.id !== editing.id && r.email === e);
      if (same) { fail(`${e} is already added${same.origin === 'Manual' ? '' : ` from ${same.origin}`}.`); return; }
      const elsewhere = takenEmail?.(e);
      if (elsewhere) { fail(`${e} is already added from ${elsewhere}.`); return; }
      // The same look-up as Add: in a "Select all matching" selection, or a
      // candidate in a list (added from there, so the invite is linked).
      if (checkEmail) {
        setChecking(true);
        let found: EmailCheck = {};
        try { found = await checkEmail(e); } catch { /* checked again at Review */ }
        setChecking(false);
        if (found.taken) { fail(`${e} is already included from ${found.taken}.`); return; }
        if (found.invited) { fail(found.invited); return; }
        if (found.match) { fail(`${e} is ${found.match.name} in ${found.match.sourceLabel} — add them with Add Candidate to link their resume.`); return; }
      }
    }
    commit(rows.map((r) => (r.id === editing.id ? { ...r, name: n.replace(/\s+/g, ' '), email: e } : r)));
    setEditing(null);
  };
  const editKeys = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') { ev.preventDefault(); void saveEdit(); }
    // Escape cancels the edit only, not the popup.
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setEditing(null); }
  };
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
      // Emails a "Select all matching" selection already sends to.
      let inSelection = new Set<string>();
      if (checkEmails && found.length) {
        try { inSelection = await checkEmails(found.map((c) => c.email)); } catch { /* checked again at Review */ }
      }
      const fresh: EntryRow[] = [];
      let repeated = 0;
      for (const c of found) {
        if (have.has(c.email) || takenEmail?.(c.email) || inSelection.has(c.email)) { repeated += 1; continue; }
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

  const noUnitsNote = noUnitsNoun && (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-info-line bg-info-subtle px-3 py-2 text-sm font-medium text-info-strong">
      <span className="flex items-start gap-2 min-w-0 flex-1 basis-60">
        <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        {mode === 'manual' ? 'Adding candidates is turned off' : 'Uploading is turned off'} — 0 {noUnitsNoun} units available.
      </span>
      {noUnitsAction && <span className="pl-6 sm:pl-0">{noUnitsAction}</span>}
    </div>
  );
  const greyed = noUnitsNoun ? 'opacity-50 pointer-events-none select-none' : '';

  return (
    <div className="space-y-3">
      {noUnitsNote}
      {mode === 'manual' ? (
        <>
          <p className="tf-card-desc">
            Type a candidate&apos;s name and email, then press <b className="font-semibold text-gray-800 dark:text-slate-200">Enter</b> or <b className="font-semibold text-gray-800 dark:text-slate-200">Add Candidate</b>.
          </p>
          <div className={`flex flex-wrap items-end gap-2 ${greyed}`} aria-disabled={!!noUnitsNoun || undefined}>
            <label className="min-w-0 w-full sm:w-auto">
              <span className={LABEL}>Full name</span>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); setIncluded(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
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
                onChange={(e) => { setEmail(e.target.value); setError(null); setIncluded(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
                placeholder="e.g. priya@company.com"
                aria-invalid={!!error || undefined}
                disabled={disabled || full}
                className={`${INPUT} w-full sm:w-64 ${error ? 'border-destructive-line' : 'border-gray-200 dark:border-slate-700'}`}
              />
            </label>
            <button
              type="button"
              onClick={() => void add()}
              disabled={disabled || full || checking}
              title={full ? NO_ROOM : undefined}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-medium border border-brand-blue/30 text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {checking ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
              {checking ? 'Checking…' : 'Add Candidate'}
            </button>
          </div>
          {error && <p role="alert" className="tf-error">{error}</p>}
          {/* Already in the send (as it is typed, or on Add): nothing to do. */}
          {!error && (included ?? liveIncluded) && (() => {
            const p = (included ?? liveIncluded)!;
            const here = p.sourceLabel === 'Manual';
            return (
              <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-info-line bg-info-subtle px-3 py-2.5 text-sm text-foreground">
                <span className="flex min-w-0 flex-1 basis-60 items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-info-strong" aria-hidden="true" />
                  <span className="min-w-0 break-words">
                    <b className="font-semibold text-info-strong">{p.name}</b> ({p.email}) is already {here ? 'added below' : <>selected from <b className="font-semibold text-info-strong">{p.sourceLabel}</b></>} — no need to add again.
                  </span>
                </span>
                {p.resumeId && onViewPicked && (
                  <Button variant="secondary" size="sm" onClick={() => { setIncluded(null); onViewPicked(p); }} className="ml-6 sm:ml-0">
                    View
                  </Button>
                )}
              </div>
            );
          })()}
          {/* Found in a list: link the invite to that resume (default), or add
              the email as typed. */}
          {offer && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-brand-blue/25 bg-brand-blue/[0.05] px-3 py-2.5 text-sm">
              <p className="flex items-start gap-2 text-gray-800 dark:text-slate-200">
                <Link2 className="w-4 h-4 mt-0.5 shrink-0 text-brand-blue" aria-hidden="true" />
                <span>
                  <b className="font-semibold">{offer.match.name}</b> ({offer.match.email}) is already in <b className="font-semibold">{offer.match.sourceLabel}</b>
                  {offer.match.detail ? <> · {offer.match.detail}</> : null}.
                  {' '}Use that resume so the invite and results are linked to it.
                  {offer.typedName.toLowerCase() !== offer.match.name.toLowerCase() && (
                    <span className="block tf-meta">You entered: {offer.typedName}</span>
                  )}
                </span>
              </p>
              <span className="flex flex-wrap items-center gap-2 pl-6">
                <button
                  type="button"
                  onClick={useExisting}
                  autoFocus
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold bg-brand-blue text-white hover:bg-brand-blue-2"
                >
                  <Link2 className="w-3.5 h-3.5" aria-hidden="true" />Use that resume
                </button>
                <button
                  type="button"
                  onClick={addTypedAnyway}
                  className="h-8 inline-flex items-center px-3 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  Add manually anyway
                </button>
                <button
                  type="button"
                  onClick={() => setOffer(null)}
                  className="h-8 inline-flex items-center px-2 text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          {files.length === 0 ? (
            <div
              onDragEnter={(e) => { e.preventDefault(); if (!disabled && !full) setDragOver(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false); }}
              onDrop={onDrop}
              aria-disabled={!!noUnitsNoun || undefined}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${greyed} ${
                dragOver ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-gray-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <span className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Upload className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block tf-cell-name">Drag and drop a sheet here</span>
                <span className="block tf-meta">
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
              <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled || full} title={noUnitsNoun ? 'No units left.' : full ? NO_ROOM : undefined} className={BROWSE}>
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
        </>
      )}

      {mode === 'manual' && modeRows.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-4 text-center tf-body-muted">
          No one added yet. Type a name and email above.
        </p>
      )}

      {modeRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2.5">
              <b className="tf-row-title tabular-nums">
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
                className="tf-input h-8 pl-8 pr-2 text-xs"
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
              <thead className="bg-slate-50 dark:bg-slate-800 tf-meta">
                <tr>
                  <th className="tf-th-cell text-left font-semibold">Name</th>
                  <th className="tf-th-cell hidden sm:table-cell text-left font-semibold">Email</th>
                  {mode === 'excel' && <th className="tf-th-cell hidden md:table-cell w-40 text-left font-semibold">Source</th>}
                  <th className={`${onCopyLink ? 'w-[10.5rem]' : 'w-[5rem]'} tf-th-cell text-center font-semibold`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {pageRows.map((r) => {
                  const draft = editing?.id === r.id ? editing : null;
                  return (
                  <tr key={r.id} className={draft ? 'bg-brand-blue/[0.03] dark:bg-slate-800/50' : 'bg-white dark:bg-slate-900'}>
                    <td className="tf-td align-top">
                      {draft ? (
                        <>
                          <input
                            autoFocus
                            value={draft.name}
                            onChange={(e) => setEditing({ ...draft, name: e.target.value, error: null })}
                            onKeyDown={editKeys}
                            aria-label="Full name"
                            className={`${INPUT} h-8 w-full border-gray-200 dark:border-slate-700`}
                          />
                          <input
                            type="email"
                            value={draft.email}
                            onChange={(e) => setEditing({ ...draft, email: e.target.value, error: null })}
                            onKeyDown={editKeys}
                            aria-label="Email address"
                            className={`${INPUT} sm:hidden mt-1.5 h-8 w-full border-gray-200 dark:border-slate-700`}
                          />
                          {draft.error && <p role="alert" className="mt-1 tf-error">{draft.error}</p>}
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate font-medium text-gray-900 dark:text-slate-50" title={r.name}>{r.name}</span>
                            {r.resumeId && (
                              <span title={`Linked to the resume in ${r.inviteSource}`} className="shrink-0 inline-flex items-center gap-1 rounded-md border border-brand-blue/20 bg-brand-blue/5 px-1.5 py-px text-2xs font-medium text-brand-blue">
                                <Link2 className="w-3 h-3" aria-hidden="true" />{r.inviteSource}
                              </span>
                            )}
                          </span>
                          <span className="block truncate tf-meta sm:hidden">{r.email}</span>
                        </>
                      )}
                    </td>
                    <td className="tf-td hidden sm:table-cell align-top text-gray-600 dark:text-slate-400">
                      {draft ? (
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(e) => setEditing({ ...draft, email: e.target.value, error: null })}
                          onKeyDown={editKeys}
                          aria-label="Email address"
                          aria-invalid={!!draft.error || undefined}
                          className={`${INPUT} h-8 w-full ${draft.error ? 'border-destructive-line' : 'border-gray-200 dark:border-slate-700'}`}
                        />
                      ) : <span className="block truncate" title={r.email}>{r.email}</span>}
                    </td>
                    {mode === 'excel' && (
                      <td className="tf-td hidden md:table-cell align-top">
                        <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 tf-micro-hint" title={r.origin}>
                          <FileSpreadsheet className="w-3 h-3 shrink-0 text-emerald-600" aria-hidden="true" />
                          <span className="truncate">{r.origin}</span>
                        </span>
                      </td>
                    )}
                    <td className="tf-td align-top">
                      <span className="flex items-center justify-center gap-1 whitespace-nowrap">
                        {draft ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveEdit()}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium bg-brand-blue text-white hover:bg-brand-blue-2"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="inline-flex items-center h-7 px-2 rounded-md text-xs font-medium border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {onCopyLink && (
                              <button
                                type="button"
                                onClick={() => { if (!r.linked) void copyLink(r); }}
                                // A link uses a unit too: none left, none made.
                                disabled={disabled || linking === r.id || (!!noUnitsNoun && !r.linked)}
                                title={r.linked ? 'Invited by link — not emailed' : noUnitsNoun ? 'No units left.' : 'Create and copy this candidate’s link (no email is sent)'}
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
                              onClick={() => startEdit(r)}
                              disabled={disabled || !!r.linked || linking === r.id}
                              aria-label={`Edit ${r.name}`}
                              title={r.linked ? 'Invited by link — the invitation already uses this name and email' : 'Edit'}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
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
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr><td colSpan={4} className="tf-td text-center tf-body-muted">No one matches your search.</td></tr>
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
