import { X, Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuotaCheck } from '@/lib/hooks/useQuotaCheck';

interface ResumeUploadModalProps {
  jobTitle: string;
  onClose: () => void;
  onSubmit: (files: File[]) => void;
}

export default function ResumeUploadModal({ jobTitle, onClose, onSubmit }: ResumeUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Quota check for RU (Resume Upload)
  const { checkQuota, status: quotaStatus, canProceed: hasQuota, isChecking: isCheckingQuota } = useQuotaCheck();
  const [quotaChecked, setQuotaChecked] = useState(false);
  const [quotaRemaining, setQuotaRemaining] = useState<number>(-1);

  // Check quota on mount and when files change
  useEffect(() => {
    const checkResumeQuota = async () => {
      const canUpload = await checkQuota('RU', selectedFiles.length || 1);
      setQuotaChecked(true);
      if (quotaStatus.data?.total_remaining !== undefined) {
        setQuotaRemaining(quotaStatus.data.total_remaining);
      }
    };
    checkResumeQuota();
  }, [checkQuota, selectedFiles.length]);

  // Check if selected files exceed quota
  const filesExceedQuota = quotaRemaining !== -1 && selectedFiles.length > quotaRemaining;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files).filter(
        file => file.type === 'application/pdf' || file.name.endsWith('.doc') || file.name.endsWith('.docx')
      );
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (selectedFiles.length > 0) {
      onSubmit(selectedFiles);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-gray-900 mb-1">Upload Resumes</h2>
            <p className="text-sm text-gray-600">Add applicants to: <span className="text-gray-800">{jobTitle}</span></p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragActive
                ? 'border-gray-700 bg-gray-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-gray-800" />
            </div>
            <h3 className="text-gray-900 mb-2">Drop resumes here</h3>
            <p className="text-sm text-gray-600 mb-4">
              or click to browse from your computer
            </p>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
              id="resume-upload"
            />
            <label
              htmlFor="resume-upload"
              className="inline-flex items-center gap-2 bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
            >
              <Upload className="w-5 h-5" />
              Browse Files
            </label>
            <p className="text-xs text-gray-500 mt-4">
              Supported formats: PDF, DOC, DOCX (Max 10MB per file)
            </p>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm text-gray-700 mb-3">
                Selected Files ({selectedFiles.length})
              </h4>
              <div className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <FileText className="w-5 h-5 text-gray-800" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <button
                      onClick={() => removeFile(index)}
                      className="p-1.5 hover:bg-gray-200 rounded-md transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quota Warning */}
          {quotaChecked && (!hasQuota || filesExceedQuota) && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm font-medium text-red-900 mb-1">Resume Upload Quota {!hasQuota ? 'Exceeded' : 'Warning'}</h5>
                  <p className="text-xs text-red-700">
                    {!hasQuota ? (
                      <>You have reached your resume upload limit. </>
                    ) : filesExceedQuota ? (
                      <>You can only upload {quotaRemaining} more resume{quotaRemaining !== 1 ? 's' : ''}. You've selected {selectedFiles.length}. </>
                    ) : null}
                    <a href="/subscription/plans" className="underline font-medium">Upgrade your plan</a> to upload more resumes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quota Info */}
          {quotaChecked && quotaRemaining !== -1 && hasQuota && !filesExceedQuota && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm font-medium text-green-900 mb-1">Resume Upload Quota</h5>
                  <p className="text-xs text-green-700">
                    You have {quotaRemaining} resume upload{quotaRemaining !== 1 ? 's' : ''} remaining in your plan.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-gray-800 flex-shrink-0 mt-0.5" />
              <div>
                <h5 className="text-sm text-gray-800 mb-1">What happens next?</h5>
                <p className="text-xs text-gray-900">
                  Resumes will be automatically parsed and scored against the job requirements. 
                  You'll see the scoring results after submission.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {isCheckingQuota ? (
              <span className="text-gray-500 animate-pulse">Checking quota...</span>
            ) : selectedFiles.length > 0 ? (
              filesExceedQuota || !hasQuota ? (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {!hasQuota ? 'Quota exceeded' : `Exceeds quota (max ${quotaRemaining})`}
                </span>
              ) : (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready to upload
                </span>
              )
            ) : (
              <span>No files selected</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedFiles.length === 0 || !hasQuota || filesExceedQuota || isCheckingQuota}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isCheckingQuota ? 'Checking...' : !hasQuota || filesExceedQuota ? 'Quota Exceeded' : 'Upload & Score Resumes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
