'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, Download, FileText, FileImage, FileSpreadsheet, FileCode, Loader2, Info } from 'lucide-react';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_GROUPS,
  ATTACHMENT_MAX_FILES,
  acceptAttachmentFiles,
  fileExtension,
  formatBytes,
} from '@/lib/supportAttachments';

function iconFor(name: string) {
  const ext = fileExtension(name);
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return FileImage;
  if (['.csv', '.xlsx', '.xls'].includes(ext)) return FileSpreadsheet;
  if (['.json', '.xml', '.yaml', '.yml', '.log'].includes(ext)) return FileCode;
  return FileText;
}

function ExtBadge({ name }: { name: string }) {
  const ext = fileExtension(name).replace('.', '').toUpperCase() || 'FILE';
  return (
    <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
      {ext}
    </span>
  );
}

/**
 * Pick files for a new ticket or a reply: validates type / size / count
 * (max 5 at a time) and lists each file with its extension and a remove button.
 */
export function AttachmentPicker({
  files,
  onChange,
  onTicket = 0,
  disabled = false,
  compact = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  /** Files already on the ticket (25 max in total). */
  onTicket?: number;
  disabled?: boolean;
  /** Reply box: a single "Attach files" button instead of the drop area. */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showTypes, setShowTypes] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const full = files.length >= ATTACHMENT_MAX_FILES;

  const add = (picked: File[]) => {
    const ok = acceptAttachmentFiles(picked, files, onTicket);
    if (ok.length) onChange([...files, ...ok]);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ATTACHMENT_ACCEPT}
      className="hidden"
      disabled={disabled || full}
      onChange={(e) => {
        add(Array.from(e.target.files || []));
        e.target.value = '';
      }}
    />
  );

  const typesTable = showTypes && (
    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 text-xs dark:border-slate-700">
      {ATTACHMENT_GROUPS.map(g => (
        <div key={g.label} className="grid grid-cols-1 gap-1 border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-slate-700/60 sm:grid-cols-[1.2fr_1fr_1fr]">
          <span className="font-medium text-gray-800 dark:text-slate-200">{g.label}</span>
          <span className="text-gray-600 dark:text-slate-300">{g.exts.join(', ')}</span>
          <span className="text-gray-500 dark:text-slate-400">{g.examples}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {compact ? (
        <div className="flex flex-wrap items-center gap-2">
          {input}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || full}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Paperclip className="h-4 w-4" />
            Attach files
          </button>
          <span className="tf-meta">{files.length}/{ATTACHMENT_MAX_FILES} · 10 MB total</span>
          <button type="button" onClick={() => setShowTypes(v => !v)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            <Info className="h-3.5 w-3.5" /> Supported types
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!disabled) add(Array.from(e.dataTransfer.files || []));
          }}
          className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
            dragOver ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10' : 'border-gray-200 bg-gray-50/60 dark:border-slate-700 dark:bg-slate-800/30'
          }`}
        >
          {input}
          <Paperclip className="mx-auto mb-2 h-7 w-7 text-indigo-500/70" />
          <p className="tf-body">
            Drag files here or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || full}
              className="font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-400"
            >
              browse
            </button>
          </p>
          <p className="mt-1 tf-meta">
            Up to {ATTACHMENT_MAX_FILES} files at a time · 10 MB in total · screenshots, logs, configs, documents, spreadsheets
          </p>
          <button type="button" onClick={() => setShowTypes(v => !v)} className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            <Info className="h-3.5 w-3.5" /> {showTypes ? 'Hide' : 'Show'} supported file types
          </button>
        </div>
      )}
      {typesTable}

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => {
            const Icon = iconFor(file.name);
            return (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                <Icon className="h-4 w-4 shrink-0 text-indigo-500" />
                <span className="min-w-0 flex-1 truncate tf-body" title={file.name}>{file.name}</span>
                <ExtBadge name={file.name} />
                <span className="shrink-0 tf-meta">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                  title="Remove"
                  className="shrink-0 rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface TicketFile {
  id: string;
  file_name: string;
  file_size?: string | null;
  uploaded_by_name?: string | null;
}

/** Files already on a ticket, each downloadable. */
export function AttachmentList({
  files,
  onDownload,
  emptyText = 'No attachments on this ticket.',
}: {
  files: TicketFile[];
  onDownload: (file: TicketFile) => Promise<void>;
  emptyText?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!files.length) return <p className="py-3 tf-body-muted">{emptyText}</p>;
  return (
    <ul className="space-y-2">
      {files.map(file => {
        const Icon = iconFor(file.file_name);
        return (
          <li key={file.id} className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2 dark:border-slate-700">
            <Icon className="h-4 w-4 shrink-0 text-indigo-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate tf-body" title={file.file_name}>{file.file_name}</div>
              {file.uploaded_by_name && <div className="tf-meta">Added by {file.uploaded_by_name}</div>}
            </div>
            <ExtBadge name={file.file_name} />
            {file.file_size && <span className="shrink-0 tf-meta">{file.file_size}</span>}
            <button
              type="button"
              onClick={async () => {
                setBusy(file.id);
                try { await onDownload(file); } finally { setBusy(null); }
              }}
              aria-label={`Download ${file.file_name}`}
              title="Download"
              className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-slate-800"
            >
              {busy === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
