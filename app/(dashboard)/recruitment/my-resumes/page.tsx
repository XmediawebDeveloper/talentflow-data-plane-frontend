'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Eye,
  Download,
  FolderPlus,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
  CloudUpload,
  File,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  GraduationCap,
  Clock,
  ChevronDown
} from 'lucide-react';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder, UploadBatchResponse } from '@/lib/services/resumeService';
import { toast } from 'sonner';

interface UploadingFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  resume?: ApiResume;
}

export default function MyResumesPage() {
  const [resumes, setResumes] = useState<ApiResume[]>([]);
  const [folders, setFolders] = useState<ApiFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick view modal
  const [selectedResumeForView, setSelectedResumeForView] = useState<ApiResume | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resumeResponse, folderResponse] = await Promise.all([
        resumeService.list({ page_size: 100 }),
        folderService.list().catch(() => []),
      ]);
      setResumes(resumeResponse.items);
      setFolders(Array.isArray(folderResponse) ? folderResponse : []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load resumes');
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf' ||
              file.type === 'application/msword' ||
              file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    if (files.length > 0) {
      addFilesToUpload(files);
      setShowUploadModal(true);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      addFilesToUpload(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addFilesToUpload = (files: File[]) => {
    const newFiles: UploadingFile[] = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      status: 'pending',
      progress: 0,
    }));
    setUploadingFiles(prev => [...prev, ...newFiles]);
  };

  const removeFileFromUpload = (id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFiles = async () => {
    setIsUploading(true);

    for (const uploadFile of uploadingFiles) {
      if (uploadFile.status !== 'pending') continue;

      setUploadingFiles(prev =>
        prev.map(f => f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 30 } : f)
      );

      try {
        const resume = await resumeService.upload(
          uploadFile.file,
          selectedFolder !== 'all' ? selectedFolder : undefined
        );

        setUploadingFiles(prev =>
          prev.map(f => f.id === uploadFile.id
            ? { ...f, status: 'completed', progress: 100, resume }
            : f
          )
        );

        // Add to resumes list
        setResumes(prev => [resume, ...prev]);
      } catch (error: any) {
        setUploadingFiles(prev =>
          prev.map(f => f.id === uploadFile.id
            ? { ...f, status: 'error', progress: 0, error: error.message || 'Upload failed' }
            : f
          )
        );
      }
    }

    setIsUploading(false);

    // Check if all completed
    const allCompleted = uploadingFiles.every(f => f.status === 'completed' || f.status === 'error');
    if (allCompleted) {
      const successCount = uploadingFiles.filter(f => f.status === 'completed').length;
      if (successCount > 0) {
        toast.success(`${successCount} resume(s) uploaded successfully`);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await resumeService.delete(id);
      setResumes(prev => prev.filter(r => r.id !== id));
      setSelectedResumes(prev => prev.filter(r => r !== id));
      toast.success('Resume deleted');
    } catch (error) {
      toast.error('Failed to delete resume');
    }
  };

  const handleDownload = async (resume: ApiResume) => {
    try {
      const blob = await resumeService.download(resume.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resume.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download resume');
    }
  };

  const filteredResumes = resumes.filter(resume => {
    const matchesSearch = searchQuery === '' ||
      resume.candidate_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resume.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resume.file_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFolder = selectedFolder === 'all' || resume.folder_id === selectedFolder;

    return matchesSearch && matchesFolder;
  });

  const formatFileSize = (kb?: number) => {
    if (!kb) return 'N/A';
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading resumes...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">My Resumes</h1>
            <p className="text-sm text-gray-500 mt-1">Upload and manage candidate resumes</p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Upload Resumes
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Resumes</p>
                <p className="text-2xl font-semibold text-gray-900">{resumes.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">This Week</p>
                <p className="text-2xl font-semibold text-green-600">
                  {resumes.filter(r => {
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return new Date(r.created_at) > weekAgo;
                  }).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Folders</p>
                <p className="text-2xl font-semibold text-purple-600">{folders.length}</p>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
                <FolderPlus className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Selected</p>
                <p className="text-2xl font-semibold text-orange-600">{selectedResumes.length}</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, or file name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
            >
              <option value="all">All Folders</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name} ({folder.resume_count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Drag & Drop Zone (always visible) */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <CloudUpload className={`w-12 h-12 mx-auto mb-3 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
          <p className="text-gray-700 font-medium mb-1">
            {dragActive ? 'Drop files here' : 'Drag & drop resumes here'}
          </p>
          <p className="text-sm text-gray-500">
            or click to browse (PDF, DOC, DOCX)
          </p>
        </div>

        {/* Resumes Table */}
        {filteredResumes.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No resumes found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || selectedFolder !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Upload your first resume to get started'}
            </p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Upload className="w-4 h-4" />
              Upload Resumes
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedResumes.length === filteredResumes.length && filteredResumes.length > 0}
                      onChange={(e) => {
                        setSelectedResumes(e.target.checked ? filteredResumes.map(r => r.id) : []);
                      }}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Candidate</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Contact</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Experience</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">File</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Uploaded</th>
                  <th className="w-20 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredResumes.map((resume) => (
                  <tr key={resume.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedResumes.includes(resume.id)}
                        onChange={() => {
                          setSelectedResumes(prev =>
                            prev.includes(resume.id)
                              ? prev.filter(id => id !== resume.id)
                              : [...prev, resume.id]
                          );
                        }}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {resume.candidate_name || resume.file_name.replace(/\.[^/.]+$/, '')}
                          </p>
                          <p className="text-sm text-gray-500">{resume.current_title || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <p className="text-gray-900">{resume.email || 'N/A'}</p>
                        <p className="text-gray-500">{resume.phone || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">
                        {resume.experience_years ? `${resume.experience_years} years` : 'N/A'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-900 truncate max-w-[150px]">{resume.file_name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(resume.file_size_kb)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600">{formatDate(resume.created_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedResumeForView(resume)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDownload(resume)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(resume.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-xl">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Upload Resumes</h2>
                  <p className="text-sm text-gray-500 mt-1">Upload PDF, DOC, or DOCX files</p>
                </div>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadingFiles([]);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[50vh]">
                {/* Drop Zone */}
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer mb-6 ${
                    dragActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CloudUpload className={`w-10 h-10 mx-auto mb-3 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                  <p className="text-gray-700 font-medium mb-1">
                    {dragActive ? 'Drop files here' : 'Drag & drop or click to browse'}
                  </p>
                  <p className="text-sm text-gray-500">Supports PDF, DOC, DOCX</p>
                </div>

                {/* File List */}
                {uploadingFiles.length > 0 && (
                  <div className="space-y-3">
                    {uploadingFiles.map((uploadFile) => (
                      <div
                        key={uploadFile.id}
                        className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg bg-gray-50"
                      >
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{uploadFile.file.name}</p>
                          <p className="text-sm text-gray-500">
                            {(uploadFile.file.size / 1024).toFixed(1)} KB
                          </p>
                          {uploadFile.status === 'uploading' && (
                            <div className="mt-2 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-600 transition-all"
                                style={{ width: `${uploadFile.progress}%` }}
                              />
                            </div>
                          )}
                          {uploadFile.error && (
                            <p className="text-sm text-red-500 mt-1">{uploadFile.error}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {uploadFile.status === 'pending' && (
                            <button
                              onClick={() => removeFileFromUpload(uploadFile.id)}
                              className="p-2 hover:bg-gray-200 rounded-lg"
                            >
                              <X className="w-4 h-4 text-gray-500" />
                            </button>
                          )}
                          {uploadFile.status === 'uploading' && (
                            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                          )}
                          {uploadFile.status === 'completed' && (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          )}
                          {uploadFile.status === 'error' && (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-500">
                  {uploadingFiles.length} file(s) selected
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadingFiles([]);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={uploadFiles}
                    disabled={uploadingFiles.length === 0 || isUploading || uploadingFiles.every(f => f.status !== 'pending')}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick View Modal */}
        {selectedResumeForView && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-xl">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Resume Details</h2>
                <button
                  onClick={() => setSelectedResumeForView(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {selectedResumeForView.candidate_name || 'Unknown'}
                    </h3>
                    <p className="text-gray-500">{selectedResumeForView.current_title || 'N/A'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-700">{selectedResumeForView.email || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-700">{selectedResumeForView.phone || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-700">{selectedResumeForView.location || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-700">
                      {selectedResumeForView.experience_years
                        ? `${selectedResumeForView.experience_years} years experience`
                        : 'N/A'}
                    </span>
                  </div>

                  {selectedResumeForView.skills && selectedResumeForView.skills.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Skills</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedResumeForView.skills.map((skill, idx) => (
                          <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => handleDownload(selectedResumeForView)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => setSelectedResumeForView(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
