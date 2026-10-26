import { ChevronRight, Plus, ChevronDown, GitBranch } from 'lucide-react';
import { useState } from 'react';

interface PageHeaderProps {
  onUploadClick: () => void;
  onVersionClick?: () => void;
}

export default function PageHeader({ onUploadClick, onVersionClick }: PageHeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="flex items-center flex-wrap text-sm text-muted-foreground mb-2 sm:mb-3 gap-y-1">
        <span>Home</span>
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 mx-1.5 sm:mx-2 shrink-0" />
        <span>Recruiters</span>
        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 mx-1.5 sm:mx-2 shrink-0" />
        <span className="text-foreground font-medium">My Resumes</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">My Resume Database</h1>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Version Button */}
          <button
            onClick={onVersionClick}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 sm:px-5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            <GitBranch className="w-4 h-4" />
            Version
          </button>

          {/* Upload Resume Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 sm:px-5 w-full sm:w-auto rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" />
              Upload Resume
              <ChevronDown className="w-4 h-4 opacity-80" />
            </button>

            {showDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1.5rem)] max-h-[70dvh] overflow-y-auto bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1.5 z-20">
                  <button
                    onClick={() => {
                      onUploadClick();
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent/50 rounded-md mx-1 transition-colors"
                  >
                    Single Resume Upload
                  </button>
                  <button
                    onClick={() => {
                      onUploadClick();
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent/50 rounded-md mx-1 transition-colors"
                  >
                    Bulk Resume Upload
                  </button>
                  <div className="border-t border-border my-1.5" />
                  <button className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent/50 rounded-md mx-1 transition-colors">
                    Create Folder
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}