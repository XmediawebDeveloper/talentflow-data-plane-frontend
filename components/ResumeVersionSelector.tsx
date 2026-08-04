'use client'

import { useState } from 'react';
import { X, FileText, Calendar, User, Clock, CheckCircle2 } from 'lucide-react';
import { Resume, ResumeVersion } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface ResumeVersionSelectorProps {
  resume: Resume;
  onSelect: (versionId: string) => void;
  onClose: () => void;
}

export default function ResumeVersionSelector({ resume, onSelect, onClose }: ResumeVersionSelectorProps) {
  const versions = resume.versions || [];

  // Sort versions by date (newest first)
  const sortedVersions = [...versions].sort((a, b) =>
    new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
  );

  const latestVersionId = sortedVersions[0]?.id;

  // Track selected version (default to latest)
  const [selectedVersionId, setSelectedVersionId] = useState<string>(latestVersionId || '');

  const handleConfirm = () => {
    if (selectedVersionId) {
      onSelect(selectedVersionId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Select Resume Version</h2>
            <p className="text-sm text-gray-600">
              Choose which version of <span className="font-medium">{resume.name}</span>&apos;s resume to apply to the job
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auto-select notice */}
        <div className="px-6 pt-4 pb-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-blue-900 font-medium mb-1">Latest version auto-selected</p>
              <p className="text-blue-700">
                The most recent version is selected by default. You can choose a different version below.
              </p>
            </div>
          </div>
        </div>

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {sortedVersions.map((version, index) => {
            const isLatest = version.id === latestVersionId;
            const isSelected = version.id === selectedVersionId;
            const versionNumber = sortedVersions.length - index;

            return (
              <button
                key={version.id}
                onClick={() => setSelectedVersionId(version.id)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600 ring-offset-2'
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <FileText className={`w-6 h-6 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">
                        Version {versionNumber}
                      </h3>
                      {isLatest && (
                        <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full">
                          Latest
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{formatISTDate(version.uploadDate)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{version.uploadedBy}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{version.name}</span>
                      </div>
                    </div>

                    {version.size && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>Size: {version.size}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-blue-600' : 'bg-gray-200'
                    }`}>
                      <CheckCircle2 className={`w-5 h-5 ${
                        isSelected ? 'text-white' : 'text-gray-400'
                      }`} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {sortedVersions.length} version{sortedVersions.length !== 1 ? 's' : ''} available
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedVersionId}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm & Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
