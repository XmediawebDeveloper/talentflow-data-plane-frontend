'use client';

import AppModal, { type AppModalTone } from '@/components/ui/app-modal';
import { useEffect, useState } from 'react';
import { Download, FileDown, FileSpreadsheet, FileText, FileType2, Info, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import type { ExportFileFormat } from '@/lib/utils/exportUtils';

export type { ExportFileFormat };

interface ExportFormatModalProps {
  open: boolean;
  onClose: () => void;
  /** Heading, e.g. "Export Scored Resumes". */
  title?: string;
  /** Rows going into the file — shown under the heading. */
  recordCount?: number;
  /** "selected" when the export is the current selection, not the whole list. */
  selected?: boolean;
  /** Column headers in the file — listed in the "Columns included" note. */
  columns?: string[];
  /**
   * Opt-in: make "Columns included" a checkbox picker (Resume Scoring's
   * export) instead of a plain list. The picks are remembered in
   * localStorage under this key, and handed to `onExport`.
   */
  columnPrefsKey?: string;
  /** With `columnPrefsKey`: the columns left unticked until the user picks. */
  defaultOffColumns?: string[];
  /**
   * Writes the file in the picked format. May be async; the modal shows a
   * spinner meanwhile and closes once it resolves. A thrown error keeps the
   * modal open and toasts, so the caller doesn't need its own try/catch.
   * `pickedColumns` (with `columnPrefsKey`) is the ticked headers, in order.
   */
  onExport: (format: ExportFileFormat, pickedColumns?: string[]) => void | Promise<void>;
  defaultFormat?: ExportFileFormat;
  /** Formats offered, in order. 'pdf' / 'txt' are opt-in — the caller's onExport must write them. */
  formats?: ExportFileFormat[];
  /** Header style (AppModal tone) — `plain` on pages with white popup headers (Teams). */
  tone?: AppModalTone;
}

const FORMATS: { value: ExportFileFormat; label: string; hint: string; icon: typeof FileText; iconWrap: string; iconColor: string }[] = [
  {
    value: 'csv',
    label: 'CSV Format',
    hint: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.',
    icon: FileText,
    iconWrap: 'bg-success-subtle',
    iconColor: 'text-success',
  },
  {
    value: 'xlsx',
    label: 'Excel Format (.xlsx)',
    hint: 'Native Excel format with formatting and styling.',
    icon: FileSpreadsheet,
    iconWrap: 'bg-blue-100 dark:bg-blue-500/15',
    iconColor: 'text-blue-700 dark:text-blue-300',
  },
  {
    value: 'pdf',
    label: 'PDF Format',
    hint: 'Print-ready document, easy to share or attach.',
    icon: FileType2,
    iconWrap: 'bg-red-100 dark:bg-red-500/15',
    iconColor: 'text-red-600 dark:text-red-300',
  },
  {
    value: 'txt',
    label: 'Text Format (.txt)',
    hint: 'Plain text that opens anywhere — Notepad, email, any editor.',
    icon: ScrollText,
    iconWrap: 'bg-gray-100 dark:bg-slate-700',
    iconColor: 'text-gray-600 dark:text-slate-300',
  },
];

const FORMAT_NAMES: Record<ExportFileFormat, string> = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF', txt: 'text' };

/**
 * The CSV / Excel picker every Export opens — the design ScoredResumesTable's
 * own export modal established, shared so each list doesn't re-implement it.
 */
export default function ExportFormatModal({
  open,
  onClose,
  title = 'Export',
  recordCount,
  selected = false,
  columns,
  columnPrefsKey,
  defaultOffColumns,
  onExport,
  defaultFormat = 'csv',
  formats = ['csv', 'xlsx'],
  tone,
}: ExportFormatModalProps) {
  const [format, setFormat] = useState<ExportFileFormat>(defaultFormat);
  const [exporting, setExporting] = useState(false);
  const pickable = !!columnPrefsKey && !!columns && columns.length > 0;
  // Header -> ticked. Read from the remembered picks on every open.
  const [picks, setPicks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !pickable) return;
    let saved: Record<string, boolean> = {};
    try {
      const raw = localStorage.getItem(columnPrefsKey!);
      if (raw) saved = JSON.parse(raw) as Record<string, boolean>;
    } catch { /* ignore */ }
    const off = new Set(defaultOffColumns ?? []);
    setPicks(Object.fromEntries(columns!.map(c => [c, saved[c] !== undefined ? saved[c] : !off.has(c)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pickable, columnPrefsKey]);

  const updatePicks = (next: Record<string, boolean>) => {
    setPicks(next);
    try { localStorage.setItem(columnPrefsKey!, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const pickedColumns = pickable ? columns!.filter(c => picks[c]) : columns ?? [];
  const allPicked = pickable && pickedColumns.length === columns!.length;

  // Fresh choice on every open.
  useEffect(() => {
    if (open) {
      setFormat(defaultFormat);
      setExporting(false);
    }
  }, [open, defaultFormat]);

  // Escape closes via AppModal (disabled while exporting).

  if (!open) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(format, pickable ? pickedColumns : undefined);
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(`Failed to export to ${FORMAT_NAMES[format]}`);
    } finally {
      setExporting(false);
    }
  };

  const subtitle = (recordCount !== undefined || (columns && columns.length > 0)) ? (
    <span className="flex items-center gap-1.5">
      {recordCount !== undefined && `${recordCount}${selected ? ' selected' : ''} record${recordCount === 1 ? '' : 's'}`}
      {recordCount !== undefined && columns && columns.length > 0 && <span className="w-1 h-1 rounded-full bg-white/70" />}
      {columns && columns.length > 0 && `${pickedColumns.length} columns`}
    </span>
  ) : undefined;

  return (
    <AppModal
      open={open}
      onCancel={onClose}
      tone={tone}
      cancelDisabled={exporting}
      size="md"
      icon={<FileDown />}
      title={title}
      subtitle={subtitle}
      actions={[
        {
          label: exporting ? 'Exporting...' : 'Export',
          onClick: () => void handleExport(),
          disabled: exporting || (pickable && pickedColumns.length === 0),
          loading: exporting,
          icon: <Download className="w-4 h-4" />,
        },
      ]}
    >
          <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mb-3">Choose export format</p>
          <div className="space-y-3" role="radiogroup" aria-label="Export format">
            {FORMATS.filter(option => formats.includes(option.value)).map(option => {
              const active = format === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFormat(option.value)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                    active
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10'
                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${option.iconWrap}`}>
                    <option.icon className={`w-6 h-6 ${option.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 dark:text-slate-100">{option.label}</div>
                    <div className="tf-body-muted">{option.hint}</div>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${active ? 'border-blue-600' : 'border-gray-300 dark:border-slate-600'}`}>
                    {active && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                  </span>
                </button>
              );
            })}
          </div>

          {pickable && (
            /* Columns included — picked here, per export. Remembered for next time. */
            <div className="mt-4 p-4 bg-blue-50/60 dark:bg-blue-500/10 rounded-xl">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="flex items-center gap-2 text-sm font-bold text-blue-700 dark:text-blue-300">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-300 flex-shrink-0" />
                  Columns included
                </span>
                <button
                  type="button"
                  onClick={() => updatePicks(Object.fromEntries(columns!.map(c => [c, !allPicked])))}
                  className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 hover:underline"
                >
                  {allPicked ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="tf-grid-2">
                {columns!.map(col => (
                  <label key={col} className="flex items-center gap-2 tf-body cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={!!picks[col]}
                      onChange={() => updatePicks({ ...picks, [col]: !picks[col] })}
                      className="tf-checkbox focus:ring-blue-500"
                    />
                    <span className="truncate">{col}</span>
                  </label>
                ))}
              </div>
              {pickedColumns.length === 0 && (
                <p className="mt-2 text-xs text-red-600">Select at least one column to export.</p>
              )}
            </div>
          )}

          {!pickable && columns && columns.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50/60 dark:bg-blue-500/10 rounded-xl flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-300 flex-shrink-0 mt-0.5" />
              <p className="tf-body-secondary">
                <span className="block font-bold text-blue-700 dark:text-blue-300 mb-0.5">Columns included</span>
                {columns.join(', ')}
              </p>
            </div>
          )}
    </AppModal>
  );
}
