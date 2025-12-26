import { ArrowLeft, Clock, Briefcase, Sliders, Plus, X, Sparkles, AlertCircle, CheckCircle2, Code, Users, Brain, BarChart } from 'lucide-react';
import { useState } from 'react';
import { Job } from '@/lib/types/types';

interface AssessmentCreationProps {
  onBack: () => void;
  jobs: Job[];
  onCreateAssessment: (assessment: any) => void;
  onCreateNewJD?: () => void;
}

interface SectionConfig {
  name: 'HR' | 'Technical' | 'Coding';
  percentage: number;
  topics: string[];
  enabled: boolean;
}

export default function AssessmentCreation({ onBack, jobs, onCreateAssessment, onCreateNewJD }: AssessmentCreationProps) {
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

  const handleGenerateAssessment = () => {
    setIsGenerating(true);
    
    // Simulate saving assessment definition (NO actual questions generated)
    setTimeout(() => {
      const assessmentDefinition = {
        id: Date.now().toString(),
        title: `${selectedJob?.title} Assessment`,
        job: selectedJob,
        duration,
        sections: sections.filter(s => s.enabled).map(section => ({
          name: section.name,
          percentage: section.percentage,
          topics: section.topics,
          questions: Math.ceil((duration * section.percentage) / 100 / 2), // ~2 min per question
          difficulty: selectedJob?.experience === 'Senior' || selectedJob?.experience === 'Lead' ? 'Advanced' :
                     selectedJob?.experience === 'Mid-Level' ? 'Intermediate' : 'Basic',
          estimatedTime: Math.ceil((duration * section.percentage) / 100),
          // NO generatedQuestions - questions are NOT generated at this stage
        })),
        status: 'Draft',
        createdAt: new Date().toISOString(),
      };
      
      setGeneratedAssessment(assessmentDefinition);
      setIsGenerating(false);
      setStep('preview');
    }, 2000);
  };

  const handlePublish = () => {
    onCreateAssessment({ ...generatedAssessment, status: 'Active' });
    onBack();
  };

  const totalPercentage = getTotalPercentage();
  const isPercentageValid = totalPercentage === 100;

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
                {onCreateNewJD && (
                  <button
                    onClick={onCreateNewJD}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create New JD
                  </button>
                )}
              </div>
            </div>
            
            <div className="p-6">
              <div className="space-y-3">
                {jobs.filter(j => j.status === 'Published').map(job => (
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

                {jobs.filter(j => j.status === 'Published').length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No published jobs available</p>
                    <p className="text-sm mt-1">Create and publish a JD first to create assessments</p>
                    {onCreateNewJD && (
                      <button
                        onClick={onCreateNewJD}
                        className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                      >
                        Create New Job Description
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Configure Assessment
  if (step === 'configure') {
    return (
      <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => setStep('select-jd')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Job Selection
          </button>

          <div className="mb-8">
            <h1 className="text-gray-900 mb-2">Configure Assessment</h1>
            <p className="text-gray-600">
              Set duration, section distribution, and topics for {selectedJob?.title}
            </p>
          </div>

          {/* Selected Job Info */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Selected Job Description</div>
                <h3 className="text-gray-900 mb-2">{selectedJob?.title}</h3>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span>{selectedJob?.department}</span>
                  <span>•</span>
                  <span>{selectedJob?.experience}</span>
                  <span>•</span>
                  <span>{selectedJob?.employmentType}</span>
                </div>
              </div>
              {requiresCoding(selectedJob!) && (
                <span className="px-3 py-1 bg-gray-100 text-gray-900 rounded-full text-xs flex items-center gap-1">
                  <Code className="w-3 h-3" />
                  Coding Enabled
                </span>
              )}
            </div>
          </div>

          {/* Duration */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-5 h-5 text-gray-800" />
              <h3 className="text-gray-900">Assessment Duration</h3>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="15"
                max="120"
                step="15"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="flex-1"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Math.max(15, Math.min(120, Number(e.target.value))))}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
                />
                <span className="text-gray-600">minutes</span>
              </div>
            </div>
          </div>

          {/* Scoring Rules */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <BarChart className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <div>
                <h3 className="text-amber-900 mb-2">📊 Assessment Scoring Rules</h3>
                <p className="text-sm text-amber-800 mb-4">
                  Understanding how candidates are evaluated for PASS/FAIL determination
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* HR Section */}
              <div className="bg-white rounded-lg p-4 border-2 border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-gray-800" />
                  <h4 className="text-gray-900">HR Section</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-gray-800 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">Responses recorded</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-gray-800 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">Displayed in reports</span>
                  </div>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg mt-2">
                    <span className="text-xs text-gray-700">
                      ℹ️ <strong>NOT part of PASS/FAIL</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Technical Section */}
              <div className="bg-white rounded-lg p-4 border-2 border-gray-300">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-5 h-5 text-gray-800" />
                  <h4 className="text-gray-900">Technical Section</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-800 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">0-10 rating per question</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-gray-800 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">Min passing score: 7/10</span>
                  </div>
                  <div className="px-3 py-2 bg-gray-100 rounded-lg mt-2">
                    <span className="text-xs text-gray-800">
                      ✅ <strong>Counts toward PASS/FAIL</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Coding Section */}
              <div className="bg-white rounded-lg p-4 border-2 border-green-300">
                <div className="flex items-center gap-2 mb-2">
                  <Code className="w-5 h-5 text-green-600" />
                  <h4 className="text-gray-900">Coding Section</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">0-10 rating per question</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">Min passing score: 7/10</span>
                  </div>
                  <div className="px-3 py-2 bg-green-100 rounded-lg mt-2">
                    <span className="text-xs text-green-900">
                      ✅ <strong>Counts toward PASS/FAIL</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pass Logic */}
            <div className="bg-white rounded-lg p-4 border-2 border-amber-400">
              <h4 className="text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Pass/Fail Logic (Technical & Coding Only)
              </h4>
              <div className="space-y-2 text-sm text-gray-700">
                <p>
                  <strong>For each section (Technical/Coding):</strong>
                </p>
                <div className="ml-4 space-y-1">
                  <p>• At least <strong>70% of questions</strong> must score ≥7, <strong>OR</strong></p>
                  <p>• Overall section average must be ≥7</p>
                </div>
                <p className="mt-3 pt-3 border-t border-amber-200">
                  <strong>Example:</strong> If 10 Technical questions exist:
                </p>
                <div className="ml-4 space-y-1 text-gray-600">
                  <p>✅ Pass: 7+ questions score ≥7</p>
                  <p>✅ Pass: Average score ≥7.0</p>
                  <p>❌ Fail: Only 6 questions score ≥7 AND average &lt;7</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section Configuration */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Sliders className="w-5 h-5 text-gray-800" />
                <h3 className="text-gray-900">Section Distribution</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Total:</span>
                <span className={`text-lg ${isPercentageValid ? 'text-green-600' : 'text-red-600'}`}>
                  {totalPercentage}%
                </span>
              </div>
            </div>

            {!isPercentageValid && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  Section percentages must total exactly 100%
                </div>
              </div>
            )}

            <div className="space-y-6">
              {sections.map((section) => (
                <div
                  key={section.name}
                  className={`p-6 border rounded-lg ${
                    section.enabled ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {section.name === 'HR' && <Users className="w-5 h-5 text-gray-800" />}
                      {section.name === 'Technical' && <Brain className="w-5 h-5 text-gray-800" />}
                      {section.name === 'Coding' && <Code className="w-5 h-5 text-green-600" />}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-gray-900">{section.name} Section</h4>
                          {section.name === 'HR' ? (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                              Informational Only
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                              Scored (0-10)
                            </span>
                          )}
                        </div>
                        {section.enabled && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            ~{Math.ceil((duration * section.percentage) / 100)} minutes • 
                            ~{Math.ceil((duration * section.percentage) / 100 / 2)} questions
                            {section.name !== 'HR' && <span className="text-gray-800"> • Pass: ≥7/10</span>}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {section.name === 'Coding' && (
                        <div className="text-xs text-gray-500">
                          {section.enabled ? 'Auto-enabled (coding required)' : 'Auto-disabled (no coding)'}
                        </div>
                      )}
                    </div>
                  </div>

                  {section.enabled && (
                    <>
                      <div className="mb-4">
                        <label className="text-sm text-gray-700 mb-2 block">
                          Percentage Allocation
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={section.percentage}
                            onChange={(e) => updatePercentage(section.name, Number(e.target.value))}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            value={section.percentage}
                            onChange={(e) => updatePercentage(section.name, Number(e.target.value))}
                            className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
                          />
                          <span className="text-gray-600">%</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm text-gray-700 mb-2 block">
                          Topics (LLM will generate questions based on these)
                        </label>
                        <div className="flex gap-2 mb-3">
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
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                          />
                          <button
                            onClick={() => addTopic(section.name)}
                            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Add Topic
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {section.topics.map((topic, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1.5 bg-gray-50 text-gray-900 rounded-lg text-sm flex items-center gap-2 border border-gray-200"
                            >
                              {topic}
                              <button
                                onClick={() => removeTopic(section.name, idx)}
                                className="hover:text-gray-900"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </span>
                          ))}
                          {section.topics.length === 0 && (
                            <span className="text-sm text-gray-500 italic">
                              No topics added yet. Add topics for AI to generate relevant questions.
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* LLM Configuration Info */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <Sparkles className="w-6 h-6 text-gray-800 flex-shrink-0" />
              <div>
                <h4 className="text-gray-900 mb-2">AI Assessment Generation</h4>
                <div className="text-sm text-gray-700 space-y-2">
                  <p>• <strong>Unique Question Sets:</strong> Each candidate receives freshly generated questions for fairness</p>
                  <p>• LLM will analyze the JD and generate questions dynamically per candidate</p>
                  <p>• Question difficulty adjusted based on experience level: <strong>{selectedJob?.experienceLevel}</strong></p>
                  <p>• Number of questions and time allocation calculated automatically</p>
                  <p>• Topics you provide will guide the question generation process</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => setStep('select-jd')}
              className="px-6 py-2.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleGenerateAssessment}
              disabled={!isPercentageValid}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              Generate Assessment with AI
            </button>
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