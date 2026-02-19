'use client'

import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Upload, Edit2, Trash2, LayoutGrid, Archive } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { Folder as FolderType, Resume } from '@/lib/types/types';
import { toast } from 'sonner';

// Max folder depth (root → level1 → level2 → level3 = 3 levels of nesting)
const MAX_FOLDER_DEPTH = 3;

// Drag item type for resumes
const RESUME_DRAG_TYPE = 'RESUME';

interface DragItem {
  id: string;
  ids: string[];
}

// Droppable folder item component
interface DroppableFolderItemProps {
  folder: FolderType;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  count: number;
  hasMenu: boolean;
  onSelectFolder: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onShowMenu: (id: string | null) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  children?: React.ReactNode;
}

function DroppableFolderItem({
  folder,
  level,
  isExpanded,
  isSelected,
  hasChildren,
  count,
  hasMenu,
  onSelectFolder,
  onToggleFolder,
  onShowMenu,
  onMoveToFolder,
  children,
}: DroppableFolderItemProps) {
  // Block dropping on "All Resumes" and "Root" folder
  const isBlockedFolder = folder.id === 'all' ||
    (folder.name.toLowerCase() === 'root' && !folder.parentId);

  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: RESUME_DRAG_TYPE,
    drop: (item) => {
      const resumeIds = item.ids && item.ids.length > 0 ? item.ids : [item.id];
      if (onMoveToFolder) {
        onMoveToFolder(resumeIds, folder.id);
      }
    },
    // Cannot drop on "All Resumes" or "Root" folder
    canDrop: () => !isBlockedFolder,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const isDropTarget = isOver && canDrop;

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      className={`group w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
        isDropTarget
          ? 'bg-blue-100 border-2 border-blue-500 border-dashed'
          : isSelected
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
            onToggleFolder(folder.id);
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
      {folder.id === 'all' ? (
        <LayoutGrid className="w-4 h-4 text-blue-600" />
      ) : folder.name === 'Archived Resumes' && !folder.parentId ? (
        <Archive className="w-4 h-4 text-amber-600" />
      ) : isExpanded && hasChildren ? (
        <FolderOpen className="w-4 h-4" />
      ) : (
        <Folder className="w-4 h-4" />
      )}
      <span className="flex-1 text-left">{folder.name}</span>
      <span className="text-xs text-gray-500">({count})</span>
      {folder.id !== 'all' && !(folder.name.toLowerCase() === 'root' && !folder.parentId) && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShowMenu(hasMenu ? null : folder.id);
          }}
          className={`opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-100 text-blue-600 transition-opacity ${
            hasMenu ? 'opacity-100 bg-blue-100' : ''
          }`}
          title="Folder actions"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
      {children}
    </div>
  );
}

interface FolderTreeProps {
  folders: FolderType[];
  selectedFolder: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder: (name: string, parentId?: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onUploadToFolder?: (folderId: string) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  selectedResumes?: string[];
  resumes: Resume[];
  width: number;
  onWidthChange: (width: number) => void;
}

export default function FolderTree({
  folders,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onUploadToFolder,
  onMoveToFolder,
  selectedResumes = [],
  resumes,
  width,
}: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['engineering']);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingSubFolderFor, setCreatingSubFolderFor] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Helper function to flatten folder tree for depth calculation
  const flattenFolders = useCallback((folderList: FolderType[]): FolderType[] => {
    const result: FolderType[] = [];
    const traverse = (items: FolderType[]) => {
      for (const folder of items) {
        result.push(folder);
        if (folder.children && folder.children.length > 0) {
          traverse(folder.children);
        }
      }
    };
    traverse(folderList);
    return result;
  }, []);

  // Calculate the depth of a folder (0 = root level)
  const getFolderDepth = useCallback((folderId: string): number => {
    const allFolders = flattenFolders(folders);
    let depth = 0;
    let current = allFolders.find(f => f.id === folderId);

    while (current?.parentId) {
      depth++;
      current = allFolders.find(f => f.id === current!.parentId);
    }

    return depth;
  }, [folders, flattenFolders]);

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
    // Ignore if parentId is an event object (from onClick handler)
    const actualParentId = typeof parentId === 'string' ? parentId : undefined;

    if (newFolderName.trim()) {
      // Check depth limit if creating a subfolder
      if (actualParentId) {
        const parentDepth = getFolderDepth(actualParentId);
        // Parent at depth 2 means child would be at depth 3, which is the max
        if (parentDepth >= MAX_FOLDER_DEPTH - 1) {
          toast.error(`Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)`);
          return;
        }
      }

      onCreateFolder(newFolderName, actualParentId);
      setNewFolderName('');
      setIsCreatingFolder(false);
      setCreatingSubFolderFor(null);
      // Expand parent folder if creating sub-folder
      if (actualParentId && !expandedFolders.includes(actualParentId)) {
        setExpandedFolders(prev => [...prev, actualParentId]);
      }
    }
  };

  const handleRename = (folderId: string) => {
    if (renameValue.trim()) {
      onRenameFolder(folderId, renameValue);
      setRenamingFolderId(null);
      setRenameValue('');
    }
  };

  const renderFolder = (folder: FolderType, level: number = 0) => {
    const isExpanded = expandedFolders.includes(folder.id);
    const isSelected = selectedFolder === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;
    // Use folder.count from backend API instead of recalculating from current page resumes
    const count = folder.count || 0;
    const isCreatingSubFolder = creatingSubFolderFor === folder.id;
    const hasMenu = showFolderMenu === folder.id;
    const isRenaming = renamingFolderId === folder.id;
    const folderDepth = getFolderDepth(folder.id);
    const canCreateSubfolder = folderDepth < MAX_FOLDER_DEPTH - 1;

    return (
      <div key={folder.id} className="relative">
        {isRenaming ? (
          // Inline rename mode
          <div className="px-3 py-2" style={{ paddingLeft: `${12 + level * 16}px` }}>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(folder.id);
                if (e.key === 'Escape') {
                  setRenamingFolderId(null);
                  setRenameValue('');
                }
              }}
              onBlur={() => handleRename(folder.id)}
              placeholder="Folder name..."
              autoFocus
              className="w-full px-2 py-1 text-sm border border-blue-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
        ) : (
          <DroppableFolderItem
            folder={folder}
            level={level}
            isExpanded={isExpanded}
            isSelected={isSelected}
            hasChildren={hasChildren}
            count={count}
            hasMenu={hasMenu}
            onSelectFolder={onSelectFolder}
            onToggleFolder={toggleFolder}
            onShowMenu={setShowFolderMenu}
            onMoveToFolder={onMoveToFolder}
          />
        )}

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
                if (!canCreateSubfolder) {
                  toast.error(`Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)`);
                  setShowFolderMenu(null);
                  return;
                }
                setCreatingSubFolderFor(folder.id);
                setIsCreatingFolder(false);
                setShowFolderMenu(null);
              }}
              disabled={!canCreateSubfolder}
              className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                canCreateSubfolder
                  ? 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                  : 'text-gray-400 cursor-not-allowed'
              }`}
              title={!canCreateSubfolder ? `Maximum folder depth reached (${MAX_FOLDER_DEPTH} levels)` : ''}
            >
              <Plus className="w-4 h-4" />
              Create Subfolder
              {!canCreateSubfolder && <span className="text-xs text-gray-400 ml-auto">(max depth)</span>}
            </button>
            {/* Only show rename option if not root folder or Archived Resumes folder */}
            {!(folder.name.toLowerCase() === 'root' && !folder.parentId) && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameValue(folder.name);
                  setRenamingFolderId(folder.id);
                  setShowFolderMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Rename Folder
              </button>
            )}
            {/* Only show delete option if not root folder or Archived Resumes folder */}
            {!(folder.name.toLowerCase() === 'root' && !folder.parentId) && !(folder.name === 'Archived Resumes' && !folder.parentId) && (
              <>
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFolder(folder.id);
                    setShowFolderMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Folder
                </button>
              </>
            )}
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
      className="border-b md:border-b-0 md:border-r border-gray-200 bg-white p-3 sm:p-4 max-md:!w-full max-md:!max-w-full max-md:!min-w-0"
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
              onClick={() => handleCreateFolder()}
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
