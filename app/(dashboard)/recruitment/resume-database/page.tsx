'use client';

import ResumeTable from '@/components/ResumeTable';
import { mockResumes, mockFolders } from '@/lib/mockData';
import { useState } from 'react';
import { Database } from 'lucide-react';

export default function ResumeDatabaseRoute() {
  const [resumes, setResumes] = useState(mockResumes);
  const [folders] = useState(mockFolders);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);

  const handleSelectResume = (id: string) => {
    setSelectedResumes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedResumes(selected ? resumes.map(r => r.id) : []);
  };

  const handleDelete = (id: string) => {
    setResumes(prev => prev.filter(r => r.id !== id));
    setSelectedResumes(prev => prev.filter(r => r !== id));
  };

  const handleMoveToFolder = (resumeIds: string[], folderId: string) => {
    setResumes(prev => prev.map(r =>
      resumeIds.includes(r.id) ? { ...r, folderId } : r
    ));
  };

  return (
    <div className="flex-1 p-6 bg-gray-50">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg flex items-center justify-center shadow-md">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Internal Resume Database</h1>
            <p className="text-sm text-gray-600">Access your organization&apos;s centralized resume pool</p>
          </div>
        </div>
      </div>
      <ResumeTable
        resumes={resumes}
        selectedResumes={selectedResumes}
        onSelectResume={handleSelectResume}
        onSelectAll={handleSelectAll}
        onQuickView={(resume) => console.log('Quick view:', resume)}
        onApplyToJob={(resume) => console.log('Apply to job:', resume)}
        onDelete={handleDelete}
        onMoveToFolder={handleMoveToFolder}
        folders={folders}
      />
    </div>
  );
}
