'use client';

// TEMPORARY preview of the candidate loading screen. Delete after review.
import { LoadingScreen } from '@/components/candidate/LoadingScreen';

export default function TmpLoadingPreview() {
  return (
    <LoadingScreen
      message="Preparing your assessment..."
      subMessage="Please wait while we prepare your personalized assessment. This may take a moment."
      steps={['Setting up', 'Personalizing', 'Almost ready']}
    />
  );
}
