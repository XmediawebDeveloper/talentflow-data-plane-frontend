'use client';

import { useState, useEffect, useRef } from 'react';
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
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { candidateService, SystemCheckResult } from '@/lib/services/candidateService';

interface SystemCheckProps {
  token: string;
  onComplete: () => void;
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);

    return () => {
      // Cleanup stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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

    // Reset all checks
    setCameraCheck({ status: 'checking', message: 'Checking...' });
    setMicCheck({ status: 'checking', message: 'Checking...' });
    setScreenCheck({ status: 'checking', message: 'Checking...' });
    setInternetCheck({ status: 'checking', message: 'Checking...' });
    setBrowserCheck({ status: 'checking', message: 'Checking...' });

    // Run checks
    await checkBrowser();
    await checkInternet();
    await checkCameraAndMicrophone();  // Combined to avoid permission conflicts
    await checkScreenShare();

    setIsChecking(false);
  };

  const checkBrowser = async () => {
    try {
      const userAgent = navigator.userAgent.toLowerCase();
      const isChrome = userAgent.includes('chrome') && !userAgent.includes('edg');
      const isEdge = userAgent.includes('edg');
      const isFirefox = userAgent.includes('firefox');
      const isSafari = userAgent.includes('safari') && !userAgent.includes('chrome');

      if (isChrome || isEdge || isFirefox) {
        setBrowserCheck({ status: 'success', message: 'Browser supported' });
      } else if (isSafari) {
        setBrowserCheck({ status: 'success', message: 'Safari detected (limited features)' });
      } else {
        setBrowserCheck({ status: 'error', message: 'Browser not supported. Use Chrome, Edge, or Firefox.' });
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

  const checkCameraAndMicrophone = async () => {
    // Request both camera and microphone together to avoid permission conflicts
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Check if we got both video and audio tracks
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      if (videoTracks.length > 0) {
        setCameraCheck({ status: 'success', message: 'Camera working' });
      } else {
        setCameraCheck({ status: 'error', message: 'No video track available' });
      }

      if (audioTracks.length > 0) {
        setMicCheck({ status: 'success', message: 'Microphone working' });
      } else {
        setMicCheck({ status: 'error', message: 'No audio track available' });
      }

    } catch (err: any) {
      console.error('Media device error:', err.name, err.message);

      // Handle specific error types
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraCheck({ status: 'error', message: 'Camera permission denied' });
        setMicCheck({ status: 'error', message: 'Microphone permission denied' });
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraCheck({ status: 'error', message: 'No camera found' });
        setMicCheck({ status: 'error', message: 'No microphone found' });
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        // Device is being used by another application
        setCameraCheck({ status: 'error', message: 'Camera in use by another app' });
        setMicCheck({ status: 'error', message: 'Microphone in use by another app' });
      } else if (err.name === 'OverconstrainedError') {
        setCameraCheck({ status: 'error', message: 'Camera constraints not satisfied' });
        setMicCheck({ status: 'error', message: 'Microphone constraints not satisfied' });
      } else if (err.name === 'SecurityError') {
        setCameraCheck({ status: 'error', message: 'Security error - use HTTPS' });
        setMicCheck({ status: 'error', message: 'Security error - use HTTPS' });
      } else {
        setCameraCheck({ status: 'error', message: `Camera error: ${err.name}` });
        setMicCheck({ status: 'error', message: `Microphone error: ${err.name}` });
      }

      // Try to get more specific info - maybe only one device is the problem
      await checkCameraSeparately();
      await checkMicrophoneSeparately();
    }
  };

  const checkCameraSeparately = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      onComplete();
    } catch (err) {
      console.error('Failed to submit system check:', err);
      // Still proceed even if submission fails
      onComplete();
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

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="w-full bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="w-[70%] mx-auto py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TF</span>
            </div>
            <span className="text-xl font-semibold text-white">TalentFlow</span>
          </div>
        </div>
      </header>

      {/* Main Content - 70% Width */}
      <main className="w-[70%] mx-auto py-8">
        {/* Title Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">System Check</h1>
          <p className="text-gray-600">
            Let's make sure your system is ready for the assessment
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">

          <div className="grid md:grid-cols-2 gap-6 p-8">
            {/* Camera Preview */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">Camera Preview</h3>
              <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {cameraCheck.status !== 'success' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="w-16 h-16 text-gray-600" />
                  </div>
                )}
              </div>
            </div>

            {/* Checks */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">System Requirements</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runAllChecks}
                  disabled={isChecking}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                  {isChecking ? 'Checking...' : 'Run Checks'}
                </Button>
              </div>

              <div className="space-y-3">
                {/* Browser */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Monitor className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-800">Browser</p>
                      <p className="text-sm text-gray-500">{browserCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={browserCheck.status} />
                </div>

                {/* Internet */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Wifi className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-800">Internet Connection</p>
                      <p className="text-sm text-gray-500">{internetCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={internetCheck.status} />
                </div>

                {/* Camera */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Camera className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-800">Camera</p>
                      <p className="text-sm text-gray-500">{cameraCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={cameraCheck.status} />
                </div>

                {/* Microphone */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-800">Microphone</p>
                      <p className="text-sm text-gray-500">{micCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={micCheck.status} />
                </div>

                {/* Screen Share */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Monitor className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-800">Screen Sharing</p>
                      <p className="text-sm text-gray-500">{screenCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={screenCheck.status} />
                </div>
              </div>

              {/* Status Message */}
              {allChecksComplete && (
                <div className="p-4 bg-green-50 rounded-xl flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-green-700 font-medium">All checks passed! You're ready to start.</p>
                </div>
              )}

              {!allChecksComplete && cameraCheck.status !== 'pending' && (
                <div className="p-4 bg-amber-50 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <p className="text-amber-700">Some checks failed. Please resolve the issues above.</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-8 py-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button
              variant="primary"
              onClick={handleProceed}
              disabled={!allChecksComplete || isSubmitting}
              loading={isSubmitting}
            >
              Start Assessment
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
