import { X, Mail, Plus, Trash2, Send, CheckCircle, Clock, FileText, Users, Upload, Database, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { assessmentService } from '@/lib/services';
import api from '@/lib/services/api';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { stripVersionFromTitle } from '@/lib/utils/assessmentUtils';
import VersionBadge from './VersionBadge';
import { toast } from 'sonner';

// Email validation regex - requires valid format with domain containing a period
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

interface ShareAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: {
    id: string;
    title: string;
    duration: string;
    questions: number;
    type: string;
    short_id?: string; // Assessment ID like AS-022
    jd_short_id?: string; // JD ID like JD-025
    jd_title?: string; // JD title
    jd_version?: number; // JD version number
  };
  prefilledCandidates?: CandidateEmail[]; // Optional pre-filled candidates from resume selection
  inviteSource?: string; // Source context: "Resume Scoring", "JD", "Assessment", "Internal DB", "Manual"
  additionalAssessments?: Array<{
    id: string;
    title: string;
    duration: string;
    questions: number;
    type: string;
    short_id?: string; // Assessment ID like AS-022
    jd_short_id?: string; // JD ID like JD-025
    jd_title?: string; // JD title
    jd_version?: number; // JD version number
  }>; // Additional assessments for bulk invite
}

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  phone?: string; // Phone number
  source?: 'manual' | 'database'; // Track source
  resumeId?: string; // Link to resume if from database
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

export default function ShareAssessmentModal({ isOpen, onClose, assessment, prefilledCandidates, inviteSource, additionalAssessments }: ShareAssessmentModalProps) {
  const router = useRouter();
  const { user } = useAuth();

  // Remove "- Version X" from title for email display
  const assessmentTitleForEmail = stripVersionFromTitle(assessment.title);

  // All assessments to send invitations for (main + additional)
  const allAssessments = [assessment, ...(additionalAssessments || [])];

  const [inputMode, setInputMode] = useState<'manual' | 'database'>('manual');
  const [candidates, setCandidates] = useState<CandidateEmail[]>(
    prefilledCandidates && prefilledCandidates.length > 0
      ? prefilledCandidates
      : [{ id: '1', name: '', email: '', source: 'manual' }]
  );
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Resume database from API
  const [resumeDatabase, setResumeDatabase] = useState<Resume[]>([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);

  // Update candidates when pre-filled candidates change
  useEffect(() => {
    if (prefilledCandidates && prefilledCandidates.length > 0) {
      setCandidates(prefilledCandidates);
    }
  }, [prefilledCandidates]);

  // Load resumes from API when database mode is selected
  useEffect(() => {
    if (inputMode === 'database' && resumeDatabase.length === 0) {
      loadResumes();
    }
  }, [inputMode]);

  const loadResumes = async () => {
    setIsLoadingResumes(true);
    try {
      // Load resumes from both Internal DB and My Resumes based on user permissions
      const sources = [];

      // Check if user has Internal Database access
      if (user?.permissions?.canAccessInternalDb) {
        sources.push('internal-db');
      }

      // Check if user has My Resumes access
      if (user?.permissions?.canUploadResumes || user?.permissions?.canViewMyResumes) {
        sources.push('my-resumes');
      }

      // If no specific permissions, try both (fallback for admin)
      if (sources.length === 0) {
        sources.push('internal-db', 'my-resumes');
      }

      // Fetch resumes from all available sources
      const allResumes: any[] = [];
      for (const source of sources) {
        try {
          const response = await api.get('/resumes', {
            params: { source, page_size: 100 }
          });
          if (response.data?.items) {
            allResumes.push(...response.data.items);
          }
        } catch (err) {
          console.warn(`Failed to load resumes from ${source}:`, err);
        }
      }

      // Map and deduplicate resumes
      const mapped = allResumes.map((r: any) => ({
        id: r.id,
        name: r.candidate_name || 'Unknown',
        email: r.email || r.candidate_email || '',
        phone: r.phone || '',
        position: r.current_title || 'Not specified',
        experience: r.experience_years ? `${r.experience_years} years` : 'Not specified',
        skills: r.skills || []
      }));

      // Remove duplicates by email
      const uniqueResumes = mapped.filter((resume, index, self) =>
        index === self.findIndex((r) => r.email === resume.email && resume.email !== '')
      );

      setResumeDatabase(uniqueResumes);
    } catch (error) {
      console.error('Failed to load resumes:', error);
      toast.error('Failed to load resumes from database');
    } finally {
      setIsLoadingResumes(false);
    }
  };

  const [customMessage, setCustomMessage] = useState(
    `You have been invited to take an assessment:\n\nImportant Instructions:\n• Ensure you have a stable internet connection\n• Find a quiet place without distractions\n• Complete the assessment in one sitting\n• Your responses will be automatically saved\n\nGood luck!`
  );
  const [expiryDays, setExpiryDays] = useState(7);
  const [sendCopy, setSendCopy] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // Duplicate invitation popup state
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState('');

  if (!isOpen) return null;

  const addCandidate = () => {
    setCandidates([...candidates, { id: Date.now().toString(), name: '', email: '', source: 'manual' }]);
  };

  const removeCandidate = (id: string) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter(c => c.id !== id));
    }
  };

  const updateCandidate = (id: string, field: 'name' | 'email', value: string) => {
    setCandidates(candidates.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };
  
  // Handle resume selection from database
  const toggleResumeSelection = (resumeId: string) => {
    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };
  
  // Add selected resumes to candidates list
  const handleAddFromDatabase = () => {
    const selectedResumeData = resumeDatabase.filter(r => selectedResumes.includes(r.id));
    const newCandidates = selectedResumeData.map(resume => ({
      id: Date.now().toString() + Math.random(),
      name: resume.name,
      email: resume.email,
      source: 'database' as const,
      resumeId: resume.id
    }));
    
    // Filter out manual entries with empty fields
    const validManualCandidates = candidates.filter(c => 
      c.source === 'manual' && c.name.trim() && c.email.trim()
    );
    
    setCandidates([...validManualCandidates, ...newCandidates]);
    setSelectedResumes([]);
    setInputMode('manual');
  };
  
  // Filter resumes based on search query
  const filteredResumes = resumeDatabase.filter(resume =>
    resume.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    resume.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    resume.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = async () => {
    setIsSubmitting(true);
    try {
      // Filter candidates with name and email
      const candidatesWithData = candidates.filter(c => c.name.trim() && c.email.trim());

      if (candidatesWithData.length === 0) {
        toast.warning('Please add at least one candidate with name and email');
        setIsSubmitting(false);
        return;
      }

      // Validate all email addresses
      const invalidEmails = candidatesWithData.filter(c => !isValidEmail(c.email));
      if (invalidEmails.length > 0) {
        const invalidEmailList = invalidEmails.map(c => c.email).join(', ');
        toast.error(`Invalid email address(es): ${invalidEmailList}. Please enter valid email addresses.`);
        setIsSubmitting(false);
        return;
      }

      const validCandidates = candidatesWithData;

      // Check if we're sending to multiple assessments
      if (allAssessments.length > 1) {
        // Bulk invite for multiple assessments
        const totalInvites = allAssessments.length * validCandidates.length;
        let sentCount = 0;
        let failedCount = 0;

        toast.loading(`Sending ${totalInvites} invitation${totalInvites > 1 ? 's' : ''}...`, { id: 'bulk-invite-multi' });

        for (const assessmentToInvite of allAssessments) {
          try {
            const candidateData = validCandidates.map(c => ({
              candidate_name: c.name,
              candidate_email: c.email,
              candidate_phone: c.phone,
              invite_source: inviteSource || (c.source === 'database' ? 'Internal DB' : 'Manual'),
              resume_id: c.resumeId,
            }));

            await assessmentService.bulkInvite(assessmentToInvite.id, {
              candidates: candidateData,
              custom_message: customMessage,
              expiry_days: expiryDays,
            });

            sentCount += validCandidates.length;
            toast.loading(`Sent ${sentCount}/${totalInvites} invitations...`, { id: 'bulk-invite-multi' });
          } catch (error: any) {
            console.error(`Failed to send invitations for assessment ${assessmentToInvite.title}:`, error);
            failedCount += validCandidates.length;
          }
        }

        setIsSubmitting(false);

        if (failedCount === 0) {
          toast.success(`Successfully sent ${sentCount} invitation${sentCount > 1 ? 's' : ''} for ${allAssessments.length} assessment${allAssessments.length > 1 ? 's' : ''}!`, { id: 'bulk-invite-multi' });
        } else {
          toast.warning(`Sent ${sentCount} invitations successfully. ${failedCount} failed.`, { id: 'bulk-invite-multi' });
        }

        setSentCount(sentCount);
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          onClose();
        }, 2000);
        return;
      }

      // Single assessment invite (existing logic)
      if (validCandidates.length === 1) {
        // Single invite
        await assessmentService.invite(assessment.id, {
          candidate_name: validCandidates[0].name,
          candidate_email: validCandidates[0].email,
          candidate_phone: validCandidates[0].phone,
          invite_source: inviteSource || (validCandidates[0].source === 'database' ? 'Internal DB' : 'Manual'),
          resume_id: validCandidates[0].resumeId,
          custom_message: customMessage,
          expiry_days: expiryDays,
        });
      } else {
        // Bulk invite
        const candidateData = validCandidates.map(c => ({
          candidate_name: c.name,
          candidate_email: c.email,
          candidate_phone: c.phone,
          invite_source: inviteSource || (c.source === 'database' ? 'Internal DB' : 'Manual'),
          resume_id: c.resumeId,
        }));
        await assessmentService.bulkInvite(assessment.id, {
          candidates: candidateData,
          custom_message: customMessage,
          expiry_days: expiryDays,
        });
      }

      setSentCount(validCandidates.length);
      setIsSubmitting(false);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      setIsSubmitting(false);

      // Check for duplicate invitation error (409 Conflict)
      const is409Error = error?.response?.status === 409 ||
                         error?.message?.includes('status code 409') ||
                         error?.message?.includes('already been invited') ||
                         error?.message?.includes('DUPLICATE_INVITATION');

      if (is409Error) {
        // Extract email from different possible response formats
        const email = error?.response?.data?.detail?.candidate_email ||
                      error?.response?.data?.candidate_email ||
                      candidates[0]?.email ||
                      'this candidate';
        setDuplicateEmail(email);
        setShowDuplicateError(true);
        return;
      }

      handleQuotaError(error, router, `Failed to send invitations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Check if all candidates have valid name and email
  const isValid = candidates.every(c => c.name.trim() && c.email.trim() && isValidEmail(c.email));

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || 'https://talentflow.app');
  const assessmentLink = `${baseUrl}/assessment/take/<token>?c=<name>&r=<role>`;

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-gray-900 mb-2">Assessment Shared Successfully!</h3>
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
              An invitation has already been sent to <span className="font-medium text-gray-800">{duplicateEmail}</span> for this assessment.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 mb-2">You can:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Try a <span className="font-medium">different email address</span></li>
              <li>• Send invitation for a <span className="font-medium">different assessment</span></li>
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
    <div className="fixed inset-0 bg-gray-900/30 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-3 sm:px-6 py-3 sm:py-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-white text-sm sm:text-base">Share Assessment via Email</h2>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <p className="text-gray-100 text-xs sm:text-sm truncate">{assessmentTitleForEmail}</p>
                <VersionBadge version={assessment.version} size="sm" variant="success" />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {/* Assessment Info Banner */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex items-start gap-2.5 sm:gap-4">
              <div className="w-9 h-9 sm:w-12 sm:h-12 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                  {assessment.short_id && (
                    <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-gray-800 text-white rounded font-semibold">
                      {assessment.short_id}
                    </span>
                  )}
                  <span className="text-xs sm:text-base text-gray-900 truncate">{assessmentTitleForEmail}</span>
                  <VersionBadge version={assessment.version} size="sm" variant="secondary" />
                  {allAssessments.length > 1 && (
                    <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                      +{allAssessments.length - 1} more
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-4 text-[10px] sm:text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                    {assessment.duration}
                  </span>
                  <span className="hidden sm:inline">•</span>
                  <span>{assessment.questions} questions</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">{assessment.type}</span>
                </div>
                {assessment.jd_short_id && (
                  <div className="text-[10px] sm:text-xs text-gray-600 mt-1">
                    <span className="font-medium">Linked: </span>
                    <span className="text-gray-800">{assessment.jd_short_id}</span>
                    {assessment.jd_title && (
                      <span className="ml-1 truncate">- {assessment.jd_title}</span>
                    )}
                    {assessment.jd_version && (
                      <span className="ml-1 text-gray-500">v{assessment.jd_version}</span>
                    )}
                  </div>
                )}
                {allAssessments.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-gray-300">
                    <p className="text-[10px] sm:text-xs text-gray-600 font-medium mb-1">
                      Invitations for {allAssessments.length} assessments:
                    </p>
                    <div className="space-y-1">
                      {allAssessments.map((a, idx) => (
                        <div key={idx} className="text-[10px] sm:text-xs px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded">
                          <div className="flex items-center gap-1 flex-wrap">
                            {a.short_id && <span className="font-semibold">{a.short_id}</span>}
                            <span className="truncate">{stripVersionFromTitle(a.title)}</span>
                          </div>
                          {a.jd_short_id && (
                            <div className="text-gray-500 mt-0.5">
                              Linked: {a.jd_short_id}
                              {a.jd_title && ` - ${a.jd_title}`}
                              {a.jd_version && ` v${a.jd_version}`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Candidate Emails Section */}
          <div className="mb-4 sm:mb-6">
            {/* Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
              <label className="text-xs sm:text-base text-gray-900 font-medium">Select Candidates</label>
              <div className="flex gap-1.5 sm:gap-2">
                <button
                  onClick={() => setInputMode('manual')}
                  className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                    inputMode === 'manual'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Type Manually</span>
                  <span className="sm:hidden">Manual</span>
                </button>
                <button
                  onClick={() => setInputMode('database')}
                  className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                    inputMode === 'database'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Database className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Select from Database</span>
                  <span className="sm:hidden">Database</span>
                </button>
              </div>
            </div>

            {/* Manual Input Mode */}
            {inputMode === 'manual' && (
              <>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <p className="text-xs sm:text-sm text-gray-600">Enter candidate details</p>
                  <button
                    onClick={addCandidate}
                    className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Add
                  </button>
                </div>

                <div className="space-y-2 sm:space-y-3">
                  {candidates.map((candidate, index) => (
                    <div key={candidate.id} className={`flex items-start sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-4 border rounded-lg ${
                      candidate.source === 'database'
                        ? 'bg-gray-50 border-gray-300'
                        : 'bg-gray-50 border-gray-200'
                    }`}>
                      {candidate.source === 'database' && (
                        <div className="flex-shrink-0">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-800 rounded-lg flex items-center justify-center">
                            <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                          </div>
                        </div>
                      )}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                        <div>
                          <label className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1 block">Full Name</label>
                          <input
                            type="text"
                            value={candidate.name}
                            onChange={(e) => updateCandidate(candidate.id, 'name', e.target.value)}
                            placeholder="e.g., John Doe"
                            readOnly={candidate.source === 'database'}
                            className={`w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 text-black placeholder-gray-400 ${
                              candidate.source === 'database' ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1 block">Email Address</label>
                          <input
                            type="email"
                            value={candidate.email}
                            onChange={(e) => updateCandidate(candidate.id, 'email', e.target.value)}
                            placeholder="e.g., john@example.com"
                            readOnly={candidate.source === 'database'}
                            className={`w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 text-black placeholder-gray-400 ${
                              candidate.source === 'database'
                                ? 'bg-gray-100 cursor-not-allowed border-gray-300'
                                : candidate.email.trim() && !isValidEmail(candidate.email)
                                  ? 'border-red-500 focus:ring-red-500'
                                  : 'border-gray-300 focus:ring-gray-500'
                            }`}
                          />
                          {candidate.email.trim() && !isValidEmail(candidate.email) && (
                            <p className="text-[10px] sm:text-xs text-red-500 mt-0.5 sm:mt-1">Enter a valid email</p>
                          )}
                        </div>
                      </div>
                      {(candidates.length > 1 || candidate.source === 'database') && (
                        <button
                          onClick={() => removeCandidate(candidate.id)}
                          className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Database Selection Mode */}
            {inputMode === 'database' && (
              <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-2.5 sm:p-4">
                {/* Search */}
                <div className="mb-3 sm:mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or position..."
                    className="w-full px-3 sm:px-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 text-black placeholder-gray-400"
                  />
                </div>

                {/* Resume List */}
                <div className="max-h-64 sm:max-h-96 overflow-y-auto space-y-1.5 sm:space-y-2 mb-3 sm:mb-4">
                  {filteredResumes.map((resume) => (
                    <div
                      key={resume.id}
                      onClick={() => toggleResumeSelection(resume.id)}
                      className={`p-2.5 sm:p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedResumes.includes(resume.id)
                          ? 'bg-gray-100 border-gray-800'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className="flex-shrink-0 mt-0.5 sm:mt-1">
                          <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded border-2 flex items-center justify-center ${
                            selectedResumes.includes(resume.id)
                              ? 'bg-gray-800 border-gray-800'
                              : 'bg-white border-gray-300'
                          }`}>
                            {selectedResumes.includes(resume.id) && (
                              <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5 sm:mb-1">
                            <div className="text-xs sm:text-base text-gray-900 font-medium truncate">{resume.name}</div>
                            <div className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0">{resume.experience}</div>
                          </div>
                          <div className="text-[10px] sm:text-sm text-gray-600 mb-1 sm:mb-2 truncate">{resume.email}</div>
                          <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                            <span className="text-[10px] sm:text-xs text-gray-500 truncate">{resume.position}</span>
                            <span className="text-[10px] sm:text-xs text-gray-400">•</span>
                            <span className="text-[10px] sm:text-xs text-gray-500">{resume.phone}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {resume.skills.slice(0, 3).map((skill, idx) => (
                              <span key={idx} className="px-1.5 sm:px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-[10px] sm:text-xs">
                                {skill}
                              </span>
                            ))}
                            {resume.skills.length > 3 && (
                              <span className="px-1.5 sm:px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] sm:text-xs">
                                +{resume.skills.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-3 sm:pt-4 border-t border-gray-300">
                  <div className="text-xs sm:text-sm text-gray-800">
                    {selectedResumes.length} selected
                  </div>
                  <button
                    onClick={handleAddFromDatabase}
                    disabled={selectedResumes.length === 0}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-xs sm:text-sm"
                  >
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Add Selected Candidates</span>
                    <span className="sm:hidden">Add Selected</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Assessment Link */}
          <div className="mb-4 sm:mb-6">
            <label className="text-xs sm:text-base text-gray-900 mb-1.5 sm:mb-2 block font-medium">Assessment Link</label>
            <div
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-100 border border-gray-300 rounded-lg text-[10px] sm:text-sm text-gray-500 select-none break-all"
              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
            >
              {assessmentLink}
            </div>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
              A unique link will be generated for each candidate
            </p>
          </div>

          {/* Custom Message */}
          <div className="mb-4 sm:mb-6">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <label className="text-xs sm:text-base text-gray-900 font-medium">Email Message</label>
              <span className="text-[10px] sm:text-xs text-emerald-600 font-medium">✓ Live preview</span>
            </div>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={6}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none font-mono text-black placeholder-gray-400"
              placeholder="Edit the message content here..."
            />
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
              Use <code className="bg-gray-100 px-1 rounded">[Candidate Name]</code> as a placeholder.
            </p>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div>
              <label className="text-xs sm:text-base text-gray-900 mb-1.5 sm:mb-2 block font-medium">Link Expiry</label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="w-full px-3 sm:px-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 text-black"
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
                <span className="text-xs sm:text-sm text-gray-700">Send me a copy</span>
              </label>
            </div>
          </div>

          {/* Email Preview - Exact match of actual email */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-emerald-300 rounded-lg p-3 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                <h3 className="text-xs sm:text-base text-gray-900 font-semibold">Email Preview</h3>
              </div>
              <span className="text-[10px] sm:text-xs text-emerald-700 bg-emerald-50 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full font-medium">
                Exact format
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-gray-600 mb-3 sm:mb-4 bg-white rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 border border-emerald-200">
              This is how the email will appear to candidates.
            </p>

            {/* Actual Email Template Preview */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Green Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 sm:px-8 py-4 sm:py-8 text-center">
                <h1 className="text-white text-base sm:text-2xl font-bold mb-1 sm:mb-2">Assessment Invitation</h1>
                <p className="text-emerald-100 text-[10px] sm:text-sm">TalentFlow</p>
              </div>

              {/* Email Body */}
              <div className="p-4 sm:p-8">
                {/* Greeting and Message */}
                <div className="mb-4 sm:mb-6 text-gray-700 text-xs sm:text-base leading-relaxed whitespace-pre-line">
                  {customMessage.replace('[Candidate Name]', candidates[0].name || '[Candidate Name]')}
                </div>

                {/* Assessment Title Box */}
                <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-500 rounded-xl p-3 sm:p-5 text-center mb-4 sm:mb-6">
                  <div className="text-sm sm:text-xl font-bold text-emerald-900">
                    {assessmentTitleForEmail}
                  </div>
                </div>

                {/* CTA Button */}
                <div className="text-center mb-4 sm:mb-6">
                  <div className="inline-block bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-5 sm:px-8 py-2 sm:py-3 rounded-lg text-xs sm:text-base font-semibold">
                    Start Assessment
                  </div>
                </div>

                {/* Expiry Info */}
                <p className="text-center text-gray-600 text-[10px] sm:text-sm mb-4 sm:mb-6">
                  Expires: <strong>{expiryDays > 0 ? `${expiryDays} day${expiryDays > 1 ? 's' : ''}` : 'No expiry'}</strong>
                </p>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-4 sm:px-8 py-3 sm:py-6 text-center border-t border-gray-200">
                <p className="text-gray-500 text-[10px] sm:text-xs mb-1 sm:mb-2">© 2026 TalentFlow. All rights reserved.</p>
                <p className="text-gray-400 text-[10px] sm:text-xs">If you did not expect this email, please ignore it.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0">
          <div className="text-[10px] sm:text-sm text-gray-600 text-center sm:text-left">
            {candidates.length} candidate{candidates.length > 1 ? 's' : ''} will receive {allAssessments.length > 1 ? `${allAssessments.length} assessments` : 'this assessment'}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="px-3 sm:px-5 py-1.5 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs sm:text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!isValid || isSubmitting}
              className="px-4 sm:px-6 py-1.5 sm:py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Send Invitations</span>
                  <span className="sm:hidden">Send</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}