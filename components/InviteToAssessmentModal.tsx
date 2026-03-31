import { X, Mail, Plus, Trash2, Send, CheckCircle, FileText, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/enhanced-toast';
import { assessmentService } from '@/lib/services/assessmentService';

interface InviteToAssessmentModalProps {
  onClose: () => void;
  jobTitle: string;
  jobId: string;
  candidate?: {
    name?: string;
    candidateName?: string;
    email: string;
  };
}

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  source?: 'manual' | 'database';
  resumeId?: string;
}

interface Assessment {
  id: string;
  title: string;
  duration_minutes: number;
  status: string;
  hr_enabled: boolean;
  technical_enabled: boolean;
  coding_enabled: boolean;
}

type ModalView = 'loading' | 'no-assessment' | 'invite';

export default function InviteToAssessmentModal({ onClose, jobTitle, jobId, candidate }: InviteToAssessmentModalProps) {
  const [view, setView] = useState<ModalView>('loading');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);

  // Candidate state
  const candidateName = candidate?.name || candidate?.candidateName || '';
  const [candidates, setCandidates] = useState<CandidateEmail[]>(
    candidateName && candidate?.email
      ? [{ id: '1', name: candidateName, email: candidate.email, source: 'manual' }]
      : [{ id: '1', name: '', email: '', source: 'manual' }]
  );

  // Invite state
  const [expiryDays, setExpiryDays] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Duplicate invitation popup state
  const [showDuplicateError, setShowDuplicateError] = useState(false);
  const [duplicateEmails, setDuplicateEmails] = useState<string[]>([]);

  // Note: Assessment creation is now handled by redirecting to /recruitment/assessments/create page
  // No need for inline assessment creation state

  // Fetch assessments for this JD on mount
  useEffect(() => {
    fetchAssessments();
  }, [jobId]);

  const fetchAssessments = async () => {
    setIsLoadingAssessments(true);
    try {
      const response = await assessmentService.list({ jd_id: jobId });
      // Only show PUBLISHED assessments (not draft, not archived)
      const activeAssessments = response.items.filter(
        (a: any) => a.status === 'published' && !a.is_archived
      );
      setAssessments(activeAssessments);

      if (activeAssessments.length === 0) {
        setView('no-assessment');
      } else {
        setView('invite');
        // Auto-select if only one assessment
        if (activeAssessments.length === 1) {
          setSelectedAssessment(activeAssessments[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      setView('no-assessment');
    } finally {
      setIsLoadingAssessments(false);
    }
  };


  const handleStartCreateAssessment = () => {
    // Close modal and redirect to Create Assessment page
    // Pass jobId and returnUrl as query parameters
    const currentUrl = window.location.pathname;
    const createAssessmentUrl = `/recruitment/assessments/create?jobId=${jobId}&returnUrl=${encodeURIComponent(currentUrl)}`;
    window.location.href = createAssessmentUrl;
    onClose(); // Close the modal
  };

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

  const handleSendInvitations = async () => {
    if (!selectedAssessment) {
      toast.error({ title: 'Select Assessment', description: 'Please select an assessment first' });
      return;
    }

    const validCandidates = candidates.filter(c => c.name.trim() && c.email.trim() && c.email.includes('@'));
    if (validCandidates.length === 0) {
      toast.error({ title: 'No Valid Candidates', description: 'Please add at least one candidate with valid name and email' });
      return;
    }

    setIsSubmitting(true);
    try {
      const results = await Promise.allSettled(
        validCandidates.map(candidate =>
          assessmentService.invite(selectedAssessment, {
            candidate_name: candidate.name,
            candidate_email: candidate.email,
            invite_source: 'JD',
            expiry_days: expiryDays,
          })
        )
      );

      // Check for duplicate errors (409 Conflict)
      const duplicates: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const error = result.reason;
          const is409Error = error?.response?.status === 409 ||
                            error?.message?.includes('status code 409') ||
                            error?.message?.includes('already been invited') ||
                            error?.message?.includes('DUPLICATE_INVITATION');
          if (is409Error) {
            duplicates.push(validCandidates[index].email);
          }
        }
      });

      const successful = results.filter(r => r.status === 'fulfilled').length;

      if (duplicates.length > 0 && successful === 0) {
        setDuplicateEmails(duplicates);
        setShowDuplicateError(true);
        setIsSubmitting(false);
        return;
      }

      if (duplicates.length > 0 && successful > 0) {
        setShowSuccess(true);
        toast.warning({
          title: 'Partial Success',
          description: `${successful} sent, ${duplicates.length} already invited: ${duplicates.join(', ')}`,
        });
        setTimeout(() => {
          setShowSuccess(false);
          onClose();
        }, 3000);
        setIsSubmitting(false);
        return;
      }

      if (successful > 0) {
        setShowSuccess(true);
        toast.success({
          title: 'Invitations Sent!',
          description: `${successful} invitation${successful > 1 ? 's' : ''} sent successfully`,
        });

        setTimeout(() => {
          setShowSuccess(false);
          onClose();
        }, 2000);
      } else {
        toast.error({ title: 'Failed to Send', description: 'Could not send invitations. Please try again.' });
      }
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      toast.error({ title: 'Error', description: error.message || 'Failed to send invitations' });
    } finally {
      setIsSubmitting(false);
    }
  };


  const isValid =
    candidates.some(c => c.name.trim() && c.email.trim() && c.email.includes('@')) &&
    selectedAssessment !== '';

  const selectedAssessmentData = assessments.find(a => a.id === selectedAssessment);

  // Success Screen
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 sm:p-8 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <CheckCircle className="w-7 h-7 sm:w-10 sm:h-10 text-green-600" />
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Invitations Sent!</h3>
          <p className="text-gray-600 text-xs sm:text-sm">
            {candidates.filter(c => c.name.trim() && c.email.trim()).length} candidate{candidates.length > 1 ? 's' : ''} will receive the assessment invitation
          </p>
        </div>
      </div>
    );
  }

  // Duplicate Invitation Error Screen
  if (showDuplicateError) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 sm:p-8 max-h-[90vh] overflow-y-auto">
          <div className="text-center mb-4 sm:mb-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <AlertTriangle className="w-7 h-7 sm:w-10 sm:h-10 text-amber-600" />
            </div>
            <h3 className="text-gray-900 text-base sm:text-lg font-medium mb-2">Invitation Already Sent</h3>
            <p className="text-gray-600 text-xs sm:text-sm">
              {duplicateEmails.length === 1 ? (
                <>An invitation has already been sent to <span className="font-medium text-gray-800">{duplicateEmails[0]}</span> for this assessment.</>
              ) : (
                <>Invitations have already been sent to the following emails for this assessment:</>
              )}
            </p>
            {duplicateEmails.length > 1 && (
              <div className="mt-2 p-2 bg-amber-50 rounded-lg">
                {duplicateEmails.map((email, idx) => (
                  <p key={idx} className="text-xs sm:text-sm font-medium text-amber-800">{email}</p>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <p className="text-xs sm:text-sm text-gray-700 mb-2">You can:</p>
            <ul className="text-xs sm:text-sm text-gray-600 space-y-1">
              <li>• Try a <span className="font-medium">different email address</span></li>
              <li>• Send invitation for a <span className="font-medium">different assessment</span></li>
              <li>• Check the candidate&apos;s existing invitation status in Assessment Results</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmails([]);
              }}
              className="flex-1 px-4 py-2 bg-gray-800 text-white text-sm sm:text-base rounded-lg hover:bg-gray-900 transition-colors"
            >
              Try Different Email
            </button>
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmails([]);
                onClose();
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm sm:text-base rounded-lg hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (view === 'loading' || isLoadingAssessments) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 sm:p-8 text-center">
          <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-gray-600 mx-auto mb-3 sm:mb-4" />
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Loading Assessments...</h3>
          <p className="text-gray-500 text-xs sm:text-sm">Checking for existing assessments</p>
        </div>
      </div>
    );
  }

  // No Assessment Screen - With blur background
  if (view === 'no-assessment') {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto">
          {/* Header - Grey Theme */}
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-white truncate">No Assessment Found</h2>
                <p className="text-gray-300 text-xs sm:text-sm truncate">{jobTitle}</p>
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
          <div className="p-4 sm:p-6 text-center">
            <div className="w-14 h-14 sm:w-20 sm:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <FileText className="w-7 h-7 sm:w-10 sm:h-10 text-gray-600" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No Assessment Created</h3>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
              There is no assessment configured for this job description yet.
              Create an assessment first to invite candidates.
            </p>

            <div className="flex flex-col gap-2 sm:gap-3">
              <button
                onClick={handleStartCreateAssessment}
                className="w-full px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-gray-700 to-gray-800 text-white text-sm sm:text-base rounded-lg hover:from-gray-800 hover:to-gray-900 transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                Create Assessment
              </button>
              <button
                onClick={onClose}
                className="w-full px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 text-sm sm:text-base rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Note: Create assessment view removed - now redirects to /recruitment/assessments/create page

  // Invite Screen (Main) - With blur background
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-teal-600 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-white truncate">Invite Candidates</h2>
              <p className="text-green-100 text-xs sm:text-sm truncate">{jobTitle}</p>
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Assessment Selection */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Select Assessment *</label>
            <select
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm sm:text-base text-black"
            >
              <option value="">-- Choose an assessment --</option>
              {assessments.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessment.title} • {assessment.duration_minutes} min • {assessment.status}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">
                {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} available for this job
              </p>
              <button
                onClick={handleStartCreateAssessment}
                className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Create New Assessment
              </button>
            </div>
          </div>

          {/* Candidates */}
          <div>
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <label className="block text-xs sm:text-sm font-medium text-gray-700">Candidates *</label>
              <button
                onClick={addCandidate}
                className="text-xs sm:text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Add Candidate
              </button>
            </div>
            <div className="space-y-2 sm:space-y-3">
              {candidates.map((cand) => (
                <div key={cand.id} className="flex items-start sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Full Name</label>
                      <input
                        type="text"
                        value={cand.name}
                        onChange={(e) => updateCandidate(cand.id, 'name', e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-sm text-black focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Email Address</label>
                      <input
                        type="email"
                        value={cand.email}
                        onChange={(e) => updateCandidate(cand.id, 'email', e.target.value)}
                        placeholder="john.doe@email.com"
                        className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-sm text-black focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  {candidates.length > 1 && (
                    <button
                      onClick={() => removeCandidate(cand.id)}
                      className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 mt-5 sm:mt-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Expiry Settings */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">Link Expiry</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm sm:text-base text-black"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          {/* Preview */}
          {selectedAssessment && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                <span className="text-sm sm:text-base font-medium text-green-800">Ready to Send</span>
              </div>
              <div className="text-xs sm:text-sm text-green-700 space-y-1">
                <p><strong>Assessment:</strong> {selectedAssessmentData?.title}</p>
                <p><strong>Duration:</strong> {selectedAssessmentData?.duration_minutes} minutes</p>
                <p><strong>Recipients:</strong> {candidates.filter(c => c.name.trim() && c.email.trim()).length} candidate(s)</p>
                <p><strong>Expires in:</strong> {expiryDays} day{expiryDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-between gap-3">
          <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
            {candidates.filter(c => c.name.trim() && c.email.trim()).length} candidate{candidates.length !== 1 ? 's' : ''} will receive invitations
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 sm:px-5 py-2 border border-gray-300 text-gray-700 text-sm sm:text-base rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendInvitations}
              disabled={!isValid || isSubmitting}
              className="flex-1 sm:flex-none px-4 sm:px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white text-sm sm:text-base rounded-lg hover:from-green-700 hover:to-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Sending...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
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
