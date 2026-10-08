'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Globe,
  CheckCircle,
  ArrowRight,
  Smile,
  Sparkles,
  MessageCircle,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { revealAfterPaint } from '@/lib/utils/candidateScroll';

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

/** Friendly tips shown before the practice round and the interview. Kept to
 *  what holds for every interview: the practice round always comes next. */
const BEFORE_YOU_BEGIN: { icon: typeof Smile; title: string; text: string }[] = [
  { icon: Smile, title: 'Relax and be yourself', text: 'We just want to get to know you.' },
  { icon: Sparkles, title: 'Warm up first', text: 'A short practice round comes before the real interview.' },
  { icon: MessageCircle, title: 'Speak naturally', text: 'Answer clearly, in your own words.' },
  { icon: Video, title: 'Find your spot', text: 'A quiet, well-lit place with your camera on.' },
];

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
  // Continue — brought into view (only if it's off screen) when the video
  // ends or fails, and after a language is picked.
  const continueRef = useRef<HTMLDivElement>(null);
  const revealContinue = useCallback(() => revealAfterPaint(() => continueRef.current), []);
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
    /* One card, two columns (stacked on small screens): the video on the
       left, the welcome, candidate note, language and Continue on the right. */
    <div className="w-full">
      <div className="rounded-3xl border border-gray-100 bg-white shadow-xl shadow-brand-blue/5 p-4 sm:p-6 lg:p-8">
        {/* items-stretch: the details card fills the video column's height. */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 xl:gap-8 items-stretch">

          {/* ═══ LEFT: video ═══ */}
          {/* Each box below is 16:9 by default, which sets the row's height on
              wide screens (xl, where the columns sit side by side); xl:h-full
              then stretches it to the row, so if the
              card on the right runs taller the video box grows to match. The
              video itself is absolutely placed and object-contain, so it is
              never cropped, just centred on the dark box. */}
          <div className="min-w-0 flex flex-col">
            {videoSrc ? (
              videoError ? (
                <div className="aspect-video xl:h-full w-full rounded-2xl border border-destructive-line bg-destructive-subtle p-6 sm:p-8 flex flex-col items-center justify-center text-center">
                  <div className="text-destructive text-4xl mb-3">⚠️</div>
                  <p className="text-destructive font-medium">Failed to load the introduction video.</p>
                  <p className="text-destructive text-sm mt-1">Please check your connection and refresh the page, or continue below.</p>
                </div>
              ) : (
                <div className="relative w-full aspect-video xl:h-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-200 shadow-sm">
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    controls
                    playsInline
                    muted={isMuted}
                    className="absolute inset-0 w-full h-full object-contain"
                    onError={() => { setVideoError(true); revealContinue(); }}
                    onEnded={revealContinue}
                    // Keep the pill in step with the native controls: unmuting
                    // there must not leave the pill saying "Click to unmute".
                    onVolumeChange={(e) => setIsMuted(e.currentTarget.muted)}
                  />
                  {/* Unmute overlay — stays up so audio can be toggled any time */}
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`absolute top-3 right-3 min-h-10 flex items-center gap-1.5 text-white text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                      isMuted ? 'bg-black/70 hover:bg-black/90' : 'bg-black/40 hover:bg-black/70'
                    }`}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    {isMuted ? 'Click to unmute' : 'Mute'}
                  </button>
                </div>
              )
            ) : (
              <div className="aspect-video xl:h-full w-full rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                  <Play className="w-8 h-8 text-gray-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No Introduction Video Available</h3>
                <p className="text-gray-500 text-sm max-w-md">
                  There is no introduction video for this interview. You may continue
                  directly to the interview.
                </p>
              </div>
            )}
          </div>

          {/* ═══ RIGHT: one card, as tall as the video. Greeting at the top,
              the interview at a glance in the middle, Continue pinned to the
              bottom. ═══ */}
          <div className="min-w-0 xl:h-full rounded-2xl border border-gray-100 bg-gradient-to-b from-brand-sky/50 dark:from-brand-blue/10 to-white dark:to-slate-900 p-5 sm:p-6 flex flex-col gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-blue">Before you begin</p>
              <h2 className="mt-1.5 text-2xl sm:text-3xl font-bold text-gray-900 leading-tight break-words">
                Welcome, {candidateName}
              </h2>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                Thanks for interviewing for the{' '}
                <span className="font-semibold text-gray-900">{position}</span> role.{' '}
                {videoSrc
                  ? 'Please watch this brief introduction from our recruitment team.'
                  : 'Continue whenever you are ready.'}
              </p>
            </div>

            {/* Friendly tips before the practice round and interview */}
            <div>
              {/* 2×2 tiles (one column on phones): keeps the card short enough
                  to sit level with a 16:9 video beside it. The 1px gap over a
                  grey background draws the dividers in either layout. */}
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {BEFORE_YOU_BEGIN.map(({ icon: RowIcon, title, text }) => (
                  <li key={title} className="bg-white flex items-start gap-2.5 px-3 py-3">
                    <span className="w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                      <RowIcon className="w-4 h-4 text-brand-blue" />
                    </span>
                    <span className="min-w-0 leading-snug">
                      <span className="block text-sm font-semibold text-gray-900">{title}</span>
                      <span className="block text-xs text-gray-500">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Language Selection (only if more than 1 language) */}
            {availableLanguages.length > 1 && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Globe className="w-4 h-4 text-brand-blue" />
                  Interview Language
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableLanguages.map((lang) => {
                    const isSelected = lang === selectedLanguage;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => { onSelectLanguage(lang); revealContinue(); }}
                        aria-pressed={isSelected}
                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                          isSelected
                            ? 'border-brand-blue bg-brand-blue/10 text-brand-blue'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {isSelected && <CheckCircle className="w-4 h-4" />}
                        {lang}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* mt-auto: the button sits on the card's bottom edge, level with
                the bottom of the video. */}
            <div ref={continueRef} className="mt-auto space-y-2 scroll-mb-4">
              <Button
                variant="primary"
                size="lg"
                type="button"
                onClick={onContinue}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? 'Loading...' : 'Continue to Practice'}
                {!submitting && <ArrowRight className="w-5 h-5" />}
              </Button>
              <p className="text-center text-xs text-gray-500">
                Good luck, {candidateName}! We&apos;re rooting for you.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
