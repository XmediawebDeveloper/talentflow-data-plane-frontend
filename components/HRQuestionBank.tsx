'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, ChevronDown, ChevronUp, Tag, Clock, Filter, X, Save, AlertCircle } from 'lucide-react';
import api from '@/lib/services/api';
import { toast } from '@/components/ui/enhanced-toast';

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
    expected_answer_points: ['Clear availability date', 'Notice period details', 'Flexibility if needed'],
    evaluation_criteria: 'Provides specific timeline, honest about notice period obligations',
    time_minutes: 1,
    is_active: true,
  },
];

export default function HRQuestionBank() {
  const [questions, setQuestions] = useState<HRQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_QUESTION);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load questions from API
  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const response = await api.get('/assessments/hr-question-bank');
      const data = response.data || [];
      // If API returns data, use it; otherwise fall back to defaults
      setQuestions(data.length > 0 ? data : DEFAULT_HR_QUESTIONS);
    } catch (error: any) {
      // If API doesn't exist yet, use default questions
      console.log('[HRQuestionBank] API not available yet, loading default questions');
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
      const payload = { ...formData, expected_answer_points: cleanedPoints };

      if (editingId) {
        await api.put(`/assessments/hr-question-bank/${editingId}`, payload);
        setQuestions(prev => prev.map(q => q.id === editingId ? { ...q, ...payload } : q));
        toast.success({ title: 'Question updated' });
      } else {
        const response = await api.post('/assessments/hr-question-bank', payload);
        const newQuestion = response.data || { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        setQuestions(prev => [newQuestion, ...prev]);
        toast.success({ title: 'Question added to bank' });
      }

      setShowAddForm(false);
      setEditingId(null);
      setFormData(EMPTY_QUESTION);
    } catch (error: any) {
      // If API doesn't exist, save locally
      if (error?.response?.status === 404) {
        const newQuestion: HRQuestion = {
          ...formData,
          expected_answer_points: cleanedPoints,
          id: editingId || crypto.randomUUID(),
          created_at: new Date().toISOString(),
        };
        if (editingId) {
          setQuestions(prev => prev.map(q => q.id === editingId ? newQuestion : q));
        } else {
          setQuestions(prev => [newQuestion, ...prev]);
        }
        toast.success({ title: editingId ? 'Question updated (local)' : 'Question added (local)' });
        setShowAddForm(false);
        setEditingId(null);
        setFormData(EMPTY_QUESTION);
      } else {
        toast.error({ title: 'Failed to save question', description: error?.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await api.delete(`/assessments/hr-question-bank/${id}`);
    } catch {
      // API may not exist yet
    }
    setQuestions(prev => prev.filter(q => q.id !== id));
    toast.success({ title: 'Question deleted' });
  };

  const handleEdit = (question: HRQuestion) => {
    setFormData({
      question_text: question.question_text,
      category: question.category,
      difficulty: question.difficulty,
      question_type: question.question_type,
      answer_type: question.answer_type || 'text',
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
    return !searchQuery || q.question_text.toLowerCase().includes(searchQuery.toLowerCase());
  });

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">HR Question Bank</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage reusable HR questions for assessments. These questions can be used across multiple assessments.
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setEditingId(null); setFormData(EMPTY_QUESTION); }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Question
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search questions..."
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
        />
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingId ? 'Edit Question' : 'Add New Question'}
            </h3>
            <button onClick={() => { setShowAddForm(false); setEditingId(null); setFormData(EMPTY_QUESTION); }}>
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </button>
          </div>

          {/* Question Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question Text *</label>
            <input
              type="text"
              value={formData.question_text}
              onChange={(e) => setFormData(prev => ({ ...prev, question_text: e.target.value }))}
              placeholder="Enter the HR question..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
            />
          </div>

          {/* Answer Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Answer Type</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, answer_type: 'text', time_minutes: 3 }))}
                className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  formData.answer_type === 'text'
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}
              >
                Text Answer (3 min)
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, answer_type: 'yes_no', time_minutes: 1 }))}
                className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  formData.answer_type === 'yes_no'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}
              >
                Yes / No (1 min)
              </button>
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => { setShowAddForm(false); setEditingId(null); setFormData(EMPTY_QUESTION); }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : editingId ? 'Update Question' : 'Save Question'}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Total Questions</p>
          <p className="text-xl font-semibold text-gray-900">{questions.length}</p>
        </div>
        <div className="bg-white border border-teal-200 rounded-lg p-3">
          <p className="text-xs text-teal-600">Text Answer</p>
          <p className="text-xl font-semibold text-teal-700">{questions.filter(q => q.answer_type !== 'yes_no').length}</p>
        </div>
        <div className="bg-white border border-orange-200 rounded-lg p-3">
          <p className="text-xs text-orange-600">Yes / No</p>
          <p className="text-xl font-semibold text-orange-700">{questions.filter(q => q.answer_type === 'yes_no').length}</p>
        </div>
      </div>

      {/* Question List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading questions...</div>
      ) : filteredQuestions.length === 0 ? (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {questions.length === 0 ? 'No questions in the bank yet. Add your first HR question.' : 'No questions match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestions.map((question) => (
            <div
              key={question.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors"
            >
              {/* Question Header */}
              <div className="flex items-start gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-relaxed">{question.question_text}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      question.answer_type === 'yes_no'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-teal-100 text-teal-700'
                    }`}>
                      {question.answer_type === 'yes_no' ? 'Yes / No' : 'Text Answer'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      <Clock className="w-3 h-3" />
                      {question.time_minutes} min
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(question); }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(question.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
