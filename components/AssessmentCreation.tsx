import { ArrowLeft, Clock, Briefcase, Sliders, Plus, X, Sparkles, AlertCircle, CheckCircle2, Code, Users, Brain, BarChart, FileText } from 'lucide-react';
import { useState } from 'react';
import { Job } from '@/lib/types/types';
import { assessmentService, jdService } from '@/lib/services';

interface AssessmentCreationProps {
  onBack: () => void;
  jobs: Job[];
  onCreateAssessment: (assessment: any) => void;
  onCreateNewJD?: () => void;
  onJobsRefresh?: () => void;
}

interface SectionConfig {
  name: 'HR' | 'Technical' | 'Coding';
  percentage: number;
  topics: string[];
  enabled: boolean;
}

interface CreateJDForm {
  title: string;
  description: string;
  department: string;
  location: string;
  experience: string;
  skills: string;
}

export default function AssessmentCreation({ onBack, jobs, onCreateAssessment, onCreateNewJD, onJobsRefresh }: AssessmentCreationProps) {
  const [step, setStep] = useState<'select-jd' | 'configure' | 'preview'>(('select-jd'));
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [duration, setDuration] = useState(30);
  const [sections, setSections] = useState<SectionConfig[]>([
    { name: 'HR', percentage: 20, topics: [], enabled: true },
    { name: 'Technical', percentage: 70, topics: [], enabled: true },
    { name: 'Coding', percentage: 10, topics: [], enabled: false },
  ]);
  const [newTopic, setNewTopic] = useState({ section: '' as 'HR' | 'Technical' | 'Coding', value: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessment, setGeneratedAssessment] = useState<any>(null);

  // Create JD Modal State
  const [showCreateJDModal, setShowCreateJDModal] = useState(false);
  const [isCreatingJD, setIsCreatingJD] = useState(false);
  const [jdForm, setJdForm] = useState<CreateJDForm>({
    title: '',
    description: '',
    department: '',
    location: '',
    experience: 'Mid-Level',
    skills: ''
  });
  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);

  // Check if JD requires coding based on skills/technologies
  const requiresCoding = (job: Job) => {
    const codingKeywords = ['developer', 'engineer', 'programmer', 'software', 'coding', 'python', 'java', 'javascript', 'react', 'node'];
    const jobText = `${job.title} ${job.description} ${job.skills.join(' ')}`.toLowerCase();
    return codingKeywords.some(keyword => jobText.includes(keyword));
  };

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job);
    const hasCoding = requiresCoding(job);
    
    // Auto-configure sections based on JD
    if (hasCoding) {
      setSections([
        { name: 'HR', percentage: 20, topics: [], enabled: true },
        { name: 'Technical', percentage: 70, topics: [], enabled: true },
        { name: 'Coding', percentage: 10, topics: [], enabled: true },
      ]);
    } else {
      setSections([
        { name: 'HR', percentage: 30, topics: [], enabled: true },
        { name: 'Technical', percentage: 70, topics: [], enabled: true },
        { name: 'Coding', percentage: 0, topics: [], enabled: false },
      ]);
    }
    setStep('configure');
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

  const handleGenerateAssessment = async (saveAsDraft: boolean = false) => {
    setIsGenerating(true);

    try {
      // Call the real API to create assessment
      const hrSection = sections.find(s => s.name === 'HR');
      const technicalSection = sections.find(s => s.name === 'Technical');
      const codingSection = sections.find(s => s.name === 'Coding');

      const createData = {
        jd_id: selectedJob?.id || '',
        title: `${selectedJob?.title} Assessment`,
        description: `AI-generated assessment for ${selectedJob?.title}`,
        hr_enabled: hrSection?.enabled || false,
        hr_percentage: hrSection?.enabled ? hrSection.percentage : 0,
        hr_topics: hrSection?.topics || [],
        technical_enabled: technicalSection?.enabled || false,
        technical_percentage: technicalSection?.enabled ? technicalSection.percentage : 0,
        technical_topics: technicalSection?.topics || [],
        coding_enabled: codingSection?.enabled || false,
        coding_percentage: codingSection?.enabled ? codingSection.percentage : 0,
        coding_topics: codingSection?.topics || [],
        coding_languages: [],
      };

      // Create the assessment via API
      const createdAssessment = await assessmentService.create(createData);

      // If not saving as draft, publish immediately
      if (!saveAsDraft) {
        await assessmentService.publish(createdAssessment.id);
      }

      // Map API response to local format
      const assessmentDefinition = {
        id: createdAssessment.id,
        title: createdAssessment.title,
        job: selectedJob,
        duration: createdAssessment.duration_minutes,
        sections: sections.filter(s => s.enabled).map(section => ({
          name: section.name,
          percentage: section.percentage,
          topics: section.topics,
          questions: Math.ceil((createdAssessment.duration_minutes * section.percentage) / 100 / 2),
          difficulty: selectedJob?.experience === 'Senior' || selectedJob?.experience === 'Lead' ? 'Advanced' :
                     selectedJob?.experience === 'Mid-Level' ? 'Intermediate' : 'Basic',
          estimatedTime: Math.ceil((createdAssessment.duration_minutes * section.percentage) / 100),
        })),
        status: saveAsDraft ? 'Draft' : 'Active',
        createdAt: createdAssessment.created_at,
      };

      setGeneratedAssessment(assessmentDefinition);
      setIsGenerating(false);
      setStep('preview');
    } catch (error) {
      console.error('Failed to create assessment:', error);
      setIsGenerating(false);
      alert(`Failed to create assessment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handlePublish = () => {
    onCreateAssessment({ ...generatedAssessment, status: 'Active' });
    onBack();
  };

  // Handle Create JD
  const handleCreateJD = async () => {
    if (!jdForm.title.trim() || !jdForm.description.trim()) {
      alert('Please fill in Title and Description');
      return;
    }

    setIsCreatingJD(true);
    try {
      const skillsArray = jdForm.skills.split(',').map(s => s.trim()).filter(s => s);

      // Create JD via API
      const createdJD = await jdService.create({
        title: jdForm.title,
        description: jdForm.description,
        department: jdForm.department || 'General',
        location: jdForm.location || 'Remote',
        must_have_skills: skillsArray,
        job_level: jdForm.experience,
      });

      // Publish the JD immediately
      await jdService.publish(createdJD.id);

      // Create a local Job object from the response
      const newJob: Job = {
        id: createdJD.id,
        title: createdJD.title,
        description: createdJD.description,
        department: createdJD.department || 'General',
        location: createdJD.location || 'Remote',
        experience: createdJD.job_level || 'Mid-Level',
        skills: createdJD.must_have_skills || [],
        status: 'Published',
        created: new Date().toISOString().split('T')[0],
        applicants: 0,
      };

      // Add to local jobs list
      setLocalJobs([newJob, ...localJobs]);

      // Reset form and close modal
      setJdForm({
        title: '',
        description: '',
        department: '',
        location: '',
        experience: 'Mid-Level',
        skills: ''
      });
      setShowCreateJDModal(false);

      // Optionally refresh parent jobs list
      if (onJobsRefresh) {
        onJobsRefresh();
      }

      // Auto-select the new JD
      handleJobSelect(newJob);

    } catch (error) {
      console.error('Failed to create JD:', error);
      alert(`Failed to create Job Description: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreatingJD(false);
    }
  };

  const totalPercentage = getTotalPercentage();
  const isPercentageValid = totalPercentage === 100;

  // Use localJobs which includes newly created JDs
  const availableJobs = localJobs.length > 0 ? localJobs : jobs;

  // Step 1: Select JD
  if (step === 'select-jd') {
    return (
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Assessments
          </button>

          <div className="mb-8">
            <h1 className="text-gray-900 mb-2">Create New Assessment</h1>
            <p className="text-gray-600">
              Select a Job Description to create an AI-powered assessment
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
                  onClick={() => setShowCreateJDModal(true)}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Job Description
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-3">
                {availableJobs.filter(j => j.status === 'Published').map(job => (
                  <button
                    key={job.id}
                    onClick={() => handleJobSelect(job)}
                    className="w-full text-left p-6 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-gray-900 mb-2 group-hover:text-gray-800 transition-colors">
                          {job.title}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-4 h-4" />
                            {job.department}
                          </span>
                          <span>{job.location}</span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                            {job.experience}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {job.skills.slice(0, 4).map((skill, idx) => (
                            <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                              {skill}
                            </span>
                          ))}
                          {job.skills.length > 4 && (
                            <span className="text-xs text-gray-500">
                              +{job.skills.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-4">
                        {requiresCoding(job) && (
                          <span className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-xs flex items-center gap-1">
                            <Code className="w-3 h-3" />
                            Coding Required
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}

                {availableJobs.filter(j => j.status === 'Published').length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No published jobs available</p>
                    <p className="text-sm mt-1">Create and publish a JD first to create assessments</p>
                    <button
                      onClick={() => setShowCreateJDModal(true)}
                      className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-4 h-4" />
                      Create Job Description
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Create JD Modal */}
        {showCreateJDModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="bg-gray-800 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-medium">Create Job Description</h2>
                    <p className="text-gray-300 text-sm">Quick JD creation for assessment</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateJDModal(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Job Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={jdForm.title}
                      onChange={(e) => setJdForm({ ...jdForm, title: e.target.value })}
                      placeholder="e.g., Senior Software Engineer"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-gray-900"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Job Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={jdForm.description}
                      onChange={(e) => setJdForm({ ...jdForm, description: e.target.value })}
                      placeholder="Describe the role, responsibilities, and requirements..."
                      rows={5}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 resize-none text-gray-900"
                    />
                  </div>

                  {/* Department & Location */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                      <input
                        type="text"
                        value={jdForm.department}
                        onChange={(e) => setJdForm({ ...jdForm, department: e.target.value })}
                        placeholder="e.g., Engineering"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        value={jdForm.location}
                        onChange={(e) => setJdForm({ ...jdForm, location: e.target.value })}
                        placeholder="e.g., Remote, New York"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-gray-900"
                      />
                    </div>
                  </div>

                  {/* Experience Level */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Experience Level</label>
                    <select
                      value={jdForm.experience}
                      onChange={(e) => setJdForm({ ...jdForm, experience: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-gray-900"
                    >
                      <option value="Entry">Entry Level</option>
                      <option value="Mid-Level">Mid-Level</option>
                      <option value="Senior">Senior</option>
                      <option value="Lead">Lead / Principal</option>
                    </select>
                  </div>

                  {/* Skills */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Required Skills</label>
                    <input
                      type="text"
                      value={jdForm.skills}
                      onChange={(e) => setJdForm({ ...jdForm, skills: e.target.value })}
                      placeholder="e.g., React, TypeScript, Node.js (comma-separated)"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 text-gray-900"
                    />
                    <p className="text-xs text-gray-500 mt-1">Separate skills with commas</p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowCreateJDModal(false)}
                  disabled={isCreatingJD}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateJD}
                  disabled={isCreatingJD || !jdForm.title.trim() || !jdForm.description.trim()}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingJD ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create & Select
                    </>
                  )}
                </button>
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
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => setStep('select-jd')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
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
                  <div className={`p-4 border rounded-lg transition-all ${sections.find(s => s.name === 'HR')?.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">HR Round</span>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Informational</span>
                          </div>
                          <p className="text-sm text-gray-500">Cultural fit, communication skills, and behavioral questions</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSections(sections.map(s => s.name === 'HR' ? { ...s, enabled: !s.enabled } : s))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sections.find(s => s.name === 'HR')?.enabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sections.find(s => s.name === 'HR')?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Technical Round Toggle */}
                  <div className={`p-4 border rounded-lg transition-all ${sections.find(s => s.name === 'Technical')?.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Brain className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">Technical Round</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                          </div>
                          <p className="text-sm text-gray-500">Domain knowledge, technical concepts, and job-specific skills</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSections(sections.map(s => s.name === 'Technical' ? { ...s, enabled: !s.enabled } : s))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sections.find(s => s.name === 'Technical')?.enabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sections.find(s => s.name === 'Technical')?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Coding Round Toggle */}
                  <div className={`p-4 border rounded-lg transition-all ${sections.find(s => s.name === 'Coding')?.enabled ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Code className="w-5 h-5 text-gray-600" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">Coding Round</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Scored (0-10)</span>
                            {requiresCoding(selectedJob!) && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Auto-Enabled</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">Programming challenges, algorithm design, and code implementation</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSections(sections.map(s => s.name === 'Coding' ? { ...s, enabled: !s.enabled } : s))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sections.find(s => s.name === 'Coding')?.enabled ? 'bg-gray-800' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sections.find(s => s.name === 'Coding')?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Smart Configuration Info */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">
                      <strong>Smart Configuration:</strong> Coding round is auto-enabled based on JD analysis. You can manually override this setting. Disabled rounds will be hidden from the section distribution below.
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
        <div className="max-w-5xl mx-auto">
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
                <div className="text-2xl text-gray-900">{selectedJob?.experienceLevel}</div>
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
            <button
              onClick={() => setStep('configure')}
              className="px-6 py-2.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Regenerate
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onCreateAssessment({ ...generatedAssessment, status: 'Draft' });
                  onBack();
                }}
                className="px-6 py-2.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Save as Draft
              </button>
              <button
                onClick={handlePublish}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Publish Assessment
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}