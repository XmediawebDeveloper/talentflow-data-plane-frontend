/**
 * Export Utilities
 * Functions for exporting data to CSV and PDF
 */
import { formatIST } from '@/lib/utils/dateUtils';

export interface ExportColumn {
  key: string;
  header: string;
  formatter?: (value: any) => string;
}

/**
 * Export data to CSV format
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn[],
  filename: string
): void {
  if (data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Build header row
  const headers = columns.map((col) => `"${col.header}"`).join(',');

  // Build data rows
  const rows = data.map((item) => {
    return columns
      .map((col) => {
        let value = getNestedValue(item, col.key);
        if (col.formatter) {
          value = col.formatter(value);
        }
        // Escape quotes and wrap in quotes
        if (value === null || value === undefined) {
          return '""';
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  // Combine headers and rows
  const csv = [headers, ...rows].join('\n');

  // Create and download file
  downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Formats an Export can offer (see `ExportFormatModal`). Every Export offers
 * csv / xlsx; 'pdf' and 'txt' are opt-in and written by the caller.
 */
export type ExportFileFormat = 'csv' | 'xlsx' | 'pdf' | 'txt';

/**
 * Export a header row + value rows as a real .xlsx workbook (ExcelJS, loaded
 * on demand) — bold shaded header, hairline borders, widths fitted to the
 * longest value (capped), header frozen. Same layout ScoredResumesTable's
 * Excel export established. `title` adds a title block above the table.
 */
export async function exportRowsToExcel(
  headers: string[],
  rows: unknown[][],
  filename: string,
  options: { sheetName?: string; title?: string } = {},
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  // Excel caps sheet names at 31 chars and forbids []:*?/\
  const sheetName = (options.sheetName || 'Export').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
  const sheet = workbook.addWorksheet(sheetName);

  if (options.title) {
    sheet.addRow([options.title]).font = { bold: true, size: 14 };
    sheet.addRow([`Exported: ${formatIST(new Date().toISOString())}`]);
    sheet.addRow([`Total Records: ${rows.length}`]);
    sheet.addRow([]);
  }

  const headerRow = sheet.addRow(headers);
  headerRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  });
  const asCell = (value: unknown) =>
    value === null || value === undefined ? '' : typeof value === 'number' || typeof value === 'boolean' || value instanceof Date ? value : String(value);
  rows.forEach(row => sheet.addRow(row.map(asCell)));

  const thin = { style: 'thin' as const, color: { argb: 'FFD0D0D0' } };
  for (let r = headerRow.number; r <= sheet.rowCount; r++) {
    sheet.getRow(r).eachCell({ includeEmpty: true }, cell => {
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  }
  headers.forEach((header, i) => {
    const longest = Math.max(header.length, ...rows.map(row => String(row[i] ?? '').length));
    sheet.getColumn(i + 1).width = Math.min(60, Math.max(10, longest + 2));
  });
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];

  const buffer = await workbook.xlsx.writeBuffer() as ArrayBuffer;
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${stripExtension(filename)}.xlsx`,
  );
}

/** Header row + value rows as a CSV download (quoted, BOM so Excel reads UTF-8). */
export function exportRowsToCSV(headers: string[], rows: unknown[][], filename: string): void {
  const quote = (value: unknown) =>
    value === null || value === undefined ? '""' : `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(row => row.map(quote).join(',')).join('\n');
  downloadFile('﻿' + csv, `${stripExtension(filename)}.csv`, 'text/csv;charset=utf-8;');
}

/** Plain-text download (UTF-8, so any script the transcript holds survives). */
export function exportTextFile(text: string, filename: string): void {
  downloadFile(text, `${stripExtension(filename)}.txt`, 'text/plain;charset=utf-8;');
}

/** One call for either table format — what an `ExportFormatModal`'s onExport usually does. */
export async function exportRows(
  format: ExportFileFormat,
  headers: string[],
  rows: unknown[][],
  filename: string,
  options: { sheetName?: string; title?: string } = {},
): Promise<void> {
  if (format === 'xlsx') await exportRowsToExcel(headers, rows, filename, options);
  else if (format === 'csv') exportRowsToCSV(headers, rows, filename);
  else throw new Error(`exportRows does not write ${format} files`);
}

/** `exportToCSV`'s column-config shape, in either format. */
export async function exportData<T extends Record<string, any>>(
  format: ExportFileFormat,
  data: T[],
  columns: ExportColumn[],
  filename: string,
  options: { sheetName?: string; title?: string } = {},
): Promise<void> {
  if (format === 'csv') {
    exportToCSV(data, columns, stripExtension(filename));
    return;
  }
  const rows = data.map(item => columns.map(col => {
    const value = getNestedValue(item, col.key);
    return col.formatter ? col.formatter(value) : value;
  }));
  await exportRowsToExcel(columns.map(col => col.header), rows, filename, options);
}

function stripExtension(filename: string): string {
  return filename.replace(/\.(csv|xlsx?|json)$/i, '');
}

/**
 * Export data to JSON format
 */
export function exportToJSON<T>(data: T[], filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `${filename}.json`, 'application/json');
}

/**
 * Helper to get nested object values
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

/**
 * Helper to download a file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format team usage data for export
 */
export function formatTeamUsageForExport(teams: any[]): any[] {
  return teams.map((team) => ({
    team_name: team.team_name || 'Unknown',
    resume_scoring_units: team.by_type?.RS?.total_consumed || 0,
    resume_scoring_actions: team.by_type?.RS?.consumption_count || 0,
    assessment_units: team.by_type?.AS?.total_consumed || 0,
    assessment_actions: team.by_type?.AS?.consumption_count || 0,
    ai_interview_units: team.by_type?.AIU?.total_consumed || 0,
    ai_interview_actions: team.by_type?.AIU?.consumption_count || 0,
    resume_upload_units: team.by_type?.RU?.total_consumed || 0,
    resume_upload_actions: team.by_type?.RU?.consumption_count || 0,
    jds_created: team.jds_created || 0,
    assessments_created: team.assessments_created || 0,
    total_units:
      (team.by_type?.RS?.total_consumed || 0) +
      (team.by_type?.AS?.total_consumed || 0) +
      (team.by_type?.AIU?.total_consumed || 0) +
      (team.by_type?.RU?.total_consumed || 0),
  }));
}

/**
 * Format team member usage data for export
 */
export function formatMemberUsageForExport(members: any[]): any[] {
  return members.map((member) => ({
    name: member.user_name,
    email: member.user_email,
    resume_scoring_units: member.by_type?.RS?.total_consumed || 0,
    resume_scoring_actions: member.by_type?.RS?.consumption_count || 0,
    assessment_units: member.by_type?.AS?.total_consumed || 0,
    assessment_actions: member.by_type?.AS?.consumption_count || 0,
    ai_interview_units: member.by_type?.AIU?.total_consumed || 0,
    ai_interview_actions: member.by_type?.AIU?.consumption_count || 0,
    resume_upload_units: member.by_type?.RU?.total_consumed || 0,
    resume_upload_actions: member.by_type?.RU?.consumption_count || 0,
    jds_created: member.jds_created || 0,
    assessments_created: member.assessments_created || 0,
    total_units: member.total_consumed,
    total_actions: member.total_actions,
    last_activity: member.last_activity ? formatIST(member.last_activity) : 'Never',
  }));
}

/**
 * Team usage export columns
 */
// Units for the four unit modules (each is 1 unit per action, so no Actions columns).
export const TEAM_USAGE_COLUMNS: ExportColumn[] = [
  { key: 'team_name', header: 'Team Name' },
  { key: 'resume_upload_units', header: 'Resume Units' },
  { key: 'resume_scoring_units', header: 'Resume Scoring' },
  { key: 'assessment_units', header: 'AI Assessment' },
  { key: 'ai_interview_units', header: 'AI Interview' },
  { key: 'total_units', header: 'Total Units' },
];

/**
 * Member usage export columns
 */
export const MEMBER_USAGE_COLUMNS: ExportColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email' },
  { key: 'resume_scoring_units', header: 'Resume Scoring (Units)' },
  { key: 'resume_scoring_actions', header: 'Resume Scoring (Actions)' },
  { key: 'assessment_units', header: 'Assessment (Units)' },
  { key: 'assessment_actions', header: 'Assessment (Actions)' },
  { key: 'ai_interview_units', header: 'AI Interview (Units)' },
  { key: 'ai_interview_actions', header: 'AI Interview (Actions)' },
  { key: 'resume_upload_units', header: 'Resume Units (Units)' },
  { key: 'resume_upload_actions', header: 'Resume Units (Actions)' },
  { key: 'jds_created', header: 'JDs Created' },
  { key: 'assessments_created', header: 'Assessments Created' },
  { key: 'total_units', header: 'Total Units' },
  { key: 'total_actions', header: 'Total Actions' },
  { key: 'last_activity', header: 'Last Activity' },
];
