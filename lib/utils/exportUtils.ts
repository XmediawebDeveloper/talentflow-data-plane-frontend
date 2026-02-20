/**
 * Export Utilities
 * Functions for exporting data to CSV and PDF
 */

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
  const blob = new Blob([content], { type: mimeType });
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
    last_activity: member.last_activity || 'Never',
  }));
}

/**
 * Team usage export columns
 */
export const TEAM_USAGE_COLUMNS: ExportColumn[] = [
  { key: 'team_name', header: 'Team Name' },
  { key: 'resume_scoring_units', header: 'Resume Scoring (Units)' },
  { key: 'resume_scoring_actions', header: 'Resume Scoring (Actions)' },
  { key: 'assessment_units', header: 'Assessment (Units)' },
  { key: 'assessment_actions', header: 'Assessment (Actions)' },
  { key: 'ai_interview_units', header: 'AI Interview (Units)' },
  { key: 'ai_interview_actions', header: 'AI Interview (Actions)' },
  { key: 'resume_upload_units', header: 'Resume Upload (Units)' },
  { key: 'resume_upload_actions', header: 'Resume Upload (Actions)' },
  { key: 'jds_created', header: 'JDs Created' },
  { key: 'assessments_created', header: 'Assessments Created' },
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
  { key: 'resume_upload_units', header: 'Resume Upload (Units)' },
  { key: 'resume_upload_actions', header: 'Resume Upload (Actions)' },
  { key: 'jds_created', header: 'JDs Created' },
  { key: 'assessments_created', header: 'Assessments Created' },
  { key: 'total_units', header: 'Total Units' },
  { key: 'total_actions', header: 'Total Actions' },
  { key: 'last_activity', header: 'Last Activity' },
];
