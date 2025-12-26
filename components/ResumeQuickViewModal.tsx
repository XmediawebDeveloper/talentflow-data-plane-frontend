import { X, Download, FileText, User, History, Clock, ChevronRight, Eye } from 'lucide-react';
import { useState } from 'react';
import { Resume } from '@/lib/types/types';

interface ResumeQuickViewModalProps {
  resume: Resume;
  onClose: () => void;
}

export default function ResumeQuickViewModal({ resume, onClose }: ResumeQuickViewModalProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'details' | 'history'>('details');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl text-gray-900">{resume.name}</h2>
            <p className="text-sm text-gray-500">{resume.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-60 border-r border-gray-200 bg-gray-50 p-4">
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('preview')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <FileText className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={() => setActiveTab('details')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  activeTab === 'details'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <User className="w-4 h-4" />
                Details
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  activeTab === 'history'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <History className="w-4 h-4" />
                History
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {activeTab === 'preview' && (
              <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
                <div className="text-center">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600">PDF Preview</p>
                  <p className="text-sm text-gray-500 mt-2">Resume document would be displayed here</p>
                </div>
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-6">
                <section>
                  <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Personal Profile</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Name</div>
                      <div className="text-sm text-gray-900">{resume.name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Email</div>
                      <div className="text-sm text-gray-900">{resume.email}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Phone</div>
                      <div className="text-sm text-gray-900">{resume.phone}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Location</div>
                      <div className="text-sm text-gray-900">{resume.location || 'Not specified'}</div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Education</h3>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">🎓</span>
                    </div>
                    <div>
                      <div className="text-sm text-gray-900">{resume.education || 'Education information not provided'}</div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Experience</h3>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">💼</span>
                    </div>
                    <div>
                      <div className="text-sm text-gray-900 mb-1">{resume.title}</div>
                      <div className="text-sm text-gray-500">{resume.experience}</div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {resume.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm border border-gray-300"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-gray-900 mb-3 pb-2 border-b border-gray-200">Upload Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Source</div>
                      <div className="text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded text-xs ${
                            resume.source === 'Manual'
                              ? 'bg-gray-100 text-gray-700'
                              : 'bg-gray-50 text-gray-800'
                          }`}
                        >
                          {resume.source}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Upload Date</div>
                      <div className="text-sm text-gray-900">
                        {new Date(resume.uploadDate).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Attachments</div>
                      <div className="text-sm text-gray-900">{resume.attachments} file(s)</div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-6">
                {/* Activity History */}
                <div>
                  <h3 className="text-gray-900 mb-4 pb-2 border-b border-gray-200">Activity History</h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="w-2 h-2 rounded-full bg-gray-800 mt-2" />
                      <div className="flex-1">
                        <div className="text-sm text-gray-900">Resume uploaded</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(resume.uploadDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                        <div className="text-xs text-gray-500">By {resume.uploadedBy === 'current-user' ? 'You' : 'Other Recruiter'}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-2 h-2 rounded-full bg-gray-300 mt-2" />
                      <div className="flex-1">
                        <div className="text-sm text-gray-500">No additional history</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Version History Section */}
                <div>
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
                    <h3 className="text-gray-900">Version History</h3>
                    <span className="text-xs text-gray-500">3 versions</span>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Current Version */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border-2 border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-gray-900">Current Version</span>
                              <span className="px-2 py-0.5 bg-gray-800 text-white text-xs rounded-full">Latest</span>
                            </div>
                            <div className="text-xs text-gray-600 mb-2">
                              {resume.name}_v3.pdf
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(resume.uploadDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                              <div>Uploaded by {resume.uploadedBy === 'current-user' ? 'You' : 'Recruiter'}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="p-2 text-gray-800 hover:bg-gray-100 rounded-lg transition-colors" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-2 text-gray-800 hover:bg-gray-100 rounded-lg transition-colors" title="Download">
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Older Versions */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-gray-900">Version 2</span>
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">Older</span>
                            </div>
                            <div className="text-xs text-gray-600 mb-2">
                              {resume.name}_v2.pdf
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(new Date(resume.uploadDate).getTime() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                              <div>Uploaded by {resume.uploadedBy === 'current-user' ? 'You' : 'Recruiter'}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Download">
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-gray-900">Version 1</span>
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">Original</span>
                            </div>
                            <div className="text-xs text-gray-600 mb-2">
                              {resume.name}_v1.pdf
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(new Date(resume.uploadDate).getTime() - 60 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                              <div>Uploaded by {resume.uploadedBy === 'current-user' ? 'You' : 'Recruiter'}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Download">
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info Banner */}
                  <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 p-3 flex items-start gap-3">
                    <div className="w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs">ℹ</span>
                    </div>
                    <div>
                      <h4 className="text-sm text-gray-800 mb-1">Older versions available under version history</h4>
                      <p className="text-xs text-gray-900">
                        All previous versions are stored securely and can be accessed anytime. Click on any version to view or download.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}