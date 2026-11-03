import { X, AlertCircle, Eye, Upload, FileText, Mail, Phone, Briefcase, MapPin, Calendar } from 'lucide-react';
import { Resume } from '@/lib/types/types';
import React from 'react';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface DuplicateCheckModalProps {
  onClose: () => void;
  onUploadNew: (files: File[]) => void;
  onViewExisting?: (resume: Resume) => void;
}

export default function DuplicateCheckModal({ onClose, onUploadNew, onViewExisting }: DuplicateCheckModalProps) {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      // Simulate duplicate check
      checkForDuplicates(files);
    }
  };

  const checkForDuplicates = (files: File[]) => {
    // Simulate finding a duplicate (in real app, this would check against database)
    const isDuplicate = Math.random() > 0.5; // 50% chance for demo
    
    if (isDuplicate) {
      setShowDuplicateWarning(true);
      setUploadedFiles(files);
    } else {
      onUploadNew(files);
      onClose();
    }
  };

  const [showDuplicateWarning, setShowDuplicateWarning] = React.useState(false);
  const [uploadedFiles, setUploadedFiles] = React.useState<File[]>([]);

  // Mock existing resume data
  const existingResume: Resume = {
    id: 'resume-001',
    name: 'John Smith',
    email: 'john.smith@email.com',
    phone: '+1 (555) 123-4567',
    title: 'Senior Full Stack Developer',
    skills: ['JavaScript', 'React', 'Node.js', 'Python', 'AWS'],
    experience: '8 years',
    education: 'Bachelor\'s in Computer Science',
    location: 'San Francisco, CA',
    currentCompany: 'Tech Corp',
    previousCompany: 'StartUp Inc',
    noticePeriod: '2 weeks',
    source: 'LinkedIn',
    uploadDate: '2024-11-15T10:30:00Z',
    lastUpdated: '2024-11-28T14:20:00Z',
    attachments: 1,
    uploadedBy: 'current-user',
    folderId: 'folder-1',
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="tf-section-title sm:text-lg truncate">Check for Duplicate Resumes</h2>
              <p className="tf-body-muted truncate">Upload a resume to check if it already exists</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors flex-shrink-0"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          {!showDuplicateWarning ? (
            /* Upload Section */
            <div>
              <div className="mb-6 bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-brand-blue mb-1">How it works</div>
                    <div className="tf-body">
                      Upload a resume file and we'll check if this candidate already exists in your database based on name, email, and phone number.
                    </div>
                  </div>
                </div>
              </div>

              {/* File Upload Area */}
              <div className="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl p-8 sm:p-12 text-center hover:border-brand-blue/40 hover:bg-brand-blue/5 transition-all">
                <div className="w-16 h-16 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-brand-blue" />
                </div>
                <h3 className="tf-section-title sm:text-lg mb-2">Upload Resume to Check</h3>
                <p className="tf-body-secondary mb-4">
                  Drop your resume file here or click to browse
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Select Resume File
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <p className="tf-meta mt-3">Supported formats: PDF, DOC, DOCX (Max 3MB)</p>
              </div>
            </div>
          ) : (
            /* Duplicate Found Section */
            <div>
              {/* Warning Alert */}
              <div className="mb-6 bg-brand-orange/5 ring-1 ring-brand-orange/30 rounded-xl p-4 sm:p-5">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-full flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-6 h-6 text-brand-orange" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-semibold text-brand-orange-deep mb-2">Duplicate Resume Detected!</h3>
                    <p className="tf-body mb-3">
                      This resume appears to already exist in your database. We found a match based on the candidate's name and email address.
                    </p>
                    <div className="flex items-center gap-2 text-sm text-brand-orange-deep">
                      <FileText className="w-4 h-4" />
                      <span className="font-medium">Uploaded file: {uploadedFiles[0]?.name}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Existing Resume Details */}
              <div className="tf-panel overflow-hidden mb-6">
                <div className="bg-gradient-to-r from-brand-blue/5 to-brand-cyan/5 border-b border-gray-100 dark:border-slate-700/60 px-4 sm:px-5 py-3">
                  <h4 className="text-brand-blue font-semibold flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Existing Resume in Database
                  </h4>
                </div>

                <div className="p-4 sm:p-6">
                  {/* Candidate Header */}
                  <div className="flex items-start justify-between mb-6 pb-6 border-b border-gray-100 dark:border-slate-700/60">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-brand-blue ring-1 ring-white/10 flex items-center justify-center text-white text-lg sm:text-2xl font-semibold">
                        {existingResume.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <h3 className="tf-section-title sm:text-xl mb-1">{existingResume.name}</h3>
                        <p className="tf-body sm:text-base mb-2">{existingResume.title}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tf-body-secondary">
                          <div className="flex items-center gap-1">
                            <Briefcase className="w-4 h-4" />
                            {existingResume.experience}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {existingResume.location}
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className="tf-badge bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                      Existing
                    </span>
                  </div>

                  {/* Contact Information */}
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <div className="flex items-center gap-2 tf-body-secondary mb-1">
                        <Mail className="w-4 h-4" />
                        Email
                      </div>
                      <div className="tf-row-name">{existingResume.email}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 tf-body-secondary mb-1">
                        <Phone className="w-4 h-4" />
                        Phone
                      </div>
                      <div className="tf-row-name">{existingResume.phone}</div>
                    </div>
                  </div>

                  {/* Skills */}
                  <div className="mb-6">
                    <div className="tf-body-secondary mb-2">Skills</div>
                    <div className="flex flex-wrap gap-2">
                      {existingResume.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="tf-badge bg-brand-blue/5 text-brand-blue ring-1 ring-brand-blue/20"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-gray-200 dark:border-slate-700">
                    <div>
                      <div className="flex items-center gap-2 tf-body-secondary mb-1">
                        <Calendar className="w-4 h-4" />
                        First Uploaded
                      </div>
                      <div className="tf-body">
                        {formatISTDate(existingResume.uploadDate)}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 tf-body-secondary mb-1">
                        <Calendar className="w-4 h-4" />
                        Last Updated
                      </div>
                      <div className="tf-body">
                        {existingResume.lastUpdated ? formatISTDate(existingResume.lastUpdated) : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch gap-2 sm:gap-3">
                <button
                  onClick={() => {
                    if (onViewExisting) {
                      onViewExisting(existingResume);
                      onClose();
                    }
                  }}
                  className="tf-btn tf-btn-primary flex-1 flex px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors whitespace-normal font-normal"
                >
                  <Eye className="w-4 h-4" />
                  View Existing Resume
                </button>
                <button
                  onClick={() => {
                    setShowDuplicateWarning(false);
                    setUploadedFiles([]);
                  }}
                  className="tf-btn tf-btn-secondary flex-1 px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors whitespace-normal gap-0 font-normal"
                >
                  Check Another Resume
                </button>
              </div>

              {/* Info Note */}
              <div className="mt-4 bg-slate-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-700/60 rounded-lg p-4">
                <p className="tf-meta">
                  <strong>Note:</strong> If you want to update this candidate's resume with a new version, use the <span className="font-semibold text-brand-blue">"Version"</span> button instead. The Duplicate Check is designed to prevent accidental re-uploads of the same candidate.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
