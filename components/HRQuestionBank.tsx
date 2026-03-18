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
    expected_answer_points: ['Brief professional background', 'Key skills relevant to the role', 'Career motivation and goals'],
    evaluation_criteria: 'Clear, concise self-introduction that highlights relevant experience and shows confidence',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-2',
    question_text: 'Why do you want to join our company?',
    category: 'Culture Fit',
    difficulty: 'easy',
    question_type: 'behavioral',
    expected_answer_points: ['Knowledge about the company', 'Alignment with company values', 'How the role fits career goals'],
    evaluation_criteria: 'Shows genuine interest and research about the company, not generic answers',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-3',
    question_text: 'What are your strengths?',
    category: 'Communication Skills',
    difficulty: 'easy',
    question_type: 'competency',
    expected_answer_points: ['Specific strengths with examples', 'Relevance to the job role', 'Self-awareness'],
    evaluation_criteria: 'Provides concrete examples rather than vague claims, strengths are relevant to the position',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-4',
    question_text: 'What are your weaknesses?',
    category: 'Communication Skills',
    difficulty: 'medium',
    question_type: 'behavioral',
    expected_answer_points: ['Honest self-assessment', 'Steps taken to improve', 'Growth mindset'],
    evaluation_criteria: 'Shows self-awareness and active improvement efforts, avoids cliched non-answers',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-5',
    question_text: 'Why should we hire you?',
    category: 'Career Goals',
    difficulty: 'medium',
    question_type: 'competency',
    expected_answer_points: ['Unique value proposition', 'Relevant skills and experience', 'Enthusiasm for the role'],
    evaluation_criteria: 'Clearly articulates what sets them apart, connects their skills to job requirements',
    time_minutes: 3,
    is_active: true,
  },
  {
    id: 'default-6',
    question_text: 'Are you willing to relocate?',
    category: 'Adaptability',
    difficulty: 'easy',
    question_type: 'behavioral',
    expected_answer_points: ['Clear yes/no answer', 'Flexibility and openness', 'Any conditions or preferences'],
    evaluation_criteria: 'Direct and honest response, shows flexibility if applicable to the role',
    time_minutes: 1,
    is_active: true,
  },
  {
    id: 'default-7',
    question_text: 'Can you work under pressure?',
    category: 'Stress Management',
    difficulty: 'medium',
    question_type: 'situational',
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
    if (!formData.evaluation_criteria.trim()) {
      toast.error({ title: 'Evaluation criteria is required' });
      return;
    }
    // Filter out empty answer points
    const cleanedPoints = formData.expected_answer_points.filter(p => p.trim() !== '');
    if (cleanedPoints.length === 0) {
      toast.error({ title: 'At least one expected answer point is required' });
      return;
    }

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
    const matchesSearch = !searchQuery || q.question_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || q.category === filterCategory;
    const matchesDifficulty = filterDifficulty === 'all' || q.difficulty === filterDifficulty;
    return matchesSearch && matchesCategory && matchesDifficulty;
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

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
        >
          <option value="all">All Categories</option>
          {HR_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={filterDifficulty}
          onChange={(e) => setFilterDifficulty(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
        >
          <option value="all">All Difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
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
            <textarea
              value={formData.question_text}
              onChange={(e) => setFormData(prev => ({ ...prev, question_text: e.target.value }))}
              rows={3}
              placeholder="Enter the HR question..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
            />
          </div>

          {/* Category, Difficulty, Type, Time - Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-black"
              >
                {HR_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Difficulty</label>
              <select
                value={formData.difficulty}
                onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value as 'easy' | 'medium' | 'hard' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-black"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Question Type</label>
              <select
                value={formData.question_type}
                onChange={(e) => setFormData(prev => ({ ...prev, question_type: e.target.value as 'behavioral' | 'situational' | 'competency' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-black"
              >
                <option value="behavioral">Behavioral</option>
                <option value="situational">Situational</option>
                <option value="competency">Competency</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time (minutes)</label>
              <input
                type="number"
                value={formData.time_minutes}
                onChange={(e) => setFormData(prev => ({ ...prev, time_minutes: parseInt(e.target.value) || 3 }))}
                min={1}
                max={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black"
              />
            </div>
          </div>

          {/* Expected Answer Points */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Answer Points *</label>
            {formData.expected_answer_points.map((point, index) => (
              <div key={index} className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-400 w-5">{index + 1}.</span>
                <input
                  type="text"
                  value={point}
                  onChange={(e) => updateAnswerPoint(index, e.target.value)}
                  placeholder="Key point the candidate should cover..."
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-black"
                />
                {formData.expected_answer_points.length > 1 && (
                  <button onClick={() => removeAnswerPoint(index)} className="text-red-400 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addAnswerPoint}
              className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1 mt-1"
            >
              <Plus className="w-3 h-3" /> Add point
            </button>
          </div>

          {/* Evaluation Criteria */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Evaluation Criteria *</label>
            <textarea
              value={formData.evaluation_criteria}
              onChange={(e) => setFormData(prev => ({ ...prev, evaluation_criteria: e.target.value }))}
              rows={2}
              placeholder="What makes a strong answer to this question..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600 text-black"
            />
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Total Questions</p>
          <p className="text-xl font-semibold text-gray-900">{questions.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Categories</p>
          <p className="text-xl font-semibold text-gray-900">{new Set(questions.map(q => q.category)).size}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Avg Time</p>
          <p className="text-xl font-semibold text-gray-900">
            {questions.length > 0 ? (questions.reduce((sum, q) => sum + q.time_minutes, 0) / questions.length).toFixed(1) : 0} min
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500">Active</p>
          <p className="text-xl font-semibold text-gray-900">{questions.filter(q => q.is_active).length}</p>
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
              <div
                className="flex items-start gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === question.id ? null : question.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-relaxed">{question.question_text}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      <Tag className="w-3 h-3" />
                      {question.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(question.difficulty)}`}>
                      {question.difficulty}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeColor(question.question_type)}`}>
                      {question.question_type}
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
                  {expandedId === question.id ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === question.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Expected Answer Points</p>
                    <ul className="space-y-1">
                      {question.expected_answer_points.map((point, idx) => (
                        <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-gray-400 mt-0.5">-</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Evaluation Criteria</p>
                    <p className="text-sm text-gray-700">{question.evaluation_criteria}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
