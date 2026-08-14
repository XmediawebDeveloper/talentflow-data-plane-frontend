'use client'

import { FolderInput, Download, Trash2, Target, ClipboardCheck, Archive, ArchiveRestore, Sparkles, Brain } from 'lucide-react';
import { Folder } from '@/lib/types/types';
import { useState } from 'react';
import { toast } from './ui/enhanced-toast';

interface BulkActionsBarProps {
  /** Kept on the interface so callers don't have to change: the bar no longer
   *  prints the count or offers a Clear button — the row is actions only, and
   *  selection is cleared from the checkboxes. */
  selectedCount?: number;
  onCancel?: () => void;
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
  // ended up different sizes and the icons stopped lining up. Compact metrics
  // (32px tall, 10/12px of side padding, one text size) so the whole set fits
  // on one line at more widths before the row has to scroll.
  const actionBtn = "inline-flex shrink-0 items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3 whitespace-nowrap text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-md transition-all text-xs font-medium border border-white/15 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";
  // Same metrics as actionBtn — only the colour differs — so the destructive
  // and state-changing buttons sit on the same baseline as the rest.
  const toneBtn = (tone: string) =>
    `inline-flex shrink-0 items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3 whitespace-nowrap text-white ${tone} backdrop-blur-sm rounded-md transition-all text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40`;

  return (
    <div className="sticky top-0 z-50 bg-brand-blue shadow-lg shadow-brand-blue/25 border-b border-white/10 ring-1 ring-white/10 animate-fadeIn rounded-xl">
      {/* One row, always. The actions never wrap to a second line — when the
          bar is too narrow for all of them it scrolls sideways instead, which
          keeps the icons on a single baseline at every width. Equal padding at
          both ends and one gap value throughout, so the row reads as a single
          evenly spaced group.

          The scroll container has to stand down while the folder menu is open:
          `overflow-x` clips on both axes, so an absolutely positioned dropdown
          inside it would be cut off at the bar's edge. */}
      <div
        className={`px-3 py-2 ${
          showFolderMenu ? 'overflow-visible' : 'overflow-x-auto scrollbar-auto-hide'
        }`}
      >
        {/* `w-max mx-auto` centres the group with equal space either side while
            it fits, and — unlike `justify-center` — the auto margins collapse
            once it doesn't, so the first button can never end up scrolled off
            the left with no way back to it. */}
        <div className="flex w-max mx-auto items-center gap-2">
          {folders && onMoveToFolder && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowFolderMenu(!showFolderMenu)}
                className={actionBtn}
                aria-label="Move to Folder" title="Move to Folder"
              >
                <FolderInput className="w-3.5 h-3.5" />
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
              <Target className="w-3.5 h-3.5" />
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
              <Target className="w-3.5 h-3.5" />
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
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Invite Assessment</span>
              <span className="md:hidden">Invite</span>
            </button>
          )}

          {onAIInterview && (
            <button
              onClick={onAIInterview}
              className={actionBtn}
              aria-label="Invite AI Interview" title="Invite AI Interview"
            >
              <Brain className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Invite AI Interview</span>
              {/* Short form for narrow widths, same shape as Invite Assessment's. */}
              <span className="md:hidden">Invite AI</span>
            </button>
          )}

          {onAITalentMatch && (
            <button
              onClick={onAITalentMatch}
              className={actionBtn}
              aria-label="AI Talent Match" title="AI Talent Match"
            >
              <Sparkles className="w-3.5 h-3.5" />
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
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Download</span>
            </button>
          )}

          {onUnarchive ? (
            <button
              onClick={onUnarchive}
              className={`${toneBtn('bg-emerald-500/90 hover:bg-emerald-600')} border border-emerald-400/30`}
              aria-label="Unarchive" title="Unarchive"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Unarchive</span>
            </button>
          ) : onArchive && (
            <button
              onClick={onArchive}
              className={`${toneBtn('bg-amber-500/90 hover:bg-amber-600')} border border-amber-400/30`}
              aria-label="Archive" title="Archive"
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Archive</span>
            </button>
          )}

          {onDelete && (
            <>
              {/* `shrink-0` like the buttons — in a nowrap row a plain divider
                  would be squeezed to nothing. */}
              <div className="hidden sm:block shrink-0 self-center w-px h-5 bg-white/20" />
              <button
                onClick={onDelete}
                className={`${toneBtn('bg-red-500/90 hover:bg-red-600')} border border-red-400/30`}
                aria-label="Delete" title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Delete</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
