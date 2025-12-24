'use client';

import { Wand2, FileText, Copy, Download, Save, ChevronRight, Plus, X, Edit2, CheckCircle, ArrowLeft, GripVertical, Info, Eye, Pencil, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useEffect } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Job } from '@/lib/types/types';
import { toast } from '@/components/ui/enhanced-toast';
import { jdService, masterDataService, ExperienceLevel, EducationLevel, IndustryType } from '@/lib/services';
import { recordUsage } from '@/lib/services/usageTrackingService';
import { useQuotaCheck } from '@/lib/hooks/useQuotaCheck';

type CreationMode = 'ai' | 'manual';
type Step = 'create' | 'extract' | 'review';

interface ExtractedData {
  mustHaveSkills: string[];
  mustHaveComments: string[];
  niceToHaveSkills: string[];
  education: string;
  educationRequired: boolean;
  experience: string;
  experienceRequired: boolean;
  industryType: string;
  industryTypeRequired: boolean;
  allowOverqualified: boolean;
  salaryFrom: string;
  salaryTo: string;
  compensationType: 'hourly' | 'daily' | 'monthly' | 'yearly';
  locations: Array<{ city: string; radius: string }>;
  locationsRequired: boolean;
  assessmentGuidance: string;
  internalRecruiterComments: string[];
}

interface JDCreationProps {
  onBack?: () => void;
  selectedJob?: Job | null;
  onPublish?: (job: Job) => void;
}

interface DraggableSkillProps {
  skill: string;
  index: number;
  category: 'mustHaveSkills' | 'niceToHaveSkills';
  onMove: (skill: string, from: 'mustHaveSkills' | 'niceToHaveSkills', to: 'mustHaveSkills' | 'niceToHaveSkills') => void;
  onRemove: (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number) => void;
  onStartEdit: (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number, value: string) => void;
  isEditing: boolean;
  editingValue: string;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

const DraggableSkill = ({ 
  skill, 
  index, 
  category, 
  onMove, 
  onRemove, 
  onStartEdit,
  isEditing,
  editingValue,
  onEditChange,
  onSaveEdit,
  onCancelEdit
}: DraggableSkillProps) => {
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'SKILL',
    item: { skill, category, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const isMustHave = category === 'mustHaveSkills';
  const bgColor = isMustHave ? 'bg-red-50' : 'bg-blue-50';
  const borderColor = isMustHave ? 'border-red-200' : 'border-blue-200';

  return (
    <div 
      ref={dragPreview}
      className={`flex items-center justify-between p-2.5 ${bgColor} border ${borderColor} rounded-lg group transition-opacity ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      {isEditing ? (
        <>
          <input
            type="text"
            value={editingValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            autoFocus
          />
          <div className="flex gap-1 ml-2">
            <button
              onClick={onSaveEdit}
              className="text-green-600 hover:text-green-700 px-2"
              title="Save"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
            <button
              onClick={onCancelEdit}
              className="text-red-600 hover:text-red-700"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-1">
            <div 
              ref={drag}
              className="cursor-move opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
              title="Drag to move"
            >
              <GripVertical className="w-4 h-4" />
            </div>
            <span 
              className="text-sm text-gray-900 flex-1 cursor-pointer hover:text-blue-600" 
              onClick={() => onStartEdit(category, index, skill)}
              title="Click to edit"
            >
              {skill}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onStartEdit(category, index, skill)}
              className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMove(skill, category, isMustHave ? 'niceToHaveSkills' : 'mustHaveSkills')}
              className="text-xs text-blue-600 hover:text-blue-700 px-2"
              title={isMustHave ? 'Move to Nice-to-Have' : 'Convert to Must-Have'}
            >
              {isMustHave ? '→' : '←'}
            </button>
            <button
              onClick={() => onRemove(category, index)}
              className="text-red-600 hover:text-red-700"
              title="Delete"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

interface DroppableSkillsContainerProps {
  category: 'mustHaveSkills' | 'niceToHaveSkills';
  onDrop: (skill: string, fromCategory: 'mustHaveSkills' | 'niceToHaveSkills') => void;
  children: React.ReactNode;
}

const DroppableSkillsContainer = ({ category, onDrop, children }: DroppableSkillsContainerProps) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'SKILL',
    drop: (item: { skill: string; category: 'mustHaveSkills' | 'niceToHaveSkills' }) => {
      if (item.category !== category) {
        onDrop(item.skill, item.category);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  const isMustHave = category === 'mustHaveSkills';
  const isActive = isOver && canDrop;
  
  return (
    <div 
      ref={drop}
      className={`space-y-2 min-h-[100px] p-3 rounded-lg border-2 border-dashed transition-all ${
        isActive 
          ? isMustHave 
            ? 'border-red-400 bg-red-50' 
            : 'border-blue-400 bg-blue-50'
          : 'border-transparent'
      }`}
    >
      {children}
    </div>
  );
};

export default function JDCreation({ onBack, selectedJob, onPublish }: JDCreationProps = {}) {
  const [mode, setMode] = useState<CreationMode>('ai');
  const [step, setStep] = useState<Step>('create');

  // Quota check for max_jobs
  const { checkQuota, status: quotaStatus, canProceed: hasQuota, isChecking: isCheckingQuota, quotaError } = useQuotaCheck();
  const [quotaChecked, setQuotaChecked] = useState(false);

  // Step 1: Create JD
  const [jobTitle, setJobTitle] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [manualJD, setManualJD] = useState('');
  const [generatedJD, setGeneratedJD] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditingJD, setIsEditingJD] = useState(false);
  
  // Step 2: Extracted Data
  const [extractedData, setExtractedData] = useState<ExtractedData>({
    mustHaveSkills: [],
    mustHaveComments: [],
    niceToHaveSkills: [],
    education: '',
    educationRequired: false,
    experience: '',
    experienceRequired: false,
    industryType: '',
    industryTypeRequired: false,
    allowOverqualified: false,
    salaryFrom: '',
    salaryTo: '',
    compensationType: 'yearly',
    locations: [],
    locationsRequired: false,
    assessmentGuidance: '',
    internalRecruiterComments: [],
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newLocation, setNewLocation] = useState({ city: '', radius: '50' });
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  
  // Inline editing states
  const [editingSkillIndex, setEditingSkillIndex] = useState<{ category: 'mustHaveSkills' | 'niceToHaveSkills'; index: number } | null>(null);
  const [editingSkillValue, setEditingSkillValue] = useState('');
  const [editingCommentIndex, setEditingCommentIndex] = useState<number | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');
  const [editingRecruiterCommentIndex, setEditingRecruiterCommentIndex] = useState<number | null>(null);
  const [editingRecruiterCommentValue, setEditingRecruiterCommentValue] = useState('');
  const [newRecruiterComment, setNewRecruiterComment] = useState('');
  const [showDragTips, setShowDragTips] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  // Master data state
  const [experienceLevels, setExperienceLevels] = useState<ExperienceLevel[]>([]);
  const [educationLevels, setEducationLevels] = useState<EducationLevel[]>([]);
  const [industryTypes, setIndustryTypes] = useState<IndustryType[]>([]);
  const [masterDataLoading, setMasterDataLoading] = useState(true);

  // Fetch master data on mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const data = await masterDataService.getAll();
        setExperienceLevels(data.experience_levels);
        setEducationLevels(data.education_levels);
        setIndustryTypes(data.industry_types);
      } catch (error) {
        console.log('[TalentFlow] Failed to fetch master data, using fallback:', error);
      } finally {
        setMasterDataLoading(false);
      }
    };

    fetchMasterData();
  }, []);

  // Check max_jobs quota on mount
  useEffect(() => {
    const checkJobQuota = async () => {
      const canCreate = await checkQuota('max_jobs', 1);
      setQuotaChecked(true);
      if (!canCreate) {
        toast.warning({
          title: 'Job Quota Limit Reached',
          description: 'You have reached your maximum job posting limit. Please upgrade your plan to create more jobs.',
        });
      }
    };
    checkJobQuota();
  }, [checkQuota]);

  const handleGenerateJD = async () => {
    // Check quota before generating
    if (!hasQuota) {
      toast.error({
        title: 'Quota Exhausted',
        description: 'You have reached your job posting limit. Please upgrade your plan.',
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Call real API for AI JD generation
      const prompt = `${jobTitle}${aiPrompt ? ` - ${aiPrompt}` : ''}`;
      const response = await jdService.generate(prompt);

      if (response?.description) {
        // Update job title if AI provided a better one
        if (response.title && !jobTitle) {
          setJobTitle(response.title);
        }
        setGeneratedJD(response.description);

        // If extracted_params are returned, pre-populate the extracted data
        if (response.extracted_params) {
          const params = response.extracted_params;
          setExtractedData(prev => ({
            ...prev,
            mustHaveSkills: params.must_have_skills || [],
            niceToHaveSkills: params.nice_to_have_skills || [],
            education: params.education_requirements?.degree?.toLowerCase().replace("'s", 's').replace(' ', '-') || '',
            experience: params.experience_min && params.experience_max
              ? `${params.experience_min}-${params.experience_max}`
              : prev.experience,
            industryType: params.industry_type?.toLowerCase() || '',
            allowOverqualified: false,
          }));
        }

        toast.success({
          title: 'JD Generated Successfully',
          description: 'AI has created a comprehensive job description.'
        });
      } else {
        throw new Error('No description in response');
      }
    } catch (error) {
      console.error('[TalentFlow] API JD generation failed:', error);
      toast.error({
        title: 'Generation Failed',
        description: 'Could not generate JD. Please check your connection and try again.'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNext = async () => {
    setIsExtracting(true);

    try {
      const jdText = mode === 'ai' ? generatedJD : manualJD;

      // Call real API to extract parameters using AI
      const params = await jdService.extractParamsFromText(jdText);

      // Map API response to component's ExtractedData format
      const extraction: ExtractedData = {
        mustHaveSkills: params.must_have_skills || [],
        mustHaveComments: [],
        niceToHaveSkills: params.nice_to_have_skills || [],
        education: params.education_requirements?.degree?.toLowerCase().replace("'s", 's').replace(' ', '-') || '',
        educationRequired: true,
        experience: params.experience_min && params.experience_max
          ? `${params.experience_min}-${params.experience_max}`
          : '',
        experienceRequired: true,
        industryType: params.industry_type?.toLowerCase() || '',
        industryTypeRequired: false,
        allowOverqualified: false,
        salaryFrom: '',
        salaryTo: '',
        compensationType: 'yearly',
        locations: [],
        locationsRequired: false,
        assessmentGuidance: '',
        internalRecruiterComments: [],
      };

      setExtractedData(extraction);
      setStep('extract');

      toast.success({
        title: 'Data Extracted',
        description: 'AI has analyzed your JD and extracted key requirements.'
      });
    } catch (error) {
      console.error('[TalentFlow] Extraction failed:', error);
      toast.error({
        title: 'Extraction Failed',
        description: 'Could not extract data. Please check your connection and try again.'
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAddSkill = (category: 'mustHaveSkills' | 'niceToHaveSkills') => {
    if (newSkill.trim()) {
      setExtractedData(prev => ({
        ...prev,
        [category]: [...prev[category], newSkill.trim()],
      }));
      setNewSkill('');
      setEditingCategory(null);
    }
  };

  const handleRemoveSkill = (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number) => {
    setExtractedData(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }));
  };

  const handleMoveSkill = (skill: string, from: 'mustHaveSkills' | 'niceToHaveSkills', to: 'mustHaveSkills' | 'niceToHaveSkills') => {
    setExtractedData(prev => ({
      ...prev,
      [from]: prev[from].filter(s => s !== skill),
      [to]: [...prev[to], skill],
    }));
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      setExtractedData(prev => ({
        ...prev,
        mustHaveComments: [...prev.mustHaveComments, newComment.trim()],
      }));
      setNewComment('');
      setEditingCategory(null);
    }
  };

  const handleRemoveComment = (index: number) => {
    setExtractedData(prev => ({
      ...prev,
      mustHaveComments: prev.mustHaveComments.filter((_, i) => i !== index),
    }));
  };

  // Inline editing handlers
  const handleStartEditSkill = (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number, value: string) => {
    setEditingSkillIndex({ category, index });
    setEditingSkillValue(value);
  };

  const handleSaveEditSkill = () => {
    if (editingSkillIndex && editingSkillValue.trim()) {
      const { category, index } = editingSkillIndex;
      setExtractedData(prev => ({
        ...prev,
        [category]: prev[category].map((skill, i) => i === index ? editingSkillValue.trim() : skill),
      }));
    }
    setEditingSkillIndex(null);
    setEditingSkillValue('');
  };

  const handleCancelEditSkill = () => {
    setEditingSkillIndex(null);
    setEditingSkillValue('');
  };

  const handleStartEditComment = (index: number, value: string) => {
    setEditingCommentIndex(index);
    setEditingCommentValue(value);
  };

  const handleSaveEditComment = () => {
    if (editingCommentIndex !== null && editingCommentValue.trim()) {
      setExtractedData(prev => ({
        ...prev,
        mustHaveComments: prev.mustHaveComments.map((comment, i) => 
          i === editingCommentIndex ? editingCommentValue.trim() : comment
        ),
      }));
    }
    setEditingCommentIndex(null);
    setEditingCommentValue('');
  };

  const handleCancelEditComment = () => {
    setEditingCommentIndex(null);
    setEditingCommentValue('');
  };

  const handleAddRecruiterComment = () => {
    if (newRecruiterComment.trim()) {
      setExtractedData(prev => ({
        ...prev,
        internalRecruiterComments: [...prev.internalRecruiterComments, newRecruiterComment.trim()],
      }));
      setNewRecruiterComment('');
      setEditingCategory(null);
    }
  };

  const handleRemoveRecruiterComment = (index: number) => {
    setExtractedData(prev => ({
      ...prev,
      internalRecruiterComments: prev.internalRecruiterComments.filter((_, i) => i !== index),
    }));
  };

  const handleStartEditRecruiterComment = (index: number, value: string) => {
    setEditingRecruiterCommentIndex(index);
    setEditingRecruiterCommentValue(value);
  };

  const handleSaveEditRecruiterComment = () => {
    if (editingRecruiterCommentIndex !== null && editingRecruiterCommentValue.trim()) {
      setExtractedData(prev => ({
        ...prev,
        internalRecruiterComments: prev.internalRecruiterComments.map((comment, i) => 
          i === editingRecruiterCommentIndex ? editingRecruiterCommentValue.trim() : comment
        ),
      }));
    }
    setEditingRecruiterCommentIndex(null);
    setEditingRecruiterCommentValue('');
  };

  const handleCancelEditRecruiterComment = () => {
    setEditingRecruiterCommentIndex(null);
    setEditingRecruiterCommentValue('');
  };

  const handleDropSkill = (skill: string, fromCategory: 'mustHaveSkills' | 'niceToHaveSkills', toCategory: 'mustHaveSkills' | 'niceToHaveSkills') => {
    if (fromCategory !== toCategory) {
      handleMoveSkill(skill, fromCategory, toCategory);
    }
  };

  const handleAddLocation = () => {
    if (newLocation.city.trim()) {
      setExtractedData(prev => ({
        ...prev,
        locations: [...prev.locations, { 
          city: newLocation.city.trim(), 
          radius: newLocation.radius || '50'
        }],
      }));
      setNewLocation({ city: '', radius: '50' });
      setShowLocationMenu(false);
    }
  };

  const handleRemoveLocation = (index: number) => {
    setExtractedData(prev => ({
      ...prev,
      locations: prev.locations.filter((_, i) => i !== index),
    }));
  };

  const handlePublish = () => {
    // Go to review step to show summary
    setStep('review');
  };

  const handleConfirmPublish = async () => {
    console.log('[DEBUG] handleConfirmPublish called');
    setIsPublishing(true);

    try {
      // Parse experience values
      const experienceMatch = extractedData.experience.match(/(\d+)/);
      const experienceMin = experienceMatch ? parseInt(experienceMatch[1]) : undefined;

      // Build the JD data for backend
      const jdData = {
        title: jobTitle,
        description: generatedJD || manualJD,
        department: 'Engineering',
        location: extractedData.locations.length > 0
          ? extractedData.locations[0].city
          : 'Remote',
        employment_type: 'full_time',
        must_have_skills: extractedData.mustHaveSkills,
        nice_to_have_skills: extractedData.niceToHaveSkills,
        education_requirements: extractedData.education ? { degree: extractedData.education } : undefined,
        experience_min: experienceMin,
        industry_type: extractedData.industryType || undefined,
        salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9]/g, '')) : undefined,
        salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9]/g, '')) : undefined,
        compensation_type: extractedData.compensationType,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        internal_comments: extractedData.internalRecruiterComments.join('\n') || undefined,
        allow_overqualified: extractedData.allowOverqualified,
        locations: extractedData.locations.map(loc => ({
          city: loc.city,
          is_required: extractedData.locationsRequired,
        })),
      };

      console.log('[DEBUG] Calling jdService.create with data:', jdData);

      // Create JD in backend
      const createdJd = await jdService.create(jdData);
      console.log('[DEBUG] JD created successfully:', createdJd.id);

      console.log('[DEBUG] Calling jdService.publish for ID:', createdJd.id);

      // Publish the JD
      const publishedJd = await jdService.publish(createdJd.id);
      console.log('[DEBUG] JD published successfully:', publishedJd.id);

      // Track usage - POST /api/v1/external/usage/record
      // JD Creation uses RU quota (or can be tracked separately)
      recordUsage({
        quota_type: 'RU',
        amount: 0, // JD creation doesn't deduct quota, just logs
        operation_type: 'jd_creation',
        resource_id: publishedJd.id,
        metadata: {
          title: jobTitle,
          mode: mode,
          skills_count: extractedData.mustHaveSkills.length + extractedData.niceToHaveSkills.length
        }
      });

      setIsPublishing(false);
      setIsPublished(true);

      // Create the job object for UI
      if (onPublish) {
        const newJob: Job = {
          id: publishedJd.id,
          title: jobTitle,
          department: 'Engineering',
          location: extractedData.locations.length > 0
            ? extractedData.locations[0].city
            : 'Remote',
          type: 'Full-time',
          postedDate: new Date().toISOString(),
          applicants: 0,
          status: 'active' as const,
          description: generatedJD || manualJD,
          requirements: [
            ...extractedData.mustHaveSkills.map(skill => `Must have: ${skill}`),
            ...extractedData.niceToHaveSkills.map(skill => `Nice to have: ${skill}`),
          ],
          mustHaveSkills: extractedData.mustHaveSkills,
          niceToHaveSkills: extractedData.niceToHaveSkills,
          education: extractedData.education,
          experience: extractedData.experience,
          salary: extractedData.salaryFrom && extractedData.salaryTo
            ? `${extractedData.salaryFrom} - ${extractedData.salaryTo} (${extractedData.compensationType})`
            : undefined,
        };

        onPublish(newJob);

        toast.success({
          title: selectedJob ? 'Job description updated!' : 'Job description published!',
          description: `"${jobTitle}" is now live and accepting applications.`,
          action: {
            label: 'View Job',
            onClick: () => {
              toast.info('Opening job details...');
            }
          }
        });
      }
    } catch (error) {
      console.error('[ERROR] Failed to publish JD:', error);
      setIsPublishing(false);
      toast.error({
        title: 'Failed to publish job description',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-12">
      <div className="flex items-center gap-8">
        {/* Step 1 */}
        <div className="flex flex-col items-center">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full mb-2 ${
            step === 'create' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
          }`}>
            {step !== 'create' ? <CheckCircle className="w-6 h-6" /> : '1'}
          </div>
          <div className="text-xs text-gray-600 text-center whitespace-nowrap">Create JD</div>
        </div>
        
        {/* Connector 1 */}
        <div className={`w-24 h-1 -mt-6 ${step !== 'create' ? 'bg-green-600' : 'bg-gray-300'}`} />
        
        {/* Step 2 */}
        <div className="flex flex-col items-center">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full mb-2 ${
            step === 'extract' ? 'bg-blue-600 text-white' : 
            step === 'review' ? 'bg-green-600 text-white' : 
            'bg-gray-300 text-gray-600'
          }`}>
            {step === 'review' ? <CheckCircle className="w-6 h-6" /> : '2'}
          </div>
          <div className="text-xs text-gray-600 text-center whitespace-nowrap">Extract Data</div>
        </div>
        
        {/* Connector 2 */}
        <div className={`w-24 h-1 -mt-6 ${step === 'review' ? 'bg-green-600' : 'bg-gray-300'}`} />
        
        {/* Step 3 */}
        <div className="flex flex-col items-center">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full mb-2 ${
            step === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
          }`}>
            3
          </div>
          <div className="text-xs text-gray-600 text-center whitespace-nowrap">Review & Publish</div>
        </div>
      </div>
    </div>
  );

  // Load selected job data if editing
  useEffect(() => {
    if (selectedJob) {
      setJobTitle(selectedJob.title);
    }
  }, [selectedJob]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-gray-900 mb-2">
                {selectedJob ? 'Edit Job Description' : 'Job Description Creation'}
              </h1>
              <p className="text-sm text-gray-600">
                Create professional job descriptions with AI-powered extraction
              </p>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Jobs
              </button>
            )}
          </div>
        </div>

        {renderStepIndicator()}

        {/* Step 1: Create JD */}
        {step === 'create' && (
          <>
            {/* Mode Selection */}
            <div className="flex gap-4 mb-6">
              <button
                onClick={() => setMode('ai')}
                className={`flex-1 p-6 rounded-lg border-2 transition-all ${
                  mode === 'ai'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Wand2 className={`w-6 h-6 ${mode === 'ai' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <h3 className={mode === 'ai' ? 'text-blue-600' : 'text-gray-900'}>
                    AI-Generated JD
                  </h3>
                </div>
                <p className="text-sm text-gray-600 text-left">
                  Let AI create a professional job description based on your inputs
                </p>
              </button>

              <button
                onClick={() => setMode('manual')}
                className={`flex-1 p-6 rounded-lg border-2 transition-all ${
                  mode === 'manual'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Edit2 className={`w-6 h-6 ${mode === 'manual' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <h3 className={mode === 'manual' ? 'text-blue-600' : 'text-gray-900'}>
                    Manual Input
                  </h3>
                </div>
                <p className="text-sm text-gray-600 text-left">
                  Write or paste your own job description
                </p>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Input Form - AI Mode */}
              {mode === 'ai' && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h2 className="text-gray-900 mb-6">Job Details</h2>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Job Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="e.g., Senior Software Engineer"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        AI Prompt <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Describe what you're looking for in this role... e.g., 'We need a senior full-stack developer with React and Node.js experience, 5+ years, remote position, who can lead a team of 3 developers'"
                        rows={12}
                        className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        💡 Tip: Include details like experience level, key skills, responsibilities, location, team size, or any specific requirements
                      </p>
                    </div>

                    {/* Quota Warning */}
                    {quotaChecked && !hasQuota && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800">Job Quota Exceeded</p>
                          <p className="text-xs text-red-600">
                            You have reached your maximum job posting limit.{' '}
                            <a href="/subscription/plans" className="underline font-medium">Upgrade your plan</a> to create more jobs.
                          </p>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleGenerateJD}
                      disabled={!jobTitle || !aiPrompt || isGenerating || !hasQuota || isCheckingQuota}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-md hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Wand2 className="w-5 h-5" />
                      {isCheckingQuota ? (
                        <span className="animate-pulse">Checking quota...</span>
                      ) : isGenerating ? (
                        <span className="animate-pulse">Generating with AI...</span>
                      ) : !hasQuota ? (
                        'Quota Exceeded - Upgrade Plan'
                      ) : (
                        'Generate Job Description'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Manual Input Mode */}
              {mode === 'manual' && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h2 className="text-gray-900 mb-6">Job Details</h2>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Job Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="e.g., Senior Software Engineer"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Job Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={manualJD}
                        onChange={(e) => setManualJD(e.target.value)}
                        placeholder="Paste or write your job description here..."
                        rows={20}
                        className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-gray-900">
                    {mode === 'ai' ? 'Generated Job Description' : 'Job Description Preview'}
                  </h2>
                  {((mode === 'ai' && generatedJD) || (mode === 'manual' && manualJD)) && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const text = mode === 'ai' ? generatedJD : manualJD;
                          navigator.clipboard.writeText(text);
                          toast.success({ title: 'Copied!', description: 'Job description copied to clipboard' });
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const text = mode === 'ai' ? generatedJD : manualJD;
                          const blob = new Blob([`${jobTitle}\n\n${text}`], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${jobTitle.replace(/[^a-z0-9]/gi, '_')}_JD.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast.success({ title: 'Downloaded!', description: 'Job description saved as text file' });
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        title="Download as text file"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {mode === 'ai' ? (
                  generatedJD ? (
                    <div className="relative">
                      {/* Toggle Edit/View Button */}
                      <div className="absolute top-2 right-2 z-10">
                        <button
                          onClick={() => setIsEditingJD(!isEditingJD)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            isEditingJD
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {isEditingJD ? (
                            <>
                              <Eye className="w-4 h-4" />
                              Preview
                            </>
                          ) : (
                            <>
                              <Pencil className="w-4 h-4" />
                              Edit
                            </>
                          )}
                        </button>
                      </div>

                      {isEditingJD ? (
                        <textarea
                          value={generatedJD}
                          onChange={(e) => setGeneratedJD(e.target.value)}
                          className="w-full h-[600px] px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent font-mono text-sm"
                        />
                      ) : (
                        <div className="h-[600px] overflow-y-auto px-6 py-4 border border-gray-300 rounded-md bg-white markdown-content">
                          <ReactMarkdown>{generatedJD}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[600px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <div className="text-center">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p className="text-gray-600 mb-2">No job description generated yet</p>
                        <p className="text-sm text-gray-500">
                          Fill in the job details and click "Generate Job Description"
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  manualJD ? (
                    <div className="h-[600px] overflow-y-auto p-4 border border-gray-300 rounded-md bg-gray-50">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700">{manualJD}</pre>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[600px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <div className="text-center">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p className="text-gray-600 mb-2">Start typing your job description</p>
                        <p className="text-sm text-gray-500">
                          Paste or write your JD in the left panel
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Next Button */}
            <div className="flex justify-end mt-6">
              <button
                onClick={handleNext}
                disabled={isExtracting || !jobTitle || (mode === 'ai' ? !generatedJD : !manualJD)}
                className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExtracting ? 'Extracting...' : 'Next: Extract Skills'}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </>
        )}

        {/* Step 2: Extract & Modify Skills */}
        {step === 'extract' && (
          <div className="space-y-6">
            {/* Drag & Drop Tips */}
            {showDragTips && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                      <Info className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-blue-900">💡 Pro Tips: Managing Skills</h3>
                      <button
                        onClick={() => setShowDragTips(false)}
                        className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        Dismiss
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm text-blue-800">
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                        <div>
                          <strong>Drag & Drop:</strong> Hover over a skill and grab the grip icon to drag it between Must-Have and Nice-to-Have
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Edit2 className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                        <div>
                          <strong>Click to Edit:</strong> Click on any skill or comment text to edit it inline. Press Enter to save, Escape to cancel
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5 flex-shrink-0">← →</span>
                        <div>
                          <strong>Arrow Buttons:</strong> Use arrow buttons to quickly move skills between categories
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-gray-900 mb-6">Extracted Information</h2>
              <p className="text-sm text-gray-600 mb-6">
                AI has extracted the following information from your JD. You can modify, add, or remove items.
              </p>

              {/* Skills Section - 3 Column Layout */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                {/* Must-Have Skills */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Must-Have Skills</h3>
                    <button
                      onClick={() => setEditingCategory('mustHave')}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  {editingCategory === 'mustHave' && (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSkill('mustHaveSkills')}
                        placeholder="Enter skill..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddSkill('mustHaveSkills')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                      >
                        Add
                      </button>
                    </div>
                  )}
                  <DroppableSkillsContainer 
                    category="mustHaveSkills" 
                    onDrop={(skill, fromCategory) => handleDropSkill(skill, fromCategory, 'mustHaveSkills')}
                  >
                    {extractedData.mustHaveSkills.map((skill, index) => (
                      <DraggableSkill
                        key={index}
                        skill={skill}
                        index={index}
                        category="mustHaveSkills"
                        onMove={handleMoveSkill}
                        onRemove={handleRemoveSkill}
                        onStartEdit={handleStartEditSkill}
                        isEditing={editingSkillIndex?.category === 'mustHaveSkills' && editingSkillIndex?.index === index}
                        editingValue={editingSkillValue}
                        onEditChange={setEditingSkillValue}
                        onSaveEdit={handleSaveEditSkill}
                        onCancelEdit={handleCancelEditSkill}
                      />
                    ))}
                  </DroppableSkillsContainer>
                </div>

                {/* Nice-to-Have Skills */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Nice-to-Have Skills</h3>
                    <button
                      onClick={() => setEditingCategory('niceToHave')}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  {editingCategory === 'niceToHave' && (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSkill('niceToHaveSkills')}
                        placeholder="Enter skill..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddSkill('niceToHaveSkills')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                      >
                        Add
                      </button>
                    </div>
                  )}
                  <DroppableSkillsContainer 
                    category="niceToHaveSkills" 
                    onDrop={(skill, fromCategory) => handleDropSkill(skill, fromCategory, 'niceToHaveSkills')}
                  >
                    {extractedData.niceToHaveSkills.map((skill, index) => (
                      <DraggableSkill
                        key={index}
                        skill={skill}
                        index={index}
                        category="niceToHaveSkills"
                        onMove={handleMoveSkill}
                        onRemove={handleRemoveSkill}
                        onStartEdit={handleStartEditSkill}
                        isEditing={editingSkillIndex?.category === 'niceToHaveSkills' && editingSkillIndex?.index === index}
                        editingValue={editingSkillValue}
                        onEditChange={setEditingSkillValue}
                        onSaveEdit={handleSaveEditSkill}
                        onCancelEdit={handleCancelEditSkill}
                      />
                    ))}
                  </DroppableSkillsContainer>
                </div>

                {/* Must-Have Comments */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Must-Have Comments</h3>
                    <button
                      onClick={() => setEditingCategory('comments')}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  {editingCategory === 'comments' && (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                        placeholder="Enter comment..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={handleAddComment}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                      >
                        Add
                      </button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {extractedData.mustHaveComments.map((comment, index) => (
                      <div key={index} className="flex items-center justify-between p-2.5 bg-red-50 border border-red-200 rounded-lg group">
                        {editingCommentIndex === index ? (
                          <>
                            <input
                              type="text"
                              value={editingCommentValue}
                              onChange={(e) => setEditingCommentValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditComment();
                                if (e.key === 'Escape') handleCancelEditComment();
                              }}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                              autoFocus
                            />
                            <div className="flex gap-1 ml-2">
                              <button
                                onClick={handleSaveEditComment}
                                className="text-green-600 hover:text-green-700 px-2"
                                title="Save"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelEditComment}
                                className="text-red-600 hover:text-red-700"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span 
                              className="text-sm text-gray-900 flex-1 cursor-pointer hover:text-blue-600" 
                              onClick={() => handleStartEditComment(index, comment)}
                              title="Click to edit"
                            >
                              {comment}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleStartEditComment(index, comment)}
                                className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveComment(index)}
                                className="text-red-600 hover:text-red-700"
                                title="Delete"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Assessment Guidance & Internal Recruiter Comments - 2 Column Layout */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                {/* Assessment-Specific Guidance */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-gray-900">Assessment Guidance</h3>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Optional</span>
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded" title="This guidance will be shared with assessment creators">
                      ℹ️ Visible to assessment team
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Provide specific instructions or focus areas for candidate assessments
                  </p>
                  <textarea
                    value={extractedData.assessmentGuidance}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, assessmentGuidance: e.target.value }))}
                    placeholder="e.g., Focus on system design, coding best practices, problem-solving approach..."
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm resize-none"
                  />
                </div>

                {/* Internal Recruiter Comments */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-gray-900">Internal Recruiter Notes</h3>
                    <span className="text-xs text-gray-500 bg-yellow-100 px-2 py-1 rounded flex items-center gap-1">
                      🔒 Private
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Private notes not visible to candidates
                  </p>
                  
                  <div className="flex items-center justify-end mb-3">
                    <button
                      onClick={() => setEditingCategory('recruiterComments')}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add Note
                    </button>
                  </div>

                  {editingCategory === 'recruiterComments' && (
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={newRecruiterComment}
                        onChange={(e) => setNewRecruiterComment(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddRecruiterComment()}
                        placeholder="Enter internal note..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={handleAddRecruiterComment}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                      >
                        Add
                      </button>
                    </div>
                  )}

                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {extractedData.internalRecruiterComments.map((comment, index) => (
                      <div key={index} className="flex items-center justify-between p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg group">
                        {editingRecruiterCommentIndex === index ? (
                          <>
                            <input
                              type="text"
                              value={editingRecruiterCommentValue}
                              onChange={(e) => setEditingRecruiterCommentValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditRecruiterComment();
                                if (e.key === 'Escape') handleCancelEditRecruiterComment();
                              }}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                              autoFocus
                            />
                            <div className="flex gap-1 ml-2">
                              <button
                                onClick={handleSaveEditRecruiterComment}
                                className="text-green-600 hover:text-green-700 px-2"
                                title="Save"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelEditRecruiterComment}
                                className="text-red-600 hover:text-red-700"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span 
                              className="text-sm text-gray-900 flex-1 cursor-pointer hover:text-blue-600" 
                              onClick={() => handleStartEditRecruiterComment(index, comment)}
                              title="Click to edit"
                            >
                              {comment}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleStartEditRecruiterComment(index, comment)}
                                className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveRecruiterComment(index)}
                                className="text-red-600 hover:text-red-700"
                                title="Delete"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Experience, Education, Salary - 3 Column Layout */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                {/* Experience */}
                <div>
                  <h3 className="text-gray-900 mb-4">Experience</h3>
                  <select
                    value={extractedData.experience}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, experience: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-sm mb-3"
                    disabled={masterDataLoading}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select experience level'}</option>
                    {experienceLevels.map((level) => (
                      <option key={level.id} value={level.code}>{level.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.experienceRequired)}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, experienceRequired: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-600"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>

                {/* Education */}
                <div>
                  <h3 className="text-gray-900 mb-4">Education</h3>
                  <select
                    value={extractedData.education}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, education: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-sm mb-3"
                    disabled={masterDataLoading}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select education level'}</option>
                    {educationLevels.map((level) => (
                      <option key={level.id} value={level.code}>{level.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.educationRequired)}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, educationRequired: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-600"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>

                {/* Industry Type */}
                <div>
                  <h3 className="text-gray-900 mb-4">Industry Type</h3>
                  <select
                    value={extractedData.industryType}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, industryType: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-sm mb-3"
                    disabled={masterDataLoading}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select industry type'}</option>
                    {industryTypes.map((type) => (
                      <option key={type.id} value={type.code}>{type.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.industryTypeRequired)}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, industryTypeRequired: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-600"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>

                {/* Salary */}
                <div>
                  <h3 className="text-gray-900 mb-4">Salary Range</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={extractedData.salaryFrom || ''}
                        onChange={(e) => setExtractedData(prev => ({ ...prev, salaryFrom: e.target.value }))}
                        placeholder="From"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                      />
                      <input
                        type="text"
                        value={extractedData.salaryTo || ''}
                        onChange={(e) => setExtractedData(prev => ({ ...prev, salaryTo: e.target.value }))}
                        placeholder="To"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                      />
                    </div>
                    <select
                      value={extractedData.compensationType}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, compensationType: e.target.value as 'hourly' | 'daily' | 'monthly' | 'yearly' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-sm"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Candidate Preferences */}
              <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-gray-900 mb-1">Allow Overqualified Candidates</h3>
                    <p className="text-sm text-gray-600">Accept candidates who exceed the required qualifications</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.allowOverqualified)}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, allowOverqualified: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Locations Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-gray-900">Locations</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(extractedData.locationsRequired)}
                        onChange={(e) => setExtractedData(prev => ({ ...prev, locationsRequired: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-600"
                      />
                      <span className="text-sm text-gray-700">Required</span>
                    </label>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowLocationMenu(!showLocationMenu)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Location
                    </button>
                    
                    {/* Location Add Menu */}
                    {showLocationMenu && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setShowLocationMenu(false)}
                        />
                        <div className="absolute right-0 top-12 z-20 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-gray-900">Add New Location</h4>
                            <button
                              onClick={() => setShowLocationMenu(false)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            {/* Location Dropdown */}
                            <div>
                              <label className="block text-sm text-gray-700 mb-1">Location</label>
                              <select
                                value={newLocation.city}
                                onChange={(e) => setNewLocation(prev => ({ ...prev, city: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-sm"
                                autoFocus
                              >
                                <option value="">Select a location</option>
                                <optgroup label="Major US Cities">
                                  <option value="New York, NY">New York, NY</option>
                                  <option value="Los Angeles, CA">Los Angeles, CA</option>
                                  <option value="Chicago, IL">Chicago, IL</option>
                                  <option value="Houston, TX">Houston, TX</option>
                                  <option value="Phoenix, AZ">Phoenix, AZ</option>
                                  <option value="Philadelphia, PA">Philadelphia, PA</option>
                                  <option value="San Antonio, TX">San Antonio, TX</option>
                                  <option value="San Diego, CA">San Diego, CA</option>
                                  <option value="Dallas, TX">Dallas, TX</option>
                                  <option value="San Jose, CA">San Jose, CA</option>
                                </optgroup>
                                <optgroup label="Tech Hubs">
                                  <option value="San Francisco, CA">San Francisco, CA</option>
                                  <option value="Seattle, WA">Seattle, WA</option>
                                  <option value="Austin, TX">Austin, TX</option>
                                  <option value="Boston, MA">Boston, MA</option>
                                  <option value="Denver, CO">Denver, CO</option>
                                  <option value="Atlanta, GA">Atlanta, GA</option>
                                  <option value="Portland, OR">Portland, OR</option>
                                  <option value="Raleigh, NC">Raleigh, NC</option>
                                  <option value="Miami, FL">Miami, FL</option>
                                </optgroup>
                                <optgroup label="Other Cities">
                                  <option value="Washington, DC">Washington, DC</option>
                                  <option value="Minneapolis, MN">Minneapolis, MN</option>
                                  <option value="Detroit, MI">Detroit, MI</option>
                                  <option value="Nashville, TN">Nashville, TN</option>
                                  <option value="Charlotte, NC">Charlotte, NC</option>
                                  <option value="Las Vegas, NV">Las Vegas, NV</option>
                                  <option value="Salt Lake City, UT">Salt Lake City, UT</option>
                                  <option value="Pittsburgh, PA">Pittsburgh, PA</option>
                                  <option value="Columbus, OH">Columbus, OH</option>
                                  <option value="Indianapolis, IN">Indianapolis, IN</option>
                                </optgroup>
                              </select>
                            </div>
                            
                            {/* Radius Dropdown */}
                            <div>
                              <label className="block text-sm text-gray-700 mb-1">Search Radius</label>
                              <select
                                value={newLocation.radius}
                                onChange={(e) => setNewLocation(prev => ({ ...prev, radius: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-sm"
                              >
                                <option value="10">10 miles</option>
                                <option value="25">25 miles</option>
                                <option value="50">50 miles</option>
                                <option value="75">75 miles</option>
                                <option value="100">100 miles</option>
                                <option value="150">150 miles</option>
                                <option value="200">200 miles</option>
                              </select>
                            </div>
                            
                            {/* Add Button */}
                            <button
                              onClick={handleAddLocation}
                              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm mt-2"
                            >
                              Add Location
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {extractedData.locations.map((location, index) => (
                    <div key={index} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">{location.city}</div>
                          <div className="text-xs text-gray-600">{location.radius} miles radius</div>
                        </div>
                        <button
                          onClick={() => handleRemoveLocation(index)}
                          className="text-red-600 hover:text-red-700 ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep('create')}
                className="px-8 py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handlePublish}
                className="flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 transition-colors"
              >
                Review & Publish
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Publish */}
        {step === 'review' && !isPublished && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
              <h2 className="text-2xl mb-2">Review & Publish</h2>
              <p className="text-blue-100">
                Review all details before publishing. Once published, this JD will be locked and available to all authorized users.
              </p>
            </div>

            {/* Final JD Document View */}
            <div className="bg-white rounded-lg border-2 border-blue-200 shadow-lg">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4 border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg text-gray-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                      Final Job Description
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">This is the job description that will be published</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const text = mode === 'ai' ? generatedJD : manualJD;
                        navigator.clipboard.writeText(text);
                        toast.success({ title: 'Copied!', description: 'Job description copied to clipboard' });
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        const text = mode === 'ai' ? generatedJD : manualJD;
                        const fullContent = `${jobTitle}\n\n${text}\n\n--- Skills ---\nMust Have: ${extractedData.mustHaveSkills.join(', ')}\nNice to Have: ${extractedData.niceToHaveSkills.join(', ')}\n\nExperience: ${extractedData.experience}\nEducation: ${extractedData.education}`;
                        const blob = new Blob([fullContent], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${jobTitle.replace(/[^a-z0-9]/gi, '_')}_JD.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success({ title: 'Downloaded!', description: 'Job description saved as text file' });
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-8 bg-white max-h-[600px] overflow-y-auto">
                <div className="prose prose-sm max-w-none">
                  {/* Job Title */}
                  <div className="mb-6 pb-6 border-b border-gray-200">
                    <h1 className="text-3xl text-gray-900 mb-2">{jobTitle}</h1>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {extractedData.locations.length > 0 && (
                        <span>📍 {extractedData.locations[0].city}</span>
                      )}
                      {extractedData.compensationType && (
                        <span>💰 {extractedData.compensationType}</span>
                      )}
                      {extractedData.experience && (
                        <span>⏱️ {extractedData.experience} years exp</span>
                      )}
                    </div>
                  </div>

                  {/* JD Content */}
                  <div className="markdown-content text-gray-700 leading-relaxed">
                    <ReactMarkdown>
                      {mode === 'ai' ? generatedJD : manualJD}
                    </ReactMarkdown>
                  </div>

                  {/* Requirements Highlight Section */}
                  {(extractedData.mustHaveSkills.length > 0 || extractedData.niceToHaveSkills.length > 0) && (
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <h3 className="text-xl text-gray-900 mb-4">Key Requirements</h3>
                      
                      {extractedData.mustHaveSkills.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-sm uppercase tracking-wide text-red-600 mb-3">Must-Have Skills</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {extractedData.mustHaveSkills.map((skill, index) => (
                              <div key={index} className="flex items-center gap-2 text-sm text-gray-700">
                                <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                {skill}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {extractedData.niceToHaveSkills.length > 0 && (
                        <div>
                          <h4 className="text-sm uppercase tracking-wide text-blue-600 mb-3">Nice-to-Have Skills</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {extractedData.niceToHaveSkills.map((skill, index) => (
                              <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                                <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                {skill}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Compensation & Benefits */}
                  {(extractedData.salaryFrom || extractedData.salaryTo) && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <h3 className="text-xl text-gray-900 mb-3">Compensation</h3>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 inline-block">
                        <p className="text-lg text-gray-900">
                          ${extractedData.salaryFrom ? parseInt(extractedData.salaryFrom).toLocaleString() : '0'} - 
                          ${extractedData.salaryTo ? parseInt(extractedData.salaryTo).toLocaleString() : '0'}
                          <span className="text-gray-600 text-sm ml-2">per {extractedData.compensationType}</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Locations */}
                  {extractedData.locations.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <h3 className="text-xl text-gray-900 mb-3">Location{extractedData.locations.length > 1 ? 's' : ''}</h3>
                      <div className="flex flex-wrap gap-2">
                        {extractedData.locations.map((loc, index) => (
                          <div key={index} className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-2 rounded-lg">
                            📍 {loc.city} <span className="text-blue-600 text-sm">(within {loc.radius} miles)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Extracted Data Summary Preview */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              {/* Section Header */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg text-gray-900">📊 Extracted Data Summary</h3>
                <p className="text-sm text-gray-600 mt-1">Structured requirements extracted from the job description</p>
              </div>

              {/* Job Title */}
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-sm text-gray-500 mb-2">Job Title</h3>
                <p className="text-xl text-gray-900">{jobTitle}</p>
              </div>

              {/* Skills Section */}
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-gray-900 mb-4">Skills & Requirements</h3>
                <div className="grid grid-cols-3 gap-6">
                  {/* Must-Have Skills */}
                  <div>
                    <h4 className="text-sm text-gray-700 mb-3">Must-Have Skills ({extractedData.mustHaveSkills.length})</h4>
                    <div className="space-y-2">
                      {extractedData.mustHaveSkills.map((skill, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm text-gray-700">
                          <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Nice-to-Have Skills */}
                  <div>
                    <h4 className="text-sm text-gray-700 mb-3">Nice-to-Have Skills ({extractedData.niceToHaveSkills.length})</h4>
                    <div className="space-y-2">
                      {extractedData.niceToHaveSkills.map((skill, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                          <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Must-Have Comments */}
                  <div>
                    <h4 className="text-sm text-gray-700 mb-3">Must-Have Comments ({extractedData.mustHaveComments.length})</h4>
                    <div className="space-y-2">
                      {extractedData.mustHaveComments.map((comment, index) => (
                        <div key={index} className="text-sm text-gray-700 bg-red-50 p-2 rounded border border-red-200">
                          {comment}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Requirements Grid */}
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-gray-900 mb-4">Requirements</h3>
                <div className="grid grid-cols-3 gap-6">
                  {/* Experience */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm text-gray-600 mb-2">Experience</h4>
                    <p className="text-gray-900">{extractedData.experience || 'Not specified'} years</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {extractedData.experienceRequired ? '✓ Required' : '○ Preferred'}
                    </p>
                  </div>

                  {/* Education */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm text-gray-600 mb-2">Education</h4>
                    <p className="text-gray-900 capitalize">{extractedData.education?.replace('-', ' ') || 'Not specified'}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {extractedData.educationRequired ? '✓ Required' : '○ Preferred'}
                    </p>
                  </div>

                  {/* Industry Type */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm text-gray-600 mb-2">Industry Type</h4>
                    <p className="text-gray-900 capitalize">{extractedData.industryType || 'Not specified'}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {extractedData.industryTypeRequired ? '✓ Required' : '○ Preferred'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Compensation */}
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-gray-900 mb-4">Compensation</h3>
                <div className="bg-green-50 p-4 rounded-lg inline-flex items-center gap-2">
                  <span className="text-gray-900">
                    ${extractedData.salaryFrom ? parseInt(extractedData.salaryFrom).toLocaleString() : '0'} - 
                    ${extractedData.salaryTo ? parseInt(extractedData.salaryTo).toLocaleString() : '0'}
                  </span>
                  <span className="text-gray-600 text-sm">/ {extractedData.compensationType}</span>
                </div>
              </div>

              {/* Locations */}
              {extractedData.locations.length > 0 && (
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-gray-900 mb-4">
                    Locations ({extractedData.locations.length})
                    {extractedData.locationsRequired && (
                      <span className="text-xs text-gray-500 ml-2">✓ Required</span>
                    )}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {extractedData.locations.map((loc, index) => (
                      <div key={index} className="bg-blue-50 text-blue-900 px-3 py-2 rounded-lg text-sm">
                        {loc.city} <span className="text-blue-600">(+{loc.radius}mi)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assessment Guidance */}
              {extractedData.assessmentGuidance && (
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-gray-900 mb-3 flex items-center gap-2">
                    Assessment Guidance
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      ℹ️ Visible to assessment team
                    </span>
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                    {extractedData.assessmentGuidance}
                  </div>
                </div>
              )}

              {/* Internal Recruiter Comments */}
              {extractedData.internalRecruiterComments.length > 0 && (
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-gray-900 mb-3 flex items-center gap-2">
                    Internal Recruiter Notes
                    <span className="text-xs text-gray-500 bg-yellow-100 px-2 py-1 rounded">
                      🔒 Private
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {extractedData.internalRecruiterComments.map((comment, index) => (
                      <div key={index} className="bg-yellow-50 p-3 rounded-lg text-sm text-gray-700 border border-yellow-200">
                        {comment}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate Preferences */}
              <div className="p-6">
                <h3 className="text-gray-900 mb-4">Candidate Preferences</h3>
                <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-lg">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    extractedData.allowOverqualified ? 'bg-green-100' : 'bg-gray-200'
                  }`}>
                    {extractedData.allowOverqualified ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <X className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-gray-900">Allow Overqualified Candidates</p>
                    <p className="text-sm text-gray-600">
                      {extractedData.allowOverqualified 
                        ? 'Accepting candidates who exceed requirements'
                        : 'Only accepting candidates within requirements'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-between">
              <button
                onClick={() => setStep('extract')}
                className="px-6 py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                ← Back to Edit
              </button>
              <button
                onClick={handleConfirmPublish}
                disabled={isPublishing}
                className="flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPublishing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Publishing...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Confirm & Publish
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Published Success State */}
        {step === 'review' && isPublished && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-2xl text-gray-900 mb-4">Job Description Published!</h2>
            <p className="text-gray-600 mb-2">
              Your job description has been successfully published and is now live.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              🔒 This JD is now locked and available to all authorized users within your tenant.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  setStep('create');
                  setGeneratedJD('');
                  setManualJD('');
                  setJobTitle('');
                  setIsPublished(false);
                  setExtractedData({
                    mustHaveSkills: [],
                    mustHaveComments: [],
                    niceToHaveSkills: [],
                    education: '',
                    educationRequired: false,
                    experience: '',
                    experienceRequired: false,
                    industryType: '',
                    industryTypeRequired: false,
                    allowOverqualified: false,
                    salaryFrom: '',
                    salaryTo: '',
                    compensationType: 'yearly',
                    locations: [],
                    locationsRequired: false,
                    assessmentGuidance: '',
                    internalRecruiterComments: [],
                  });
                }}
                className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Create Another JD
              </button>
              <button 
                onClick={onBack}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                View All Jobs
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </DndProvider>
  );
}