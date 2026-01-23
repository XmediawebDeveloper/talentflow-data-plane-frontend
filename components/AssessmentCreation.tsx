import { ArrowLeft, Clock, Briefcase, Sliders, Plus, X, Sparkles, AlertCircle, CheckCircle2, Code, Users, Brain, BarChart, FileText, Shield, Video, Info, Building2, MapPin, Calendar, User, TrendingUp, Eye, Edit3, MoreVertical, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Job } from '@/lib/types/types';
import { assessmentService, jdService } from '@/lib/services';
import JDCreation from '@/components/JDCreation';

interface TopicSettings {
  hr_enabled: boolean;
  hr_scoring_type: 'informational' | 'scored';
  technical_enabled: boolean;
  technical_scoring_type: 'informational' | 'scored';
  coding_enabled: boolean;
  coding_scoring_type: 'informational' | 'scored';
}

interface AssessmentCreationProps {
  onBack: () => void;
  jobs: Job[];
  onCreateAssessment: (assessment: any) => void;
  onCreateNewJD?: () => void;
  onJobsRefresh?: () => void;
  topicSettings?: TopicSettings;
  preSelectedJobId?: string;
}

interface SectionConfig {
  name: 'HR' | 'Technical' | 'Coding';
  percentage: number;
  topics: string[];
  enabled: boolean;
}

export default function AssessmentCreation({ onBack, jobs, onCreateAssessment, onCreateNewJD, onJobsRefresh, topicSettings, preSelectedJobId }: AssessmentCreationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial step from URL, default to 'select-jd'
  const urlStep = searchParams.get('step') as 'select-jd' | 'configure' | 'preview' | null;
  const urlJdId = searchParams.get('jd_id');
  const editAssessmentId = searchParams.get('edit'); // Edit mode: assessment ID to edit

  const [step, setStepState] = useState<'select-jd' | 'configure' | 'preview'>(urlStep || 'select-jd');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [duration, setDuration] = useState(30);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<any>(null);

  // Helper function to update step and URL
  const setStep = (newStep: 'select-jd' | 'configure' | 'preview', jobId?: string) => {
    setStepState(newStep);
    const params = new URLSearchParams();

    // When going back to select-jd, clear all params
    if (newStep === 'select-jd') {
      router.push('/recruitment/assessments/create', { scroll: false });
      return;
    }

    params.set('step', newStep);
    if (jobId || selectedJob?.id) {
      params.set('jd_id', jobId || selectedJob?.id || '');
    }
    const queryString = params.toString();
    router.push(`/recruitment/assessments/create${queryString ? `?${queryString}` : ''}`, { scroll: false });
  };

  // Navigate to JD creation page
  const handleCreateNewJD = () => {
    router.push('/recruitment/jd-creation?from=assessment');
  };

  // Auto-select job if preSelectedJobId or urlJdId is provided
  useEffect(() => {
    const jdIdToSelect = preSelectedJobId || urlJdId;
    if (jdIdToSelect && jobs.length > 0 && !selectedJob) {
      const job = jobs.find(j => j.id === jdIdToSelect);
      if (job) {
        setSelectedJob(job);
        if (urlStep === 'configure' || urlStep === 'preview') {
          setStepState(urlStep);
        } else {
          setStep('configure', job.id);
        }
        console.log('[TalentFlow] Auto-selected JD for assessment:', job.title);
      }
    }
  }, [preSelectedJobId, urlJdId, jobs, selectedJob, urlStep]);

  // Load assessment data when in edit mode
  useEffect(() => {
    const loadAssessmentForEdit = async () => {
      if (!editAssessmentId) return;

      try {
        setIsEditMode(true);
        console.log('[TalentFlow] Loading assessment for edit:', editAssessmentId);

        const assessment = await assessmentService.get(editAssessmentId);
        setEditingAssessment(assessment);

        // Pre-populate form fields with existing assessment data
        setDuration(assessment.duration_minutes || 30);
        setProctoringEnabled(assessment.proctoring_enabled ?? true);

        // Update sections with existing data
        setSections([
          {
            name: 'HR',
            percentage: assessment.hr_percentage || 0,
            topics: assessment.hr_topics || [],
            enabled: assessment.hr_enabled ?? true
          },
          {
            name: 'Technical',
            percentage: assessment.technical_percentage || 0,
            topics: assessment.technical_topics || [],
            enabled: assessment.technical_enabled ?? true
          },
          {
            name: 'Coding',
            percentage: assessment.coding_percentage || 0,
            topics: assessment.coding_topics || [],
            enabled: assessment.coding_enabled ?? false
          }
        ]);

        // Set coding languages if present
        if (assessment.coding_languages?.length > 0) {
          setSelectedCodingLanguages(assessment.coding_languages);
        }

        console.log('[TalentFlow] Assessment loaded for editing:', assessment.title);
      } catch (error) {
        console.error('Failed to load assessment for edit:', error);
        alert('Failed to load assessment for editing. Please try again.');
        router.push('/recruitment/assessments');
      }
    };

    loadAssessmentForEdit();
  }, [editAssessmentId]);

  // Initialize sections based on global topic settings
  const getInitialSections = (): SectionConfig[] => {
    const hrEnabled = topicSettings?.hr_enabled ?? true;
    const technicalEnabled = topicSettings?.technical_enabled ?? true;
    const codingEnabled = topicSettings?.coding_enabled ?? true;

    // Calculate percentages based on enabled sections
    const enabledCount = [hrEnabled, technicalEnabled, codingEnabled].filter(Boolean).length;
    let hrPct = 0, techPct = 0, codePct = 0;

    if (enabledCount === 3) {
      hrPct = 20; techPct = 70; codePct = 10;
    } else if (enabledCount === 2) {
      if (hrEnabled && technicalEnabled) { hrPct = 30; techPct = 70; }
      else if (hrEnabled && codingEnabled) { hrPct = 40; codePct = 60; }
      else if (technicalEnabled && codingEnabled) { techPct = 70; codePct = 30; }
    } else if (enabledCount === 1) {
      if (hrEnabled) hrPct = 100;
      else if (technicalEnabled) techPct = 100;
      else if (codingEnabled) codePct = 100;
    }

    return [
      { name: 'HR', percentage: hrPct, topics: [], enabled: hrEnabled },
      { name: 'Technical', percentage: techPct, topics: [], enabled: technicalEnabled },
      { name: 'Coding', percentage: codePct, topics: [], enabled: false }, // Coding starts disabled, enabled by JD
    ];
  };

  const [sections, setSections] = useState<SectionConfig[]>(getInitialSections());
  const [newTopic, setNewTopic] = useState({ section: '' as 'HR' | 'Technical' | 'Coding', value: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessment, setGeneratedAssessment] = useState<any>(null);
  const [proctoringEnabled, setProctoringEnabled] = useState(true);

  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  // Auto-save draft state
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [draftSavedId, setDraftSavedId] = useState<string | null>(null);

  // Full-screen JD Creation modal state
  const [showJDCreation, setShowJDCreation] = useState(false);

  // Coding confirmation popup state
  const [showCodingConfirm, setShowCodingConfirm] = useState(false);
  const [codingPopupMode, setCodingPopupMode] = useState<'enable' | 'disable'>('enable');
  const [selectedCodingLanguages, setSelectedCodingLanguages] = useState<string[]>([]);

  // Refs for tracking state in effects and unmount
  const shouldSaveOnUnmountRef = useRef(false);
  const currentStateRef = useRef({
    step,
    selectedJob,
    sections,
    duration,
    selectedCodingLanguages: [] as string[],
    proctoringEnabled,
    draftSavedId: null as string | null,
  });

  // Update ref whenever state changes
  useEffect(() => {
    currentStateRef.current = {
      step,
      selectedJob,
      sections,
      duration,
      selectedCodingLanguages,
      proctoringEnabled,
      draftSavedId,
    };
    // Mark that we should save on unmount if in configure step with a selected job
    shouldSaveOnUnmountRef.current = step === 'configure' && selectedJob !== null && !draftSavedId;
  }, [step, selectedJob, sections, duration, selectedCodingLanguages, proctoringEnabled, draftSavedId]);

  // Available programming languages for selection
  const programmingLanguages = [
    'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go',
    'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'R', 'SQL'
  ];

  // Handle when JD is published from the modal
  const handleJDPublished = async (publishedJob: Job) => {
    // Close the modal
    setShowJDCreation(false);

    // Refresh the jobs list to include the new JD
    try {
      const response = await jdService.list({ status: 'published', page_size: 100 });
      if (response?.items?.length > 0) {
        const mappedJobs: Job[] = response.items.map((jd: any) => ({
          id: jd.id,
          title: jd.title,
          description: jd.description || '',
          department: jd.department || 'General',
          location: jd.location || 'Remote',
          experience: jd.job_level || 'Mid-Level',
          skills: jd.must_have_skills || [],
          status: 'Published' as const,
          created: jd.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          applicants: jd.applicants_count || 0,
          daysActive: 0,
          requiredMatch: 70,
          coding_required: jd.coding_required || false,
          supported_languages: jd.supported_languages || [],
        }));
        setLocalJobs(mappedJobs);

        // Find and auto-select the newly created JD
        const newJob = mappedJobs.find(j => j.id === publishedJob.id);
        if (newJob) {
          handleJobSelect(newJob);
        }
      }
    } catch (error) {
      console.error('Failed to refresh JDs:', error);
    }

    // Notify parent to refresh if needed
    if (onJobsRefresh) {
      onJobsRefresh();
    }
  };

  // Fetch published JDs directly from API on mount
  useEffect(() => {
    const fetchPublishedJDs = async () => {
      setIsLoadingJobs(true);
      try {
        const response = await jdService.list({ status: 'published', page_size: 100 });
        if (response?.items?.length > 0) {
          const mappedJobs: Job[] = response.items.map((jd: any) => ({
            id: jd.id,
            job_id: jd.job_id || '',
            title: jd.title,
            description: jd.description || '',
            department: jd.department || 'General',
            location: jd.location || 'Remote',
            experience: jd.job_level || 'Mid-Level',
            skills: jd.must_have_skills || [],
            status: 'Published',
            postedDate: jd.published_at || jd.created_at,
            postedBy: jd.created_by_name || 'Unknown',
            applicants: jd.applicants_count || 0,
            daysActive: 0,
            requiredMatch: 70,
            coding_required: jd.coding_required || false,
            supported_languages: jd.supported_languages || [],
            industry_type: jd.industry_type || 'Technology',
            employmentType: jd.employment_type || 'full_time',
            creation_method: jd.creation_method || 'manual',
            experience_min: jd.experience_min,
            experience_max: jd.experience_max,
          }));
          setLocalJobs(mappedJobs);
        }
      } catch (error) {
        console.error('Failed to fetch JDs:', error);
        // Fall back to props if API fails
        setLocalJobs(jobs);
      } finally {
        setIsLoadingJobs(false);
      }
    };

    fetchPublishedJDs();
  }, []);

  // Save draft on component unmount (e.g., sidebar navigation)
  useEffect(() => {
    return () => {
      const state = currentStateRef.current;
      if (shouldSaveOnUnmountRef.current && state.selectedJob && !state.draftSavedId) {
        // Use synchronous API call for unmount
        const hrSection = state.sections.find(s => s.name === 'HR');
        const technicalSection = state.sections.find(s => s.name === 'Technical');
        const codingSection = state.sections.find(s => s.name === 'Coding');

        const createData = {
          jd_id: state.selectedJob?.id || '',
          title: `${state.selectedJob?.title} - Assessment - Version 1`,
          description: `Assessment for ${state.selectedJob?.title} position`,
          duration_minutes: state.duration,
          hr_enabled: hrSection?.enabled || false,
          hr_percentage: hrSection?.enabled ? hrSection.percentage : 0,
          hr_topics: hrSection?.topics || [],
          technical_enabled: technicalSection?.enabled || false,
          technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
          technical_topics: technicalSection?.topics || [],
          coding_enabled: codingSection?.enabled || false,
          coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
          coding_topics: codingSection?.topics || [],
          coding_languages: state.selectedCodingLanguages,
          proctoring_enabled: state.proctoringEnabled,
        };

        // Fire and forget - save draft on unmount
        assessmentService.create(createData).then(response => {
          console.log('[TalentFlow] Assessment auto-saved as draft on unmount:', response.id);
        }).catch(error => {
          console.error('Failed to auto-save draft on unmount:', error);
        });
      }
    };
  }, []);

  // Check if JD requires coding based on skills/technologies
  const requiresCoding = (job: Job) => {
    const codingKeywords = ['developer', 'engineer', 'programmer', 'software', 'coding', 'python', 'java', 'javascript', 'react', 'node'];
    const jobText = `${job.title} ${job.description} ${job.skills.join(' ')}`.toLowerCase();
    return codingKeywords.some(keyword => jobText.includes(keyword));
  };

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job);

    // Check if JD explicitly requires coding (from JD configuration)
    const jdRequiresCoding = job.coding_required === true;
    const hasLanguages = job.supported_languages && job.supported_languages.length > 0;

    // Auto-configure sections based on JD's coding_required field
    if (jdRequiresCoding && hasLanguages) {
      // JD explicitly requires coding AND has languages configured - enable coding
      setSections([
        { name: 'HR', percentage: 20, topics: [], enabled: true },
        { name: 'Technical', percentage: 70, topics: [], enabled: true },
        { name: 'Coding', percentage: 10, topics: [], enabled: true },
      ]);
      setSelectedCodingLanguages(job.supported_languages!);
    } else {
      // JD does NOT require coding (coding_required is false or undefined)
      // Coding section is disabled and LOCKED - user cannot enable it
      setSections([
        { name: 'HR', percentage: 30, topics: [], enabled: true },
        { name: 'Technical', percentage: 70, topics: [], enabled: true },
        { name: 'Coding', percentage: 0, topics: [], enabled: false },
      ]);
      setSelectedCodingLanguages([]);
    }
    setStep('configure', job.id);
  };

  const updatePercentage = (sectionName: string, value: number) => {
    setSections(sections.map(s => 
      s.name === sectionName ? { ...s, percentage: Math.max(0, Math.min(100, value)) } : s
    ));
  };

  const addTopic = (sectionName: 'HR' | 'Technical' | 'Coding') => {
    if (!newTopic.value.trim()) return;
    
    setSections(sections.map(s => 
      s.name === sectionName 
        ? { ...s, topics: [...s.topics, newTopic.value.trim()] }
        : s
    ));
    setNewTopic({ section: '' as any, value: '' });
  };

  const removeTopic = (sectionName: string, topicIndex: number) => {
    setSections(sections.map(s => 
      s.name === sectionName 
        ? { ...s, topics: s.topics.filter((_, i) => i !== topicIndex) }
        : s
    ));
  };

  const getTotalPercentage = () => {
    return sections.filter(s => s.enabled).reduce((sum, s) => sum + s.percentage, 0);
  };

  // Handle coding section toggle with confirmation popups
  const handleCodingToggle = () => {
    const codingSection = sections.find(s => s.name === 'Coding');
    const isCurrentlyEnabled = codingSection?.enabled || false;

    if (!isCurrentlyEnabled) {
      // User wants to ENABLE coding - always show popup for language selection
      setCodingPopupMode('enable');
      setShowCodingConfirm(true);
    } else {
      // User wants to DISABLE coding
      const hasLanguages = selectedCodingLanguages.length > 0;
      if (hasLanguages) {
        // Has languages configured - show confirmation popup before disabling
        setCodingPopupMode('disable');
        setShowCodingConfirm(true);
      } else {
        // No languages - just disable directly
        setSections(sections.map(s => s.name === 'Coding' ? { ...s, enabled: false, percentage: 0 } : s));
      }
    }
  };

  // Confirm button handler - works for both enable and disable modes
  const handleConfirmCodingAction = () => {
    if (codingPopupMode === 'enable') {
      // Enabling coding - require language selection
      if (selectedCodingLanguages.length === 0) {
        alert('Please select at least one programming language');
        return;
      }
      setSections(sections.map(s => s.name === 'Coding' ? { ...s, enabled: true, percentage: 10 } : s));
    } else {
      // Disabling coding - clear languages and disable
      setSelectedCodingLanguages([]);
      setSections(sections.map(s => s.name === 'Coding' ? { ...s, enabled: false, percentage: 0 } : s));
    }
    setShowCodingConfirm(false);
  };

  // Cancel button handler - works for both enable and disable modes
  const handleCancelCodingAction = () => {
    // Just close the popup without making changes
    setShowCodingConfirm(false);
  };

  // Toggle a language in the selection
  const toggleLanguageSelection = (lang: string) => {
    setSelectedCodingLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleGenerateAssessment = async (saveAsDraft: boolean = false) => {
    setIsGenerating(true);

    try {
      // Call the real API to create/update assessment
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      const assessmentData = {
        jd_id: selectedJob?.id || '',
        title: isEditMode && editingAssessment
          ? editingAssessment.title  // Keep existing title - backend will update version
          : `${selectedJob?.title} - Assessment - Version 1`,
        description: `Assessment for ${selectedJob?.title} position`,
        duration_minutes: duration,  // Include the configured duration
        hr_enabled: hrSection?.enabled || false,
        hr_percentage: hrSection?.enabled ? hrSection.percentage : 0,
        hr_topics: hrSection?.topics || [],
        technical_enabled: technicalSection?.enabled || false,
        technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
        technical_topics: technicalSection?.topics || [],
        coding_enabled: codingSection?.enabled || false,
        coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
        coding_topics: codingSection?.topics || [],
        coding_languages: selectedCodingLanguages,
        proctoring_enabled: proctoringEnabled,
      };

      let resultAssessment;

      if (isEditMode && editingAssessment) {
        // Update existing assessment
        console.log('[TalentFlow] Updating assessment:', editingAssessment.id);
        resultAssessment = await assessmentService.update(editingAssessment.id, assessmentData);

        // If not saving as draft, publish the updated assessment
        if (!saveAsDraft) {
          await assessmentService.publish(editingAssessment.id);
        }
      } else {
        // Create new assessment
        resultAssessment = await assessmentService.create(assessmentData);

        // If not saving as draft, publish immediately
        if (!saveAsDraft) {
          await assessmentService.publish(resultAssessment.id);
        }
      }

      // Map API response to local format
      const assessmentDefinition = {
        id: resultAssessment.id,
        title: resultAssessment.title,
        job: selectedJob,
        duration: resultAssessment.duration_minutes,
        sections: sections.filter(s => s.enabled).map(section => ({
          name: section.name,
          percentage: section.percentage,
          topics: section.topics,
          questions: Math.ceil((resultAssessment.duration_minutes * section.percentage) / 100 / 2),
          difficulty: selectedJob?.experience === 'Senior' || selectedJob?.experience === 'Lead' ? 'Advanced' :
                     selectedJob?.experience === 'Mid-Level' ? 'Intermediate' : 'Basic',
          estimatedTime: Math.ceil((resultAssessment.duration_minutes * section.percentage) / 100),
        })),
        status: saveAsDraft ? 'Draft' : 'Active',
        createdAt: resultAssessment.created_at,
      };

      setGeneratedAssessment(assessmentDefinition);
      setIsGenerating(false);
      setStep('preview');
    } catch (error) {
      console.error('Failed to create/update assessment:', error);
      setIsGenerating(false);
      alert(`Failed to ${isEditMode ? 'update' : 'create'} assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handlePublish = () => {
    onCreateAssessment({ ...generatedAssessment, status: 'Active' });
    onBack();
  };

  // Auto-save as draft when navigating away from configure step
  const handleAutoSaveDraft = async (navigateCallback: () => void) => {
    // Only auto-save if we're in configure step and have a selected job
    if (step !== 'configure' || !selectedJob) {
      navigateCallback();
      return;
    }

    // If already saved as draft, just navigate
    if (draftSavedId) {
      navigateCallback();
      return;
    }

    setIsAutoSaving(true);

    try {
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      const createData = {
        jd_id: selectedJob?.id || '',
        title: `${selectedJob?.title} - Assessment - Version 1`,
        description: `Assessment for ${selectedJob?.title} position`,
        duration_minutes: duration,
        hr_enabled: hrSection?.enabled || false,
        hr_percentage: hrSection?.enabled ? hrSection.percentage : 0,
        hr_topics: hrSection?.topics || [],
        technical_enabled: technicalSection?.enabled || false,
        technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
        technical_topics: technicalSection?.topics || [],
        coding_enabled: codingSection?.enabled || false,
        coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
        coding_topics: codingSection?.topics || [],
        coding_languages: selectedCodingLanguages,
        proctoring_enabled: proctoringEnabled,
      };

      // Create the assessment as draft (don't publish)
      const createdAssessment = await assessmentService.create(createData);
      setDraftSavedId(createdAssessment.id);

      console.log('[TalentFlow] Assessment auto-saved as draft:', createdAssessment.id);

      setIsAutoSaving(false);
      navigateCallback();
    } catch (error) {
      console.error('Failed to auto-save draft:', error);
      setIsAutoSaving(false);
      // Still navigate even if save fails
      navigateCallback();
    }
  };

  // Handle browser close/refresh - save draft
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === 'configure' && selectedJob && !draftSavedId) {
        // Trigger auto-save synchronously (best effort)
        const hrSection = sections.find(s => s.name === 'HR');
        const technicalSection = sections.find(s => s.name === 'Technical');
        const codingSection = sections.find(s => s.name === 'Coding');

        const createData = {
          jd_id: selectedJob?.id || '',
          title: `${selectedJob?.title} - Assessment - Version 1`,
          description: `Assessment for ${selectedJob?.title} position`,
          duration_minutes: duration,
          hr_enabled: hrSection?.enabled || false,
          hr_percentage: hrSection?.enabled ? hrSection.percentage : 0,
          hr_topics: hrSection?.topics || [],
          technical_enabled: technicalSection?.enabled || false,
          technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
          technical_topics: technicalSection?.topics || [],
          coding_enabled: codingSection?.enabled || false,
          coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
          coding_topics: codingSection?.topics || [],
          coding_languages: selectedCodingLanguages,
          proctoring_enabled: proctoringEnabled,
        };

        // Use sendBeacon for reliable save on page unload
        const blob = new Blob([JSON.stringify(createData)], { type: 'application/json' });
        navigator.sendBeacon?.('/api/assessments/draft', blob);

        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [step, selectedJob, draftSavedId, sections, duration, selectedCodingLanguages, proctoringEnabled]);

  const totalPercentage = getTotalPercentage();
  const isPercentageValid = totalPercentage === 100;

  // Use localJobs which includes newly created JDs
  const availableJobs = localJobs.length > 0 ? localJobs : jobs;

  // Step 1: Select JD
  if (step === 'select-jd') {
    return (
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="w-full">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Assessments
          </button>

          <div className="mb-8">
            <h1 className="text-gray-900 mb-2">{isEditMode ? 'Edit Assessment' : 'Create New Assessment'}</h1>
            <p className="text-gray-600">
              {isEditMode
                ? 'Update the assessment configuration. Changes will create a new version.'
                : 'Select a Job Description to create an AI-powered assessment'}
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-gray-800 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm text-gray-800 mb-1">AI-Powered Assessment Generation</div>
              <div className="text-sm text-gray-900">
                Our LLM will automatically generate questions based on the JD, adjusting difficulty, topics, and time allocation based on your configuration. <strong>Each candidate receives a unique, freshly generated question set</strong> to ensure fairness and prevent question sharing.
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-gray-900">Select Job Description</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Choose the JD that this assessment will be based on
                  </p>
                </div>
                <button
                  onClick={handleCreateNewJD}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create New Job
                </button>
              </div>
            </div>

            <div className="p-6">
              {isLoadingJobs ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-gray-500">Loading job descriptions...</p>
                </div>
              ) : (
              <div className="space-y-3">
                {availableJobs.filter(j => j.status === 'Published').map(job => {
                  // Format experience range
                  const expRange = job.experience_min && job.experience_max
                    ? `${job.experience_min}-${job.experience_max} years`
                    : job.experience_min
                      ? `${job.experience_min}+ years`
                      : job.experience || 'Not specified';

                  // Format posted date
                  const postedDate = job.postedDate
                    ? new Date(job.postedDate).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : 'N/A';

                  return (
                    <div
                      key={job.id}
                      onClick={() => handleJobSelect(job)}
                      className="w-full text-left p-5 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all cursor-pointer bg-white"
                    >
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Briefcase className="w-5 h-5 text-gray-500" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title Row */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {job.job_id && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                                {job.job_id}
                              </span>
                            )}
                            <h3 className="text-gray-900 font-medium">
                              {job.title}
                            </h3>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                              Published
                            </span>
                            {job.creation_method === 'ai_generated' && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                                AI
                              </span>
                            )}
                          </div>

                          {/* Details Row */}
                          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" />
                              {job.industry_type || 'Technology'}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {job.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {job.employmentType || 'full_time'}
                            </span>
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5" />
                              {expRange}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              Posted {postedDate}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              By {job.postedBy || 'Unknown'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {job.applicants || 0} applicants
                            </span>
                          </div>
                        </div>

                        {/* Right side - Coding badge and Select button */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {job.coding_required === true ? (
                            <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                              <Code className="w-3 h-3" />
                              Coding
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded text-xs flex items-center gap-1">
                              <Code className="w-3 h-3" />
                              No Coding
                            </span>
                          )}
                          <button className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs hover:bg-gray-900 transition-colors">
                            Select
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {availableJobs.filter(j => j.status === 'Published').length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No published jobs available</p>
                    <p className="text-sm mt-1">Create and publish a Job first to create assessments</p>
                    <button
                      onClick={handleCreateNewJD}
                      className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-4 h-4" />
                      Create New Job
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-screen JD Creation Modal */}
        {showJDCreation && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-[95vw] h-[95vh] flex flex-col">
              {/* Modal Header */}
              <div className="bg-gray-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-medium">Create New Job</h2>
                    <p className="text-gray-300 text-sm">Create a job description for your assessment</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowJDCreation(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* JDCreation Component */}
              <div className="flex-1 overflow-auto">
                <JDCreation
                  onBack={() => setShowJDCreation(false)}
                  onPublish={(job) => handleJDPublished(job)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 2: Configure Assessment
  if (step === 'configure') {
    const enabledSectionsCount = sections.filter(s => s.enabled).length;

    return (
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50 relative">
        {/* Auto-saving overlay */}
        {isAutoSaving && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-gray-700" />
              <span className="text-gray-700 font-medium">Auto-saving draft...</span>
            </div>
          </div>
        )}

        <div className="w-full">
          <button
            onClick={() => handleAutoSaveDraft(() => setStep('select-jd'))}
            disabled={isAutoSaving}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Job Selection
          </button>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Configure Assessment</h1>
            <p className="text-gray-600">
              Set duration, section distribution, and topics for <span className="text-gray-900 font-medium">{selectedJob?.title}</span>
            </p>
          </div>

          {/* Two Column Layout */}
          <div className="flex gap-6">
            {/* Left Column - Main Content */}
            <div className="flex-1 space-y-6">
              {/* Configure Assessment Rounds */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sliders className="w-5 h-5 text-gray-700" />
                  <h3 className="font-medium text-gray-900">Configure Assessment Rounds</h3>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Choose which rounds to include in this assessment. Disabled rounds will not appear in the section distribution.
                </p>

                <div className="space-y-3">
                  {/* HR Round Toggle */}
                  <div className={`p-4 border rounded-lg transition-all ${!topicSettings?.hr_enabled ? 'border-gray-200 bg-gray-100 opacity-60' : sections.find(s => s.name === 'HR')?.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">HR Round</span>
                            {topicSettings?.hr_enabled === false ? (
                              <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs">Disabled in Settings</span>
                            ) : topicSettings?.hr_scoring_type === 'scored' ? (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">Cultural fit, communication skills, and behavioral questions</p>
                        </div>
                      </div>
                      <button
                        onClick={() => topicSettings?.hr_enabled !== false && setSections(sections.map(s => s.name === 'HR' ? { ...s, enabled: !s.enabled } : s))}
                        disabled={topicSettings?.hr_enabled === false}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${topicSettings?.hr_enabled === false ? 'bg-gray-200 cursor-not-allowed' : sections.find(s => s.name === 'HR')?.enabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sections.find(s => s.name === 'HR')?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Technical Round Toggle */}
                  <div className={`p-4 border rounded-lg transition-all ${!topicSettings?.technical_enabled ? 'border-gray-200 bg-gray-100 opacity-60' : sections.find(s => s.name === 'Technical')?.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Brain className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">Technical Round</span>
                            {topicSettings?.technical_enabled === false ? (
                              <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs">Disabled in Settings</span>
                            ) : topicSettings?.technical_scoring_type === 'informational' ? (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">Domain knowledge, technical concepts, and job-specific skills</p>
                        </div>
                      </div>
                      <button
                        onClick={() => topicSettings?.technical_enabled !== false && setSections(sections.map(s => s.name === 'Technical' ? { ...s, enabled: !s.enabled } : s))}
                        disabled={topicSettings?.technical_enabled === false}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${topicSettings?.technical_enabled === false ? 'bg-gray-200 cursor-not-allowed' : sections.find(s => s.name === 'Technical')?.enabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sections.find(s => s.name === 'Technical')?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Coding Round Toggle */}
                  {(() => {
                    // Determine if coding is disabled and why
                    const isCodingDisabledBySettings = topicSettings?.coding_enabled === false;
                    const isCodingDisabledByJD = selectedJob?.coding_required === false;
                    const isCodingLocked = isCodingDisabledBySettings || isCodingDisabledByJD;
                    const codingEnabled = sections.find(s => s.name === 'Coding')?.enabled;

                    return (
                      <div className={`p-4 border rounded-lg transition-all ${isCodingLocked ? 'border-gray-200 bg-gray-100 opacity-60' : codingEnabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Code className="w-5 h-5 text-gray-600" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">Coding Round</span>
                                {isCodingDisabledBySettings ? (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs">Disabled in Settings</span>
                                ) : isCodingDisabledByJD ? (
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded text-xs">Not Required for this JD</span>
                                ) : topicSettings?.coding_scoring_type === 'informational' ? (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                                )}
                                {!isCodingLocked && selectedJob?.coding_required && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Auto-Enabled</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {isCodingDisabledByJD
                                  ? 'This job description does not require coding assessment'
                                  : 'Programming challenges, algorithm design, and code implementation'
                                }
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => !isCodingLocked && handleCodingToggle()}
                            disabled={isCodingLocked}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isCodingLocked ? 'bg-gray-200 cursor-not-allowed' : codingEnabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${codingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Smart Configuration Info */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">
                      <strong>Smart Configuration:</strong> Coding round availability is determined by the Job Description. If the JD has <code className="bg-gray-200 px-1 rounded">coding_required: false</code>, the coding round will be locked and cannot be enabled. For technical JDs with coding enabled, you can configure languages. Disabled rounds will be hidden from the section distribution below.
                    </p>
                  </div>
                </div>
              </div>

              {/* Assessment Duration */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-gray-700" />
                  <h3 className="font-medium text-gray-900">Assessment Duration</h3>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="15"
                    max="120"
                    step="5"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(Math.max(15, Math.min(120, Number(e.target.value))))}
                      className="w-16 px-3 py-2 border border-gray-300 rounded-lg text-center text-sm text-gray-900"
                    />
                    <span className="text-sm text-gray-600">minutes</span>
                  </div>
                </div>
              </div>

              {/* Proctoring & Security */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-violet-600" />
                  <h3 className="font-medium text-gray-900">Proctoring & Security</h3>
                </div>

                <div className={`p-4 border rounded-lg transition-all ${proctoringEnabled ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${proctoringEnabled ? 'bg-violet-100' : 'bg-gray-200'}`}>
                        <Video className={`w-5 h-5 ${proctoringEnabled ? 'text-violet-600' : 'text-gray-500'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">Proctoring Mode</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            proctoringEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {proctoringEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                          {proctoringEnabled
                            ? 'Advanced security monitoring will be active for this assessment including webcam, screen recording, and AI cheating prevention.'
                            : 'Standard mode without advanced monitoring. Suitable for low-stakes assessments.'
                          }
                        </p>

                        {/* Privacy Notice */}
                        {proctoringEnabled && (
                          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-700">
                              Candidates will be notified about proctoring before starting. All recordings are encrypted and GDPR/DPDP compliant.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className="flex flex-col items-center gap-1 ml-4">
                      <button
                        onClick={() => setProctoringEnabled(!proctoringEnabled)}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                          proctoringEnabled ? 'bg-violet-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                          proctoringEnabled ? 'translate-x-8' : 'translate-x-1'
                        }`} />
                      </button>
                      <span className="text-xs text-gray-500 font-medium">
                        {proctoringEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section Distribution */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-gray-700" />
                    <h3 className="font-medium text-gray-900">Section Distribution</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Total:</span>
                    <span className={`text-sm font-medium ${isPercentageValid ? 'text-green-600' : 'text-red-600'}`}>
                      {totalPercentage}%
                    </span>
                  </div>
                </div>

                {!isPercentageValid && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-800">Section percentages must total exactly 100%</p>
                  </div>
                )}

                <div className="space-y-4">
                  {sections.filter(s => s.enabled).map((section) => (
                    <div key={section.name} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {section.name === 'HR' && <Users className="w-4 h-4 text-gray-600" />}
                          {section.name === 'Technical' && <Brain className="w-4 h-4 text-gray-600" />}
                          {section.name === 'Coding' && <Code className="w-4 h-4 text-gray-600" />}
                          <span className="font-medium text-gray-900">{section.name} Section</span>
                          {section.name === 'HR' ? (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                          )}
                        </div>
                        {section.name === 'Coding' && requiresCoding(selectedJob!) && (
                          <span className="text-xs text-gray-500">Auto-enabled (coding required)</span>
                        )}
                      </div>

                      <p className="text-xs text-gray-500 mb-3">
                        ~{Math.ceil((duration * section.percentage) / 100)} minutes • ~{Math.ceil((duration * section.percentage) / 100 / 2)} questions
                        {section.name !== 'HR' && <span> • Pass: &gt;7/10</span>}
                      </p>

                      {/* Percentage Allocation */}
                      <div className="mb-4">
                        <label className="text-xs text-gray-600 mb-2 block">Percentage Allocation</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={section.percentage}
                            onChange={(e) => updatePercentage(section.name, Number(e.target.value))}
                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={section.percentage}
                              onChange={(e) => updatePercentage(section.name, Number(e.target.value))}
                              className="w-14 px-2 py-1.5 border border-gray-300 rounded-lg text-center text-sm text-gray-900"
                            />
                            <span className="text-sm text-gray-600">%</span>
                          </div>
                        </div>
                      </div>

                      {/* Topics */}
                      <div>
                        <label className="text-xs text-gray-600 mb-2 block">
                          Topics (LLM will generate questions based on these)
                        </label>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={newTopic.section === section.name ? newTopic.value : ''}
                            onChange={(e) => setNewTopic({ section: section.name, value: e.target.value })}
                            onKeyPress={(e) => e.key === 'Enter' && addTopic(section.name)}
                            placeholder={`e.g., ${
                              section.name === 'HR'
                                ? 'conflict handling, salary discussion, teamwork'
                                : section.name === 'Technical'
                                ? 'domain tools, regulations, workflows'
                                : 'algorithm type, framework, logic pattern'
                            }`}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm"
                          />
                          <button
                            onClick={() => addTopic(section.name)}
                            className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-1 text-sm"
                          >
                            <Plus className="w-4 h-4" />
                            Add Topic
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {section.topics.map((topic, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-gray-100 text-gray-800 rounded text-xs flex items-center gap-1.5 border border-gray-200"
                            >
                              {topic}
                              <button onClick={() => removeTopic(section.name, idx)} className="hover:text-gray-900">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          {section.topics.length === 0 && (
                            <span className="text-xs text-gray-400 italic">
                              No topics added yet. Add topics for AI to generate relevant questions.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column - Sidebar */}
            <div className="w-80 flex-shrink-0 space-y-4">
              {/* AI Assessment Generation Info */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-gray-700" />
                  <h4 className="font-medium text-gray-900 text-sm">AI Assessment Generation</h4>
                </div>
                <div className="text-xs text-gray-600 space-y-2">
                  <p>• <strong>Unique Question Sets:</strong> Each candidate receives freshly generated questions for fairness</p>
                  <p>• LLM will analyze the JD and generate questions dynamically per candidate</p>
                  <p>• Question difficulty adjusted based on experience level</p>
                  <p>• Number of questions and time allocation calculated automatically</p>
                  <p>• Topics you provide will guide the question generation process</p>
                </div>
              </div>

              {/* Assessment Scoring Rules */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart className="w-5 h-5 text-gray-700" />
                  <h4 className="font-medium text-gray-900 text-sm">Assessment Scoring Rules</h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">Understanding how candidates are evaluated for PASS/FAIL determination</p>

                {/* HR Section */}
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">HR Section</span>
                  </div>
                  <div className="text-xs text-gray-600 ml-6 space-y-0.5">
                    <p>• Responses recorded</p>
                    <p>• Displayed in reports</p>
                  </div>
                  <div className="ml-6 mt-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                    <strong>NOT part of PASS/FAIL</strong>
                  </div>
                </div>

                {/* Technical Section */}
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">Technical Section</span>
                  </div>
                  <div className="text-xs text-gray-600 ml-6 space-y-0.5">
                    <p>• 0-10 rating per question</p>
                    <p>• Min passing score: 7/10</p>
                  </div>
                  <div className="ml-6 mt-1 px-2 py-1 bg-green-100 rounded text-xs text-green-700">
                    <strong>Counts toward PASS/FAIL</strong>
                  </div>
                </div>

                {/* Coding Section */}
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Code className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">Coding Section</span>
                  </div>
                  <div className="text-xs text-gray-600 ml-6 space-y-0.5">
                    <p>• 0-10 rating per question</p>
                    <p>• Min passing score: 7/10</p>
                  </div>
                  <div className="ml-6 mt-1 px-2 py-1 bg-green-100 rounded text-xs text-green-700">
                    <strong>Counts toward PASS/FAIL</strong>
                  </div>
                </div>

                {/* Pass/Fail Logic */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">Pass/Fail Logic (Technical & Coding Only)</span>
                  </div>
                  <div className="text-xs text-gray-600 ml-6 space-y-1">
                    <p><strong>For each section (Technical/Coding):</strong></p>
                    <p>• At least 70% of questions must score ≥7, <strong>OR</strong></p>
                    <p>• Overall section average must be ≥7</p>
                  </div>
                  <div className="mt-2 ml-6 text-xs text-gray-500">
                    <p><strong>Example:</strong> If 10 Technical questions exist:</p>
                    <p>✅ Pass: 7+ questions score ≥7</p>
                    <p>✅ Pass: Average score ≥7.0</p>
                    <p>❌ Fail: Only 6 questions score ≥7 AND average &lt;7</p>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Total Duration</div>
                    <div className="text-xl font-semibold text-gray-900">{duration} min</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Sections</div>
                    <div className="text-xl font-semibold text-gray-900">{enabledSectionsCount}</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleGenerateAssessment(true)}
                    disabled={!isPercentageValid || isGenerating}
                    className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? 'Saving...' : 'Save as Draft'}
                  </button>
                  <button
                    onClick={() => handleGenerateAssessment(false)}
                    disabled={!isPercentageValid || isGenerating}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 text-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isGenerating ? 'Publishing...' : 'Publish Assessment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coding Confirmation Popup */}
        {showCodingConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              {/* Header */}
              <div className={`${codingPopupMode === 'disable' ? 'bg-red-50 border-b border-red-200' : 'bg-blue-50 border-b border-blue-200'} px-6 py-4 rounded-t-xl`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${codingPopupMode === 'disable' ? 'bg-red-100' : 'bg-blue-100'} rounded-lg flex items-center justify-center`}>
                    <Code className={`w-5 h-5 ${codingPopupMode === 'disable' ? 'text-red-600' : 'text-blue-600'}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {codingPopupMode === 'disable'
                        ? 'Disable Coding Round?'
                        : 'Enable Coding Round'}
                    </h3>
                    <p className={`text-sm ${codingPopupMode === 'disable' ? 'text-red-700' : 'text-blue-700'}`}>
                      {codingPopupMode === 'disable'
                        ? 'This will remove the coding assessment'
                        : 'Select programming languages for the assessment'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {codingPopupMode === 'disable' ? (
                  <>
                    <p className="text-gray-600 mb-4">
                      Are you sure you want to disable the coding round? The following languages will be removed:
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedCodingLanguages.map(lang => (
                        <span key={lang} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-gray-600 mb-4">
                      Please select at least one programming language for the coding assessment.
                    </p>
                    {/* Language Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Programming Languages <span className="text-red-500">*</span>
                      </label>
                      <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <div className="flex flex-wrap gap-2">
                          {programmingLanguages.map(lang => (
                            <button
                              key={lang}
                              onClick={() => toggleLanguageSelection(lang)}
                              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                                selectedCodingLanguages.includes(lang)
                                  ? 'bg-gray-800 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {lang}
                            </button>
                          ))}
                        </div>
                      </div>
                      {selectedCodingLanguages.length > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          Selected: {selectedCodingLanguages.join(', ')}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="bg-gray-50 px-6 py-4 rounded-b-xl flex gap-3">
                <button
                  onClick={handleCancelCodingAction}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCodingAction}
                  disabled={codingPopupMode === 'enable' && selectedCodingLanguages.length === 0}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${
                    codingPopupMode === 'disable'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-gray-800 text-white hover:bg-gray-900'
                  }`}
                >
                  {codingPopupMode === 'disable' ? 'Yes, Disable' : 'Enable Coding'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 3: Preview Generated Assessment
  if (step === 'preview') {
    if (isGenerating) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-gray-800 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-gray-900 mb-2">Saving Assessment Definition...</h3>
            <p className="text-gray-600">Configuring your assessment parameters</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="w-full">
          <button
            onClick={() => setStep('configure')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Configuration
          </button>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <h1 className="text-gray-900">Assessment Definition Saved Successfully</h1>
            </div>
            <p className="text-gray-600">
              Your assessment configuration has been saved. Questions will be generated when candidates are assigned.
            </p>
          </div>

          {/* Unique Question Generation Highlight */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-600 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-green-900 mb-2">🎯 Unique Question Generation Enabled</h3>
                <p className="text-sm text-green-800 mb-3">
                  <strong>Each candidate will receive a completely unique set of questions</strong> when they take this assessment. 
                  This ensures fairness, prevents question sharing, and maintains assessment integrity.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-green-800">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Fresh questions generated per candidate</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Same difficulty & topic coverage</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Prevents answer memorization</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span>Fair & standardized evaluation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Assessment Summary */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="text-gray-900 mb-4">{generatedAssessment?.title}</h2>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-800 mb-1">Total Duration</div>
                <div className="text-2xl text-gray-900">{duration} min</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-800 mb-1">Total Questions</div>
                <div className="text-2xl text-gray-900">
                  {generatedAssessment?.sections.reduce((sum: number, s: any) => sum + s.questions, 0)}
                </div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-green-600 mb-1">Sections</div>
                <div className="text-2xl text-gray-900">{generatedAssessment?.sections.length}</div>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="text-sm text-yellow-600 mb-1">Difficulty</div>
                <div className="text-2xl text-gray-900">{selectedJob?.experience}</div>
              </div>
            </div>
          </div>

          {/* Scoring Rules Summary */}
          <div className="bg-gradient-to-r from-gray-50 to-pink-50 border-2 border-gray-300 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <BarChart className="w-6 h-6 text-gray-800 flex-shrink-0" />
              <div>
                <h3 className="text-gray-800 mb-2">🎯 Evaluation & Scoring Logic</h3>
                <p className="text-sm text-gray-700">
                  How candidates will be evaluated when taking this assessment
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* HR Section Info */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-gray-800" />
                  <h4 className="text-sm text-gray-900">HR Section</h4>
                  <span className="ml-auto px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                    Not Scored
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  Responses recorded and displayed in reports for review, but <strong>NOT included in PASS/FAIL decision</strong>
                </p>
              </div>

              {/* Technical + Coding Info */}
              <div className="bg-white rounded-lg p-4 border border-green-300">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-gray-800" />
                  <Code className="w-4 h-4 text-green-600" />
                  <h4 className="text-sm text-gray-900">Technical + Coding</h4>
                  <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                    Scored
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Each question scored 0-10. <strong>Pass requires:</strong>
                </p>
                <div className="text-xs text-gray-700 space-y-1">
                  <p>• ≥70% of questions score ≥7, <strong>OR</strong></p>
                  <p>• Section average ≥7.0</p>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-green-100 border border-green-300 rounded-lg p-3">
              <p className="text-sm text-green-900 text-center">
                <strong>Final Result:</strong> PASS/FAIL determined by Technical + Coding sections only
              </p>
            </div>
          </div>

          {/* Section Breakdown */}
          <div className="space-y-4 mb-6">
            {generatedAssessment?.sections.map((section: any, idx: number) => (
              <div key={idx} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {section.name === 'HR' && <Users className="w-5 h-5 text-gray-800" />}
                    {section.name === 'Technical' && <Brain className="w-5 h-5 text-gray-800" />}
                    {section.name === 'Coding' && <Code className="w-5 h-5 text-green-600" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-gray-900">{section.name} Section</h3>
                        {section.name === 'HR' ? (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                            Informational Only
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                            Scored (0-10 scale)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {section.questions} questions • {section.estimatedTime} min • {section.difficulty} difficulty
                        {section.name !== 'HR' && <span className="text-gray-800"> • Pass: ≥7/10</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-2xl text-gray-800">{section.percentage}%</div>
                    {section.name !== 'HR' && (
                      <span className="text-xs text-green-600">✅ Counts to PASS/FAIL</span>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-sm text-gray-700 mb-2">Topics Covered:</div>
                  <div className="flex flex-wrap gap-2">
                    {section.topics.map((topic: string, tidx: number) => (
                      <span key={tidx} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Note: Questions NOT generated yet */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-sm text-gray-800">
                    ℹ️ <strong>Questions will be generated dynamically</strong> when candidates are assigned to this assessment based on the configured topics and difficulty level.
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Status: <span className={`font-medium ${generatedAssessment?.status === 'Active' ? 'text-green-600' : 'text-yellow-600'}`}>
                {generatedAssessment?.status === 'Active' ? 'Published' : 'Draft'}
              </span>
            </div>
            <button
              onClick={() => {
                // Just notify parent and go back - assessment is already saved
                onCreateAssessment(generatedAssessment);
              }}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              Done - Go to Assessments
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}