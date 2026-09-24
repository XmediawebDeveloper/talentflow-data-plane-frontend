'use client';

// TEMPORARY preview of the assessment submission loading screen. Delete after review.
import { LoadingScreen } from '@/components/candidate/LoadingScreen';

export default function TmpSubmittingPreview() {
  return (
    <LoadingScreen
      message="Submitting your assessment..."
      subMessage="Please wait while we save your responses and process your submission."
    />
  );
}
