import { X, ClipboardCheck, CheckCircle, AlertCircle, FileText, Calendar, Clock, Target } from 'lucide-react';
import { Resume } from '@/lib/types/types';
import { useState } from 'react';
import { toast } from '@/components/ui/enhanced-toast';

interface Assessment {
  id: string;
  title: string;
  linkedJD: string;
  sections: number;
  questions: number;
  duration: number;
  difficulty: string;
  status: 'Active' | 'Draft';
}

interface AssignAssessmentModalProps {
  resumes: Resume[];
  assessments: Assessment[];
  onClose: () => void;
  onAssign: (assessmentId: string) => void;
}

export default function AssignAssessmentModal({
  resumes,
  assessments,
  onClose,
  onAssign,
}: AssignAssessmentModalProps) {
  const [selectedAssessment, setSelectedAssessment] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const handleAssign = async () => {
    if (!selectedAssessment) {
      toast.error({
        title: 'No Assessment Selected',
        description: 'Please select an assessment to assign.',
      });
      return;
    }

    setIsAssigning(true);

    // Simulate assignment process
    setTimeout(() => {
      setIsAssigning(false);
      toast.success({
        title: 'Assessment Assigned Successfully!',
        description: `${resumes.length} candidate${resumes.length > 1 ? 's' : ''} will receive the assessment invitation via email.`,
      });
      onAssign(selectedAssessment);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl text-gray-900">Assign Assessment</h2>
              <p className="text-sm text-gray-600">Send assessment invitations to candidates</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Selected Resumes Summary */}
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-gray-800 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm text-purple-900 mb-1">
                  {resumes.length} Candidate{resumes.length > 1 ? 's' : ''} Selected
                </h3>
                <div className="text-xs text-gray-900 space-y-1">
                  {resumes.slice(0, 3).map(resume => (
                    <div key={resume.id} className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3" />
                      {resume.name} - {resume.email}
                    </div>
                  ))}
                  {resumes.length > 3 && (
                    <div className="text-gray-800 italic">
                      +{resumes.length - 3} more candidate{resumes.length - 3 > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Assessment Selection */}
          <div className="mb-6">
            <label className="block text-sm text-gray-700 mb-3">
              Select Assessment to Assign
            </label>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {assessments.filter(assessment => assessment.status === 'Active').map(assessment => (
                <button
                  key={assessment.id}
                  onClick={() => setSelectedAssessment(assessment.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedAssessment === assessment.id
                      ? 'border-gray-800 bg-gray-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      selectedAssessment === assessment.id ? 'bg-gray-800' : 'bg-gray-100'
                    }`}>
                      <ClipboardCheck className={`w-5 h-5 ${
                        selectedAssessment === assessment.id ? 'text-white' : 'text-gray-600'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-gray-900 mb-1">{assessment.title}</h4>
                      <div className="flex items-center gap-4 text-xs text-gray-600 mb-2">
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          {assessment.linkedJD}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {assessment.duration} min
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-900 rounded">
                          {assessment.sections} Sections
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                          {assessment.questions} Questions
                        </span>
                        <span className={`px-2 py-0.5 rounded ${
                          assessment.difficulty === 'Hard' ? 'bg-red-100 text-red-700' :
                          assessment.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {assessment.difficulty}
                        </span>
                      </div>
                    </div>
                    {selectedAssessment === assessment.id && (
                      <CheckCircle className="w-5 h-5 text-gray-800 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {assessments.filter(assessment => assessment.status === 'Active').length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm">No active assessments available.</p>
                <p className="text-xs mt-1">Please create and publish an assessment first.</p>
              </div>
            )}
          </div>

          {/* Assignment Info */}
          {selectedAssessment && (
            <div className="mb-6 p-4 bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-800 mt-0.5" />
                <div>
                  <h4 className="text-sm text-gray-900 mb-2">What Happens Next?</h4>
                  <ul className="text-xs text-gray-700 space-y-1">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Email invitations will be sent to all selected candidates</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Candidates can access the assessment via secure link</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>You'll receive notifications when assessments are completed</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>Results will be available in the Assessments section</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedAssessment || isAssigning}
            className="px-6 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isAssigning ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <ClipboardCheck className="w-4 h-4" />
                Assign Assessment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
