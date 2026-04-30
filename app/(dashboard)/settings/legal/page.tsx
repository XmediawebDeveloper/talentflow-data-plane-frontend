'use client';

import { useState, useEffect } from 'react';
import { ScrollText, CheckCircle, Loader2, AlertCircle, Eye, X, FileText, Shield, Cookie } from 'lucide-react';
import { termsService } from '@/lib/services/termsService';
import type { DocumentType } from '@/lib/services/termsService';
import { formatIST } from '@/lib/utils/dateUtils';
import type { TermsAcceptanceRecord, TermsAndConditions } from '@/lib/types/terms';
import ListPagination from '@/components/ListPagination';

const TITLE_TO_DOCUMENT_TYPE: Record<string, DocumentType> = {
  'Terms & Conditions': 'TERMS_AND_CONDITIONS',
  'Privacy Policy': 'PRIVACY_POLICY',
  'Cookies Policy': 'COOKIES_POLICY',
};

const DOCUMENT_TYPE_ICON: Record<DocumentType, React.ElementType> = {
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Legal & Compliance</h1>
            <p className="text-sm text-gray-500">Legal documents acceptance history</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Acceptance History</h2>
          <p className="text-sm text-gray-500 mt-1">Record of all legal document acceptances for your organization</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="ml-2 text-gray-500">Loading history...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span>{error}</span>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ScrollText className="w-10 h-10 mb-3" />
            <p className="text-sm">No acceptance records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Version</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Title</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Accepted By</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Accepted On</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedHistory.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{record.terms_version}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{record.terms_title || '—'}</td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{record.accepted_by || record.accepted_by_name}</p>
                        <p className="text-xs text-gray-500">{record.accepted_by_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatIST(record.accepted_at)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Accepted
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {TITLE_TO_DOCUMENT_TYPE[record.terms_title || ''] ? (
                        <button
                          onClick={() => handleView(record)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <DocIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{viewingTitle}</h2>
                  {viewingDoc && <p className="text-blue-100 text-sm">Version {viewingDoc.version}</p>}
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 prose prose-sm max-w-none">
              {docLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                  <span className="ml-2 text-gray-500">Loading document...</span>
                </div>
              ) : docError ? (
                <div className="flex items-center justify-center py-16 text-red-500">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  <span>{docError}</span>
                </div>
              ) : viewingDoc ? (
                <div dangerouslySetInnerHTML={{ __html: viewingDoc.content_html }} />
              ) : null}
            </div>

            {/* Footer */}
            {viewingDoc && (
              <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between text-xs text-gray-400 shrink-0">
                <span>Version: {viewingDoc.version}</span>
                <span>Effective: {formatIST(viewingDoc.effective_date)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
