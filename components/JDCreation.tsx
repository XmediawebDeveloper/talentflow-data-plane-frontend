'use client';

import { Wand2, FileText, Copy, Download, Save, ChevronRight, Plus, X, Edit2, CheckCircle, CheckCircle2, ArrowLeft, GripVertical, Info, Eye, Pencil, AlertTriangle, AlertCircle, Cloud, CloudOff, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDrag, useDrop } from 'react-dnd';
import { Job } from '@/lib/types/types';
import { toast } from '@/components/ui/enhanced-toast';
import { jdService, masterDataService, ExperienceLevel, EducationLevel, IndustryType } from '@/lib/services';
import { useQuotaCheck } from '@/lib/hooks/useQuotaCheck';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type CreationMode = 'ai' | 'manual';
type Step = 'create' | 'extract' | 'review';

// Validation constants
const VALIDATION = {
  JOB_TITLE: { min: 2, max: 100 },
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
  niceToHaveComments: string[];
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
  // Coding assessment fields
  codingRequired: boolean;
  suggestedLanguages: string[];
}

interface EditingJDData {
  id: string;
  title: string;
  description: string;
  status?: 'draft' | 'published' | 'archived';
  creation_stage: 'create' | 'extract' | 'review';
  creation_method?: 'manual' | 'ai_generated';
  ai_prompt?: string;  // Original AI prompt used to generate JD
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
  nice_to_have_comments?: string[];
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
  isJDInUse?: boolean;  // Whether JD is used in scoring/assessment/AI match
  jdUsageMessage?: string;  // Message explaining why JD can't be edited
  // FIX-003: Props for embedded mode in sheet/modal
  editingJDId?: string | null;  // JD ID to fetch and edit
  onClose?: () => void;  // Callback when closed
  onSuccess?: () => void;  // Callback on successful create/update
  isEmbedded?: boolean;  // Flag to indicate embedded mode
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
  readOnly?: boolean;
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
  onCancelEdit,
  readOnly = false
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
            {!readOnly && (
              <div
                ref={drag}
                className="cursor-move opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
                title="Drag to move"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            <CheckCircle className={`w-4 h-4 ${tickColor} flex-shrink-0`} />
            <span
              className={`text-sm text-gray-700 flex-1 ${readOnly ? '' : 'cursor-pointer hover:text-gray-900'}`}
              onClick={() => !readOnly && onStartEdit(category, index, skill)}
              title={readOnly ? '' : 'Click to edit'}
            >
              {skill}
            </span>
          </div>
          {!readOnly && (
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
          )}
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

// Comment Drag & Drop Components
interface DraggableCommentProps {
  comment: string;
  index: number;
  category: 'mustHaveComments' | 'niceToHaveComments';
  onMove: (comment: string, from: 'mustHaveComments' | 'niceToHaveComments', to: 'mustHaveComments' | 'niceToHaveComments') => void;
  onRemove: (category: 'mustHaveComments' | 'niceToHaveComments', index: number) => void;
  onStartEdit: (category: 'mustHaveComments' | 'niceToHaveComments', index: number, value: string) => void;
  isEditing: boolean;
  editingValue: string;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  readOnly?: boolean;
}

const DraggableComment = ({
  comment,
  index,
  category,
  onMove,
  onRemove,
  onStartEdit,
  isEditing,
  editingValue,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  readOnly = false
}: DraggableCommentProps) => {
  const [{ isDragging }, drag, dragPreview] = useDrag(() => ({
    type: 'COMMENT',
    item: { comment, category, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const isMustHave = category === 'mustHaveComments';
  const bgColor = isMustHave ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200';
  const iconColor = isMustHave ? 'text-orange-500' : 'text-blue-500';

  return (
    <div
      ref={dragPreview}
      className={`flex items-center justify-between p-2.5 ${bgColor} border rounded-lg group transition-opacity ${
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
            {!readOnly && (
              <div
                ref={drag}
                className="cursor-move opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
                title="Drag to move"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            <CheckCircle2 className={`w-4 h-4 ${iconColor} flex-shrink-0`} />
            <span
              className={`text-sm text-gray-900 flex-1 ${readOnly ? '' : 'cursor-pointer hover:text-gray-800'}`}
              onClick={() => !readOnly && onStartEdit(category, index, comment)}
              title={readOnly ? '' : 'Click to edit'}
            >
              {comment}
            </span>
          </div>
          {!readOnly && (
            <div className="flex gap-1">
              <button
                onClick={() => onStartEdit(category, index, comment)}
                className="text-gray-400 hover:text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onMove(comment, category, isMustHave ? 'niceToHaveComments' : 'mustHaveComments')}
                className="text-xs text-gray-800 hover:text-gray-900 px-2"
                title={isMustHave ? 'Move to Nice-to-Have' : 'Convert to Must-Have'}
              >
                {isMustHave ? '→' : '←'}
              </button>
              <button
                onClick={() => onRemove(category, index)}
                className={isMustHave ? 'text-red-600 hover:text-red-700' : 'text-blue-600 hover:text-blue-700'}
                title="Delete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface DroppableCommentsContainerProps {
  category: 'mustHaveComments' | 'niceToHaveComments';
  onDrop: (comment: string, fromCategory: 'mustHaveComments' | 'niceToHaveComments') => void;
  children: React.ReactNode;
}

const DroppableCommentsContainer = ({ category, onDrop, children }: DroppableCommentsContainerProps) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'COMMENT',
    drop: (item: { comment: string; category: 'mustHaveComments' | 'niceToHaveComments' }) => {
      if (item.category !== category) {
        onDrop(item.comment, item.category);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  const isMustHave = category === 'mustHaveComments';
  const isActive = isOver && canDrop;

  return (
    <div
      ref={drop}
      className={`space-y-2 min-h-[100px] p-3 rounded-lg border-2 border-dashed transition-all ${
        isActive
          ? isMustHave
            ? 'border-orange-400 bg-orange-50'
            : 'border-blue-400 bg-blue-50'
          : 'border-transparent'
      }`}
    >
      {children}
    </div>
  );
};

// Fallback master data in case API fails or returns empty
const FALLBACK_EXPERIENCE_LEVELS: ExperienceLevel[] = [
  { id: 1, code: 'entry', label: 'Entry Level (0-2 Years)', min_years: 0, max_years: 2, sort_order: 1, is_active: true },
  { id: 2, code: 'junior', label: 'Junior Level (2-4 Years)', min_years: 2, max_years: 4, sort_order: 2, is_active: true },
  { id: 3, code: 'mid', label: 'Mid Level (5-7 Years)', min_years: 5, max_years: 7, sort_order: 3, is_active: true },
  { id: 4, code: 'senior', label: 'Senior Level (7-10 Years)', min_years: 7, max_years: 10, sort_order: 4, is_active: true },
  { id: 5, code: 'architect', label: 'Architect Level (10+ Years)', min_years: 10, max_years: null, sort_order: 5, is_active: true },
  { id: 6, code: 'management', label: 'Management Level (10+ Years)', min_years: 10, max_years: null, sort_order: 6, is_active: true },
];

const FALLBACK_EDUCATION_LEVELS: EducationLevel[] = [
  { id: 1, code: 'diploma', label: 'Diploma', level: 1, sort_order: 1, is_active: true },
  { id: 2, code: 'associate', label: 'Associate Degree', level: 2, sort_order: 2, is_active: true },
  { id: 3, code: 'bachelors', label: "Bachelor's Degree", level: 3, sort_order: 3, is_active: true },
  { id: 4, code: 'masters', label: "Master's Degree", level: 4, sort_order: 4, is_active: true },
  { id: 5, code: 'doctorate', label: 'Doctorate / PhD', level: 5, sort_order: 5, is_active: true },
  { id: 6, code: 'none', label: 'No Formal Education', level: 0, sort_order: 6, is_active: true },
  { id: 7, code: 'others', label: 'Other', level: 0, sort_order: 7, is_active: true },
];

const FALLBACK_INDUSTRY_TYPES: IndustryType[] = [
  { id: 1, code: 'agriculture', label: 'Agriculture', description: null, sort_order: 1, is_active: true, created_at: '', updated_at: '' },
  { id: 2, code: 'forestry', label: 'Forestry', description: null, sort_order: 2, is_active: true, created_at: '', updated_at: '' },
  { id: 3, code: 'fishing', label: 'Fishing', description: null, sort_order: 3, is_active: true, created_at: '', updated_at: '' },
  { id: 4, code: 'mining', label: 'Mining', description: null, sort_order: 4, is_active: true, created_at: '', updated_at: '' },
  { id: 5, code: 'oil_gas', label: 'Oil and Gas Extraction', description: null, sort_order: 5, is_active: true, created_at: '', updated_at: '' },
  { id: 6, code: 'manufacturing', label: 'Manufacturing', description: null, sort_order: 6, is_active: true, created_at: '', updated_at: '' },
  { id: 7, code: 'construction', label: 'Construction', description: null, sort_order: 7, is_active: true, created_at: '', updated_at: '' },
  { id: 8, code: 'textiles', label: 'Textiles and Apparel', description: null, sort_order: 8, is_active: true, created_at: '', updated_at: '' },
  { id: 9, code: 'food_processing', label: 'Food and Beverage Processing', description: null, sort_order: 9, is_active: true, created_at: '', updated_at: '' },
  { id: 10, code: 'chemical', label: 'Chemical Production', description: null, sort_order: 10, is_active: true, created_at: '', updated_at: '' },
  { id: 11, code: 'steel', label: 'Steel and Metalworking', description: null, sort_order: 11, is_active: true, created_at: '', updated_at: '' },
  { id: 12, code: 'energy', label: 'Energy Production', description: null, sort_order: 12, is_active: true, created_at: '', updated_at: '' },
  { id: 13, code: 'retail_wholesale', label: 'Retail and Wholesale Trade', description: null, sort_order: 13, is_active: true, created_at: '', updated_at: '' },
  { id: 14, code: 'transportation', label: 'Transportation and Logistics', description: null, sort_order: 14, is_active: true, created_at: '', updated_at: '' },
  { id: 15, code: 'tourism_and_hospitality', label: 'Tourism and Hospitality', description: null, sort_order: 15, is_active: true, created_at: '', updated_at: '' },
  { id: 16, code: 'healthcare_and_medical', label: 'Healthcare and Medical Services', description: null, sort_order: 16, is_active: true, created_at: '', updated_at: '' },
  { id: 17, code: 'financial', label: 'Financial Services', description: null, sort_order: 17, is_active: true, created_at: '', updated_at: '' },
  { id: 18, code: 'education', label: 'Education and Training', description: null, sort_order: 18, is_active: true, created_at: '', updated_at: '' },
  { id: 19, code: 'media', label: 'Entertainment and Media', description: null, sort_order: 19, is_active: true, created_at: '', updated_at: '' },
  { id: 20, code: 'real_estate_and_property_manage', label: 'Real Estate and Property Management', description: null, sort_order: 20, is_active: true, created_at: '', updated_at: '' },
  { id: 21, code: 'legal', label: 'Legal Services', description: null, sort_order: 21, is_active: true, created_at: '', updated_at: '' },
  { id: 22, code: 'telecom', label: 'Telecommunications', description: null, sort_order: 22, is_active: true, created_at: '', updated_at: '' },
  { id: 23, code: 'consulting', label: 'Professional Services', description: null, sort_order: 23, is_active: true, created_at: '', updated_at: '' },
  { id: 24, code: 'information_technology', label: 'Information Technology', description: null, sort_order: 24, is_active: true, created_at: '', updated_at: '' },
  { id: 25, code: 'research', label: 'Research and Development', description: null, sort_order: 25, is_active: true, created_at: '', updated_at: '' },
  { id: 26, code: 'biotech', label: 'Biotechnology', description: null, sort_order: 26, is_active: true, created_at: '', updated_at: '' },
  { id: 27, code: 'environment', label: 'Environmental Services', description: null, sort_order: 27, is_active: true, created_at: '', updated_at: '' },
  { id: 28, code: 'aerospace_and_defense', label: 'Aerospace and Defense', description: null, sort_order: 28, is_active: true, created_at: '', updated_at: '' },
  { id: 29, code: 'defense', label: 'Defense', description: null, sort_order: 29, is_active: true, created_at: '', updated_at: '' },
  { id: 30, code: 'ecommerce', label: 'E-commerce', description: null, sort_order: 30, is_active: true, created_at: '', updated_at: '' },
  { id: 31, code: 'government_and_public_administrator', label: 'Government and Public Administration', description: null, sort_order: 31, is_active: true, created_at: '', updated_at: '' },
  { id: 32, code: 'nonprofit_charitable_organization', label: 'Non-Profit and Charitable Organizations', description: null, sort_order: 32, is_active: true, created_at: '', updated_at: '' },
  { id: 33, code: 'artificial_inteligence', label: 'Artificial Intelligence', description: null, sort_order: 33, is_active: true, created_at: '', updated_at: '' },
  { id: 34, code: 'blockchain_and_cryptocurrency', label: 'Blockchain and Cryptocurrency', description: null, sort_order: 34, is_active: true, created_at: '', updated_at: '' },
  { id: 35, code: 'electric_vehicles', label: 'Electric Vehicles', description: null, sort_order: 35, is_active: true, created_at: '', updated_at: '' },
  { id: 36, code: 'space', label: 'Space Exploration', description: null, sort_order: 36, is_active: true, created_at: '', updated_at: '' },
  { id: 37, code: 'cybersecurity', label: 'Cybersecurity', description: null, sort_order: 37, is_active: true, created_at: '', updated_at: '' },
  { id: 38, code: 'green_technology', label: 'Green Technology and Sustainability', description: null, sort_order: 38, is_active: true, created_at: '', updated_at: '' },
  { id: 39, code: 'others', label: 'Others', description: null, sort_order: 99, is_active: true, created_at: '', updated_at: '' },
];

export default function JDCreation({ onBack, selectedJob, onPublish, editingJD, isJDInUse = false, jdUsageMessage, editingJDId, onClose, onSuccess, isEmbedded }: JDCreationProps = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<CreationMode>('ai');
  const [step, setStep] = useState<Step>(editingJD?.creation_stage || 'create');

  // Determine if we're editing a draft or a published JD
  // Draft JD: can be updated directly (editingId is set)
  // Published JD: can also be updated directly (editingId is set) - creates a new version on publish
  // FIX-003: Use effectiveEditingJD (loaded or prop data) - computed below after loading

  // If editing a draft or published JD, we can update it directly.
  const [editingId, setEditingId] = useState<string | null>(null);
  // sourceJdId tracks the original JD for reference
  const [sourceJdId, setSourceJdId] = useState<string | null>(null);

  // FIX-003: State for loading JD in embedded mode
  const [loadingJD, setLoadingJD] = useState(false);
  const [loadedJDData, setLoadedJDData] = useState<EditingJDData | null>(null);

  // FIX-003: Fetch JD when editingJDId is provided (embedded mode)
  useEffect(() => {
    if (editingJDId && isEmbedded) {
      const fetchJD = async () => {
        setLoadingJD(true);
        try {
          const jd = await jdService.get(editingJDId);
          const jdData: EditingJDData = {
            id: jd.id,
            title: jd.title,
            description: jd.description,
            status: jd.status,
            creation_stage: jd.creation_stage || 'create',
            creation_method: jd.creation_method,
            ai_prompt: jd.ai_prompt,
            must_have_skills: jd.must_have_skills,
            nice_to_have_skills: jd.nice_to_have_skills,
            education_requirements: jd.education_requirements,
            experience_min: jd.experience_min,
            experience_max: jd.experience_max,
            industry_type: jd.industry_type,
            salary_min: jd.salary_min,
            salary_max: jd.salary_max,
            compensation_type: jd.compensation_type,
            employment_type: jd.employment_type,
            remote_type: jd.remote_type,
            assessment_guidance: jd.assessment_guidance,
            internal_comments: jd.internal_comments,
            must_have_comments: jd.must_have_comments,
            nice_to_have_comments: jd.nice_to_have_comments,
            allow_overqualified: jd.allow_overqualified,
            locations: jd.locations?.map(loc => ({
              city: loc.city || '',
              radius_km: loc.radius_km,
              is_required: loc.is_required,
            })),
          };
          setLoadedJDData(jdData);
        } catch (error) {
          console.error('[JDCreation] Failed to fetch JD:', error);
          toast.error('Failed to load JD');
        } finally {
          setLoadingJD(false);
        }
      };
      fetchJD();
    }
  }, [editingJDId, isEmbedded]);

  // Use loaded JD data or prop data
  const effectiveEditingJD = loadedJDData || editingJD;

  // FIX-003: Computed values for editing state
  const isEditingDraft = effectiveEditingJD?.status === 'draft';
  const isEditingPublished = effectiveEditingJD?.status === 'published';

  // Set editingId when component mounts or editingJD changes
  useEffect(() => {
    if (effectiveEditingJD) {
      console.log('[DEBUG] editingJD received:', { id: effectiveEditingJD.id, status: effectiveEditingJD.status });
      if (effectiveEditingJD.status === 'draft') {
        // Editing a draft - update it directly
        setEditingId(effectiveEditingJD.id);
        setSourceJdId(null);
        console.log('[DEBUG] Setting editingId for draft:', effectiveEditingJD.id);
      } else if (effectiveEditingJD.status === 'published') {
        // Editing published JD - update it directly (creates new version on republish)
        setEditingId(effectiveEditingJD.id);
        setSourceJdId(effectiveEditingJD.id);
        console.log('[DEBUG] Setting editingId for published:', effectiveEditingJD.id);
      }
    }
  }, [effectiveEditingJD]);

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

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);

  // Step 2: Extracted Data
  const [extractedData, setExtractedData] = useState<ExtractedData>({
    mustHaveSkills: [],
    mustHaveComments: [],
    niceToHaveSkills: [],
    niceToHaveComments: [],
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
    // Coding assessment fields
    codingRequired: false,
    suggestedLanguages: [],
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
  const [editingNiceCommentIndex, setEditingNiceCommentIndex] = useState<number | null>(null);
  const [editingNiceCommentValue, setEditingNiceCommentValue] = useState('');
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

  // Track if we've loaded from editingJD to prevent re-initialization on re-renders
  const hasLoadedFromEditingJD = useRef(false);

  // Track original values from last extraction to skip re-extraction if unchanged
  const [lastExtractedJD, setLastExtractedJD] = useState<string>('');

  // Track if we've already formatted for review to skip re-formatting if no changes
  const [hasFormattedForReview, setHasFormattedForReview] = useState(false);

  // Validation errors for inline display
  const [validationErrors, setValidationErrors] = useState<{
    mustHaveSkills?: string;
    mustHaveComments?: string;
    education?: string;
    experience?: string;
    industryType?: string;
    salaryRange?: string;
  }>({});

  // Helper function to parse salary value (handles LPA, L, K, commas, ₹)
  const parseSalaryValue = (value: string): number | null => {
    if (!value || value.trim() === '') return null;

    // Remove ₹, Rs, commas, spaces
    let cleaned = value.replace(/[₹,\s]/g, '').replace(/Rs\.?/gi, '').trim();

    // Handle LPA (Lakhs Per Annum) - multiply by 100000
    if (/lpa$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/lpa$/i, ''));
      return isNaN(num) ? null : num * 100000;
    }

    // Handle L or Lakhs - multiply by 100000
    if (/l(akhs?)?$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/l(akhs?)?$/i, ''));
      return isNaN(num) ? null : num * 100000;
    }

    // Handle K or thousands - multiply by 1000
    if (/k$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/k$/i, ''));
      return isNaN(num) ? null : num * 1000;
    }

    // Handle Cr or Crores - multiply by 10000000
    if (/cr(ores?)?$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/cr(ores?)?$/i, ''));
      return isNaN(num) ? null : num * 10000000;
    }

    // Plain number
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  // Validate salary range
  const validateSalaryRange = (from: string, to: string): string | undefined => {
    const minSalary = parseSalaryValue(from);
    const maxSalary = parseSalaryValue(to);

    // If both are empty, no error
    if (minSalary === null && maxSalary === null) return undefined;

    // If only one is filled, that's okay
    if (minSalary === null || maxSalary === null) return undefined;

    // Both are filled - validate range
    if (minSalary >= maxSalary) {
      return 'Minimum salary must be less than maximum salary';
    }

    return undefined;
  };

  // Track if user has proceeded to extract stage (to disable regenerate button)
  const [hasProceededToExtract, setHasProceededToExtract] = useState(false);

  // Track if user has proceeded to review stage (to make Stage 2 fields read-only)
  const [hasProceededToReview, setHasProceededToReview] = useState(false);

  // Track original Stage 1 values to detect modifications after returning from review
  const [originalStage1Values, setOriginalStage1Values] = useState<{
    jobTitle: string;
    aiPrompt: string;
    generatedJD: string;
    manualJD: string;
  } | null>(null);

  // Save to draft state
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);

  // JD06: Autosave state
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastAutosaveTime, setLastAutosaveTime] = useState<Date | null>(null);

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Cancel JD creation state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Master data state - initialized with fallback data so dropdowns work immediately
  const [experienceLevels, setExperienceLevels] = useState<ExperienceLevel[]>(FALLBACK_EXPERIENCE_LEVELS);
  const [educationLevels, setEducationLevels] = useState<EducationLevel[]>(FALLBACK_EDUCATION_LEVELS);
  const [industryTypes, setIndustryTypes] = useState<IndustryType[]>(FALLBACK_INDUSTRY_TYPES);
  const [masterDataLoading, setMasterDataLoading] = useState(false);  // Set to false since we have fallback data

  // Fetch master data on mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const data = await masterDataService.getAll();
        console.log('[TalentFlow] Master data loaded:', {
          education_levels: data.education_levels?.map(e => e.code),
          experience_levels: data.experience_levels?.map(e => e.code),
          industry_types: data.industry_types?.length
        });

        // Use API data if available, otherwise use fallback
        setExperienceLevels(data.experience_levels?.length > 0 ? data.experience_levels : FALLBACK_EXPERIENCE_LEVELS);
        setEducationLevels(data.education_levels?.length > 0 ? data.education_levels : FALLBACK_EDUCATION_LEVELS);
        setIndustryTypes(data.industry_types?.length > 0 ? data.industry_types : FALLBACK_INDUSTRY_TYPES);

        if (!data.experience_levels?.length) {
          console.log('[TalentFlow] No experience levels from API, using fallback');
        }
      } catch (error) {
        console.log('[TalentFlow] Failed to fetch master data, using fallback:', error);
        // Use fallback data on error
        setExperienceLevels(FALLBACK_EXPERIENCE_LEVELS);
        setEducationLevels(FALLBACK_EDUCATION_LEVELS);
        setIndustryTypes(FALLBACK_INDUSTRY_TYPES);
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

    // Need at least 1 non-space character in job title
    if (!jobTitle.trim()) return;

    const autosaveTimer = setTimeout(async () => {
      // Don't autosave if currently saving via another action or already published
      if (isSavingDraft || isPublishing || isPublished) return;

      setAutosaveStatus('saving');

      try {
        // Build description based on mode
        // For AI mode: use generated JD, or AI prompt as placeholder, or empty string
        const description = mode === 'ai'
          ? (generatedJD || (aiPrompt ? `[AI Prompt - Pending Generation]\n\n${aiPrompt}` : ''))
          : manualJD;

        const jdData = {
          title: jobTitle.trim(),  // Trim spaces before saving
          description: description,
          creation_stage: 'create' as const,
          creation_method: mode === 'ai' ? 'ai_generated' : 'manual' as const,
          ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
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
        setHasUnsavedChanges(false); // Clear unsaved changes after successful save

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
  }, [jobTitle, manualJD, aiPrompt, generatedJD, step, mode, editingId, isSavingDraft, isPublishing, isPublished]);

  // Track changes for unsaved changes warning
  useEffect(() => {
    if (jobTitle.trim() || aiPrompt.trim() || manualJD.trim() || generatedJD.trim()) {
      setHasUnsavedChanges(true);
    }
  }, [jobTitle, aiPrompt, manualJD, generatedJD]);

  // Warn before closing browser tab/window if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && !isPublished) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isPublished]);

  // Intercept navigation clicks (menu items, links, etc.) if there are unsaved changes
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Only intercept if there are unsaved changes and not published
      if (!hasUnsavedChanges || isPublished) {
        return;
      }

      // Find the clicked link/anchor
      let target = e.target as HTMLElement;
      while (target && target !== document.body) {
        if (target.tagName === 'A' || target.getAttribute('role') === 'link') {
          const href = target.getAttribute('href');

          // Check if it's a navigation link (not # anchors or external links)
          if (href && href.startsWith('/') && !href.startsWith('/#')) {
            // Prevent default navigation
            e.preventDefault();
            e.stopPropagation();

            // Store the target URL and show dialog
            setPendingNavigation(href);
            setShowUnsavedDialog(true);
            return;
          }
        }
        target = target.parentElement as HTMLElement;
      }
    };

    // Attach to document to catch all clicks
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [hasUnsavedChanges, isPublished]);

  // Cleanup streaming connection on unmount
  useEffect(() => {
    return () => {
      if (isStreaming) {
        console.log('[TalentFlow] Component unmounting, cleaning up streaming');
        setIsStreaming(false);
        setStreamedContent('');
      }
    };
  }, []);

  const handleGenerateJD = async () => {
    // Note: Quota check moved to publish action - generation doesn't consume quota
    setIsGenerating(true);
    setIsStreaming(true);
    setStreamedContent('');
    setStreamError(null);
    setGeneratedJD(''); // Clear previous content

    const prompt = `${jobTitle}${aiPrompt ? ` - ${aiPrompt}` : ''}`;

    // Helper function to process extracted params
    const processExtractedParams = (params: any) => {
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
        const normalizedLevel = params.experience_level.toLowerCase().replace(/[^a-z]/g, '');
        expValue = levelMap[normalizedLevel] || '';
      }

      console.log('[TalentFlow] AI Generation - extracted coding fields:', {
        coding_required: params.coding_required,
        suggested_languages: params.suggested_languages
      });

      // When in edit mode, preserve existing values if extraction returns empty arrays
      const isEditMode = !!editingId;

      // Debug logging for extraction
      console.log('[DEBUG] Extraction params received:', {
        nice_to_have_skills: params.nice_to_have_skills,
        nice_to_have_comments: params.nice_to_have_comments,
        must_have_skills: params.must_have_skills,
        must_have_comments: params.must_have_comments,
      });

      // During AI generation, don't overwrite comments - they will be properly extracted when user clicks "Next"
      // Only update skills and other basic fields here
      setExtractedData(prev => ({
        ...prev,
        mustHaveSkills: params.must_have_skills?.length > 0 ? params.must_have_skills : (isEditMode ? prev.mustHaveSkills : []),
        // Don't overwrite comments during AI generation - preserve existing or keep empty for proper extraction later
        mustHaveComments: params.must_have_comments?.length > 0 ? params.must_have_comments : prev.mustHaveComments,
        niceToHaveSkills: params.nice_to_have_skills?.length > 0 ? params.nice_to_have_skills : (isEditMode ? prev.niceToHaveSkills : []),
        // Don't overwrite comments during AI generation - preserve existing or keep empty for proper extraction later
        niceToHaveComments: params.nice_to_have_comments?.length > 0 ? params.nice_to_have_comments : prev.niceToHaveComments,
        education: params.education_requirements?.degree?.toLowerCase().replace("'s", 's').replace(' ', '-') || (isEditMode ? prev.education : ''),
        experience: expValue || prev.experience,
        industryType: params.industry_type?.toLowerCase() || (isEditMode ? prev.industryType : ''),
        employmentType: prev.employmentType,
        workModel: prev.workModel,
        salaryFrom: params.salary_min ? params.salary_min.toString() : (isEditMode ? prev.salaryFrom : ''),
        salaryTo: params.salary_max ? params.salary_max.toString() : (isEditMode ? prev.salaryTo : ''),
        compensationType: (params.compensation_type as 'yearly' | 'monthly' | 'hourly' | 'daily') || prev.compensationType || 'yearly',
        locations: (params.locations || []).length > 0 ? params.locations.map((loc: any) => ({
          city: loc.city || '',
          radius: '50'
        })) : (isEditMode ? prev.locations : []),
        allowOverqualified: isEditMode ? prev.allowOverqualified : false,
        codingRequired: params.coding_required === true || (isEditMode ? prev.codingRequired : false),
        suggestedLanguages: params.suggested_languages?.length > 0 ? params.suggested_languages : (isEditMode ? prev.suggestedLanguages : []),
        certifications: params.certifications?.length > 0 ? params.certifications : (isEditMode ? prev.certifications : []),
        domainKeywords: params.domain_keywords?.length > 0 ? params.domain_keywords : (isEditMode ? prev.domainKeywords : []),
      }));
    };

    // Fallback function for non-streaming
    const fallbackToNonStreaming = async (prompt: string) => {
      try {
        console.log('[TalentFlow] Falling back to non-streaming API');
        const response = await jdService.generate(prompt);

        if (response?.description) {
          if (response.title) {
            setJobTitle(response.title);
          }
          setGeneratedJD(response.description);

          if (response.extracted_params) {
            processExtractedParams(response.extracted_params);
          }

          toast.success({
            title: 'JD Generated Successfully',
            description: 'AI has created a comprehensive job description.'
          });
        } else {
          throw new Error('No description in response');
        }
      } catch (error) {
        console.error('[TalentFlow] Fallback generation failed:', error);

        // Check if it's a quota error
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
        if (errorMessage.includes('quota') || errorMessage.includes('rate') || errorMessage.includes('insufficient')) {
          toast.error({
            title: 'OpenAI Quota Exceeded',
            description: 'The AI service is temporarily unavailable. Please try again later or contact support.'
          });
        } else {
          toast.error({
            title: 'Generation Failed',
            description: 'Could not generate JD. Please check your connection and try again.'
          });
        }
        throw error;
      }
    };

    try {
      // Try streaming first
      await jdService.generateStream(prompt, {
        onChunk: (content: string) => {
          // Accumulate markdown chunks progressively and display them
          setStreamedContent((prev) => prev + content);

          // Update the displayed JD content progressively (like ChatGPT)
          setGeneratedJD((prev) => prev + content);
        },
        onTitle: (title: string) => {
          // Update title if provided
          if (title) {
            setJobTitle(title);
          }
        },
        onTextComplete: () => {
          // Text streaming is done, hide "Generating..." indicator
          // Parameter extraction is still happening in background
          console.log('[TalentFlow] Text generation complete, extracting params...');
          setIsStreaming(false);
        },
        onComplete: (response) => {
          // IMPORTANT: Set isStreaming to false FIRST to prevent "Generating..." from showing
          setIsStreaming(false);

          // Then set final content
          if (response?.description) {
            setGeneratedJD(response.description);

            // Process extracted params
            if (response.extracted_params) {
              processExtractedParams(response.extracted_params);
            }

            // Note: Toast removed here to prevent it showing in stage 2 when user moves quickly
            // The JD is already visible (streamed), so toast is redundant
          }
        },
        onError: (message: string, errorCode?: string) => {
          console.error('[TalentFlow] Stream error:', message, 'Code:', errorCode);
          setStreamError(message);
          setIsStreaming(false);

          // Handle quota exceeded error - don't fallback, just show error
          if (errorCode === 'QUOTA_EXCEEDED') {
            toast.error({
              title: 'OpenAI Quota Exceeded',
              description: 'The AI service is temporarily unavailable. Please try again later or contact support.',
            });
            setIsGenerating(false);
            return;
          }

          // Fall back to non-streaming for other errors
          fallbackToNonStreaming(prompt).catch(() => {
            // Error already handled in fallback function
          });
        }
      });
    } catch (streamErr) {
      console.error('[TalentFlow] Streaming failed, falling back:', streamErr);
      setIsStreaming(false);

      // Fall back to non-streaming API
      await fallbackToNonStreaming(prompt).catch(() => {
        // Error already handled in fallback function
      });
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  };

  const handleNext = async () => {
    const jdText = mode === 'ai' ? generatedJD : manualJD;

    // Validate JD input is not empty
    if (!jdText || jdText.trim().length < 50) {
      toast.error({
        title: 'Invalid JD',
        description: 'Please provide a valid job description with at least 50 characters.',
      });
      return;
    }

    // Check if any Stage 1 field has changed since last extraction
    // If user has proceeded to review and comes back to Stage 1:
    // - If ANY field is modified → trigger re-extraction
    // - If NO fields modified → skip extraction, go directly to Stage 2
    const hasStage1FieldsChanged = () => {
      if (!originalStage1Values) {
        console.log('[TalentFlow] No originalStage1Values, need extraction');
        return true; // No original values, need extraction
      }

      const currentJobTitle = jobTitle.trim();
      const currentAiPrompt = aiPrompt.trim();
      const currentGeneratedJD = generatedJD.trim();
      const currentManualJD = manualJD.trim();

      const jobTitleChanged = currentJobTitle !== originalStage1Values.jobTitle.trim();
      const aiPromptChanged = currentAiPrompt !== originalStage1Values.aiPrompt.trim();
      const generatedJDChanged = currentGeneratedJD !== originalStage1Values.generatedJD.trim();
      const manualJDChanged = currentManualJD !== originalStage1Values.manualJD.trim();

      console.log('[TalentFlow] Stage 1 field comparison:', {
        currentJobTitle,
        originalJobTitle: originalStage1Values.jobTitle.trim(),
        jobTitleChanged,
        currentAiPrompt: currentAiPrompt.substring(0, 50),
        originalAiPrompt: originalStage1Values.aiPrompt.trim().substring(0, 50),
        aiPromptChanged,
        currentGeneratedJDLength: currentGeneratedJD.length,
        originalGeneratedJDLength: originalStage1Values.generatedJD.trim().length,
        generatedJDChanged,
        currentManualJDLength: currentManualJD.length,
        originalManualJDLength: originalStage1Values.manualJD.trim().length,
        manualJDChanged
      });

      return jobTitleChanged || aiPromptChanged || generatedJDChanged || manualJDChanged;
    };

    console.log('[TalentFlow] handleNext check:', { hasProceededToReview, hasOriginalStage1Values: !!originalStage1Values });

    // If user has proceeded to review and returned to Stage 1
    if (hasProceededToReview && originalStage1Values) {
      if (!hasStage1FieldsChanged()) {
        // No fields modified - skip extraction, go directly to Stage 2
        console.log('[TalentFlow] No Stage 1 fields modified after review, skipping extraction');
        setHasProceededToExtract(true);
        setStep('extract');
        return;
      } else {
        // Fields modified - need to re-extract, also reset hasProceededToReview
        console.log('[TalentFlow] Stage 1 fields modified after review, triggering re-extraction');
        setHasProceededToReview(false); // Reset so Stage 2 becomes editable again
      }
    } else if (lastExtractedJD && jdText.trim() === lastExtractedJD.trim()) {
      // Normal flow: Check if JD has changed since last extraction
      console.log('[TalentFlow] JD unchanged, skipping extraction and going directly to step 2');
      setHasProceededToExtract(true);
      setStep('extract');
      return;
    }

    setIsExtracting(true);
    setHasProceededToExtract(true); // Disable regenerate button immediately when Next is clicked

    try {
      // Call real API to extract parameters using AI
      console.log('[TalentFlow] Extracting parameters from JD, length:', jdText.length);
      const params = await jdService.extractParamsFromText(jdText);

      // Debug: Log API response to see what's being extracted
      console.log('[TalentFlow] Extraction API response:', params);
      console.log('[TalentFlow] Experience values:', {
        experience_min: params.experience_min,
        experience_max: params.experience_max,
        experience_level: params.experience_level
      });
      console.log('[TalentFlow] Mandatory flags from API:', {
        experience_mandatory: params.experience_mandatory,
        education_mandatory: params.education_mandatory,
        industry_mandatory: params.industry_mandatory
      });
      console.log('[TalentFlow] Comments from API:', {
        must_have_comments: params.must_have_comments,
        must_have_comments_length: params.must_have_comments?.length || 0,
        nice_to_have_comments: params.nice_to_have_comments,
        nice_to_have_comments_length: params.nice_to_have_comments?.length || 0
      });
      console.log('[TalentFlow] Will set UI checkboxes:', {
        experienceRequired: params.experience_mandatory || false,
        educationRequired: params.education_mandatory || false,
        industryTypeRequired: params.industry_mandatory || false
      });
      console.log('[TalentFlow] Work settings:', {
        work_mode: params.work_mode,
        job_type: params.job_type
      });

      // Map API response to component's ExtractedData format
      // Map experience to dropdown codes: '0-1', '1-3', '3-5', '5-7', '7-10', '10+'
      let experienceValue = '';

      // Convert experience values to numbers (API might return strings)
      const expMin = params.experience_min !== null && params.experience_min !== undefined
        ? Number(params.experience_min)
        : null;
      const expMax = params.experience_max !== null && params.experience_max !== undefined
        ? Number(params.experience_max)
        : null;

      // Check if we have valid numeric experience values
      const hasExpMin = expMin !== null && !isNaN(expMin);
      const hasExpMax = expMax !== null && !isNaN(expMax);

      console.log('[TalentFlow] Experience conversion:', {
        raw_min: params.experience_min,
        raw_max: params.experience_max,
        converted_min: expMin,
        converted_max: expMax,
        hasExpMin,
        hasExpMax
      });

      // Map experience to predefined levels based on rules:
      // Entry Level (0-2 Years), Junior Level (2-4 Years), Mid Level (5-7 Years),
      // Senior Level (7-10 Years), Architect Level (10+), Management Level (10+)
      const mapToExperienceCode = (min: number, max: number | null, jdText: string): string => {
        console.log('[TalentFlow] mapToExperienceCode input:', { min, max });

        // Check for 10+ years - need to determine if Architect or Management
        if (min >= 10 || (max && max >= 10)) {
          const jdLower = jdText.toLowerCase();
          // Check for architecture-related keywords
          const isArchitect = jdLower.includes('architect') ||
                              jdLower.includes('system design') ||
                              jdLower.includes('architecture') ||
                              jdLower.includes('technical design') ||
                              jdLower.includes('solution design');
          // Check for management-related keywords
          const isManagement = jdLower.includes('management') ||
                               jdLower.includes('leadership') ||
                               jdLower.includes('strategic planning') ||
                               jdLower.includes('team lead') ||
                               jdLower.includes('director') ||
                               jdLower.includes('head of');

          if (isArchitect && !isManagement) return 'architect';
          if (isManagement) return 'management';
          return 'senior'; // Default to senior if 10+ but no specific keywords
        }

        // 7-10 years = Senior Level
        if (min >= 7 || (max && max >= 7 && min >= 5)) return 'senior';

        // 5-7 years = Mid Level
        if (min >= 5 || (max && max >= 5 && min >= 3)) return 'mid';

        // 2-4 years = Junior Level
        if (min >= 2 || (max && max >= 2 && min >= 1)) return 'junior';

        // 0-2 years = Entry Level
        return 'entry';
      };

      if (hasExpMin || hasExpMax) {
        const min = hasExpMin ? expMin! : 0;
        const max = hasExpMax ? expMax : null;
        experienceValue = mapToExperienceCode(min, max, jdText);
        console.log('[TalentFlow] Mapped experience:', { min, max, code: experienceValue });
      }

      // Fall back to experience_level mapping if no min/max
      if (!experienceValue && params.experience_level) {
        const levelMap: Record<string, string> = {
          // Entry Level keywords
          'entry': 'entry',
          'entrylevel': 'entry',
          'fresher': 'entry',
          'fresh': 'entry',
          'noexperience': 'entry',
          'graduate': 'entry',
          'trainee': 'entry',
          // Junior Level keywords
          'junior': 'junior',
          'juniorlevel': 'junior',
          'associate': 'junior',
          // Mid Level keywords
          'mid': 'mid',
          'midlevel': 'mid',
          'intermediate': 'mid',
          'experienced': 'mid',
          // Senior Level keywords
          'senior': 'senior',
          'seniorlevel': 'senior',
          'lead': 'senior',
          'teamlead': 'senior',
          'principal': 'senior',
          // Architect Level keywords
          'architect': 'architect',
          'solutionarchitect': 'architect',
          'technicalarchitect': 'architect',
          'systemarchitect': 'architect',
          'architectlevel': 'architect',
          // Management Level keywords
          'management': 'management',
          'manager': 'management',
          'director': 'management',
          'head': 'management',
          'executive': 'management',
          'vp': 'management',
          'cto': 'management',
          'ceo': 'management',
          'managementlevel': 'management',
        };
        // Handle various formats like "mid", "Mid", "Mid Level", "mid-level", "mid_level"
        const normalizedLevel = params.experience_level.toLowerCase().replace(/[^a-z]/g, '');
        experienceValue = levelMap[normalizedLevel] || '';

        // If still not found, try to extract the base level from the string
        if (!experienceValue) {
          if (normalizedLevel.includes('entry')) experienceValue = 'entry';
          else if (normalizedLevel.includes('junior')) experienceValue = 'junior';
          else if (normalizedLevel.includes('mid')) experienceValue = 'mid';
          else if (normalizedLevel.includes('senior')) experienceValue = 'senior';
          else if (normalizedLevel.includes('architect')) experienceValue = 'architect';
          else if (normalizedLevel.includes('management') || normalizedLevel.includes('manager')) experienceValue = 'management';
        }

        if (experienceValue) {
          console.log('[TalentFlow] Mapped experience from level:', { level: params.experience_level, code: experienceValue });
        }
      }

      // Final fallback: use experience_level directly if it's a valid code
      if (!experienceValue && params.experience_level) {
        const validCodes = ['entry', 'junior', 'mid', 'senior', 'architect', 'management'];
        const directCode = params.experience_level.toLowerCase();
        if (validCodes.includes(directCode)) {
          experienceValue = directCode;
          console.log('[TalentFlow] Using experience_level directly:', experienceValue);
        }
      }

      // Log if still no experience extracted
      if (!experienceValue) {
        console.log('[TalentFlow] No experience extracted, params were:', {
          experience_min: params.experience_min,
          experience_max: params.experience_max,
          experience_level: params.experience_level
        });
      }

      // Map education to dropdown codes: 'diploma', 'associate', 'bachelors', 'masters', 'doctorate', 'none', 'others'
      const mapToEducationCode = (degree: string | undefined): string => {
        if (!degree) return '';
        const normalized = degree.toLowerCase().replace(/[^a-z]/g, '');
        const educationMap: Record<string, string> = {
          'diploma': 'diploma',
          'associate': 'associate',
          'associatedegree': 'associate',
          'bachelors': 'bachelors',
          'bachelorsdegree': 'bachelors',
          'bachelor': 'bachelors',
          'btech': 'bachelors',
          'be': 'bachelors',
          'bsc': 'bachelors',
          'ba': 'bachelors',
          'masters': 'masters',
          'mastersdegree': 'masters',
          'master': 'masters',
          'mtech': 'masters',
          'me': 'masters',
          'msc': 'masters',
          'mba': 'masters',
          'doctorate': 'doctorate',
          'phd': 'doctorate',
          'doctoral': 'doctorate',
          'none': 'none',
          'noformal': 'none',
          'noformaleducation': 'none',
          'others': 'others',
          'other': 'others',
          'any': 'others',
        };
        return educationMap[normalized] || 'others';
      };

      let educationValue = mapToEducationCode(params.education_requirements?.degree);
      // No fallback - leave empty if not extracted
      if (!educationValue) {
        console.log('[TalentFlow] No education extracted, leaving empty');
      } else {
        console.log('[TalentFlow] Mapped education:', { degree: params.education_requirements?.degree, code: educationValue });
      }

      // Map industry to valid frontend codes
      // Valid codes: technology, finance, healthcare, manufacturing, retail, education, consulting, others
      const validIndustryCodes = ['technology', 'finance', 'healthcare', 'manufacturing', 'retail', 'education', 'consulting', 'others'];
      const industryMapping: Record<string, string> = {
        'information_technology': 'technology',
        'it': 'technology',
        'tech': 'technology',
        'software': 'technology',
        'financial': 'finance',
        'banking': 'finance',
        'fintech': 'finance',
        'healthcare_and_medical': 'healthcare',
        'medical': 'healthcare',
        'pharma': 'healthcare',
        'biotech': 'healthcare',
        'retail_wholesale': 'retail',
        'ecommerce': 'retail',
        'e-commerce': 'retail',
        'professional_services': 'consulting',
        'advisory': 'consulting',
      };

      let rawIndustry = params.industry_type?.toLowerCase().replace(/[^a-z_]/g, '_') || '';
      let industryValue = '';

      if (rawIndustry) {
        // First check if it's already a valid code
        if (validIndustryCodes.includes(rawIndustry)) {
          industryValue = rawIndustry;
        } else if (industryMapping[rawIndustry]) {
          // Map known variations to valid codes
          industryValue = industryMapping[rawIndustry];
        } else {
          // Default to 'others' for unknown industries
          industryValue = 'others';
        }
        console.log('[TalentFlow] Mapped industry:', { raw: params.industry_type, normalized: rawIndustry, code: industryValue });
      } else {
        console.log('[TalentFlow] No industry extracted, leaving empty');
      }

      // When in edit mode, preserve existing values if extraction returns empty arrays
      // This prevents losing manually edited comments/skills when re-extracting
      const isEditMode = !!editingId;

      const extraction: ExtractedData = {
        mustHaveSkills: params.must_have_skills?.length > 0 ? params.must_have_skills : (isEditMode ? extractedData.mustHaveSkills : []),
        mustHaveComments: params.must_have_comments?.length > 0 ? params.must_have_comments : (isEditMode ? extractedData.mustHaveComments : []),
        niceToHaveSkills: params.nice_to_have_skills?.length > 0 ? params.nice_to_have_skills : (isEditMode ? extractedData.niceToHaveSkills : []),
        niceToHaveComments: params.nice_to_have_comments?.length > 0 ? params.nice_to_have_comments : (isEditMode ? extractedData.niceToHaveComments : []),
        education: educationValue || (isEditMode ? extractedData.education : ''),
        // Use API's mandatory flag for education
        educationRequired: params.education_mandatory || false,
        experience: experienceValue || (isEditMode ? extractedData.experience : ''),
        // Use API's mandatory flag for experience
        experienceRequired: params.experience_mandatory || false,
        industryType: industryValue, // Only from extraction, no fallback - user must select if not extracted
        // Use API's mandatory flag for industry
        industryTypeRequired: params.industry_mandatory || false,
        allowOverqualified: isEditMode ? extractedData.allowOverqualified : false,
        employmentType: params.job_type || (isEditMode ? extractedData.employmentType : 'full_time'),
        workModel: params.work_mode || (isEditMode ? extractedData.workModel : 'onsite'),
        salaryFrom: params.salary_min ? params.salary_min.toString() : (isEditMode ? extractedData.salaryFrom : ''),
        salaryTo: params.salary_max ? params.salary_max.toString() : (isEditMode ? extractedData.salaryTo : ''),
        compensationType: (params.compensation_type as 'yearly' | 'monthly' | 'hourly' | 'daily') || (isEditMode ? extractedData.compensationType : 'yearly'),
        locations: (params.locations || []).length > 0 ? params.locations.map((loc: any) => ({
          city: loc.city || '',
          radius: '50'  // Default radius
        })) : (isEditMode ? extractedData.locations : []),
        locationsRequired: isEditMode ? extractedData.locationsRequired : false,
        assessmentGuidance: isEditMode ? extractedData.assessmentGuidance : '',
        internalRecruiterComments: isEditMode ? extractedData.internalRecruiterComments : [],
        // JD09: Extract certifications and domain keywords
        certifications: params.certifications?.length > 0 ? params.certifications : (isEditMode ? extractedData.certifications : []),
        domainKeywords: params.domain_keywords?.length > 0 ? params.domain_keywords : (isEditMode ? extractedData.domainKeywords : []),
        // Coding assessment fields - extract from AI response
        codingRequired: params.coding_required === true || (isEditMode ? extractedData.codingRequired : false),
        suggestedLanguages: params.suggested_languages?.length > 0 ? params.suggested_languages : (isEditMode ? extractedData.suggestedLanguages : []),
      };

      console.log('[TalentFlow] Final extracted data being set:', {
        experience: extraction.experience,
        experienceRequired: extraction.experienceRequired,
        education: extraction.education,
        educationRequired: extraction.educationRequired,
        industryType: extraction.industryType,
        industryTypeRequired: extraction.industryTypeRequired,
        mustHaveSkills: extraction.mustHaveSkills.length + ' skills',
        mustHaveComments: extraction.mustHaveComments.length + ' comments',
        niceToHaveSkills: extraction.niceToHaveSkills.length + ' skills',
        niceToHaveComments: extraction.niceToHaveComments.length + ' comments',
        employmentType: extraction.employmentType,
        workModel: extraction.workModel,
        salaryRange: `${extraction.salaryFrom}-${extraction.salaryTo}`,
      });

      console.log('[TalentFlow] Extracted coding fields:', {
        codingRequired: extraction.codingRequired,
        suggestedLanguages: extraction.suggestedLanguages
      });

      console.log('[TalentFlow] Setting extractedData with comments:', {
        mustHaveComments: extraction.mustHaveComments,
        niceToHaveComments: extraction.niceToHaveComments
      });
      setExtractedData(extraction);
      setLastExtractedJD(jdText);  // Track JD text to skip extraction if unchanged on next "Next" click

      // Save original Stage 1 values to detect modifications if user returns from review
      setOriginalStage1Values({
        jobTitle: jobTitle,
        aiPrompt: aiPrompt,
        generatedJD: generatedJD,
        manualJD: manualJD
      });

      console.log('[TalentFlow] Moving to extract step...');
      setStep('extract');

      // Save JD with creation_stage: 'extract' so refresh preserves the stage
      console.log('[TalentFlow] Saving JD with extract stage, editingId:', editingId);
      const jdData = {
        title: jobTitle.trim(),
        description: jdText,
        creation_stage: 'extract' as const,
        creation_method: mode === 'ai' ? 'ai_generated' : 'manual' as const,
        ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
        must_have_skills: extraction.mustHaveSkills,
        nice_to_have_skills: extraction.niceToHaveSkills,
        must_have_comments: extraction.mustHaveComments,
        nice_to_have_comments: extraction.niceToHaveComments,
        education_requirements: extraction.education ? { degree: extraction.education } : undefined,
        experience_min: hasExpMin ? params.experience_min : undefined,
        experience_max: hasExpMax ? params.experience_max : undefined,
        industry_type: extraction.industryType || undefined,
        salary_min: extraction.salaryFrom ? parseInt(extraction.salaryFrom.replace(/[^0-9]/g, '')) : undefined,
        salary_max: extraction.salaryTo ? parseInt(extraction.salaryTo.replace(/[^0-9]/g, '')) : undefined,
        compensation_type: extraction.compensationType,
        employment_type: extraction.employmentType,
        remote_type: extraction.workModel,
        certifications: extraction.certifications,
        domain_keywords: extraction.domainKeywords,
        // Coding assessment fields
        coding_required: extraction.codingRequired,
        supported_languages: extraction.suggestedLanguages,
        locations: extraction.locations.map(loc => ({
          city: loc.city,
          radius_km: parseInt(loc.radius) || 50,
          is_required: extraction.locationsRequired,
        })),
      };

      console.log('[TalentFlow] Saving JD with coding fields:', {
        coding_required: jdData.coding_required,
        supported_languages: jdData.supported_languages
      });

      try {
        let savedJd;
        let jdId = editingId;
        if (editingId) {
          savedJd = await jdService.update(editingId, jdData);
          console.log('[TalentFlow] JD updated with extract stage, id:', editingId);
        } else {
          savedJd = await jdService.create(jdData);
          jdId = savedJd.id;
          setEditingId(savedJd.id);
          console.log('[TalentFlow] JD created with extract stage, new id:', savedJd.id);
        }

        // Always ensure URL has the JD ID
        if (jdId && !window.location.search.includes(`id=${jdId}`)) {
          const newUrl = `${window.location.pathname}?id=${jdId}`;
          window.history.replaceState({}, '', newUrl);
          console.log('[TalentFlow] URL updated with JD ID:', jdId);
        }
      } catch (saveError) {
        console.error('[TalentFlow] Failed to save extract stage:', saveError);
        toast.error({
          title: 'Save Failed',
          description: 'Could not save progress. Your work may be lost on refresh.',
        });
      }

      toast.success({
        title: 'Data Extracted',
        description: 'AI has analyzed your JD and extracted key requirements.'
      });
    } catch (error) {
      console.error('[TalentFlow] Extraction failed:', error);

      // Reset hasProceededToExtract so user can try again
      setHasProceededToExtract(false);

      // Show appropriate error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('AI service')) {
        toast.error({
          title: 'AI Service Error',
          description: 'The AI extraction service is currently unavailable. Please try again later.'
        });
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        toast.error({
          title: 'Connection Error',
          description: 'Could not connect to the server. Please check your internet connection.'
        });
      } else {
        toast.error({
          title: 'Extraction Failed',
          description: 'Could not extract parameters from JD. Please try again.'
        });
      }
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
      // Clear validation error when skill is added
      if (category === 'mustHaveSkills') {
        setValidationErrors(prev => ({ ...prev, mustHaveSkills: undefined }));
      }
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
      // Clear validation error when comment is added
      setValidationErrors(prev => ({ ...prev, mustHaveComments: undefined }));
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

  // Nice-to-Have Comments handlers
  const handleAddNiceComment = () => {
    if (newComment.trim()) {
      setExtractedData(prev => ({
        ...prev,
        niceToHaveComments: [...(prev.niceToHaveComments || []), newComment.trim()],
      }));
      setNewComment('');
      setEditingCategory(null);
      setExtractedDataModified(true); // Mark as modified for regeneration
    }
  };

  const handleRemoveNiceComment = (index: number) => {
    setExtractedData(prev => ({
      ...prev,
      niceToHaveComments: (prev.niceToHaveComments || []).filter((_, i) => i !== index),
    }));
    setExtractedDataModified(true); // Mark as modified for regeneration
  };

  const handleStartEditNiceComment = (index: number, value: string) => {
    setEditingNiceCommentIndex(index);
    setEditingNiceCommentValue(value);
  };

  const handleSaveEditNiceComment = () => {
    if (editingNiceCommentIndex !== null && editingNiceCommentValue.trim()) {
      setExtractedData(prev => ({
        ...prev,
        niceToHaveComments: (prev.niceToHaveComments || []).map((comment, i) =>
          i === editingNiceCommentIndex ? editingNiceCommentValue.trim() : comment
        ),
      }));
      setExtractedDataModified(true); // Mark as modified for regeneration
    }
    setEditingNiceCommentIndex(null);
    setEditingNiceCommentValue('');
  };

  const handleCancelEditNiceComment = () => {
    setEditingNiceCommentIndex(null);
    setEditingNiceCommentValue('');
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

  // Comment move/drop handlers for drag and drop
  const handleMoveComment = (comment: string, from: 'mustHaveComments' | 'niceToHaveComments', to: 'mustHaveComments' | 'niceToHaveComments') => {
    setExtractedData(prev => ({
      ...prev,
      [from]: (prev[from] || []).filter(c => c !== comment),
      [to]: [...(prev[to] || []), comment],
    }));
    setExtractedDataModified(true);
  };

  const handleDropComment = (comment: string, fromCategory: 'mustHaveComments' | 'niceToHaveComments', toCategory: 'mustHaveComments' | 'niceToHaveComments') => {
    if (fromCategory !== toCategory) {
      handleMoveComment(comment, fromCategory, toCategory);
    }
  };

  const handleRemoveCommentByCategory = (category: 'mustHaveComments' | 'niceToHaveComments', index: number) => {
    setExtractedData(prev => ({
      ...prev,
      [category]: (prev[category] || []).filter((_, i) => i !== index),
    }));
    setExtractedDataModified(true);
  };

  const handleStartEditCommentByCategory = (category: 'mustHaveComments' | 'niceToHaveComments', index: number, value: string) => {
    if (category === 'mustHaveComments') {
      setEditingCommentIndex(index);
      setEditingCommentValue(value);
    } else {
      setEditingNiceCommentIndex(index);
      setEditingNiceCommentValue(value);
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
    // Debug logging for validation
    console.log('[TalentFlow] handlePublish validation check:', {
      education: extractedData.education,
      educationTrimmed: extractedData.education?.trim() || '',
      experience: extractedData.experience,
      experienceTrimmed: extractedData.experience?.trim() || '',
      industryType: extractedData.industryType,
      industryTypeTrimmed: extractedData.industryType?.trim() || '',
    });

    // DEFENSIVE CHECK: Early return if critical fields are empty
    // This prevents any edge case where button might be clickable
    const earlyCheckFailed = [];
    if (!extractedData.education?.trim()) earlyCheckFailed.push('Education');
    if (!extractedData.experience?.trim()) earlyCheckFailed.push('Experience');
    if (!extractedData.industryType?.trim()) earlyCheckFailed.push('Industry Type');

    if (earlyCheckFailed.length > 0) {
      console.log('[TalentFlow] BLOCKED: Missing required fields:', earlyCheckFailed);
      toast.error({
        title: 'Missing Required Fields',
        description: `Please select: ${earlyCheckFailed.join(', ')}`,
      });
      return;
    }

    // Validate mandatory fields
    const missingFields: string[] = [];
    const errors: {
      mustHaveSkills?: string;
      mustHaveComments?: string;
      education?: string;
      experience?: string;
      industryType?: string;
      locations?: string;
    } = {};

    // Must have at least one must-have skill
    if (extractedData.mustHaveSkills.length === 0) {
      missingFields.push('At least one Must-Have Skill');
      errors.mustHaveSkills = 'At least one Must-Have Skill is required';
    }

    // Must have at least one must-have comment
    if (extractedData.mustHaveComments.length === 0) {
      missingFields.push('At least one Must-Have Comment');
      errors.mustHaveComments = 'At least one Must-Have Comment is required';
    }

    // Education is required - check for empty string, null, undefined, or whitespace only
    if (!extractedData.education || extractedData.education.trim() === '') {
      missingFields.push('Education');
      errors.education = 'Education is required';
    }

    // Experience is required - check for empty string, null, undefined, or whitespace only
    if (!extractedData.experience || extractedData.experience.trim() === '') {
      missingFields.push('Experience');
      errors.experience = 'Experience is required';
    }

    // Industry Type is required - check for empty string, null, undefined, or whitespace only
    if (!extractedData.industryType || extractedData.industryType.trim() === '') {
      missingFields.push('Industry Type');
      errors.industryType = 'Industry Type is required';
    }

    // Location validation - if location is marked as required but no locations added, show error
    if (extractedData.locationsRequired && extractedData.locations.length === 0) {
      missingFields.push('At least one Location');
      errors.locations = 'Location is marked as required but no locations added';
    }

    // Set validation errors for inline display
    setValidationErrors(errors);

    if (missingFields.length > 0) {
      toast.error({
        title: 'Missing Required Fields',
        description: `Please complete: ${missingFields.join(', ')}`,
      });
      return;
    }

    // BEFORE going to review, reformat the JD description using AI (Odoo-style)
    // If user has modified extracted data (skills/comments), regenerate JD with those changes
    // For published JDs being edited, ALWAYS reformat to ensure latest changes are included
    // Skip formatting only if already formatted and no changes were made AND not editing a published JD
    // NOTE: Validation above runs BEFORE this check, so required fields are always validated
    if (hasFormattedForReview && !extractedDataModified && !isEditingPublished) {
      console.log('[DEBUG] Skipping reformat - already formatted and no changes made');
      console.log('[DEBUG] Experience value at skip:', extractedData.experience);
      setStep('review');
      setHasProceededToReview(true);  // Mark that user has proceeded to review (makes Stage 2 fields read-only)
      return;
    }

    console.log('[DEBUG] Reformatting JD description with extracted parameters...');
    console.log('[DEBUG] extractedDataModified:', extractedDataModified, 'hasFormattedForReview:', hasFormattedForReview);
    setIsRegenerating(true);

    // Track the final description to use (avoiding React state async issues)
    let finalDescription = mode === 'ai' ? generatedJD : manualJD;

    try {
      // Always reformat if there are parameters to include (comments, skills, etc.)
      // This ensures both manual and AI JDs get properly formatted with nice-to-have comments
      const mustHaveComments = extractedData.mustHaveComments || [];
      const niceToHaveComments = extractedData.niceToHaveComments || [];
      const hasParameters = extractedData.mustHaveSkills?.length > 0 ||
                           extractedData.niceToHaveSkills?.length > 0 ||
                           mustHaveComments.length > 0 ||
                           niceToHaveComments.length > 0;

      // Always reformat when there are skills/comments to incorporate OR when editing a published JD
      const shouldReformat = extractedDataModified || mode === 'ai' || (mode === 'manual' && hasParameters) || isEditingPublished || hasParameters;

      if (shouldReformat) {
        console.log('[DEBUG] Calling reformat API with parameters...');
        console.log('[DEBUG] Mode:', mode, 'extractedDataModified:', extractedDataModified, 'hasParameters:', hasParameters, 'isEditingPublished:', isEditingPublished);
        console.log('[DEBUG] Skills to include - mustHave:', extractedData.mustHaveSkills.length, 'niceToHave:', extractedData.niceToHaveSkills.length);
        console.log('[DEBUG] Comments to include - mustHave:', mustHaveComments.length, 'niceToHave:', niceToHaveComments.length);

        if (editingId) {
          console.log('[DEBUG] Passing parameters - must_have_comments:', mustHaveComments.length, 'nice_to_have_comments:', niceToHaveComments.length);
          console.log('[DEBUG] Nice-to-have comments:', niceToHaveComments);
          console.log('[DEBUG] Must-have skills:', extractedData.mustHaveSkills);
          console.log('[DEBUG] Nice-to-have skills:', extractedData.niceToHaveSkills);

          // Parse experience for saving
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
            }
          }

          // Convert education to proper format if it's a string
          let educationRequirements = null;
          if (extractedData.education) {
            if (typeof extractedData.education === 'string') {
              educationRequirements = { degree: extractedData.education };
            } else {
              educationRequirements = extractedData.education;
            }
          }

          // Call reformat endpoint with ALL parameters directly in the request
          // This ensures nice-to-have comments are passed to the AI
          const reformatParams = {
            must_have_skills: extractedData.mustHaveSkills,
            nice_to_have_skills: extractedData.niceToHaveSkills,
            must_have_comments: mustHaveComments,
            nice_to_have_comments: niceToHaveComments,
            experience_min: experienceMin,
            experience_max: experienceMax,
            education_requirements: educationRequirements,
            certifications: extractedData.certifications,
            coding_required: extractedData.codingRequired,
            supported_languages: extractedData.suggestedLanguages,
          };

          console.log('[DEBUG] Sending reformat request with params:', JSON.stringify(reformatParams, null, 2));

          const reformattedJD = await jdService.reformatWithParams(editingId, reformatParams);

          console.log('[DEBUG] Reformat successful, updated description length:', reformattedJD.description?.length);
          console.log('[DEBUG] Reformatted description preview (first 500 chars):', reformattedJD.description?.substring(0, 500));
          console.log('[DEBUG] Full reformatted JD:', reformattedJD.description);
          console.log('[DEBUG] JD contains "mongo db":', reformattedJD.description?.toLowerCase().includes('mongo'));
          console.log('[DEBUG] JD contains "neo4j":', reformattedJD.description?.toLowerCase().includes('neo4j'));
          console.log('[DEBUG] JD contains "postegres":', reformattedJD.description?.toLowerCase().includes('postegres') || reformattedJD.description?.toLowerCase().includes('postgres'));

          // Store the reformatted description for saving (React state is async)
          finalDescription = reformattedJD.description;

          // Update the description based on mode
          // For AI mode, update generatedJD
          // For manual mode, update manualJD so the formatted version shows in review
          if (mode === 'ai') {
            setGeneratedJD(reformattedJD.description);
          } else {
            setManualJD(reformattedJD.description);
          }

          toast.success({
            title: 'JD Reformatted',
            description: 'Job description has been regenerated with your changes.',
          });
        } else {
          console.error('[DEBUG] Cannot reformat - editingId is null. This should not happen in stage 2.');
          toast.warning({
            title: 'Cannot Reformat',
            description: 'JD not saved yet. Your changes will be included when saving.',
          });
        }
      } else {
        console.log('[DEBUG] No modifications, keeping original JD');
      }
    } catch (error) {
      console.error('[ERROR] Failed to reformat JD:', error);
      toast.warning({
        title: 'Formatting Warning',
        description: 'Could not reformat JD. Proceeding with current version.',
      });
    } finally {
      setIsRegenerating(false);
    }

    // Go to review step to show the reformatted summary
    setStep('review');
    setHasProceededToReview(true);  // Mark that user has proceeded to review (makes Stage 2 fields read-only)
    setHasFormattedForReview(true);  // Mark as formatted so we can skip on next "Next" click
    setExtractedDataModified(false);  // Reset modified flag after formatting

    // Save JD with creation_stage: 'review' so refresh preserves the stage
    try {
      // Parse experience for saving
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
          experienceMax = experienceMin + 5;
        } else {
          const singleMatch = extractedData.experience.match(/(\d+)/);
          if (singleMatch) {
            experienceMin = parseInt(singleMatch[1]);
            experienceMax = experienceMin + 2;
          }
        }
      }

      const jdData = {
        title: jobTitle.trim(),
        description: finalDescription,  // Use finalDescription to avoid React state async issues
        creation_stage: 'review' as const,
        creation_method: mode === 'ai' ? 'ai_generated' : 'manual' as const,
        ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
        must_have_skills: extractedData.mustHaveSkills,
        nice_to_have_skills: extractedData.niceToHaveSkills,
        must_have_comments: extractedData.mustHaveComments,
        nice_to_have_comments: extractedData.niceToHaveComments,
        education_requirements: extractedData.education ? { degree: extractedData.education } : undefined,
        experience_min: experienceMin,
        experience_max: experienceMax,
        industry_type: extractedData.industryType || undefined,
        salary_min: extractedData.salaryFrom ? parseInt(extractedData.salaryFrom.replace(/[^0-9]/g, '')) : undefined,
        salary_max: extractedData.salaryTo ? parseInt(extractedData.salaryTo.replace(/[^0-9]/g, '')) : undefined,
        compensation_type: extractedData.compensationType,
        employment_type: extractedData.employmentType,
        remote_type: extractedData.workModel,
        assessment_guidance: extractedData.assessmentGuidance || undefined,
        allow_overqualified: extractedData.allowOverqualified,
        certifications: extractedData.certifications,
        domain_keywords: extractedData.domainKeywords,
        // Coding assessment fields
        coding_required: extractedData.codingRequired,
        supported_languages: extractedData.suggestedLanguages,
        locations: extractedData.locations.map(loc => ({
          city: loc.city,
          radius_km: parseInt(loc.radius) || 50,
          is_required: extractedData.locationsRequired,
        })),
      };

      console.log('[TalentFlow] Saving JD at review stage with coding fields:', {
        coding_required: jdData.coding_required,
        supported_languages: jdData.supported_languages
      });

      let savedJd;
      let jdId = editingId;
      if (editingId) {
        savedJd = await jdService.update(editingId, jdData);
        console.log('[TalentFlow] JD updated with review stage, id:', editingId);
      } else {
        savedJd = await jdService.create(jdData);
        jdId = savedJd.id;
        setEditingId(savedJd.id);
        console.log('[TalentFlow] JD created with review stage:', savedJd.id);
      }

      // Always ensure URL has the JD ID
      if (jdId && !window.location.search.includes(`id=${jdId}`)) {
        const newUrl = `${window.location.pathname}?id=${jdId}`;
        window.history.replaceState({}, '', newUrl);
        console.log('[TalentFlow] URL updated with JD ID:', jdId);
      }
    } catch (saveError) {
      console.error('[TalentFlow] Failed to save review stage:', saveError);
      toast.error({
        title: 'Save Failed',
        description: 'Could not save progress. Your work may be lost on refresh.',
      });
    }
  };

  // Helper function to get experience label from master data
  const getExperienceLabel = (code: string): string => {
    if (!code) return 'Not specified';
    const level = experienceLevels.find(l => l.code === code);
    return level?.label || code.charAt(0).toUpperCase() + code.slice(1) + ' Level';
  };

  // Helper function to get education label from master data
  const getEducationLabel = (code: string): string => {
    if (!code) return 'Not specified';
    const level = educationLevels.find(l => l.code === code);
    return level?.label || code.charAt(0).toUpperCase() + code.slice(1).replace('-', ' ');
  };

  // Helper function to get industry label from master data
  const getIndustryLabel = (code: string): string => {
    if (!code) return 'Not specified';
    const industry = industryTypes.find(i => i.code === code);
    return industry?.label || code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ');
  };

  // JD12: Compute validation status for review screen
  const getValidationStatus = () => {
    const missingFields: string[] = [];

    if (extractedData.mustHaveSkills.length === 0) {
      missingFields.push('At least one Must-Have Skill');
    }

    // Must have at least one must-have comment
    if (extractedData.mustHaveComments.length === 0) {
      missingFields.push('At least one Must-Have Comment');
    }

    // Education is required - check for empty string, null, undefined, or whitespace only
    const educationValue = extractedData.education?.trim() || '';
    if (!educationValue) {
      missingFields.push('Education');
    }

    // Experience is required - check for empty string, null, undefined, or whitespace only
    const experienceValue = extractedData.experience?.trim() || '';
    if (!experienceValue) {
      missingFields.push('Experience');
    }

    // Industry Type is required - check for empty string, null, undefined, or whitespace only
    const industryValue = extractedData.industryType?.trim() || '';
    if (!industryValue) {
      missingFields.push('Industry Type');
    }

    // Validate salary range
    const salaryError = validateSalaryRange(extractedData.salaryFrom || '', extractedData.salaryTo || '');
    if (salaryError) {
      missingFields.push('Valid Salary Range (min must be less than max)');
    }

    // Debug logging
    console.log('[TalentFlow] Validation check:', {
      experience: experienceValue,
      education: educationValue,
      industryType: industryValue,
      isValid: missingFields.length === 0,
      missingFields
    });

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
        title: jobTitle.trim(),  // Trim spaces before saving
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
        nice_to_have_comments: extractedData.niceToHaveComments,
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
        ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
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
          title: jobTitle.trim(),
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

      // FIX-003: Call onSuccess in embedded mode
      if (isEmbedded && onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('[ERROR] Failed to publish JD:', error);
      setIsPublishing(false);

      // Check if this is a quota exceeded error
      const quotaError = error && typeof error === 'object' && 'response' in error
        ? error.response?.data?.detail
        : null;

      if (quotaError && (quotaError.error === 'QUOTA_EXHAUSTED' || quotaError.error === 'QUOTA_INSUFFICIENT')) {
        // Use handleQuotaError for quota errors
        handleQuotaError(error, router, 'Failed to publish job description');
      } else {
        // Use regular toast for non-quota errors
        toast.error({
          title: 'Failed to publish job description',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      }
    }
  };

  // Check if there's unsaved data worth saving
  const hasUnsavedData = () => {
    // Need at least 1 non-space character in job title
    return jobTitle.trim().length > 0;
  };

  // Handle back button click - auto save as draft if there's unsaved data
  const handleBackClick = async () => {
    // Prevent multiple clicks from creating multiple JDs
    if (isNavigatingBack || isSavingDraft) {
      console.log('[DEBUG] handleBackClick - already navigating or saving, ignoring click');
      return;
    }

    console.log('[DEBUG] handleBackClick called');
    console.log('[DEBUG] hasUnsavedData:', hasUnsavedData());
    console.log('[DEBUG] mode:', mode, 'jobTitle:', jobTitle, 'aiPrompt:', aiPrompt, 'generatedJD:', generatedJD?.substring(0, 50));
    console.log('[DEBUG] isPublished:', isPublished);

    setIsNavigatingBack(true);

    if (hasUnsavedData() && !isPublished) {
      console.log('[DEBUG] Saving draft before navigating back...');
      // Auto save as draft
      await handleSaveDraft();
      console.log('[DEBUG] Draft save completed, now navigating back');
    } else {
      console.log('[DEBUG] No unsaved data or already published, skipping save');
    }
    // Always navigate back after saving (or if no unsaved data)
    // FIX-003: In embedded mode, call onClose instead of onBack
    if (isEmbedded && onClose) {
      onClose();
    } else if (onBack) {
      onBack();
    }
  };

  // Handle "Save Draft" button in unsaved changes dialog
  const handleSaveAndNavigate = async () => {
    setShowUnsavedDialog(false);
    setIsNavigatingBack(true);

    // Save draft first
    await handleSaveDraft();

    // Then navigate to the stored URL
    if (pendingNavigation) {
      router.push(pendingNavigation);
    }

    setPendingNavigation(null);
    setIsNavigatingBack(false);
  };

  // Handle "Discard" button in unsaved changes dialog
  const handleDiscardAndNavigate = () => {
    setShowUnsavedDialog(false);
    setHasUnsavedChanges(false);

    // Navigate without saving
    if (pendingNavigation) {
      router.push(pendingNavigation);
    }

    setPendingNavigation(null);
  };

  // Handle dialog cancel (X button or clicking outside)
  const handleCancelDialog = () => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
  };

  // Handle cancel JD creation - delete draft and navigate away
  const handleCancelJD = () => {
    setShowCancelDialog(true);
  };

  // Confirm cancel and delete JD
  const confirmCancelJD = async () => {
    setIsCancelling(true);
    try {
      // Delete the JD if it exists (editingId means we have a draft saved)
      if (editingId) {
        await jdService.delete(editingId);
        toast.info('JD draft has been deleted');
      }
      // Navigate to job openings
      router.push('/recruitment/job-openings');
    } catch (error) {
      console.error('Failed to delete JD:', error);
      toast.error('Failed to delete JD');
    } finally {
      setIsCancelling(false);
      setShowCancelDialog(false);
    }
  };

  // Save JD as draft
  const handleSaveDraft = async () => {
    // Validate job title has at least 1 non-space character
    if (!jobTitle.trim()) {
      toast.warning({
        title: 'Cannot save draft',
        description: 'Please enter a job title',
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
        title: jobTitle.trim(),  // Trim spaces before saving
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
        nice_to_have_comments: extractedData.niceToHaveComments,
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
        ai_prompt: mode === 'ai' ? aiPrompt : undefined,  // Save AI prompt
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
      setHasUnsavedChanges(false); // Clear unsaved changes after successful save

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
    if (editingJD && !hasLoadedFromEditingJD.current) {
      // Only load from editingJD once on initial mount to prevent overwriting user edits
      hasLoadedFromEditingJD.current = true;

      console.log('[TalentFlow] Restoring JD state from editingJD:', {
        id: editingJD.id,
        title: editingJD.title,
        creation_stage: editingJD.creation_stage,
        creation_method: editingJD.creation_method,
        status: editingJD.status
      });

      // Use functional updates to preserve user edits if they exist
      setJobTitle(prev => prev || editingJD.title);
      setGeneratedJD(prev => prev || editingJD.description);

      // Populate AI prompt field with saved ai_prompt (not description)
      // Only set if current value is empty to avoid overwriting user edits
      if (editingJD.creation_method === 'ai_generated') {
        setAiPrompt(prev => prev || editingJD.ai_prompt || '');  // Preserve user edits
      } else if (editingJD.creation_method === 'manual') {
        setManualJD(prev => prev || editingJD.description || '');  // Preserve user edits
      }

      // Set lastExtractedJD to the loaded description so we can detect changes
      setLastExtractedJD(editingJD.description || '');

      setStep(editingJD.creation_stage);
      console.log('[TalentFlow] Set step to:', editingJD.creation_stage);

      // If already at review stage, mark as formatted to skip reformatting on next "Next" click
      // and mark as proceeded to review to make Stage 2 fields read-only
      if (editingJD.creation_stage === 'review') {
        setHasFormattedForReview(true);
        setHasProceededToReview(true);

        // Save original Stage 1 values so we can detect modifications if user goes back to Stage 1
        setOriginalStage1Values({
          jobTitle: editingJD.title || '',
          aiPrompt: editingJD.ai_prompt || '',
          generatedJD: editingJD.description || '',
          manualJD: editingJD.creation_method === 'manual' ? (editingJD.description || '') : ''
        });
      }

      // Restore the creation mode based on saved creation_method
      if (editingJD.creation_method) {
        setMode(editingJD.creation_method === 'ai_generated' ? 'ai' : 'manual');
      }

      // Load extracted data if:
      // 1. We're past the create step (draft JDs), OR
      // 2. It's a published JD (always has data regardless of stage)
      if (editingJD.creation_stage !== 'create' || editingJD.status === 'published') {
        // Calculate actual values first, then set Required based on whether value exists
        const educationValue = editingJD.education_requirements?.degree || '';

        // Map experience_min/max to level codes (entry, junior, mid, senior, architect, management)
        const mapExpToLevel = (min: number | null | undefined, max: number | null | undefined): string => {
          if (!min) return '';

          // 10+ years
          if (min >= 10) {
            // Check JD description for architect/management keywords
            const desc = (editingJD.description || '').toLowerCase();
            const isArchitect = desc.includes('architect') || desc.includes('architecture');
            const isManagement = desc.includes('manager') || desc.includes('management') || desc.includes('director') || desc.includes('lead');

            if (isArchitect && !isManagement) return 'architect';
            if (isManagement) return 'management';
            return 'senior';
          }

          // 7-10 years = Senior
          if (min >= 7) return 'senior';

          // 5-7 years = Mid
          if (min >= 5) return 'mid';

          // 2-4 years = Junior
          if (min >= 2) return 'junior';

          // 0-2 years = Entry
          return 'entry';
        };

        const experienceValue = mapExpToLevel(editingJD.experience_min, editingJD.experience_max);
        // Industry type should only come from extraction, not pre-filled from saved data
        // User must select it manually or it must come from extraction API
        const industryValue = '';

        console.log('[DEBUG] Loading editingJD data:');
        console.log('[DEBUG] - experience_min from API:', editingJD.experience_min);
        console.log('[DEBUG] - experience_max from API:', editingJD.experience_max);
        console.log('[DEBUG] - mapped experienceValue:', experienceValue);
        console.log('[DEBUG] - nice_to_have_comments from API:', editingJD.nice_to_have_comments);
        console.log('[DEBUG] - must_have_comments from API:', editingJD.must_have_comments);

        setExtractedData(prev => ({
          ...prev,
          mustHaveSkills: editingJD.must_have_skills || [],
          niceToHaveSkills: editingJD.nice_to_have_skills || [],
          education: educationValue,
          educationRequired: false,  // Default to false - user can enable if needed
          experience: experienceValue,
          experienceRequired: false,  // Default to false - user can enable if needed
          industryType: industryValue,
          industryTypeRequired: false,  // Default to false - user can enable if needed
          department: editingJD.department || '',
          salaryFrom: editingJD.salary_min?.toString() || '',
          salaryTo: editingJD.salary_max?.toString() || '',
          compensationType: (editingJD.compensation_type as 'hourly' | 'daily' | 'monthly' | 'yearly') || 'yearly',
          assessmentGuidance: editingJD.assessment_guidance || '',
          internalRecruiterComments: editingJD.internal_comments ? editingJD.internal_comments.split('\n').filter(c => c.trim()) : [],
          mustHaveComments: editingJD.must_have_comments || [],
          niceToHaveComments: editingJD.nice_to_have_comments || [],
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

  // FIX-003: Show loading state when fetching JD in embedded mode
  if (loadingJD) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-800 mx-auto mb-3" />
          <p className="text-gray-600">Loading job description...</p>
        </div>
      </div>
    );
  }

  return (
    <>
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
              {/* FIX-003: Show back/close button in both normal and embedded mode */}
              {(onBack || (isEmbedded && onClose)) && (
                <button
                  onClick={handleBackClick}
                  disabled={isNavigatingBack || isSavingDraft}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isNavigatingBack ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowLeft className="w-4 h-4" />
                  )}
                  {isNavigatingBack ? 'Saving...' : 'Back to Jobs'}
                </button>
              )}
            </div>
          </div>
          {renderStepIndicator()}

          {/* Warning banner when JD is in use */}
          {isJDInUse && (
            <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-800">This Job Description cannot be edited</p>
                  <p className="text-xs text-orange-700 mt-1">
                    {jdUsageMessage || 'This job description has been used in Resume Scoring, Assessments, or AI Talent Match and cannot be modified. Please create a new JD instead.'}
                  </p>
                </div>
              </div>
            </div>
          )}
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
                        disabled={isJDInUse}
                        className={`w-full px-4 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent ${
                          isJDInUse
                            ? 'bg-gray-100 cursor-not-allowed'
                            : jobTitle.length > 0 && !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-300'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length === 0 && `Job Title is required (min ${VALIDATION.JOB_TITLE.min} characters)`}
                          {jobTitle.length > 0 && jobTitle.length < VALIDATION.JOB_TITLE.min && `Min ${VALIDATION.JOB_TITLE.min} characters required (${VALIDATION.JOB_TITLE.min - jobTitle.length} more)`}
                        </p>
                        <p className={`text-xs ${getCharCountColor(jobTitle.length, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)}`}>
                          {jobTitle.length}/{VALIDATION.JOB_TITLE.max}
                        </p>
                      </div>
                      {/* JD07: Helper text for minimal prompt */}
                      {/* <p className="text-xs text-gray-500 mt-1">
                        Enter a job title or a minimal prompt – AI will generate the full JD
                      </p> */}
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-2">
                        AI Prompt – Quick Job Details {!editingId && <span className="text-red-500">*</span>}
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        maxLength={VALIDATION.AI_PROMPT.max}
                        placeholder={editingId ? "Add additional details or context to regenerate the job description..." : "Describe what you're looking for in this role... e.g., 'We need a senior full-stack developer with React and Node.js experience, 5+ years, remote position, who can lead a team of 3 developers'"}
                        rows={12}
                        disabled={isJDInUse}
                        className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent ${
                          isJDInUse
                            ? 'bg-gray-100 cursor-not-allowed'
                            : aiPrompt.length > 0 && !isValidLength(aiPrompt, VALIDATION.AI_PROMPT.min, VALIDATION.AI_PROMPT.max) && !editingId
                              ? 'border-orange-300 bg-orange-50'
                              : aiPrompt.length > VALIDATION.AI_PROMPT.max
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-300'
                        }`}
                      />
                      <div className="flex justify-between mt-1">
                        <p className={`text-xs ${aiPrompt.length < VALIDATION.AI_PROMPT.min && !editingId ? 'text-orange-500' : 'text-gray-500'}`}>
                          {!editingId && aiPrompt.length === 0 && `AI Prompt is required (min ${VALIDATION.AI_PROMPT.min} characters)`}
                          {!editingId && aiPrompt.length > 0 && aiPrompt.length < VALIDATION.AI_PROMPT.min && `Minimum ${VALIDATION.AI_PROMPT.min} characters required (${VALIDATION.AI_PROMPT.min - aiPrompt.length} more)`}
                          {editingId && aiPrompt.length === 0 && 'Optional: Add details to customize the regenerated JD'}
                        </p>
                        <p className={`text-xs ${aiPrompt.length > VALIDATION.AI_PROMPT.max ? 'text-red-500' : 'text-gray-500'}`}>
                          {aiPrompt.length}/{VALIDATION.AI_PROMPT.max}
                        </p>
                      </div>
                      {!editingId && (
                        <p className="text-xs text-gray-500 mt-1">
                          💡 Tip: Describe the role, team size, or any specific requirements
                        </p>
                      )}
                    </div>

                    {/* Quota Warning */}
                    {quotaChecked && !hasQuota && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800">Job Quota Exceeded</p>
                          <p className="text-xs text-red-600">
                            You have reached your maximum job posting limit.{' '}
                            <a href="/subscription" className="underline font-medium">Upgrade your plan</a> to create more jobs.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Warning when JD is in use */}
                    {isJDInUse && (
                      <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-orange-800">This JD cannot be edited</p>
                            <p className="text-xs text-orange-700 mt-1">
                              {jdUsageMessage || 'This job description has been used in Resume Scoring, Assessments, or AI Talent Match and cannot be modified. Please create a new JD instead.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleGenerateJD}
                      disabled={
                        isJDInUse ||
                        !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max) ||
                        (!editingId && !isValidLength(aiPrompt, VALIDATION.AI_PROMPT.min, VALIDATION.AI_PROMPT.max)) ||
                        aiPrompt.length > VALIDATION.AI_PROMPT.max ||
                        isGenerating ||
                        hasProceededToExtract
                      }
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gray-800 to-gray-800 text-white px-6 py-3 rounded-md hover:from-gray-700 hover:to-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Wand2 className="w-5 h-5" />
                      {isGenerating ? (
                        <span className="animate-pulse">Generating with AI...</span>
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
                        disabled={isJDInUse}
                        className={`w-full px-4 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent ${
                          isJDInUse
                            ? 'bg-gray-100 cursor-not-allowed'
                            : jobTitle.length > 0 && !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max)
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
                  isStreaming ? (
                    // Show streaming content in real-time
                    <div className="relative">
                      <div className="h-[600px] overflow-y-auto px-6 py-4 border border-gray-300 rounded-md bg-white markdown-content">
                        {generatedJD ? (
                          <>
                            <ReactMarkdown>{generatedJD}</ReactMarkdown>
                            <div className="flex items-center gap-2 mt-4 text-blue-600 border-t pt-4">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm font-medium">Generating...</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                              <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-600 animate-spin" />
                              <p className="text-gray-600 font-medium">AI is generating your job description...</p>
                              <p className="text-sm text-gray-500 mt-2">This may take a few seconds</p>
                            </div>
                          </div>
                        )}
                      </div>
                      {streamError && (
                        <div className="flex items-center gap-2 p-3 mt-2 bg-red-50 text-red-700 rounded-md border border-red-200">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm">{streamError}</span>
                        </div>
                      )}
                    </div>
                  ) : generatedJD ? (
                    <div className="relative">
                      {/* Toggle Edit/View Button */}
                      <div className="absolute top-2 right-2 z-10">
                        <button
                          onClick={() => {
                            if (isJDInUse) {
                              toast.error({
                                title: 'Cannot Edit Job Description',
                                description: jdUsageMessage || 'This job description has been used in Resume Scoring, Assessments, or AI Talent Match and cannot be modified. Please create a new JD instead.'
                              });
                              return;
                            }
                            setIsEditingJD(!isEditingJD);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            isJDInUse
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : isEditingJD
                                ? 'bg-gray-800 text-white hover:bg-gray-900'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                          title={isJDInUse ? 'This JD is in use and cannot be edited' : ''}
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
                          readOnly={isJDInUse}
                          className={`w-full h-[600px] px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent font-mono text-sm ${isJDInUse ? 'bg-gray-100 cursor-not-allowed' : ''}`}
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
                    <div className="h-[600px] overflow-y-auto px-6 py-4 border border-gray-300 rounded-md bg-white markdown-content">
                      <ReactMarkdown>{
                        // Auto-format common JD section headers to bold/headers
                        manualJD
                          // Convert ALL CAPS headers to markdown headers (like JOB DESCRIPTION, REQUIREMENTS, etc.)
                          .replace(/^([A-Z][A-Z\s\/&-]{2,})$/gm, (match) => `## ${match.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}`)
                          // Dynamically detect section headers: Title Case text on its own line
                          .replace(/^([A-Z][a-zA-Z]*(?:[\s&\/\-]+[A-Za-z()]+){0,6})\s*$/gm, (match, p1) => {
                            const trimmed = p1.trim();
                            const words = trimmed.split(/\s+/);
                            const wordCount = words.length;

                            // Skip if too long (likely a sentence)
                            if (wordCount > 6 || trimmed.length > 50) return match;

                            // Skip if starts with action verbs (likely a bullet point)
                            const actionVerbs = /^(Design|Develop|Write|Build|Create|Implement|Maintain|Manage|Lead|Work|Collaborate|Participate|Fix|Optimize|Test|Review|Ensure|Prepare|Provide|Support|Assist|Handle|Conduct|Perform|Execute|Analyze|Monitor|Strong|Good|Basic|Experience|Familiarity|Knowledge|Understanding|Ability|Hands-on|Exposure|Proficiency|Excellent|Proven|Demonstrated)/i;
                            if (actionVerbs.test(trimmed)) return match;

                            // Skip if contains lowercase words that aren't connectors (likely a sentence)
                            const connectors = ['&', 'and', 'or', 'of', 'to', 'for', 'the', 'a', 'an', 'in', 'on', 'with'];
                            const hasContentWords = words.some((w, i) => {
                              if (i === 0) return false; // Skip first word
                              const cleanWord = w.replace(/[()\/&-]/g, '').toLowerCase();
                              return cleanWord.length > 2 && /^[a-z]/.test(w) && !connectors.includes(cleanWord);
                            });
                            if (hasContentWords) return match;

                            // Looks like a header
                            return `## ${trimmed}`;
                          })
                      }</ReactMarkdown>
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

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-6">
              <button
                onClick={handleCancelJD}
                className="px-6 py-3 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNext}
                disabled={
                  isStreaming ||
                  isExtracting ||
                  !isValidLength(jobTitle, VALIDATION.JOB_TITLE.min, VALIDATION.JOB_TITLE.max) ||
                  (mode === 'ai' ? !generatedJD : !isValidLength(manualJD, VALIDATION.MANUAL_JD.min, VALIDATION.MANUAL_JD.max))
                }
                className="flex items-center gap-2 bg-gray-800 text-white px-8 py-3 rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStreaming ? 'Generating...' : isExtracting ? 'Extracting...' : 'Next'}
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

            {/* Regeneration Notice - Removed Regenerate JD button as per requirement */}
            {extractedDataModified && mode === 'ai' && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-blue-800 font-medium">Parameters Modified</h4>
                    <p className="text-sm text-blue-600">
                      You&apos;ve made changes to skills or comments. The JD will be regenerated when you continue to Review.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-gray-900 mb-6">Extracted Information</h2>
              <p className="text-sm text-gray-600 mb-6">
                {isRegenerating
                  ? 'Processing... Fields are temporarily read-only.'
                  : 'AI has extracted the following information from your JD. You can modify, add, or remove items.'
                }
              </p>

              {/* Read-only notice banner when processing */}
              {isRegenerating && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <p className="text-sm text-blue-800">
                    Fields are read-only while processing. Please wait...
                  </p>
                </div>
              )}

              {/* Skills & Comments Section - Single Row with 3 Columns */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                {/* Column 1: Must-Have Skills */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Must-Have Skills <span className="text-red-500">*</span></h3>
                    {!isRegenerating && (
                      <button
                        onClick={() => setEditingCategory('mustHave')}
                        className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    )}
                  </div>
                  {editingCategory === 'mustHave' && !isRegenerating && (
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
                        readOnly={isRegenerating}
                      />
                    ))}
                  </DroppableSkillsContainer>
                  {validationErrors.mustHaveSkills && (
                    <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.mustHaveSkills}
                    </p>
                  )}
                </div>

                {/* Column 2: Nice-to-Have Skills */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-900">Nice-to-Have Skills</h3>
                    {!isRegenerating && (
                      <button
                        onClick={() => setEditingCategory('niceToHave')}
                        className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    )}
                  </div>
                  {editingCategory === 'niceToHave' && !isRegenerating && (
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
                        readOnly={isRegenerating}
                      />
                    ))}
                  </DroppableSkillsContainer>
                </div>

                {/* Column 3: Comments (Split - Must-Have on top, Nice-to-Have below) */}
                <div className="space-y-6">
                  {/* Must-Have Comments */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-gray-900">Must-Have Comments <span className="text-red-500">*</span></h3>
                      {!isRegenerating && (
                        <button
                          onClick={() => setEditingCategory('comments')}
                          className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Add
                        </button>
                      )}
                    </div>
                    {editingCategory === 'comments' && !isRegenerating && (
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
                    <DroppableCommentsContainer
                      category="mustHaveComments"
                      onDrop={(comment, fromCategory) => handleDropComment(comment, fromCategory, 'mustHaveComments')}
                    >
                      {extractedData.mustHaveComments.map((comment, index) => (
                        <DraggableComment
                          key={index}
                          comment={comment}
                          index={index}
                          category="mustHaveComments"
                          onMove={handleMoveComment}
                          onRemove={handleRemoveCommentByCategory}
                          onStartEdit={handleStartEditCommentByCategory}
                          isEditing={editingCommentIndex === index}
                          editingValue={editingCommentValue}
                          onEditChange={setEditingCommentValue}
                          onSaveEdit={handleSaveEditComment}
                          onCancelEdit={handleCancelEditComment}
                          readOnly={isRegenerating}
                        />
                      ))}
                    </DroppableCommentsContainer>
                    {validationErrors.mustHaveComments && (
                      <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {validationErrors.mustHaveComments}
                      </p>
                    )}
                  </div>

                  {/* Nice-to-Have Comments */}
                  <div>
                    {console.log('[DEBUG] Rendering Nice-to-Have Comments, count:', extractedData.niceToHaveComments?.length, 'data:', extractedData.niceToHaveComments)}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-gray-900">Nice-to-Have Comments ({extractedData.niceToHaveComments?.length || 0})</h3>
                      {!isRegenerating && (
                        <button
                          onClick={() => setEditingCategory('nice-comments')}
                          className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Add
                        </button>
                      )}
                    </div>
                    {editingCategory === 'nice-comments' && !isRegenerating && (
                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddNiceComment()}
                          placeholder="Enter nice-to-have comment..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm"
                          autoFocus
                        />
                        <button
                          onClick={handleAddNiceComment}
                          className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
                        >
                          Add
                        </button>
                      </div>
                    )}
                    <DroppableCommentsContainer
                      category="niceToHaveComments"
                      onDrop={(comment, fromCategory) => handleDropComment(comment, fromCategory, 'niceToHaveComments')}
                    >
                      {(extractedData.niceToHaveComments || []).map((comment, index) => (
                        <DraggableComment
                          key={index}
                          comment={comment}
                          index={index}
                          category="niceToHaveComments"
                          onMove={handleMoveComment}
                          onRemove={handleRemoveCommentByCategory}
                          onStartEdit={handleStartEditCommentByCategory}
                          isEditing={editingNiceCommentIndex === index}
                          editingValue={editingNiceCommentValue}
                          onEditChange={setEditingNiceCommentValue}
                          onSaveEdit={handleSaveEditNiceComment}
                          onCancelEdit={handleCancelEditNiceComment}
                          readOnly={isRegenerating}
                        />
                      ))}
                    </DroppableCommentsContainer>
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
                    onChange={(e) => {
                      setExtractedData(prev => ({ ...prev, experience: e.target.value }));
                      // Clear validation error when user makes a selection
                      if (e.target.value) {
                        setValidationErrors(prev => ({ ...prev, experience: undefined }));
                      }
                    }}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm mb-3 ${
                      validationErrors.experience ? 'border-red-500' : 'border-gray-300'
                    } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={masterDataLoading || isRegenerating}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select experience level'}</option>
                    {experienceLevels.map((level) => (
                      <option key={level.id} value={level.code}>{level.label}</option>
                    ))}
                  </select>
                  {validationErrors.experience && (
                    <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.experience}
                    </p>
                  )}
                  <label className={`flex items-center gap-2 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.experienceRequired)}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, experienceRequired: e.target.checked }))}
                      className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-600"
                      disabled={isRegenerating}
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>

                {/* Education */}
                <div>
                  <h3 className="text-gray-900 mb-4">Education <span className="text-red-500">*</span></h3>
                  <select
                    value={extractedData.education}
                    onChange={(e) => {
                      setExtractedData(prev => ({ ...prev, education: e.target.value }));
                      // Clear validation error when user makes a selection
                      if (e.target.value) {
                        setValidationErrors(prev => ({ ...prev, education: undefined }));
                      }
                    }}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm mb-3 ${
                      validationErrors.education ? 'border-red-500' : 'border-gray-300'
                    } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={masterDataLoading || isRegenerating}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select education level'}</option>
                    {educationLevels.map((level) => (
                      <option key={level.id} value={level.code}>{level.label}</option>
                    ))}
                  </select>
                  {validationErrors.education && (
                    <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.education}
                    </p>
                  )}
                  <label className={`flex items-center gap-2 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.educationRequired)}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, educationRequired: e.target.checked }))}
                      className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-600"
                      disabled={isRegenerating}
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                </div>

                {/* Industry Type */}
                <div>
                  <h3 className="text-gray-900 mb-4">Industry Type <span className="text-red-500">*</span></h3>
                  <select
                    value={extractedData.industryType}
                    onChange={(e) => {
                      setExtractedData(prev => ({ ...prev, industryType: e.target.value }));
                      // Clear validation error when user makes a selection
                      if (e.target.value) {
                        setValidationErrors(prev => ({ ...prev, industryType: undefined }));
                      }
                    }}
                    className={`w-full px-3 py-2.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm mb-3 ${
                      validationErrors.industryType ? 'border-red-500' : 'border-gray-300'
                    } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={masterDataLoading || isRegenerating}
                  >
                    <option value="">{masterDataLoading ? 'Loading...' : 'Select industry type'}</option>
                    {industryTypes.map((type) => (
                      <option key={type.id} value={type.code}>{type.label}</option>
                    ))}
                  </select>
                  {validationErrors.industryType && (
                    <p className="text-red-500 text-sm mb-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {validationErrors.industryType}
                    </p>
                  )}
                  <label className={`flex items-center gap-2 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.industryTypeRequired)}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, industryTypeRequired: e.target.checked }))}
                      className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-600"
                      disabled={isRegenerating}
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
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
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setExtractedData(prev => ({ ...prev, salaryFrom: newValue }));
                          // Validate salary range
                          const error = validateSalaryRange(newValue, extractedData.salaryTo || '');
                          setValidationErrors(prev => ({ ...prev, salaryRange: error }));
                        }}
                        placeholder="From (e.g., 500000, 5L, 5LPA)"
                        className={`w-full pl-7 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm ${
                          validationErrors.salaryRange ? 'border-red-500' : 'border-gray-300'
                        } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        disabled={isRegenerating}
                        readOnly={isRegenerating}
                      />
                    </div>
                    <span className="text-gray-400">–</span>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                      <input
                        type="text"
                        value={extractedData.salaryTo || ''}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setExtractedData(prev => ({ ...prev, salaryTo: newValue }));
                          // Validate salary range
                          const error = validateSalaryRange(extractedData.salaryFrom || '', newValue);
                          setValidationErrors(prev => ({ ...prev, salaryRange: error }));
                        }}
                        placeholder="To (e.g., 1000000, 10L, 10LPA)"
                        className={`w-full pl-7 pr-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm ${
                          validationErrors.salaryRange ? 'border-red-500' : 'border-gray-300'
                        } ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        disabled={isRegenerating}
                        readOnly={isRegenerating}
                      />
                    </div>
                    <select
                      value={extractedData.compensationType}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, compensationType: e.target.value as 'hourly' | 'daily' | 'monthly' | 'yearly' }))}
                      className={`px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white text-sm ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      disabled={isRegenerating}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  {validationErrors.salaryRange && (
                    <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">!</span>
                      {validationErrors.salaryRange}
                    </p>
                  )}
                </div>
              </div>

              {/* Locations Section */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-gray-900">Locations</h3>
                  <label className={`flex items-center gap-1.5 ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={extractedData.locationsRequired}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, locationsRequired: e.target.checked }))}
                      className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-500"
                      disabled={isRegenerating}
                    />
                    <span className="text-gray-500 text-xs">(Required)</span>
                  </label>
                </div>

                {/* Inline Add Location - State, City, Radius in one line - Hidden when read-only */}
                {!isRegenerating && (
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
                )}

                {/* Added Locations Grid */}
                <div className="grid grid-cols-3 gap-4">
                  {extractedData.locations.map((location, index) => (
                    <div key={index} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">{location.city}</div>
                          <div className="text-xs text-gray-600">{location.radius} km radius</div>
                        </div>
                        {!isRegenerating && (
                          <button
                            onClick={() => handleRemoveLocation(index)}
                            className="text-red-600 hover:text-red-700 ml-2"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
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
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm bg-white ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={isRegenerating}
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
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm bg-white ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={isRegenerating}
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
                  <label className={`relative inline-flex items-center ${isRegenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.allowOverqualified)}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, allowOverqualified: e.target.checked }))}
                      className="sr-only peer"
                      disabled={isRegenerating}
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
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm resize-none ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    rows={4}
                    disabled={isRegenerating}
                    readOnly={isRegenerating}
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
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm resize-none ${isRegenerating ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    rows={4}
                    disabled={isRegenerating}
                    readOnly={isRegenerating}
                  />
                </div>
              </div>

            {/* Validation Warning Banner - Show when required fields are missing */}
            {!validationStatus.isValid && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-amber-800 font-medium">Cannot Proceed - Missing Required Fields</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Please complete the following before publishing:
                    </p>
                    <ul className="text-sm text-amber-700 mt-2 list-disc list-inside">
                      {validationStatus.missingFields.map((field, index) => (
                        <li key={index}>{field}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-8">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep('create');
                    setHasProceededToExtract(false);  // Re-enable regenerate button when going back
                  }}
                  className="px-8 py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCancelJD}
                  className="px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <button
                onClick={handlePublish}
                disabled={isRegenerating || !validationStatus.isValid}
                className="flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={!validationStatus.isValid ? `Missing: ${validationStatus.missingFields.join(', ')}` : ''}
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
                    Next
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
                  {/* Job Title & Quick Info */}
                  <div className="mb-6 pb-6 border-b border-gray-200">
                    <h1 className="text-3xl text-gray-900 mb-3">{jobTitle}</h1>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                      {extractedData.locations.length > 0 && extractedData.locations[0].city && (
                        <span className="flex items-center gap-1">📍 {extractedData.locations[0].city}</span>
                      )}
                      {extractedData.experience && (
                        <span className="flex items-center gap-1">⏱️ {getExperienceLabel(extractedData.experience)}</span>
                      )}
                      {extractedData.education && (
                        <span className="flex items-center gap-1">🎓 {getEducationLabel(extractedData.education)}</span>
                      )}
                      {extractedData.employmentType && (
                        <span className="flex items-center gap-1">💼 {extractedData.employmentType === 'full_time' ? 'Full Time' : extractedData.employmentType === 'part_time' ? 'Part Time' : extractedData.employmentType === 'contract' ? 'Contract' : extractedData.employmentType}</span>
                      )}
                      {extractedData.workModel && (
                        <span className="flex items-center gap-1">🏢 {extractedData.workModel === 'onsite' ? 'On-site' : extractedData.workModel === 'remote' ? 'Remote' : extractedData.workModel === 'hybrid' ? 'Hybrid' : extractedData.workModel}</span>
                      )}
                    </div>
                    {(extractedData.salaryFrom || extractedData.salaryTo) && (
                      <div className="mt-3 text-sm text-green-700 font-medium">
                        💰 ₹{extractedData.salaryFrom ? parseInt(extractedData.salaryFrom).toLocaleString('en-IN') : '0'} - ₹{extractedData.salaryTo ? parseInt(extractedData.salaryTo).toLocaleString('en-IN') : '0'} / {extractedData.compensationType}
                      </div>
                    )}
                  </div>

                  {/* JD Content */}
                  <div className="markdown-content text-gray-700 leading-relaxed">
                    {console.log('[DEBUG] Review stage showing JD, mode:', mode, 'length:', (mode === 'ai' ? generatedJD : manualJD)?.length)}
                    <ReactMarkdown>
                      {(mode === 'ai' ? generatedJD : manualJD)
                        .replace(/#+\s*Certifications[\s\S]*?(?=\n#|\n\n#|$)/gi, (match) =>
                          match.toLowerCase().includes('none') || match.toLowerCase().includes('not required') || match.toLowerCase().includes('n/a') || match.trim().match(/^#+\s*Certifications\s*$/im) ? '' : match
                        )
                        .replace(/\*\*Certifications\*\*[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
                        .replace(/Certifications[:\s]*(?:None|None required|N\/A|Not required)\.?\s*/gi, '')
                      }
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
                <div className="grid grid-cols-2 gap-6">
                  {/* Left Column: Skills */}
                  <div className="space-y-6">
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
                  </div>

                  {/* Right Column: Comments */}
                  <div className="space-y-6">
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

                    {/* Nice-to-Have Comments */}
                    {(extractedData.niceToHaveComments || []).length > 0 && (
                      <div>
                        <h4 className="text-sm text-gray-700 mb-3">Nice-to-Have Comments ({(extractedData.niceToHaveComments || []).length})</h4>
                        <div className="space-y-2">
                          {(extractedData.niceToHaveComments || []).map((comment, index) => (
                            <div key={index} className="flex items-start gap-2 text-sm text-gray-600">
                              <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                              <span>{comment}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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
                    <p className="text-gray-900">{getExperienceLabel(extractedData.experience)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {extractedData.experienceRequired ? '✓ Required' : '○ Preferred'}
                    </p>
                  </div>

                  {/* Education */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm text-gray-600 mb-2">Education</h4>
                    <p className="text-gray-900">{getEducationLabel(extractedData.education)}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {extractedData.educationRequired ? '✓ Required' : '○ Preferred'}
                    </p>
                  </div>

                  {/* Industry Type - Only show if specified */}
                  {extractedData.industryType && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-sm text-gray-600 mb-2">Industry Type</h4>
                      <p className="text-gray-900">{getIndustryLabel(extractedData.industryType)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {extractedData.industryTypeRequired ? '✓ Required' : '○ Preferred'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

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
                {/* Cancel button - delete JD and return to JD List */}
                <button
                  onClick={handleCancelJD}
                  className="px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="flex gap-3">
                {/* JD12: Save as Draft button */}
                <button
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isJDInUse}
                  title={isJDInUse ? 'This JD is in use and cannot be modified' : ''}
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
                  disabled={isPublishing || !validationStatus.isValid || isJDInUse}
                  className={`flex items-center gap-2 px-8 py-3 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    validationStatus.isValid && !isJDInUse
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-300 text-gray-500'
                  }`}
                  title={isJDInUse ? 'This JD is in use and cannot be modified' : !validationStatus.isValid ? 'Complete all required fields to publish' : ''}
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

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={(open) => !open && handleCancelDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Would you like to save them as a draft before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={handleDiscardAndNavigate}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Discard Changes
            </button>
            <button
              onClick={handleSaveAndNavigate}
              disabled={isSavingDraft}
              className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSavingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Draft'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel JD Creation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={(open) => !open && setShowCancelDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel JD Creation?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel? {editingId ? 'This will delete the current draft and all your progress will be lost.' : 'All your progress will be lost.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setShowCancelDialog(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Continue Editing
            </button>
            <button
              onClick={confirmCancelJD}
              disabled={isCancelling}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Yes, Cancel'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
