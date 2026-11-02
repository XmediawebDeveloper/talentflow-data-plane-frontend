'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileDown, FileSpreadsheet, FileText, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatOverallScoreValue } from '@/lib/utils/matchStatus';
import { formatIST } from '@/lib/utils/dateUtils';
import { scoringService } from '@/lib/services/scoringService';
import type { ScoredResume } from './ScoredResumesTable';

/**
 * The "Export Scored Resumes" dialog — CSV or Excel, with the columns picked
 * in its "Columns included" section.
 *
 * Shared by Resume Scoring's two views: ScoredResumesTable (View by
 * Candidates, and a single job's page) and the job list (View by Job). Same
 * dialog, same remembered column picks, same file layout either way.
 */

// Remembered picks — which columns go into a CSV/XLS.
const EXPORT_COLUMN_PREFERENCES_KEY = 'scoredResumesExportColumns';

/* What an export can carry. `enabled` is the default pick; the user's own
   picks are remembered under EXPORT_COLUMN_PREFERENCES_KEY. */
const EXPORT_COLUMN_OPTIONS = [
  { id: 'candidateName', label: 'Candidate Name', enabled: true },
  { id: 'email', label: 'Email', enabled: true },
  { id: 'jdId', label: 'JD ID', enabled: true },
  { id: 'jobTitle', label: 'Job Title', enabled: true },
  { id: 'jobVersion', label: 'Job Version', enabled: true },
  { id: 'matchStatus', label: 'Match Status', enabled: true },
  { id: 'scorePercentage', label: 'Score out of 10', enabled: true },
  { id: 'version', label: 'Resume Version', enabled: true },
  { id: 'scoredDate', label: 'Scored By / Date', enabled: true },
  { id: 'phone', label: 'Phone', enabled: false },
  { id: 'experience', label: 'Experience', enabled: false },
  { id: 'education', label: 'Education', enabled: false },
  { id: 'certifications', label: 'Certifications', enabled: false },
];

// The global "View All Candidates" host passes a placeholder job id ('jd-1',
// 'global'), not a real backend id — guard the export-audit call (which sends
// it as an optional jd_id) so that placeholder never reaches the API.
const isUuid = (value?: string): value is string =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export interface ScoredResumesExportModalProps {
  /** Exactly the rows to export — the host has already applied its selection. */
  rows: ScoredResume[];
  /** Sheet heading ("<title> - Scored Resumes"). */
  title: string;
  /** The download's file name for a given extension ('csv' | 'xlsx'). */
  fileName: (ext: 'csv' | 'xlsx') => string;
  /** The JD ID cell for a row — the host knows its own fallback code. */
  rowJobCode: (r: ScoredResume) => string;
  /** Sent with the export audit event when it is a real JD id. */
  auditJdId?: string;
  onClose: () => void;
}

export default function ScoredResumesExportModal({
  rows,
  title,
  fileName,
  rowJobCode,
  auditJdId,
  onClose,
}: ScoredResumesExportModalProps) {
  const [exportFormat, setExportFormat] = useState<'csv' | 'xls'>('csv');
  const [exportColumnOptions, setExportColumnOptions] = useState(EXPORT_COLUMN_OPTIONS);
  const [exportColumnsLoaded, setExportColumnsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXPORT_COLUMN_PREFERENCES_KEY);
      if (saved) {
        const savedPrefs = JSON.parse(saved) as Record<string, boolean>;
        setExportColumnOptions(prev =>
          prev.map(col => ({
            ...col,
            enabled: savedPrefs[col.id] !== undefined ? savedPrefs[col.id] : col.enabled,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load export column preferences:', error);
    }
    setExportColumnsLoaded(true);
  }, []);

  useEffect(() => {
    if (!exportColumnsLoaded) return; // Don't save on initial load
    try {
      const prefs: Record<string, boolean> = {};
      exportColumnOptions.forEach(col => {
        prefs[col.id] = col.enabled;
      });
      localStorage.setItem(EXPORT_COLUMN_PREFERENCES_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.error('Failed to save export column preferences:', error);
    }
  }, [exportColumnOptions, exportColumnsLoaded]);

  const exportColumns = exportColumnOptions.filter(col => col.enabled);
  const toggleExportColumn = (id: string) =>
    setExportColumnOptions(prev => prev.map(col => (col.id === id ? { ...col, enabled: !col.enabled } : col)));
  const allExportColumnsOn = exportColumnOptions.every(col => col.enabled);
  const setAllExportColumns = (enabled: boolean) =>
    setExportColumnOptions(prev => prev.map(col => ({ ...col, enabled })));

  // Get cell value for export based on column ID
  const getCellValue = (resume: ScoredResume, columnId: string): string => {
    switch (columnId) {
      case 'candidateName':
        return resume.candidateName || '';
      case 'jdId':
        return rowJobCode(resume);
      case 'jobTitle':
        return resume.jobTitle || '';
      case 'jobVersion':
        return resume.jobVersion ? `v${resume.jobVersion}` : '';
      case 'version':
        return `v${resume.version || resume.resumeVersion || 1}`;
      case 'email':
        return resume.email || '';
      case 'phone':
        return resume.phone || '';
      case 'matchStatus':
        return resume.matchStatus || '';
      case 'scorePercentage':
        return formatOverallScoreValue(resume.overallRating10, resume.scorePercentage);
      case 'experience':
        return resume.experience || '';
      case 'education':
        return typeof resume.education === 'string'
          ? resume.education
          : Array.isArray(resume.education) && resume.education.length > 0
            ? (resume.education[0]?.degree || resume.education[0]?.institution || '')
            : '';
      case 'certifications':
        return resume.certifications?.map(cert =>
          typeof cert === 'string' ? cert : (cert?.name || '')
        ).join(', ') || '';
      case 'scoredDate':
        return `${resume.scoredBy || ''} — ${formatIST(resume.scoredDate)}`;
      default:
        return '';
    }
  };

  const triggerDownload = (blob: Blob, name: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    const headers = exportColumns.map(col => `"${col.label}"`).join(',');
    const lines = rows.map(resume =>
      exportColumns.map(col => {
        const value = getCellValue(resume, col.id);
        // Escape quotes and wrap in quotes
        return `"${value.replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csvContent = [headers, ...lines].join('\n');
    triggerDownload(new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' }), fileName('csv'));

    toast.success(`Exported ${rows.length} records to CSV`);
    onClose();
    scoringService.logClientExport('csv', rows.length, isUuid(auditJdId) ? auditJdId : undefined);
  };

  /* A real .xlsx workbook (ExcelJS, loaded on demand) — not an HTML table
     saved as ".xls", which Excel opens only after a format warning. */
  const exportToXLS = async () => {
    let buffer: ArrayBuffer;
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Scored Resumes');

      // Title block: job, export time, record count.
      sheet.addRow([`${title} - Scored Resumes`]).font = { bold: true, size: 14 };
      sheet.addRow([`Exported: ${formatIST(new Date().toISOString())}`]);
      sheet.addRow([`Total Records: ${rows.length}`]);
      sheet.addRow([]);

      const headerRow = sheet.addRow(exportColumns.map(col => col.label));
      headerRow.eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      });
      rows.forEach(resume => {
        sheet.addRow(exportColumns.map(col => getCellValue(resume, col.id)));
      });

      // Hairline borders on the table; widths fitted to the longest value (capped).
      const thin = { style: 'thin' as const, color: { argb: 'FFD0D0D0' } };
      for (let r = headerRow.number; r <= sheet.rowCount; r++) {
        sheet.getRow(r).eachCell({ includeEmpty: true }, cell => {
          cell.border = { top: thin, left: thin, bottom: thin, right: thin };
          cell.alignment = { vertical: 'top', wrapText: true };
        });
      }
      exportColumns.forEach((col, i) => {
        const longest = Math.max(
          col.label.length,
          ...rows.map(resume => String(getCellValue(resume, col.id) ?? '').length),
        );
        sheet.getColumn(i + 1).width = Math.min(60, Math.max(10, longest + 2));
      });
      sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];

      buffer = await workbook.xlsx.writeBuffer() as ArrayBuffer;
    } catch (error) {
      console.error('Excel export failed:', error);
      toast.error('Failed to export to Excel');
      return;
    }

    triggerDownload(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      fileName('xlsx'),
    );
    toast.success(`Exported ${rows.length} records to Excel`);
    onClose();
    scoringService.logClientExport('excel', rows.length, isUuid(auditJdId) ? auditJdId : undefined);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-6 border-b border-gray-200 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="hidden sm:flex w-11 h-11 rounded-full bg-blue-50 items-center justify-center flex-shrink-0">
              <FileDown className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-gray-900">Export Scored Resumes</h3>
              <p className="tf-body-muted mt-1 flex items-center gap-1.5">
                {rows.length} {rows.length === 1 ? 'record' : 'records'}
                <span className="w-1 h-1 rounded-full bg-blue-500" />
                {exportColumns.length} columns
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <p className="text-sm font-bold text-gray-900 mb-3">Choose export format</p>

          <div className="space-y-3">
            <button
              onClick={() => setExportFormat('csv')}
              className={`w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border-2 transition-all text-left ${
                exportFormat === 'csv'
                  ? 'border-blue-500 bg-blue-50/60'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-success-subtle rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900">CSV Format</div>
                <div className="tf-body-muted">Compatible with Excel, Google Sheets, and most spreadsheet apps.</div>
              </div>
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                exportFormat === 'csv' ? 'border-blue-600' : 'border-gray-300'
              }`}>
                {exportFormat === 'csv' && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
              </span>
            </button>

            <button
              onClick={() => setExportFormat('xls')}
              className={`w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border-2 transition-all text-left ${
                exportFormat === 'xls'
                  ? 'border-blue-500 bg-blue-50/60'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="w-6 h-6 text-blue-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900">Excel Format (.xlsx)</div>
                <div className="tf-body-muted">Native Excel format with formatting and styling.</div>
              </div>
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                exportFormat === 'xls' ? 'border-blue-600' : 'border-gray-300'
              }`}>
                {exportFormat === 'xls' && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
              </span>
            </button>
          </div>

          {/* Columns included — picked here, per export. Remembered for next time. */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {exportColumnOptions.map(col => (
                <label key={col.id} className="flex items-center gap-2 tf-body cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={col.enabled}
                    onChange={() => toggleExportColumn(col.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <span className="truncate">{col.label}</span>
                </label>
              ))}
            </div>
            {exportColumns.length === 0 && (
              <p className="mt-2 text-xs text-red-600">Select at least one column to export.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 px-4 py-4 sm:px-6 border-t border-gray-200 shrink-0">
          <Button variant="secondary" size="md" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => (exportFormat === 'csv' ? exportToCSV() : void exportToXLS())}
            disabled={exportColumns.length === 0 || rows.length === 0}
            icon={<Download className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
