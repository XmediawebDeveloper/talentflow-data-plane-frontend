'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { X, Clock, User, FileText, History, Loader2, ArrowLeft, Eye, Download, Calendar, MapPin, Briefcase } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { jdService, JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { formatIST } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import VersionCompareModal, { type CompareVersion } from './VersionCompareModal';
import { formatEmploymentType, formatIndustryType } from '@/lib/utils/jobOpeningDisplay';
import { formatSalaryRange } from '@/lib/utils/salary';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface JDVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdId: string;
  jdTitle: string;
  initialVersionNumber?: number;
  /**
   * Show a "Go to JD" button in the header that opens the job-details page
   * for the version on screen (the one being previewed, else `jdId`).
   * Opt-in: hosts that already have their own Go to JD leave it off.
   */
  showGoToJd?: boolean;
  /**
   * The job-details tab Go to JD lands on — the host's own module, e.g.
   * 'scored-resumes' from Resume Scoring, 'ai-talent-match' from AI Talent
   * Match. Omitted, it opens the page's default tab.
   */
  goToJdTab?: string;
  /** Swap the header's Close (X) icon for a Cancel button in the footer.
   *  Both just close the popup. */
  cancelInFooter?: boolean;
}

interface JDHistoryVersion {
  id: string;
  job_id?: string;
  version_number: number;
  title: string;
  description: string;
  status?: string;
  /* Republish signals, carried per version so the status label describes what
     was actually done to THIS version. `current_version` is the version's own
     publish counter (2 or more means it went live through a Republish);
     `republish_count` / `republished_at` are the backend's explicit record of
     the same action, and any one of them alone is enough. */
  current_version?: number;
  republish_count?: number;
  republished_at?: string | null;
  is_latest_version?: boolean;
  published_at?: string;
  created_at?: string;
  created_by_name?: string;
  department?: string;
  employment_type?: string;
  remote_type?: string;
  industry_type?: string;
  /* Location and pay, per version. Both are on the version's own JD record and
     were simply never carried across, which is why the popup showed neither.
     `location` is already flattened to a display string by mapVersion — the
     record can hold either a single free-text location or a structured list. */
  location?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  compensation_type?: string;
}

const formatVersionDate = (value?: string) => value ? formatIST(value) : 'Date not available';

const statusLabel = (status?: string) =>
  (status || 'unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

/**
 * Did this version go live through a Republish rather than a first publish?
 *
 * Read from the version's own record, not from whether it happens to be the
 * latest: an older version that was republished stays Republished in the
 * history, and a newly published latest version reads Published.
 *
 * Any one of the three signals is enough — `current_version` is the counter the
 * rest of the app derives its "Republished" label from, and republish_count /
 * republished_at are the backend's explicit record of the action, for records
 * where that counter is not returned.
 */
const wasRepublished = (version: JDHistoryVersion): boolean =>
  (version.current_version ?? 1) > 1
  || (version.republish_count ?? 0) > 0
  || !!version.republished_at;

/**
 * The status as this popup shows it: a published version that was republished
 * reads "Republished". Every other status is the record's own, prettified.
 */
const versionStatusLabel = (version: JDHistoryVersion): string => {
  const label = statusLabel(version.status);
  return label === 'Published' && wasRepublished(version) ? 'Republished' : label;
};

/**
 * Status pill colours for the version header card.
 *
 * Deliberately the same palette as the Job Details page's own header card
 * (JobDetailView's getStatusBadgeClass), keyed on the label versionStatusLabel
 * already produces — so a version reads the same in this popup as the JD does
 * on the page behind it. Copied rather than imported because that helper is
 * local to JobDetailView and this change is not meant to touch that file.
 */
const versionStatusBadgeClass = (label: string) => {
  switch (label) {
    case 'Published':
      return 'bg-success-subtle text-success border-success-line';
    case 'Republished':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Draft':
      return 'bg-warning-subtle text-warning border-warning-line';
    case 'Disabled':
      return 'bg-destructive-subtle text-destructive border-destructive-line';
    case 'Archived':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    default:
      return 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700';
  }
};

/**
 * A version's pay, formatted the way the Job Details header card formats it:
 * the range through the shared salary formatter, with the compensation period
 * appended. Empty string when the version records no pay at all, which is what
 * the callers test to decide between the value and the placeholder.
 */
const formatVersionSalary = (version: JDHistoryVersion): string => {
  const range = formatSalaryRange({
    min: version.salary_min,
    max: version.salary_max,
    currency: version.salary_currency,
  });
  if (!range) return '';
  return version.compensation_type ? `${range} / ${version.compensation_type}` : range;
};

const versionDate = (version: JDHistoryVersion) => version.published_at || version.created_at || '';

const buildCompareText = (version: JDHistoryVersion) => {
  const lines = [
    `Title: ${version.title || 'Untitled JD'}`,
    version.job_id ? `Job ID: ${version.job_id}` : '',
    version.status ? `Status: ${versionStatusLabel(version)}` : '',
    version.department ? `Department: ${version.department}` : '',
    version.industry_type ? `Industry: ${version.industry_type}` : '',
    version.employment_type ? `Employment Type: ${version.employment_type}` : '',
    version.remote_type ? `Work Mode: ${version.remote_type}` : '',
    version.location ? `Location: ${version.location}` : '',
    formatVersionSalary(version) ? `Salary: ${formatVersionSalary(version)}` : '',
    '',
    'Job Description:',
    version.description || '',
  ];

  return lines.filter((line, index) => line || index === 7).join('\n');
};

const mapVersion = (lineageVersion: JDLineageVersion, detail?: JDResponse): JDHistoryVersion => ({
  id: lineageVersion.id,
  job_id: detail?.job_id || lineageVersion.job_id,
  version_number: lineageVersion.version_number || 1,
  title: detail?.title || lineageVersion.title || 'Untitled JD',
  description: detail?.description || '',
  status: detail?.status || lineageVersion.status,
  current_version: detail?.current_version ?? lineageVersion.current_version,
  republish_count: detail?.republish_count,
  republished_at: detail?.republished_at,
  is_latest_version: lineageVersion.is_latest_version,
  published_at: detail?.published_at || lineageVersion.published_at,
  created_at: detail?.created_at || lineageVersion.created_at,
  created_by_name: detail?.created_by_name,
  department: detail?.department,
  employment_type: detail?.employment_type,
  remote_type: detail?.remote_type,
  industry_type: detail?.industry_type,
  /* Single free-text location first, else the cities from the structured list —
     the same fallback the Job Details page applies when it builds its own Job
     object, so a version reads the same there and here.

     `detail` is THIS version's record: the caller fetches it by
     lineageVersion.id and pairs the two inside one closure, so a value can
     never land on a different version than the one it came from. */
  location: detail?.location
    || (detail?.locations || []).map((entry) => entry?.city).filter(Boolean).join(', ')
    || undefined,
  salary_min: detail?.salary_min,
  salary_max: detail?.salary_max,
  salary_currency: detail?.salary_currency,
  compensation_type: detail?.compensation_type,
});

/**
 * One version, described as a card.
 *
 * Built to the same format as the first section below the breadcrumb on the Job
 * Details page (the "Job Details Card" in JobDetailView): an identity row on top
 * (ID chip · title · status pill), a metadata chip row beneath it, and an
 * optional action pinned right. Same container, same chip vocabulary, same dot
 * separators, so a version reads here exactly the way the JD reads on the page
 * behind this popup.
 *
 * One component, three places: the single-version view and BOTH sides of the
 * comparison popup — so the two versions being diffed are described exactly the
 * way the version you opened on its own is.
 *
 * Its METRICS are deliberately tighter than the page card's — smaller padding,
 * one step down the type scale, slimmer chips. Same design, less of it: this
 * card lives in a dialog, and in the comparison popup two of them sit side by
 * side in roughly half the width the page card gets. Colours, structure and chip
 * vocabulary are untouched, so it still reads as the same card.
 */
function VersionHeaderCard({ version, action }: { version: JDHistoryVersion; action?: ReactNode }) {
  const statusText = versionStatusLabel(version);
  const salaryText = formatVersionSalary(version);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-brand-blue/30 dark:border-brand-blue/40 ring-1 ring-brand-blue/10 dark:ring-brand-blue/20 shadow-sm shadow-brand-blue/10 p-3">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Row 1: JD ID + Job Title + Status */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {version.job_id && (
              <span className="inline-flex items-center px-2 py-0.5 bg-blue-600 text-white rounded-md text-xs font-semibold font-mono tracking-wide">
                {version.job_id}
              </span>
            )}
            <h3
              // Wraps below sm: truncated, a phone showed only "Senior Backe…".
              className="font-normal text-gray-900 dark:text-slate-50 text-base [overflow-wrap:anywhere] sm:truncate min-w-0"
              title={version.title}
            >
              {version.title}
            </h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${versionStatusBadgeClass(statusText)}`}>
              {statusText}
            </span>
            {version.is_latest_version && (
              <span className="inline-flex items-center px-2 py-0.5 bg-brand-blue text-white rounded text-xs font-medium whitespace-nowrap">
                Latest
              </span>
            )}
          </div>

          {/* Row 2: Location + Salary + Department + Industry + Employment
              Type + Work Mode + Posted On / By + Version */}
          {/* Phones: the "•" separators are hidden (a wrapped line began with
              one) and the items get an even gap instead. */}
          <div className="flex flex-wrap items-center gap-x-1.5 max-sm:gap-x-2 gap-y-1 max-sm:gap-y-1.5 tf-meta-strong">
            {/* Location */}
            <span className="inline-flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 text-purple-600 shrink-0" />
              <span className="truncate max-w-[180px]" title={version.location || undefined}>
                {version.location || 'Not specified'}
              </span>
            </span>
            <span className="text-gray-300 max-sm:hidden">•</span>

            {/* Salary */}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
              salaryText
                ? 'bg-success-subtle text-success'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 font-normal italic'
            }`}>
              {salaryText || 'Salary not specified'}
            </span>

            {version.department && (
              <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
                {version.department}
              </span>
            )}
            {version.industry_type && (
              <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
                {formatIndustryType(version.industry_type)}
              </span>
            )}
            {version.employment_type && (
              <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
                {formatEmploymentType(version.employment_type)}
              </span>
            )}
            {version.remote_type && (
              <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-md text-xs">
                {formatEmploymentType(version.remote_type)}
              </span>
            )}
            {/* Location and Salary always precede this, so the dot never
                opens the row on its own. */}
            <span className="text-gray-300 max-sm:hidden">•</span>

            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Calendar className="w-3 h-3" />
              Posted {formatVersionDate(versionDate(version))}
            </span>
            <span className="text-gray-300 max-sm:hidden">•</span>

            <span className="whitespace-nowrap">By {version.created_by_name || 'Unknown'}</span>
            <span className="text-gray-300 max-sm:hidden">•</span>

            {/* Version badge — the Job Details card's purple pill, static here:
                this popup IS the version picker, so it has no menu to drop. */}
            <span className="inline-flex items-center px-2 py-0.5 bg-purple-600 text-white rounded-full text-xs font-medium">
              v{version.version_number}.0
            </span>
          </div>
        </div>

        {/* Actions — pinned right, mirroring the Job Details card. Omitted on
            the comparison sides, which are read-only descriptions. */}
        {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export default function JDVersionHistoryModal({
  isOpen,
  onClose,
  jdId,
  jdTitle,
  initialVersionNumber,
  showGoToJd = false,
  goToJdTab,
  cancelInFooter = false,
}: JDVersionHistoryModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<JDHistoryVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<JDHistoryVersion | null>(null);
  const [compareChecked, setCompareChecked] = useState<string[]>([]);
  const [comparePair, setComparePair] = useState<{ older: JDHistoryVersion; newer: JDHistoryVersion } | null>(null);

  const fetchVersionHistory = useCallback(async () => {
    setLoading(true);
    setSelectedVersion(null);
    setCompareChecked([]);
    setComparePair(null);
    try {
      const lineage = await jdService.getLineageVersions(jdId);
      const lineageItems = lineage.length
        ? lineage
        : [{
            id: jdId,
            title: jdTitle,
            version_number: initialVersionNumber || 1,
            is_latest_version: true,
            status: 'published',
          } as JDLineageVersion];

      const uniqueItems = Array.from(
        new Map(lineageItems.map((item) => [item.id, item])).values()
      );

      const hydratedVersions = await Promise.all(
        uniqueItems.map(async (lineageVersion) => {
          try {
            const detail = await jdService.getById(lineageVersion.id);
            return mapVersion(lineageVersion, detail);
          } catch (error) {
            console.warn('Failed to load JD version detail:', lineageVersion.id, error);
            return mapVersion(lineageVersion);
          }
        })
      );

      const sortedVersions = hydratedVersions.sort(
        (a, b) => (b.version_number || 1) - (a.version_number || 1)
      );

      setVersions(sortedVersions);
      if (initialVersionNumber != null) {
        setSelectedVersion(
          sortedVersions.find((version) => version.version_number === initialVersionNumber) || null
        );
      }
    } catch (error) {
      console.error('Failed to fetch JD version lineage:', error);
      toast.error('Failed to load version history');
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [initialVersionNumber, jdId, jdTitle]);

  useEffect(() => {
    if (!isOpen || !jdId) return;
    const timer = window.setTimeout(() => {
      void fetchVersionHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchVersionHistory, isOpen, jdId]);

  const closeModal = () => {
    setSelectedVersion(null);
    setCompareChecked([]);
    setComparePair(null);
    onClose();
  };

  const toggleCompareCheck = (versionId: string) => {
    setCompareChecked((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      return prev.length >= 2 ? [prev[1], versionId] : [...prev, versionId];
    });
  };

  const openComparison = (a: JDHistoryVersion, b: JDHistoryVersion) => {
    const [older, newer] = (a.version_number || 0) <= (b.version_number || 0) ? [a, b] : [b, a];
    setComparePair({ older, newer });
  };

  /* One side of the comparison, in the shape VersionCompareModal wants. The
     `card` is the same VersionHeaderCard the single-version view renders, so a
     version is described identically whether you open it alone or diff it — no
     action on it, because a comparison side is a read-only description. */
  const toCompareSide = (version: JDHistoryVersion): CompareVersion => ({
    version: version.version_number,
    label: `Version ${version.version_number}.0`,
    name: `${version.title} - ${formatVersionDate(versionDate(version))}`,
    text: version.description || '',
    card: <VersionHeaderCard version={version} />,
  });

  const compareSelected = () => {
    if (compareChecked.length !== 2) return;
    const a = versions.find((version) => version.id === compareChecked[0]);
    const b = versions.find((version) => version.id === compareChecked[1]);
    if (a && b) openComparison(a, b);
  };

  /* Downloads the version as a Word document.

     The content still comes from buildCompareText, so exactly the same fields
     in the same order are written as before — only the container changed from
     text/plain to a real .docx. Each line becomes its own paragraph, which is
     also what makes a multi-line description read correctly in Word rather than
     collapsing into one run.

     `docx` is imported dynamically, the way the AI-interview Q&A export does
     it, so the library stays out of the bundle until someone actually
     downloads. */
  const handleDownload = async (version: JDHistoryVersion) => {
    const { Document, Packer, Paragraph, TextRun } = await import('docx');

    const lines = buildCompareText(version).split('\n');
    /* Everything before the first blank line is the `Label: value` metadata
       block; past it is the description body, which is left as plain runs
       because a colon inside prose is not a label. */
    const metadataEnd = lines.indexOf('');

    const children = lines.map((line, index) => {
      const label = index < metadataEnd ? /^([^:]+): ?(.*)$/.exec(line) : null;

      if (label) {
        return new Paragraph({
          children: [
            new TextRun({ text: `${label[1]}: `, bold: true }),
            new TextRun({ text: label[2] }),
          ],
        });
      }

      // Blank lines included — an empty paragraph is the spacer Word expects.
      return new Paragraph({
        children: [new TextRun({ text: line, bold: line === 'Job Description:' })],
      });
    });

    const blob = await Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${version.title.replace(/[^a-z0-9]/gi, '_')}_v${version.version_number}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    jdService.logVersionDownload(jdId, version.id);
  };

  /* A version row's title and meta line (date · status · author). Drawn beside
     the tile from sm, and under the row on phones — one definition for both. */
  const renderVersionDetails = (version: JDHistoryVersion) => (
    <>
      <p className="tf-card-desc [overflow-wrap:anywhere] sm:truncate">{version.title}</p>
      <div className="flex items-center gap-3 max-sm:gap-x-3 max-sm:gap-y-1 tf-card-desc max-sm:text-xs mt-1 flex-wrap">
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" />
          {formatVersionDate(versionDate(version))}
        </span>
        <span className="whitespace-nowrap">{versionStatusLabel(version)}</span>
        {version.created_by_name && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <User className="w-3.5 h-3.5" />
            {version.created_by_name}
          </span>
        )}
      </div>
    </>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6" onClick={closeModal}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-4xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0">
            {selectedVersion ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelectedVersion(null)}
                className="px-2"
                aria-label="Back to version list"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            ) : (
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                <History className="w-4 h-4 text-brand-blue" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="tf-section-title truncate min-w-0">
                  {selectedVersion ? `Version ${selectedVersion.version_number}.0` : 'Version History'}
                </h2>
                {!selectedVersion && versions.length > 0 && (
                  <span className="inline-flex flex-shrink-0 items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15">
                    {versions.length} version{versions.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="tf-card-desc truncate">
                {selectedVersion ? selectedVersion.title : jdTitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {showGoToJd && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const targetId = selectedVersion?.id || jdId;
                  closeModal();
                  router.push(
                    `/recruitment/job-details?id=${encodeURIComponent(targetId)}` +
                    (goToJdTab ? `&tab=${encodeURIComponent(goToJdTab)}` : ''),
                  );
                }}
                title={selectedVersion ? `Open version ${selectedVersion.version_number} of this job` : 'Open this job'}
                icon={<Briefcase className="w-4 h-4" />}
                className="whitespace-nowrap"
              >
                Go to JD
              </Button>
            )}
            {!selectedVersion && versions.length > 1 && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={compareSelected}
                disabled={compareChecked.length !== 2}
                /* `max-lg:hidden`, not `hidden lg:inline-flex`: Button joins
                   its classes without tailwind-merge, so its own base
                   `inline-flex` beat `hidden` and this showed on phones too,
                   crushing the title beside it. The footer Compare covers
                   narrow screens. */
                className="max-lg:hidden"
              >
                {compareChecked.length === 2 ? 'Compare selected' : 'Select 2 versions to compare'}
              </Button>
            )}
            {!cancelInFooter && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={closeModal}
                className="px-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {!selectedVersion && versions.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 sm:px-6 py-2 bg-brand-blue/[0.04] border-b border-brand-blue/10 tf-meta-strong">
            <History className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
            <span>
              All available JD versions are shown. Tick any two versions to compare them.
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Skeleton className="h-4 w-4 shrink-0 rounded" />
                      <Skeleton className="w-10 h-10 shrink-0 rounded-lg" />
                      <div className="min-w-0 space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3.5 w-48" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Skeleton className="hidden sm:block h-7 w-28 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : selectedVersion ? (
            <div className="space-y-4">
              {/* The version being viewed, described by the shared card. */}
              <VersionHeaderCard
                version={selectedVersion}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDownload(selectedVersion)}
                    className="px-2"
                    aria-label="Download this version as a Word document"
                    title="Download this version as a Word document"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                }
              />

              <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-4 sm:p-6">
                {/* Identity and metadata live in the header card above —
                    repeating them here put the same facts on screen twice.
                    This card is the description body. */}
                {selectedVersion.description ? (
                  <div className="prose prose-sm max-w-none text-gray-700 dark:text-slate-300 leading-relaxed markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                      {selectedVersion.description}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="tf-body-muted italic">
                    No job description content recorded for this version.
                  </p>
                )}
              </div>
            </div>
          ) : versions.length > 0 ? (
            <div className="space-y-3">
              {versions.map((version, index) => {
                const isLatest = version.is_latest_version || index === 0;
                const isCurrentPage = version.id === jdId;
                const previousVersion = index < versions.length - 1 ? versions[index + 1] : null;

                return (
                  <div
                    key={version.id}
                    className={`border rounded-lg p-4 max-sm:p-3 transition-all ${
                      isCurrentPage
                        ? 'bg-brand-blue/[0.06] border-brand-blue/40 ring-1 ring-brand-blue/15'
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {versions.length > 1 && (
                          <input
                            type="checkbox"
                            checked={compareChecked.includes(version.id)}
                            onChange={() => toggleCompareCheck(version.id)}
                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                            aria-label={`Select version ${version.version_number} to compare`}
                          />
                        )}
                        {/* Phones: the tile is dropped, and the title + meta
                            lines move under the row at full width (below), so
                            they are not squeezed between the tile and the
                            buttons. */}
                        <div className={`w-10 h-10 shrink-0 rounded-lg max-sm:hidden flex items-center justify-center ${
                          isLatest
                            ? 'bg-brand-blue/10 ring-1 ring-brand-blue/15'
                            : 'bg-gray-100 dark:bg-slate-800 ring-1 ring-gray-200/60'
                        }`}>
                          <FileText className={`w-5 h-5 ${isLatest ? 'text-brand-blue' : 'text-gray-500 dark:text-slate-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-brand-blue">
                              Version {version.version_number}
                            </span>
                            {isLatest && (
                              <span className="px-2 py-0.5 bg-brand-blue text-white rounded text-xs font-medium">
                                Latest
                              </span>
                            )}
                            {isCurrentPage && (
                              <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 rounded text-xs font-medium">
                                Current page
                              </span>
                            )}
                          </div>
                          <div className="max-sm:hidden">{renderVersionDetails(version)}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {previousVersion ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => openComparison(previousVersion, version)}
                            title="Compare with the previous version"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">View Changes</span>
                          </Button>
                        ) : (
                          <span className="hidden sm:inline text-xs italic text-gray-400 dark:text-slate-500">First version</span>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedVersion(version)}
                          className="px-2"
                          aria-label={`View version ${version.version_number}`}
                          title="View JD"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {/* Phones: the title and meta at the card's full width,
                        lined up under the checkbox. */}
                    <div className="sm:hidden mt-2">{renderVersionDetails(version)}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-400 dark:text-slate-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-slate-50 mb-2">No Versions Found</h3>
              <p className="tf-body-muted text-center">
                No version history available for this job description.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-slate-700 px-4 py-3 sm:px-6 sm:py-4 bg-gray-50 dark:bg-slate-800/50">
          <div className="flex justify-between items-center gap-3">
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 min-w-0">
              {selectedVersion
                ? `Viewing version ${selectedVersion.version_number}`
                : compareChecked.length > 0
                  ? `${compareChecked.length} of 2 selected to compare`
                  : `${versions.length} version${versions.length !== 1 ? 's' : ''}`}
            </p>
            <div className="flex items-center gap-2">
              {cancelInFooter && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeModal}
                >
                  Cancel
                </Button>
              )}
              {!selectedVersion && versions.length > 1 && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={compareSelected}
                  disabled={compareChecked.length !== 2}
                  className="lg:hidden"
                >
                  Compare
                </Button>
              )}
              {selectedVersion && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedVersion(null)}
                >
                  Back to List
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {comparePair && (
        <div onClick={(e) => e.stopPropagation()}>
          <VersionCompareModal
            older={toCompareSide(comparePair.older)}
            newer={toCompareSide(comparePair.newer)}
            contentFormat="markdown"
            onClose={() => {
              setComparePair(null);
              setCompareChecked([]);
            }}
          />
        </div>
      )}
    </div>
  );
}
