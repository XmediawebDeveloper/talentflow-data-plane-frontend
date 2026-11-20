'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Download, FileDown, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalA11y } from '@/components/ui/modal-a11y';

/**
 * The Score Resume tab's Export popup (ScoredResumesExportModal) as a shell
 * any results table can fill: format cards, the "Columns included" checkbox
 * list with Select all / Clear all, then Cancel + Export. The host owns its
 * columns and its export logic — this only collects the format and the
 * ticked column ids (in the order listed) and hands them to `onExport`.
 *
 * Used by the Job Details Assessment Result and AI Interview Result tabs.
 * Mounted only while open, so each opening starts from `initialColumnIds`.
 * With no `columns` (a file that is not a table — the AI interview chat
 * transcript) it is just the format cards: no column count, no Columns box.
 */

export interface ExportFormatOption<F extends string> {
  key: F;
  title: string;
  description: string;
  Icon: LucideIcon;
  /** Icon tile background / icon colour classes. */
  iconWrap: string;
  iconColor: string;
}

export interface ExportColumnsModalProps<F extends string> {
  title: string;
  /** Records the export will carry; null while unknown. */
  recordCount: number | null;
  formats: ExportFormatOption<F>[];
  format: F;
  onFormatChange: (format: F) => void;
  /** Every column this table can export, in export order. Omitted: no column picking. */
  columns?: { id: string; label: string }[];
  /** The columns ticked when the popup opens (the table's Customize Columns). */
  initialColumnIds?: string[];
  /** What `recordCount` counts, singular / plural. Default record / records. */
  recordNoun?: [string, string];
  exporting?: boolean;
  onExport: (columnIds: string[]) => void;
  onClose: () => void;
}

export default function ExportColumnsModal<F extends string>({
  title,
  recordCount,
  formats,
  format,
  onFormatChange,
  columns = [],
  initialColumnIds = [],
  recordNoun = ['record', 'records'],
  exporting = false,
  onExport,
  onClose,
}: ExportColumnsModalProps<F>) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initialColumnIds));

  const hasColumns = columns.length > 0;
  const exportColumnIds = columns.filter(col => picked.has(col.id)).map(col => col.id);
  const allExportColumnsOn = columns.every(col => picked.has(col.id));
  const toggleExportColumn = (id: string) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAllExportColumns = (enabled: boolean) => setPicked(new Set(enabled ? columns.map(col => col.id) : []));

  return (
    <ModalA11y innerDialog><div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-columns-title"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <FileDown className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 id="export-columns-title" className="tf-section-title">{title}</h3>
              <p className="tf-body-muted mt-1 flex flex-wrap items-center gap-1.5">
                {recordCount != null && (
                  <>
                    {recordCount} {recordCount === 1 ? recordNoun[0] : recordNoun[1]}
                    {hasColumns && <span className="w-1 h-1 rounded-full bg-blue-500" />}
                  </>
                )}
                {hasColumns && `${exportColumnIds.length} columns`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <p className="text-sm font-bold text-gray-900 mb-3">Choose export format</p>

          <div className="space-y-3">
            {formats.map(({ key, title: formatTitle, description, Icon, iconWrap, iconColor }) => (
              <button
                key={key}
                type="button"
                onClick={() => onFormatChange(key)}
                disabled={exporting}
                aria-pressed={format === key}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed ${
                  format === key
                    ? 'border-blue-500 bg-blue-50/60'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${iconWrap}`}>
                  <Icon className={`w-6 h-6 ${iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-900">{formatTitle}</div>
                  <div className="tf-body-muted">{description}</div>
                </div>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  format === key ? 'border-blue-600' : 'border-gray-300'
                }`}>
                  {format === key && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                </span>
              </button>
            ))}
          </div>

          {/* Columns included — picked here, per export; the file's header
              row is these names, in this order. */}
          {hasColumns && (
          <div className="mt-4 p-4 bg-blue-50/60 rounded-xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="flex items-center gap-2 text-sm font-bold text-blue-700">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
                Columns included
              </span>
              <button
                type="button"
                onClick={() => setAllExportColumns(!allExportColumnsOn)}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
              >
                {allExportColumnsOn ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="tf-grid-2">
              {columns.map(col => (
                <label key={col.id} className="flex items-center gap-2 tf-body cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={picked.has(col.id)}
                    onChange={() => toggleExportColumn(col.id)}
                    className="tf-checkbox focus:ring-blue-500"
                  />
                  <span className="truncate" title={col.label}>{col.label}</span>
                </label>
              ))}
            </div>
            {exportColumnIds.length === 0 && (
              <p className="mt-2 text-xs text-red-600">Select at least one column to export.</p>
            )}
          </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 p-5 border-t border-gray-200 shrink-0">
          <Button variant="secondary" size="md" onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => onExport(exportColumnIds)}
            disabled={exporting || (hasColumns && exportColumnIds.length === 0) || recordCount === 0}
            icon={exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          >
            Export
          </Button>
        </div>
      </div>
    </div></ModalA11y>
  );
}
