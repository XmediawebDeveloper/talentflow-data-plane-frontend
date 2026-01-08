'use client'

import { X, FolderInput, Briefcase, Download, Trash2, CheckCircle2, Target, ClipboardCheck } from 'lucide-react';
import { Folder } from '@/lib/types/types';
import { useState } from 'react';
import { toast } from './ui/enhanced-toast';

interface BulkActionsBarProps {
  selectedCount: number;
  onCancel: () => void;
  onMoveToFolder?: (folderId: string) => void;
  onApplyToJob: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  folders?: Folder[];
  onResumeScoring?: () => void;
  onAssessment?: () => void;
}

export default function BulkActionsBar({
  selectedCount,
  onCancel,
  onMoveToFolder,
  onApplyToJob,
  onDelete,
  onDownload,
  folders,
  onResumeScoring,
  onAssessment,
}: BulkActionsBarProps) {
  const [showFolderMenu, setShowFolderMenu] = useState(false);

  return (
    <div className="mb-4 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg border border-blue-500 animate-fadeIn overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-white">
                <span className="font-medium">{selectedCount}</span> resume{selectedCount !== 1 ? 's' : ''} selected
              </div>
              <div className="text-blue-100 text-xs">Choose an action below</div>
            </div>
          </div>
          
          <button
            onClick={onCancel}
            className="text-white/90 hover:text-white text-sm flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
            Clear Selection
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {folders && onMoveToFolder && (
            <div className="relative">
              <button
                onClick={() => setShowFolderMenu(!showFolderMenu)}
                className="flex items-center gap-2 px-4 py-2.5 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
              >
                <FolderInput className="w-4 h-4" />
                Move to Folder
              </button>
              
              {showFolderMenu && (
                <div className="absolute top-full mt-2 left-0 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 max-h-64 overflow-y-auto z-50">
                  {folders?.filter(f => f.id !== 'all').map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        onMoveToFolder?.(folder.id);
                        setShowFolderMenu(false);
                        // ✅ MOVE SUCCESS FEEDBACK
                        toast.success({
                          title: 'Resumes moved successfully!',
                          description: `${selectedCount} resume${selectedCount > 1 ? 's' : ''} moved to "${folder.name}"`,
                          action: {
                            label: 'Undo',
                            onClick: () => {
                              toast.info('Undo feature coming soon!');
                            }
                          }
                        });
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors flex items-center gap-2"
                    >
                      <FolderInput className="w-4 h-4 text-gray-400" />
                      {folder.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <button
            onClick={onApplyToJob}
            className="flex items-center gap-2 px-4 py-2.5 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
          >
            <Briefcase className="w-4 h-4" />
            Apply to Job
          </button>

          {onResumeScoring && (
            <button
              onClick={onResumeScoring}
              className="flex items-center gap-2 px-4 py-2.5 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
            >
              <Target className="w-4 h-4" />
              Resume Scoring
            </button>
          )}

          {onAssessment && (
            <button
              onClick={onAssessment}
              className="flex items-center gap-2 px-4 py-2.5 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
            >
              <ClipboardCheck className="w-4 h-4" />
              Assessment
            </button>
          )}
          
          {onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-4 py-2.5 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          )}
          
          <div className="w-px h-8 bg-white/30 mx-1" />
          
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2.5 text-white bg-red-500/90 backdrop-blur-sm rounded-lg hover:bg-red-600 transition-all text-sm shadow-sm border border-red-400/30"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          
          <div className="w-px h-8 bg-white/30 mx-1" />
          
        </div>
      </div>
    </div>
  );
}