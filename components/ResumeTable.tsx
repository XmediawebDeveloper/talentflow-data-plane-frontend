'use client';

import { Eye, Briefcase, Download, MoreHorizontal, Paperclip, Upload, Zap, FileSearch } from 'lucide-react';
import { useState } from 'react';
import { Resume, Folder } from '@/lib/types/types';
import { EmptyState } from '@/components/ui/empty-state';
import Pagination from './Pagination';
import { usePagination } from '@/lib/hooks/usePagination';

interface ResumeTableProps {
  resumes: Resume[];
  selectedResumes: string[];
  onSelectResume: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onQuickView: (resume: Resume) => void;
  onApplyToJob: (resume: Resume) => void;
  onDelete: (id: string) => void;
  onMoveToFolder: (resumeIds: string[], folderId: string) => void;
  folders: Folder[];
  selectionMode?: boolean;
  onApplySelected?: () => void;
  onViewDetails?: (resume: Resume) => void;
}

export default function ResumeTable({
  resumes,
  selectedResumes,
  onSelectResume,
  onSelectAll,
  onQuickView,
  onApplyToJob,
  onDelete,
  onMoveToFolder,
  folders,
  selectionMode = false,
  onApplySelected,
  onViewDetails,
}: ResumeTableProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Pagination
  const {
    paginatedItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    changeItemsPerPage,
    totalItems,
    startIndex,
    endIndex,
  } = usePagination({ items: resumes, initialItemsPerPage: 25 });

  const allSelected = resumes.length > 0 && resumes.every(r => selectedResumes.includes(r.id));
  const someSelected = selectedResumes.length > 0 && !allSelected;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
    
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffHours < 48) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (resumes.length === 0) {
    return (
      <EmptyState
        icon={FileSearch}
        title="No resumes found"
        description="We couldn't find any resumes matching your search criteria. Try adjusting your filters or search terms."
        action={{
          label: 'Clear all filters',
          onClick: () => {
            // This would be handled by parent component
            window.location.reload();
          },
          variant: 'secondary'
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="w-12 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                ref={input => {
                  if (input) input.indeterminate = someSelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
              />
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Candidate Name
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Phone
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Skills
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Experience
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Source
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Upload Date
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Uploaded By
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Files
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {paginatedItems.map((resume) => (
            <tr
              key={resume.id}
              className={`hover:bg-gray-50 transition-colors ${
                selectedResumes.includes(resume.id) ? 'bg-gray-50' : ''
              }`}
            >
              <td className="px-4 py-4">
                <input
                  type="checkbox"
                  checked={selectedResumes.includes(resume.id)}
                  onChange={() => onSelectResume(resume.id)}
                  className="rounded border-gray-300 text-gray-800 focus:ring-gray-600"
                />
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700">
                    {resume.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    {onViewDetails ? (
                      <button
                        onClick={() => onViewDetails(resume)}
                        className="text-sm text-gray-900 hover:text-gray-800 hover:underline text-left transition-colors"
                      >
                        {resume.name}
                      </button>
                    ) : (
                      <div className="text-sm text-gray-900">{resume.name}</div>
                    )}
                    <div className="text-xs text-gray-500">{resume.title}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 text-sm text-gray-700">{resume.email}</td>
              <td className="px-4 py-4 text-sm text-gray-700">{resume.phone}</td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-1">
                  {resume.skills.slice(0, 4).map((skill, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-300"
                    >
                      {skill}
                    </span>
                  ))}
                  {resume.skills.length > 4 && (
                    <span className="inline-flex items-center px-2.5 py-0.5 text-xs text-gray-800">
                      +{resume.skills.length - 4} more
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-4 text-sm text-gray-700">{resume.experience}</td>
              <td className="px-4 py-4">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs ${
                    resume.source === 'Manual'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-gray-50 text-gray-800'
                  }`}
                >
                  {resume.source === 'Manual' ? (
                    <Upload className="w-3 h-3" />
                  ) : (
                    <Zap className="w-3 h-3" />
                  )}
                  {resume.source}
                </span>
              </td>
              <td className="px-4 py-4 text-sm text-gray-700">
                {formatDate(resume.uploadDate)}
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-gray-700 flex items-center justify-center text-xs text-white">
                    {resume.uploadedBy.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="text-sm text-gray-700">{resume.uploadedBy}</span>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-1 text-sm text-gray-700">
                  <Paperclip className="w-4 h-4" />
                  {resume.attachments}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  {selectionMode ? (
                    <button
                      onClick={() => {
                        onSelectResume(resume.id);
                        if (onApplySelected) {
                          onApplySelected();
                        }
                      }}
                      className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm flex items-center gap-2"
                    >
                      <Briefcase className="w-4 h-4" />
                      Apply to Job
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onQuickView(resume)}
                        className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Quick View Resume"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onApplyToJob(resume)}
                        className="p-1.5 text-gray-800 hover:bg-gray-50 rounded transition-colors"
                        title="Apply to Job"
                      >
                        <Briefcase className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenu(activeMenu === resume.id ? null : resume.id)}
                          className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          title="More Options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {activeMenu === resume.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10">
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              Edit Details
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              Move to Folder
                            </button>
                            <button
                              onClick={() => {
                                onDelete(resume.id);
                                setActiveMenu(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              Delete Resume
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={changeItemsPerPage}
        />
      )}
    </div>
  );
}