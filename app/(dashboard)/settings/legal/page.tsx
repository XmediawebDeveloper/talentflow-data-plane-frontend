'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useState, useEffect } from 'react';
import { ScrollText, CheckCircle, AlertCircle, Eye, X, FileText, Shield, Cookie, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { IconComponent } from '@/lib/types/icon';
import { termsService } from '@/lib/services/termsService';
import type { DocumentType } from '@/lib/services/termsService';
import { formatIST } from '@/lib/utils/dateUtils';
import type { TermsAcceptanceRecord, TermsAndConditions } from '@/lib/types/terms';
import ListPagination from '@/components/ListPagination';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

const TITLE_TO_DOCUMENT_TYPE: Record<string, DocumentType> = {
  'Terms & Conditions': 'TERMS_AND_CONDITIONS',
  'Privacy Policy': 'PRIVACY_POLICY',
  'Cookies Policy': 'COOKIES_POLICY',
};

const DOCUMENT_TYPE_ICON: Record<DocumentType, IconComponent> = {
  TERMS_AND_CONDITIONS: FileText,
  PRIVACY_POLICY: Shield,
  COOKIES_POLICY: Cookie,
};

export default function LegalCompliancePage() {
  const [history, setHistory] = useState<TermsAcceptanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewingDoc, setViewingDoc] = useState<TermsAndConditions | null>(null);
  const [viewingTitle, setViewingTitle] = useState<string>('');
  const [viewingDocType, setViewingDocType] = useState<DocumentType | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const rootRef = useScrollRestoration<HTMLElement>('settings-legal', !loading);
  useListStatePersistence(
    'settings-legal',
    { currentPage, itemsPerPage },
    (s) => {
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  const paginatedHistory = history.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await termsService.getAcceptanceHistory();
        setHistory(data);
      } catch (err: any) {
        console.error('[Legal] Failed to fetch acceptance history:', err);
        setError(err.message || 'Failed to load acceptance history');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const handleView = async (record: TermsAcceptanceRecord) => {
    const title = record.terms_title || '';
    const documentType = TITLE_TO_DOCUMENT_TYPE[title];
    if (!documentType) return;

    setViewingDoc(null);
    setDocError(null);
    setViewingTitle(title);
    setViewingDocType(documentType);
    setDocLoading(true);
    try {
      const doc = await termsService.getCurrentTerms(documentType);
      setViewingDoc(doc);
    } catch (err: any) {
      setDocError(err.message || 'Failed to load document');
    } finally {
      setDocLoading(false);
    }
  };

  const closeModal = () => {
    setViewingDoc(null);
    setDocError(null);
    setViewingTitle('');
    setViewingDocType(null);
  };

  const DocIcon = viewingDocType ? DOCUMENT_TYPE_ICON[viewingDocType] : FileText;

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet space-y-4 sm:space-y-6">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile Settings', href: '/settings/general-settings' }, { label: 'Legal & Compliance' }]} />

      {/* SaaS Hero Header */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-4 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
            <ScrollText className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="tf-badge mb-2 gap-1.5 bg-white/10 text-2xs text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 text-brand-orange" />
              Compliance trail
            </div>
            <h1 className="tf-page-title">Legal & Compliance</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80">Audit trail of all legal document acceptances for your organization.</p>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="tf-card-soft overflow-hidden">
        <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-5 py-4 sm:px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <FileText className="h-5 w-5 text-brand-blue" />
          </span>
          <div>
            <h2 className="tf-section-title">Acceptance History</h2>
            <p className="tf-meta">Record of all legal document acceptances for your organization.</p>
          </div>
        </div>

        {loading ? (
          <div className="overflow-x-auto tf-table-shell">
            {/* Neutral skeleton matching the Acceptance History table columns:
                Version, Title, Accepted By, Accepted On, Status, Document. */}
            <div className="grid grid-cols-6 gap-4 border-b border-gray-100 bg-gray-50 px-6 py-3">
              {['w-16', 'w-20', 'w-24', 'w-24', 'w-16', 'w-20'].map((w, i) => (
                <Skeleton key={i} className={`h-3 ${w}`} />
              ))}
            </div>
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, r) => (
                <div key={r} className="grid grid-cols-6 items-center gap-4 px-6 py-4">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-7 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-destructive">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span>{error}</span>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-slate-500">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <ScrollText className="w-6 h-6 text-brand-blue" />
            </span>
            <p className="text-sm">No acceptance records found</p>
          </div>
        ) : (
          <>
          <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
            <table className="w-full">
              <thead>
                <tr className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60">
                  <th className="tf-th-cell text-left tf-th">Version</th>
                  <th className="tf-th-cell text-left tf-th">Title</th>
                  <th className="tf-th-cell text-left tf-th">Accepted By</th>
                  <th className="tf-th-cell text-left tf-th">Accepted On</th>
                  <th className="tf-th-cell text-left tf-th">Status</th>
                  <th className="tf-th-cell text-left tf-th">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {paginatedHistory.map((record) => (
                  <tr key={record.id} className="hover:bg-brand-cyan/[0.04] transition-colors">
                    <td className="tf-td tf-row-name">
                      <span className="tf-badge bg-brand-blue/[0.06] text-brand-blue ring-1 ring-brand-blue/15">{record.terms_version}</span>
                    </td>
                    <td className="tf-td tf-body">{record.terms_title || '—'}</td>
                    <td className="tf-td">
                      <div>
                        <p className="tf-row-name">{record.accepted_by || record.accepted_by_name}</p>
                        <p className="tf-meta">{record.accepted_by_email}</p>
                      </div>
                    </td>
                    <td className="tf-td tf-body-secondary">
                      {formatIST(record.accepted_at)}
                    </td>
                    <td className="tf-td">
                      <span className="tf-badge bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/15">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Accepted
                      </span>
                    </td>
                    <td className="tf-td">
                      {TITLE_TO_DOCUMENT_TYPE[record.terms_title || ''] ? (
                        <Button variant="secondary" size="sm" onClick={() => handleView(record)} className="text-xs">
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Button>
                      ) : (
                        <span className="tf-hint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MobileRecordList className="p-3">
            {paginatedHistory.map((record) => (
              <MobileRecordCard
                key={record.id}
                /* 👁 View at the right end of the name line, as on the Support Tickets cards. */
                className="tf-jdv-actions-inline"
                badges={
                  <>
                    <span className="tf-badge bg-brand-blue/[0.06] text-brand-blue ring-1 ring-brand-blue/15">{record.terms_version}</span>
                    <span className="tf-badge bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/15">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Accepted
                    </span>
                  </>
                }
                title={record.terms_title || '—'}
                actions={
                  TITLE_TO_DOCUMENT_TYPE[record.terms_title || ''] ? (
                    <button type="button" onClick={() => handleView(record)} title="View" aria-label={`View ${record.terms_title || 'document'}`} className="tf-icon-btn-outline">
                      <Eye />
                    </button>
                  ) : undefined
                }
                fields={[
                  { label: 'Accepted By', value: <>{record.accepted_by || record.accepted_by_name}{record.accepted_by_email && <span className="tf-meta"> ({record.accepted_by_email})</span>}</> },
                  { label: 'Accepted On', value: formatIST(record.accepted_at) },
                ]}
              />
            ))}
          </MobileRecordList>
          </>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && history.length > 0 && (
        <ListPagination
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          totalItems={history.length}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
          itemLabel="documents"
        />
      )}

      {/* Document View Modal — same style as TermsAcceptanceModal */}
      {(docLoading || viewingDoc || docError) && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-brand-blue/20 ring-1 ring-black/[0.03] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal px-6 py-5 flex items-center justify-between shrink-0">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-cyan/25 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                  <DocIcon className="w-5 h-5 text-white" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-white">{viewingTitle}</h2>
                  {viewingDoc && <p className="text-white/85 text-xs">Version {viewingDoc.version}</p>}
                </div>
              </div>
              <Button
                tone="onColor"
                variant="secondary"
                size="sm"
                onClick={closeModal}
                aria-label="Close"
               
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 prose prose-sm max-w-none">
              {docLoading ? (
                <div className="space-y-4 py-2">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ) : docError ? (
                <div className="flex items-center justify-center py-16 text-destructive">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  <span>{docError}</span>
                </div>
              ) : viewingDoc ? (
                <div dangerouslySetInnerHTML={{ __html: viewingDoc.content_html }} />
              ) : null}
            </div>

            {/* Footer */}
            {viewingDoc && (
              <div className="border-t border-gray-100 dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/50 px-6 py-3 flex items-center justify-between tf-meta shrink-0">
                <span>Version: <span className="font-semibold text-brand-blue">{viewingDoc.version}</span></span>
                <span>Effective: {formatIST(viewingDoc.effective_date)}</span>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      </div>
    </main>
  );
}
