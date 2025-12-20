'use client';

import ResumeTable from '@/components/ResumeTable';
import { mockResumes, mockFolders } from '@/lib/mockData';
import { useState } from 'react';
import { Resume } from '@/lib/types/types';

export default function MyResumesRoute() {
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
