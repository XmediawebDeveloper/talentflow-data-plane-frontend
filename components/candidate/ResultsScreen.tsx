'use client';

import { CheckCircle, FileText, Clock, CheckSquare } from 'lucide-react';
import { AssessmentInfo, AssessmentResult } from '@/lib/services/candidateService';

interface ResultsScreenProps {
  results: AssessmentResult;
  assessmentInfo: AssessmentInfo;
}

export function ResultsScreen({ results, assessmentInfo }: ResultsScreenProps) {
  // Safe accessors with defaults
  const assessmentTitle = results.assessment_title || assessmentInfo?.assessment_title || 'Assessment';
  const completedAt = results.completed_at ? new Date(results.completed_at) : new Date();
  // Exclude HR round from the headline question count — HR questions are
  // behavioral and not scored the same way; recruiters and candidates expect
  // the count to reflect only technical/coding questions.
  const totalQuestions =
    results.question_evaluations?.filter(q => q.round_type !== 'hr').length
    || assessmentInfo?.duration_minutes
    || 0;
  const durationMinutes = assessmentInfo?.duration_minutes || 30;

  // Format duration
  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${minutes}m`;
  };

  // Generate a simple assessment ID for display
  const assessmentId = results.attempt_id
    ? `assessment-${results.attempt_id.slice(-8)}`
    : `assessment-${Date.now().toString(36)}`;

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-5 sm:p-8">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-success-subtle rounded-full flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-success" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl sm:text-3xl font-bold text-gray-800 text-center mb-4">
          Assessment Completed!
        </h1>

        {/* Thank you message */}
        <p className="text-gray-600 text-center mb-8 px-4">
          Thank you for completing the {assessmentTitle}. Your responses have been recorded and submitted successfully.
        </p>

        {/* What Happens Next Section */}
        <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-4 sm:p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 text-center mb-4">
            What Happens Next?
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-brand-blue rounded-full flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-medium">1</span>
              </div>
              <p className="tf-body">
                Your assessment results are being analyzed by our AI system
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-brand-blue rounded-full flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-medium">2</span>
              </div>
              <p className="tf-body">
                Our recruitment team will review your performance and responses
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-brand-blue rounded-full flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-medium">3</span>
              </div>
              <p className="tf-body">
                You'll receive an email update within 3-5 business days
              </p>
            </div>
          </div>
        </div>

        {/* Thank You Card */}
        <div className="rounded-xl border border-success-line bg-success-subtle p-4 mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-lg">&#x1F44D;</span>
            <span className="font-semibold text-success">Thank You!</span>
          </div>
          <p className="text-sm text-success">
            We appreciate the time and effort you put into this assessment. Good luck with your application!
          </p>
        </div>

        {/* Stats Grid */}
        {/* Three columns held at every width — the tiles are a number and a
            one-word label, so stacking them would make a short summary three
            screens tall. What scales instead is the type and the padding:
            at 320px a column is ~88px, and a `text-2xl` "1h 30m" did not fit
            in it. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
          <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
            <FileText className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="tf-body-muted mb-1">Questions</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-800 break-words">{totalQuestions}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
            <Clock className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="tf-body-muted mb-1">Duration</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-800 break-words">{formatDuration(durationMinutes)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
            <CheckSquare className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="tf-body-muted mb-1">Status</p>
            <div className="flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-success" />
            </div>
          </div>
        </div>

        {/* Assessment ID and Date */}
        <div className="text-center text-sm text-gray-400">
          <p>
            Assessment ID: {assessmentId} • Submitted on {completedAt.toLocaleDateString('en-US', {
              timeZone: 'Asia/Kolkata',
              month: '2-digit',
              day: '2-digit',
              year: 'numeric'
            })} at {completedAt.toLocaleTimeString('en-US', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })} IST (UTC+5:30)
          </p>
        </div>
      </div>
    </div>
  );
}
