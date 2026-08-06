'use client'

import { X, FolderInput, Download, Trash2, CheckCircle2, Target, ClipboardCheck, Archive, ArchiveRestore, Sparkles, Brain } from 'lucide-react';
import { Folder } from '@/lib/types/types';
import { useState } from 'react';
import { toast } from './ui/enhanced-toast';

interface BulkActionsBarProps {
  selectedCount: number;
  onCancel: () => void;
  onMoveToFolder?: (folderId: string) => void;
  /** Scores the selected resumes against a job — surfaced as "Score Resume". */
  onApplyToJob?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  folders?: Folder[];
  onResumeScoring?: () => void;
  onAssessment?: () => void;
  onArchive?: () => void;
  /** When provided, replaces the Archive button with an Unarchive button —
   * used when the current folder context is "Archived Resumes". */
  onUnarchive?: () => void;
  onAITalentMatch?: () => void;
  /** Invites the selected candidates to a published AI interview. */
  onAIInterview?: () => void;
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
  onUnarchive,
  onAITalentMatch,
  onAIInterview,
}: BulkActionsBarProps) {
  const [showFolderMenu, setShowFolderMenu] = useState(false);

  // `shrink-0` + `whitespace-nowrap` keep every button at its natural width:
  // without them flex squeezed the wider labels, so buttons in the same row
  // ended up different sizes and the icons stopped lining up.
  const actionBtn = "inline-flex shrink-0 items-center justify-center gap-1.5 sm:gap-2 h-9 px-3 sm:px-4 whitespace-nowrap text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all text-xs sm:text-sm font-medium border border-white/15 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";
  // Same metrics as actionBtn — only the colour differs — so the destructive
  // and state-changing buttons sit on the same baseline as the rest.
  const toneBtn = (tone: string) =>
    `inline-flex shrink-0 items-center justify-center gap-1.5 sm:gap-2 h-9 px-3 sm:px-4 whitespace-nowrap text-white ${tone} backdrop-blur-sm rounded-lg transition-all text-xs sm:text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40`;

  return (
    <div className="sticky top-0 z-50 bg-brand-blue shadow-lg shadow-brand-blue/25 border-b border-white/10 ring-1 ring-white/10 animate-fadeIn rounded-xl">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 gap-2 sm:gap-4">
        {/* Left: Selected count + Clear */}
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
            </div>
            <div className="text-white text-xs sm:text-sm font-medium">
              <span className="font-semibold">{selectedCount}</span> resume{selectedCount !== 1 ? 's' : ''} selected
            </div>
          </div>

          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-white/85 hover:text-white text-xs sm:text-sm h-8 px-2.5 sm:px-3 rounded-md hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Clear
          </button>
        </div>

        {/* Right: Action buttons. `items-center` + a uniform button height keeps
            every icon on one baseline; when the group wraps, `gap-y` spaces the
            rows evenly instead of leaving them flush against each other. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 w-full sm:w-auto justify-start sm:justify-end">
          {folders && onMoveToFolder && (
            <div className="relative">
              <button
                onClick={() => setShowFolderMenu(!showFolderMenu)}
                className={actionBtn}
                aria-label="Move to Folder" title="Move to Folder"
              >
                <FolderInput className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden md:inline">Move to Folder</span>
                <span className="md:hidden">Move</span>
              </button>

              {showFolderMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowFolderMenu(false)}
                  />
                  {/* Dropdown menu - opens DOWNWARD */}
                  <div className="absolute top-full mt-2 left-0 w-56 bg-popover text-popover-foreground rounded-lg shadow-2xl border border-border py-1.5 max-h-64 overflow-y-auto z-50">
                    {folders.length === 0 || folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId)).length === 0 ? (
                      <div className="px-3 py-2.5 text-sm text-muted-foreground text-center">
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
                          className="w-full text-left px-3 mx-1 py-2 text-sm text-foreground hover:bg-accent/50 rounded-md transition-colors flex items-center gap-2"
                          style={{ width: 'calc(100% - 8px)' }}
                        >
                          <FolderInput className="w-4 h-4 text-muted-foreground" />
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
              className={actionBtn}
              aria-label="Score Resume" title="Score Resume"
            >
              <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Score Resume</span>
              <span className="md:hidden">Score</span>
            </button>
          )}

          {onResumeScoring && (
            <button
              onClick={onResumeScoring}
              className={actionBtn}
              aria-label="Resume Scoring" title="Resume Scoring"
            >
              <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Resume Scoring</span>
              <span className="md:hidden">Score</span>
            </button>
          )}

          {onAssessment && (
            <button
              onClick={onAssessment}
              className={actionBtn}
              aria-label="Invite Assessment" title="Invite Assessment"
            >
              <ClipboardCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Invite Assessment</span>
              <span className="md:hidden">Invite</span>
            </button>
          )}

          {onAIInterview && (
            <button
              onClick={onAIInterview}
              className={actionBtn}
              aria-label="AI Interview" title="AI Interview"
            >
              <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">AI Interview</span>
              <span className="md:hidden">Interview</span>
            </button>
          )}

          {onAITalentMatch && (
            <button
              onClick={onAITalentMatch}
              className={actionBtn}
              aria-label="AI Talent Match" title="AI Talent Match"
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">AI Talent Match</span>
              <span className="md:hidden">AI Match</span>
            </button>
          )}

          {onDownload && (
            <button
              onClick={onDownload}
              className={actionBtn}
              aria-label="Download" title="Download"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Download</span>
            </button>
          )}

          {onUnarchive ? (
            <button
              onClick={onUnarchive}
              className={`${toneBtn('bg-emerald-500/90 hover:bg-emerald-600')} border border-emerald-400/30`}
              aria-label="Unarchive" title="Unarchive"
            >
              <ArchiveRestore className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Unarchive</span>
            </button>
          ) : onArchive && (
            <button
              onClick={onArchive}
              className={`${toneBtn('bg-amber-500/90 hover:bg-amber-600')} border border-amber-400/30`}
              aria-label="Archive" title="Archive"
            >
              <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Archive</span>
            </button>
          )}

          {onDelete && (
            <>
              {/* `self-center` so the rule stays centred on the button row
                  instead of stretching when the group wraps to two lines. */}
              <div className="hidden sm:block self-center w-px h-6 bg-white/20 mx-0.5 sm:mx-1" />
              <button
                onClick={onDelete}
                className={`${toneBtn('bg-red-500/90 hover:bg-red-600')} border border-red-400/30`}
                aria-label="Delete" title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden md:inline">Delete</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
