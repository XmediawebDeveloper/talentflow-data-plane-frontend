import { X, AlertCircle, Trash2, RefreshCw, GitBranch, FileText, Calendar, User, MapPin, Eye } from 'lucide-react';
import { useState } from 'react';

interface DuplicateFile {
  fileName: string;
  candidateName: string;
  newResumeSize: string;
  newResumeDate: string;
  existingLocation: string;
  existingResumeDate: string;
  existingResumeSize: string;
  contentChanges?: string[];
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-50 to-white border-b border-orange-200 px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-xl text-gray-900 mb-1">Duplicate Resume Detected</h2>
                <p className="text-sm text-gray-600">
                  This candidate already exists in the system. Choose how to handle this duplicate.
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs text-gray-500">
                    File {currentIndex + 1} of {duplicateFiles.length}
                  </span>
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-xs">
                    <div 
                      className="bg-orange-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${((currentIndex + 1) / duplicateFiles.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {/* Candidate Info */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg text-gray-900">{currentFile.candidateName}</h3>
                <p className="text-sm text-gray-500">Duplicate detected during upload</p>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="grid grid-cols-2 gap-4">
              {/* Existing Resume */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-900">Existing Resume</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500">Location</div>
                      <div className="text-sm text-gray-900">{currentFile.existingLocation}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500">Upload Date</div>
                      <div className="text-sm text-gray-900">{currentFile.existingResumeDate}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500">File Size</div>
                      <div className="text-sm text-gray-900">{currentFile.existingResumeSize}</div>
                    </div>
                  </div>
                </div>
                <button className="w-full mt-3 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-white transition-colors flex items-center justify-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview Existing
                </button>
              </div>

              {/* New Resume */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-blue-900">New Resume (Uploading)</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-blue-600">File Name</div>
                      <div className="text-sm text-blue-900 truncate">{currentFile.fileName}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-blue-600">Upload Date</div>
                      <div className="text-sm text-blue-900">{currentFile.newResumeDate}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs text-blue-600">File Size</div>
                      <div className="text-sm text-blue-900">{currentFile.newResumeSize}</div>
                    </div>
                  </div>
                </div>
                <button className="w-full mt-3 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview New
                </button>
              </div>
            </div>

            {/* Content Changes Detected */}
            {currentFile.contentChanges && currentFile.contentChanges.length > 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                  <div>
                    <div className="text-sm text-yellow-900 mb-1">Content Differences Detected</div>
                    <ul className="text-xs text-yellow-700 space-y-1">
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
            <h4 className="text-sm text-gray-700 mb-3">Choose an action:</h4>

            {/* Option 1: Discard New Resume */}
            <button
              onClick={() => setSelectedAction('discard')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                selectedAction === 'discard'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'discard' ? 'bg-red-100' : 'bg-gray-100'
                }`}>
                  <Trash2 className={`w-5 h-5 ${selectedAction === 'discard' ? 'text-red-600' : 'text-gray-600'}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm mb-1 ${selectedAction === 'discard' ? 'text-red-900' : 'text-gray-900'}`}>
                    1. Discard New Resume
                  </div>
                  <p className="text-xs text-gray-600">
                    Keep existing resume unchanged. New resume will be deleted.
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-gray-500">• Old resume: Unchanged</span>
                    <span className="text-xs text-gray-500">• New resume: Deleted</span>
                    <span className="text-xs text-gray-500">• Storage: No impact</span>
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
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'overwrite' ? 'bg-orange-100' : 'bg-gray-100'
                }`}>
                  <RefreshCw className={`w-5 h-5 ${selectedAction === 'overwrite' ? 'text-orange-600' : 'text-gray-600'}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm mb-1 ${selectedAction === 'overwrite' ? 'text-orange-900' : 'text-gray-900'}`}>
                    2. Overwrite Existing Resume
                  </div>
                  <p className="text-xs text-gray-600">
                    Replace old resume with new one. Original will be permanently deleted.
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-gray-500">• Old resume: Deleted</span>
                    <span className="text-xs text-gray-500">• New resume: Saved</span>
                    <span className="text-xs text-orange-600">• Consumes 1 upload unit</span>
                  </div>
                </div>
                {selectedAction === 'overwrite' && (
                  <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
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
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'version' ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <GitBranch className={`w-5 h-5 ${selectedAction === 'version' ? 'text-green-600' : 'text-gray-600'}`} />
                </div>
                <div className="flex-1">
                  <div className={`text-sm mb-1 ${selectedAction === 'version' ? 'text-green-900' : 'text-gray-900'}`}>
                    3. Save as New Version
                  </div>
                  <p className="text-xs text-gray-600">
                    Keep both resumes. New resume stored as a versioned update. Recommended for tracking changes.
                  </p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-gray-500">• Old resume: Kept</span>
                    <span className="text-xs text-gray-500">• New resume: Saved as v2</span>
                    <span className="text-xs text-green-600">• Consumes 1 upload unit</span>
                  </div>
                </div>
                {selectedAction === 'version' && (
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none"/>
                    </svg>
                  </div>
                )}
              </div>
            </button>
          </div>

          {/* Warning */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-900">
                <strong>Note:</strong> All actions are fully audit logged. Overwriting or saving as a new version will consume 1 resume upload unit from your quota.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-white">
          <div className="flex justify-between items-center">
            <button
              onClick={handleSkipAll}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Discard All Remaining ({duplicateFiles.length - currentIndex})
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel Upload
              </button>
              <button
                onClick={handleNext}
                disabled={!hasResolvedCurrent}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLastFile ? 'Complete & Upload' : 'Next File'}
                {!isLastFile && <span className="text-xs opacity-75">({duplicateFiles.length - currentIndex - 1} remaining)</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
