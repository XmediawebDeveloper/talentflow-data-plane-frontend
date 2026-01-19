import { ChevronRight, Plus, ChevronDown, GitBranch } from 'lucide-react';
import { useState } from 'react';

interface PageHeaderProps {
  onUploadClick: () => void;
  onVersionClick?: () => void;
}

export default function PageHeader({ onUploadClick, onVersionClick }: PageHeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center text-sm text-gray-500 mb-3">
        <span>Home</span>
        <ChevronRight className="w-4 h-4 mx-2" />
        <span>Recruiters</span>
        <ChevronRight className="w-4 h-4 mx-2" />
        <span className="text-gray-900">My Resumes</span>
      </div>
      
      <div className="flex items-center justify-between">
        <h1 className="text-gray-900">My Resume Database</h1>
        
        <div className="flex items-center gap-3">
          {/* Version Button */}
          <button
            onClick={onVersionClick}
            className="flex items-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-md hover:bg-gray-900 transition-colors"
          >
            <GitBranch className="w-5 h-5" />
            Version
          </button>

          {/* Upload Resume Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-md hover:bg-gray-900 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Upload Resume
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-10">
                <button
                  onClick={() => {
                    onUploadClick();
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Single Resume Upload
                </button>
                <button
                  onClick={() => {
                    onUploadClick();
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Bulk Resume Upload
                </button>
                <div className="border-t border-gray-200 my-2" />
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Create Folder
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}