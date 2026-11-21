'use client';

/* Support desk — create a ticket (My Support Tickets → TalentFlow support,
   My Requests → your administrator). Kept from the old form: subject (100)
   and description (1500) limits, a placeholder per category, priority
   guidance, starter templates, "include browser details", possible
   duplicates, attachments (lib/supportAttachments limits), an auto-saved
   draft per user (restored next time; cleared on submit, discard or
   logout), and Ctrl/⌘ + Enter to submit. */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Monitor, Paperclip, RefreshCw, X } from 'lucide-react';
import AppModal from '@/components/ui/app-modal';
import FilterSelect from '@/components/ui/filter-select';
import { showErrorToast } from '@/lib/utils/errorToast';
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_GROUPS, ATTACHMENT_MAX_FILES, acceptAttachmentFiles, formatBytes,
} from '@/lib/supportAttachments';
import { PRIORITY_GUIDANCE, categoriesOf, priorityOptions, type Priority, type Scope, type Ticket } from './model';
import { PRIORITY_STYLE } from './ui';

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 1500;
const DRAFT_PREFIX = 'tf-support-ticket-draft:';
const ENV_BLOCK_MARKER = '\n\n--- Browser details ---\n';

const CATEGORY_HINTS: Record<string, string> = {
  'resume-upload': 'Which file did you try to upload (type and size)? What happened — an error, or the upload never finished?',
  'job-posting': 'Which job is affected (title or ID)? What were you trying to do, and what happened instead?',
  'candidate-management': 'Which candidate or list is affected? What did you expect to see, and what did you see?',
  'assessment': 'Which assessment is affected (name or ID)? Is the issue when creating, sending, or reviewing results?',
  'billing': 'Please include the invoice number or payment date, the amount, and what looks wrong.',
  'technical': 'Describe the steps to reproduce, the expected result, the actual result, and any error message you see.',
  'feature-request': 'What would you like to do, and how would it help your hiring workflow?',
  'account-access': 'Which account is affected, and what happens when you try to sign in or open the page?',
  'permission-request': 'Which access do you need, for what, and for how long?',
  'feature-question': 'What are you trying to do, and where did you get stuck?',
  'bug-report': 'Steps to reproduce, the expected result, the actual result, and any error message.',
  'general-inquiry': 'How can your administrator help?',
};
const DESCRIPTION_TEMPLATES = [
  { label: 'Bug report', text: 'Steps to reproduce:\n1. \n2. \n3. \n\nExpected result:\n\nActual result:\n\nError message (if any):' },
  { label: 'Feature request', text: 'What I would like to do:\n\nWhy it would help:\n\nHow I do it today (workaround):' },
  { label: 'Billing question', text: 'Invoice number / payment date:\nAmount:\nWhat looks wrong:' },
  { label: 'Access or login issue', text: 'Affected user (name or email):\nWhat happens when signing in:\nWhen it started:' },
];

/** Readable browser / OS summary from the user agent (best effort). */
function describeEnvironment(): string {
  const ua = navigator.userAgent;
  const browser =
    /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` :
    /OPR\/(\d+)/.exec(ua) ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}` :
    /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` :
    /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` :
    /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+).*Safari/.exec(ua)![1]}` : 'Unknown browser';
  const os =
    /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return [`- Browser: ${browser}`, `- Operating system: ${os}`, `- Screen: ${window.screen.width}×${window.screen.height}`, `- Window: ${window.innerWidth}×${window.innerHeight}`].join('\n');
}
const titleWords = (text: string) => Array.from(new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3)));

interface Draft { title: string; description: string; category: string; priority: Priority }
const readDraft = (key: string | null): Draft | null => {
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};

export default function CreateTicketDialog({ scope, open, onClose, userId, recent, onCreate, onOpenTicket }: {
  scope: Scope;
  open: boolean;
  onClose: () => void;
  userId?: string;
  /** Loaded tickets — to spot a possible duplicate. */
  recent: Ticket[];
  onCreate: (input: Draft, files: File[]) => Promise<Ticket>;
  onOpenTicket: (t: Ticket) => void;
}) {
  // The support form keeps the old draft key; requests have their own.
  const draftKey = userId ? `${DRAFT_PREFIX}${scope === 'support' ? '' : 'requests:'}${userId}` : null;
  const [initial] = useState(() => readDraft(draftKey));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? (scope === 'support' ? 'technical' : 'general-inquiry'));
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [restored, setRestored] = useState(!!initial && !!(initial.title || initial.description));
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const picker = useRef<HTMLInputElement | null>(null);

  // Auto-save while typing (never deletes — only submit / discard / logout do).
  useEffect(() => {
    if (!draftKey || (!title.trim() && !description.trim())) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ title, description, category, priority, savedAt: new Date().toISOString() })); } catch { /* storage unavailable */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [draftKey, title, description, category, priority]);

  const clearDraft = () => { if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ } } };
  const discard = () => {
    clearDraft();
    setTitle(''); setDescription(''); setPriority('medium'); setFiles([]); setRestored(false);
  };

  const envIncluded = description.includes(ENV_BLOCK_MARKER);
  const toggleEnv = () => {
    const at = description.indexOf(ENV_BLOCK_MARKER);
    if (at >= 0) { setDescription(description.slice(0, at)); return; }
    const next = description.trimEnd() + ENV_BLOCK_MARKER + describeEnvironment();
    if (next.length > DESCRIPTION_MAX) { showErrorToast(null, `Description can be at most ${DESCRIPTION_MAX} characters`); return; }
    setDescription(next);
  };

  const words = titleWords(title);
  const similar = title.trim().length >= 4 && words.length > 0
    ? recent.filter(t => t.status !== 'closed' && titleWords(t.title).filter(w => words.includes(w)).length >= Math.min(2, words.length)).slice(0, 3)
    : [];

  const titleError = attempted && !title.trim() ? 'Enter a subject' : '';
  const descError = attempted && !description.trim() ? 'Describe the issue' : '';
  const submit = async () => {
    setAttempted(true);
    if (!title.trim() || !description.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreate({ title: title.trim(), description: description.trim(), category, priority }, files);
      clearDraft();
      onClose();
    } catch (e) {
      showErrorToast(e, "Couldn't create the ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal open={open} onCancel={() => { if (!submitting) onClose(); }} cancelDisabled={submitting} size="md" density="compact" tone="plain" mobileSheet
      icon={<FileText className="h-4 w-4" />}
      title={scope === 'support' ? 'Create Support Ticket' : 'Raise a Request'}
      subtitle={scope === 'support' ? 'Tell us about your issue or request. Our support team will get back to you as soon as possible.' : 'Your administrator will get back to you.'}
      actions={[{ label: submitting ? 'Submitting…' : 'Submit ticket', loading: submitting, disabled: submitting, onClick: () => void submit() }]}>
      <div className="space-y-4" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } }}>
        {restored ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-blue/[0.05] px-3 py-2 text-xs ring-1 ring-brand-blue/10 dark:bg-slate-800/60 dark:ring-slate-700">
            <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 shrink-0 text-brand-blue" />We restored your unsent draft.</span>
            <button type="button" onClick={discard} className="font-semibold text-brand-blue hover:underline">Discard draft</button>
          </div>
        ) : (title.trim() || description.trim()) && draftKey ? (
          <p className="flex items-center gap-1.5 text-xs text-gray-500"><CheckCircle2 className="h-3.5 w-3.5" />Draft saved automatically on this device</p>
        ) : null}

        <label className="block">
          <span className="mb-1 flex justify-between text-sm font-medium text-gray-800 dark:text-slate-200">Subject <span className="text-xs font-normal text-gray-500">{title.length}/{TITLE_MAX}</span></span>
          <input value={title} onChange={e => setTitle(e.target.value.slice(0, TITLE_MAX))} placeholder="Short summary of the issue" aria-invalid={!!titleError} className={`tf-input ${titleError ? 'border-destructive' : ''}`} />
          {titleError && <span className="mt-1 block text-xs text-destructive">{titleError}</span>}
        </label>
        {similar.length > 0 && (
          <div className="rounded-lg border border-warning-line bg-warning-subtle px-3 py-2 text-xs text-warning-strong">
            <p className="font-semibold">Similar open tickets — maybe add to one of these instead?</p>
            <ul className="mt-1 space-y-0.5">
              {similar.map(t => (
                <li key={t.id}><button type="button" onClick={() => onOpenTicket(t)} className="text-left underline-offset-2 hover:underline">#{t.number} · {t.title}</button></li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-800 dark:text-slate-200">Category</span>
            <FilterSelect ariaLabel="Category" value={category} onChange={setCategory} options={categoriesOf(scope)} className="h-9 w-full" />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-800 dark:text-slate-200">Priority</span>
            <div role="radiogroup" aria-label="Priority" className="flex gap-1">
              {priorityOptions(scope).map(p => (
                <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)}
                  className={`h-9 flex-1 rounded-lg border text-xs font-semibold transition-colors ${priority === p ? 'border-brand-blue bg-brand-blue text-white' : 'border-gray-200 text-gray-600 hover:border-brand-blue/40 dark:border-slate-700 dark:text-slate-300'}`}>
                  {PRIORITY_STYLE[p].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="-mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-slate-800 dark:text-slate-300">{PRIORITY_GUIDANCE[priority]}</p>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-gray-800 dark:text-slate-200">
            <span>Description</span>
            <span className="flex items-center gap-3">
              <span className="relative">
                <button type="button" onClick={() => setTemplatesOpen(o => !o)} aria-expanded={templatesOpen} className="text-xs font-medium text-brand-blue hover:underline">Use a template</button>
                {templatesOpen && (
                  <>
                    <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setTemplatesOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {DESCRIPTION_TEMPLATES.map(tpl => (
                        <button key={tpl.label} type="button" onClick={() => { setDescription(d => (d.trim() ? `${d.trimEnd()}\n\n${tpl.text}` : tpl.text).slice(0, DESCRIPTION_MAX)); setTemplatesOpen(false); }}
                          className="block w-full px-3 py-1.5 text-left text-sm font-normal text-gray-700 hover:bg-gray-50 hover:text-brand-blue dark:text-slate-300 dark:hover:bg-slate-800">{tpl.label}</button>
                      ))}
                    </div>
                  </>
                )}
              </span>
              <span className="text-xs font-normal text-gray-500">{description.length}/{DESCRIPTION_MAX}</span>
            </span>
          </div>
          <textarea value={description} onChange={e => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))} rows={6} aria-invalid={!!descError}
            placeholder={CATEGORY_HINTS[category] || 'Please provide detailed information about your issue.'} className={`tf-textarea resize-y ${descError ? 'border-destructive' : ''}`} />
          {descError && <span className="mt-1 block text-xs text-destructive">{descError}</span>}
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
            <input type="checkbox" checked={envIncluded} onChange={toggleEnv} className="h-4 w-4 rounded border-gray-300 accent-[var(--brand-blue)]" />
            <Monitor className="h-3.5 w-3.5" />Include my browser details (helps us reproduce the issue)
          </label>
        </div>

        <div>
          <input ref={picker} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden"
            onChange={e => { const ok = acceptAttachmentFiles(Array.from(e.target.files || []), files); if (ok.length) setFiles(p => [...p, ...ok]); e.target.value = ''; }} />
          <button type="button" onClick={() => picker.current?.click()} disabled={submitting}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-600 hover:border-brand-blue/50 hover:text-brand-blue dark:border-slate-600">
            <span className="inline-flex items-center gap-2 font-medium"><Paperclip className="h-4 w-4" />Click to attach files</span>
            <span className="text-xs text-gray-500">Up to {ATTACHMENT_MAX_FILES} files, 10 MB in total · {ATTACHMENT_GROUPS.map(g => g.examples).slice(0, 3).join(', ')}…</span>
          </button>
          {files.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  <Paperclip className="h-3 w-3 shrink-0 text-brand-blue" /><span className="truncate">{f.name}</span><span className="shrink-0 text-gray-500">{formatBytes(f.size)}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700"><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {submitting && <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating the ticket…</p>}
        <p className="text-[11px] text-gray-500">Ctrl + Enter to submit</p>
      </div>
    </AppModal>
  );
}
