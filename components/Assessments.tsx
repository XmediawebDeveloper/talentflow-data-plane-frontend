'use client';

import { Plus, Clock, Users, CheckCircle, FileText, MoreVertical, Play, Sparkles, Eye, Edit2, BarChart, Mail, Trash2, Copy, Archive, Download, Link2, Share2, PauseCircle, LayoutGrid, List, Monitor, Brain, Code, ClipboardList, Globe, Pencil, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import AssessmentCreation from './AssessmentCreation';
import AssessmentResults from './AssessmentResults';
import ShareAssessmentModal from './ShareAssessmentModal';
import AssessmentAuditTrail from './AssessmentAuditTrail';
import AssessmentPreviewModal from './AssessmentPreviewModal';
import AssessmentEditModal from './AssessmentEditModal';
import AssessmentDetailsView from './AssessmentDetailsView';
import { Job } from '@/lib/types/types';
import { assessmentService } from '@/lib/services';
import { recordAssessment } from '@/lib/services/usageTrackingService';
import api from '@/lib/services/api';

interface AssessmentsProps {
  jobs: Job[];
  onOpenCandidateView?: () => void;
  onNavigateToJDCreation?: () => void;
}

export default function Assessments({ jobs, onOpenCandidateView, onNavigateToJDCreation }: AssessmentsProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed' | 'audit-trail'>('all');
  const [showCreation, setShowCreation] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedAssessmentForResults, setSelectedAssessmentForResults] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedAssessmentForShare, setSelectedAssessmentForShare] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedAssessmentForPreview, setSelectedAssessmentForPreview] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAssessmentForEdit, setSelectedAssessmentForEdit] = useState<any>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDetailsView, setShowDetailsView] = useState(false);
  const [selectedAssessmentForDetails, setSelectedAssessmentForDetails] = useState<any>(null);
  const [assessmentsList, setAssessmentsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiAssessments, setApiAssessments] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);

  // Load assessments from API on mount
  useEffect(() => {
    const loadAssessments = async () => {
      setIsLoading(true);
      try {
        const response = await assessmentService.list({ page_size: 100 });
        if (response?.items?.length > 0) {
          const mapped = response.items.map((a: any) => ({
            id: a.id,
            title: a.title,
            type: a.technical_enabled ? 'Technical' : a.hr_enabled ? 'Behavioral' : 'Aptitude',
            duration: `${a.duration_minutes} min`,
            questions: (a.hr_enabled ? 10 : 0) + (a.technical_enabled ? 10 : 0) + (a.coding_enabled ? 5 : 0),
            candidates: a.invitations_count || 0,
            status: a.status === 'published' ? 'Active' : a.status === 'closed' ? 'Completed' : 'Draft',
            passRate: a.completed_count > 0 ? `${Math.round((a.passed_count / a.completed_count) * 100)}%` : 'N/A',
            created: a.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
            job: { title: a.jd_title || 'General Assessment', department: 'Engineering' }
          }));
          setApiAssessments(mapped);
          console.log('[TalentFlow] Loaded', mapped.length, 'assessments from API');
        }
      } catch (error) {
        console.log('[TalentFlow] Failed to load assessments from API, using mock data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAssessments();
  }, []);

  // Load available units (quota) from API
  useEffect(() => {
    const loadQuota = async () => {
      try {
        const response = await api.get('/usage/quota-status');
        const quotas = response.data?.data?.quotas;
        if (quotas?.AS) {
          setAvailableUnits(quotas.AS.total_remaining || 0);
        }
      } catch (error) {
        console.log('[TalentFlow] Failed to load quota:', error);
      }
    };
    loadQuota();
  }, []);

  const mockAssessments = [
    {
      id: '1',
      title: 'Java Developer Technical Assessment',
      type: 'Technical',
      duration: '60 min',
      questions: 25,
      candidates: 45,
      status: 'Active',
      passRate: '68%',
      created: '2025-11-20',
      job: { title: 'Senior Java Developer', department: 'Engineering' }
    },
    {
      id: '2',
      title: 'Marketing Manager Skills Test',
      type: 'Behavioral',
      duration: '45 min',
      questions: 20,
      candidates: 32,
      status: 'Active',
      passRate: '75%',
      created: '2025-11-18',
      job: { title: 'Marketing Manager', department: 'Marketing' }
    },
    {
      id: '3',
      title: 'Python Developer Coding Challenge',
      type: 'Coding',
      duration: '90 min',
      questions: 15,
      candidates: 28,
      status: 'Completed',
      passRate: '62%',
      created: '2025-11-15',
      job: { title: 'Python Developer', department: 'Engineering' }
    },
    {
      id: '4',
      title: 'Sales Representative Assessment',
      type: 'Aptitude',
      duration: '30 min',
      questions: 30,
      candidates: 56,
      status: 'Active',
      passRate: '71%',
      created: '2025-11-12',
      job: { title: 'Sales Representative', department: 'Sales' }
    },
  ];

  // Combine API assessments (priority), mock assessments (fallback), and locally created
  const assessments = apiAssessments.length > 0
    ? [...apiAssessments, ...assessmentsList]
    : [...mockAssessments, ...assessmentsList];

  // Reload assessments from API
  const reloadAssessments = async () => {
    setIsLoading(true);
    try {
      const response = await assessmentService.list({ page_size: 100 });
      if (response?.items?.length > 0) {
        const mapped = response.items.map((a: any) => ({
          id: a.id,
          title: a.title,
          type: a.technical_enabled ? 'Technical' : a.hr_enabled ? 'Behavioral' : 'Aptitude',
          duration: `${a.duration_minutes} min`,
          questions: (a.hr_enabled ? 10 : 0) + (a.technical_enabled ? 10 : 0) + (a.coding_enabled ? 5 : 0),
          candidates: a.invitations_count || 0,
          status: a.status === 'published' ? 'Active' : a.status === 'closed' ? 'Completed' : a.status === 'archived' ? 'Archived' : 'Draft',
          passRate: a.completed_count > 0 ? `${Math.round((a.passed_count / a.completed_count) * 100)}%` : 'N/A',
          created: a.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          job: { title: a.jd_title || 'General Assessment', department: 'Engineering' }
        }));
        setApiAssessments(mapped);
      }
    } catch (error) {
      console.log('[TalentFlow] Failed to reload assessments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAssessment = async (assessment: any) => {
    setAssessmentsList([...assessmentsList, assessment]);
    setShowCreation(false);

    // Reload assessments from API to get the newly created one
    await reloadAssessments();

    // Track usage - POST /api/v1/external/usage/record
    recordAssessment(assessment.id, {
      assessment_title: assessment.title,
      type: assessment.type
    });
  };

  // Delete assessment via API
  const handleDeleteAssessment = async (assessmentId: string) => {
    if (!confirm('Delete this assessment permanently?')) return;

    try {
      await assessmentService.delete(assessmentId);
      // Remove from local state
      setAssessmentsList(assessmentsList.filter(a => a.id !== assessmentId));
      // Reload from API
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to delete assessment:', error);
      alert(`Failed to delete assessment: ${error instanceof Error ? error.message : 'Only draft assessments can be deleted'}`);
      setOpenMenuId(null);
    }
  };

  // Pause assessment (set status to closed)
  const handlePauseAssessment = async (assessmentId: string) => {
    if (!confirm('Pause this assessment?')) return;

    try {
      await assessmentService.update(assessmentId, { status: 'closed' as any });
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to pause assessment:', error);
      alert(`Failed to pause assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOpenMenuId(null);
    }
  };

  // Activate assessment (publish)
  const handleActivateAssessment = async (assessmentId: string) => {
    try {
      await assessmentService.publish(assessmentId);
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to activate assessment:', error);
      alert(`Failed to activate assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOpenMenuId(null);
    }
  };

  // Archive assessment
  const handleArchiveAssessment = async (assessmentId: string) => {
    if (!confirm('Archive this assessment?')) return;

    try {
      await assessmentService.update(assessmentId, { status: 'archived' as any });
      await reloadAssessments();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Failed to archive assessment:', error);
      alert(`Failed to archive assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOpenMenuId(null);
    }
  };

  if (showCreation) {
    return (
      <AssessmentCreation
        onBack={() => setShowCreation(false)}
        jobs={jobs}
        onCreateAssessment={handleCreateAssessment}
        onCreateNewJD={onNavigateToJDCreation}
      />
    );
  }

  if (showResults && selectedAssessmentForResults) {
    return (
      <AssessmentResults
        onBack={() => {
          setShowResults(false);
          setSelectedAssessmentForResults(null);
        }}
        assessmentId={selectedAssessmentForResults.id}
        assessmentTitle={selectedAssessmentForResults.title}
        jdTitle={selectedAssessmentForResults.job?.title}
      />
    );
  }

  if (showDetailsView && selectedAssessmentForDetails) {
    return (
      <AssessmentDetailsView
        assessment={selectedAssessmentForDetails}
        onBack={() => {
          setShowDetailsView(false);
          setSelectedAssessmentForDetails(null);
        }}
        onEdit={() => {
          setShowDetailsView(false);
          setSelectedAssessmentForEdit(selectedAssessmentForDetails);
          setShowEditModal(true);
        }}
        onPreview={() => {
          setShowDetailsView(false);
          setSelectedAssessmentForPreview(selectedAssessmentForDetails);
          setShowPreviewModal(true);
        }}
        onShare={() => {
          setShowDetailsView(false);
          setSelectedAssessmentForShare(selectedAssessmentForDetails);
          setShowShareModal(true);
        }}
        onViewResults={() => {
          setShowDetailsView(false);
          setSelectedAssessmentForResults(selectedAssessmentForDetails);
          setShowResults(true);
        }}
      />
    );
  }

  const filteredAssessments = assessments.filter((assessment) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return assessment.status === 'Active';
    if (activeTab === 'completed') return assessment.status === 'Completed';
    return true;
  });

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-gray-900 mb-2">Assessment Management</h1>
            <p className="text-sm text-gray-600">
              Create and manage skill assessments for candidates
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Available Units Badge */}
            {availableUnits !== null && (
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg border border-gray-200">
                <span className="text-sm text-gray-600">Available Units</span>
                <span className="text-sm font-semibold text-gray-900">{availableUnits}</span>
              </div>
            )}
            {onOpenCandidateView && (
              <button
                onClick={onOpenCandidateView}
                className="flex items-center gap-2 border border-gray-800 text-gray-800 px-6 py-2.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Eye className="w-5 h-5" />
                Preview Candidate View
              </button>
            )}
            <button
              onClick={() => setShowCreation(true)}
              className="flex items-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-lg hover:bg-gray-900 transition-colors shadow-sm"
            >
              <Sparkles className="w-5 h-5" />
              Create AI Assessment
            </button>
          </div>
        </div>

        {/* AI-Powered Assessments Banner */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-gray-700" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">AI-Powered Assessments</h3>
              <p className="text-sm text-gray-600">
                Create customized skill assessments linked to job descriptions. AI automatically generates relevant questions based on job requirements. Track candidate performance, completion rates, and pass/fail statistics.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-gray-800" />
              </div>
              <span className="text-sm text-gray-500">Total Assessments</span>
            </div>
            <div className="text-3xl text-gray-900">24</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Play className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-gray-500">Active</span>
            </div>
            <div className="text-3xl text-gray-900">18</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-gray-800" />
              </div>
              <span className="text-sm text-gray-500">Candidates Tested</span>
            </div>
            <div className="text-3xl text-gray-900">1,247</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <span className="text-sm text-gray-500">Avg. Pass Rate</span>
            </div>
            <div className="text-3xl text-gray-900">69%</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="border-b border-gray-200 px-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-6">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'all'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All Assessments
                </button>
                <button
                  onClick={() => setActiveTab('active')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'active'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setActiveTab('completed')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'completed'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setActiveTab('audit-trail')}
                  className={`py-4 text-sm border-b-2 transition-colors ${
                    activeTab === 'audit-trail'
                      ? 'border-gray-800 text-gray-800'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Audit Trail
                </button>
              </div>
              {/* Grid/List View Toggle */}
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded ${
                    viewMode === 'grid'
                      ? 'bg-gray-100 text-gray-800'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded ${
                    viewMode === 'list'
                      ? 'bg-gray-100 text-gray-800'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Assessment List */}
          <div className="p-6">
            {activeTab === 'audit-trail' ? (
              <AssessmentAuditTrail />
            ) : viewMode === 'grid' ? (
              /* Grid View */
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAssessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    onClick={() => {
                      setSelectedAssessmentForDetails(assessment);
                      setShowDetailsView(true);
                    }}
                    className="p-5 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all bg-white cursor-pointer"
                  >
                    {/* Grid Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-gray-700" />
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs ${
                          assessment.status === 'Active'
                            ? 'bg-green-100 text-green-700'
                            : assessment.status === 'Draft'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {assessment.status}
                      </span>
                    </div>

                    {/* Grid Card Title */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-gray-900 line-clamp-2">{assessment.title}</h3>
                        {assessment.sections && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs flex items-center gap-1 flex-shrink-0">
                            <Sparkles className="w-3 h-3" />
                            AI
                          </span>
                        )}
                      </div>
                      {assessment.job && (
                        <div className="text-xs text-gray-500">
                          {assessment.job.title} • {assessment.job.department}
                        </div>
                      )}
                    </div>

                    {/* Grid Card Meta */}
                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {assessment.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {assessment.candidates}
                      </span>
                    </div>

                    {/* Grid Card Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setSelectedAssessmentForShare(assessment);
                          setShowShareModal(true);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-xs"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        Share
                      </button>
                      <button
                        onClick={() => {
                          setSelectedAssessmentForResults(assessment);
                          setShowResults(true);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-xs"
                      >
                        <BarChart className="w-3.5 h-3.5" />
                        Results
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === assessment.id ? null : assessment.id);
                        }}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Grid Card Dropdown Menu */}
                    {openMenuId === assessment.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-4 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 z-20">
                          <button
                            onClick={() => {
                              setSelectedAssessmentForEdit(assessment);
                              setShowEditModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                          >
                            <Edit2 className="w-4 h-4 text-gray-600" />
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAssessmentForPreview(assessment);
                              setShowPreviewModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                          >
                            <Eye className="w-4 h-4 text-gray-600" />
                            Preview
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_APP_URL || 'https://talentflow.app'}/assessment/${assessment.id}`);
                              alert('Link copied!');
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                          >
                            <Link2 className="w-4 h-4 text-gray-600" />
                            Copy Link
                          </button>
                          <div className="border-t border-gray-100 my-1"></div>
                          <button
                            onClick={() => handleDeleteAssessment(assessment.id)}
                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* List View */
              <div className="space-y-4">
                {filteredAssessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    onClick={() => {
                      setSelectedAssessmentForDetails(assessment);
                      setShowDetailsView(true);
                    }}
                    className="p-5 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all bg-white cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      {/* Left Side - Icon + Info */}
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-gray-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-gray-900 truncate">{assessment.title}</h3>
                            {assessment.sections && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs flex items-center gap-1 flex-shrink-0">
                                <Sparkles className="w-3 h-3" />
                                AI
                              </span>
                            )}
                          </div>
                          {assessment.job && (
                            <div className="text-xs text-gray-500 mb-2">
                              Based on: {assessment.job.title} • {assessment.job.department}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {assessment.duration}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {assessment.candidates} Invitations Sent
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Side - Actions + Status + Menu */}
                      <div className="flex items-center gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Share via Email Button */}
                        <button
                          onClick={() => {
                            setSelectedAssessmentForShare(assessment);
                            setShowShareModal(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-xs"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Share via Email
                        </button>

                        {/* View Results Button */}
                        <button
                          onClick={() => {
                            setSelectedAssessmentForResults(assessment);
                            setShowResults(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-xs"
                        >
                          <BarChart className="w-3.5 h-3.5" />
                          View Results ({assessment.candidates})
                        </button>

                        {/* Status Badge */}
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs ${
                            assessment.status === 'Active'
                              ? 'bg-green-100 text-green-700'
                              : assessment.status === 'Draft'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {assessment.status}
                        </span>

                        {/* Three Dots Menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === assessment.id ? null : assessment.id);
                            }}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {openMenuId === assessment.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 z-20">
                                <button
                                  onClick={() => {
                                    setSelectedAssessmentForEdit(assessment);
                                    setShowEditModal(true);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                >
                                  <Edit2 className="w-4 h-4 text-gray-600" />
                                  Edit Assessment
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedAssessmentForPreview(assessment);
                                    setShowPreviewModal(true);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                >
                                  <Eye className="w-4 h-4 text-gray-600" />
                                  Preview
                                </button>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_APP_URL || 'https://talentflow.app'}/assessment/${assessment.id}`);
                                    alert('Assessment link copied to clipboard!');
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                >
                                  <Link2 className="w-4 h-4 text-gray-600" />
                                  Copy Link
                                </button>
                                <button
                                  onClick={() => {
                                    const newAssessment = { ...assessment, id: Date.now().toString(), title: `${assessment.title} (Copy)`, status: 'Draft' };
                                    setAssessmentsList([...assessmentsList, newAssessment]);
                                    alert('Assessment duplicated successfully!');
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                >
                                  <Copy className="w-4 h-4 text-gray-600" />
                                  Duplicate
                                </button>
                                <div className="border-t border-gray-100 my-1"></div>
                                {assessment.status === 'Active' ? (
                                  <button
                                    onClick={() => handlePauseAssessment(assessment.id)}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                  >
                                    <PauseCircle className="w-4 h-4 text-yellow-600" />
                                    Pause
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleActivateAssessment(assessment.id)}
                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                  >
                                    <Play className="w-4 h-4 text-green-600" />
                                    Activate
                                  </button>
                                )}
                                <button
                                  onClick={() => handleArchiveAssessment(assessment.id)}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                                >
                                  <Archive className="w-4 h-4 text-gray-600" />
                                  Archive
                                </button>
                                <div className="border-t border-gray-100 my-1"></div>
                                <button
                                  onClick={() => handleDeleteAssessment(assessment.id)}
                                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Assessment Templates */}
        <div className="mt-8 bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-gray-900 mb-4">Assessment Templates</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { name: 'Technical Skills', icon: Monitor, count: 12, bgColor: 'bg-gray-100' },
              { name: 'Behavioral', icon: Brain, count: 8, bgColor: 'bg-gray-100' },
              { name: 'Coding Challenge', icon: Code, count: 15, bgColor: 'bg-gray-100' },
              { name: 'Aptitude Test', icon: ClipboardList, count: 6, bgColor: 'bg-gray-100' },
              { name: 'Language Proficiency', icon: Globe, count: 5, bgColor: 'bg-gray-100' },
              { name: 'Custom Template', icon: Pencil, count: 0, bgColor: 'bg-gray-100' },
            ].map((template, index) => {
              const IconComponent = template.icon;
              return (
                <div
                  key={index}
                  className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className={`w-10 h-10 ${template.bgColor} rounded-lg flex items-center justify-center mb-3`}>
                    <IconComponent className="w-5 h-5 text-gray-700" />
                  </div>
                  <div className="text-sm font-medium text-gray-900 mb-1">{template.name}</div>
                  <div className="text-xs text-gray-500">{template.count} templates</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Share Assessment Modal */}
      {showShareModal && selectedAssessmentForShare && (
        <ShareAssessmentModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSelectedAssessmentForShare(null);
          }}
          assessment={selectedAssessmentForShare}
        />
      )}
      
      {/* Preview Assessment Modal */}
      {showPreviewModal && selectedAssessmentForPreview && (
        <AssessmentPreviewModal
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            setSelectedAssessmentForPreview(null);
          }}
          assessment={selectedAssessmentForPreview}
        />
      )}
      
      {/* Edit Assessment Modal */}
      {showEditModal && selectedAssessmentForEdit && (
        <AssessmentEditModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedAssessmentForEdit(null);
          }}
          assessment={selectedAssessmentForEdit}
          onSave={(updatedAssessment) => {
            // Update in assessmentsList if it's a created assessment
            const updatedList = assessmentsList.map(a => 
              a.id === updatedAssessment.id ? updatedAssessment : a
            );
            setAssessmentsList(updatedList);
            console.log('Assessment updated:', updatedAssessment);
          }}
        />
      )}
    </div>
  );
}