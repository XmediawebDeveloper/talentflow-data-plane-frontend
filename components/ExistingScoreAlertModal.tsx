'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Eye, RefreshCw, X, Calendar, User, Target } from 'lucide-react';
import { format } from 'date-fns';

interface ExistingScore {
  resume_id: string;
  score_id: string;
  candidate_name: string;
  candidate_email: string;
  overall_score: number;
  match_status: string;
  scored_at: string | null;
}

interface ExistingScoreAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdTitle: string;
  existingScores: ExistingScore[];
  totalChecked: number;
  newCount: number;
  onViewExisting: (scoreId: string) => void;
  onProceedWithRescoring: () => void;
  onProceedWithNewOnly?: () => void;
}

const getMatchStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'excellent':
    case 'exact_match':
      return 'bg-green-100 text-green-800';
    case 'good':
    case 'partial':
    case 'partial_match':
      return 'bg-yellow-100 text-yellow-800';
    case 'poor':
    case 'no_match':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const formatMatchStatus = (status: string) => {
  return status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
};

export function ExistingScoreAlertModal({
  isOpen,
  onClose,
  jdTitle,
  existingScores,
  totalChecked,
  newCount,
  onViewExisting,
  onProceedWithRescoring,
  onProceedWithNewOnly,
}: ExistingScoreAlertModalProps) {
  const existingCount = existingScores.length;
  const isSingleResume = totalChecked === 1;
  const allAlreadyScored = existingCount === totalChecked;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            {allAlreadyScored
              ? (isSingleResume ? 'Resume Already Scored' : 'All Resumes Already Scored')
              : 'Some Resumes Already Scored'}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-gray-600 mb-4">
            {allAlreadyScored ? (
              isSingleResume ? (
                <>
                  This resume has already been scored against <span className="font-medium">{jdTitle}</span>. You can view the existing score below.
                </>
              ) : (
                <>
                  All <span className="font-medium">{existingCount}</span> selected resumes have already been
                  scored against <span className="font-medium">{jdTitle}</span>. You can view the existing scores below.
                </>
              )
            ) : (
              <>
                <span className="font-medium">{existingCount}</span> of{' '}
                <span className="font-medium">{totalChecked}</span> selected resumes have already been
                scored against <span className="font-medium">{jdTitle}</span>.
              </>
            )}
          </p>

          {/* Existing Scores List */}
          <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
            {existingScores.map((score) => (
              <div
                key={score.score_id}
                className="p-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => onViewExisting(score.score_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-sm">{score.candidate_name || 'Unknown'}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${getMatchStatusColor(
                      score.match_status
                    )}`}
                  >
                    {formatMatchStatus(score.match_status)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    <span>Score: {score.overall_score}%</span>
                  </div>
                  {score.scored_at && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{format(new Date(score.scored_at), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">{score.candidate_email}</div>
              </div>
            ))}
          </div>

          {/* Summary */}
          {!isSingleResume && newCount > 0 && (
            <p className="text-sm text-gray-500 mt-3">
              <span className="font-medium text-green-600">{newCount}</span> resume(s) have not been
              scored yet.
            </p>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="flex items-center gap-2">
            <X className="w-4 h-4" />
            {allAlreadyScored ? 'Close' : 'Cancel'}
          </Button>

          {allAlreadyScored && existingScores.length === 1 && (
            <Button
              onClick={() => onViewExisting(existingScores[0].score_id)}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900"
            >
              <Eye className="w-4 h-4" />
              View Existing Score
            </Button>
          )}

          {!allAlreadyScored && newCount > 0 && onProceedWithNewOnly && (
            <Button
              onClick={onProceedWithNewOnly}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <Target className="w-4 h-4" />
              Score New Only ({newCount})
            </Button>
          )}

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExistingScoreAlertModal;
