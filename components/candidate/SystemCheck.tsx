'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Camera,
  Mic,
  Monitor,
  Wifi,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Check,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { candidateService, SystemCheckResult } from '@/lib/services/candidateService';
import { getUserMedia, getErrorMessage, detectBrowser, checkBrowserCompatibility } from '@/lib/utils/browserCompat';

interface SystemCheckProps {
  token: string;
  onComplete: (stream?: MediaStream) => void; // Pass stream to parent to keep it alive
  onBack: () => void;
}

interface CheckStatus {
  status: 'pending' | 'checking' | 'success' | 'error';
  message: string;
}

export function SystemCheck({ token, onComplete, onBack }: SystemCheckProps) {
  const [cameraCheck, setCameraCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [micCheck, setMicCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [screenCheck, setScreenCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [internetCheck, setInternetCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [browserCheck, setBrowserCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [isChecking, setIsChecking] = useState(false);
  const [allChecksComplete, setAllChecksComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [browserType, setBrowserType] = useState<string>('');
  const [isIOS, setIsIOS] = useState(false);
  const [cameraInUseError, setCameraInUseError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);

    return () => {
      // Stop periodic face detection
      if (faceCheckIntervalRef.current) {
        clearInterval(faceCheckIntervalRef.current);
        faceCheckIntervalRef.current = null;
      }
      // DON'T cleanup stream on unmount - keep it alive for assessment
      // The parent (CandidateAssessmentPortal) will handle stream cleanup
      // This prevents the black screen gap between system check and assessment
      console.log('[SYSTEM CHECK] Component unmounting - keeping stream alive for assessment');
    };
  }, []);

  // Monitor camera and microphone stream - detect if browser/OS stops them
  useEffect(() => {
    if (!streamRef.current) return;

    const stream = streamRef.current;
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    // Handler for when video track ends (camera disabled)
    const handleVideoEnded = () => {
      console.log('[SYSTEM CHECK] Camera track ended - camera was disabled');
      setCameraCheck({
        status: 'error',
        message: 'Camera was disabled. Please re-run checks.'
      });
      // Clear video preview to show camera is off
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    // Handler for when audio track ends (microphone disabled)
    const handleAudioEnded = () => {
      console.log('[SYSTEM CHECK] Audio track ended - microphone was disabled');
      setMicCheck({
        status: 'error',
        message: 'Microphone was disabled. Please re-run checks.'
      });
    };

    // Add event listeners for track ended events
    if (videoTrack) {
      videoTrack.addEventListener('ended', handleVideoEnded);
    }
    if (audioTrack) {
      audioTrack.addEventListener('ended', handleAudioEnded);
    }

    // Periodic check every 2 seconds to detect if tracks are no longer live
    const monitorInterval = setInterval(() => {
      if (videoTrack && videoTrack.readyState === 'ended') {
        console.log('[SYSTEM CHECK] Camera track readyState is ended');
        setCameraCheck({
          status: 'error',
          message: 'Camera stopped working. Please re-run checks.'
        });
      }
      if (audioTrack && audioTrack.readyState === 'ended') {
        console.log('[SYSTEM CHECK] Microphone track readyState is ended');
        setMicCheck({
          status: 'error',
          message: 'Microphone stopped working. Please re-run checks.'
        });
      }
    }, 2000);

    // Cleanup
    return () => {
      clearInterval(monitorInterval);
      if (videoTrack) {
        videoTrack.removeEventListener('ended', handleVideoEnded);
      }
      if (audioTrack) {
        audioTrack.removeEventListener('ended', handleAudioEnded);
      }
    };
  }, [streamRef.current]);

  useEffect(() => {
    // Check if all checks are successful
    const allSuccess =
      cameraCheck.status === 'success' &&
      micCheck.status === 'success' &&
      screenCheck.status === 'success' &&
      internetCheck.status === 'success' &&
      browserCheck.status === 'success';
    setAllChecksComplete(allSuccess);
  }, [cameraCheck, micCheck, screenCheck, internetCheck, browserCheck]);

  const runAllChecks = async () => {
    setIsChecking(true);

    // Reset all checks including camera in use error
    setCameraCheck({ status: 'checking', message: 'Checking...' });
    setMicCheck({ status: 'checking', message: 'Checking...' });
    setScreenCheck({ status: 'checking', message: 'Checking...' });
    setInternetCheck({ status: 'checking', message: 'Checking...' });
    setBrowserCheck({ status: 'checking', message: 'Checking...' });
    setCameraInUseError(''); // Clear previous camera in use error

    // Run checks
    await checkBrowser();
    await checkInternet();
    await checkCameraAndMicrophone();  // Combined to avoid permission conflicts
    await checkScreenShare();

    setIsChecking(false);
  };

  const checkBrowser = async () => {
    try {
      const browser = detectBrowser();
      const compat = checkBrowserCompatibility();

      // Store browser type and iOS detection for error messaging
      setBrowserType(browser.name);
      setIsIOS(browser.isIOS);

      // Check for compatibility issues
      if (!compat.isCompatible) {
        setBrowserCheck({ status: 'error', message: compat.issues.join(' ') });
      } else if (browser.name === 'Safari' || browser.name === 'iOS Safari') {
        setBrowserCheck({ status: 'success', message: 'Safari detected (limited features)' });
      } else if (browser.name === 'Chrome' || browser.name === 'Edge' || browser.name === 'Firefox' || browser.name === 'Arc' || browser.name === 'Brave') {
        setBrowserCheck({ status: 'success', message: 'Browser supported' });
      } else {
        setBrowserCheck({ status: 'success', message: `${browser.name} detected` });
      }
    } catch {
      setBrowserCheck({ status: 'error', message: 'Could not detect browser' });
    }
  };

  const checkInternet = async () => {
    try {
      const startTime = Date.now();
      await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' });
      const endTime = Date.now();
      const latency = endTime - startTime;

      if (latency < 200) {
        setInternetCheck({ status: 'success', message: `Excellent connection (${latency}ms)` });
      } else if (latency < 500) {
        setInternetCheck({ status: 'success', message: `Good connection (${latency}ms)` });
      } else {
        setInternetCheck({ status: 'success', message: `Slow connection (${latency}ms)` });
      }
    } catch {
      setInternetCheck({ status: 'error', message: 'No internet connection' });
    }
  };

  // Run face detection on the video element using FaceDetector API (Chrome/Edge)
  // Falls back to trusting the video track on unsupported browsers
  const runFaceDetection = async () => {
    if (!videoRef.current) return;
    try {
      const FaceDetector = (window as any).FaceDetector;
      const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(videoRef.current);
      if (faces.length > 0) {
        setCameraCheck({ status: 'success', message: 'Camera ready — face detected' });
      } else {
        setCameraCheck({ status: 'error', message: 'No face detected. Look directly at the camera.' });
      }
    } catch {
      // FaceDetector failed or not supported — just mark camera as working
      setCameraCheck({ status: 'success', message: 'Camera working' });
    }
  };

  const startFaceDetectionPolling = () => {
    if (faceCheckIntervalRef.current) clearInterval(faceCheckIntervalRef.current);
    // Re-check every 2.5 s so status updates as user moves into/out of frame
    faceCheckIntervalRef.current = setInterval(runFaceDetection, 2500);
  };

  const checkCameraAndMicrophone = async () => {
    // Request both camera and microphone together to avoid permission conflicts
    try {
      // Use enhanced getUserMedia with cross-browser support
      const stream = await getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Check if we got both video and audio tracks
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      if (videoTracks.length > 0) {
        const hasFaceAPI = 'FaceDetector' in window;
        if (hasFaceAPI) {
          setCameraCheck({ status: 'checking', message: 'Detecting face...' });
          // Give the video element a moment to render actual frames
          await new Promise(r => setTimeout(r, 800));
          await runFaceDetection();
          startFaceDetectionPolling();
        } else {
          setCameraCheck({ status: 'success', message: 'Camera working' });
        }
      } else {
        setCameraCheck({ status: 'error', message: 'No video track available' });
      }

      if (audioTracks.length > 0) {
        setMicCheck({ status: 'success', message: 'Microphone working' });
      } else {
        setMicCheck({ status: 'error', message: 'No audio track available' });
      }

    } catch (err: any) {
      console.error('[SYSTEM CHECK] Media device error:', {
        name: err.name,
        message: err.message,
        browser: browserType,
        isIOS: isIOS,
        fullError: err
      });

      // Get browser info for error messages
      const browser = detectBrowser();
      const errorMessage = err.message || '';

      // Handle standardized error codes from getUserMedia
      if (errorMessage === 'PERMISSION_DENIED') {
        const msg = getErrorMessage('PERMISSION_DENIED', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: msg });
      } else if (errorMessage === 'DEVICE_NOT_FOUND') {
        const msg = getErrorMessage('DEVICE_NOT_FOUND', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: msg });
      } else if (errorMessage === 'DEVICE_IN_USE') {
        const msg = getErrorMessage('DEVICE_IN_USE', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: 'Microphone may be in use by another app or tab' });
        setCameraInUseError(msg); // Store for prominent display

        console.log('[SYSTEM CHECK] Camera in use detected - NOT calling fallback checks', {
          browser: browser.name,
          errorType: err.name
        });

        // IMPORTANT: Return early to prevent fallback checks from overwriting this error
        return;
      } else if (errorMessage === 'SECURITY_ERROR_HTTPS_REQUIRED') {
        const msg = getErrorMessage('SECURITY_ERROR_HTTPS_REQUIRED', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: msg });
      } else if (errorMessage === 'MEDIA_API_NOT_SUPPORTED') {
        const msg = getErrorMessage('MEDIA_API_NOT_SUPPORTED', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: msg });
      } else {
        // For unknown errors, show user-friendly message
        setCameraCheck({ status: 'error', message: 'Camera error - please check if camera is available' });
        setMicCheck({ status: 'error', message: 'Microphone error - please check if microphone is available' });
      }

      // Try to get more specific info - maybe only one device is the problem
      // (This will only run for non-AbortError/NotReadableError cases due to early return above)
      await checkCameraSeparately();
      await checkMicrophoneSeparately();
    }
  };

  const checkCameraSeparately = async () => {
    try {
      const stream = await getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraCheck({ status: 'success', message: 'Camera working' });
    } catch (err: any) {
      console.error('Camera-only error:', err.name, err.message);
      // Keep the existing error message if already set
    }
  };

  const checkMicrophoneSeparately = async () => {
    try {
      const stream = await getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicCheck({ status: 'success', message: 'Microphone working' });
    } catch (err: any) {
      console.error('Microphone-only error:', err.name, err.message);
      // Keep the existing error message if already set
    }
  };

  const checkScreenShare = async () => {
    try {
      // We can't actually test screen sharing without showing the picker
      // So we just check if the API is available
      if ('getDisplayMedia' in navigator.mediaDevices) {
        setScreenCheck({ status: 'success', message: 'Screen sharing available' });
      } else {
        setScreenCheck({ status: 'error', message: 'Screen sharing not supported' });
      }
    } catch {
      setScreenCheck({ status: 'error', message: 'Screen sharing check failed' });
    }
  };

  const handleProceed = async () => {
    setIsSubmitting(true);
    try {
      const results: SystemCheckResult = {
        camera_available: cameraCheck.status === 'success',
        microphone_available: micCheck.status === 'success',
        screen_share_available: screenCheck.status === 'success',
        browser_compatible: browserCheck.status === 'success',
        internet_speed_mbps: null
      };

      await candidateService.submitSystemCheck(token, results);

      // Validate stream before handoff to ensure it's still live
      let streamToPass = streamRef.current;

      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        const audioTrack = streamRef.current.getAudioTracks()[0];

        const isVideoLive = videoTrack && videoTrack.readyState === 'live';
        const isAudioLive = audioTrack && audioTrack.readyState === 'live';

        console.log('[SYSTEM CHECK] Stream validation before handoff:', {
          hasStream: !!streamRef.current,
          videoTrack: videoTrack ? videoTrack.readyState : 'none',
          audioTrack: audioTrack ? audioTrack.readyState : 'none',
          isVideoLive,
          isAudioLive
        });

        // If video track is not live, try to request a fresh stream
        if (!isVideoLive) {
          console.log('[SYSTEM CHECK] Video track not live - requesting fresh stream');
          try {
            const freshStream = await getUserMedia({ video: true, audio: true });
            streamRef.current = freshStream;
            streamToPass = freshStream;

            // Update video preview with fresh stream
            if (videoRef.current) {
              videoRef.current.srcObject = freshStream;
            }

            console.log('[SYSTEM CHECK] Fresh stream acquired successfully');
          } catch (err) {
            console.warn('[SYSTEM CHECK] Failed to get fresh stream - assessment will handle camera re-initialization', err);
            // Continue anyway - assessment component will handle camera re-request
          }
        } else {
          console.log('[SYSTEM CHECK] Stream is healthy and live');
        }
      }

      // Pass the stream to parent to keep camera alive (prevents black screen)
      console.log('[SYSTEM CHECK] Passing stream to parent - keeping camera alive');
      onComplete(streamToPass || undefined);
    } catch (err) {
      console.error('Failed to submit system check:', err);
      // Still proceed even if submission fails - pass stream to keep camera alive
      onComplete(streamRef.current || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const StatusIcon = ({ status }: { status: CheckStatus['status'] }) => {
    switch (status) {
      case 'pending':
        return <div className="w-6 h-6 rounded-full bg-gray-200" />;
      case 'checking':
        return (
          <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        );
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'error':
        return <XCircle className="w-6 h-6 text-red-500" />;
    }
  };

  // Progress steps
  const steps = [
    { label: 'Terms & Consent', active: false, completed: true },
    { label: 'Assessment Details', active: false, completed: true },
    { label: 'System Check', active: true, completed: false },
    { label: 'Assessment', active: false, completed: false }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sticky Header Container */}
      <div className="sticky top-0 z-50">
        {/* Header */}
        <header className="w-full bg-white border-b border-gray-200">
          <div className="w-full px-6 lg:px-12 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/talent_flow_logo.png"
                  alt="TalentFlow"
                  width={160}
                  height={40}
                  className="h-10 w-auto"
                  priority
                  unoptimized
                />
              </div>
              <a
                href="mailto:support@talentflow.com"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                Need help?
              </a>
            </div>
          </div>
        </header>

        {/* Progress Stepper */}
        <div className="w-full bg-white border-b border-gray-200">
          <div className="w-full px-6 lg:px-12 py-4">
            <div className="flex items-center justify-center gap-2">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      step.completed
                        ? 'bg-green-500 text-white'
                        : step.active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 text-gray-600'
                    }`}>
                      {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className={`text-sm font-medium hidden sm:block ${
                      step.active ? 'text-gray-900' : step.completed ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-8 sm:w-16 h-0.5 mx-2 ${
                      step.completed ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 py-10">
        <div className="w-full px-6 lg:px-12 text-center">
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">System Check</h1>
          <p className="text-blue-100 text-lg">
            Let's make sure your system is ready for the assessment
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full bg-white">
        <div className="w-full px-6 lg:px-12 py-10">
          <div className="grid lg:grid-cols-2 gap-10">
            {/* Camera Preview */}
            <div>
              <h3 className="font-semibold text-gray-900 text-xl mb-4">Camera Preview</h3>
              <div className="aspect-video bg-gray-900 rounded-2xl overflow-hidden relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {cameraCheck.status !== 'success' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="w-20 h-20 text-gray-600" />
                  </div>
                )}
              </div>
            </div>

            {/* Checks */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 text-xl">System Requirements</h3>
                <Button
                  variant="outline"
                  onClick={runAllChecks}
                  disabled={isChecking}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                  {isChecking ? 'Checking...' : 'Run Checks'}
                </Button>
              </div>

              <div className="space-y-4">
                {/* Browser */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Browser</p>
                      <p className="text-sm text-gray-500">{browserCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={browserCheck.status} />
                </div>

                {/* Internet */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <Wifi className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Internet Connection</p>
                      <p className="text-sm text-gray-500">{internetCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={internetCheck.status} />
                </div>

                {/* Camera */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Camera className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Camera</p>
                      <p className="text-sm text-gray-500">{cameraCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={cameraCheck.status} />
                </div>

                {/* Microphone */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Mic className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Microphone</p>
                      <p className="text-sm text-gray-500">{micCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={micCheck.status} />
                </div>

                {/* Screen Share */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Screen Sharing</p>
                      <p className="text-sm text-gray-500">{screenCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={screenCheck.status} />
                </div>
              </div>

              {/* Status Message */}
              {allChecksComplete && (
                <div className="mt-6 p-5 bg-green-50 rounded-xl flex items-center gap-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <p className="text-green-700 font-semibold">All checks passed! You're ready to start.</p>
                </div>
              )}

              {!allChecksComplete && cameraCheck.status !== 'pending' && (
                <div className="mt-6 p-5 bg-amber-50 rounded-xl flex items-center gap-4">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                  <p className="text-amber-700 font-medium">Some checks failed. Please resolve the issues above.</p>
                </div>
              )}

              {/* Prominent Camera In Use Error Box */}
              {cameraInUseError && (
                <div className="mt-6 p-6 bg-red-50 border-2 border-red-300 rounded-xl">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-red-900 mb-2">Camera Is In Use</h4>
                      <p className="text-red-800 mb-4">{cameraInUseError}</p>
                      <div className="bg-white rounded-lg p-4 border border-red-200">
                        <p className="font-semibold text-red-900 mb-2">How to fix this:</p>
                        <ol className="list-decimal list-inside space-y-2 text-red-800 text-sm">
                          <li>Close any apps using your camera (Zoom, Teams, Skype, FaceTime, Google Meet)</li>
                          <li>Close other browser tabs that may be using your camera</li>
                          {isIOS && (
                            <li>On iPhone/iPad: Go to Settings → Privacy → Camera and check which apps have access</li>
                          )}
                          {browserType === 'Firefox' && (
                            <li>In Firefox: Check if Enhanced Tracking Protection is blocking camera access (shield icon in address bar)</li>
                          )}
                          {browserType === 'Safari' && (
                            <li>In Safari: Check Safari → Preferences → Websites → Camera permissions</li>
                          )}
                          <li>If problems persist, restart your browser</li>
                          <li>Click "Run Checks" again once you've closed other apps</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Actions Footer */}
      <div className="w-full bg-gray-50 border-t border-gray-200 py-6">
        <div className="w-full px-6 lg:px-12 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} className="text-gray-600">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button
            variant="primary"
            onClick={handleProceed}
            disabled={!allChecksComplete || isSubmitting}
            loading={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-6 text-lg font-semibold rounded-xl"
          >
            Start Assessment
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
