import { X, ClipboardCheck, ClipboardList, CheckCircle, AlertCircle, FileText, Calendar, Clock, Target, Loader2 } from 'lucide-react';
import { Resume } from '@/lib/types/types';
import { useState } from 'react';
import { toast } from '@/components/ui/enhanced-toast';
import { Button } from '@/components/ui/button';

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
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <ClipboardList className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight truncate">Assign Assessment</h2>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Send assessment invitations to candidates</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="px-2 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">
          {/* Selected Resumes Summary */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
            <div className="flex items-start gap-2 sm:gap-3">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 dark:text-slate-100 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-slate-100 mb-1">
                  {resumes.length} Candidate{resumes.length > 1 ? 's' : ''} Selected
                </h3>
                <div className="text-xs text-gray-900 dark:text-slate-50 space-y-1">
                  {resumes.slice(0, 3).map(resume => (
                    <div key={resume.id} className="flex items-center gap-2 min-w-0">
                      <CheckCircle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate" title={`${resume.name} - ${resume.email}`}>{resume.name} - {resume.email}</span>
                    </div>
                  ))}
                  {resumes.length > 3 && (
                    <div className="text-gray-800 dark:text-slate-100 font-medium italic">
                      +{resumes.length - 3} more candidate{resumes.length - 3 > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Assessment Selection */}
          <div className="mb-4 sm:mb-6">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 sm:mb-3">
              Select Assessment to Assign
            </label>

            <div className="space-y-2 sm:max-h-96 sm:overflow-y-auto">
              {assessments.filter(assessment => assessment.status === 'Active' && !assessment.is_archived).map(assessment => (
                <button
                  key={assessment.id}
                  onClick={() => setSelectedAssessment(assessment.id)}
                  className={`w-full text-left p-3 sm:p-4 rounded-lg border-2 transition-all ${
                    selectedAssessment === assessment.id
                      ? 'border-brand-blue/40 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                      : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                  }`}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedAssessment === assessment.id ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300'
                    }`}>
                      <ClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 mb-1 [overflow-wrap:anywhere]">{assessment.title}</h4>
                      <div className="flex items-center gap-2 sm:gap-4 text-xs text-gray-700 dark:text-slate-300 mb-2 flex-wrap">
                        <span className="flex items-center gap-1 min-w-0 max-w-full">
                          <Target className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{assessment.linkedJD}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {assessment.duration} min
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-wrap">
                        <span className="px-1.5 sm:px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-50 rounded font-medium">
                          {assessment.sections} Sections
                        </span>
                        <span className="px-1.5 sm:px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-100 rounded font-medium">
                          {assessment.questions} Questions
                        </span>
                        <span className={`px-1.5 sm:px-2 py-0.5 rounded font-medium ${
                          assessment.difficulty === 'Hard' ? 'bg-destructive-subtle text-destructive' :
                          assessment.difficulty === 'Medium' ? 'bg-warning-subtle text-warning' :
                          'bg-success-subtle text-success'
                        }`}>
                          {assessment.difficulty}
                        </span>
                      </div>
                    </div>
                    {selectedAssessment === assessment.id && (
                      <CheckCircle className="w-5 h-5 text-brand-blue flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {assessments.filter(assessment => assessment.status === 'Active' && !assessment.is_archived).length === 0 && (
              <div className="text-center py-6 sm:py-8 text-gray-500 dark:text-slate-500">
                <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400 dark:text-slate-500" />
                <p className="text-xs sm:text-sm font-medium">No active assessments available.</p>
                <p className="text-xs mt-1">Please create and publish an assessment first.</p>
              </div>
            )}
          </div>

          {/* Assignment Info */}
          {selectedAssessment && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">What Happens Next?</h4>
                  <ul className="text-xs text-gray-700 dark:text-slate-300 space-y-1">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                      <span>Email invitations will be sent to all selected candidates</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                      <span>Candidates can access the assessment via secure link</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                      <span>You'll receive notifications when assessments are completed</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                      <span>Results will be available in the Assessments section</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <Button
            variant="primary"
            onClick={handleAssign}
            disabled={!selectedAssessment || isAssigning}
            className="order-1 sm:order-2"
          >
            {isAssigning ? (
              <>
                <Loader2 className="w-4 h-4 text-white animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <ClipboardCheck className="w-4 h-4" />
                Assign Assessment
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
