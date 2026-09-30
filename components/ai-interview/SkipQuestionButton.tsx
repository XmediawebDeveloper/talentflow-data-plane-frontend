'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SkipForward } from 'lucide-react';

interface SkipQuestionButtonProps {
  skipCount: number;
  maxSkips: number;
  onSkip: () => void;
  disabled?: boolean;
}

export default function SkipQuestionButton({
  skipCount,
  maxSkips,
  onSkip,
  disabled,
}: SkipQuestionButtonProps) {
  const remaining = maxSkips - skipCount;
  const canSkip = remaining > 0 && !disabled;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!canSkip}
          className="gap-2 text-gray-400 border-gray-600 hover:text-white hover:border-gray-400"
          title={!canSkip ? 'No skips remaining' : `Skip this question (${remaining} remaining)`}
        >
          <SkipForward className="w-4 h-4" />
          Skip ({remaining}/{maxSkips})
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-gray-900 border-gray-700 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>Skip this question?</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            Skipping will affect your score for this skill. You have{' '}
            <span className="text-white font-medium">{remaining} skip{remaining !== 1 ? 's' : ''}</span>{' '}
            remaining.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onSkip}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Yes, Skip
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
