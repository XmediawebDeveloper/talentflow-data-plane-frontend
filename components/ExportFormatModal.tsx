'use client';

import { useEffect, useState } from 'react';
import { Download, FileDown, FileSpreadsheet, FileText, Info, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
   * Writes the file in the picked format. May be async; the modal shows a
   * spinner meanwhile and closes once it resolves. A thrown error keeps the
   * modal open and toasts, so the caller doesn't need its own try/catch.
   */
  onExport: (format: ExportFileFormat) => void | Promise<void>;
  defaultFormat?: ExportFileFormat;
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
];

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
  onExport,
  defaultFormat = 'csv',
}: ExportFormatModalProps) {
  const [format, setFormat] = useState<ExportFileFormat>(defaultFormat);
  const [exporting, setExporting] = useState(false);

  // Fresh choice on every open.
  useEffect(() => {
    if (open) {
      setFormat(defaultFormat);
      setExporting(false);
    }
  }, [open, defaultFormat]);

  // Escape closes, as every other modal in the app does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !exporting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, exporting, onClose]);

  if (!open) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(format);
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(`Failed to export to ${format === 'xlsx' ? 'Excel' : 'CSV'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6"
      onClick={() => { if (!exporting) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-format-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
              <FileDown className="w-5 h-5 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="min-w-0">
              <h3 id="export-format-modal-title" className="text-lg font-bold text-gray-900 dark:text-slate-50">{title}</h3>
              {(recordCount !== undefined || (columns && columns.length > 0)) && (
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                  {recordCount !== undefined && `${recordCount}${selected ? ' selected' : ''} record${recordCount === 1 ? '' : 's'}`}
                  {recordCount !== undefined && columns && columns.length > 0 && <span className="w-1 h-1 rounded-full bg-blue-500" />}
                  {columns && columns.length > 0 && `${columns.length} columns`}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={exporting}
            className="px-2 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mb-3">Choose export format</p>
          <div className="space-y-3" role="radiogroup" aria-label="Export format">
            {FORMATS.map(option => {
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
                    <div className="text-sm text-gray-500 dark:text-slate-400">{option.hint}</div>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${active ? 'border-blue-600' : 'border-gray-300 dark:border-slate-600'}`}>
                    {active && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                  </span>
                </button>
              );
            })}
          </div>

          {columns && columns.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50/60 dark:bg-blue-500/10 rounded-xl flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-300 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-600 dark:text-slate-300">
                <span className="block font-bold text-blue-700 dark:text-blue-300 mb-0.5">Columns included</span>
                {columns.join(', ')}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-slate-700 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleExport()}
            disabled={exporting}
            icon={exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          >
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  );
}
