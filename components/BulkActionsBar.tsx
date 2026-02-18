'use client'

import { X, FolderInput, Briefcase, Download, Trash2, CheckCircle2, Target, ClipboardCheck, Archive, Sparkles } from 'lucide-react';
import { Folder } from '@/lib/types/types';
import { useState } from 'react';
import { toast } from './ui/enhanced-toast';

interface BulkActionsBarProps {
  selectedCount: number;
  onCancel: () => void;
  onMoveToFolder?: (folderId: string) => void;
  onApplyToJob?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  folders?: Folder[];
  onResumeScoring?: () => void;
  onAssessment?: () => void;
  onArchive?: () => void;
  onAITalentMatch?: () => void;
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
  onArchive,
  onAITalentMatch,
}: BulkActionsBarProps) {
  const [showFolderMenu, setShowFolderMenu] = useState(false);

  return (
    <div className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg border-b border-blue-500 animate-fadeIn">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-white text-sm">
                <span className="font-semibold">{selectedCount}</span> resume{selectedCount !== 1 ? 's' : ''} selected
              </div>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="text-white/90 hover:text-white text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          {folders && onMoveToFolder && (
            <div className="relative">
              <button
                onClick={() => setShowFolderMenu(!showFolderMenu)}
                className="flex items-center gap-2 px-4 py-2 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
              >
                <FolderInput className="w-4 h-4" />
                Move to Folder
              </button>

              {showFolderMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowFolderMenu(false)}
                  />
                  {/* Dropdown menu - opens DOWNWARD */}
                  <div className="absolute top-full mt-2 left-0 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 max-h-64 overflow-y-auto z-50">
                    {folders.length === 0 || folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId)).length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        No folders available
                      </div>
                    ) : (
                      folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId)).map(folder => (
                        <button
                          key={folder.id}
                          onClick={() => {
                            onMoveToFolder(folder.id);
                            setShowFolderMenu(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors flex items-center gap-2"
                        >
                          <FolderInput className="w-4 h-4 text-gray-400" />
                          {folder.name}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {onApplyToJob && (
            <button
              onClick={onApplyToJob}
              className="flex items-center gap-2 px-4 py-2 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
            >
              <Briefcase className="w-4 h-4" />
              Apply to Job
            </button>
          )}

          {onResumeScoring && (
            <button
              onClick={onResumeScoring}
              className="flex items-center gap-2 px-4 py-2 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
            >
              <Target className="w-4 h-4" />
              Resume Scoring
            </button>
          )}

          {onAssessment && (
            <button
              onClick={onAssessment}
              className="flex items-center gap-2 px-4 py-2 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
            >
              <ClipboardCheck className="w-4 h-4" />
              Assessment
            </button>
          )}

          {onAITalentMatch && (
            <button
              onClick={onAITalentMatch}
              className="flex items-center gap-2 px-4 py-2 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
            >
              <Sparkles className="w-4 h-4" />
              AI Talent Match
            </button>
          )}

          {onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-4 py-2 text-white bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all text-sm shadow-sm border border-white/20"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          )}

          {onArchive && (
            <button
              onClick={onArchive}
              className="flex items-center gap-2 px-4 py-2 text-white bg-amber-500/90 backdrop-blur-sm rounded-lg hover:bg-amber-600 transition-all text-sm shadow-sm border border-amber-400/30"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          )}

          {onDelete && (
            <>
              <div className="w-px h-6 bg-white/30 mx-1" />
              <button
                onClick={onDelete}
                className="flex items-center gap-2 px-4 py-2 text-white bg-red-500/90 backdrop-blur-sm rounded-lg hover:bg-red-600 transition-all text-sm shadow-sm border border-red-400/30"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}