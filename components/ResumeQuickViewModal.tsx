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
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Section headers for document-like formatting
  const sectionHeaders = [
    'experience', 'work experience', 'employment', 'professional experience',
    'education', 'academic', 'qualifications',
    'skills', 'technical skills', 'core competencies', 'expertise', 'key skills',
    'summary', 'professional summary', 'objective', 'profile', 'about',
    'certifications', 'certificates', 'licenses',
    'projects', 'key projects',
    'achievements', 'accomplishments', 'awards',
    'languages', 'contact', 'personal', 'references', 'hobbies', 'interests'
  ];

  useEffect(() => {
    fetchPreview();
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [resume.id]);

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const blob = await resumeService.preview(resume.id);
      const firstBytes = await blob.slice(0, 10).text();

      if (firstBytes.startsWith('%PDF')) {
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        setPdfUrl(url);
      } else {
        // Not a PDF - fetch extracted text as fallback
        await fetchExtractedText();
      }
    } catch (error) {
      console.error('Failed to fetch PDF preview:', error);
      // Fallback to extracted text
      await fetchExtractedText();
    } finally {
      setLoading(false);
    }
  };

  const fetchExtractedText = async () => {
    try {
      const data = await resumeService.get(resume.id);
      if (data?.extracted_text) {
        setExtractedText(data.extracted_text);
      } else {
        toast.error('Preview not available for this resume');
      }
    } catch (err) {
      console.error('Failed to fetch extracted text:', err);
      toast.error('Preview not available for this resume');
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await resumeService.download(resume.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
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

        {/* Preview Content */}
        <div className="flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
              <div className="text-center">
                <Loader2 className="w-8 h-8 mx-auto mb-4 text-gray-600 animate-spin" />
                <p className="text-gray-600">Loading preview...</p>
              </div>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full rounded-lg border border-gray-200"
              title="Resume Preview"
            />
          ) : extractedText ? (
            <div className="h-full overflow-y-auto bg-gray-100 rounded-lg p-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-3xl mx-auto">
                {extractedText.split('\n').map((line, idx, lines) => {
                  const trimmed = line.trim();
                  if (!trimmed) return <div key={idx} className="h-3" />;

                  const lowerLine = trimmed.toLowerCase().replace(/[:\-_]/g, ' ').trim();
                  const isHeader = sectionHeaders.some(h =>
                    lowerLine === h || lowerLine.startsWith(h + ' ') || lowerLine.endsWith(' ' + h)
                  ) && trimmed.length < 50;

                  if (isHeader) {
                    return (
                      <h3 key={idx} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-300 uppercase tracking-wide">
                        {trimmed}
                      </h3>
                    );
                  }

                  const firstNonEmpty = lines.findIndex(l => l.trim().length > 0);
                  if (idx === firstNonEmpty) {
                    return <h2 key={idx} className="text-xl font-bold text-gray-900 mb-1">{trimmed}</h2>;
                  }

                  if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                    return <p key={idx} className="text-sm text-gray-700 leading-relaxed pl-4 mb-0.5">{trimmed}</p>;
                  }

                  return <p key={idx} className="text-sm text-gray-700 leading-relaxed mb-0.5">{trimmed}</p>;
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600">Preview not available</p>
                <button
                  onClick={handleDownload}
                  className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
                >
                  Download Instead
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
