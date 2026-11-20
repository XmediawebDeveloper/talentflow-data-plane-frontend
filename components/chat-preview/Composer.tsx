'use client';

/* Chat test page — the composer: reply / edit banners, @mentions, emoji,
   attachments (image, PDF, Word, Excel — picked locally, never uploaded),
   Enter to send, Shift+Enter for a new line. TEST ONLY. */

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AtSign, CornerUpLeft, Lock, Paperclip, Pencil, Send, Smile, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Attachment, Message, Person } from './types';
import { AttachmentIcon, Avatar, IconBtn, fileSize, kindOf } from './ui';
import { personById } from './useChatPreview';

const EMOJIS = ['😀', '😂', '😊', '😍', '🤔', '👍', '🙏', '🎉', '🔥', '✅', '👀', '💯', '🚀', '📌', '📎', '☕'];
const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv';
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_FILE = 10 * 1024 * 1024;

export interface ComposerHandle { addFiles: (files: FileList | File[]) => void; focus: () => void }

const Composer = forwardRef<ComposerHandle, {
  placeholder: string;
  members: Person[];
  meId: string;
  /** Read-only conversation (archived, or not allowed): why. */
  lockedReason?: string;
  replyTo?: Message | null;
  onCancelReply: () => void;
  /** Editing an own message — the composer starts with its text. */
  editing?: Message | null;
  onCancelEdit: () => void;
  onSend: (input: { text: string; attachments: Attachment[] }) => void;
  onSaveEdit: (text: string) => void;
}>(function Composer({ placeholder, members, meId, lockedReason, replyTo, onCancelReply, editing, onCancelEdit, onSend, onSaveEdit }, ref) {
  const [text, setText] = useState(editing?.text ?? '');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mention, setMention] = useState<{ q: string; index: number } | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  const addFiles = (list: FileList | File[]) => {
    const next: Attachment[] = [];
    Array.from(list).forEach(f => {
      const kind = kindOf(f.name, f.type);
      if (!/\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|csv)$/i.test(f.name)) { toast.error(`${f.name}: only images, PDF, Word or Excel files`); return; }
      if (kind === 'image' ? f.size > MAX_IMAGE : f.size > MAX_FILE) { toast.error(`${f.name} is over ${kind === 'image' ? '5' : '10'} MB`); return; }
      next.push({ id: `att-${f.name}-${f.size}-${f.lastModified}`, kind, name: f.name, size: fileSize(f.size), url: kind === 'image' ? URL.createObjectURL(f) : undefined });
    });
    if (next.length) setFiles(prev => [...prev, ...next].slice(0, 5));
    area.current?.focus();
  };
  useImperativeHandle(ref, () => ({ addFiles, focus: () => area.current?.focus() }));

  const candidates = mention
    ? members.filter(p => p.id !== meId && p.name.toLowerCase().includes(mention.q.toLowerCase())).slice(0, 6)
    : [];

  const onChange = (v: string) => {
    setText(v);
    const caret = area.current?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = /(^|\s)@(\w*)$/.exec(before);
    setMention(m ? { q: m[2], index: 0 } : null);
  };
  const pickMention = (p: Person) => {
    const caret = area.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@(\w*)$/, `@${p.name.split(' ')[0]} `);
    setText(before + text.slice(caret));
    setMention(null);
    area.current?.focus();
  };

  const submit = () => {
    if (editing) {
      if (!text.trim()) return;
      onSaveEdit(text);
      return;
    }
    if (!text.trim() && !files.length) return;
    onSend({ text, attachments: files });
    setText('');
    setFiles([]);
  };

  if (lockedReason) {
    return (
      <div className="flex shrink-0 items-center justify-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900">
        <Lock className="h-4 w-4 text-gray-400" />{lockedReason}
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900 @min-[768px]:p-3">
      <div className="relative rounded-xl border border-gray-200 bg-white focus-within:border-brand-blue/40 focus-within:ring-2 focus-within:ring-brand-blue/15 dark:border-slate-700 dark:bg-slate-900">
        {/* Reply / edit banner */}
        {(replyTo || editing) && (
          <div className="flex items-start gap-2 border-b border-gray-100 px-3 py-2">
            {editing ? <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" /> : <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />}
            <span className="min-w-0 flex-1 text-xs">
              <span className="block font-semibold text-gray-800">{editing ? 'Editing message' : `Replying to ${replyTo!.authorId === meId ? 'yourself' : personById(replyTo!.authorId).name}`}</span>
              <span className="block truncate text-gray-500">{(editing ?? replyTo)!.text || (editing ?? replyTo)!.attachments?.[0]?.name}</span>
            </span>
            <IconBtn label={editing ? 'Cancel edit' : 'Cancel reply'} onClick={editing ? onCancelEdit : onCancelReply}><X className="h-4 w-4" /></IconBtn>
          </div>
        )}

        {/* Attachments waiting to be sent */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-gray-100 px-3 py-2">
            {files.map(f => (
              <span key={f.id} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 py-1 pl-1 pr-1.5">
                {f.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={f.url} alt="" className="h-8 w-8 rounded object-cover" />
                  : <AttachmentIcon kind={f.kind} className="h-8 w-8" />}
                <span className="min-w-0"><span className="block max-w-[9rem] truncate text-xs font-medium text-gray-800">{f.name}</span><span className="block text-[10px] text-gray-500">{f.size}</span></span>
                <button type="button" onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))} aria-label={`Remove ${f.name}`} className="rounded p-0.5 text-gray-400 hover:text-gray-700"><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        )}

        {/* @mention suggestions */}
        {mention && candidates.length > 0 && (
          <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-2 z-20 mb-1 w-64 max-w-[calc(100%-1rem)] rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {candidates.map((p, i) => (
              <li key={p.id}>
                <button type="button" role="option" aria-selected={i === mention.index} onMouseDown={e => { e.preventDefault(); pickMention(p); }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i === mention.index ? 'bg-brand-blue/10' : 'hover:bg-gray-50'}`}>
                  <Avatar person={p} size="xs" presence={false} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 text-[11px] text-gray-500">{p.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          ref={area}
          value={text}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (mention && candidates.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setMention(m => m && { ...m, index: (m.index + 1) % candidates.length }); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setMention(m => m && { ...m, index: (m.index - 1 + candidates.length) % candidates.length }); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(candidates[mention.index]); return; }
              if (e.key === 'Escape') { setMention(null); return; }
            }
            if (e.key === 'Escape' && editing) { onCancelEdit(); return; }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
          placeholder={editing ? 'Edit your message' : placeholder}
          aria-label="Message"
          className="block max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3.5 py-3 text-sm placeholder:text-gray-500 focus:outline-none [field-sizing:content]"
        />

        <div className="flex items-center gap-0.5 px-2 pb-2">
          <div className="relative">
            <IconBtn label="Insert emoji" active={showEmoji} onClick={() => setShowEmoji(v => !v)}><Smile className="h-4 w-4" /></IconBtn>
            {showEmoji && (
              <div className="absolute bottom-10 left-0 z-20 grid w-64 max-w-[80vw] grid-cols-8 gap-0.5 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => { setText(t => t + e); setShowEmoji(false); area.current?.focus(); }} className="flex h-7 w-7 items-center justify-center rounded-md text-lg hover:bg-gray-100">{e}</button>
                ))}
              </div>
            )}
          </div>
          {!editing && <IconBtn label="Attach image, PDF, Word or Excel (images 5 MB, files 10 MB)" onClick={() => picker.current?.click()}><Paperclip className="h-4 w-4" /></IconBtn>}
          <IconBtn label="Mention someone" onClick={() => { onChange(`${text}${text && !text.endsWith(' ') ? ' ' : ''}@`); area.current?.focus(); }}><AtSign className="h-4 w-4" /></IconBtn>
          <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <span className="ml-1 hidden truncate text-[11px] text-gray-400 @min-[1024px]:inline">Enter to send · Shift + Enter for a new line · @ to mention</span>
          {editing && <Button variant="secondary" size="sm" className="ml-auto h-8 px-3 text-xs" onClick={onCancelEdit}>Cancel</Button>}
          <Button variant="primary" size="sm" className={`${editing ? '' : 'ml-auto'} h-8 px-3 text-xs`} disabled={editing ? !text.trim() : !text.trim() && !files.length} onClick={submit}
            icon={editing ? undefined : <Send className="h-3.5 w-3.5" />}>
            {editing ? 'Save' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
});

export default Composer;
