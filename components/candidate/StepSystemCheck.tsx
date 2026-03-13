'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Monitor,
  Globe,
  Camera,
  Mic,
  Wifi,
  Sun,
  Volume2,
  Eye,
  Users,
  Zap,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Shield,
  CircleDot,
} from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface StepSystemCheckProps {
  token: string;
  position?: string;
  onAllPassed: () => void;
}

type Phase = 'device_check' | 'device_results' | 'system_checks';
type CheckStatus = 'pending' | 'checking' | 'pass' | 'fail';

const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

interface BrowserInfo {
  name: string;
  version: string;
  majorVersion: number;
  supported: boolean;
}

interface DeviceInfo {
  isMobile: boolean;
  deviceType: string;
  os: string;
  screenWidth: number;
  screenHeight: number;
  browser: BrowserInfo;
}

interface SystemCheckItem {
  id: string;
  label: string;
  detail: string;
  icon: React.ReactNode;
  status: CheckStatus;
  colorClass: string;
}

function detectBrowser(ua: string): BrowserInfo {
  if (/Edg\//i.test(ua)) {
    const match = ua.match(/Edg\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Edge', version, majorVersion: major, supported: major >= 85 };
  }
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Chrome', version, majorVersion: major, supported: major >= 85 };
  }
  if (/Firefox\//i.test(ua)) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Firefox', version, majorVersion: major, supported: major >= 85 };
  }
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    const match = ua.match(/Version\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Safari', version, majorVersion: major, supported: major >= 14 };
  }
  return { name: 'Unknown', version: 'unknown', majorVersion: 0, supported: false };
}

function detectOS(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  // Try modern API first
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform) return uaData.platform;
  // Fallback to navigator.platform
  const platform = navigator.platform || '';
  if (/Win/i.test(platform)) return 'Windows';
  if (/Mac/i.test(platform)) return 'macOS';
  if (/Linux/i.test(platform)) return 'Linux';
  if (/iPhone|iPad|iPod/i.test(platform)) return 'iOS';
  return platform || 'Unknown';
}

function detectDevice(): DeviceInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = MOBILE_REGEX.test(ua);
  const browser = detectBrowser(ua);
  const os = detectOS();
  const screenWidth = typeof window !== 'undefined' ? window.screen.width : 0;
  const screenHeight = typeof window !== 'undefined' ? window.screen.height : 0;

  return {
    isMobile,
    deviceType: isMobile ? 'Mobile Device' : 'Desktop/Laptop',
    os,
    screenWidth,
    screenHeight,
    browser,
  };
}

const SUPPORTED_BROWSERS = [
  { name: 'Chrome', minVersion: 'v85+' },
  { name: 'Edge', minVersion: 'v85+' },
  { name: 'Firefox', minVersion: 'v85+' },
  { name: 'Safari', minVersion: 'v14+' },
];

const SYSTEM_REQUIREMENTS = [
  {
    label: 'Desktop or Laptop Computer',
    note: 'Mobile devices not supported',
    check: (d: DeviceInfo) => !d.isMobile,
  },
  {
    label: 'Supported Browser',
    note: 'Chrome, Edge, Firefox, or Safari',
    check: (d: DeviceInfo) => d.browser.supported,
  },
  {
    label: 'Stable Internet Connection',
    note: 'Recommended: 5 Mbps or higher',
    check: () => true, // Always passes for device check phase
  },
  {
    label: 'Webcam & Microphone Access',
    note: 'Required for video interview',
    check: () => true, // Checked later in system_checks phase
  },
];

export default function StepSystemCheck({
  token,
  position = 'this position',
  onAllPassed,
}: StepSystemCheckProps) {
  const [phase, setPhase] = useState<Phase>('device_check');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  // System checks phase state
  const [systemChecks, setSystemChecks] = useState<SystemCheckItem[]>([]);
  const [manualFaceConfirm, setManualFaceConfirm] = useState(false);
  const [manualMultipleConfirm, setManualMultipleConfirm] = useState(false);
  const [hasFaceDetector, setHasFaceDetector] = useState(false);

  // Refs for cleanup
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lightingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noiseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ────────────────────────────────────────
  // Phase A: Device Check — auto-detect on mount
  // ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'device_check') return;

    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      const info = detectDevice();
      setDeviceInfo(info);
      setPhase('device_results');
    }, 2000);

    return () => clearTimeout(timer);
  }, [phase]);

  // ────────────────────────────────────────
  // Phase B: System Checks
  // ────────────────────────────────────────
  const updateSystemCheck = useCallback(
    (id: string, update: Partial<Pick<SystemCheckItem, 'status' | 'detail'>>) => {
      setSystemChecks((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...update } : c)),
      );
    },
    [],
  );

  // Initialize system checks when entering that phase
  useEffect(() => {
    if (phase !== 'system_checks') return;

    setSystemChecks([
      {
        id: 'device',
        label: 'Device Type',
        detail: 'Checking device...',
        icon: <Monitor className="w-4 h-4" />,
        status: 'checking',
        colorClass: 'text-gray-600',
      },
      {
        id: 'webcam',
        label: 'Webcam',
        detail: 'Checking webcam...',
        icon: <Camera className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-gray-600',
      },
      {
        id: 'microphone',
        label: 'Microphone',
        detail: 'Checking microphone...',
        icon: <Mic className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-indigo-600',
      },
      {
        id: 'internet',
        label: 'Internet Connection',
        detail: 'Testing connection...',
        icon: <Wifi className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-cyan-600',
      },
      {
        id: 'lighting',
        label: 'Lighting Conditions',
        detail: 'Analyzing lighting...',
        icon: <Sun className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-yellow-600',
      },
      {
        id: 'noise',
        label: 'Background Noise',
        detail: 'Analyzing noise...',
        icon: <Volume2 className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-orange-600',
      },
      {
        id: 'face',
        label: 'Face Detection',
        detail: 'Detecting face...',
        icon: <Eye className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-green-600',
      },
      {
        id: 'multiple',
        label: 'Multiple People Check',
        detail: 'Checking for multiple people...',
        icon: <Users className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-red-600',
      },
    ]);
  }, [phase]);

  // Run system checks sequentially
  useEffect(() => {
    if (phase !== 'system_checks' || systemChecks.length === 0) return;

    let cancelled = false;

    const runChecks = async () => {
      // 1. Device Type (instant)
      if (cancelled) return;
      updateSystemCheck('device', { status: 'checking', detail: 'Detecting device...' });
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled) return;
      const info = deviceInfo || detectDevice();
      if (!info.isMobile) {
        updateSystemCheck('device', { status: 'pass', detail: 'Desktop/Laptop detected' });
      } else {
        updateSystemCheck('device', { status: 'fail', detail: 'Mobile device detected' });
      }

      // 2. Webcam
      if (cancelled) return;
      updateSystemCheck('webcam', { status: 'checking', detail: 'Requesting webcam access...' });
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          videoStream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = videoStream;
        if (videoRef.current) {
          videoRef.current.srcObject = videoStream;
        }
        updateSystemCheck('webcam', { status: 'pass', detail: 'Webcam ready' });
      } catch {
        if (cancelled) return;
        updateSystemCheck('webcam', { status: 'fail', detail: 'Webcam access denied' });
      }

      // 3. Microphone
      if (cancelled) return;
      updateSystemCheck('microphone', { status: 'checking', detail: 'Requesting microphone access...' });
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          audioStream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Set up audio analysis
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(audioStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        // Merge audio tracks into main stream
        if (streamRef.current) {
          audioStream.getAudioTracks().forEach((t) => streamRef.current!.addTrack(t));
        }
        updateSystemCheck('microphone', { status: 'pass', detail: 'Microphone ready' });
      } catch {
        if (cancelled) return;
        updateSystemCheck('microphone', { status: 'fail', detail: 'Microphone access denied' });
      }

      // 4. Internet Connection
      if (cancelled) return;
      updateSystemCheck('internet', { status: 'checking', detail: 'Testing connection speed...' });
      const healthUrl = `${API_BASE_URL.replace('/api/v1', '')}/health`;
      const latencies: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const start = performance.now();
          await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
          const end = performance.now();
          latencies.push(end - start);
        } catch {
          // individual ping failed
        }
      }
      if (cancelled) return;
      if (latencies.length === 0) {
        updateSystemCheck('internet', { status: 'fail', detail: 'Unable to reach server' });
      } else {
        const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        if (avg < 500) {
          updateSystemCheck('internet', {
            status: 'pass',
            detail: `Connection: Excellent (${avg}ms avg)`,
          });
        } else {
          updateSystemCheck('internet', {
            status: 'fail',
            detail: `Connection: Slow (${avg}ms avg)`,
          });
        }
      }

      // 5. Lighting Conditions (needs camera stream)
      if (cancelled) return;
      updateSystemCheck('lighting', { status: 'checking', detail: 'Analyzing lighting...' });
      await new Promise((r) => setTimeout(r, 1500)); // Wait for camera to stabilize
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          let totalBrightness = 0;
          const pixelCount = data.length / 4;
          for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
          }
          const avgBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 0;
          if (avgBrightness >= 40) {
            updateSystemCheck('lighting', {
              status: 'pass',
              detail: 'Lighting: Good (Face clearly visible)',
            });
          } else {
            updateSystemCheck('lighting', {
              status: 'fail',
              detail: 'Lighting: Too dark - improve your lighting',
            });
          }
        } else {
          updateSystemCheck('lighting', { status: 'fail', detail: 'Unable to analyze lighting' });
        }
      } else {
        // Camera not available, skip
        updateSystemCheck('lighting', { status: 'fail', detail: 'Camera not available for lighting check' });
      }

      // Start continuous lighting monitoring
      if (video && canvas) {
        lightingIntervalRef.current = setInterval(() => {
          if (!video || !canvas || video.readyState < 2) return;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          let totalBrightness = 0;
          const pixelCount = data.length / 4;
          for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
          }
          const avgBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 0;
          if (avgBrightness >= 40) {
            updateSystemCheck('lighting', {
              status: 'pass',
              detail: 'Lighting: Good (Face clearly visible)',
            });
          } else {
            updateSystemCheck('lighting', {
              status: 'fail',
              detail: 'Lighting: Too dark - improve your lighting',
            });
          }
        }, 3000);
      }

      // 6. Background Noise
      if (cancelled) return;
      updateSystemCheck('noise', { status: 'checking', detail: 'Analyzing background noise...' });
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled) return;
      const analyser = analyserRef.current;
      if (analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avgNoise = bufferLength > 0 ? sum / bufferLength : 0;
        if (avgNoise < 80) {
          updateSystemCheck('noise', {
            status: 'pass',
            detail: 'Background noise: Low (Good)',
          });
        } else {
          updateSystemCheck('noise', {
            status: 'fail',
            detail: 'Background noise: High - find a quieter space',
          });
        }

        // Start continuous noise monitoring
        noiseIntervalRef.current = setInterval(() => {
          const a = analyserRef.current;
          if (!a) return;
          const bl = a.frequencyBinCount;
          const da = new Uint8Array(bl);
          a.getByteFrequencyData(da);
          let s = 0;
          for (let i = 0; i < bl; i++) s += da[i];
          const avg = bl > 0 ? s / bl : 0;
          if (avg < 80) {
            updateSystemCheck('noise', {
              status: 'pass',
              detail: 'Background noise: Low (Good)',
            });
          } else {
            updateSystemCheck('noise', {
              status: 'fail',
              detail: 'Background noise: High - find a quieter space',
            });
          }
        }, 3000);
      } else {
        updateSystemCheck('noise', { status: 'fail', detail: 'Microphone not available for noise check' });
      }

      // 7. Face Detection
      if (cancelled) return;
      updateSystemCheck('face', { status: 'checking', detail: 'Detecting face...' });
      let faceDetectorAvailable = false;
      if (typeof window !== 'undefined' && 'FaceDetector' in window) {
        try {
          const detector = new (window as any).FaceDetector({ fastMode: true });
          if (video && video.readyState >= 2) {
            const faces = await detector.detect(video);
            if (cancelled) return;
            if (faces.length >= 1) {
              updateSystemCheck('face', {
                status: 'pass',
                detail: 'Face detected successfully',
              });
              faceDetectorAvailable = true;
              setHasFaceDetector(true);
            } else {
              updateSystemCheck('face', {
                status: 'fail',
                detail: 'No face detected - position yourself in front of the camera',
              });
              faceDetectorAvailable = true;
              setHasFaceDetector(true);
            }

            // 8. Multiple People Check (uses same FaceDetector)
            if (cancelled) return;
            updateSystemCheck('multiple', { status: 'checking', detail: 'Checking for multiple people...' });
            if (faces.length === 1) {
              updateSystemCheck('multiple', {
                status: 'pass',
                detail: 'Single person detected (Good)',
              });
            } else if (faces.length === 0) {
              updateSystemCheck('multiple', {
                status: 'fail',
                detail: 'No person detected',
              });
            } else {
              updateSystemCheck('multiple', {
                status: 'fail',
                detail: `${faces.length} people detected - ensure you are alone`,
              });
            }

            // Start continuous face monitoring
            faceIntervalRef.current = setInterval(async () => {
              if (!video || video.readyState < 2) return;
              try {
                const f = await detector.detect(video);
                if (f.length === 1) {
                  updateSystemCheck('face', { status: 'pass', detail: 'Face detected successfully' });
                  updateSystemCheck('multiple', { status: 'pass', detail: 'Single person detected (Good)' });
                } else if (f.length === 0) {
                  updateSystemCheck('face', { status: 'fail', detail: 'No face detected' });
                  updateSystemCheck('multiple', { status: 'fail', detail: 'No person detected' });
                } else {
                  updateSystemCheck('face', { status: 'pass', detail: 'Face detected successfully' });
                  updateSystemCheck('multiple', { status: 'fail', detail: `${f.length} people detected - ensure you are alone` });
                }
              } catch {
                // FaceDetector can fail on some frames
              }
            }, 3000);
          }
        } catch {
          // FaceDetector not usable
        }
      }

      if (!faceDetectorAvailable) {
        // Fallback: manual checkboxes
        if (cancelled) return;
        setHasFaceDetector(false);
        updateSystemCheck('face', {
          status: 'fail',
          detail: 'FaceDetector not available - please confirm manually below',
        });
        updateSystemCheck('multiple', {
          status: 'fail',
          detail: 'FaceDetector not available - please confirm manually below',
        });
      }
    };

    runChecks();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, systemChecks.length === 0 ? 0 : 1]);

  // Handle manual face / multiple people confirmations
  useEffect(() => {
    if (phase !== 'system_checks' || hasFaceDetector) return;
    if (manualFaceConfirm) {
      updateSystemCheck('face', { status: 'pass', detail: 'Face confirmed (manual)' });
    } else if (systemChecks.find((c) => c.id === 'face')?.status !== 'checking') {
      updateSystemCheck('face', { status: 'fail', detail: 'Please confirm using the checkbox below' });
    }
  }, [manualFaceConfirm, hasFaceDetector, phase, updateSystemCheck, systemChecks]);

  useEffect(() => {
    if (phase !== 'system_checks' || hasFaceDetector) return;
    if (manualMultipleConfirm) {
      updateSystemCheck('multiple', { status: 'pass', detail: 'Single person confirmed (manual)' });
    } else if (systemChecks.find((c) => c.id === 'multiple')?.status !== 'checking') {
      updateSystemCheck('multiple', { status: 'fail', detail: 'Please confirm using the checkbox below' });
    }
  }, [manualMultipleConfirm, hasFaceDetector, phase, updateSystemCheck, systemChecks]);

  // Cleanup all resources on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (lightingIntervalRef.current) clearInterval(lightingIntervalRef.current);
      if (noiseIntervalRef.current) clearInterval(noiseIntervalRef.current);
      if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Record system check results when all passed
  const allSystemPassed = systemChecks.length > 0 && systemChecks.every((c) => c.status === 'pass');
  const allSystemDone = systemChecks.length > 0 && systemChecks.every((c) => c.status === 'pass' || c.status === 'fail');
  const isAnyChecking = systemChecks.some((c) => c.status === 'checking' || c.status === 'pending');

  const handleProceed = useCallback(async () => {
    // Record system check results to backend
    try {
      await candidateAIInterviewService.recordSystemCheck(token, {
        camera: systemChecks.find((c) => c.id === 'webcam')?.status === 'pass' ? 'pass' : 'fail',
        microphone: systemChecks.find((c) => c.id === 'microphone')?.status === 'pass' ? 'pass' : 'fail',
        network: systemChecks.find((c) => c.id === 'internet')?.status === 'pass' ? 'pass' : 'fail',
        ai_engine: 'pass',
        lighting: systemChecks.find((c) => c.id === 'lighting')?.status === 'pass' ? 'pass' : 'fail',
        noise: systemChecks.find((c) => c.id === 'noise')?.status === 'pass' ? 'pass' : 'fail',
        face_detection: systemChecks.find((c) => c.id === 'face')?.status === 'pass' ? 'pass' : 'fail',
        face_count: systemChecks.find((c) => c.id === 'multiple')?.status === 'pass' ? 1 : 0,
      });
    } catch {
      // Non-blocking — proceed even if recording fails
    }

    // Clean up streams before proceeding
    if (lightingIntervalRef.current) clearInterval(lightingIntervalRef.current);
    if (noiseIntervalRef.current) clearInterval(noiseIntervalRef.current);
    if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    onAllPassed();
  }, [token, systemChecks, onAllPassed]);

  // ────────────────────────────────────────
  // Render helpers
  // ────────────────────────────────────────

  const deviceAllPass = deviceInfo ? !deviceInfo.isMobile && deviceInfo.browser.supported : false;

  // ────────────────────────────────────────
  // Phase A: device_check (loading)
  // ────────────────────────────────────────
  if (phase === 'device_check') {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5" />
            Device Verification
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Device Requirement Verification
          </h1>
          <p className="text-gray-600 mt-2">
            Checking your device compatibility for the interview.
          </p>
        </div>

        {/* Gradient header card */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-800 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              <Monitor className="w-5 h-5" />
              <h2 className="text-lg font-semibold">System Requirements Check</h2>
            </div>
            <p className="text-gray-300 text-sm">
              Verifying device and browser compatibility for{' '}
              <span className="font-medium text-white">{position}</span>
            </p>
          </div>

          {/* Card body: Loading */}
          <div className="bg-white rounded-b-xl p-8 flex flex-col items-center justify-center min-h-[200px] space-y-4">
            <div className="bg-gray-100 rounded-full p-3">
              <Zap className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">Checking Device Requirements...</p>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Phase A: device_results
  // ────────────────────────────────────────
  if (phase === 'device_results' && deviceInfo) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5" />
            Device Verification
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Device Requirement Verification
          </h1>
          <p className="text-gray-600 mt-2">
            Checking your device compatibility for the interview.
          </p>
        </div>

        {/* Gradient header card */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-800 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              <Monitor className="w-5 h-5" />
              <h2 className="text-lg font-semibold">System Requirements Check</h2>
            </div>
            <p className="text-gray-300 text-sm">
              Verifying device and browser compatibility for{' '}
              <span className="font-medium text-white">{position}</span>
            </p>
          </div>

          {/* Card body: Results */}
          <div className="bg-white rounded-b-xl p-6 space-y-5">
            {/* All Requirements Met banner */}
            {deviceAllPass ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="font-semibold text-green-800">All Requirements Met!</p>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="font-semibold text-red-800">Requirements Not Met</p>
              </div>
            )}

            {/* Device Type card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Monitor className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">Device Type</h3>
                  {!deviceInfo.isMobile ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5 ml-[52px]">
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Detected:</span>{' '}
                  <span className="font-medium">{deviceInfo.deviceType}</span>
                </p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Operating System:</span>{' '}
                  <span className="font-medium">{deviceInfo.os}</span>
                </p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Screen Resolution:</span>{' '}
                  <span className="font-medium">{deviceInfo.screenWidth} x {deviceInfo.screenHeight}</span>
                </p>
              </div>
            </div>

            {/* Browser Compatibility card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">Browser Compatibility</h3>
                  {deviceInfo.browser.supported ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="ml-[52px] space-y-3">
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Detected Browser:</span>{' '}
                  <span className="font-medium">{deviceInfo.browser.name} {deviceInfo.browser.version}</span>
                </p>
                <div>
                  <p className="text-sm text-gray-500 mb-2">Supported Browsers:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_BROWSERS.map((b) => {
                      const isCurrent = deviceInfo.browser.name === b.name;
                      return (
                        <div
                          key={b.name}
                          className={`rounded-lg p-3 text-center text-sm font-medium border ${
                            isCurrent
                              ? 'bg-green-50 border-green-300 text-green-800'
                              : 'bg-gray-50 border-gray-200 text-gray-700'
                          }`}
                        >
                          <p className="font-semibold">{b.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{b.minVersion}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* System Requirements checklist card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-3">System Requirements</h3>
              <div className="space-y-2.5">
                {SYSTEM_REQUIREMENTS.map((req, idx) => {
                  const passed = req.check(deviceInfo);
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      {passed ? (
                        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <CheckCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <XCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{req.label}</p>
                        <p className="text-xs text-gray-500">{req.note}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detected System Information card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Detected System Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Device Type</p>
                  <p className="text-sm font-medium text-gray-900">{deviceInfo.deviceType}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Browser</p>
                  <p className="text-sm font-medium text-gray-900">
                    {deviceInfo.browser.name} {deviceInfo.browser.version}
                  </p>
                </div>
              </div>
            </div>

            {/* Continue to System Checks button */}
            <button
              type="button"
              onClick={() => setPhase('system_checks')}
              className="w-full inline-flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-800 transition-all text-sm"
            >
              Continue to System Checks
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Phase B: system_checks
  // ────────────────────────────────────────
  if (phase === 'system_checks') {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5" />
            System Checks
          </span>
        </div>

        {/* Gradient header */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-900 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              {isAnyChecking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
              <h2 className="text-lg font-semibold">
                {isAnyChecking ? 'Running System Checks...' : 'System Checks Complete'}
              </h2>
            </div>
            <p className="text-green-100 text-sm">
              {isAnyChecking
                ? 'Please wait while we verify your environment'
                : 'All environment checks have been completed'}
            </p>
          </div>

          {/* Card body: 2-column layout */}
          <div className="bg-white rounded-b-xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column: Camera Preview */}
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
                  <CircleDot className="w-4 h-4 text-white" />
                  <h3 className="text-sm font-semibold text-white">Camera Preview</h3>
                </div>
                <div className="relative bg-gray-900 aspect-video">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Camera Active badge */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-green-600/90 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm">
                    <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                    Camera Active
                  </div>
                </div>
              </div>

              {/* Right column: Check items */}
              <div className="space-y-2">
                {systemChecks.map((check) => (
                  <div
                    key={check.id}
                    className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3"
                  >
                    {/* Left: colored circle icon */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        check.status === 'pass'
                          ? 'bg-green-100'
                          : check.status === 'fail'
                          ? 'bg-red-100'
                          : 'bg-gray-100'
                      }`}
                    >
                      <span
                        className={
                          check.status === 'pass'
                            ? 'text-green-600'
                            : check.status === 'fail'
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }
                      >
                        {check.icon}
                      </span>
                    </div>

                    {/* Middle: label + detail */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{check.label}</p>
                      <p className="text-xs text-gray-500 truncate">{check.detail}</p>
                    </div>

                    {/* Right: status icon */}
                    <div className="flex-shrink-0">
                      {check.status === 'pass' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {check.status === 'fail' && (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                      {(check.status === 'checking' || check.status === 'pending') && (
                        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hidden canvas for frame analysis */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Manual face / multiple people confirmation fallback */}
            {!hasFaceDetector && allSystemDone && (
              <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <p className="text-sm text-gray-700 font-medium">
                  FaceDetector API is not available in your browser. Please confirm manually:
                </p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualFaceConfirm}
                    onChange={(e) => setManualFaceConfirm(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">
                    I confirm my face is clearly visible in the camera
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualMultipleConfirm}
                    onChange={(e) => setManualMultipleConfirm(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">
                    I confirm I am alone and no other person is visible
                  </span>
                </label>
              </div>
            )}

            {/* All Checks Passed banner */}
            {allSystemPassed && (
              <div className="mt-5 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-800">All Checks Passed!</p>
                  <p className="text-sm text-green-700">Ready to proceed to Demo Video</p>
                </div>
              </div>
            )}

            {/* Proceed button */}
            <div className="mt-5">
              <button
                type="button"
                onClick={handleProceed}
                disabled={!allSystemPassed}
                className={`w-full inline-flex items-center justify-center gap-2 font-semibold py-3 px-6 rounded-lg text-sm transition-all ${
                  allSystemPassed
                    ? 'bg-gray-900 text-white hover:bg-gray-800 cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Proceed to Demo Video
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
