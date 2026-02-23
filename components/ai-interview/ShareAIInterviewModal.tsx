'use client';

import { X, Mail, Plus, Trash2, Send, CheckCircle, Copy, Clock, FileText, Users, Upload, Database, AlertTriangle, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';
import api from '@/lib/services/api';
import { toast } from 'sonner';

// Email validation regex
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  // scheduledDate: string;   // Commented out - schedule feature disabled for now
  // scheduledTime: string;   // Commented out - schedule feature disabled for now
  source: 'manual' | 'database';
  resumeId?: string;
}

interface Resume {
  id: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  experience: string;
  skills: string[];
}

interface ShareAIInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIInterviewResponse;
  onInviteSent: () => void;
}

const ROUND_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  leadership: 'Leadership',
  problem_solving: 'Problem Solving',
};

export default function ShareAIInterviewModal({ isOpen, onClose, config, onInviteSent }: ShareAIInterviewModalProps) {
  const { user } = useAuth();

  const [inputMode, setInputMode] = useState<'manual' | 'database'>('manual');
  const [candidates, setCandidates] = useState<CandidateEmail[]>([
    { id: '1', name: '', email: '', /* scheduledDate: '', scheduledTime: '', */ source: 'manual' },
  ]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Resume database from API
  const [resumeDatabase, setResumeDatabase] = useState<Resume[]>([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);

  // Email message
  const [customMessage, setCustomMessage] = useState(
    `You have been invited to an AI-powered interview:\n\nImportant Instructions:\n• Ensure you have a stable internet connection\n• Find a quiet place with good lighting\n• Your camera and microphone will be required\n• The AI interviewer will guide you through the session\n• Complete the interview in one sitting\n\nGood luck!`
  );
  const [expiryDays, setExpiryDays] = useState(7);
  const [sendCopy, setSendCopy] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // Duplicate invitation popup
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState('');

  // Load resumes from API when database mode is selected
  useEffect(() => {
    if (inputMode === 'database' && resumeDatabase.length === 0) {
      loadResumes();
    }
  }, [inputMode]);

  const loadResumes = async () => {
    setIsLoadingResumes(true);
    try {
      const sources = [];

      if (user?.permissions?.canAccessInternalDb) {
        sources.push('internal-db');
      }
      if (user?.permissions?.canUploadResumes || user?.permissions?.canViewMyResumes) {
        sources.push('my-resumes');
      }
      // Fallback for admin
      if (sources.length === 0) {
        sources.push('internal-db', 'my-resumes');
      }

      const allResumes: any[] = [];
      for (const source of sources) {
        try {
          const response = await api.get('/resumes', {
            params: { source, page_size: 100 },
          });
          if (response.data?.items) {
            allResumes.push(...response.data.items);
          }
        } catch (err) {
          console.warn(`Failed to load resumes from ${source}:`, err);
        }
      }

      const mapped = allResumes.map((r: any) => ({
        id: r.id,
        name: r.candidate_name || 'Unknown',
        email: r.email || r.candidate_email || '',
        phone: r.phone || '',
        position: r.current_title || 'Not specified',
        experience: r.experience_years ? `${r.experience_years} years` : 'Not specified',
        skills: r.skills || [],
      }));

      // Remove duplicates by email
      const uniqueResumes = mapped.filter(
        (resume, index, self) => index === self.findIndex((r) => r.email === resume.email && resume.email !== '')
      );

      setResumeDatabase(uniqueResumes);
    } catch (error) {
      console.error('Failed to load resumes:', error);
      toast.error('Failed to load resumes from database');
    } finally {
      setIsLoadingResumes(false);
    }
  };

  if (!isOpen) return null;

  const enabledRounds = config.rounds_config ? config.rounds_config.filter((r: any) => r.enabled !== false) : [];

  const interviewLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/ai-interview/${config.interview_token || config.id}`;

  const addCandidate = () => {
    setCandidates([
      ...candidates,
      { id: Date.now().toString(), name: '', email: '', /* scheduledDate: '', scheduledTime: '', */ source: 'manual' },
    ]);
  };

  const removeCandidate = (id: string) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter((c) => c.id !== id));
    }
  };

  const updateCandidate = (id: string, field: keyof CandidateEmail, value: string) => {
    setCandidates(candidates.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  // Handle resume selection from database
  const toggleResumeSelection = (resumeId: string) => {
    setSelectedResumes((prev) =>
      prev.includes(resumeId) ? prev.filter((id) => id !== resumeId) : [...prev, resumeId]
    );
  };

  // Add selected resumes to candidates list
  const handleAddFromDatabase = () => {
    const selectedResumeData = resumeDatabase.filter((r) => selectedResumes.includes(r.id));
    const newCandidates: CandidateEmail[] = selectedResumeData.map((resume) => ({
      id: Date.now().toString() + Math.random(),
      name: resume.name,
      email: resume.email,
      // scheduledDate: '',   // Commented out - schedule feature disabled for now
      // scheduledTime: '',   // Commented out - schedule feature disabled for now
      source: 'database' as const,
      resumeId: resume.id,
    }));

    // Keep valid manual candidates
    const validManualCandidates = candidates.filter((c) => c.source === 'manual' && c.name.trim() && c.email.trim());

    setCandidates(validManualCandidates.length > 0 ? [...validManualCandidates, ...newCandidates] : newCandidates);
    setSelectedResumes([]);
    setInputMode('manual');
  };

  // Filter resumes based on search query
  const filteredResumes = resumeDatabase.filter(
    (resume) =>
      resume.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resume.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCopyLink = () => {
    navigator.clipboard.writeText(interviewLink);
    toast.success('Interview link copied to clipboard!');
  };

  const handleSend = async () => {
    setIsSubmitting(true);
    try {
      // Filter candidates with name and email
      const candidatesWithData = candidates.filter((c) => c.name.trim() && c.email.trim());

      if (candidatesWithData.length === 0) {
        toast.warning('Please add at least one candidate with name and email');
        setIsSubmitting(false);
        return;
      }

      // Validate all email addresses
      const invalidEmails = candidatesWithData.filter((c) => !isValidEmail(c.email));
      if (invalidEmails.length > 0) {
        const invalidEmailList = invalidEmails.map((c) => c.email).join(', ');
        toast.error(`Invalid email address(es): ${invalidEmailList}. Please enter valid email addresses.`);
        setIsSubmitting(false);
        return;
      }

      for (const candidate of candidatesWithData) {
        // Schedule date/time - commented out for now, uncomment when needed
        // let scheduled_at: string | undefined;
        // if (candidate.scheduledDate && candidate.scheduledTime) {
        //   scheduled_at = new Date(`${candidate.scheduledDate}T${candidate.scheduledTime}`).toISOString();
        // } else if (candidate.scheduledDate) {
        //   scheduled_at = new Date(`${candidate.scheduledDate}T09:00:00`).toISOString();
        // }

        await aiInterviewService.inviteCandidate(config.id, {
          candidate_name: candidate.name.trim(),
          candidate_email: candidate.email.trim(),
          // scheduled_at,  // Commented out - schedule feature disabled for now
          custom_message: customMessage || undefined,
          expiry_days: expiryDays,
          base_url: typeof window !== 'undefined' ? window.location.origin : undefined,
        });
      }

      setSentCount(candidatesWithData.length);
      setIsSubmitting(false);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onInviteSent();
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      setIsSubmitting(false);

      // Check for duplicate invitation error (409 Conflict)
      const is409Error =
        error?.response?.status === 409 ||
        error?.message?.includes('status code 409') ||
        error?.message?.includes('already been invited') ||
        error?.message?.includes('DUPLICATE_INVITATION');

      if (is409Error) {
        const email =
          error?.response?.data?.detail?.candidate_email ||
          error?.response?.data?.candidate_email ||
          candidates[0]?.email ||
          'this candidate';
        setDuplicateEmail(email);
        setShowDuplicateError(true);
        return;
      }

      toast.error(`Failed to send invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Validation: all candidates must have valid name and email
  const isValid = candidates.some((c) => c.name.trim() && c.email.trim() && isValidEmail(c.email));

  // Success screen
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-gray-900 mb-2">Invitations Sent!</h3>
          <p className="text-gray-600 text-sm">
            Email invitations have been sent to {sentCount} candidate{sentCount > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  }

  // Duplicate invitation error popup
  if (showDuplicateError) {
    return (
      <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-10 h-10 text-amber-600" />
            </div>
            <h3 className="text-gray-900 text-lg font-medium mb-2">Invitation Already Sent</h3>
            <p className="text-gray-600 text-sm">
              An invitation has already been sent to{' '}
              <span className="font-medium text-gray-800">{duplicateEmail}</span> for this AI interview.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 mb-2">You can:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>
                • Try a <span className="font-medium">different email address</span>
              </li>
              <li>
                • Send invitation for a <span className="font-medium">different AI interview</span>
              </li>
              <li>• Check the candidate&apos;s existing invitation status</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmail('');
              }}
              className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              Try Different Email
            </button>
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmail('');
                onClose();
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white">Send AI Interview via Email</h2>
              <p className="text-gray-100 text-sm">{config.jd_title || config.position} - AI Interview</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Config Info Banner */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-900 font-medium">{config.jd_title || config.position}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {config.duration_minutes} min
                  </span>
                  {enabledRounds.length > 0 && (
                    <>
                      <span>•</span>
                      <span>{enabledRounds.length} rounds</span>
                      <span>•</span>
                      <span className="text-xs text-gray-400">
                        {enabledRounds.map((r: any) => ROUND_LABELS[r.type] || r.type).join(', ')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Candidate Emails Section */}
          <div className="mb-6">
            {/* Mode Switcher */}
            <div className="flex items-center justify-between mb-4">
              <label className="text-gray-900 font-medium">Select Candidates</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setInputMode('manual')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                    inputMode === 'manual' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Type Manually
                </button>
                <button
                  onClick={() => setInputMode('database')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                    inputMode === 'database' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  Select from Database
                </button>
              </div>
            </div>

            {/* Manual Input Mode */}
            {inputMode === 'manual' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-600">Enter candidate details manually</p>
                  <button
                    onClick={addCandidate}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Candidate
                  </button>
                </div>

                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className={`p-4 border rounded-lg ${
                        candidate.source === 'database' ? 'bg-gray-50 border-gray-300' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {candidate.source === 'database' && (
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
                              <Database className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        )}
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-600 mb-1 block">Full Name *</label>
                            <input
                              type="text"
                              value={candidate.name}
                              onChange={(e) => updateCandidate(candidate.id, 'name', e.target.value)}
                              placeholder="e.g., John Doe"
                              readOnly={candidate.source === 'database'}
                              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 ${
                                candidate.source === 'database' ? 'bg-gray-100 cursor-not-allowed' : ''
                              }`}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 mb-1 block">Email Address *</label>
                            <input
                              type="email"
                              value={candidate.email}
                              onChange={(e) => updateCandidate(candidate.id, 'email', e.target.value)}
                              placeholder="e.g., john.doe@example.com"
                              readOnly={candidate.source === 'database'}
                              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
                                candidate.source === 'database'
                                  ? 'bg-gray-100 cursor-not-allowed border-gray-300'
                                  : candidate.email.trim() && !isValidEmail(candidate.email)
                                    ? 'border-red-500 focus:ring-red-500'
                                    : 'border-gray-300 focus:ring-gray-500'
                              }`}
                            />
                            {candidate.source !== 'database' && candidate.email.trim() && !isValidEmail(candidate.email) && (
                              <p className="text-xs text-red-500 mt-1">Please enter a valid email (e.g., user@example.com)</p>
                            )}
                          </div>
                        </div>
                        {(candidates.length > 1 || candidate.source === 'database') && (
                          <button
                            onClick={() => removeCandidate(candidate.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors self-start"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {/* Schedule row - commented out for now, uncomment when schedule feature is needed */}
                      {/* <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Schedule Date</label>
                          <input
                            type="date"
                            value={candidate.scheduledDate}
                            onChange={(e) => updateCandidate(candidate.id, 'scheduledDate', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Schedule Time</label>
                          <input
                            type="time"
                            value={candidate.scheduledTime}
                            onChange={(e) => updateCandidate(candidate.id, 'scheduledTime', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                          />
                        </div>
                      </div> */}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Database Selection Mode */}
            {inputMode === 'database' && (
              <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
                {/* Search */}
                <div className="mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or position..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>

                {/* Resume List */}
                {isLoadingResumes ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500">Loading resumes...</span>
                  </div>
                ) : filteredResumes.length === 0 ? (
                  <div className="text-center py-8">
                    <Database className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-500">
                      {searchQuery ? 'No resumes match your search' : 'No resumes found in database'}
                    </p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-2 mb-4">
                    {filteredResumes.map((resume) => (
                      <div
                        key={resume.id}
                        onClick={() => toggleResumeSelection(resume.id)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedResumes.includes(resume.id)
                            ? 'bg-gray-100 border-gray-800'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1">
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                selectedResumes.includes(resume.id)
                                  ? 'bg-gray-800 border-gray-800'
                                  : 'bg-white border-gray-300'
                              }`}
                            >
                              {selectedResumes.includes(resume.id) && (
                                <CheckCircle className="w-4 h-4 text-white" />
                              )}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-gray-900 font-medium">{resume.name}</div>
                              <div className="text-xs text-gray-500">{resume.experience}</div>
                            </div>
                            <div className="text-sm text-gray-600 mb-2">{resume.email}</div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs text-gray-500">{resume.position}</span>
                              <span className="text-xs text-gray-400">•</span>
                              <span className="text-xs text-gray-500">{resume.phone}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {resume.skills.slice(0, 3).map((skill, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                                  {skill}
                                </span>
                              ))}
                              {resume.skills.length > 3 && (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                  +{resume.skills.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-300">
                  <div className="text-sm text-gray-800">
                    {selectedResumes.length} candidate{selectedResumes.length !== 1 ? 's' : ''} selected
                  </div>
                  <button
                    onClick={handleAddFromDatabase}
                    disabled={selectedResumes.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    <Users className="w-4 h-4" />
                    Add Selected Candidates
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Interview Link */}
          <div className="mb-6">
            <label className="text-gray-900 font-medium mb-2 block">Interview Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={interviewLink}
                readOnly
                className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">This unique link will be included in the email invitation</p>
          </div>

          {/* Custom Message */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-900 font-medium">Email Message</label>
              <span className="text-xs text-emerald-600 font-medium">✓ Live preview below</span>
            </div>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={10}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none font-mono"
              placeholder="Edit the message content here..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Use <code className="bg-gray-100 px-1 rounded">[Candidate Name]</code> as a placeholder — it will be
              replaced with each candidate&apos;s name. Your changes appear in the preview below.
            </p>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-gray-900 font-medium mb-2 block">Link Expiry</label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={0}>No expiry</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendCopy}
                  onChange={(e) => setSendCopy(e.target.checked)}
                  className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Send me a copy</span>
              </label>
            </div>
          </div>

          {/* Email Preview */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-emerald-300 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-emerald-600" />
                <h3 className="text-gray-900 font-semibold">Email Preview</h3>
              </div>
              <span className="text-xs text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full font-medium">
                Exact email format
              </span>
            </div>
            <p className="text-xs text-gray-600 mb-4 bg-white rounded-lg px-3 py-2 border border-emerald-200">
              This is exactly how the email will appear to candidates. Edit the message above to see live changes.
            </p>

            {/* Actual Email Template Preview */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden max-w-xl mx-auto">
              {/* Green Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 py-8 text-center">
                <h1 className="text-white text-2xl font-bold mb-2">AI Interview Invitation</h1>
                <p className="text-emerald-100 text-sm">TalentFlow</p>
              </div>

              {/* Email Body */}
              <div className="p-8">
                {/* Greeting and Message */}
                <div className="mb-6 text-gray-700 text-base leading-relaxed whitespace-pre-line">
                  {customMessage.replace('[Candidate Name]', candidates[0]?.name || '[Candidate Name]')}
                </div>

                {/* Interview Title Box */}
                <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-500 rounded-xl p-5 text-center mb-6">
                  <div className="text-xl font-bold text-emerald-900">
                    {config.jd_title || config.position}
                  </div>
                </div>

                {/* CTA Button */}
                <div className="text-center mb-6">
                  <div className="inline-block bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-8 py-3 rounded-lg font-semibold">
                    Start Interview
                  </div>
                </div>

                {/* Expiry Info */}
                <p className="text-center text-gray-600 text-sm mb-6">
                  This invitation expires on:{' '}
                  <strong>
                    {expiryDays > 0 ? `${expiryDays} day${expiryDays > 1 ? 's' : ''}` : 'No expiry'}
                  </strong>
                </p>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-8 py-6 text-center border-t border-gray-200">
                <p className="text-gray-500 text-xs mb-2">© 2026 TalentFlow. All rights reserved.</p>
                <p className="text-gray-400 text-xs">If you did not expect this email, please ignore it.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {candidates.filter((c) => c.name.trim() && c.email.trim()).length} candidate
            {candidates.filter((c) => c.name.trim() && c.email.trim()).length !== 1 ? 's' : ''} will receive this AI
            interview
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!isValid || isSubmitting}
              className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Invitations
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
