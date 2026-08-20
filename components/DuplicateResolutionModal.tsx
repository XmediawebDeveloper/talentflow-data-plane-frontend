import { X, AlertCircle, Trash2, RefreshCw, GitBranch, FileText, Calendar, User, MapPin, Eye, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { resumeService } from '@/lib/services';
import { renderAsync } from 'docx-preview';

interface DuplicateFile {
  fileName: string;
  candidateName: string;
  newResumeSize: string;
  newResumeDate: string;
  existingLocation: string;
  existingResumeDate: string;
  existingResumeSize: string;
  contentChanges?: string[];
  existingResumeId?: string;
  newFile?: File;
}

interface DuplicateResolutionModalProps {
  duplicateFiles: DuplicateFile[];
  onResolve: (resolutions: { fileName: string; action: 'discard' | 'overwrite' | 'version' }[]) => void;
  onClose: () => void;
}

export default function DuplicateResolutionModal({ duplicateFiles, onResolve, onClose }: DuplicateResolutionModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<{ fileName: string; action: 'discard' | 'overwrite' | 'version' }[]>([]);
  const [selectedAction, setSelectedAction] = useState<'discard' | 'overwrite' | 'version' | null>(null);
  const [previewLoading, setPreviewLoading] = useState<'existing' | 'new' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [previewDocxBlob, setPreviewDocxBlob] = useState<Blob | null>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  // Helper: check if a blob is actually a PDF by reading magic bytes
  const isPdfBlob = async (blob: Blob): Promise<boolean> => {
    try {
      const header = await blob.slice(0, 5).text();
      return header.startsWith('%PDF');
    } catch {
      return false;
    }
  };

  // Render DOCX blob into container
  const renderDocx = useCallback(async (blob: Blob) => {
    if (docxContainerRef.current) {
      docxContainerRef.current.innerHTML = '';
      try {
        await renderAsync(blob, docxContainerRef.current, undefined, {
          className: 'docx-preview-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });
      } catch (err) {
        console.error('DOCX render error:', err);
        docxContainerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">Failed to render document</div>';
      }
    }
  }, []);

  useEffect(() => {
    if (previewDocxBlob && docxContainerRef.current) {
      renderDocx(previewDocxBlob);
    }
  }, [previewDocxBlob, renderDocx]);

  const handlePreviewExisting = async (resumeId: string) => {
    setPreviewLoading('existing');
    try {
      const blob = await resumeService.preview(resumeId);
      const isPdf = await isPdfBlob(blob);

      if (isPdf) {
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(pdfBlob);
        setPreviewUrl(url);
        setPreviewDocxBlob(null);
        setPreviewTitle('Existing Resume');
      } else {
        setPreviewUrl(null);
        setPreviewDocxBlob(blob);
        setPreviewTitle('Existing Resume');
      }
    } catch {
      try {
        const blob = await resumeService.download(resumeId);
        const isPdf = await isPdfBlob(blob);
        if (isPdf) {
          const pdfBlob = new Blob([blob], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(pdfBlob);
          setPreviewUrl(url);
          setPreviewDocxBlob(null);
          setPreviewTitle('Existing Resume');
        } else {
          setPreviewUrl(null);
          setPreviewDocxBlob(blob);
          setPreviewTitle('Existing Resume');
        }
      } catch {
        setPreviewUrl(null);
        setPreviewDocxBlob(null);
        setPreviewTitle('');
      }
    } finally {
      setPreviewLoading(null);
    }
  };

  const handlePreviewNew = async (file: File) => {
    setPreviewLoading('new');
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        const url = window.URL.createObjectURL(file);
        setPreviewUrl(url);
        setPreviewDocxBlob(null);
        setPreviewTitle('New Resume');
      } else {
        setPreviewUrl(null);
        setPreviewDocxBlob(file);
        setPreviewTitle('New Resume');
      }
    } finally {
      setPreviewLoading(null);
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewDocxBlob(null);
    setPreviewTitle('');
  };

  const showPreviewModal = previewUrl || previewDocxBlob;

  const currentFile = duplicateFiles[currentIndex];
  const isLastFile = currentIndex === duplicateFiles.length - 1;
  const hasResolvedCurrent = selectedAction !== null;

  const handleNext = () => {
    if (!selectedAction) return;

    // Save the resolution
    const newResolutions = [...resolutions, { fileName: currentFile.fileName, action: selectedAction }];
    setResolutions(newResolutions);

    if (isLastFile) {
      // All files resolved, submit
      onResolve(newResolutions);
    } else {
      // Move to next file
      setCurrentIndex(currentIndex + 1);
      setSelectedAction(null);
    }
  };

  const handleSkipAll = () => {
    // Discard all remaining duplicates
    const allResolutions = [
      ...resolutions,
      ...duplicateFiles.slice(currentIndex).map(file => ({
        fileName: file.fileName,
        action: 'discard' as const
      }))
    ];
    onResolve(allResolutions);
  };

  const getActionIcon = (action: 'discard' | 'overwrite' | 'version') => {
    switch (action) {
      case 'discard':
        return <Trash2 className="w-5 h-5" />;
      case 'overwrite':
        return <RefreshCw className="w-5 h-5" />;
      case 'version':
        return <GitBranch className="w-5 h-5" />;
    }
  };

  const getActionColor = (action: 'discard' | 'overwrite' | 'version') => {
    switch (action) {
      case 'discard':
        return 'red';
      case 'overwrite':
        return 'orange';
      case 'version':
        return 'green';
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-6 py-5 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-orange/10 ring-1 ring-brand-orange/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-brand-orange" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-1">Duplicate Resume Detected</h2>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  This candidate already exists in the system. Choose how to handle this duplicate.
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs text-gray-500 dark:text-slate-500">
                    File {currentIndex + 1} of {duplicateFiles.length}
                  </span>
                  <div className="flex-1 bg-gray-200 dark:bg-slate-800 rounded-full h-1.5 max-w-xs">
                    <div
                      className="bg-brand-orange h-1.5 rounded-full transition-all"
                      style={{ width: `${((currentIndex + 1) / duplicateFiles.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
             aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-slate-950">
          {/* Candidate Info */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-brand-blue" />
              </div>
              <div>
                <h3 className="text-lg text-gray-900 dark:text-slate-50">{currentFile.candidateName}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-500">Duplicate detected during upload</p>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="grid grid-cols-2 gap-4">
              {/* Existing Resume */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/60 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                  <span className="text-sm text-gray-900 dark:text-slate-50">Existing Resume</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500 dark:text-slate-500">Location</div>
                      <div className="text-sm text-gray-900 dark:text-slate-50">{currentFile.existingLocation}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500 dark:text-slate-500">Upload Date</div>
                      <div className="text-sm text-gray-900 dark:text-slate-50">{currentFile.existingResumeDate}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500 dark:text-slate-500">File Size</div>
                      <div className="text-sm text-gray-900 dark:text-slate-50">{currentFile.existingResumeSize}</div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => currentFile.existingResumeId && handlePreviewExisting(currentFile.existingResumeId)}
                  disabled={!currentFile.existingResumeId || previewLoading === 'existing'}
                  className="w-full mt-3 px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {previewLoading === 'existing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {previewLoading === 'existing' ? 'Loading...' : 'Preview Existing'}
                </button>
              </div>

              {/* New Resume */}
              <div className="bg-brand-blue/5 ring-1 ring-brand-blue/15 border border-transparent rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-brand-blue" />
                  <span className="text-sm text-brand-blue">New Resume (Uploading)</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-800 dark:text-slate-100">File Name</div>
                      <div className="text-sm text-gray-800 dark:text-slate-100 truncate">{currentFile.fileName}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-800 dark:text-slate-100">Upload Date</div>
                      <div className="text-sm text-gray-800 dark:text-slate-100">{currentFile.newResumeDate}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-800 dark:text-slate-100">File Size</div>
                      <div className="text-sm text-gray-800 dark:text-slate-100">{currentFile.newResumeSize}</div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => currentFile.newFile && handlePreviewNew(currentFile.newFile)}
                  disabled={!currentFile.newFile || previewLoading === 'new'}
                  className="w-full mt-3 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {previewLoading === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {previewLoading === 'new' ? 'Loading...' : 'Preview New'}
                </button>
              </div>
            </div>

            {/* Content Changes Detected */}
            {currentFile.contentChanges && currentFile.contentChanges.length > 0 && (
              <div className="mt-4 p-4 bg-brand-orange/5 ring-1 ring-brand-orange/20 border border-transparent rounded-lg">
                <div className="flex items-start gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-brand-orange mt-0.5" />
                  <div>
                    <div className="text-sm text-brand-orange-deep mb-1">Content Differences Detected</div>
                    <ul className="text-xs text-brand-orange-deep space-y-1">
                      {currentFile.contentChanges.map((change, index) => (
                        <li key={index}>• {change}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Selection */}
          <div className="space-y-3">
            <h4 className="text-sm text-gray-700 dark:text-slate-300 mb-3">Choose an action:</h4>

            {/* Option 1: Discard New Resume */}
            <button
              onClick={() => setSelectedAction('discard')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                selectedAction === 'discard'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'discard' ? 'bg-red-100' : 'bg-gray-100 dark:bg-slate-800'
                }`}>
                  <Trash2 className={`w-5 h-5 ${selectedAction === 'discard' ? 'text-red-600' : 'text-gray-600 dark:text-slate-400'}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm mb-1 ${selectedAction === 'discard' ? 'text-red-900' : 'text-gray-900 dark:text-slate-50'}`}>
                    1. Discard New Resume
                  </div>
                  <p className="text-xs text-gray-600 dark:text-slate-400">
                    Keep existing resume unchanged. New resume will be deleted.
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-gray-500 dark:text-slate-500">• Old resume: Unchanged</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500">• New resume: Deleted</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500">• Storage: No impact</span>
                  </div>
                </div>
                {selectedAction === 'discard' && (
                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none"/>
                    </svg>
                  </div>
                )}
              </div>
            </button>

            {/* Option 2: Overwrite Existing Resume */}
            <button
              onClick={() => setSelectedAction('overwrite')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                selectedAction === 'overwrite'
                  ? 'border-brand-orange bg-brand-orange/5 ring-1 ring-brand-orange/20'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'overwrite' ? 'bg-brand-orange/10 ring-1 ring-brand-orange/20' : 'bg-gray-100 dark:bg-slate-800'
                }`}>
                  <RefreshCw className={`w-5 h-5 ${selectedAction === 'overwrite' ? 'text-brand-orange' : 'text-gray-600 dark:text-slate-400'}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm mb-1 ${selectedAction === 'overwrite' ? 'text-brand-orange-deep' : 'text-gray-900 dark:text-slate-50'}`}>
                    2. Overwrite Existing Resume
                  </div>
                  <p className="text-xs text-gray-600 dark:text-slate-400">
                    Replace old resume with new one. Original will be permanently deleted.
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-gray-500 dark:text-slate-500">• Old resume: Deleted</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500">• New resume: Saved</span>
                    <span className="text-xs text-brand-orange-deep">• Consumes 1 upload unit</span>
                  </div>
                </div>
                {selectedAction === 'overwrite' && (
                  <div className="w-5 h-5 bg-brand-orange rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none"/>
                    </svg>
                  </div>
                )}
              </div>
            </button>

            {/* Option 3: Save as New Version */}
            <button
              onClick={() => setSelectedAction('version')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                selectedAction === 'version'
                  ? 'border-brand-cyan bg-brand-cyan/5 ring-1 ring-brand-cyan/15'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'version' ? 'bg-brand-cyan/10 ring-1 ring-brand-cyan/15' : 'bg-gray-100 dark:bg-slate-800'
                }`}>
                  <GitBranch className={`w-5 h-5 ${selectedAction === 'version' ? 'text-brand-cyan' : 'text-gray-600 dark:text-slate-400'}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm mb-1 ${selectedAction === 'version' ? 'text-brand-cyan' : 'text-gray-900 dark:text-slate-50'}`}>
                    3. Save as New Version
                  </div>
                  <p className="text-xs text-gray-600 dark:text-slate-400">
                    Keep both resumes. New resume stored as a versioned update. Recommended for tracking changes.
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-gray-500 dark:text-slate-500">• Old resume: Kept</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500">• New resume: Saved as v2</span>
                    <span className="text-xs text-brand-cyan">• Consumes 1 upload unit</span>
                  </div>
                </div>
                {selectedAction === 'version' && (
                  <div className="w-5 h-5 bg-brand-cyan rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none"/>
                    </svg>
                  </div>
                )}
              </div>
            </button>
          </div>

          {/* Warning */}
          <div className="mt-6 p-4 bg-brand-blue/5 ring-1 ring-brand-blue/15 border border-transparent rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-brand-blue mt-0.5 flex-shrink-0" />
              <div className="text-xs text-brand-blue">
                <strong>Note:</strong> All actions are fully audit logged. Overwriting or saving as a new version will consume 1 resume upload unit from your quota.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 py-3 flex-shrink-0">
          <div className="flex justify-between items-center">
            <button
              onClick={handleSkipAll}
              className="text-sm text-gray-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
            >
              Discard All Remaining ({duplicateFiles.length - currentIndex})
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
              >
                Cancel Upload
              </button>
              <button
                onClick={handleNext}
                disabled={!hasResolvedCurrent}
                className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLastFile ? 'Complete & Upload' : 'Next File'}
                {!isLastFile && <span className="text-xs opacity-75">({duplicateFiles.length - currentIndex - 1} remaining)</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Inline Preview Modal */}
    {showPreviewModal && (
      <div className="fixed inset-0 bg-black/70 dark:bg-black/70 flex items-center justify-center z-[110]" onClick={closePreview}>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-[90vw] h-[85dvh] max-w-[95vw] sm:max-w-4xl flex flex-col tf-round-edges" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-brand-blue" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">{previewTitle}</h3>
            </div>
            <button onClick={closePreview} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Close">
              <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title={previewTitle}
              />
            ) : (
              <div ref={docxContainerRef} className="w-full h-full overflow-auto bg-white dark:bg-slate-900 p-4" />
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
