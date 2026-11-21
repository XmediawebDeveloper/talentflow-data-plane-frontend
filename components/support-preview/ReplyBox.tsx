'use client';

/* Support tickets design preview — the reply box, with everything the live
   page's reply has: Use Template (grouped), the reply tip, Attach file (with
   the live limits: 5 files per upload, 10 MB in total, 25 per ticket, no
   videos), Bold, Italic, bulleted / numbered list, link, emoji, and the
   chosen files as removable chips. Ctrl/⌘ + Enter sends. TEST ONLY — the
   files are only listed, never uploaded. */

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bold, FileText, Info, Italic, Link2, List, ListOrdered, Paperclip, Send, Smile, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { REPLY_TEMPLATES, type Scope } from './data';

const EMOJI_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Smileys', items: ['😀', '😊', '🙂', '😉', '😅', '😂', '🤔', '😐', '😕', '😟', '😢', '😡'] },
  { group: 'Gestures', items: ['👍', '👎', '👏', '🙏', '👋', '🙌', '🤝', '💪'] },
  { group: 'Symbols', items: ['✅', '❌', '⚠️', '❗', '❓', '💡', '🔥', '⭐', '🎉', '🚀', '📌', '📎', '⏳', '🐞', '🔒', '❤️'] },
];
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

/* The live page's attachment rules. */
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PER_TICKET = 25;
const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg', '.3gp', '.3g2', '.ogv', '.ts', '.mts', '.m2ts', '.vob'];
const ALLOWED_EXTS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.xlsx', '.csv', '.log', '.json', '.xml', '.yaml', '.yml', '.xls'];
const ACCEPT = ALLOWED_EXTS.join(',');
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

const toolBtn = 'flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';

export default function ReplyBox({ scope, onTicket, onSend }: {
  scope: Scope;
  /** Attachments already on the ticket (the 25-per-ticket limit). */
  onTicket: number;
  onSend: (input: { text: string; files: File[] }) => void;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [tip, setTip] = useState(true);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  // Where the caret / selection was, so toolbar inserts land there.
  const sel = useRef<{ start: number; end: number } | null>(null);

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

  const addFiles = (incoming: File[]) => {
    const accepted: File[] = [];
    let total = files.reduce((n, f) => n + f.size, 0);
    if (incoming.length > MAX_FILES) toast.error(`You can upload up to ${MAX_FILES} files at a time — only the first ${MAX_FILES} were considered`);
    for (const f of incoming) {
      const ext = f.name.includes('.') ? `.${f.name.split('.').pop()!.toLowerCase()}` : '';
      const chosen = files.length + accepted.length;
      if (VIDEO_EXTS.includes(ext) || f.type.startsWith('video/')) toast.error(`${f.name}: video files can't be attached`);
      else if (!ALLOWED_EXTS.includes(ext)) toast.error(`${f.name}: this file type can't be attached`);
      else if (onTicket + chosen >= MAX_PER_TICKET) { toast.error(`A ticket can have at most ${MAX_PER_TICKET} attachments`); break; }
      else if (chosen >= MAX_FILES) { if (incoming.length <= MAX_FILES) toast.error(`You can upload up to ${MAX_FILES} files at a time`); break; }
      else if (f.size > MAX_BYTES) toast.error(`${f.name} is ${kb(f.size)}. Attachments must be 10 MB or smaller — please choose a smaller file.`);
      else if (total + f.size > MAX_BYTES) toast.error(`${f.name}: the files together must be 10 MB or smaller`);
      else { accepted.push(f); total += f.size; }
    }
    if (accepted.length) setFiles(prev => [...prev, ...accepted]);
  };

  const canSend = !!text.trim() || files.length > 0;
  const send = () => {
    if (!canSend) return;
    onSend({ text: text.trim(), files });
    setText('');
    setFiles([]);
    sel.current = null;
  };

  return (
    <div className="border-t border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      {tip && scope === 'support' && (
        <div className="mb-3 flex items-start gap-2.5 rounded-lg bg-success-subtle px-3 py-2 text-xs text-success-strong">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span className="flex-1">Keep the conversation updated with additional details to help us resolve the issue faster.</span>
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
                {REPLY_TEMPLATES[scope].map(g => (
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
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
        rows={3}
        placeholder="Type your message..."
        aria-label="Reply"
        className="tf-textarea max-h-48 resize-y text-sm"
      />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <Paperclip className="h-3 w-3 shrink-0 text-brand-blue" />
              <span className="truncate" title={f.name}>{f.name}</span>
              <span className="shrink-0 rounded bg-brand-blue/10 px-1 text-[10px] font-semibold text-brand-blue">{(f.name.split('.').pop() || '').toUpperCase()}</span>
              <span className="shrink-0 text-gray-500">{kb(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700"><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5">
          <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden"
            onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          <Tooltip content={`Up to ${MAX_FILES} files per upload (10 MB in total), ${MAX_PER_TICKET} per ticket · no videos`}>
            <button type="button" onClick={() => picker.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-brand-blue dark:text-slate-400 dark:hover:bg-slate-800">
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
        <Button size="sm" onClick={send} disabled={!canSend} icon={<Send className="h-4 w-4" />} className="w-full sm:w-auto">Send Reply</Button>
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">Ctrl + Enter to send · preview only — nothing is sent or uploaded</p>
    </div>
  );
}
