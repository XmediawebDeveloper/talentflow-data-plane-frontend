'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, ChevronDown, ChevronUp, Tag, Clock, Filter, X, Save, AlertCircle, MessageSquare, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import api from '@/lib/services/api';
import { toast } from '@/components/ui/enhanced-toast';
import { useAuth } from '@/lib/hooks/useAuth';
import ListPagination from '@/components/ListPagination';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

// Question categories for HR round
const HR_CATEGORIES = [
  'Communication Skills',
  'Team Collaboration',
  'Problem Solving',
  'Leadership',
  'Conflict Resolution',
  'Work Ethics',
  'Culture Fit',
  'Salary Discussion',
  'Career Goals',
  'Adaptability',
  'Time Management',
  'Stress Management',
];

interface HRQuestion {
  id: string;
  question_text: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question_type: 'behavioral' | 'situational' | 'competency';
  answer_type: 'text' | 'yes_no';
  correct_answer?: 'Yes' | 'No';  // Only for yes_no questions
  expected_answer_points: string[];
  evaluation_criteria: string;
  time_minutes: number;
  is_active: boolean;
  created_at?: string;
}

const EMPTY_QUESTION: Omit<HRQuestion, 'id' | 'created_at'> = {
  question_text: '',
  category: 'Communication Skills',
  difficulty: 'medium',
  question_type: 'behavioral',
  answer_type: 'text',
  correct_answer: undefined,
  expected_answer_points: [''],
  evaluation_criteria: '',
  time_minutes: 3,
  is_active: true,
};

const DEFAULT_HR_QUESTIONS: HRQuestion[] = [
  {
    id: 'default-1',
    question_text: 'Tell me about yourself',
    category: 'Communication Skills',
    difficulty: 'easy',
    question_type: 'behavioral',
    answer_type: 'text',
    expected_answer_points: ['Brief professional background', 'Key skills relevant to the role', 'Career motivation and goals'],
    evaluation_criteria: 'Clear, concise self-introduction that highlights relevant experience and shows confidence',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-2',
    question_text: 'Describe your industry experience relevant to this role',
    category: 'Communication Skills',
    difficulty: 'medium',
    question_type: 'competency',
    answer_type: 'text',
    expected_answer_points: ['Relevant industry background', 'Specific projects or achievements', 'How experience applies to this role'],
    evaluation_criteria: 'Clearly connects past industry experience to the current role requirements, provides specific examples',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-3',
    question_text: 'Why should we hire you?',
    category: 'Career Goals',
    difficulty: 'medium',
    question_type: 'competency',
    answer_type: 'text',
    expected_answer_points: ['Unique value proposition', 'Relevant skills and experience', 'Enthusiasm for the role'],
    evaluation_criteria: 'Clearly articulates what sets them apart, connects their skills to job requirements',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-4',
    question_text: 'What is your expected salary?',
    category: 'Salary Discussion',
    difficulty: 'medium',
    question_type: 'behavioral',
    answer_type: 'text',
    expected_answer_points: ['Research-backed salary range', 'Justification based on experience', 'Openness to negotiation'],
    evaluation_criteria: 'Provides a reasonable range based on market research, shows professional approach to compensation',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-5',
    question_text: 'Are you willing to relocate?',
    category: 'Adaptability',
    difficulty: 'easy',
    question_type: 'behavioral',
    answer_type: 'yes_no',
    correct_answer: 'Yes',
    expected_answer_points: ['Clear yes/no answer', 'Flexibility and openness', 'Any conditions or preferences'],
    evaluation_criteria: 'Direct and honest response, shows flexibility if applicable to the role',
    time_minutes: 1,
    is_active: true,
  },
  {
    id: 'default-6',
    question_text: 'Are you available for onsite work?',
    category: 'Adaptability',
    difficulty: 'easy',
    question_type: 'behavioral',
    answer_type: 'yes_no',
    correct_answer: 'Yes',
    expected_answer_points: ['Clear yes/no answer', 'Preference for work mode', 'Flexibility for hybrid/onsite'],
    evaluation_criteria: 'Direct response about onsite availability, shows flexibility if role requires it',
    time_minutes: 1,
    is_active: true,
  },
  {
    id: 'default-7',
    question_text: 'Can you work under pressure?',
    category: 'Stress Management',
    difficulty: 'medium',
    question_type: 'situational',
    answer_type: 'yes_no',
    correct_answer: 'Yes',
    expected_answer_points: ['Clear yes/no with examples', 'Strategies for handling pressure', 'Past experience under deadlines'],
    evaluation_criteria: 'Provides real examples of working under pressure, shows resilience and coping strategies',
    time_minutes: 1,
    is_active: true,
  },
  {
    id: 'default-8',
    question_text: 'Are you comfortable working in a team?',
    category: 'Team Collaboration',
    difficulty: 'easy',
    question_type: 'behavioral',
    answer_type: 'yes_no',
    correct_answer: 'Yes',
    expected_answer_points: ['Clear yes/no answer', 'Examples of teamwork', 'Collaboration style'],
    evaluation_criteria: 'Shows willingness to collaborate, provides examples of successful teamwork',
    time_minutes: 1,
    is_active: true,
  },
  {
    id: 'default-9',
    question_text: 'Are you open to learning new technologies?',
    category: 'Adaptability',
    difficulty: 'easy',
    question_type: 'behavioral',
    answer_type: 'yes_no',
    correct_answer: 'Yes',
    expected_answer_points: ['Clear yes/no answer', 'Examples of self-learning', 'Enthusiasm for growth'],
    evaluation_criteria: 'Shows growth mindset and willingness to upskill, provides examples if possible',
    time_minutes: 1,
    is_active: true,
  },
  {
    id: 'default-10',
    question_text: 'Can you join immediately or within notice period?',
    category: 'Adaptability',
    difficulty: 'easy',
    question_type: 'behavioral',
    answer_type: 'yes_no',
    correct_answer: 'Yes',
    expected_answer_points: ['Clear availability date', 'Notice period details', 'Flexibility if needed'],
    evaluation_criteria: 'Provides specific timeline, honest about notice period obligations',
    time_minutes: 1,
    is_active: true,
  },
];

export default function HRQuestionBank() {
  const { user, isTenantAdmin } = useAuth();
  const canViewHRQuestionBank = isTenantAdmin || !!user?.permissions?.canViewHRQuestionBank;
  const canCreateHRQuestionBank = isTenantAdmin || !!user?.permissions?.canCreateHRQuestionBank;
  const canUpdateHRQuestionBank = isTenantAdmin || !!user?.permissions?.canUpdateHRQuestionBank;
  const canDeleteHRQuestionBank = isTenantAdmin || !!user?.permissions?.canDeleteHRQuestionBank;
  const [questions, setQuestions] = useState<HRQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  // Stat-card filter: click a card to show only that answer type.
  const [answerTypeFilter, setAnswerTypeFilter] = useState<'all' | 'text' | 'yes_no'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_QUESTION);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Persist + restore the list's scroll position and view state so returning
  // from a detail page lands the user exactly where they left off.
  const rootRef = useScrollRestoration<HTMLElement>('hr-question-bank', !loading);
  useListStatePersistence(
    'hr-question-bank',
    { searchQuery, filterCategory, filterDifficulty, answerTypeFilter, currentPage, itemsPerPage },
    (s) => {
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterCategory === 'string') setFilterCategory(s.filterCategory);
      if (typeof s.filterDifficulty === 'string') setFilterDifficulty(s.filterDifficulty);
      if (s.answerTypeFilter === 'all' || s.answerTypeFilter === 'text' || s.answerTypeFilter === 'yes_no') {
        setAnswerTypeFilter(s.answerTypeFilter);
      }
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategory, filterDifficulty, answerTypeFilter]);

  // Load questions from API
  useEffect(() => {
    if (canViewHRQuestionBank) {
      loadQuestions();
    } else {
      setLoading(false);
    }
  }, [canViewHRQuestionBank]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const response = await api.get('/hr-question-bank');
      const data = response.data || [];
      // Map backend fields to frontend format
      const mapped = data.map((q: any) => ({
        id: q.id,
        question_text: q.question_text,
        category: 'HR',
        difficulty: 'easy' as const,
        question_type: 'behavioral' as const,
        answer_type: q.answer_type || 'text',
        correct_answer: q.correct_answer,
        expected_answer_points: [],
        evaluation_criteria: '',
        time_minutes: q.answer_type === 'yes_no' ? 1 : 3,
        is_active: q.is_active ?? true,
        created_at: q.created_at,
      }));
      setQuestions(mapped.length > 0 ? mapped : DEFAULT_HR_QUESTIONS);
    } catch (error: any) {
      console.log('[HRQuestionBank] API error, loading defaults:', error?.message);
      setQuestions(DEFAULT_HR_QUESTIONS);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.question_text.trim()) {
      toast.error({ title: 'Question text is required' });
      return;
    }
    const cleanedPoints = formData.expected_answer_points.filter(p => p.trim() !== '');

    setSaving(true);
    try {
      const apiPayload = {
        question_text: formData.question_text,
        answer_type: formData.answer_type,
        correct_answer: formData.answer_type === 'yes_no' ? (formData.correct_answer || 'Yes') : null,
      };

      if (editingId) {
        await api.put(`/hr-question-bank/${editingId}`, apiPayload);
        toast.success({ title: 'Question updated' });
      } else {
        await api.post('/hr-question-bank', apiPayload);
        toast.success({ title: 'Question added to bank' });
      }

      setShowAddForm(false);
      setEditingId(null);
      setFormData(EMPTY_QUESTION);
      await loadQuestions(); // Reload from API
    } catch (error: any) {
      toast.error({ title: 'Failed to save question', description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await api.delete(`/hr-question-bank/${id}`);
      toast.success({ title: 'Question deleted' });
      await loadQuestions(); // Reload from API
    } catch (error: any) {
      if (error?.response?.status === 400) {
        toast.error({ title: 'Cannot delete default questions' });
      } else {
        toast.error({ title: 'Failed to delete question' });
      }
    }
  };

  const handleEdit = (question: HRQuestion) => {
    setFormData({
      question_text: question.question_text,
      category: question.category,
      difficulty: question.difficulty,
      question_type: question.question_type,
      answer_type: question.answer_type || 'text',
      correct_answer: question.correct_answer,
      expected_answer_points: question.expected_answer_points.length > 0 ? question.expected_answer_points : [''],
      evaluation_criteria: question.evaluation_criteria,
      time_minutes: question.time_minutes,
      is_active: question.is_active,
    });
    setEditingId(question.id);
    setShowAddForm(true);
  };

  const addAnswerPoint = () => {
    setFormData(prev => ({
      ...prev,
      expected_answer_points: [...prev.expected_answer_points, ''],
    }));
  };

  const removeAnswerPoint = (index: number) => {
    setFormData(prev => ({
      ...prev,
      expected_answer_points: prev.expected_answer_points.filter((_, i) => i !== index),
    }));
  };

  const updateAnswerPoint = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      expected_answer_points: prev.expected_answer_points.map((p, i) => i === index ? value : p),
    }));
  };

  // Filter questions
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = !searchQuery || q.question_text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAnswerType =
      answerTypeFilter === 'all' ||
      (answerTypeFilter === 'yes_no' ? q.answer_type === 'yes_no' : q.answer_type !== 'yes_no');
    return matchesSearch && matchesAnswerType;
  });

  const paginatedQuestions = filteredQuestions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'hard': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'behavioral': return 'bg-blue-100 text-blue-700';
      case 'situational': return 'bg-purple-100 text-purple-700';
      case 'competency': return 'bg-indigo-100 text-indigo-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="w-full p-4 md:p-8 bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'HR Question Bank' },
            ]}
          />
          <div className="space-y-5">
      {!canViewHRQuestionBank ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          You do not have permission to view the HR Question Bank.
        </div>
      ) : (
        <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">HR Question Bank</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Manage reusable HR questions for assessments. These questions can be used across multiple assessments.
            </p>
          </div>
        </div>
        {canCreateHRQuestionBank && (
          <button
            onClick={() => { setShowAddForm(true); setEditingId(null); setFormData(EMPTY_QUESTION); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-sm font-medium shrink-0 transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-brand-cyan/30 bg-gradient-to-r from-brand-cyan/5 to-brand-blue/5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue text-white shadow-sm shrink-0">
          <AlertCircle className="w-4 h-4" />
        </div>
        <p className="text-xs text-gray-700 leading-relaxed pt-1">
          HR questions are <strong className="text-gray-900">informational only</strong> — not scored. Responses are shared with the recruiter for review. Only Technical and Coding questions are marked.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search questions..."
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-gray-900 bg-white shadow-sm transition-all"
        />
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (editingId ? canUpdateHRQuestionBank : canCreateHRQuestionBank) && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 bg-brand-blue text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm ring-1 ring-white/25">
                {editingId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <h3 className="text-sm font-semibold">
                {editingId ? 'Edit Question' : 'Add New Question'}
              </h3>
            </div>
            <button
              onClick={() => { setShowAddForm(false); setEditingId(null); setFormData(EMPTY_QUESTION); }}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors ring-1 ring-white/25"
             aria-label="Close">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Question Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Question Text *</label>
              <input
                type="text"
                value={formData.question_text}
                onChange={(e) => setFormData(prev => ({ ...prev, question_text: e.target.value }))}
                placeholder="Enter the HR question..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-gray-900 bg-white transition-all"
              />
            </div>

            {/* Answer Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Answer Type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, answer_type: 'text', time_minutes: 3 }))}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    formData.answer_type === 'text'
                      ? 'border-brand-cyan bg-gradient-to-br from-brand-cyan/10 to-brand-blue/5 text-brand-blue shadow-sm shadow-brand-cyan/20 ring-1 ring-brand-cyan/30'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-brand-cyan/40 hover:bg-brand-cyan/5'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Text Answer (3 min)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, answer_type: 'yes_no', time_minutes: 1 }))}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    formData.answer_type === 'yes_no'
                      ? 'border-brand-orange bg-gradient-to-br from-brand-orange/10 to-brand-orange/5 text-brand-orange-deep shadow-sm shadow-brand-orange/20 ring-1 ring-brand-orange/30'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-brand-orange/40 hover:bg-brand-orange/5'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Yes / No (1 min)
                </button>
              </div>
            </div>

            {/* Correct Answer - Only for Yes/No questions */}
            {formData.answer_type === 'yes_no' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Correct Answer *</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, correct_answer: 'Yes' }))}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      formData.correct_answer === 'Yes'
                        ? 'border-green-500 bg-green-50 text-green-700 shadow-sm ring-1 ring-green-500/30'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-green-300 hover:bg-green-50/50'
                    }`}
                  >
                    Yes is correct
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, correct_answer: 'No' }))}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      formData.correct_answer === 'No'
                        ? 'border-green-500 bg-green-50 text-green-700 shadow-sm ring-1 ring-green-500/30'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-green-300 hover:bg-green-50/50'
                    }`}
                  >
                    No is correct
                  </button>
                </div>
              </div>
            )}

            {/* Save / Cancel */}
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => { setShowAddForm(false); setEditingId(null); setFormData(EMPTY_QUESTION); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : editingId ? 'Update Question' : 'Save Question'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setAnswerTypeFilter('all')}
          aria-pressed={answerTypeFilter === 'all'}
          className={`text-left bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${
            answerTypeFilter === 'all'
              ? 'border-brand-blue ring-2 ring-brand-blue/30'
              : 'border-gray-200 hover:border-brand-blue/30'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Questions</p>
              <p className="text-xl font-semibold text-gray-900 leading-tight tracking-tight">{questions.length}</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setAnswerTypeFilter(prev => (prev === 'text' ? 'all' : 'text'))}
          aria-pressed={answerTypeFilter === 'text'}
          className={`text-left bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${
            answerTypeFilter === 'text'
              ? 'border-brand-cyan ring-2 ring-brand-cyan/30'
              : 'border-gray-200 hover:border-brand-cyan/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue text-white shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Text Answer</p>
              <p className="text-xl font-semibold text-gray-900 leading-tight tracking-tight">{questions.filter(q => q.answer_type !== 'yes_no').length}</p>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setAnswerTypeFilter(prev => (prev === 'yes_no' ? 'all' : 'yes_no'))}
          aria-pressed={answerTypeFilter === 'yes_no'}
          className={`text-left bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${
            answerTypeFilter === 'yes_no'
              ? 'border-brand-orange ring-2 ring-brand-orange/30'
              : 'border-gray-200 hover:border-brand-orange/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-orange text-white shadow-sm shadow-brand-orange/25 ring-1 ring-white/10">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Yes / No</p>
              <p className="text-xl font-semibold text-gray-900 leading-tight tracking-tight">{questions.filter(q => q.answer_type === 'yes_no').length}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Question List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
          <p className="text-gray-500 text-sm">Loading questions...</p>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/20 mb-4">
            <AlertCircle className="w-7 h-7 text-brand-blue" />
          </div>
          <p className="text-gray-700 text-sm font-medium mb-1">
            {questions.length === 0 ? 'No questions yet' : 'No matches found'}
          </p>
          <p className="text-gray-500 text-xs text-center max-w-md">
            {questions.length === 0 ? 'Add your first HR question to start building the bank.' : 'Try adjusting your search to find what you need.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedQuestions.map((question) => (
            <div
              key={question.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-brand-blue/40 hover:shadow-md hover:shadow-brand-blue/5 transition-all"
            >
              {/* Question Header */}
              <div className="flex items-start gap-3 p-4">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 mt-0.5 shadow-sm ring-1 ring-white/10 ${
                  question.answer_type === 'yes_no'
                    ? 'bg-brand-orange text-white shadow-brand-orange/20'
                    : 'bg-gradient-to-br from-brand-cyan to-brand-blue text-white shadow-brand-cyan/20'
                }`}>
                  {question.answer_type === 'yes_no' ? <CheckCircle2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-relaxed">{question.question_text}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${
                      question.answer_type === 'yes_no'
                        ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                        : 'bg-brand-cyan/10 text-brand-blue ring-brand-cyan/20'
                    }`}>
                      {question.answer_type === 'yes_no' ? 'Yes / No' : 'Text Answer'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                      Not Scored
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 ring-1 ring-gray-200">
                      <Clock className="w-3 h-3" />
                      {question.time_minutes} min
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canUpdateHRQuestionBank && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(question); }}
                      className="p-2 text-gray-400 hover:text-brand-blue rounded-lg hover:bg-brand-blue/10 transition-colors"
                      aria-label="Edit question" title="Edit question"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {canDeleteHRQuestionBank && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(question.id); }}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      aria-label="Delete question" title="Delete question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ListPagination
        currentPage={currentPage}
        itemsPerPage={itemsPerPage}
        totalItems={filteredQuestions.length}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
        itemLabel="questions"
      />
        </>
      )}
          </div>
        </div>
      </div>
    </main>
  );
}
