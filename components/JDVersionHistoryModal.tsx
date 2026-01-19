'use client';

import { useState, useEffect } from 'react';
import { X, Download, Clock, User, FileText, History, ChevronDown, ChevronUp, Loader2, Building2, MapPin, Briefcase, GraduationCap, Award, Code } from 'lucide-react';
import { jdService, JDVersion, JDVersionHistoryResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';

interface JDVersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdId: string;
  jdTitle: string;
}

export default function JDVersionHistoryModal({
  isOpen,
  onClose,
  jdId,
  jdTitle,
}: JDVersionHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [versionHistory, setVersionHistory] = useState<JDVersionHistoryResponse | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<JDVersion | null>(null);

  useEffect(() => {
    if (isOpen && jdId) {
      fetchVersionHistory();
    }
  }, [isOpen, jdId]);

  const fetchVersionHistory = async () => {
    setLoading(true);
    try {
      const data = await jdService.getVersionHistory(jdId);
      setVersionHistory(data);
      // Auto-expand the latest version
      if (data.versions.length > 0) {
        setExpandedVersion(data.versions[0].version_number);
      }
    } catch (error) {
      console.error('Failed to fetch version history:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const toggleVersion = (versionNumber: number) => {
    setExpandedVersion(expandedVersion === versionNumber ? null : versionNumber);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <History className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Version History</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {jdTitle} - {versionHistory?.total || 0} version{(versionHistory?.total || 0) !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Loading version history...</span>
            </div>
          ) : !versionHistory || versionHistory.versions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No version history available</p>
              <p className="text-gray-400 text-sm mt-2">
                Versions are created when you publish the job description
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {versionHistory.versions.map((version, index) => {
                const isLatest = index === 0;
                const isExpanded = expandedVersion === version.version_number;

                return (
                  <div
                    key={version.id}
                    className={`border-2 rounded-lg transition-all ${
                      isLatest
                        ? 'border-blue-200 bg-blue-50/50'
                        : 'border-gray-200 bg-white hover:border-blue-200'
                    }`}
                  >
                    {/* Version Header */}
                    <button
                      onClick={() => toggleVersion(version.version_number)}
                      className="w-full p-4 flex items-start justify-between text-left"
                    >
                      <div className="flex items-start gap-4">
                        {/* Version Badge */}
                        <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                          isLatest
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700'
                        }`}>
                          v{version.version_number}.0
                        </div>

                        {/* Version Info */}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900">{version.title}</h3>
                            {isLatest && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {getRelativeTime(version.published_at)}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              Published by User
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expand/Collapse */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {formatDate(version.published_at)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-200 mt-2 pt-4">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Left Column */}
                          <div className="space-y-4">
                            {/* Basic Info */}
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-2">Basic Information</h4>
                              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                                {version.department && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Building2 className="w-4 h-4 text-gray-500" />
                                    <span className="text-gray-600">Department:</span>
                                    <span className="text-gray-900">{version.department}</span>
                                  </div>
                                )}
                                {version.location && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <MapPin className="w-4 h-4 text-gray-500" />
                                    <span className="text-gray-600">Location:</span>
                                    <span className="text-gray-900">{version.location}</span>
                                  </div>
                                )}
                                {(version.experience_min || version.experience_max) && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Briefcase className="w-4 h-4 text-gray-500" />
                                    <span className="text-gray-600">Experience:</span>
                                    <span className="text-gray-900">
                                      {version.experience_min || 0} - {version.experience_max || 'N/A'} years
                                    </span>
                                  </div>
                                )}
                                {version.job_level && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <GraduationCap className="w-4 h-4 text-gray-500" />
                                    <span className="text-gray-600">Level:</span>
                                    <span className="text-gray-900 capitalize">{version.job_level}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Must Have Skills */}
                            {version.must_have_skills && version.must_have_skills.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Must Have Skills</h4>
                                <div className="flex flex-wrap gap-2">
                                  {version.must_have_skills.map((skill, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs"
                                    >
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Nice to Have Skills */}
                            {version.nice_to_have_skills && version.nice_to_have_skills.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Nice to Have Skills</h4>
                                <div className="flex flex-wrap gap-2">
                                  {version.nice_to_have_skills.map((skill, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs"
                                    >
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right Column */}
                          <div className="space-y-4">
                            {/* Certifications */}
                            {version.certifications && version.certifications.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                                  <Award className="w-4 h-4" />
                                  Certifications
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {version.certifications.map((cert, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs"
                                    >
                                      {cert}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Coding Requirements */}
                            {version.coding_required && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                                  <Code className="w-4 h-4" />
                                  Coding Assessment
                                </h4>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-2">Required: Yes</p>
                                  {version.supported_languages && version.supported_languages.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {version.supported_languages.map((lang, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs"
                                        >
                                          {lang}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Description Preview */}
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                              <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                                <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">
                                  {version.description.substring(0, 300)}
                                  {version.description.length > 300 ? '...' : ''}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                          <span className="text-xs text-gray-500">
                            Version created: {formatDate(version.created_at)}
                          </span>
                          <button
                            onClick={() => setSelectedVersion(version)}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            View Full Details
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileText className="w-4 h-4" />
            <span>Version history tracks all published changes to this job description</span>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Full Version Detail Modal */}
      {selectedVersion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm font-semibold">
                  v{selectedVersion.version_number}.0
                </div>
                <h3 className="font-semibold text-gray-900">{selectedVersion.title}</h3>
              </div>
              <button
                onClick={() => setSelectedVersion(null)}
                className="p-1 text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-sm max-w-none">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Job Description</h4>
                <div className="whitespace-pre-wrap text-gray-700 bg-gray-50 rounded-lg p-4">
                  {selectedVersion.description}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => setSelectedVersion(null)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
