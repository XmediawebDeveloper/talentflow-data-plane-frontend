import { X, Download, FileText, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Resume } from '@/lib/types/types';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';

interface ResumeQuickViewModalProps {
  resume: Resume;
  onClose: () => void;
}

export default function ResumeQuickViewModal({ resume, onClose }: ResumeQuickViewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Fetch PDF preview on mount
  useEffect(() => {
    fetchPdfPreview();
    return () => {
      // Clean up blob URL when unmounting
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [resume.id]);

  const fetchPdfPreview = async () => {
    setLoadingPdf(true);
    try {
      // Use preview endpoint which converts DOCX/DOC to PDF
      const blob = await resumeService.preview(resume.id);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error('Failed to fetch PDF preview:', error);
      toast.error('Failed to load PDF preview');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await resumeService.download(resume.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use original filename to preserve file extension (pdf, doc, docx, rtf, txt, etc.)
      a.download = resume.fileName || `${resume.name || 'resume'}.${resume.fileType || 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Resume downloaded');
    } catch (error) {
      toast.error('Failed to download resume');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl text-gray-900">{resume.name}</h2>
            <p className="text-sm text-gray-500">{resume.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PDF Preview Content */}
        <div className="flex-1 overflow-hidden p-4">
          {loadingPdf ? (
            <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
              <div className="text-center">
                <Loader2 className="w-8 h-8 mx-auto mb-4 text-gray-600 animate-spin" />
                <p className="text-gray-600">Loading PDF preview...</p>
              </div>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full rounded-lg border border-gray-200"
              title="Resume Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600">PDF preview not available</p>
                <button
                  onClick={fetchPdfPreview}
                  className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
