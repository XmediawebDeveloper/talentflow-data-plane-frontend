import { X, Mail, Plus, Trash2, Send, CheckCircle, FileText, AlertTriangle, Loader2, ArrowLeft, Clock, Sliders, Brain, Code, Users, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/enhanced-toast';
import { assessmentService } from '@/lib/services/assessmentService';
import { jdService } from '@/lib/services';

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

interface SectionConfig {
  name: 'HR' | 'Technical' | 'Coding';
  percentage: number;
  topics: string[];
  enabled: boolean;
}

type ModalView = 'loading' | 'no-assessment' | 'invite' | 'create-assessment';

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

  // Assessment Creation State
  const [assessmentStep, setAssessmentStep] = useState<'configure' | 'preview'>('configure');
  const [sections, setSections] = useState<SectionConfig[]>([
    { name: 'HR', percentage: 20, topics: [], enabled: true },
    { name: 'Technical', percentage: 80, topics: [], enabled: true },
    { name: 'Coding', percentage: 0, topics: [], enabled: false },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessment, setGeneratedAssessment] = useState<any>(null);
  const [jdData, setJdData] = useState<any>(null);
  const [selectedCodingLanguages, setSelectedCodingLanguages] = useState<string[]>([]);

  const programmingLanguages = [
    'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go',
    'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'R', 'SQL'
  ];

  // Fetch assessments for this JD on mount
  useEffect(() => {
    fetchAssessments();
  }, [jobId]);

  const fetchAssessments = async () => {
    setIsLoadingAssessments(true);
    try {
      const response = await assessmentService.list({ jd_id: jobId });
      const activeAssessments = response.items.filter(
        (a: any) => a.status === 'published' || a.status === 'active' || a.status === 'draft'
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

  // Fetch JD data when entering create-assessment view
  const fetchJDData = async () => {
    try {
      const jd = await jdService.get(jobId);
      setJdData(jd);

      // Configure sections based on JD
      const jdRequiresCoding = jd.coding_required === true;
      const hasLanguages = jd.supported_languages && jd.supported_languages.length > 0;

      if (jdRequiresCoding && hasLanguages) {
        setSections([
          { name: 'HR', percentage: 20, topics: [], enabled: true },
          { name: 'Technical', percentage: 70, topics: [], enabled: true },
          { name: 'Coding', percentage: 10, topics: [], enabled: true },
        ]);
        setSelectedCodingLanguages(jd.supported_languages);
      } else {
        setSections([
          { name: 'HR', percentage: 20, topics: [], enabled: true },
          { name: 'Technical', percentage: 80, topics: [], enabled: true },
          { name: 'Coding', percentage: 0, topics: [], enabled: false },
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch JD:', error);
    }
  };

  const handleStartCreateAssessment = () => {
    fetchJDData();
    setView('create-assessment');
    setAssessmentStep('configure');
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

  // Assessment Creation Functions
  const updatePercentage = (sectionName: string, value: number) => {
    setSections(sections.map(s =>
      s.name === sectionName ? { ...s, percentage: Math.max(0, Math.min(100, value)) } : s
    ));
  };

  const toggleSection = (sectionName: string) => {
    // Don't allow toggling coding if JD doesn't support it
    if (sectionName === 'Coding' && !jdData?.coding_required) return;

    setSections(sections.map(s =>
      s.name === sectionName ? { ...s, enabled: !s.enabled } : s
    ));
  };

  const getTotalPercentage = () => {
    return sections.filter(s => s.enabled).reduce((acc, s) => acc + s.percentage, 0);
  };

  const handleGenerateAssessment = async () => {
    if (getTotalPercentage() !== 100) {
      toast.error({ title: 'Invalid Configuration', description: 'Section percentages must total 100%' });
      return;
    }

    setIsGenerating(true);
    try {
      const enabledSections = sections.filter(s => s.enabled);

      const assessmentData = {
        jd_id: jobId,
        title: `Assessment for ${jobTitle}`,
        description: `AI-generated assessment for ${jobTitle}`,
        duration_minutes: 30,
        hr_enabled: enabledSections.some(s => s.name === 'HR'),
        hr_percentage: sections.find(s => s.name === 'HR')?.percentage || 0,
        hr_topics: sections.find(s => s.name === 'HR')?.topics || [],
        technical_enabled: enabledSections.some(s => s.name === 'Technical'),
        technical_percentage: sections.find(s => s.name === 'Technical')?.percentage || 0,
        technical_topics: sections.find(s => s.name === 'Technical')?.topics || [],
        coding_enabled: enabledSections.some(s => s.name === 'Coding'),
        coding_percentage: sections.find(s => s.name === 'Coding')?.percentage || 0,
        coding_topics: sections.find(s => s.name === 'Coding')?.topics || [],
        coding_languages: selectedCodingLanguages,
      };

      const response = await assessmentService.create(assessmentData);
      setGeneratedAssessment(response);
      setAssessmentStep('preview');

      toast.success({ title: 'Assessment Created', description: 'Assessment configuration saved successfully' });
    } catch (error: any) {
      console.error('Failed to create assessment:', error);
      toast.error({ title: 'Error', description: error.message || 'Failed to create assessment' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublishAssessment = async () => {
    if (!generatedAssessment?.id) return;

    try {
      await assessmentService.publish(generatedAssessment.id);
      toast.success({ title: 'Assessment Published', description: 'You can now invite candidates' });

      // Refresh assessments and switch to invite view
      await fetchAssessments();
      setSelectedAssessment(generatedAssessment.id);
      setView('invite');
    } catch (error: any) {
      console.error('Failed to publish assessment:', error);
      toast.error({ title: 'Error', description: error.message || 'Failed to publish assessment' });
    }
  };

  const isValid =
    candidates.some(c => c.name.trim() && c.email.trim() && c.email.includes('@')) &&
    selectedAssessment !== '';

  const selectedAssessmentData = assessments.find(a => a.id === selectedAssessment);
  const totalPercentage = getTotalPercentage();
  const isPercentageValid = totalPercentage === 100;

  // Success Screen
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Invitations Sent!</h3>
          <p className="text-gray-600 text-sm">
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
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-10 h-10 text-amber-600" />
            </div>
            <h3 className="text-gray-900 text-lg font-medium mb-2">Invitation Already Sent</h3>
            <p className="text-gray-600 text-sm">
              {duplicateEmails.length === 1 ? (
                <>An invitation has already been sent to <span className="font-medium text-gray-800">{duplicateEmails[0]}</span> for this assessment.</>
              ) : (
                <>Invitations have already been sent to the following emails for this assessment:</>
              )}
            </p>
            {duplicateEmails.length > 1 && (
              <div className="mt-2 p-2 bg-amber-50 rounded-lg">
                {duplicateEmails.map((email, idx) => (
                  <p key={idx} className="text-sm font-medium text-amber-800">{email}</p>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 mb-2">You can:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Try a <span className="font-medium">different email address</span></li>
              <li>• Send invitation for a <span className="font-medium">different assessment</span></li>
              <li>• Check the candidate&apos;s existing invitation status in Assessment Results</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmails([]);
              }}
              className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              Try Different Email
            </button>
            <button
              onClick={() => {
                setShowDuplicateError(false);
                setDuplicateEmails([]);
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

  // Loading Screen
  if (view === 'loading' || isLoadingAssessments) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Assessments...</h3>
          <p className="text-gray-500 text-sm">Checking for existing assessments</p>
        </div>
      </div>
    );
  }

  // No Assessment Screen - With blur background
  if (view === 'no-assessment') {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
          {/* Header - Grey Theme */}
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">No Assessment Found</h2>
                <p className="text-gray-300 text-sm">{jobTitle}</p>
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
          <div className="p-6 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-gray-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Assessment Created</h3>
            <p className="text-gray-600 mb-6">
              There is no assessment configured for this job description yet.
              Create an assessment first to invite candidates.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleStartCreateAssessment}
                className="w-full px-6 py-3 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-lg hover:from-gray-800 hover:to-gray-900 transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <Sparkles className="w-5 h-5" />
                Create Assessment
              </button>
              <button
                onClick={onClose}
                className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Create Assessment Screen - Inline Configuration
  if (view === 'create-assessment') {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header - Grey Theme */}
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('no-assessment')}
                className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <Sliders className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Configure Assessment</h2>
                <p className="text-gray-300 text-sm">{jobTitle}</p>
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
            {assessmentStep === 'configure' && (
              <div className="space-y-6">
                {/* Duration Info */}
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Fixed Duration: 30 minutes</p>
                    <p className="text-xs text-gray-600">All assessments are standardized to 30 minutes</p>
                  </div>
                </div>

                {/* Sections Configuration */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Assessment Sections</h3>
                  <div className="space-y-4">
                    {sections.map((section) => {
                      const isCodingLocked = section.name === 'Coding' && !jdData?.coding_required;
                      const Icon = section.name === 'HR' ? Users : section.name === 'Technical' ? Brain : Code;
                      const colorClass = section.name === 'HR' ? 'blue' : section.name === 'Technical' ? 'purple' : 'green';

                      return (
                        <div
                          key={section.name}
                          className={`border rounded-xl p-4 transition-all ${
                            section.enabled
                              ? `border-${colorClass}-200 bg-${colorClass}-50/50`
                              : 'border-gray-200 bg-gray-50 opacity-60'
                          } ${isCodingLocked ? 'cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                section.enabled ? `bg-${colorClass}-100` : 'bg-gray-200'
                              }`}>
                                <Icon className={`w-5 h-5 ${section.enabled ? `text-${colorClass}-600` : 'text-gray-400'}`} />
                              </div>
                              <div>
                                <h4 className="font-semibold text-gray-900">{section.name} Round</h4>
                                <p className="text-xs text-gray-500">
                                  {section.name === 'HR' && 'Behavioral & cultural fit questions'}
                                  {section.name === 'Technical' && 'Domain knowledge & problem solving'}
                                  {section.name === 'Coding' && (isCodingLocked ? 'Enable in JD settings to unlock' : 'Live coding challenges')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {section.enabled && (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={section.percentage}
                                    onChange={(e) => updatePercentage(section.name, parseInt(e.target.value) || 0)}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-center text-sm"
                                    min="0"
                                    max="100"
                                  />
                                  <span className="text-sm text-gray-500">%</span>
                                </div>
                              )}
                              <button
                                onClick={() => !isCodingLocked && toggleSection(section.name)}
                                disabled={isCodingLocked}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                  isCodingLocked
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : section.enabled
                                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                                }`}
                              >
                                {section.enabled ? 'Disable' : 'Enable'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Percentage Validation */}
                <div className={`p-4 rounded-lg ${isPercentageValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${isPercentageValid ? 'text-green-700' : 'text-red-700'}`}>
                      Total: {totalPercentage}%
                    </span>
                    {!isPercentageValid && (
                      <span className="text-sm text-red-600">Must equal 100%</span>
                    )}
                    {isPercentageValid && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                </div>

                {/* Coding Languages (if coding enabled) */}
                {sections.find(s => s.name === 'Coding')?.enabled && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Programming Languages</h4>
                    <div className="flex flex-wrap gap-2">
                      {programmingLanguages.slice(0, 8).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => {
                            if (selectedCodingLanguages.includes(lang)) {
                              setSelectedCodingLanguages(selectedCodingLanguages.filter(l => l !== lang));
                            } else {
                              setSelectedCodingLanguages([...selectedCodingLanguages, lang]);
                            }
                          }}
                          className={`px-3 py-1 rounded-full text-sm transition-colors ${
                            selectedCodingLanguages.includes(lang)
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {assessmentStep === 'preview' && generatedAssessment && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">Assessment Created Successfully!</p>
                    <p className="text-sm text-green-700">Review and publish to start inviting candidates</p>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{generatedAssessment.title}</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Duration:</span>
                      <span className="ml-2 font-medium">{generatedAssessment.duration_minutes} minutes</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>
                      <span className="ml-2 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Draft</span>
                    </div>
                    {generatedAssessment.hr_enabled && (
                      <div>
                        <span className="text-gray-500">HR Round:</span>
                        <span className="ml-2 font-medium">{generatedAssessment.hr_percentage}%</span>
                      </div>
                    )}
                    {generatedAssessment.technical_enabled && (
                      <div>
                        <span className="text-gray-500">Technical Round:</span>
                        <span className="ml-2 font-medium">{generatedAssessment.technical_percentage}%</span>
                      </div>
                    )}
                    {generatedAssessment.coding_enabled && (
                      <div>
                        <span className="text-gray-500">Coding Round:</span>
                        <span className="ml-2 font-medium">{generatedAssessment.coding_percentage}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={() => assessmentStep === 'preview' ? setAssessmentStep('configure') : setView('no-assessment')}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {assessmentStep === 'preview' ? 'Back to Configure' : 'Cancel'}
            </button>

            {assessmentStep === 'configure' ? (
              <button
                onClick={handleGenerateAssessment}
                disabled={!isPercentageValid || isGenerating}
                className="px-6 py-2 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-lg hover:from-gray-800 hover:to-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create Assessment
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handlePublishAssessment}
                className="px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Publish & Continue to Invite
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Invite Screen (Main) - With blur background
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-teal-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Invite Candidates</h2>
              <p className="text-green-100 text-sm">{jobTitle}</p>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Assessment Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Assessment *</label>
            <select
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">Candidates *</label>
              <button
                onClick={addCandidate}
                className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Candidate
              </button>
            </div>
            <div className="space-y-3">
              {candidates.map((cand) => (
                <div key={cand.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Full Name</label>
                      <input
                        type="text"
                        value={cand.name}
                        onChange={(e) => updateCandidate(cand.id, 'name', e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Email Address</label>
                      <input
                        type="email"
                        value={cand.email}
                        onChange={(e) => updateCandidate(cand.id, 'email', e.target.value)}
                        placeholder="john.doe@email.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  {candidates.length > 1 && (
                    <button
                      onClick={() => removeCandidate(cand.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Link Expiry</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800">Ready to Send</span>
              </div>
              <div className="text-sm text-green-700 space-y-1">
                <p><strong>Assessment:</strong> {selectedAssessmentData?.title}</p>
                <p><strong>Duration:</strong> {selectedAssessmentData?.duration_minutes} minutes</p>
                <p><strong>Recipients:</strong> {candidates.filter(c => c.name.trim() && c.email.trim()).length} candidate(s)</p>
                <p><strong>Expires in:</strong> {expiryDays} day{expiryDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {candidates.filter(c => c.name.trim() && c.email.trim()).length} candidate{candidates.length !== 1 ? 's' : ''} will receive invitations
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendInvitations}
              disabled={!isValid || isSubmitting}
              className="px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
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
