'use client';

/* Support desk — the reply box: Use Template (grouped), the reply tip,
   Attach file (5 files per upload, 10 MB in total, 25 per ticket, no
   videos — lib/supportAttachments), Bold, Italic, bulleted / numbered list,
   link, emoji, and the chosen files as removable chips. The text is kept as
   a per-ticket draft (survives switching tickets and a reload). Ctrl/⌘ +
   Enter sends. */

import { useRef, useState } from 'react';
import { Bold, FileText, Info, Italic, Link2, List, ListOrdered, Loader2, Paperclip, Send, Smile, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useReplyDraft } from '@/lib/hooks/useReplyDraft';
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_MAX_FILES, ATTACHMENT_MAX_PER_TICKET, acceptAttachmentFiles, formatBytes,
} from '@/lib/supportAttachments';
import type { Scope } from './model';

const EMOJI_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Smileys', items: ['😀', '😊', '🙂', '😉', '😅', '😂', '🤔', '😐', '😕', '😟', '😢', '😡'] },
  { group: 'Gestures', items: ['👍', '👎', '👏', '🙏', '👋', '🙌', '🤝', '💪'] },
  { group: 'Symbols', items: ['✅', '❌', '⚠️', '❗', '❓', '💡', '🔥', '⭐', '🎉', '🚀', '📌', '📎', '⏳', '🐞', '🔒', '❤️'] },
];
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

/* The reply templates ("Use Template"). The requester's and the support
   user's lists are the same; the admin answering a team ticket has its own. */
const REQUESTER_TEMPLATES = [
  {
    group: 'Follow up',
    items: [
      { label: 'Request a status update', text: 'Hi team,\n\nFollowing up on this ticket — could you share an update on the status?\n\nThanks' },
      { label: 'Still facing the issue', text: 'Hi team,\n\nI am still facing this issue. It is affecting our work, so a quick update would be appreciated.\n\nThanks' },
      { label: 'Ask for an ETA', text: 'Hi team,\n\nCould you let me know the expected timeline for a fix?\n\nThanks' },
      { label: 'Request a call back', text: 'Hi team,\n\nIt would be easier to explain this on a call. Could someone from support reach out at a convenient time?\n\nThanks' },
    ],
  },
  {
    group: 'Share details',
    items: [
      { label: 'Steps to reproduce', text: 'Additional details:\n- Steps to reproduce:\n  1. \n  2. \n  3. \n- Expected result:\n- Actual result:' },
      { label: 'Error message', text: 'I am seeing the following error message:\n\n"<paste the error here>"\n\nIt appears when I:' },
      { label: 'Environment details', text: 'Environment details:\n- Browser and version:\n- Operating system:\n- Device (desktop / mobile):\n- Time the issue occurred:' },
      { label: 'Affected records', text: 'This issue affects the following records:\n- Job / candidate / assessment name or ID:\n- Number of records affected:' },
      { label: 'How often it happens', text: 'How often this happens:\n- Every time / sometimes / once:\n- Started on (date):\n- Anything that changed before it started:' },
    ],
  },
  {
    group: 'Wrap up',
    items: [
      { label: 'Issue resolved', text: 'Thanks for the help — the issue is resolved on my side. You can close this ticket.' },
      { label: 'Workaround is fine', text: 'Thanks — the suggested workaround works for now. Please keep this ticket open until a permanent fix is available.' },
      { label: 'Thank the team', text: 'Thank you for the quick support. Much appreciated!' },
    ],
  },
];
const ADMIN_TEMPLATES = [
  {
    group: 'Acknowledge',
    items: [
      { label: 'Looking into it', text: 'Hi,\n\nThanks for raising this. I am looking into it and will update you shortly.' },
      { label: 'Assigned to me', text: 'Hi,\n\nI have picked up this ticket and will be handling it from here.' },
      { label: 'Investigating', text: 'Hi,\n\nWe are still investigating this. I will share an update as soon as I have more information.' },
    ],
  },
  {
    group: 'Ask for details',
    items: [
      { label: 'Need more details', text: 'Hi,\n\nCould you share a few more details?\n- What were you trying to do?\n- What happened instead?\n- When did it start?' },
      { label: 'Steps to reproduce', text: 'Hi,\n\nCould you list the exact steps that lead to this issue?\n1. \n2. \n3. ' },
      { label: 'Error message', text: 'Hi,\n\nCould you paste the exact error message you see, if any?' },
    ],
  },
  {
    group: 'Access & permissions',
    items: [
      { label: 'Access granted', text: 'Hi,\n\nThe requested access has been granted. Please sign out and sign back in, then let me know if it works.' },
      { label: 'Needs approval', text: 'Hi,\n\nThis request needs approval from your manager. I will update you once it is approved.' },
    ],
  },
  {
    group: 'Wrap up',
    items: [
      { label: 'Resolved — please confirm', text: 'Hi,\n\nThis should now be resolved. Please confirm on your side, and reply here if anything is still not working.' },
      { label: 'Closing (no response)', text: 'Hi,\n\nI have not heard back for a while, so I will close this ticket. Feel free to reopen it if you still need help.' },
    ],
  },
];

const toolBtn = 'flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';

export default function ReplyBox({ scope, draftKey, onTicket, onSend }: {
  scope: Scope;
  /** `${userId}:${area}:${ticketId}` — the per-ticket draft. */
  draftKey: string | null;
  /** Attachments already on the ticket (the 25-per-ticket limit). */
  onTicket: number;
  /** Resolves true when it was sent (the box then clears). */
  onSend: (input: { text: string; files: File[] }) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [tip, setTip] = useState(true);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  // Where the caret / selection was, so toolbar inserts land there.
  const sel = useRef<{ start: number; end: number } | null>(null);
  useReplyDraft(draftKey, text, setText);
  const templates = scope === 'team' ? ADMIN_TEMPLATES : REQUESTER_TEMPLATES;

  const edit = (build: (v: string, s: number, e: number) => { text: string; selStart: number; selEnd: number }) => {
    const len = text.length;
    const s = Math.min(sel.current?.start ?? len, len);
    const e = Math.min(Math.max(sel.current?.end ?? len, s), len);
    const r = build(text, s, e);
    setText(r.text);
    sel.current = { start: r.selStart, end: r.selEnd };
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(r.selStart, r.selEnd); });
  };
  const wrap = (before: string, after: string, placeholder: string) =>
    edit((v, s, e) => {
      const chosen = v.slice(s, e) || placeholder;
      return { text: v.slice(0, s) + before + chosen + after + v.slice(e), selStart: s + before.length, selEnd: s + before.length + chosen.length };
    });
  const prefixLines = (prefix: (i: number) => string) =>
    edit((v, s, e) => {
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      const updated = v.slice(lineStart, e).split('\n').map((line, i) => prefix(i) + line).join('\n');
      return { text: v.slice(0, lineStart) + updated + v.slice(e), selStart: lineStart + updated.length, selEnd: lineStart + updated.length };
    });
  const insert = (snippet: string) =>
    edit((v, s, e) => ({ text: v.slice(0, s) + snippet + v.slice(e), selStart: s + snippet.length, selEnd: s + snippet.length }));

  const canSend = (!!text.trim() || files.length > 0) && !sending;
  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const ok = await onSend({ text: text.trim(), files });
    setSending(false);
    if (ok) {
      setText('');
      setFiles([]);
      sel.current = null;
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      {tip && scope !== 'team' && (
        <div className="mb-3 flex items-start gap-2.5 rounded-lg bg-success-subtle px-3 py-2 text-xs text-success-strong">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span className="flex-1">Keep the conversation updated with additional details to help {scope === 'support' ? 'us' : 'your administrator'} resolve the issue faster.</span>
          <button type="button" aria-label="Dismiss tip" onClick={() => setTip(false)} className="shrink-0 rounded p-0.5 hover:bg-success/10"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{scope === 'team' ? 'Reply to User' : 'Add a Reply'}</span>
        <div className="relative">
          <button type="button" onClick={() => { setTemplatesOpen(o => !o); setEmojiOpen(false); }} aria-expanded={templatesOpen}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline">
            <FileText className="h-4 w-4" />Use Template
          </button>
          {templatesOpen && (
            <>
              <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setTemplatesOpen(false)} />
              <div className="absolute bottom-full right-0 z-20 mb-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {templates.map(g => (
                  <div key={g.group} className="py-1">
                    <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{g.group}</p>
                    {g.items.map(t => (
                      <button key={t.label} type="button" title={t.text}
                        onClick={() => {
                          setText(prev => (prev.trim() ? `${prev.trimEnd()}\n\n${t.text}` : t.text));
                          sel.current = null; // the next insert goes to the end
                          setTemplatesOpen(false);
                          requestAnimationFrame(() => area.current?.focus());
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-brand-blue dark:text-slate-300 dark:hover:bg-slate-800">
                        {t.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <textarea
        ref={area}
        value={text}
        onChange={e => setText(e.target.value)}
        onSelect={e => { sel.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }}
        rows={3}
        placeholder="Type your message..."
        aria-label="Reply"
        disabled={sending}
        className="tf-textarea max-h-48 resize-y text-sm"
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <Paperclip className="h-3 w-3 shrink-0 text-brand-blue" />
              <span className="truncate" title={f.name}>{f.name}</span>
              <span className="shrink-0 rounded bg-brand-blue/10 px-1 text-[10px] font-semibold text-brand-blue">{(f.name.split('.').pop() || '').toUpperCase()}</span>
              <span className="shrink-0 text-gray-500">{formatBytes(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} disabled={sending} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700"><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5">
          <input ref={picker} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden"
            onChange={e => { const ok = acceptAttachmentFiles(Array.from(e.target.files || []), files, onTicket); if (ok.length) setFiles(prev => [...prev, ...ok]); e.target.value = ''; }} />
          <Tooltip content={`Up to ${ATTACHMENT_MAX_FILES} files per upload (10 MB in total), ${ATTACHMENT_MAX_PER_TICKET} per ticket · no videos`}>
            <button type="button" onClick={() => picker.current?.click()} disabled={sending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-brand-blue disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800">
              <Paperclip className="h-4 w-4" />Attach file
            </button>
          </Tooltip>
          <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-slate-700" />
          <button type="button" aria-label="Bold" title="Bold" onClick={() => wrap('**', '**', 'bold text')} className={toolBtn}><Bold className="h-4 w-4" /></button>
          <button type="button" aria-label="Italic" title="Italic" onClick={() => wrap('_', '_', 'italic text')} className={toolBtn}><Italic className="h-4 w-4" /></button>
          <button type="button" aria-label="Bulleted list" title="Bulleted list" onClick={() => prefixLines(() => '- ')} className={toolBtn}><List className="h-4 w-4" /></button>
          <button type="button" aria-label="Numbered list" title="Numbered list" onClick={() => prefixLines(i => `${i + 1}. `)} className={toolBtn}><ListOrdered className="h-4 w-4" /></button>
          <button type="button" aria-label="Insert link" title="Insert link" onClick={() => wrap('[', '](https://)', 'link text')} className={toolBtn}><Link2 className="h-4 w-4" /></button>
          <div className="relative">
            <button type="button" aria-label="Insert emoji" title="Insert emoji" aria-expanded={emojiOpen} onClick={() => { setEmojiOpen(o => !o); setTemplatesOpen(false); }} className={toolBtn}><Smile className="h-4 w-4" /></button>
            {emojiOpen && (
              <>
                <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setEmojiOpen(false)} />
                <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-[17.5rem] overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {EMOJI_GROUPS.map(g => (
                    <div key={g.group} className="mb-1.5 last:mb-0">
                      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{g.group}</p>
                      <div className="grid grid-cols-8 gap-0.5">
                        {g.items.map(em => (
                          <button key={em} type="button" aria-label={`Insert ${em}`} onClick={() => { insert(em); setEmojiOpen(false); }}
                            style={{ fontFamily: EMOJI_FONT }} className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none hover:bg-gray-100 dark:hover:bg-slate-800">{em}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <Button size="sm" onClick={() => void send()} disabled={!canSend}
          icon={sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} className="w-full sm:w-auto">
          {sending ? 'Sending…' : 'Send Reply'}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">Ctrl + Enter to send</p>
    </div>
  );
}
