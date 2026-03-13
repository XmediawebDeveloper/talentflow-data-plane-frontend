'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Shield,
  Camera,
  Lock,
  AlertCircle,
  Mail,
  User,
  CheckCircle,
  Smile,
  Eye,
  RefreshCw,
  Loader2,
} from 'lucide-react';

interface StepIdentityProps {
  candidateName?: string;
  candidateEmail?: string;
  position?: string;
  onVerify: (data: { name: string; email: string; candidate_id?: string; photo?: Blob }) => void;
  submitting?: boolean;
}

const LIVENESS_INSTRUCTIONS = ['Smile', 'Blink', 'Turn head slightly'];

export default function StepIdentity({
  candidateName = '',
  candidateEmail = '',
  position = 'this position',
  onVerify,
  submitting = false,
}: StepIdentityProps) {
  const [phase, setPhase] = useState<'form' | 'photo_ready' | 'liveness' | 'countdown' | 'captured'>('form');
  const [name, setName] = useState(candidateName);
  const [email, setEmail] = useState(candidateEmail);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [livenessInstruction, setLivenessInstruction] = useState('');
  const [cameraError, setCameraError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isFormValid = name.trim() !== '' && email.trim() !== '' && isEmailValid;

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setCameraError(true);
    }
  }, []);

  // Start camera when entering photo phases
  useEffect(() => {
    if (phase === 'photo_ready') {
      startCamera();
    }
  }, [phase, startCamera]);

  const handleFormSubmit = useCallback(() => {
    if (!isFormValid) return;
    setPhase('photo_ready');
  }, [isFormValid]);

  const handleStartLiveness = useCallback(() => {
    const instruction = LIVENESS_INSTRUCTIONS[Math.floor(Math.random() * LIVENESS_INSTRUCTIONS.length)];
    setLivenessInstruction(instruction);
    setPhase('liveness');

    // After 3 seconds, advance to countdown
    timerRef.current = setTimeout(() => {
      setPhase('countdown');
      setCountdown(3);

      let count = 3;
      countdownRef.current = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          // Capture frame
          if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              canvas.toBlob(
                (blob) => {
                  if (blob) {
                    setPhotoBlob(blob);
                    setPhotoPreview(URL.createObjectURL(blob));
                    setPhase('captured');
                    // Stop camera
                    if (streamRef.current) {
                      streamRef.current.getTracks().forEach((track) => track.stop());
                      streamRef.current = null;
                    }
                  }
                },
                'image/png',
              );
            }
          }
        } else {
          setCountdown(count);
        }
      }, 1000);
    }, 3000);
  }, []);

  const handleRetake = useCallback(() => {
    stopStream();
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoBlob(null);
    setPhotoPreview(null);
    setPhase('photo_ready');
  }, [stopStream, photoPreview]);

  // Auto-submit when captured
  useEffect(() => {
    if (phase === 'captured' && photoBlob) {
      onVerify({
        name: name.trim(),
        email: email.trim(),
        photo: photoBlob,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, photoBlob]);

  const handleGoBackFromPhoto = useCallback(() => {
    stopStream();
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoBlob(null);
    setPhotoPreview(null);
    setPhase('form');
  }, [stopStream, photoPreview]);

  // ────────────────────────────────────────
  // Shared sub-components
  // ────────────────────────────────────────

  const privacyCard = (
    <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">
        <Lock className="w-5 h-5 text-gray-500" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Privacy &amp; Security</h4>
        <p className="text-xs text-gray-600 leading-relaxed">
          Your personal information is encrypted and stored securely. We comply with GDPR and DPDP
          regulations. This data will only be used for interview verification and communication
          purposes.
        </p>
      </div>
    </div>
  );

  const whyWeNeedThisCard = (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-100">
        <Shield className="w-4 h-4 text-gray-600" />
        <h4 className="text-sm font-semibold text-gray-900">Why We Need This</h4>
      </div>
      <ul className="px-4 py-3 space-y-2">
        {[
          'Verify a real person is present',
          'Prevent proxy interviews and fraud',
          'Create identity evidence for interview record',
          'Ensure image is captured live, not uploaded',
        ].map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs text-gray-700">
            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  // ────────────────────────────────────────
  // PHASE A: Form
  // ────────────────────────────────────────
  if (phase === 'form') {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5" />
            Identity Verification
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Candidate Identity Verification
          </h1>
          <p className="text-gray-600 mt-2">
            The next step verifies your identity for this interview session.
          </p>
        </div>

        {/* Gradient header card */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-800 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              <Shield className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Verify Your Identity</h2>
            </div>
            <p className="text-gray-300 text-sm">
              Please provide the following information to continue with your interview for{' '}
              <span className="font-medium text-white">{position}</span>
            </p>
          </div>

          {/* Card body */}
          <div className="bg-white rounded-b-xl p-6 space-y-6">
            {/* Important Instructions */}
            <div className="border-l-4 border-gray-400 bg-gray-50 rounded-r-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Important Instructions
                  </h3>
                  <ul className="space-y-1.5 text-sm text-gray-700">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-1">&#8226;</span>
                      Enter your name exactly as it appears on your government ID
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-1">&#8226;</span>
                      Provide a valid email address for interview notifications
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-1">&#8226;</span>
                      This information will be used for identity verification purposes
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Full Name input */}
            <div>
              <label htmlFor="identity-name" className="flex items-center gap-1.5 text-sm font-medium text-gray-900 mb-1.5">
                <User className="w-4 h-4 text-gray-500" />
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="identity-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Example: John Michael Smith"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
              />
            </div>

            {/* Email Address input */}
            <div>
              <label htmlFor="identity-email" className="flex items-center gap-1.5 text-sm font-medium text-gray-900 mb-1.5">
                <Mail className="w-4 h-4 text-gray-500" />
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                id="identity-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Example: john.smith@example.com"
                readOnly={!!candidateEmail}
                className={`w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors ${
                  candidateEmail ? 'bg-gray-50 cursor-not-allowed' : ''
                }`}
              />
            </div>

            {/* Privacy & Security */}
            {privacyCard}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            &larr; Go Back
          </button>
          <button
            type="button"
            onClick={handleFormSubmit}
            disabled={!isFormValid || submitting}
            className="inline-flex items-center gap-2 bg-gray-900 text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>Verify &amp; Continue &rarr;</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // PHASE B: Live Photo Capture
  // (photo_ready | liveness | countdown | captured)
  // ────────────────────────────────────────

  const isPhotoPhase = phase === 'photo_ready' || phase === 'liveness' || phase === 'countdown' || phase === 'captured';

  const renderRightColumn = () => {
    if (phase === 'photo_ready') {
      return (
        <div className="space-y-4">
          {whyWeNeedThisCard}

          {/* Before We Begin */}
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-yellow-900 mb-2">Before We Begin</h4>
            <ul className="space-y-1.5 text-xs text-yellow-800">
              {[
                'Position yourself in center of camera frame',
                'Ensure good lighting on your face',
                'Remove any sunglasses or face coverings',
                'Look directly at the camera',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Start button */}
          <button
            type="button"
            onClick={handleStartLiveness}
            disabled={cameraError}
            className="w-full inline-flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            Start Liveness Check &rarr;
          </button>
        </div>
      );
    }

    if (phase === 'liveness') {
      return (
        <div className="space-y-4">
          {whyWeNeedThisCard}

          {/* Liveness Detection */}
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-yellow-900 mb-2">Liveness Detection</h4>
            <p className="text-xs text-yellow-800 mb-3">Please follow this instruction</p>
            <p className="text-xl font-bold text-yellow-900 mb-3">{livenessInstruction}</p>
            <div className="flex items-center gap-2 text-green-600 text-xs font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Detecting liveness...
            </div>
          </div>
        </div>
      );
    }

    if (phase === 'countdown') {
      return (
        <div className="space-y-4">
          {whyWeNeedThisCard}

          {/* Capturing Photo */}
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Camera className="w-4 h-4 text-yellow-700" />
              <h4 className="text-sm font-semibold text-yellow-900">Capturing Photo...</h4>
            </div>
            <p className="text-xs text-yellow-800">Hold still and look at the camera</p>
          </div>
        </div>
      );
    }

    if (phase === 'captured') {
      return (
        <div className="space-y-4">
          {/* Success */}
          <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-green-900">Photo Captured Successfully!</h4>
              <p className="text-xs text-green-700 mt-1">
                Your identity photo has been captured and will be used for verification.
              </p>
            </div>
          </div>

          {/* Retake button */}
          <button
            type="button"
            onClick={handleRetake}
            className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 font-medium py-2.5 px-5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Retake Photo
          </button>
        </div>
      );
    }

    return null;
  };

  if (isPhotoPhase) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Camera className="w-3.5 h-3.5" />
            Live Photo Capture
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Identity Validation</h1>
          <p className="text-gray-600 mt-2">
            Take a live photo to verify your identity and prevent proxy interviews.
          </p>
        </div>

        {/* Gradient header + card */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-800 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              <Shield className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Live Identity Verification</h2>
            </div>
            <p className="text-gray-300 text-sm">
              Secure identity validation for{' '}
              <span className="font-medium text-white">{position}</span>
            </p>
          </div>

          {/* Card body: 2-column */}
          <div className="bg-white rounded-b-xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column: Webcam */}
              <div className="relative bg-gray-900 rounded-xl aspect-video overflow-hidden flex items-center justify-center">
                {/* Live video feed */}
                {phase !== 'captured' && (
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Captured photo */}
                {phase === 'captured' && photoPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview}
                    alt="Captured identity photo"
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Camera error state */}
                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white gap-2">
                    <Camera className="w-10 h-10 text-gray-400" />
                    <p className="text-sm text-gray-300">Camera access denied</p>
                    <p className="text-xs text-gray-500">Please allow camera access and try again</p>
                  </div>
                )}

                {/* Liveness overlay: green circle border */}
                {phase === 'liveness' && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 md:w-56 md:h-56 rounded-full border-4 border-green-400 animate-pulse" />
                    </div>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-green-600/90 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Performing Liveness Check...
                    </div>
                  </>
                )}

                {/* Countdown overlay */}
                {phase === 'countdown' && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                    <span className="text-7xl font-bold text-white">{countdown}</span>
                    <span className="text-sm text-gray-300 mt-2">Get ready...</span>
                  </div>
                )}

                {/* Camera Active badge (bottom-left) */}
                {phase !== 'captured' && !cameraError && (
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    Camera Active
                  </div>
                )}

                {/* Live View badge (bottom-right) */}
                {phase !== 'captured' && !cameraError && phase !== 'liveness' && (
                  <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                    Live View
                  </div>
                )}
              </div>

              {/* Right column */}
              <div>{renderRightColumn()}</div>
            </div>

            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        {/* Privacy card */}
        {privacyCard}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleGoBackFromPhoto}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            &larr; Go Back
          </button>
          <button
            type="button"
            onClick={() => {
              stopStream();
            }}
            className="inline-flex items-center gap-2 border border-red-300 text-red-600 font-medium py-2 px-5 rounded-lg hover:bg-red-50 transition-colors text-sm"
          >
            Cancel Interview
          </button>
        </div>
      </div>
    );
  }

  return null;
}
