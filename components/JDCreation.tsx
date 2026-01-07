'use client';

import { Wand2, FileText, Copy, Download, Save, ChevronRight, Plus, X, Edit2, CheckCircle, CheckCircle2, ArrowLeft, GripVertical, Info, Eye, Pencil, AlertTriangle, Cloud, CloudOff, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Job } from '@/lib/types/types';
import { toast } from '@/components/ui/enhanced-toast';
import { jdService, masterDataService, ExperienceLevel, EducationLevel, IndustryType } from '@/lib/services';
import { useQuotaCheck } from '@/lib/hooks/useQuotaCheck';

type CreationMode = 'ai' | 'manual';
type Step = 'create' | 'extract' | 'review';

// Validation constants
const VALIDATION = {
  JOB_TITLE: { min: 2, max: 75 },
  AI_PROMPT: { min: 30, max: 1500 },
  MANUAL_JD: { min: 100, max: 10000 },
  ASSESSMENT_GUIDANCE: { min: 10, max: 100 },
};

// Validation helper functions
const getCharCountColor = (current: number, min: number, max: number): string => {
  if (current < min) return 'text-orange-500';
  if (current > max) return 'text-red-500';
  return 'text-green-600';
};

const isValidLength = (value: string, min: number, max: number): boolean => {
  const len = value.trim().length;
  return len >= min && len <= max;
};

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
  department: string;
  allowOverqualified: boolean;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary';
  workModel: 'onsite' | 'remote' | 'hybrid' | 'field_based';
  salaryFrom: string;
  salaryTo: string;
  compensationType: 'hourly' | 'daily' | 'monthly' | 'yearly';
  locations: Array<{ city: string; radius: string }>;
  locationsRequired: boolean;
  assessmentGuidance: string;
  internalRecruiterComments: string[];
  // JD09: Additional extraction fields
  certifications: string[];
  domainKeywords: string[];
}

interface EditingJDData {
  id: string;
  title: string;
  description: string;
  status?: 'draft' | 'published' | 'archived';
  creation_stage: 'create' | 'extract' | 'review';
  creation_method?: 'manual' | 'ai_generated';
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  education_requirements?: { degree?: string };
  experience_min?: number;
  experience_max?: number;
  industry_type?: string;
  department?: string;
  salary_min?: number;
  salary_max?: number;
  compensation_type?: string;
  employment_type?: string;
  remote_type?: string;
  assessment_guidance?: string;
  internal_comments?: string;
  must_have_comments?: string[];
  certifications?: string[];
  domain_keywords?: string[];
  allow_overqualified?: boolean;
  locations?: Array<{ city: string; state?: string; radius_km?: number; is_required?: boolean }>;
}

interface JDCreationProps {
  onBack?: () => void;
  selectedJob?: Job | null;
  onPublish?: (job: Job) => void;
  editingJD?: EditingJDData | null;  // JD data when editing a draft
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
  const tickColor = isMustHave ? 'text-green-600' : 'text-sky-500';

  return (
    <div
      ref={dragPreview}
      className={`flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-lg group transition-opacity ${
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
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
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
            <CheckCircle className={`w-4 h-4 ${tickColor} flex-shrink-0`} />
            <span
              className="text-sm text-gray-700 flex-1 cursor-pointer hover:text-gray-900"
              onClick={() => onStartEdit(category, index, skill)}
              title="Click to edit"
            >
              {skill}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onStartEdit(category, index, skill)}
              className="text-gray-400 hover:text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMove(skill, category, isMustHave ? 'niceToHaveSkills' : 'mustHaveSkills')}
              className="text-xs text-gray-800 hover:text-gray-900 px-2"
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
            : 'border-gray-400 bg-gray-50'
          : 'border-transparent'
      }`}
    >
      {children}
    </div>
  );
};

export default function JDCreation({ onBack, selectedJob, onPublish, editingJD }: JDCreationProps = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<CreationMode>('ai');
  const [step, setStep] = useState<Step>(editingJD?.creation_stage || 'create');

  // Determine if we're editing a draft or a published JD
  // Draft JD: can be updated directly (editingId is set)
  // Published JD: can also be updated directly (editingId is set) - creates a new version on publish
  const isEditingDraft = editingJD?.status === 'draft';
  const isEditingPublished = editingJD?.status === 'published';

  // If editing a draft or published JD, we can update it directly.
  const [editingId, setEditingId] = useState<string | null>(null);
  // sourceJdId tracks the original JD for reference
  const [sourceJdId, setSourceJdId] = useState<string | null>(null);

  // Set editingId when component mounts or editingJD changes
  useEffect(() => {
    if (editingJD) {
      console.log('[DEBUG] editingJD received:', { id: editingJD.id, status: editingJD.status });
      if (editingJD.status === 'draft') {
        // Editing a draft - update it directly
        setEditingId(editingJD.id);
        setSourceJdId(null);
        console.log('[DEBUG] Setting editingId for draft:', editingJD.id);
      } else if (editingJD.status === 'published') {
        // Editing published JD - update it directly (creates new version on republish)
        setEditingId(editingJD.id);
        setSourceJdId(editingJD.id);
        console.log('[DEBUG] Setting editingId for published:', editingJD.id);
      }
    }
  }, [editingJD]);

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
    department: '',
    allowOverqualified: false,
    employmentType: 'full_time',
    workModel: 'onsite',
    salaryFrom: '',
    salaryTo: '',
    compensationType: 'yearly',
    locations: [],
    locationsRequired: false,
    assessmentGuidance: '',
    internalRecruiterComments: [],
    // JD09: Certifications and Domain Keywords
    certifications: [],
    domainKeywords: [],
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newLocation, setNewLocation] = useState({ city: '', radius: '50' });
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [locationStateFilter, setLocationStateFilter] = useState<string>('all');
  
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
  const [publishedJdId, setPublishedJdId] = useState<string | null>(null);
  const [extractedDataModified, setExtractedDataModified] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showExtractedSummary, setShowExtractedSummary] = useState(false);

  // Save to draft state
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // JD06: Autosave state
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastAutosaveTime, setLastAutosaveTime] = useState<Date | null>(null);

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

  // JD06: Autosave as draft when user types (debounced)
  // Works in both AI mode and manual mode during create step
  useEffect(() => {
    if (step !== 'create') return;

    // Need job title with at least 2 characters (backend requirement)
    if (jobTitle.trim().length < 2) return;

    const autosaveTimer = setTimeout(async () => {
      // Don't autosave if currently saving via another action
      if (isSavingDraft || isPublishing) return;

      setAutosaveStatus('saving');

      try {
        // Build description based on mode
        // For AI mode: use generated JD, or AI prompt as placeholder, or empty string
        const description = mode === 'ai'
          ? (generatedJD || (aiPrompt ? `[AI Prompt - Pending Generation]\n\n${aiPrompt}` : ''))
          : manualJD;

        const jdData = {
          title: jobTitle,
          description: description,
          creation_stage: 'create' as const,
          creation_method: mode === 'ai' ? 'ai_generated' : 'manual' as const,
        };

        let savedJd;
        if (editingId) {
          // Update existing draft
          savedJd = await jdService.update(editingId, jdData);
        } else {
          // Create new draft
          savedJd = await jdService.create(jdData);
          setEditingId(savedJd.id);
        }

        setAutosaveStatus('saved');
        setLastAutosaveTime(new Date());

        // Reset status after 3 seconds
        setTimeout(() => {
          setAutosaveStatus('idle');
        }, 3000);
      } catch (error) {
        console.error('[JD06] Autosave failed:', error);
        setAutosaveStatus('error');
        // Reset error status after 5 seconds
        setTimeout(() => {
          setAutosaveStatus('idle');
        }, 5000);
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(autosaveTimer);
  }, [jobTitle, manualJD, aiPrompt, generatedJD, step, mode, editingId, isSavingDraft, isPublishing]);

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

          // Map experience - prioritize explicit min/max values over level mapping
          let expValue = '';

          // First try to use experience_min and experience_max (more accurate)
          if (params.experience_min !== null && params.experience_min !== undefined) {
            if (params.experience_max !== null && params.experience_max !== undefined) {
              expValue = `${params.experience_min}-${params.experience_max}`;
            } else {
              expValue = `${params.experience_min}+`;
            }
          } else if (params.experience_max !== null && params.experience_max !== undefined) {
            expValue = `0-${params.experience_max}`;
          }

          // Fall back to experience_level mapping if no min/max
          if (!expValue && params.experience_level) {
            const levelMap: Record<string, string> = {
              'entry': '0-2',
              'junior': '2-5',
              'mid': '5-7',
              'senior': '7-10',
              'architect': '10+',
              'management': '10+',
            };
            // Handle various formats like "mid", "Mid", "Mid Level", "mid-level"
            const normalizedLevel = params.experience_level.toLowerCase().replace(/[^a-z]/g, '');
            expValue = levelMap[normalizedLevel] || '';
          }

          setExtractedData(prev => ({
            ...prev,
            mustHaveSkills: params.must_have_skills || [],
            mustHaveComments: params.must_have_comments || [],
            niceToHaveSkills: params.nice_to_have_skills || [],
            education: params.education_requirements?.degree?.toLowerCase().replace("'s", 's').replace(' ', '-') || '',
            experience: expValue || prev.experience,
            industryType: params.industry_type?.toLowerCase() || '',
            employmentType: prev.employmentType,  // Keep existing value
            workModel: prev.workModel,  // Keep existing value
            salaryFrom: params.salary_min ? params.salary_min.toString() : '',
            salaryTo: params.salary_max ? params.salary_max.toString() : '',
            compensationType: (params.compensation_type as 'yearly' | 'monthly' | 'hourly' | 'daily') || 'yearly',
            locations: (params.locations || []).map((loc: any) => ({
              city: loc.city || '',
              radius: '50'
            })),
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
      // Map experience - prioritize explicit min/max values over level mapping
      let experienceValue = '';

      // First try to use experience_min and experience_max (more accurate)
      if (params.experience_min !== null && params.experience_min !== undefined) {
        if (params.experience_max !== null && params.experience_max !== undefined) {
          experienceValue = `${params.experience_min}-${params.experience_max}`;
        } else {
          experienceValue = `${params.experience_min}+`;
        }
      } else if (params.experience_max !== null && params.experience_max !== undefined) {
        experienceValue = `0-${params.experience_max}`;
      }

      // Fall back to experience_level mapping if no min/max
      if (!experienceValue && params.experience_level) {
        const levelMap: Record<string, string> = {
          'entry': '0-2',
          'junior': '2-5',
          'mid': '5-7',
          'senior': '7-10',
          'architect': '10+',
          'management': '10+',
        };
        // Handle various formats like "mid", "Mid", "Mid Level", "mid-level"
        const normalizedLevel = params.experience_level.toLowerCase().replace(/[^a-z]/g, '');
        experienceValue = levelMap[normalizedLevel] || '';
      }

      const extraction: ExtractedData = {
        mustHaveSkills: params.must_have_skills || [],
        mustHaveComments: params.must_have_comments || [],
        niceToHaveSkills: params.nice_to_have_skills || [],
        education: params.education_requirements?.degree?.toLowerCase().replace("'s", 's').replace(' ', '-') || '',
        educationRequired: true,
        experience: experienceValue,
        experienceRequired: true,
        industryType: params.industry_type?.toLowerCase() || '',
        industryTypeRequired: false,
        allowOverqualified: false,
        employmentType: 'full_time',  // Default value
        workModel: 'onsite',  // Default value
        salaryFrom: params.salary_min ? params.salary_min.toString() : '',
        salaryTo: params.salary_max ? params.salary_max.toString() : '',
        compensationType: (params.compensation_type as 'yearly' | 'monthly' | 'hourly' | 'daily') || 'yearly',
        locations: (params.locations || []).map((loc: any) => ({
          city: loc.city || '',
          radius: '50'  // Default radius
        })),
        locationsRequired: false,
        assessmentGuidance: '',
        internalRecruiterComments: [],
        // JD09: Extract certifications and domain keywords
        certifications: params.certifications || [],
        domainKeywords: params.domain_keywords || [],
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
      setExtractedDataModified(true);
    }
  };

  const handleRemoveSkill = (category: 'mustHaveSkills' | 'niceToHaveSkills', index: number) => {
    setExtractedData(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }));
    setExtractedDataModified(true);
  };

  const handleMoveSkill = (skill: string, from: 'mustHaveSkills' | 'niceToHaveSkills', to: 'mustHaveSkills' | 'niceToHaveSkills') => {
    setExtractedData(prev => ({
      ...prev,
      [from]: prev[from].filter(s => s !== skill),
      [to]: [...prev[to], skill],
    }));
    setExtractedDataModified(true);
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
      setExtractedDataModified(true);
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

  const handlePublish = async () => {
    // Validate mandatory fields
    const missingFields: string[] = [];

    // Must have at least one must-have skill
    if (extractedData.mustHaveSkills.length === 0) {
      missingFields.push('At least one Must-Have Skill');
    }
    if (!extractedData.experience) {
      missingFields.push('Experience');
    }
    if (!extractedData.education) {
      missingFields.push('Education');
    }
    if (!extractedData.industryType) {
      missingFields.push('Industry Type');
    }

    if (missingFields.length > 0) {
      toast({
        title: 'Missing Required Fields',
        description: `Please complete: ${missingFields.join(', ')}`,
        variant: 'error',
      });
      return;
    }

    // BEFORE going to review, reformat the JD description using AI
    console.log('[DEBUG] Reformatting JD description with AI before review...');
    setIsRegenerating(true);

    try {
      // Build a detailed prompt from all the extracted data
      // Safety checks: ensure all arrays exist
      const mustHaveSkills = extractedData.mustHaveSkills || [];
      const niceToHaveSkills = extractedData.niceToHaveSkills || [];
      const locations = extractedData.locations || [];
      const mustHaveComments = extractedData.mustHaveComments || [];

      const skillsText = [
        ...mustHaveSkills.map(s => `Must have: ${s}`),
        ...niceToHaveSkills.map(s => `Nice to have: ${s}`),
      ].join(', ');

      const requirementsText = [
        extractedData.experience ? `Experience: ${extractedData.experience}` : '',
        extractedData.education ? `Education: ${extractedData.education}` : '',
        extractedData.industryType ? `Industry: ${extractedData.industryType}` : '',
        extractedData.employmentType ? `Employment Type: ${extractedData.employmentType}` : '',
        extractedData.workModel ? `Work Model: ${extractedData.workModel}` : '',
      ].filter(Boolean).join('. ');

      const locationsText = locations.length > 0
        ? `Location: ${locations.map(l => l.city).join(', ')}`
        : '';

      const commentsText = mustHaveComments.length > 0
        ? `Additional Requirements: ${mustHaveComments.join(', ')}`
        : '';

      // Create comprehensive prompt for professional formatting using ALL extracted data
      const reformatPrompt = `You are a professional HR recruiter. Create a comprehensive, well-structured job description using the information below.

Job Title: ${jobTitle}

Required Skills (Must Have):
${mustHaveSkills.map(s => `- ${s}`).join('\n')}

Preferred Skills (Nice to Have):
${niceToHaveSkills.map(s => `- ${s}`).join('\n')}

Experience Required: ${extractedData.experience || 'Not specified'}
Education Required: ${extractedData.education || 'Not specified'}
Industry: ${extractedData.industryType || 'Not specified'}
Employment Type: ${extractedData.employmentType || 'full_time'}
Work Model: ${extractedData.workModel || 'onsite'}
Locations: ${locations.map(l => l.city).join(', ') || 'Not specified'}
Salary Range: ${extractedData.salaryFrom && extractedData.salaryTo ? `₹${extractedData.salaryFrom} - ₹${extractedData.salaryTo} (${extractedData.compensationType})` : 'Competitive'}

Additional Requirements:
${mustHaveComments.map(c => `- ${c}`).join('\n') || 'None'}

Internal Guidance: ${extractedData.assessmentGuidance || 'None'}

IMPORTANT FORMATTING INSTRUCTIONS:
Create a professional job description with these EXACT sections in this order:

Job Title: ${jobTitle}

Job Overview:
[Write a compelling 2-3 sentence overview about the role and what the ideal candidate will do]

Key Responsibilities:
[List 5-7 main responsibilities as bullet points starting with action verbs]

Required Skills and Experience:
[List all must-have skills and experience requirements as bullet points]

Preferred Skills:
[List all nice-to-have skills as bullet points - only if there are nice-to-have skills]

Education:
[State the education requirement clearly]

Experience Level:
[State the experience level based on years mentioned]

Industry:
[State the industry type - "Preferred" or "Required" based on context]

Why Join Us:
[List 3-4 compelling reasons to join, such as competitive salary, growth opportunities, work culture, etc.]

Use professional language, clear formatting, and make it engaging for candidates. Each section should be clearly labeled and well-organized.`;

      console.log('[DEBUG] Calling AI to reformat JD...');
      console.log('[DEBUG] Prompt:', reformatPrompt.substring(0, 200) + '...');

      const response = await jdService.generate(reformatPrompt);
      console.log('[DEBUG] AI Response received:', response);

      if (response && response.description) {
        setGeneratedJD(response.description);
        console.log('[DEBUG] JD reformatted successfully, length:', response.description.length);

        toast.success({
          title: 'JD Reformatted',
          description: 'Job description has been formatted professionally by AI.',
        });
      } else {
        console.warn('[WARN] No description in response, keeping original');
        toast.warning({
          title: 'Using Original JD',
          description: 'AI formatting unavailable. Using current version.',
        });
      }
    } catch (error) {
      console.error('[ERROR] Failed to reformat JD:', error);
      toast.warning({
        title: 'Formatting Warning',
        description: 'Could not reformat JD with AI. Proceeding with current version.',
      });
    } finally {
      setIsRegenerating(false);
    }

    // Go to review step to show the reformatted summary
    setStep('review');
  };

  // JD12: Compute validation status for review screen
  const getValidationStatus = () => {
    const missingFields: string[] = [];

    if (extractedData.mustHaveSkills.length === 0) {
      missingFields.push('At least one Must-Have Skill');
    }
    if (!extractedData.experience) {
      missingFields.push('Experience');
    }
    if (!extractedData.education) {
      missingFields.push('Education');
    }
    if (!extractedData.industryType) {
      missingFields.push('Industry Type');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  };

  const validationStatus = getValidationStatus();

  // Handle regenerating JD based on modified extracted data
  const handleRegenerateFromExtractedData = async () => {
    setIsRegenerating(true);

    try {
      // Build a prompt from the extracted data to regenerate the JD
      const skillsText = [
        ...extractedData.mustHaveSkills.map(s => `Must have: ${s}`),
        ...extractedData.niceToHaveSkills.map(s => `Nice to have: ${s}`),
      ].join(', ');

      const requirementsText = [
        extractedData.experience ? `Experience: ${extractedData.experience}` : '',
        extractedData.education ? `Education: ${extractedData.education}` : '',
        extractedData.industryType ? `Industry: ${extractedData.industryType}` : '',
      ].filter(Boolean).join('. ');

      const locationsText = extractedData.locations.length > 0
        ? `Location: ${extractedData.locations.map(l => l.city).join(', ')}`
        : '';

      const regeneratePrompt = `${jobTitle} - Skills: ${skillsText}. ${requirementsText}. ${locationsText}`;

      const response = await jdService.generate(regeneratePrompt);

      if (response?.description) {
        setGeneratedJD(response.description);
        setExtractedDataModified(false);

        toast.success({
          title: 'JD Regenerated',
          description: 'Job description has been updated based on your changes.'
        });
      }
    } catch (error) {
      console.error('[TalentFlow] Regeneration failed:', error);
      toast.error({
        title: 'Regeneration Failed',
        description: 'Could not regenerate JD. Please try again.'
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleConfirmPublish = async () => {
    console.log('[DEBUG] handleConfirmPublish called');
    setIsPublishing(true);

    try {
      // Parse experience values - handle formats like "3-5", "5+", "0-2"
      let experienceMin: number | undefined;
      let experienceMax: number | undefined;
      if (extractedData.experience) {
        const rangeMatch = extractedData.experience.match(/(\d+)\s*-\s*(\d+)/);
        const plusMatch = extractedData.experience.match(/(\d+)\+/);
        if (rangeMatch) {
          experienceMin = parseInt(rangeMatch[1]);
          experienceMax = parseInt(rangeMatch[2]);
        } else if (plusMatch) {
          experienceMin = parseInt(plusMatch[1]);
        } else {
          const singleMatch = extractedData.experience.match(/(\d+)/);
          if (singleMatch) {
            experienceMin = parseInt(singleMatch[1]);
          }
        }
      }

      // Build the JD data for backend
      const jdData = {
        title: jobTitle,
        description: generatedJD || manualJD,
        department: extractedData.department || '',
        location: extractedData.locations.length > 0
          ? extractedData.locations[0].city
          : 'Remote',
        employment_type: extractedData.employmentType,
        remote_type: extractedData.workModel,
        must_have_skills: extractedData.mustHaveSkills,
        nice_to_have_skills: extractedData.niceToHaveSkills,
        education_requirements: extractedData.education ? { degree: extractedData.education } : undefined,
        experience_min: experienceMin,
        experience_max: experienceMax,
        industry_type: extractedData.industryType || undefined,
        salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9]/g, '')) : undefined,
        salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9]/g, '')) : undefined,
        compensation_type: extractedData.compensationType,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        internal_comments: extractedData.internalRecruiterComments.join('\n') || undefined,
        must_have_comments: extractedData.mustHaveComments,
        allow_overqualified: extractedData.allowOverqualified,
        // JD11: Include certifications and domain_keywords in data sync
        certifications: extractedData.certifications,
        domain_keywords: extractedData.domainKeywords,
        locations: extractedData.locations.map(loc => {
          // Parse "City, State" format
          const parts = loc.city.split(', ');
          return {
            city: parts[0],
            state: parts[1] || null,
            radius_km: parseInt(loc.radius) || 50,
            is_required: extractedData.locationsRequired,
          };
        }),
        creation_method: mode === 'ai' ? 'ai_generated' : 'manual' as const,
      };

      console.log('[DEBUG] handleConfirmPublish - editingId:', editingId, 'isEditingDraft:', isEditingDraft);

      let jdToPublish;
      if (editingId) {
        // Editing a draft - update it first, then publish
        console.log('[DEBUG] Updating existing draft with ID:', editingId);
        jdToPublish = await jdService.update(editingId, jdData);
        console.log('[DEBUG] Draft updated successfully:', jdToPublish.id);
      } else {
        // New JD or creating from published - create new
        console.log('[DEBUG] Creating new JD');
        jdToPublish = await jdService.create(jdData);
        console.log('[DEBUG] JD created successfully:', jdToPublish.id);
      }

      console.log('[DEBUG] Calling jdService.publish for ID:', jdToPublish.id);

      // Publish the JD
      const publishedJd = await jdService.publish(jdToPublish.id);
      console.log('[DEBUG] JD published successfully:', publishedJd.id);

      // Usage tracking is now handled by the backend publish endpoint
      // which calls the external usage API (talentflowapi.mo.vc)

      setIsPublishing(false);
      setIsPublished(true);
      setPublishedJdId(publishedJd.id);

      // Create the job object for UI
      if (onPublish) {
        const newJob: Job = {
          id: publishedJd.id,
          title: jobTitle,
          department: extractedData.department || '',
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
          title: isEditingPublished ? 'Job description republished!' : 'Job description published!',
          description: isEditingPublished
            ? `"${jobTitle}" has been updated and a new version has been saved.`
            : `"${jobTitle}" is now live and accepting applications.`,
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

  // Check if there's unsaved data worth saving
  const hasUnsavedData = () => {
    // Need job title with at least 2 characters (backend requirement)
    return jobTitle.trim().length >= 2;
  };

  // Handle back button click - auto save as draft if there's unsaved data
  const handleBackClick = async () => {
    console.log('[DEBUG] handleBackClick called');
    console.log('[DEBUG] hasUnsavedData:', hasUnsavedData());
    console.log('[DEBUG] mode:', mode, 'jobTitle:', jobTitle, 'aiPrompt:', aiPrompt, 'generatedJD:', generatedJD?.substring(0, 50));
    console.log('[DEBUG] isPublished:', isPublished);

    if (hasUnsavedData() && !isPublished) {
      console.log('[DEBUG] Saving draft before navigating back...');
      // Auto save as draft
      await handleSaveDraft();
      console.log('[DEBUG] Draft save completed, now navigating back');
    } else {
      console.log('[DEBUG] No unsaved data or already published, skipping save');
    }
    // Always navigate back after saving (or if no unsaved data)
    if (onBack) {
      onBack();
    }
  };

  // Save JD as draft
  const handleSaveDraft = async () => {
    // Validate job title has at least 2 characters (backend requirement)
    if (jobTitle.trim().length < 2) {
      toast.warning({
        title: 'Cannot save draft',
        description: 'Job title must have at least 2 characters',
      });
      return;
    }

    setIsSavingDraft(true);

    try {
      // Parse experience values - handle formats like "3-5", "5+", "0-2"
      let experienceMin: number | undefined;
      let experienceMax: number | undefined;
      if (extractedData.experience) {
        const rangeMatch = extractedData.experience.match(/(\d+)\s*-\s*(\d+)/);
        const plusMatch = extractedData.experience.match(/(\d+)\+/);
        if (rangeMatch) {
          experienceMin = parseInt(rangeMatch[1]);
          experienceMax = parseInt(rangeMatch[2]);
        } else if (plusMatch) {
          experienceMin = parseInt(plusMatch[1]);
        } else {
          const singleMatch = extractedData.experience.match(/(\d+)/);
          if (singleMatch) {
            experienceMin = parseInt(singleMatch[1]);
          }
        }
      }

      // Build the JD data for backend
      // For AI mode: use generated JD, or AI prompt as placeholder, or empty string
      // For manual mode: use manual JD
      const descriptionToSave = mode === 'ai'
        ? (generatedJD || (aiPrompt ? `[AI Prompt - Pending Generation]\n\n${aiPrompt}` : ''))
        : manualJD;
      console.log('[DEBUG] handleSaveDraft - descriptionToSave:', descriptionToSave?.substring(0, 100));

      const jdData = {
        title: jobTitle,
        description: descriptionToSave,
        department: extractedData.department || '',
        location: extractedData.locations.length > 0
          ? extractedData.locations[0].city
          : 'Remote',
        employment_type: extractedData.employmentType,
        remote_type: extractedData.workModel,
        must_have_skills: extractedData.mustHaveSkills,
        nice_to_have_skills: extractedData.niceToHaveSkills,
        education_requirements: extractedData.education ? { degree: extractedData.education } : undefined,
        experience_min: experienceMin,
        experience_max: experienceMax,
        industry_type: extractedData.industryType || undefined,
        salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9]/g, '')) : undefined,
        salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9]/g, '')) : undefined,
        compensation_type: extractedData.compensationType,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        internal_comments: extractedData.internalRecruiterComments.join('\n') || undefined,
        must_have_comments: extractedData.mustHaveComments,
        allow_overqualified: extractedData.allowOverqualified,
        // JD11: Include certifications and domain_keywords in data sync
        certifications: extractedData.certifications,
        domain_keywords: extractedData.domainKeywords,
        creation_stage: step,  // Save the current step so user can continue from here
        locations: extractedData.locations.map(loc => {
          // Parse "City, State" format
          const parts = loc.city.split(', ');
          return {
            city: parts[0],
            state: parts[1] || null,
            radius_km: parseInt(loc.radius) || 50,
            is_required: extractedData.locationsRequired,
          };
        }),
        creation_method: mode === 'ai' ? 'ai_generated' : 'manual' as const,
      };

      // Update existing JD or create new one
      console.log('[DEBUG] Save draft - editingId:', editingId, 'isEditingDraft:', isEditingDraft, 'isEditingPublished:', isEditingPublished);
      console.log('[DEBUG] jdData being saved:', { title: jdData.title, description: jdData.description?.substring(0, 100), creation_method: jdData.creation_method });
      let savedJd;
      if (editingId) {
        console.log('[DEBUG] Updating existing draft with ID:', editingId);
        savedJd = await jdService.update(editingId, jdData);
        console.log('[DEBUG] JD updated as draft:', savedJd.id);
      } else {
        console.log('[DEBUG] Creating new draft (editingId is null)');
        savedJd = await jdService.create(jdData);
        setEditingId(savedJd.id);  // Track the new ID in case we save again
        console.log('[DEBUG] JD created as draft:', savedJd.id);
      }

      setIsSavingDraft(false);

      toast.success({
        title: isEditingPublished ? 'New draft created!' : 'Draft saved!',
        description: isEditingPublished
          ? `A new draft version of "${jobTitle}" has been created. The original JD remains unchanged.`
          : `"${jobTitle}" has been saved. You can continue editing.`,
      });

      // Stay on page - don't navigate away after saving draft
    } catch (error) {
      console.error('[ERROR] Failed to save draft:', error);
      setIsSavingDraft(false);
      toast.error({
        title: 'Failed to save draft',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
      // Stay on page even on error - let user retry or fix issues
    }
  };

  const renderStepIndicator = () => (
    <div className="py-4">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-4">
        {/* Step 1 */}
        <div className="flex flex-col items-center min-w-[120px]">
          <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-2 text-lg font-medium ${
            step === 'create' ? 'bg-gray-800 text-white' : 'bg-green-600 text-white'
          }`}>
            {step !== 'create' ? <CheckCircle className="w-7 h-7" /> : '1'}
          </div>
          <div className="text-sm text-gray-700 text-center whitespace-nowrap font-medium">Create JD</div>
        </div>

        {/* Connector 1 */}
        <div className={`w-32 lg:w-48 h-1 -mt-6 ${step !== 'create' ? 'bg-green-600' : 'bg-gray-300'}`} />

        {/* Step 2 */}
        <div className="flex flex-col items-center min-w-[120px]">
          <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-2 text-lg font-medium ${
            step === 'extract' ? 'bg-gray-800 text-white' :
            step === 'review' ? 'bg-green-600 text-white' :
            'bg-gray-300 text-gray-600'
          }`}>
            {step === 'review' ? <CheckCircle className="w-7 h-7" /> : '2'}
          </div>
          <div className="text-sm text-gray-700 text-center whitespace-nowrap font-medium">Extract Data</div>
        </div>

        {/* Connector 2 */}
        <div className={`w-32 lg:w-48 h-1 -mt-6 ${step === 'review' ? 'bg-green-600' : 'bg-gray-300'}`} />

        {/* Step 3 */}
        <div className="flex flex-col items-center min-w-[120px]">
          <div className={`flex items-center justify-center w-12 h-12 rounded-full mb-2 text-lg font-medium ${
            step === 'review' ? 'bg-gray-800 text-white' : 'bg-gray-300 text-gray-600'
          }`}>
            3
          </div>
          <div className="text-sm text-gray-700 text-center whitespace-nowrap font-medium">Review & Publish</div>
        </div>
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

  // Load JD data when editing
  // - Draft JD: editingId is already set in useState, so saves will update the same draft
  // - Published JD: editingId is null, so saves will create a new draft
  useEffect(() => {
    if (editingJD) {
      setJobTitle(editingJD.title);
      setGeneratedJD(editingJD.description);
      setStep(editingJD.creation_stage);

      // Restore the creation mode based on saved creation_method
      if (editingJD.creation_method) {
        setMode(editingJD.creation_method === 'ai_generated' ? 'ai' : 'manual');
      }

      // Load extracted data if we're past the create step
      if (editingJD.creation_stage !== 'create') {
        setExtractedData(prev => ({
          ...prev,
          mustHaveSkills: editingJD.must_have_skills || [],
          niceToHaveSkills: editingJD.nice_to_have_skills || [],
          education: editingJD.education_requirements?.degree || '',
          experience: editingJD.experience_min
            ? `${editingJD.experience_min}${editingJD.experience_max ? `-${editingJD.experience_max}` : '+'}`
            : '',
          industryType: editingJD.industry_type || '',
          department: editingJD.department || '',
          salaryFrom: editingJD.salary_min?.toString() || '',
          salaryTo: editingJD.salary_max?.toString() || '',
          compensationType: (editingJD.compensation_type as 'hourly' | 'daily' | 'monthly' | 'yearly') || 'yearly',
          assessmentGuidance: editingJD.assessment_guidance || '',
          internalRecruiterComments: editingJD.internal_comments ? editingJD.internal_comments.split('\n').filter(c => c.trim()) : [],
          mustHaveComments: editingJD.must_have_comments || [],
          certifications: editingJD.certifications || [],
          domainKeywords: editingJD.domain_keywords || [],
          allowOverqualified: editingJD.allow_overqualified ?? false,
          employmentType: (editingJD.employment_type as ExtractedData['employmentType']) || 'full_time',
          workModel: (editingJD.remote_type as ExtractedData['workModel']) || 'onsite',
          locations: editingJD.locations?.map(loc => ({
            // Reconstruct "City, State" format for UI dropdown matching
            city: loc.state ? `${loc.city}, ${loc.state}` : loc.city,
            radius: loc.radius_km?.toString() || '50',
          })) || [],
          locationsRequired: editingJD.locations?.some(loc => loc.is_required) || false,
        }));
      }
    }
  }, [editingJD]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-full flex flex-col">
        {/* Fixed Header with Step Indicator */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-8 pt-6 shadow-sm">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-gray-900 mb-2">
                  {isEditingPublished ? 'Create New Version' : isEditingDraft ? 'Edit Draft' : 'Job Description Creation'}
                </h1>
                <p className="text-sm text-gray-600">
                  {isEditingPublished
                    ? 'Editing a published JD creates a new draft. The original remains unchanged.'
                    : isEditingDraft
                    ? 'Continue editing your draft job description'
                    : 'Create professional job descriptions with AI-powered extraction'}
                </p>
              </div>
              {onBack && (
                <button
                  onClick={handleBackClick}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Jobs
                </button>
              )}
            </div>
          </div>
          {renderStepIndicator()}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">

        {/* Step 1: Create JD */}
        {step === 'create' && (
          <>
            {/* Mode Selection */}
            <div className="flex gap-4 mb-6">
              <button
                onClick={() => setMode('ai')}
                className={`flex-1 p-6 rounded-lg border-2 transition-all ${
                  mode === 'ai'
                    ? 'border-gray-400 bg-gray-200 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Wand2 className={`w-6 h-6 ${mode === 'ai' ? 'text-gray-700' : 'text-gray-400'}`} />
                  <h3 className={`font-medium ${mode === 'ai' ? 'text-gray-900' : 'text-gray-900'}`}>
                    AI-Generated JD
                  </h3>
                </div>
                <p className={`text-sm text-left ${mode === 'ai' ? 'text-gray-600' : 'text-gray-600'}`}>
                  Let AI create a professional job description based on your inputs
                </p>
              </button>

              <button
                onClick={() => setMode('manual')}
                className={`flex-1 p-6 rounded-lg border-2 transition-all ${
                  mode === 'manual'
                    ? 'border-gray-400 bg-gray-200 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Edit2 className={`w-6 h-6 ${mode === 'manual' ? 'text-gray-700' : 'text-gray-400'}`} />
                  <h3 className={`font-medium ${mode === 'manual' ? 'text-gray-900' : 'text-gray-900'}`}>
                    Manual Input
                  </h3>
                </div>
                <p className={`text-sm text-left ${mode === 'manual' ? 'text-gray-600' : 'text-gray-600'}`}>
                  Write or paste your own job description
                </p>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Input Form - AI Mode */}
              {mode === 'ai' && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-gray-900">Job Details</h2>
                    {/* JD06: Autosave status indicator for AI mode */}
                    <div className="flex items-center gap-2 text-sm">
                      {autosaveStatus === 'saving' && (
                        <span className="flex items-center gap-1.5 text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </span>
                      )}
                      {autosaveStatus === 'saved' && (
                        <span className="flex items-center gap-1.5 text-green-600">
                          <Cloud className="w-4 h-4" />
                          Draft saved
                        </span>
                      )}
                      {autosaveStatus === 'error' && (
                        <span className="flex items-center gap-1.5 text-red-500">
                          <CloudOff className="w-4 h-4" />
                          Save failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Job Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        maxLength={VALIDATION.JOB_TITLE.max}
                        placeholder="e.g., Senior Java Developer – Banking Domain"
                        className={`w-full px-4 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent ${
                          jobTitle.length > 0 && !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length < VALIDATION.JOB_TITLE.min && jobTitle.length > 0 && `Min ${VALIDATION.JOB_TITLE.min} characters required`}
                        </p>
                        <p className={`text-xs ${getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length}/{VALIDATION.JOB_TITLE.max}
                        </p>
                      </div>
                      {/* JD07: Helper text for minimal prompt */}
                      <p className="text-xs text-gray-500 mt-1">
                        Enter a job title or a minimal prompt – AI will generate the full JD
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        AI Prompt – Quick Job Details <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        maxLength={VALIDATION.AI_PROMPT.max}
                        placeholder="Describe what you're looking for in this role... e.g., 'We need a senior full-stack developer with React and Node.js experience, 5+ years, remote position, who can lead a team of 3 developers'"
                        rows={12}
                        className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent ${
                          aiPrompt.length > 0 && aiPrompt.length > VALIDATION.AI_PROMPT.max
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className="text-xs text-gray-500">
                          {aiPrompt.length > 0 && aiPrompt.length < VALIDATION.AI_PROMPT.min && `Tip: Add more details (${VALIDATION.AI_PROMPT.min - aiPrompt.length} more chars) for better results`}
                        </p>
                        <p className={`text-xs ${aiPrompt.length > VALIDATION.AI_PROMPT.max ? 'text-red-500' : 'text-gray-500'}`}>
                          {aiPrompt.length}/{VALIDATION.AI_PROMPT.max}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
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
                      disabled={
                        !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max) ||
                        aiPrompt.length > VALIDATION.AI_PROMPT.max ||
                        isGenerating ||
                        !hasQuota ||
                        isCheckingQuota
                      }
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gray-800 to-gray-800 text-white px-6 py-3 rounded-md hover:from-gray-700 hover:to-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Wand2 className="w-5 h-5" />
                      {isCheckingQuota ? (
                        <span className="animate-pulse">Checking quota...</span>
                      ) : isGenerating ? (
                        <span className="animate-pulse">Generating with AI...</span>
                      ) : !hasQuota ? (
                        'Quota Exceeded - Upgrade Plan'
                      ) : generatedJD ? (
                        'Regenerate Job Description'
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
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-gray-900">Job Details</h2>
                    {/* JD06: Autosave status indicator */}
                    <div className="flex items-center gap-2 text-sm">
                      {autosaveStatus === 'saving' && (
                        <span className="flex items-center gap-1.5 text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </span>
                      )}
                      {autosaveStatus === 'saved' && (
                        <span className="flex items-center gap-1.5 text-green-600">
                          <Cloud className="w-4 h-4" />
                          Draft saved
                        </span>
                      )}
                      {autosaveStatus === 'error' && (
                        <span className="flex items-center gap-1.5 text-red-500">
                          <CloudOff className="w-4 h-4" />
                          Save failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Job Title <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        maxLength={VALIDATION.JOB_TITLE.max}
                        placeholder="e.g., Senior Java Developer"
                        className={`w-full px-4 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent ${
                          jobTitle.length > 0 && !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length < VALIDATION.JOB_TITLE.min && jobTitle.length > 0 && `Min ${VALIDATION.JOB_TITLE.min} characters required`}
                        </p>
                        <p className={`text-xs ${getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length}/{VALIDATION.JOB_TITLE.max}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        Job Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={manualJD}
                        onChange={(e) => setManualJD(e.target.value)}
                        maxLength={VALIDATION.MANUAL_JD.max}
                        placeholder="Paste or write your job description here..."
                        rows={20}
                        className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent ${
                          manualJD.length > 0 && !isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max)
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${getCharCountColor(manualJD.length, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max)}`}>
                          {manualJD.length < VALIDATION.MANUAL_JD.min && manualJD.length > 0 && `Min ${VALIDATION.MANUAL_JD.min} characters required`}
                        </p>
                        <p className={`text-xs ${getCharCountColor(manualJD.length, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max)}`}>
                          {manualJD.length}/{VALIDATION.MANUAL_JD.max}
                        </p>
                      </div>
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
                              ? 'bg-gray-800 text-white hover:bg-gray-900'
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
                          className="w-full h-[600px] px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent font-mono text-sm"
                        />
                      ) : (
                        <div className="h-[600px] overflow-y-auto px-6 py-4 border border-gray-300 rounded-md bg-white markdown-content">
                          <ReactMarkdown>{generatedJD
                            .replace(/#+\s*Certifications[\s\S]*?(?=\n#|\n\n#|$)/gi, (match) =>
                              match.toLowerCase().includes('none') || match.toLowerCase().includes('not required') || match.toLowerCase().includes('n/a') || match.trim().match(/^#+\s*Certifications\s*$/im) ? '' : match
                            )
                            .replace(/\*\*Certifications\*\*[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
                            .replace(/Certifications[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
                          }</ReactMarkdown>
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
                disabled={
                  isExtracting ||
                  !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max) ||
                  (mode === 'ai' ? !generatedJD : !isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max))
                }
                className="flex items-center gap-2 bg-gray-800 text-white px-8 py-3 rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                      <Info className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-gray-800">💡 Pro Tips: Managing Skills</h3>
                      <button
                        onClick={() => setShowDragTips(false)}
                        className="text-gray-800 hover:text-gray-900 text-sm flex items-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        Dismiss
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm text-gray-700">
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 mt-0.5 text-gray-800 flex-shrink-0" />
                        <div>
                          <strong>Drag & Drop:</strong> Hover over a skill and grab the grip icon to drag it between Must-Have and Nice-to-Have
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Edit2 className="w-4 h-4 mt-0.5 text-gray-800 flex-shrink-0" />
                        <div>
                          <strong>Click to Edit:</strong> Click on any skill or comment text to edit it inline. Press Enter to save, Escape to cancel
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-gray-800 mt-0.5 flex-shrink-0">← →</span>
                        <div>
                          <strong>Arrow Buttons:</strong> Use arrow buttons to quickly move skills between categories
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Regeneration Notice */}
            {extractedDataModified && mode === 'ai' && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                      <Wand2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="text-blue-800 font-medium">Skills Modified</h4>
                      <p className="text-sm text-blue-600">
                        You&apos;ve made changes. Regenerate the JD to update the description with your modifications.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRegenerateFromExtractedData}
                    disabled={isRegenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 className="w-4 h-4" />
                    {isRegenerating ? 'Regenerating...' : 'Regenerate JD'}
                  </button>
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
                      className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1"
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddSkill('mustHaveSkills')}
                        className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
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
                      className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1"
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddSkill('niceToHaveSkills')}
                        className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
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
                    <div className="flex items-center gap-2">
                      <h3 className="text-gray-900">Must-Have Comments</h3>
                    </div>
                    <button
                      onClick={() => setEditingCategory('comments')}
                      className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1"
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={handleAddComment}
                        className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
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
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-gray-600"
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
                              className="text-sm text-gray-900 flex-1 cursor-pointer hover:text-gray-800" 
                              onClick={() => handleStartEditComment(index, comment)}
                              title="Click to edit"
                            >
                              {comment}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleStartEditComment(index, comment)}
                                className="text-gray-400 hover:text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
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

              {/* Experience, Education, Salary - 3 Column Layout */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                {/* Experience */}
                <div>
                  <h3 className="text-gray-900 mb-4">Experience <span className="text-red-500">*</span></h3>
                  <select
                    value={extractedData.experience}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, experience: e.target.value }))}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm mb-3 ${!extractedData.experience ? 'border-gray-300' : 'border-gray-300'}`}
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
                      className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-600"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>

                {/* Education */}
                <div>
                  <h3 className="text-gray-900 mb-4">Education <span className="text-red-500">*</span></h3>
                  <select
                    value={extractedData.education}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, education: e.target.value }))}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm mb-3 ${!extractedData.education ? 'border-gray-300' : 'border-gray-300'}`}
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
                      className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-600"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>

                {/* Industry Type */}
                <div>
                  <h3 className="text-gray-900 mb-4">Industry Type <span className="text-red-500">*</span></h3>
                  <select
                    value={extractedData.industryType}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, industryType: e.target.value }))}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm mb-3 ${!extractedData.industryType ? 'border-gray-300' : 'border-gray-300'}`}
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
                      className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-600"
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>
              </div>

              {/* JD09: Certifications and Domain Keywords - 2 Column Layout */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                {/* Certifications */}
                <div>
                  <h3 className="text-gray-900 mb-4">Certifications</h3>
                  <div className="space-y-2 mb-3">
                    {extractedData.certifications.map((cert, index) => (
                      <div key={index} className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-lg group">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="text-sm text-gray-700">{cert}</span>
                        </div>
                        <button
                          onClick={() => setExtractedData(prev => ({
                            ...prev,
                            certifications: prev.certifications.filter((_, i) => i !== index)
                          }))}
                          className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add certification..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          setExtractedData(prev => ({
                            ...prev,
                            certifications: [...prev.certifications, (e.target as HTMLInputElement).value.trim()]
                          }));
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                    <button
                      onClick={(e) => {
                        const input = (e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement;
                        if (input?.value.trim()) {
                          setExtractedData(prev => ({
                            ...prev,
                            certifications: [...prev.certifications, input.value.trim()]
                          }));
                          input.value = '';
                        }
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {extractedData.certifications.length === 0 && (
                    <p className="text-xs text-gray-500 mt-2">No certifications extracted. Add manually if needed.</p>
                  )}
                </div>

                {/* Domain Keywords */}
                <div>
                  <h3 className="text-gray-900 mb-4">Domain Keywords</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {extractedData.domainKeywords.map((keyword, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm group"
                      >
                        {keyword}
                        <button
                          onClick={() => setExtractedData(prev => ({
                            ...prev,
                            domainKeywords: prev.domainKeywords.filter((_, i) => i !== index)
                          }))}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add domain keyword..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          setExtractedData(prev => ({
                            ...prev,
                            domainKeywords: [...prev.domainKeywords, (e.target as HTMLInputElement).value.trim()]
                          }));
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                    <button
                      onClick={(e) => {
                        const input = (e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement;
                        if (input?.value.trim()) {
                          setExtractedData(prev => ({
                            ...prev,
                            domainKeywords: [...prev.domainKeywords, input.value.trim()]
                          }));
                          input.value = '';
                        }
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {extractedData.domainKeywords.length === 0 && (
                    <p className="text-xs text-gray-500 mt-2">No domain keywords extracted. Add manually if needed.</p>
                  )}
                </div>
              </div>

              {/* Salary */}
              <div className="mb-8">
                <h3 className="text-gray-900 mb-3">Salary Range</h3>
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                      <input
                        type="text"
                        value={extractedData.salaryFrom || ''}
                        onChange={(e) => setExtractedData(prev => ({ ...prev, salaryFrom: e.target.value }))}
                        placeholder="From"
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                      />
                    </div>
                    <span className="text-gray-400">–</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                      <input
                        type="text"
                        value={extractedData.salaryTo || ''}
                        onChange={(e) => setExtractedData(prev => ({ ...prev, salaryTo: e.target.value }))}
                        placeholder="To"
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                      />
                    </div>
                    <select
                      value={extractedData.compensationType}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, compensationType: e.target.value as 'hourly' | 'daily' | 'monthly' | 'yearly' }))}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Locations Section */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-gray-900">Locations</h3>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={extractedData.locationsRequired}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, locationsRequired: e.target.checked }))}
                      className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500"
                    />
                    <span className="text-gray-500 text-xs">(Required)</span>
                  </label>
                </div>

                {/* Inline Add Location - State, City, Radius in one line */}
                <div className="flex items-end gap-3 mb-4">
                  {/* State Filter Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-700 mb-1">State</label>
                    <select
                      value={locationStateFilter}
                      onChange={(e) => {
                        setLocationStateFilter(e.target.value);
                        setNewLocation(prev => ({ ...prev, city: '' }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
                    >
                      <option value="all">All States</option>
                      <option value="Andhra Pradesh">Andhra Pradesh</option>
                      <option value="Delhi NCR">Delhi NCR</option>
                      <option value="Gujarat">Gujarat</option>
                      <option value="Haryana">Haryana</option>
                      <option value="Karnataka">Karnataka</option>
                      <option value="Kerala">Kerala</option>
                      <option value="Madhya Pradesh">Madhya Pradesh</option>
                      <option value="Maharashtra">Maharashtra</option>
                      <option value="Odisha">Odisha</option>
                      <option value="Rajasthan">Rajasthan</option>
                      <option value="Tamil Nadu">Tamil Nadu</option>
                      <option value="Telangana">Telangana</option>
                      <option value="Uttar Pradesh">Uttar Pradesh</option>
                      <option value="West Bengal">West Bengal</option>
                      <option value="Remote">Remote/Hybrid</option>
                    </select>
                  </div>

                  {/* City Dropdown */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-700 mb-1">City</label>
                    <select
                      value={newLocation.city}
                      onChange={(e) => setNewLocation(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
                    >
                      <option value="">Select a city</option>
                      {(locationStateFilter === 'all' || locationStateFilter === 'Maharashtra') && (
                        <optgroup label="Maharashtra">
                          <option value="Mumbai, Maharashtra">Mumbai</option>
                          <option value="Pune, Maharashtra">Pune</option>
                          <option value="Navi Mumbai, Maharashtra">Navi Mumbai</option>
                          <option value="Thane, Maharashtra">Thane</option>
                          <option value="Nagpur, Maharashtra">Nagpur</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Karnataka') && (
                        <optgroup label="Karnataka">
                          <option value="Bangalore, Karnataka">Bangalore</option>
                          <option value="Mysore, Karnataka">Mysore</option>
                          <option value="Mangalore, Karnataka">Mangalore</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Tamil Nadu') && (
                        <optgroup label="Tamil Nadu">
                          <option value="Chennai, Tamil Nadu">Chennai</option>
                          <option value="Coimbatore, Tamil Nadu">Coimbatore</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Delhi NCR') && (
                        <optgroup label="Delhi NCR">
                          <option value="Delhi NCR">Delhi NCR</option>
                          <option value="Gurgaon, Haryana">Gurgaon</option>
                          <option value="Noida, Uttar Pradesh">Noida</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Telangana') && (
                        <optgroup label="Telangana">
                          <option value="Hyderabad, Telangana">Hyderabad</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'West Bengal') && (
                        <optgroup label="West Bengal">
                          <option value="Kolkata, West Bengal">Kolkata</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Gujarat') && (
                        <optgroup label="Gujarat">
                          <option value="Ahmedabad, Gujarat">Ahmedabad</option>
                          <option value="Surat, Gujarat">Surat</option>
                          <option value="Vadodara, Gujarat">Vadodara</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Haryana') && locationStateFilter !== 'Delhi NCR' && (
                        <optgroup label="Haryana">
                          <option value="Gurgaon, Haryana">Gurgaon</option>
                          <option value="Chandigarh">Chandigarh</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Uttar Pradesh') && locationStateFilter !== 'Delhi NCR' && (
                        <optgroup label="Uttar Pradesh">
                          <option value="Noida, Uttar Pradesh">Noida</option>
                          <option value="Lucknow, Uttar Pradesh">Lucknow</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Rajasthan') && (
                        <optgroup label="Rajasthan">
                          <option value="Jaipur, Rajasthan">Jaipur</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Kerala') && (
                        <optgroup label="Kerala">
                          <option value="Kochi, Kerala">Kochi</option>
                          <option value="Thiruvananthapuram, Kerala">Thiruvananthapuram</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Madhya Pradesh') && (
                        <optgroup label="Madhya Pradesh">
                          <option value="Indore, Madhya Pradesh">Indore</option>
                          <option value="Bhopal, Madhya Pradesh">Bhopal</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Andhra Pradesh') && (
                        <optgroup label="Andhra Pradesh">
                          <option value="Visakhapatnam, Andhra Pradesh">Visakhapatnam</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Odisha') && (
                        <optgroup label="Odisha">
                          <option value="Bhubaneswar, Odisha">Bhubaneswar</option>
                        </optgroup>
                      )}
                      {(locationStateFilter === 'all' || locationStateFilter === 'Remote') && (
                        <optgroup label="Remote/Hybrid">
                          <option value="Remote - India">Remote - India</option>
                          <option value="Remote - Anywhere">Remote - Anywhere</option>
                          <option value="Hybrid - Flexible">Hybrid - Flexible</option>
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Radius Dropdown */}
                  <div className="w-28">
                    <label className="block text-sm text-gray-700 mb-1">Radius</label>
                    <select
                      value={newLocation.radius}
                      onChange={(e) => setNewLocation(prev => ({ ...prev, radius: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm"
                    >
                      <option value="10">10 km</option>
                      <option value="25">25 km</option>
                      <option value="50">50 km</option>
                      <option value="75">75 km</option>
                      <option value="100">100 km</option>
                      <option value="150">150 km</option>
                      <option value="200">200 km</option>
                    </select>
                  </div>

                  {/* Add Button */}
                  <button
                    onClick={handleAddLocation}
                    className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm whitespace-nowrap flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>

                {/* Added Locations Grid */}
                <div className="grid grid-cols-3 gap-4">
                  {extractedData.locations.map((location, index) => (
                    <div key={index} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">{location.city}</div>
                          <div className="text-xs text-gray-600">{location.radius} km radius</div>
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

              {/* Employment Type & Work Model - Side by Side */}
              <div className="mt-6 grid grid-cols-2 gap-6">
                {/* Employment Type */}
                <div>
                  <h3 className="text-gray-900 mb-2">Employment Type</h3>
                  <select
                    value={extractedData.employmentType}
                    onChange={(e) => setExtractedData(prev => ({
                      ...prev,
                      employmentType: e.target.value as ExtractedData['employmentType']
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm bg-white"
                  >
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                    <option value="temporary">Temporary / Seasonal</option>
                  </select>
                </div>

                {/* Work Model */}
                <div>
                  <h3 className="text-gray-900 mb-2">Work Mode</h3>
                  <select
                    value={extractedData.workModel}
                    onChange={(e) => setExtractedData(prev => ({
                      ...prev,
                      workModel: e.target.value as ExtractedData['workModel']
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm bg-white"
                  >
                    <option value="onsite">Onsite</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="field_based">Field-based / Travel</option>
                  </select>
                </div>
              </div>

              {/* Allow Overqualified Candidates */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
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
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-800"></div>
                  </label>
                </div>
              </div>

              {/* Assessment Guidance & Internal Recruiter Notes - Side by Side */}
              <div className="mt-6 grid grid-cols-2 gap-6">
                {/* Assessment Guidance - Left */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-gray-900">Assessment Guidance</h3>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Optional</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3 flex items-center gap-1">
                    <span className="text-blue-500">ℹ️</span> Visible to assessment team
                  </p>
                  <textarea
                    value={extractedData.assessmentGuidance}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, assessmentGuidance: e.target.value.slice(0, 500) }))}
                    placeholder="e.g., Focus on system design, coding best practices, problem-solving approach..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm resize-none"
                    rows={4}
                  />
                  <div className="text-right text-xs text-gray-500 mt-1">{extractedData.assessmentGuidance?.length || 0}/500</div>
                </div>

                {/* Internal Recruiter Notes - Right */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-gray-900">Internal Recruiter Notes</h3>
                    <span className="text-xs text-gray-500 bg-yellow-100 px-2 py-0.5 rounded flex items-center gap-1">
                      🔒 Private
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Private notes for team use only. Not visible to candidates or used in scoring/assessments.
                  </p>
                  <textarea
                    value={extractedData.internalRecruiterComments.join('\n')}
                    onChange={(e) => setExtractedData(prev => ({
                      ...prev,
                      internalRecruiterComments: e.target.value.split('\n').filter(c => c.trim())
                    }))}
                    placeholder="Add internal notes for recruiters..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm resize-none"
                    rows={4}
                  />
                </div>
              </div>

            <div className="flex justify-between items-center mt-8">
              <button
                onClick={() => setStep('create')}
                className="px-8 py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handlePublish}
                disabled={isRegenerating}
                className="flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegenerating ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Formatting with AI...
                  </>
                ) : (
                  <>
                    Review & Publish
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Publish */}
        {step === 'review' && !isPublished && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-800 rounded-lg p-6 text-white">
              <h2 className="text-2xl mb-2">Review & Publish</h2>
              <p className="text-gray-100">
                Review all details before publishing. Once published, this JD will be locked and available to all authorized users.
              </p>
            </div>

            {/* Final JD Document View */}
            <div className="bg-white rounded-lg border-2 border-gray-200 shadow-lg">
              <div className="bg-gradient-to-r from-gray-50 to-gray-50 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg text-gray-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-gray-800" />
                      Final Job Description
                      {/* JD12: AI-Generated indicator */}
                      {mode === 'ai' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                          <Wand2 className="w-3 h-3" />
                          AI Generated
                        </span>
                      )}
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
              <div className="p-8 bg-white">
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
                </div>
              </div>
            </div>

            {/* Extracted Data Summary Preview - Collapsible */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              {/* Section Header with Toggle */}
              <button
                onClick={() => setShowExtractedSummary(!showExtractedSummary)}
                className="w-full bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
              >
                <div className="text-left">
                  <h3 className="text-lg text-gray-900 flex items-center gap-2">
                    📊 Extracted Data Summary
                    <Eye className="w-5 h-5 text-gray-500" />
                    {/* JD12: AI-Generated indicator for extracted parameters */}
                    {mode === 'ai' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                        <Wand2 className="w-3 h-3" />
                        AI Extracted
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">Click to {showExtractedSummary ? 'hide' : 'view'} structured requirements</p>
                </div>
                <div className={`transform transition-transform ${showExtractedSummary ? 'rotate-180' : ''}`}>
                  <ChevronRight className="w-5 h-5 text-gray-500 rotate-90" />
                </div>
              </button>

              {/* Collapsible Content */}
              {showExtractedSummary && (
                <>
              {/* Job Title */}
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-sm text-gray-500 mb-2">Job Title</h3>
                <p className="text-xl text-gray-900">{jobTitle}</p>
              </div>

              {/* Skills Section */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-900">Skills & Requirements</h3>
                  <button
                    onClick={() => setStep('extract')}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
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
                          <CheckCircle className="w-4 h-4 text-gray-800 flex-shrink-0" />
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Must-Have Comments */}
                  {extractedData.mustHaveComments.length > 0 && (
                    <div>
                      <h4 className="text-sm text-gray-700 mb-3">Must-Have Comments ({extractedData.mustHaveComments.length})</h4>
                      <div className="space-y-2">
                        {extractedData.mustHaveComments.map((comment, index) => (
                          <div key={index} className="flex items-start gap-2 text-sm text-gray-700">
                            <CheckCircle2 className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                            <span>{comment}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Requirements Grid */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-900">Requirements</h3>
                  <button
                    onClick={() => setStep('extract')}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
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

              {/* JD12: Certifications */}
              {extractedData.certifications.length > 0 && (
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Certifications ({extractedData.certifications.length})</h3>
                    <button
                      onClick={() => setStep('extract')}
                      className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {extractedData.certifications.map((cert, index) => (
                      <div key={index} className="bg-purple-50 text-purple-800 px-3 py-2 rounded-lg text-sm border border-purple-200">
                        {cert}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* JD12: Domain Keywords */}
              {extractedData.domainKeywords.length > 0 && (
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Domain Keywords ({extractedData.domainKeywords.length})</h3>
                    <button
                      onClick={() => setStep('extract')}
                      className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {extractedData.domainKeywords.map((keyword, index) => (
                      <div key={index} className="bg-blue-50 text-blue-800 px-3 py-2 rounded-lg text-sm border border-blue-200">
                        {keyword}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compensation */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-900">Compensation</h3>
                  <button
                    onClick={() => setStep('extract')}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
                <div className="bg-green-50 p-4 rounded-lg inline-flex items-center gap-2">
                  <span className="text-gray-900">
                    ₹{extractedData.salaryFrom ? parseInt(extractedData.salaryFrom).toLocaleString('en-IN') : '0'} -
                    ₹{extractedData.salaryTo ? parseInt(extractedData.salaryTo).toLocaleString('en-IN') : '0'}
                  </span>
                  <span className="text-gray-600 text-sm">/ {extractedData.compensationType}</span>
                </div>
              </div>

              {/* Employment Type & Work Model */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-gray-900">Job Type</h3>
                  <button
                    onClick={() => setStep('extract')}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm text-gray-600 mb-2">Employment Type</h4>
                    <p className="text-gray-900">
                      {extractedData.employmentType === 'full_time' ? 'Full Time' :
                       extractedData.employmentType === 'part_time' ? 'Part Time' :
                       extractedData.employmentType === 'contract' ? 'Contract' :
                       extractedData.employmentType === 'internship' ? 'Internship' :
                       extractedData.employmentType === 'temporary' ? 'Temporary / Seasonal' : 'Not specified'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm text-gray-600 mb-2">Work Mode</h4>
                    <p className="text-gray-900">
                      {extractedData.workModel === 'onsite' ? 'Onsite' :
                       extractedData.workModel === 'remote' ? 'Remote' :
                       extractedData.workModel === 'hybrid' ? 'Hybrid' :
                       extractedData.workModel === 'field_based' ? 'Field-based / Travel' : 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Locations - Hidden for now */}
              {false && extractedData.locations.length > 0 && (
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-gray-900 mb-4">
                    Locations ({extractedData.locations.length})
                    {extractedData.locationsRequired && (
                      <span className="text-xs text-gray-500 ml-2">✓ Required</span>
                    )}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {extractedData.locations.map((loc, index) => (
                      <div key={index} className="bg-gray-50 text-gray-800 px-3 py-2 rounded-lg text-sm">
                        {loc.city} <span className="text-gray-800">(+{loc.radius}km)</span>
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
                    <span className="text-xs text-gray-800 bg-gray-50 px-2 py-1 rounded">
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
                </>
              )}
            </div>

            {/* JD12: Validation Warning Banner */}
            {!validationStatus.isValid && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-amber-800 font-medium">Cannot Publish - Missing Required Fields</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Please complete the following before publishing:
                    </p>
                    <ul className="text-sm text-amber-700 mt-2 list-disc list-inside">
                      {validationStatus.missingFields.map((field, index) => (
                        <li key={index}>{field}</li>
                      ))}
                    </ul>
                    <button
                      onClick={() => setStep('extract')}
                      className="mt-3 text-sm text-amber-800 underline hover:text-amber-900"
                    >
                      Go back to edit →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 justify-between">
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('extract')}
                  className="px-6 py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  ← Back to Edit
                </button>
                {/* JD12: Cancel button to return to JD List */}
                <button
                  onClick={() => router.push('/recruitment/jobs')}
                  className="px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="flex gap-3">
                {/* JD12: Save as Draft button */}
                <button
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft}
                  className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {isSavingDraft ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4" />
                      Save as Draft
                    </>
                  )}
                </button>
                <button
                  onClick={handleConfirmPublish}
                  disabled={isPublishing || !validationStatus.isValid}
                  className={`flex items-center gap-2 px-8 py-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    validationStatus.isValid
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-300 text-gray-500'
                  }`}
                  title={!validationStatus.isValid ? 'Complete all required fields to publish' : ''}
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
                  setPublishedJdId(null);
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
                    department: '',
                    allowOverqualified: false,
                    employmentType: 'full_time',
                    workModel: 'onsite',
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
              {publishedJdId && (
                <button
                  onClick={() => router.push(`/recruitment/job-details?id=${publishedJdId}`)}
                  className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  View JD
                </button>
              )}
              <button
                onClick={onBack}
                className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
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