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
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-3xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl text-white">Check for Duplicate Resumes</h2>
              <p className="text-sm text-orange-100">Upload a resume to check if it already exists</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {!showDuplicateWarning ? (
            /* Upload Section */
            <div>
              <div className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-gray-800 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-gray-800 mb-1">How it works</div>
                    <div className="text-sm text-gray-900">
                      Upload a resume file and we'll check if this candidate already exists in your database based on name, email, and phone number.
                    </div>
                  </div>
                </div>
              </div>

              {/* File Upload Area */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-gray-700 hover:bg-gray-50 transition-all">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-gray-800" />
                </div>
                <h3 className="text-lg text-gray-900 mb-2">Upload Resume to Check</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Drop your resume file here or click to browse
                </p>
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors cursor-pointer">
                  <Upload className="w-5 h-5" />
                  Select Resume File
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-500 mt-3">Supported formats: PDF, DOC, DOCX (Max 3MB)</p>
              </div>
            </div>
          ) : (
            /* Duplicate Found Section */
            <div>
              {/* Warning Alert */}
              <div className="mb-6 bg-orange-50 border-2 border-orange-300 rounded-xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-7 h-7 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-orange-900 mb-2">Duplicate Resume Detected!</h3>
                    <p className="text-sm text-orange-800 mb-3">
                      This resume appears to already exist in your database. We found a match based on the candidate's name and email address.
                    </p>
                    <div className="flex items-center gap-2 text-sm text-orange-700">
                      <FileText className="w-4 h-4" />
                      <span className="font-medium">Uploaded file: {uploadedFiles[0]?.name}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Existing Resume Details */}
              <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden mb-6">
                <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-5 py-4">
                  <h4 className="text-white font-medium flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Existing Resume in Database
                  </h4>
                </div>
                
                <div className="p-6">
                  {/* Candidate Header */}
                  <div className="flex items-start justify-between mb-6 pb-6 border-b border-gray-200">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-800 to-gray-800 flex items-center justify-center text-white text-2xl font-bold">
                        {existingResume.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <h3 className="text-xl text-gray-900 font-semibold mb-1">{existingResume.name}</h3>
                        <p className="text-base text-gray-700 mb-2">{existingResume.title}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
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
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      Existing
                    </span>
                  </div>

                  {/* Contact Information */}
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Mail className="w-4 h-4" />
                        Email
                      </div>
                      <div className="text-sm text-gray-900 font-medium">{existingResume.email}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Phone className="w-4 h-4" />
                        Phone
                      </div>
                      <div className="text-sm text-gray-900 font-medium">{existingResume.phone}</div>
                    </div>
                  </div>

                  {/* Skills */}
                  <div className="mb-6">
                    <div className="text-sm text-gray-600 mb-2">Skills</div>
                    <div className="flex flex-wrap gap-2">
                      {existingResume.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-xs font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-gray-200">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        First Uploaded
                      </div>
                      <div className="text-sm text-gray-900">
                        {formatISTDate(existingResume.uploadDate)}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        Last Updated
                      </div>
                      <div className="text-sm text-gray-900">
                        {existingResume.lastUpdated ? formatISTDate(existingResume.lastUpdated) : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (onViewExisting) {
                      onViewExisting(existingResume);
                      onClose();
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium"
                >
                  <Eye className="w-5 h-5" />
                  View Existing Resume
                </button>
                <button
                  onClick={() => {
                    setShowDuplicateWarning(false);
                    setUploadedFiles([]);
                  }}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Check Another Resume
                </button>
              </div>

              {/* Info Note */}
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-600">
                  <strong>Note:</strong> If you want to update this candidate's resume with a new version, use the <span className="font-semibold text-gray-800">"Version"</span> button instead. The Duplicate Check is designed to prevent accidental re-uploads of the same candidate.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
