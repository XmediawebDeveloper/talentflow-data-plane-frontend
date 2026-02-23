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
  is_archived?: boolean;
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-hidden animate-scale-in flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-semibold text-gray-900">Assign Assessment</h2>
              <p className="text-xs sm:text-sm text-gray-600">Send assessment invitations to candidates</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* Selected Resumes Summary */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-start gap-2 sm:gap-3">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-1">
                  {resumes.length} Candidate{resumes.length > 1 ? 's' : ''} Selected
                </h3>
                <div className="text-xs text-gray-900 space-y-1">
                  {resumes.slice(0, 3).map(resume => (
                    <div key={resume.id} className="flex items-center gap-2 min-w-0">
                      <CheckCircle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{resume.name} - {resume.email}</span>
                    </div>
                  ))}
                  {resumes.length > 3 && (
                    <div className="text-gray-800 font-medium italic">
                      +{resumes.length - 3} more candidate{resumes.length - 3 > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Assessment Selection */}
          <div className="mb-4 sm:mb-6">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">
              Select Assessment to Assign
            </label>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {assessments.filter(assessment => assessment.status === 'Active' && !assessment.is_archived).map(assessment => (
                <button
                  key={assessment.id}
                  onClick={() => setSelectedAssessment(assessment.id)}
                  className={`w-full text-left p-3 sm:p-4 rounded-lg border-2 transition-all ${
                    selectedAssessment === assessment.id
                      ? 'border-gray-800 bg-gray-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedAssessment === assessment.id ? 'bg-gray-800' : 'bg-gray-100'
                    }`}>
                      <ClipboardCheck className={`w-4 h-4 sm:w-5 sm:h-5 ${
                        selectedAssessment === assessment.id ? 'text-white' : 'text-gray-700'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">{assessment.title}</h4>
                      <div className="flex items-center gap-2 sm:gap-4 text-xs text-gray-700 mb-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{assessment.linkedJD}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {assessment.duration} min
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-wrap">
                        <span className="px-1.5 sm:px-2 py-0.5 bg-gray-100 text-gray-900 rounded font-medium">
                          {assessment.sections} Sections
                        </span>
                        <span className="px-1.5 sm:px-2 py-0.5 bg-gray-100 text-gray-800 rounded font-medium">
                          {assessment.questions} Questions
                        </span>
                        <span className={`px-1.5 sm:px-2 py-0.5 rounded font-medium ${
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

            {assessments.filter(assessment => assessment.status === 'Active' && !assessment.is_archived).length === 0 && (
              <div className="text-center py-6 sm:py-8 text-gray-500">
                <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-xs sm:text-sm font-medium">No active assessments available.</p>
                <p className="text-xs mt-1">Please create and publish an assessment first.</p>
              </div>
            )}
          </div>

          {/* Assignment Info */}
          {selectedAssessment && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 mb-2">What Happens Next?</h4>
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
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <button
            onClick={onClose}
            className="order-2 sm:order-1 px-4 py-2 sm:py-2.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedAssessment || isAssigning}
            className="order-1 sm:order-2 px-4 sm:px-6 py-2 sm:py-2.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
