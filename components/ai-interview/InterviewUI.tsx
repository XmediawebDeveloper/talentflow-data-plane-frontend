"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Avatar } from "./Avatar";
import { Webcam, WebcamRef } from "./Webcam";
import { useAvatarState } from "@/hooks/useAvatarState";
import { useHandRaiseDetection } from "@/hooks/useHandRaiseDetection";
import {
  useInterviewFaceDetection,
  useInterviewProctoringMonitor,
  InterviewProctoringWarnings,
} from './proctoring';
import { CandidateInterviewInfo, candidateAIInterviewService } from "@/lib/services/candidateAIInterviewService";
import { requestFullscreen, isFullscreen, getFullscreenChangeEvent, exitFullscreen } from "@/lib/utils/browserCompat";
import { Maximize2, Clock } from "lucide-react";

interface InterviewUIProps {
  token: string;
  interviewInfo: CandidateInterviewInfo;
  onInterviewComplete?: () => void;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export function InterviewUI({ token, interviewInfo, onInterviewComplete }: InterviewUIProps) {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [currentAiText, setCurrentAiText] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [mouthOpenness, setMouthOpenness] = useState(0);
  const [textInput, setTextInput] = useState("");

  // Interview closing state
  const [isClosing, setIsClosing] = useState(false);
  const [closingReason, setClosingReason] = useState<string>("");
  const [questionCount, setQuestionCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const shouldDisconnectAfterAudioRef = useRef(false);

  // Countdown timer
  const [remainingSeconds, setRemainingSeconds] = useState(interviewInfo.duration_minutes * 60);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isConnected || isClosing) return;
    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isConnected, isClosing]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // No-response detection state
  const [showMicPopup, setShowMicPopup] = useState(false);
  const noResponseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noResponseRetryRef = useRef(0); // 0=first attempt, 1=asked "are you there?"
  const micPopupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleNoResponseRef = useRef<() => void>(() => {});
  const stopRecordingSilentRef = useRef<() => void>(() => {});

  // Webcam ref for hand detection
  const webcamRef = useRef<WebcamRef>(null);
  const [webcamReady, setWebcamReady] = useState(false);

  // Video recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Avatar state controller
  const avatarState = useAvatarState();

  // Hand raise detection
  const handDetection = useHandRaiseDetection({
    enabled: webcamReady,
    onHandRaised: () => avatarState.raiseHand(),
    onHandLowered: () => avatarState.lowerHand(),
    onWaveDetected: () => avatarState.wave(),
  });

  // Proctoring (decoupled — no warning state here)
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const reportProctorEvent = useCallback(async (t: string, event: any) => {
    return candidateAIInterviewService.reportProctorEvent(t, event);
  }, []);

  const { state: proctoringState, emitEvent, setReducedFrequency } = useInterviewProctoringMonitor({
    token,
    stream: webcamStream,
    enabled: isConnected,
    voiceDetectionSensitivity: 50,
    obstructionThreshold: 30,
    reportEvent: reportProctorEvent,
  });

  // Fullscreen enforcement
  const [isFullscreenActive, setIsFullscreenActive] = useState(true);

  useEffect(() => {
    if (!isConnected) return;

    const eventName = getFullscreenChangeEvent();
    const handleFullscreenChange = () => {
      setIsFullscreenActive(isFullscreen());
    };

    setIsFullscreenActive(isFullscreen());
    document.addEventListener(eventName, handleFullscreenChange);

    return () => {
      document.removeEventListener(eventName, handleFullscreenChange);
      if (isFullscreen()) {
        exitFullscreen().catch(() => {});
      }
    };
  }, [isConnected]);

  // Face detection & gaze tracking (Phase 2 & 3)
  const handleFaceMissing = useCallback(() => {
    emitEvent('face_missing', { timestamp: new Date().toISOString() });
  }, [emitEvent]);

  const handleMultipleFaces = useCallback((count: number) => {
    emitEvent('multiple_faces', { face_count: count });
  }, [emitEvent]);

  const handleGazeAway = useCallback((direction: string) => {
    emitEvent('gaze_away', { direction });
  }, [emitEvent]);

  const faceDetection = useInterviewFaceDetection({
    enabled: isConnected && webcamReady,
    enableGazeTracking: true,
    onFaceMissing: handleFaceMissing,
    onMultipleFaces: handleMultipleFaces,
    onGazeAway: handleGazeAway,
  });

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    handDetection.setVideoElement(video);
    faceDetection.setVideoElement(video);
    setWebcamReady(true);

    // Start video recording from webcam stream
    const stream = video.srcObject as MediaStream;
    if (stream) {
      webcamStreamRef.current = stream;
      try {
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };
        recorder.start(1000); // Record in 1s chunks
        mediaRecorderRef.current = recorder;
      } catch {
        // Fallback without codec
        try {
          const recorder = new MediaRecorder(stream);
          recordedChunksRef.current = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          recorder.start(1000);
          mediaRecorderRef.current = recorder;
        } catch (err) {
          console.error("MediaRecorder not supported:", err);
        }
      }
    }
  }, [handDetection, faceDetection]);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]); // kept for proctoring load-shedding count only
  const isPlayingRef = useRef(false);
  // Scheduled playback — gapless audio via Web Audio API clock
  const nextPlayTimeRef = useRef(0);   // ctx.currentTime when next buffer should start
  const pendingBuffersRef = useRef(0); // buffers scheduled but not yet finished
  const isRecordingRef = useRef(false);
  const audioEndReceivedRef = useRef(false);
  const currentAiTextRef = useRef("");
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAiSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);

  // Stable callback refs — prevent WebSocket reconnection on re-renders
  const queueAudioRef = useRef<(pcmData: ArrayBuffer) => void>(() => {});
  const handleMessageRef = useRef<(data: any) => void>(() => {});

  // Token reveal system
  const tokenBufferRef = useRef("");
  const revealedCharsRef = useRef(0);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync with state — refs are always current inside stale closures
  useEffect(() => { isAiSpeakingRef.current = isAiSpeaking; }, [isAiSpeaking]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  // VAD settings
  const silenceStartRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const silenceThresholdRef = useRef(0.008);
  const silenceDurationMsRef = useRef(5000);

  // Save AI message
  const saveAiMessage = useCallback(() => {
    // Use currentAiTextRef first; fall back to full tokenBuffer if reveal timer
    // stopped early (e.g. LLM continued streaming after the timer caught up)
    const text = (currentAiTextRef.current || tokenBufferRef.current).trim();
    if (text) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: text
      }]);
      currentAiTextRef.current = "";
      tokenBufferRef.current = "";
      revealedCharsRef.current = 0;
      setCurrentAiText("");
    }
  }, []);

  // Token reveal system
  const startRevealingTokens = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
    }
    revealTimerRef.current = setInterval(() => {
      const fullText = tokenBufferRef.current;
      const currentRevealed = revealedCharsRef.current;
      if (currentRevealed < fullText.length) {
        const charsToReveal = Math.min(12, fullText.length - currentRevealed);
        revealedCharsRef.current += charsToReveal;
        const revealedText = fullText.substring(0, revealedCharsRef.current);
        currentAiTextRef.current = revealedText;
        setCurrentAiText(revealedText);
      } else {
        if (revealTimerRef.current) {
          clearInterval(revealTimerRef.current);
          revealTimerRef.current = null;
        }
      }
    }, 100);
  }, []);

  const stopRevealingTokens = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const revealAllTokens = useCallback(() => {
    stopRevealingTokens();
    const fullText = tokenBufferRef.current;
    revealedCharsRef.current = fullText.length;
    currentAiTextRef.current = fullText;
    setCurrentAiText(fullText);
  }, [stopRevealingTokens]);

  useEffect(() => {
    return () => { stopRevealingTokens(); };
  }, [stopRevealingTokens]);

  // Web Speech API for real-time transcription
  const startWebSpeechRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (!event.results[i].isFinal) {
          interimTranscript += transcript;
        }
      }
      if (interimTranscript) setCurrentTranscript(interimTranscript);
    };
    recognition.onend = () => {
      if (isRecordingRef.current) {
        try { recognition.start(); } catch {}
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {}
  }, []);

  const stopWebSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); recognitionRef.current = null; } catch {}
    }
  }, []);

  // ── Gapless scheduled audio playback ────────────────────────────────────────
  // Instead of onended → playNextBuffer (which has JS-event-loop gaps = clicks),
  // each buffer is scheduled on the Web Audio clock so it starts exactly where
  // the previous one ends.  pendingBuffersRef tracks how many have been scheduled
  // but not yet finished — when it hits 0 AND audioEndReceivedRef is true we know
  // playback is complete and it's time to start recording.

  const handleAllAudioFinished = useCallback(() => {
    isPlayingRef.current = false;
    setMouthOpenness(0);
    if (audioEndReceivedRef.current) {
      setIsAiSpeaking(false);
      avatarState.onAiStopSpeaking();
      saveAiMessage();
      if (shouldDisconnectAfterAudioRef.current) {
        setStatus("Interview completed. Thank you!");
        setTimeout(() => { disconnect(); }, 1500);
        return;
      }
      setStatus("Your turn - speak now...");
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          startRecordingInternal();
        }
      }, 400);
    }
  }, [saveAiMessage, avatarState]);

  const queueAudio = useCallback((pcmData: ArrayBuffer) => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      try {
        audioContextRef.current = new AudioContext();
      } catch (err) {
        console.error('[InterviewUI] Failed to create playback AudioContext:', err);
        return;
      }
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") { ctx.resume().catch(() => {}); }

    const int16 = new Int16Array(pcmData);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    // AudioBuffer declared at 24kHz — browser resamples to context output rate
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    // ── Gapless scheduling ───────────────────────────────────────────────────
    // Keep nextPlayTimeRef ahead of ctx.currentTime.  If we've fallen behind
    // (first buffer or long gap), add a small 80 ms look-ahead so the scheduler
    // never tries to play in the past.
    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now + 0.08) {
      nextPlayTimeRef.current = now + 0.08;
    }
    const startTime = nextPlayTimeRef.current;
    nextPlayTimeRef.current += buffer.duration; // schedule end-to-end with zero gap

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    pendingBuffersRef.current += 1;
    source.onended = () => {
      pendingBuffersRef.current -= 1;
      if (pendingBuffersRef.current === 0) {
        handleAllAudioFinished();
      }
    };

    source.start(startTime);
    // ────────────────────────────────────────────────────────────────────────

    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setIsAiSpeaking(true);
      avatarState.onAiStartSpeaking();
      if (!revealTimerRef.current && tokenBufferRef.current.length > 0) {
        startRevealingTokens();
      }
    }

    // Real audio-driven lip sync:
    // Calculate RMS amplitude from the actual PCM samples, then schedule
    // setMouthOpenness to fire exactly when this buffer starts playing.
    // This times the mouth movement to the real audio output.
    let sum = 0;
    for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
    const rms = Math.sqrt(sum / float32.length);
    const openness = Math.min(1, rms * 6); // scale: typical speech RMS 0.02–0.15 → 0.1–0.9
    const delayMs = Math.max(0, (startTime - ctx.currentTime) * 1000);
    setTimeout(() => setMouthOpenness(openness), delayMs);

    // Load shedding: reduce proctoring frequency when buffers are lagging
    audioQueueRef.current.push(buffer); // count only — not used for playback
    if (audioQueueRef.current.length > 3) {
      setReducedFrequency(true);
    } else if (audioQueueRef.current.length <= 1) {
      setReducedFrequency(false);
    }
    audioQueueRef.current.shift(); // immediate clear — scheduling already done
  }, [handleAllAudioFinished, avatarState, startRevealingTokens, setReducedFrequency]);

  // WebSocket handlers
  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case "connected":
        if (data.vad_config) {
          silenceThresholdRef.current = data.vad_config.silence_threshold;
          silenceDurationMsRef.current = data.vad_config.silence_duration_ms;
        }
        break;
      case "greeting":
        tokenBufferRef.current = data.text;
        revealedCharsRef.current = 0;
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        setStatus("Linda is speaking...");
        startRevealingTokens();
        break;
      case "transcript":
        if (data.is_final && data.text?.trim()) {
          setCurrentTranscript("");
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: "user",
            content: data.text
          }]);
          currentAiTextRef.current = "";
          setCurrentAiText("");
        } else {
          setCurrentTranscript(data.text || "");
        }
        break;
      case "llm_token":
        tokenBufferRef.current += data.token;
        // Restart reveal timer if it stopped (caught up) but more tokens arrived
        if (!revealTimerRef.current && isAiSpeakingRef.current) {
          startRevealingTokens();
        }
        if (!isPlayingRef.current && !isAiSpeakingRef.current) {
          setStatus("Linda is thinking...");
        }
        break;
      case "speaking_started":
        setIsAiSpeaking(true);
        avatarState.onAiStartSpeaking();
        audioEndReceivedRef.current = false;
        pendingBuffersRef.current = 0;   // reset for this new speaking turn
        nextPlayTimeRef.current = 0;     // reset clock so first buffer gets fresh 80ms look-ahead
        noResponseRetryRef.current = 0; // Reset no-response tracking on new question
        setStatus("Linda is speaking...");
        startRevealingTokens();
        break;
      case "audio_end":
        setIsProcessing(false);
        audioEndReceivedRef.current = true;
        revealAllTokens();
        // With scheduled playback, pendingBuffersRef tracks in-flight buffers.
        // If nothing is playing/scheduled right now, trigger recording immediately.
        if (pendingBuffersRef.current === 0 && !isPlayingRef.current) {
          setIsAiSpeaking(false);
          avatarState.onAiStopSpeaking();
          saveAiMessage();
          setStatus("Your turn - speak now...");
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              startRecordingInternal();
            }
          }, 600);
        }
        break;
      case "processing":
        setIsProcessing(true);
        setStatus("Processing your speech...");
        tokenBufferRef.current = "";
        revealedCharsRef.current = 0;
        stopRevealingTokens();
        break;
      case "interview_closing":
        setIsClosing(true);
        setClosingReason(data.reason);
        setQuestionCount(data.question_count);
        setDuration(data.duration_minutes);
        setStatus("Interview ending - Linda is saying goodbye...");
        break;
      case "interview_ended":
        setStatus("Linda is saying goodbye...");
        shouldDisconnectAfterAudioRef.current = true;
        break;
      case "language_error":
        // Stop current recording first (otherwise startRecordingInternal
        // returns early because isRecordingRef.current is still true)
        stopRecordingSilentRef.current();
        setStatus("Let's stay focused");
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "system",
          content: data.message,
        }]);
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            setStatus("Ready to continue");
            startRecordingInternal();
          }
        }, 2000);
        break;
      case "error":
        setStatus(`Error: ${data.message}`);
        break;
    }
  }, [saveAiMessage, avatarState, startRevealingTokens, stopRevealingTokens, revealAllTokens]);

  // Keep callback refs in sync (avoids WebSocket reconnect on re-renders)
  useEffect(() => { queueAudioRef.current = queueAudio; }, [queueAudio]);
  useEffect(() => { handleMessageRef.current = handleMessage; }, [handleMessage]);

  // Upload recording
  const uploadRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    // Wait for final chunks
    await new Promise(r => setTimeout(r, 500));
    if (recordedChunksRef.current.length > 0) {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      try {
        await candidateAIInterviewService.uploadRecording(token, blob);
      } catch (err) {
        console.error("Failed to upload recording:", err);
      }
    }
  }, [token]);

  // Clear no-response timer helper
  const clearNoResponseTimer = useCallback(() => {
    if (noResponseTimerRef.current) {
      clearTimeout(noResponseTimerRef.current);
      noResponseTimerRef.current = null;
    }
  }, []);

  // Recording
  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    avatarState.onUserStopSpeaking();
    silenceStartRef.current = null;
    speechDetectedRef.current = false;
    stopWebSpeechRecognition();
    clearNoResponseTimer();

    setTimeout(() => {
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      processorRef.current?.disconnect();
      processorRef.current = null;
      // Don't close recordingContext — reuse it for next recording cycle
      setStatus("Processing...");
      setIsProcessing(true);
      avatarState.onProcessing();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "end_turn" }));
      }
    }, 100);
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer]);

  // Stop recording silently (no end_turn) — used for no-response flow
  const stopRecordingSilent = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    avatarState.onUserStopSpeaking();
    silenceStartRef.current = null;
    speechDetectedRef.current = false;
    stopWebSpeechRecognition();
    clearNoResponseTimer();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    processorRef.current?.disconnect();
    processorRef.current = null;
  }, [avatarState, stopWebSpeechRecognition, clearNoResponseTimer]);

  const startRecordingInternal = async () => {
    // Use refs — NOT state values — because this function is called from stale
    // closures (useCallback, setTimeout) where isAiSpeaking/isProcessing are stale.
    if (isAiSpeakingRef.current || isProcessingRef.current || isRecordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true }
      });
      mediaStreamRef.current = stream;

      // Reuse existing recording context or create with default hardware sample rate
      if (!recordingContextRef.current || recordingContextRef.current.state === 'closed') {
        try {
          recordingContextRef.current = new AudioContext();
        } catch (err) {
          console.error('[InterviewUI] Failed to create recording AudioContext:', err);
          setStatus("Audio device error - please refresh");
          return;
        }
      }
      const ctx = recordingContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      // Downsample to 16kHz for the backend (hardware rate is typically 44.1/48kHz)
      const targetSampleRate = 16000;
      const downsampleRatio = ctx.sampleRate / targetSampleRate;

      silenceStartRef.current = null;
      speechDetectedRef.current = false;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) { sum += Math.abs(input[i]); }
        const avgLevel = sum / input.length;

        if (avgLevel > silenceThresholdRef.current) {
          speechDetectedRef.current = true;
          silenceStartRef.current = null;
          // Clear no-response timer — candidate is speaking
          clearNoResponseTimer();
          noResponseRetryRef.current = 0;
        } else if (speechDetectedRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > silenceDurationMsRef.current) {
            stopRecording();
            return;
          }
        }

        // Downsample to 16kHz if context sample rate differs
        let samples: Float32Array;
        if (downsampleRatio > 1) {
          const outputLen = Math.floor(input.length / downsampleRatio);
          samples = new Float32Array(outputLen);
          for (let i = 0; i < outputLen; i++) {
            samples[i] = input[Math.floor(i * downsampleRatio)];
          }
        } else {
          samples = input;
        }

        const pcm = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
        }
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcm.buffer);
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      processorRef.current = processor;
      isRecordingRef.current = true;
      setIsRecording(true);
      avatarState.onUserStartSpeaking();
      setStatus(`Listening... (auto-stops after ${silenceDurationMsRef.current / 1000}s silence)`);
      startWebSpeechRecognition();

      // No-response detection — only fire after 20s of total silence
      // (3s was too aggressive; candidate may just be thinking)
      clearNoResponseTimer();
      noResponseTimerRef.current = setTimeout(() => {
        if (!speechDetectedRef.current && isRecordingRef.current) {
          handleNoResponseRef.current();
        }
      }, 20000);
    } catch {
      setStatus("Microphone error");
    }
  };

  const sendTextInput = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (isAiSpeakingRef.current || isProcessingRef.current) return;
    // Stop voice recording if active
    if (isRecordingRef.current) stopRecordingSilentRef.current();
    clearNoResponseTimer();
    wsRef.current.send(JSON.stringify({ type: "text_input", text: text.trim() }));
    setIsProcessing(true);
    setStatus("Processing your message...");
  }, [clearNoResponseTimer]);

  const disconnect = useCallback(() => {
    stopRecording();
    clearNoResponseTimer();
    if (micPopupTimerRef.current) {
      clearTimeout(micPopupTimerRef.current);
      micPopupTimerRef.current = null;
    }
    setShowMicPopup(false);
    noResponseRetryRef.current = 0;
    wsRef.current?.close();
    setIsConnected(false);
    setIsRecording(false);
    setIsProcessing(false);
    setIsAiSpeaking(false);
    shouldDisconnectAfterAudioRef.current = false;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    pendingBuffersRef.current = 0;
    nextPlayTimeRef.current = 0;
    audioEndReceivedRef.current = false;
    currentAiTextRef.current = "";
  }, [stopRecording, clearNoResponseTimer]);

  // No-response handlers
  const handleMicPopupNo = useCallback(() => {
    setShowMicPopup(false);
    if (micPopupTimerRef.current) {
      clearTimeout(micPopupTimerRef.current);
      micPopupTimerRef.current = null;
    }
    // End interview with closing message
    const closingMsg = "It seems we're having technical difficulties. Thank you for your time. The interview will now end.";
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: closingMsg,
    }]);
    setStatus("Interview ending...");
    setIsClosing(true);

    const utterance = new SpeechSynthesisUtterance(closingMsg);
    utterance.rate = 1.0;
    utterance.onend = () => {
      disconnect();
      onInterviewComplete?.();
    };
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      setTimeout(() => {
        disconnect();
        onInterviewComplete?.();
      }, 3000);
    }
  }, [disconnect, onInterviewComplete]);

  const handleMicPopupYes = useCallback(async () => {
    setShowMicPopup(false);
    if (micPopupTimerRef.current) {
      clearTimeout(micPopupTimerRef.current);
      micPopupTimerRef.current = null;
    }
    noResponseRetryRef.current = 0;
    setStatus("Resuming interview...");

    // Re-check microphone
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStream.getTracks().forEach(t => t.stop());
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          startRecordingInternal();
        }
      }, 500);
    } catch {
      setStatus("Microphone not available - please check your device");
    }
  }, []);

  const handleNoResponse = useCallback(() => {
    if (noResponseRetryRef.current === 0) {
      // First timeout: Linda asks "Are you there?"
      stopRecordingSilent();
      noResponseRetryRef.current = 1;

      const areYouThereMsg = "Are you there? I didn't hear a response.";
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: areYouThereMsg,
      }]);

      setStatus("Linda is speaking...");
      setIsAiSpeaking(true);
      avatarState.onAiStartSpeaking();

      const utterance = new SpeechSynthesisUtterance(areYouThereMsg);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        setIsAiSpeaking(false);
        avatarState.onAiStopSpeaking();
        setStatus("Your turn - speak now...");
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            startRecordingInternal();
          }
        }, 400);
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        setTimeout(() => {
          setIsAiSpeaking(false);
          avatarState.onAiStopSpeaking();
          setStatus("Your turn - speak now...");
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            startRecordingInternal();
          }
        }, 1500);
      }
    } else {
      // Second timeout: Show mic popup
      stopRecordingSilent();
      setShowMicPopup(true);
      setStatus("Checking microphone...");

      micPopupTimerRef.current = setTimeout(() => {
        handleMicPopupNo();
      }, 3000);
    }
  }, [stopRecordingSilent, avatarState, handleMicPopupNo]);

  // Keep refs in sync with latest callbacks
  useEffect(() => {
    handleNoResponseRef.current = handleNoResponse;
  }, [handleNoResponse]);
  useEffect(() => {
    stopRecordingSilentRef.current = stopRecordingSilent;
  }, [stopRecordingSilent]);

  // WebSocket connection
  const connect = useCallback(() => {
    // Reuse existing context or create with default hardware sample rate
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      try {
        audioContextRef.current = new AudioContext();
      } catch (err) {
        console.error('[InterviewUI] Failed to create playback AudioContext:', err);
      }
    }
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '') || 'localhost:8000';
    const wsUrl = `${protocol}//${apiUrl}/api/v1/ws/ai-interview/${token}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setIsConnected(true);
      setStatus("Connected - Linda is greeting you...");
    };
    ws.onclose = (event) => {
      setIsConnected(false);
      if (event.code === 1000 || shouldDisconnectAfterAudioRef.current) {
        setStatus("Interview completed. Thank you!");
        uploadRecording();
        onInterviewComplete?.();
      } else {
        setStatus("Disconnected");
      }
      stopRecording();
    };
    ws.onerror = () => {
      setStatus("Connection error - please refresh");
    };
    // Use refs so handlers always call the latest version without reconnecting
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        queueAudioRef.current(event.data);
      } else {
        const data = JSON.parse(event.data);
        handleMessageRef.current(data);
      }
    };
    wsRef.current = ws;
  }, [token, onInterviewComplete, stopRecording, uploadRecording]);

  // Pre-acquire microphone permission on mount so the browser prompts early
  // (Webcam component only requests video; mic is otherwise deferred until after greeting)
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // Permission granted — stop the temporary stream immediately
        stream.getTracks().forEach(t => t.stop());
      })
      .catch(() => {
        // Permission denied — startRecordingInternal will handle the error later
      });
  }, []);

  // Auto-connect once on mount (refs keep handlers fresh without reconnecting)
  useEffect(() => {
    const timer = setTimeout(() => { connect(); }, 300);
    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
      // Clean up audio contexts on unmount
      try { audioContextRef.current?.close(); } catch {}
      audioContextRef.current = null;
      try { recordingContextRef.current?.close(); } catch {}
      recordingContextRef.current = null;
      // Clean up media streams
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      processorRef.current?.disconnect();
      processorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentAiText, currentTranscript]);

  // DevTools / keyboard blocking during active interview
  useEffect(() => {
    if (!isConnected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 (DevTools)
      if (e.key === "F12") { e.preventDefault(); return; }
      // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools)
      if (e.ctrlKey && e.shiftKey && ["I","i","J","j","C","c"].includes(e.key)) { e.preventDefault(); return; }
      // Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === "u" || e.key === "U")) { e.preventDefault(); return; }
      // Ctrl+S (Save Page)
      if (e.ctrlKey && (e.key === "s" || e.key === "S")) { e.preventDefault(); return; }
      // Ctrl+P (Print)
      if (e.ctrlKey && (e.key === "p" || e.key === "P")) { e.preventDefault(); return; }
    };
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, [isConnected]);

  return (
    <>
    {/* Camera/Mic disabled overlay */}
    {isConnected && (!proctoringState.isCameraActive || !proctoringState.isMicrophoneActive) && (
      <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-sm">
        <div className="bg-gray-900 border border-red-500 rounded-2xl p-8 max-w-md text-center shadow-2xl">
          <div className="text-red-500 text-5xl mb-4">
            {!proctoringState.isCameraActive ? "📷" : "🎤"}
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {!proctoringState.isCameraActive && !proctoringState.isMicrophoneActive
              ? "Camera & Microphone Disabled"
              : !proctoringState.isCameraActive
              ? "Camera Disabled"
              : "Microphone Disabled"}
          </h2>
          <p className="text-gray-400 mb-4">
            {!proctoringState.isCameraActive
              ? "Your camera has been disabled. Please re-enable it to continue the interview."
              : "Your microphone has been disabled. Please re-enable it to continue the interview."}
          </p>
          <div className="text-sm text-red-400 font-medium animate-pulse">
            This event has been recorded
          </div>
        </div>
      </div>
    )}
    {/* Fullscreen exit overlay */}
    {isConnected && !isFullscreenActive && (
      <div className="fixed inset-0 z-[99] bg-black/90 flex items-center justify-center backdrop-blur-sm">
        <div className="bg-gray-900 border border-yellow-500 rounded-2xl p-8 max-w-md text-center shadow-2xl">
          <Maximize2 className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Fullscreen Required</h2>
          <p className="text-gray-400 mb-6">
            Please return to fullscreen mode to continue the interview.
          </p>
          <button
            onClick={() => requestFullscreen().catch(() => {})}
            className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-xl font-bold text-white transition-colors"
          >
            Return to Fullscreen
          </button>
          <div className="text-sm text-red-400 font-medium animate-pulse mt-4">
            This event has been recorded
          </div>
        </div>
      </div>
    )}
    {/* Microphone issue popup */}
    {showMicPopup && (
      <div className="fixed inset-0 z-[101] bg-black/80 flex items-center justify-center backdrop-blur-sm">
        <div className="bg-gray-900 border border-amber-500 rounded-2xl p-8 max-w-sm text-center shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="text-amber-500 text-5xl mb-4">🎤</div>
          <h2 className="text-xl font-bold text-white mb-2">Microphone Issue?</h2>
          <p className="text-gray-400 mb-6">
            We couldn&apos;t detect any audio. Is your microphone working?
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleMicPopupYes}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-bold text-white transition-colors"
            >
              Yes, Resume
            </button>
            <button
              onClick={handleMicPopupNo}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-bold text-white transition-colors"
            >
              No, End Interview
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">Auto-closing in 3 seconds...</p>
        </div>
      </div>
    )}
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm flex-shrink-0">
        <div>
          <h1 className="text-base font-bold tracking-tight">AI Interview</h1>
          <p className="text-xs text-gray-400">{interviewInfo.position}</p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && !isClosing && (
            <div className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-mono ${
              remainingSeconds <= 60 ? 'bg-red-500/20 text-red-400 animate-pulse' :
              remainingSeconds <= 300 ? 'bg-orange-500/20 text-orange-400' :
              'bg-blue-500/10 text-blue-300'
            }`}>
              <Clock className="w-3.5 h-3.5" />
              <span className="font-medium">{formatTime(remainingSeconds)}</span>
            </div>
          )}
          {isClosing && (
            <div className="px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded-lg text-sm font-medium animate-pulse">
              Interview Ending...
            </div>
          )}
          <div className={`text-xs px-2.5 py-1 rounded-full ${
            isConnected ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/20 text-gray-500'
          }`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </div>
        </div>
      </div>

      {/* ── Main Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANEL: Chat transcript ──────────────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900/60">
          {/* Panel header */}
          <div className="px-4 py-2.5 border-b border-gray-800/70 flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-gray-400 font-medium">Live Conversation</span>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3 py-4 space-y-4"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
          >
            {messages.length === 0 && !currentAiText && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-600 text-xs text-center">Conversation will appear here...</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "system" ? (
                  <div className="flex justify-center">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/25 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <p className="text-xs text-amber-300">{msg.content}</p>
                    </div>
                  </div>
                ) : msg.role === "user" ? (
                  /* You — right */
                  <div className="flex justify-end">
                    <div className="max-w-[85%]">
                      <p className="text-[10px] text-gray-500 mb-1 text-right">You</p>
                      <div className="bg-blue-600 rounded-2xl rounded-br-sm px-3 py-2 shadow-md shadow-blue-900/20">
                        <p className="text-sm leading-relaxed text-white">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Linda — left */
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow">
                      <span className="text-[10px] font-bold text-white">L</span>
                    </div>
                    <div className="max-w-[85%]">
                      <p className="text-[10px] text-gray-500 mb-1">Linda</p>
                      <div className="bg-gray-800 border border-gray-700/50 rounded-2xl rounded-tl-sm px-3 py-2 shadow">
                        <p className="text-sm leading-relaxed text-gray-100">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Live speech transcript */}
            {currentTranscript && (
              <div className="flex justify-end">
                <div className="max-w-[85%]">
                  <p className="text-[10px] text-gray-500 mb-1 text-right">You</p>
                  <div className="bg-blue-600/30 border border-blue-500/40 rounded-2xl rounded-br-sm px-3 py-2">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                      <span className="text-[10px] text-red-300">speaking...</span>
                    </div>
                    <p className="text-sm text-gray-200 italic">{currentTranscript}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Live Linda response */}
            {currentAiText && (
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow">
                  <span className="text-[10px] font-bold text-white">L</span>
                </div>
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-[10px] text-gray-500">Linda</p>
                    <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <div className="bg-gray-800 border border-violet-500/25 rounded-2xl rounded-tl-sm px-3 py-2 shadow">
                    <p className="text-sm leading-relaxed text-gray-100">{currentAiText}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Thinking dots */}
            {isProcessing && !currentAiText && (
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow">
                  <span className="text-[10px] font-bold text-white">L</span>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 mb-1">Linda</p>
                  <div className="bg-gray-800 border border-gray-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Text input (manual typing) ───────────────────────────────── */}
          <div className="flex-shrink-0 p-3 border-t border-gray-800 bg-gray-900/80">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (textInput.trim()) {
                  sendTextInput(textInput);
                  setTextInput("");
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  isAiSpeaking ? "Wait for Linda to finish..." :
                  isProcessing ? "Processing..." :
                  "Type your response..."
                }
                disabled={isAiSpeaking || isProcessing || !isConnected}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!textInput.trim() || isAiSpeaking || isProcessing || !isConnected}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-colors"
              >
                Send
              </button>
            </form>
            {/* Voice status */}
            <div className="flex items-center gap-1.5 mt-2">
              <div className={`w-1.5 h-1.5 rounded-full ${
                isRecording ? 'bg-red-500 animate-pulse' :
                isAiSpeaking ? 'bg-violet-400 animate-pulse' :
                isProcessing ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'
              }`} />
              <span className={`text-[11px] ${
                isRecording ? 'text-red-400' :
                isAiSpeaking ? 'text-violet-400' :
                isProcessing ? 'text-yellow-400' : 'text-gray-500'
              }`}>{status}</span>
              {isConnected && isRecording && (
                <button
                  onClick={stopRecording}
                  className="ml-auto text-[10px] px-2 py-0.5 bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 rounded-md hover:bg-yellow-600/30 transition-colors"
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Linda big screen + webcam PiP ─────────────────────────── */}
        <div className="flex-1 relative bg-gradient-to-b from-gray-900 to-gray-950 flex items-center justify-center overflow-hidden">

          {/* Linda — portrait container, centered in panel */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Avatar
              state={avatarState.currentState}
              isAiSpeaking={isAiSpeaking}
              className="h-full rounded-none"
              style={{ aspectRatio: "9/16", maxHeight: "100%", maxWidth: "100%" }}
              mouthOpenness={isAiSpeaking ? mouthOpenness : 0}
            />
          </div>

          {/* Speaking glow ring when Linda is talking */}
          {isAiSpeaking && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 rounded-none"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.08) 0%, transparent 70%)',
                  animation: 'pulse 2s infinite',
                }}
              />
            </div>
          )}

          {/* Linda name + status — bottom left of main screen */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl flex items-center gap-2 border border-white/10">
              <div className={`w-2 h-2 rounded-full ${isAiSpeaking ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-sm font-semibold text-white">Linda</span>
              <span className="text-xs text-gray-400">AI Interviewer</span>
            </div>
            {handDetection.isHandRaised && (
              <div className="px-3 py-1.5 bg-orange-500/20 backdrop-blur-md rounded-xl border border-orange-500/30">
                <span className="text-xs text-orange-400 font-bold animate-pulse">✋ HAND RAISED</span>
              </div>
            )}
          </div>

          {/* Candidate webcam — PiP bottom right */}
          <div className="absolute bottom-4 right-4 w-44 rounded-2xl overflow-hidden border-2 border-gray-700/80 shadow-2xl bg-gray-900">
            <Webcam
              ref={webcamRef}
              className="w-full aspect-video"
              onVideoReady={handleVideoReady}
              onStream={(stream) => setWebcamStream(stream)}
              showHandIndicator={false}
              isHandRaised={handDetection.isHandRaised}
            />
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 backdrop-blur-sm flex items-center gap-1.5">
              <span className="text-[10px] text-gray-300 truncate">{interviewInfo.candidate_name}</span>
              {isRecording && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse ml-auto flex-shrink-0" />}
            </div>
          </div>

        </div>
      </div>
    </div>
    <InterviewProctoringWarnings />
    </>
  );
}
