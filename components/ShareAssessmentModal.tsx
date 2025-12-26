import { X, Mail, Plus, Trash2, Send, CheckCircle, Copy, Clock, FileText, Users, Upload, Database } from 'lucide-react';
import { useState } from 'react';

interface ShareAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessment: {
    id: string;
    title: string;
    duration: string;
    questions: number;
    type: string;
  };
}

interface CandidateEmail {
  id: string;
  name: string;
  email: string;
  source?: 'manual' | 'database'; // Track source
  resumeId?: string; // Link to resume if from database
}

interface Resume {
  id: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  experience: string;
  skills: string[];
}

export default function ShareAssessmentModal({ isOpen, onClose, assessment }: ShareAssessmentModalProps) {
  const [inputMode, setInputMode] = useState<'manual' | 'database'>('manual');
  const [candidates, setCandidates] = useState<CandidateEmail[]>([
    { id: '1', name: '', email: '', source: 'manual' }
  ]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mock resume database
  const [resumeDatabase] = useState<Resume[]>([
    { id: 'r1', name: 'Sarah Johnson', email: 'sarah.j@email.com', phone: '+1-555-0123', position: 'Senior Developer', experience: '5 years', skills: ['React', 'TypeScript', 'Node.js'] },
    { id: 'r2', name: 'Michael Chen', email: 'mchen@email.com', phone: '+1-555-0124', position: 'Full Stack Engineer', experience: '3 years', skills: ['Python', 'Django', 'React'] },
    { id: 'r3', name: 'Emily Rodriguez', email: 'emily.r@email.com', phone: '+1-555-0125', position: 'Frontend Developer', experience: '4 years', skills: ['Vue.js', 'JavaScript', 'CSS'] },
    { id: 'r4', name: 'David Kim', email: 'dkim@email.com', phone: '+1-555-0126', position: 'Backend Developer', experience: '6 years', skills: ['Java', 'Spring Boot', 'MySQL'] },
    { id: 'r5', name: 'Jessica Martinez', email: 'jmartinez@email.com', phone: '+1-555-0127', position: 'DevOps Engineer', experience: '5 years', skills: ['Docker', 'Kubernetes', 'AWS'] },
    { id: 'r6', name: 'Robert Taylor', email: 'rtaylor@email.com', phone: '+1-555-0128', position: 'Data Scientist', experience: '4 years', skills: ['Python', 'Machine Learning', 'TensorFlow'] },
  ]);
  
  const [customMessage, setCustomMessage] = useState(
    `Hi [Candidate Name],\n\nYou have been invited to complete an assessment as part of our recruitment process.\n\nPlease click the link below to access the assessment. The assessment will take approximately ${assessment.duration} and consists of ${assessment.questions} questions.\n\nBest regards,\nTalentFlow Recruitment Team`
  );
  const [expiryDays, setExpiryDays] = useState(7);
  const [sendCopy, setSendCopy] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  if (!isOpen) return null;

  const addCandidate = () => {
    setCandidates([...candidates, { id: Date.now().toString(), name: '', email: '', source: 'manual' }]);
  };

  const removeCandidate = (id: string) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter(c => c.id !== id));
    }
  };

  const updateCandidate = (id: string, field: 'name' | 'email', value: string) => {
    setCandidates(candidates.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };
  
  // Handle resume selection from database
  const toggleResumeSelection = (resumeId: string) => {
    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };
  
  // Add selected resumes to candidates list
  const handleAddFromDatabase = () => {
    const selectedResumeData = resumeDatabase.filter(r => selectedResumes.includes(r.id));
    const newCandidates = selectedResumeData.map(resume => ({
      id: Date.now().toString() + Math.random(),
      name: resume.name,
      email: resume.email,
      source: 'database' as const,
      resumeId: resume.id
    }));
    
    // Filter out manual entries with empty fields
    const validManualCandidates = candidates.filter(c => 
      c.source === 'manual' && c.name.trim() && c.email.trim()
    );
    
    setCandidates([...validManualCandidates, ...newCandidates]);
    setSelectedResumes([]);
    setInputMode('manual');
  };
  
  // Filter resumes based on search query
  const filteredResumes = resumeDatabase.filter(resume =>
    resume.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    resume.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    resume.position.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = () => {
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);
    }, 1500);
  };

  const isValid = candidates.every(c => c.name.trim() && c.email.trim() && c.email.includes('@'));

  const assessmentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://talentflow.app'}/assessment/${assessment.id}`;

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="text-gray-900 mb-2">Assessment Shared Successfully!</h3>
          <p className="text-gray-600 text-sm">
            Email invitations have been sent to {candidates.length} candidate{candidates.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white">Share Assessment via Email</h2>
              <p className="text-gray-100 text-sm">{assessment.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Assessment Info Banner */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-gray-900 mb-1">{assessment.title}</div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {assessment.duration}
                  </span>
                  <span>•</span>
                  <span>{assessment.questions} questions</span>
                  <span>•</span>
                  <span>{assessment.type}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Candidate Emails Section */}
          <div className="mb-6">
            {/* Mode Switcher */}
            <div className="flex items-center justify-between mb-4">
              <label className="text-gray-900">Select Candidates</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setInputMode('manual')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                    inputMode === 'manual'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Type Manually
                </button>
                <button
                  onClick={() => setInputMode('database')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                    inputMode === 'database'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  Select from Database
                </button>
              </div>
            </div>

            {/* Manual Input Mode */}
            {inputMode === 'manual' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-600">Enter candidate details manually</p>
                  <button
                    onClick={addCandidate}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Candidate
                  </button>
                </div>
                
                <div className="space-y-3">
                  {candidates.map((candidate, index) => (
                    <div key={candidate.id} className={`flex items-center gap-3 p-4 border rounded-lg ${
                      candidate.source === 'database'
                        ? 'bg-gray-50 border-gray-300'
                        : 'bg-gray-50 border-gray-200'
                    }`}>
                      {candidate.source === 'database' && (
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
                            <Database className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      )}
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Full Name</label>
                          <input
                            type="text"
                            value={candidate.name}
                            onChange={(e) => updateCandidate(candidate.id, 'name', e.target.value)}
                            placeholder="e.g., John Doe"
                            readOnly={candidate.source === 'database'}
                            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 ${
                              candidate.source === 'database' ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 mb-1 block">Email Address</label>
                          <input
                            type="email"
                            value={candidate.email}
                            onChange={(e) => updateCandidate(candidate.id, 'email', e.target.value)}
                            placeholder="e.g., john.doe@email.com"
                            readOnly={candidate.source === 'database'}
                            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 ${
                              candidate.source === 'database' ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                          />
                        </div>
                      </div>
                      {(candidates.length > 1 || candidate.source === 'database') && (
                        <button
                          onClick={() => removeCandidate(candidate.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Database Selection Mode */}
            {inputMode === 'database' && (
              <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
                {/* Search */}
                <div className="mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or position..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>

                {/* Resume List */}
                <div className="max-h-96 overflow-y-auto space-y-2 mb-4">
                  {filteredResumes.map((resume) => (
                    <div
                      key={resume.id}
                      onClick={() => toggleResumeSelection(resume.id)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedResumes.includes(resume.id)
                          ? 'bg-gray-100 border-gray-800'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            selectedResumes.includes(resume.id)
                              ? 'bg-gray-800 border-gray-800'
                              : 'bg-white border-gray-300'
                          }`}>
                            {selectedResumes.includes(resume.id) && (
                              <CheckCircle className="w-4 h-4 text-white" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-gray-900 font-medium">{resume.name}</div>
                            <div className="text-xs text-gray-500">{resume.experience}</div>
                          </div>
                          <div className="text-sm text-gray-600 mb-2">{resume.email}</div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-gray-500">{resume.position}</span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500">{resume.phone}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {resume.skills.slice(0, 3).map((skill, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded text-xs">
                                {skill}
                              </span>
                            ))}
                            {resume.skills.length > 3 && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                +{resume.skills.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-300">
                  <div className="text-sm text-gray-800">
                    {selectedResumes.length} candidate{selectedResumes.length !== 1 ? 's' : ''} selected
                  </div>
                  <button
                    onClick={handleAddFromDatabase}
                    disabled={selectedResumes.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    <Users className="w-4 h-4" />
                    Add Selected Candidates
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Assessment Link */}
          <div className="mb-6">
            <label className="text-gray-900 mb-2 block">Assessment Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={assessmentLink}
                readOnly
                className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-600"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(assessmentLink);
                  alert('Link copied to clipboard!');
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              This unique link will be included in the email invitation
            </p>
          </div>

          {/* Custom Message */}
          <div className="mb-6">
            <label className="text-gray-900 mb-2 block">Email Message</label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use [Candidate Name] as a placeholder - it will be replaced with each candidate's name
            </p>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-gray-900 mb-2 block">Link Expiry</label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={0}>No expiry</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendCopy}
                  onChange={(e) => setSendCopy(e.target.checked)}
                  className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-500"
                />
                <span className="text-sm text-gray-700">Send me a copy</span>
              </label>
            </div>
          </div>

          {/* Email Preview */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-300 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-5 h-5 text-gray-600" />
              <h3 className="text-gray-900">Email Preview</h3>
            </div>
            <div className="bg-white rounded-lg border border-gray-300 p-4 text-sm">
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="text-xs text-gray-500 mb-1">Subject:</div>
                <div className="text-gray-900">Assessment Invitation: {assessment.title}</div>
              </div>
              <div className="whitespace-pre-wrap text-gray-700 mb-4">
                {customMessage.replace('[Candidate Name]', candidates[0].name || '[Candidate Name]')}
              </div>
              <div className="bg-gray-800 text-white px-6 py-3 rounded-lg text-center inline-block">
                Start Assessment
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                This link will expire in {expiryDays > 0 ? `${expiryDays} day${expiryDays > 1 ? 's' : ''}` : 'never'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {candidates.length} candidate{candidates.length > 1 ? 's' : ''} will receive this assessment
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!isValid || isSubmitting}
              className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Invitations
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}