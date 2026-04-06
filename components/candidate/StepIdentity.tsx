'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Shield, Camera, Lock, AlertCircle, Mail, User,
  CheckCircle, RefreshCw, Loader2, Smile, Eye, ArrowRight, KeyRound,
} from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';

interface StepIdentityProps {
  token: string;
  candidateName?: string;
  candidateEmail?: string;
  position?: string;
  onVerify: (data: { name: string; email: string; candidate_id?: string; photo?: Blob }) => void;
  submitting?: boolean;
}

const LIVENESS_STEPS = [
  { action: 'Smile', icon: Smile, description: 'Show a natural smile for the camera', color: 'text-yellow-500' },
  { action: 'Blink slowly', icon: Eye, description: 'Slowly blink both eyes once', color: 'text-blue-500' },
  { action: 'Turn slightly', icon: ArrowRight, description: 'Gently turn your head left, then back', color: 'text-purple-500' },
];
const STEP_DURATION_MS = 2200;

export default function StepIdentity({
  token,
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
  const [livenessStepIdx, setLivenessStepIdx] = useState(0);
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [cameraError, setCameraError] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);

  // OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isFormValid = name.trim() !== '' && email.trim() !== '' && isEmailValid && otpVerified;

  const startCooldown = useCallback(() => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendOtp = useCallback(async () => {
    if (!isEmailValid || otpSending) return;
    setOtpSending(true);
    setOtpError(null);
    try {
      await candidateAIInterviewService.sendOtp(token, email.trim());
      setOtpSent(true);
      setOtpCode('');
      setOtpVerified(false);
      startCooldown();
    } catch {
      setOtpError('Failed to send OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }, [isEmailValid, otpSending, token, email, startCooldown]);

  const handleVerifyOtp = useCallback(async () => {
    if (otpCode.length < 4 || otpVerifying) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await candidateAIInterviewService.verifyOtp(token, email.trim(), otpCode.trim());
      if (res.verified) {
        setOtpVerified(true);
        setOtpError(null);
      } else {
        setOtpError(res.message || 'Invalid OTP. Please try again.');
      }
    } catch {
      setOtpError('Invalid or expired OTP. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  }, [otpCode, otpVerifying, token, email]);


  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { setCameraError(true); }
  }, []);

  useEffect(() => {
    if (phase === 'photo_ready') startCamera();
  }, [phase, startCamera]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Face count check (best-effort)
    let faceCheckPassed = true;
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        const detector = new (window as any).FaceDetector({ fastMode: true });
        const faces = await detector.detect(video);
        if (faces.length === 0) {
          setFaceError('No face detected. Position your face clearly and try again.');
          faceCheckPassed = false; setPhase('photo_ready');
        } else if (faces.length > 1) {
          setFaceError(`${faces.length} faces detected. Ensure only you are visible and try again.`);
          faceCheckPassed = false; setPhase('photo_ready');
        } else { setFaceError(null); }
      } catch { setFaceError(null); }
    }

    if (faceCheckPassed) {
      canvas.toBlob(blob => {
        if (blob) {
          setPhotoBlob(blob);
          setPhotoPreview(URL.createObjectURL(blob));
          setPhase('captured');
          streamRef.current?.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      }, 'image/png');
    }
  }, []);

  const handleFormSubmit = useCallback(() => {
    if (isFormValid) setPhase('photo_ready');
  }, [isFormValid]);

  const handleStartLiveness = useCallback(() => {
    if (cameraError) return;
    setFaceError(null);

    const runStep = (stepIdx: number) => {
      if (stepIdx >= LIVENESS_STEPS.length) {
        // All liveness steps done — start countdown
        setPhase('countdown');
        setCountdown(3);
        let count = 3;
        countdownRef.current = setInterval(async () => {
          count -= 1;
          if (count <= 0) {
            clearInterval(countdownRef.current!);
            countdownRef.current = null;
            await capturePhoto();
          } else {
            setCountdown(count);
          }
        }, 1000);
        return;
      }

      setLivenessStepIdx(stepIdx);
      setLivenessProgress(0);
      setPhase('liveness');

      const startTime = performance.now();
      const animate = (now: number) => {
        const progress = Math.min(((now - startTime) / STEP_DURATION_MS) * 100, 100);
        setLivenessProgress(progress);
        if (progress < 100) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          animFrameRef.current = null;
          runStep(stepIdx + 1);
        }
      };
      animFrameRef.current = requestAnimationFrame(animate);
    };

    runStep(0);
  }, [cameraError, capturePhoto]);

  const handleRetake = useCallback(() => {
    stopStream();
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null); setPhotoPreview(null);
    setPhase('photo_ready');
  }, [stopStream, photoPreview]);

  const handleGoBackFromPhoto = useCallback(() => {
    stopStream();
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null); setPhotoPreview(null);
    setPhase('form');
  }, [stopStream, photoPreview]);

  // Auto-submit after capture
  useEffect(() => {
    if (phase === 'captured' && photoBlob) {
      onVerify({ name: name.trim(), email: email.trim(), photo: photoBlob });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, photoBlob]);

  // ── Progress stepper (2 sections) ──
  const isPhotoPhase = phase !== 'form';
  const isComplete = phase === 'captured';

  const progressStepper = (
    <div className="flex items-center justify-center mb-6">
      {/* Step 1 */}
      <div className="flex flex-col items-center gap-1.5">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
          isPhotoPhase
            ? 'bg-gray-900 border-gray-900 text-white'
            : 'bg-gray-900 border-gray-900 text-white'
        }`}>
          {isPhotoPhase ? <CheckCircle className="w-5 h-5" /> : '1'}
        </div>
        <span className={`text-xs font-medium ${isPhotoPhase ? 'text-gray-500' : 'text-gray-900'}`}>
          Candidate Details
        </span>
      </div>

      {/* Connector */}
      <div className={`h-0.5 w-20 mx-2 mb-5 transition-all ${isPhotoPhase ? 'bg-gray-900' : 'bg-gray-200'}`} />

      {/* Step 2 */}
      <div className="flex flex-col items-center gap-1.5">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
          isComplete
            ? 'bg-gray-900 border-gray-900 text-white'
            : isPhotoPhase
              ? 'bg-gray-900 border-gray-900 text-white'
              : 'bg-white border-gray-300 text-gray-400'
        }`}>
          {isComplete ? <CheckCircle className="w-5 h-5" /> : '2'}
        </div>
        <span className={`text-xs font-medium ${isPhotoPhase ? 'text-gray-900' : 'text-gray-400'}`}>
          Live Photo Capture
        </span>
      </div>
    </div>
  );

  // ── Privacy card ──
  const privacyCard = (
    <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
      <Lock className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Privacy &amp; Security</h4>
        <p className="text-xs text-gray-600 leading-relaxed">
          Your information is encrypted and stored securely under GDPR and DPDP regulations.
          Used only for interview verification purposes.
        </p>
      </div>
    </div>
  );

  // ── PHASE A: Form ──
  if (phase === 'form') {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {progressStepper}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
            <Shield className="w-3.5 h-3.5" /> Identity Verification
          </span>
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Identity</h1>
          <p className="text-gray-600 mt-1 text-sm">
            Confirm your details to proceed with the interview for <strong>{position}</strong>
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-gray-800 px-6 py-4">
            <div className="flex items-center gap-2 text-white">
              <Shield className="w-5 h-5" />
              <h2 className="font-semibold">Candidate Details</h2>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg p-3">
              <p className="text-sm text-amber-800 font-medium">Important</p>
              <p className="text-xs text-amber-700 mt-1">Enter your name exactly as it appears on your government ID.</p>
            </div>

            <div>
              <label htmlFor="identity-name" className="flex items-center gap-1.5 text-sm font-medium text-gray-900 mb-1.5">
                <User className="w-4 h-4 text-gray-500" /> Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="identity-name" type="text" value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. John Michael Smith"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="identity-email" className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <Mail className="w-4 h-4 text-gray-500" /> Email Address <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="identity-email" type="email" value={email}
                  readOnly
                  className={`flex-1 px-4 py-2.5 border rounded-lg text-sm bg-gray-50 cursor-not-allowed transition-colors ${
                    otpVerified ? 'border-green-400 bg-green-50' : 'border-gray-200'
                  }`}
                />
                {!otpVerified && !otpSent && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={!isEmailValid || otpSending}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {otpSending
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                      : 'Get OTP'
                    }
                  </button>
                )}
                {otpVerified && (
                  <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium px-3">
                    <CheckCircle className="w-4 h-4" /> Verified
                  </div>
                )}
              </div>

              {/* OTP input — shown after OTP sent, hidden once verified */}
              {otpSent && !otpVerified && (
                <div className="space-y-3">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    <KeyRound className="w-4 h-4 text-gray-500" /> Enter OTP <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '')); setOtpError(null); }}
                      onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                      placeholder="Enter 6-digit OTP"
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 tracking-widest font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={otpCode.length < 4 || otpVerifying}
                      className="flex-shrink-0 flex items-center gap-1.5 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {otpVerifying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</> : 'Verify OTP'}
                    </button>
                  </div>

                  {/* Resend timer */}
                  <div className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg border border-gray-100">
                    {resendCooldown > 0 ? (
                      <>
                        {/* Circular countdown */}
                        <div className="relative flex-shrink-0 w-9 h-9">
                          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="15" fill="none"
                              stroke="#374151" strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={2 * Math.PI * 15}
                              strokeDashoffset={2 * Math.PI * 15 * (1 - resendCooldown / 60)}
                              style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
                            {resendCooldown}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700">OTP sent to <span className="font-semibold">{email}</span></p>
                          <p className="text-xs text-gray-500">Resend available in {resendCooldown}s</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <RefreshCw className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-600">Didn't receive the OTP?</p>
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={otpSending}
                            className="text-sm font-semibold text-gray-900 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {otpSending ? 'Sending…' : 'Resend OTP'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {otpError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {otpError}
                </div>
              )}
            </div>

            {privacyCard}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button" onClick={handleFormSubmit}
            disabled={!isFormValid || submitting}
            className="inline-flex items-center gap-2 bg-gray-900 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
              : !otpVerified
                ? <>Verify Email to Continue <ArrowRight className="w-4 h-4" /></>
                : <>Continue to Photo <ArrowRight className="w-4 h-4" /></>
            }
          </button>
        </div>
      </div>
    );
  }

  // ── PHASES B-E: Live Photo Capture ──
  const currentLivenessStep = LIVENESS_STEPS[livenessStepIdx];
  const LivenessIcon = currentLivenessStep?.icon;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {progressStepper}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <Camera className="w-3.5 h-3.5" /> Live Photo Capture
        </span>
        <h1 className="text-2xl font-bold text-gray-900">Identity Validation</h1>
        <p className="text-gray-600 mt-1 text-sm">Take a live photo to verify your identity and prevent proxy interviews.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gray-800 px-6 py-4">
          <div className="flex items-center gap-2 text-white">
            <Shield className="w-5 h-5" />
            <h2 className="font-semibold">Live Identity Verification</h2>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Video feed */}
            <div className="relative bg-gray-900 rounded-xl aspect-video overflow-hidden flex items-center justify-center">
              {phase !== 'captured' && (
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
              )}
              {phase === 'captured' && photoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="Captured identity photo" className="w-full h-full object-cover" />
              )}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white gap-2">
                  <Camera className="w-10 h-10 text-gray-400" />
                  <p className="text-sm text-gray-300">Camera access denied</p>
                  <p className="text-xs text-gray-500">Please allow camera access and reload</p>
                </div>
              )}

              {/* Always-visible face oval guide */}
              {phase !== 'captured' && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-36 h-44 md:w-44 md:h-52 rounded-[50%] border-[3px] transition-all duration-300 ${
                    phase === 'liveness' ? 'border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.4)]' :
                    phase === 'countdown' ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.4)]' :
                    'border-white/50'
                  }`} />
                  <p className="absolute bottom-12 text-xs text-white/70 font-medium">Position face inside oval</p>
                </div>
              )}

              {/* Liveness instruction overlay */}
              {phase === 'liveness' && currentLivenessStep && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 whitespace-nowrap">
                  {LivenessIcon && <LivenessIcon className={`w-4 h-4 ${currentLivenessStep.color}`} />}
                  {currentLivenessStep.action}
                  <span className="text-gray-400 text-xs ml-1">({livenessStepIdx + 1}/{LIVENESS_STEPS.length})</span>
                </div>
              )}

              {/* Countdown overlay */}
              {phase === 'countdown' && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                  <span className="text-7xl font-bold text-white drop-shadow-lg">{countdown}</span>
                  <span className="text-sm text-gray-300 mt-2">Hold still…</span>
                </div>
              )}

              {/* Status badges */}
              {phase !== 'captured' && !cameraError && (
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Camera Active
                </div>
              )}
              {phase === 'captured' && (
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-green-600/90 text-white text-xs px-2.5 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" /> Captured
                </div>
              )}
            </div>

            {/* Right: Instructions / status */}
            <div className="space-y-4">
              {phase === 'photo_ready' && (
                <>
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <Shield className="w-4 h-4 text-gray-600" />
                      <h4 className="text-sm font-semibold text-gray-900">Liveness Check Process</h4>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      {LIVENESS_STEPS.map((step, i) => (
                        <div key={step.action} className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">{i + 1}</div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{step.action}</p>
                            <p className="text-xs text-gray-500">{step.description}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">4</div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">Photo Captured</p>
                          <p className="text-xs text-gray-500">Auto-capture after liveness check</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {faceError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{faceError}</p>
                    </div>
                  )}

                  <button
                    type="button" onClick={handleStartLiveness} disabled={cameraError}
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm"
                  >
                    {faceError ? 'Retry Liveness Check' : 'Start Liveness Check →'}
                  </button>
                </>
              )}

              {phase === 'liveness' && currentLivenessStep && (
                <div className="space-y-4">
                  {/* Step tracker */}
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-gray-900">Liveness Detection</h4>
                    <span className="text-xs text-gray-500">{livenessStepIdx + 1} / {LIVENESS_STEPS.length}</span>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <div className="flex justify-center mb-2">
                      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                        {LivenessIcon && <LivenessIcon className={`w-6 h-6 ${currentLivenessStep.color}`} />}
                      </div>
                    </div>
                    <p className="text-xl font-bold text-green-900">{currentLivenessStep.action}</p>
                    <p className="text-xs text-green-700 mt-1">{currentLivenessStep.description}</p>
                  </div>

                  {/* Animated progress bar */}
                  <div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-none"
                        style={{ width: `${livenessProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 text-green-600 text-xs font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Detecting…
                    </div>
                  </div>

                  {/* Step dots */}
                  <div className="flex items-center justify-center gap-2">
                    {LIVENESS_STEPS.map((s, i) => (
                      <div key={s.action} className={`h-2 rounded-full transition-all ${
                        i < livenessStepIdx ? 'w-6 bg-green-500' :
                        i === livenessStepIdx ? 'w-6 bg-green-400 animate-pulse' :
                        'w-2 bg-gray-200'
                      }`} />
                    ))}
                  </div>
                </div>
              )}

              {phase === 'countdown' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                  <Camera className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-yellow-900">Capturing Photo…</h4>
                  <p className="text-xs text-yellow-800 mt-1">Hold still and look at the camera</p>
                  <div className="flex items-center justify-center gap-1 mt-3">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs text-green-700 font-medium">All liveness checks passed!</span>
                  </div>
                </div>
              )}

              {phase === 'captured' && (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-green-900">Photo Captured!</h4>
                      <p className="text-xs text-green-700 mt-1">Liveness check complete. Submitting verification…</p>
                    </div>
                  </div>
                  <button
                    type="button" onClick={handleRetake}
                    className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 font-medium py-2.5 px-5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                  >
                    <RefreshCw className="w-4 h-4" /> Retake Photo
                  </button>
                </div>
              )}
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {privacyCard}

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={handleGoBackFromPhoto}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
          ← Go Back
        </button>
      </div>
    </div>
  );
}
