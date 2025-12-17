import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { Folder as FolderType, Resume } from '@/lib/types';

interface FolderTreeProps {
  folders: FolderType[];
  selectedFolder: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder: (name: string, parentId?: string) => void;
  onUploadToFolder?: (folderId: string) => void;
  resumes: Resume[];
  width: number;
  onWidthChange: (width: number) => void;
}

export default function FolderTree({
  folders,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
  onUploadToFolder,
  resumes,
  width,
}: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['engineering']);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingSubFolderFor, setCreatingSubFolderFor] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const getResumeCount = (folderId: string) => {
    if (folderId === 'all') return resumes.length;
    return resumes.filter(r => r.folderId === folderId).length;
  };

  const handleCreateFolder = (parentId?: string) => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName, parentId);
      setNewFolderName('');
      setIsCreatingFolder(false);
      setCreatingSubFolderFor(null);
      // Expand parent folder if creating sub-folder
      if (parentId && !expandedFolders.includes(parentId)) {
        setExpandedFolders(prev => [...prev, parentId]);
      }
    }
  };

  const renderFolder = (folder: FolderType, level: number = 0) => {
    const isExpanded = expandedFolders.includes(folder.id);
    const isSelected = selectedFolder === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;
    const count = getResumeCount(folder.id);
    const isCreatingSubFolder = creatingSubFolderFor === folder.id;
    const hasMenu = showFolderMenu === folder.id;

    return (
      <div key={folder.id} className="relative">
        <div
          className={`group w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
            isSelected
              ? 'bg-blue-50 text-blue-600'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => onSelectFolder(folder.id)}
        >
          {hasChildren && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id);
              }}
              className="p-0.5 cursor-pointer"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
          )}
          {!hasChildren && <div className="w-5" />}
          {isExpanded && hasChildren ? (
            <FolderOpen className="w-4 h-4" />
          ) : (
            <Folder className="w-4 h-4" />
          )}
          <span className="flex-1 text-left">{folder.name}</span>
          <span className="text-xs text-gray-500">({count})</span>
          {folder.id !== 'all' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFolderMenu(hasMenu ? null : folder.id);
              }}
              className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-100 text-blue-600 transition-opacity ${
                hasMenu ? 'opacity-100 bg-blue-100' : ''
              }`}
              title="Folder actions"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {hasMenu && folder.id !== 'all' && (
          <div 
            className="absolute right-2 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
            style={{ marginRight: `${8}px` }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onUploadToFolder) {
                  onUploadToFolder(folder.id);
                }
                setShowFolderMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload to Folder
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCreatingSubFolderFor(folder.id);
                setIsCreatingFolder(false);
                setShowFolderMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Subfolder
            </button>
          </div>
        )}

        {isCreatingSubFolder && (
          <div className="mb-2 px-3" style={{ paddingLeft: `${28 + level * 16}px` }}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder(folder.id);
                if (e.key === 'Escape') {
                  setCreatingSubFolderFor(null);
                  setNewFolderName('');
                }
              }}
              placeholder="Sub-folder name..."
              autoFocus
              className="w-full px-2 py-1 text-xs border border-blue-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            <div className="flex gap-1.5 mt-1.5">
              <button
                onClick={() => handleCreateFolder(folder.id)}
                className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setCreatingSubFolderFor(null);
                  setNewFolderName('');
                }}
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {hasChildren && isExpanded && (
          <div>
            {folder.children!.map(child => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="border-r border-gray-200 bg-white p-4"
      style={{ width: `${width}px`, minWidth: '200px', maxWidth: '400px' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-900">Folders</h3>
        <button
          onClick={() => setIsCreatingFolder(true)}
          className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {isCreatingFolder && (
        <div className="mb-3">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }
            }}
            placeholder="Folder name..."
            autoFocus
            className="w-full px-3 py-1.5 text-sm border border-blue-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCreateFolder}
              className="flex-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
            <button
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
              className="flex-1 px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {folders.map(folder => renderFolder(folder))}
      </div>
    </div>
  );
}
