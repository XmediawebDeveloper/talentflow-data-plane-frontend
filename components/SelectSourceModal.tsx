import { X, Users, Database } from 'lucide-react';
import { useState } from 'react';
import { Resume } from '@/lib/types/types';
import ResumeSelectionModal from './ResumeSelectionModal';

interface SelectSourceModalProps {
  onClose: () => void;
  jobTitle: string;
  myResumes: Resume[];
  internalDbResumes: Resume[];
  onSubmitForScoring: (selectedResumeIds: string[], source: 'my-resumes' | 'internal-db') => void;
}

export default function SelectSourceModal({ 
  onClose, 
  jobTitle, 
  myResumes, 
  internalDbResumes,
  onSubmitForScoring 
}: SelectSourceModalProps) {
  const [selectedSource, setSelectedSource] = useState<'my-resumes' | 'internal-db' | null>(null);

  const handleSelectSource = (source: 'my-resumes' | 'internal-db') => {
    setSelectedSource(source);
  };

  const handleBack = () => {
    setSelectedSource(null);
  };

  const handleSubmitForScoring = (selectedResumeIds: string[]) => {
    if (selectedSource) {
      onSubmitForScoring(selectedResumeIds, selectedSource);
      onClose();
    }
  };

  // If source is selected, show resume selection modal
  if (selectedSource) {
    const resumes = selectedSource === 'my-resumes' ? myResumes : internalDbResumes;
    return (
      <ResumeSelectionModal
        resumes={resumes}
        source={selectedSource}
        jobTitle={jobTitle}
        onClose={onClose}
        onBack={handleBack}
        onSubmitForScoring={handleSubmitForScoring}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-scale-in">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h2 className="text-xl text-gray-900">Select Resume Source</h2>
            <p className="text-sm text-gray-600 mt-1">Choose where to select resumes from</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Job Context */}
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="text-sm text-blue-900 mb-1">Scoring resumes for:</div>
            <div className="text-gray-900">{jobTitle}</div>
          </div>

          {/* Source Options */}
          <div className="space-y-3">
            {/* My Resumes */}
            <button
              onClick={() => handleSelectSource('my-resumes')}
              className="w-full p-5 border-2 border-gray-200 rounded-lg hover:border-gray-800 hover:bg-gray-50 transition-all text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-gray-800 transition-colors">
                  <Users className="w-6 h-6 text-gray-800 group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-gray-900">My Resumes</h3>
                    <span className="text-sm text-gray-600">{myResumes.length} resumes</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Select from your personal resume folders and collections
                  </p>
                </div>
              </div>
            </button>

            {/* Internal Database */}
            <button
              onClick={() => handleSelectSource('internal-db')}
              className="w-full p-5 border-2 border-gray-200 rounded-lg hover:border-green-600 hover:bg-green-50 transition-all text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-600 transition-colors">
                  <Database className="w-6 h-6 text-green-600 group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-gray-900">Internal Database</h3>
                    <span className="text-sm text-gray-600">{internalDbResumes.length} resumes</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Select from organization-wide resume database
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Info */}
          <div className="mt-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>Next steps:</strong> After selecting a source, choose resumes and click "Submit for Scoring" to score them against this job description.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}