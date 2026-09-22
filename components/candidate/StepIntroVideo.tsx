'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Globe,
  CheckCircle,
  ChevronRight,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StepIntroVideoProps {
  candidateName?: string;
  position?: string;
  interviewType?: string;
  duration?: number;
  introductionVideoUrl?: string | null;
  token: string;
  availableLanguages: string[];
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  submitting?: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function StepIntroVideo({
  candidateName = 'Candidate',
  position = 'Open Position',
  interviewType = 'AI Interview',
  duration = 30,
  introductionVideoUrl,
  token,
  availableLanguages,
  selectedLanguage,
  onSelectLanguage,
  onContinue,
  onSkip,
  submitting = false,
}: StepIntroVideoProps) {
  // Build the public intro video URL using the candidate token endpoint
  const videoSrc = introductionVideoUrl
    ? `${API_BASE_URL}/candidate/ai-interview/${token}/intro-video`
    : null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);
  // Browser autoplay policy blocks audio on programmatic play() — start muted,
  // then unmute via explicit user gesture so sound always works.
  const [isMuted, setIsMuted] = useState(true);

  // Autoplay muted (always permitted by browsers). We show a prominent unmute
  // button so the user can enable audio with a single click.
  useEffect(() => {
    if (!videoRef.current || !videoSrc) return;
    videoRef.current.muted = true;
    videoRef.current.play().catch(() => {
      // Even muted autoplay blocked — controls let the user start manually.
    });
  }, [videoSrc]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const next = !videoRef.current.muted;
    videoRef.current.muted = next;
    setIsMuted(next);
    // If the video was paused (autoplay blocked), start it now that user is interacting.
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6" style={{ colorScheme: 'light' }}>
      {/* Blue gradient header card */}
      <div className="bg-gray-800 rounded-2xl p-8 text-center text-white shadow-lg">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Play className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Welcome to Your Interview</h2>
        </div>
        <p className="text-gray-300 text-sm">
          Please watch this brief introduction from our recruitment team
        </p>
      </div>

      {/* Video section */}
      {videoSrc ? (
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            {videoError ? (
              <div className="w-full max-w-2xl rounded-xl border border-destructive-line bg-destructive-subtle p-8 text-center">
                <div className="text-destructive text-4xl mb-3">⚠️</div>
                <p className="text-destructive font-medium">Failed to load the introduction video.</p>
                <p className="text-destructive text-sm mt-1">Please check your connection and refresh the page, or skip and continue.</p>
              </div>
            ) : (
              <div className="relative w-full max-w-2xl">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  playsInline
                  muted={isMuted}
                  className="w-full rounded-xl border border-gray-200 shadow-sm"
                  onError={() => setVideoError(true)}
                />
                {/* Unmute overlay — shown until user enables audio */}
                {isMuted && (
                  <button
                    onClick={toggleMute}
                    className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                  >
                    <VolumeX className="w-3.5 h-3.5" />
                    Click to unmute
                  </button>
                )}
                {!isMuted && (
                  <button
                    onClick={toggleMute}
                    className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/40 hover:bg-black/70 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Mute
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1 rounded-full">
              <Play className="w-3.5 h-3.5" />
              Introduction Video
            </span>
            <h3 className="text-xl font-bold text-gray-900">
              Welcome, {candidateName}!
            </h3>
            <p className="text-gray-600 text-sm max-w-xl mx-auto">
              Thank you for taking the time to interview for the{' '}
              <span className="font-medium text-gray-800">{position}</span>{' '}
              position. Please watch the introduction video above to learn more
              about the role and what to expect during your interview.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center space-y-3">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
            <Play className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            No Introduction Video Available
          </h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            There is no introduction video for this interview. You may continue
            directly to the interview or review the details below.
          </p>
        </div>
      )}

      {/* Language Selection (only if more than 1 language) */}
      {availableLanguages.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-800 px-6 py-4 flex items-center gap-3">
            <Globe className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-white font-semibold">
                Select Interview Language
              </h3>
              <p className="text-gray-300 text-xs">
                The AI interviewer will conduct the interview in your selected
                language
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {availableLanguages.map((lang) => {
                const isSelected = lang === selectedLanguage;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => onSelectLanguage(lang)}
                    className={`relative border rounded-xl p-4 text-center transition-all ${
                      isSelected
                        ? 'border-gray-800 bg-gray-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-400'
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle className="w-5 h-5 text-gray-600 absolute top-2 right-2" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        isSelected ? 'text-gray-700' : 'text-gray-700'
                      }`}
                    >
                      {lang}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-success font-medium">
              Current Selection: {selectedLanguage}
            </p>
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-end pt-2 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            type="button"
            onClick={onContinue}
            disabled={submitting}
          >
            {submitting ? 'Loading...' : 'Continue to Interview'}
            {!submitting && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
