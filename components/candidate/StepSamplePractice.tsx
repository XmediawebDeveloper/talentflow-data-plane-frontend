'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Camera,
  Globe,
  CheckCircle,
  RefreshCw,
  MessageSquare,
  Volume2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Square,
  Play,
} from 'lucide-react';

// ── SpeechRecognition TypeScript interfaces ──────────────────────────────────

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string; confidence: number };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

// ── Component props ──────────────────────────────────────────────────────────

interface StepSamplePracticeProps {
  onStartInterview: () => void;
  onGoBack?: () => void;
  selectedLanguage?: string;
  submitting?: boolean;
}

// ── Practice question ────────────────────────────────────────────────────────

const PRACTICE_QUESTION =
  'Please briefly introduce yourself — your name, background, and what excites you about this role.';

// ── Helper: pick a good SpeechSynthesis voice ────────────────────────────────

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Prefer natural-sounding English female voices
  const preferred = [
    'Google UK English Female',
    'Google US English',
    'Microsoft Zira',
    'Samantha',
    'Karen',
    'Moira',
    'Fiona',
  ];
  for (const name of preferred) {
    const v = voices.find((voice) => voice.name.includes(name));
    if (v) return v;
  }
  // Fallback: any English voice
  const english = voices.find(
    (v) => v.lang.startsWith('en') && !v.name.toLowerCase().includes('male')
  );
  return english || voices.find((v) => v.lang.startsWith('en')) || voices[0];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StepSamplePractice({
  onStartInterview,
  onGoBack,
  selectedLanguage = 'English',
  submitting = false,
}: StepSamplePracticeProps) {
  // ── State ────────────────────────────────────────────────────────────────

  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [aiSpoken, setAiSpoken] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [inputMode, setInputMode] = useState<'none' | 'voice' | 'typing'>('none');
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState('');
  const [networkRetries, setNetworkRetries] = useState(0);
  const [ttsSupported, setTtsSupported] = useState(true);

  // ── Refs ─────────────────────────────────────────────────────────────────

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Keep ref in sync
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // ── Webcam + mic setup on mount ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        // Attach video
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setCameraReady(true);
        setMicReady(true);

        // Audio analyser
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Start audio level monitoring
        const dataArray = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          setAudioLevel(Math.min(rms * 5, 1));
          animationFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        console.error('Failed to access camera/mic:', err);
      }
    };

    initMedia();

    // Check speech recognition support
    const SpeechAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) {
      setSpeechSupported(false);
    }

    // Check TTS support
    if (!window.speechSynthesis) {
      setTtsSupported(false);
    }

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      // Stop any TTS in progress
      window.speechSynthesis?.cancel();
    };
  }, []);

  // ── TTS: Speak the practice question ───────────────────────────────────

  const speakQuestion = useCallback(() => {
    if (!window.speechSynthesis) {
      setTtsSupported(false);
      return;
    }

    // Cancel any in-progress speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(PRACTICE_QUESTION);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      setAiSpeaking(true);
    };

    utterance.onend = () => {
      setAiSpeaking(false);
      setAiSpoken(true);
      // Auto-start listening after AI finishes speaking
      if (speechSupported && mediaStreamRef.current?.active) {
        setTimeout(() => startListening(), 500);
      }
    };

    utterance.onerror = () => {
      setAiSpeaking(false);
      setAiSpoken(true);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [speechSupported]); // startListening added below via ref

  // Auto-speak on mount (after voices load)
  useEffect(() => {
    if (!window.speechSynthesis) return;

    // Voices may load asynchronously
    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        speakQuestion();
      }
    };

    // Try immediately (voices may already be loaded)
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Small delay so user sees the UI first
      const timer = setTimeout(speakQuestion, 800);
      return () => clearTimeout(timer);
    }

    // Wait for voices to load
    window.speechSynthesis.addEventListener('voiceschanged', trySpeak);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', trySpeak);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Speech recognition helpers ───────────────────────────────────────────

  const startListening = useCallback(() => {
    const SpeechAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) return;

    // Stop any existing instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (finalText) {
          setFinalTranscript((prev) => prev + finalText);
          setInterimTranscript('');
          setVoiceReady(true);
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('[SpeechRecognition] Error:', event.error);
        if (event.error === 'not-allowed') {
          setSpeechSupported(false);
          setSpeechError('Microphone access denied. Please allow microphone permissions.');
          setIsListening(false);
          isListeningRef.current = false;
        } else if (event.error === 'network') {
          // Auto-retry up to 3 times for network errors
          setNetworkRetries((prev) => {
            if (prev < 3) {
              setSpeechError(`Connecting to speech service... (attempt ${prev + 2}/4)`);
              // onend will auto-restart
              return prev + 1;
            } else {
              setSpeechError(
                'Speech-to-text is unavailable — this uses Chrome\'s built-in service which requires Google connectivity. ' +
                'Don\'t worry, the actual interview uses our own AI transcription which works independently. ' +
                'For now, you can type your answer below.'
              );
              setIsListening(false);
              isListeningRef.current = false;
              return 0;
            }
          });
        } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
          setSpeechError(`Speech recognition error: ${event.error}. Try again.`);
        }
      };

      recognition.onend = () => {
        // Auto-restart if still supposed to be listening (use ref to avoid stale closure)
        if (isListeningRef.current && mediaStreamRef.current?.active) {
          setTimeout(() => {
            if (!isListeningRef.current) return;
            try {
              recognition.start();
            } catch {
              setIsListening(false);
              isListeningRef.current = false;
            }
          }, 300);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      setInputMode('voice');
      setSpeechError('');
      setNetworkRetries(0);
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setSpeechError('Failed to start speech recognition.');
    }
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    // Move any interim text to final
    setInterimTranscript((interim) => {
      if (interim) {
        setFinalTranscript((prev) => prev + interim);
      }
      return '';
    });
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const resetPractice = useCallback(() => {
    stopListening();
    window.speechSynthesis?.cancel();
    setFinalTranscript('');
    setInterimTranscript('');
    setTypedAnswer('');
    setInputMode('none');
    setVoiceReady(false);
    setSpeechError('');
    setAiSpeaking(false);
    setAiSpoken(false);
    // Re-speak the question after a short pause
    setTimeout(() => speakQuestion(), 400);
  }, [stopListening, speakQuestion]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const voiceTranscript = finalTranscript + (interimTranscript ? interimTranscript : '');
  const displayAnswer = inputMode === 'voice' ? voiceTranscript : typedAnswer;
  const hasAnswer = displayAnswer.trim().length > 0;

  // ── Status items ─────────────────────────────────────────────────────────

  const statusItems = [
    { icon: Camera, label: 'Camera Access', ready: cameraReady },
    { icon: Mic, label: 'Microphone', ready: micReady },
    { icon: Volume2, label: 'Voice Recording', ready: voiceReady },
  ];

  const checklistItems = [
    { color: 'bg-green-500', label: 'Microphone', desc: 'Verify audio input is working' },
    { color: 'bg-orange-400', label: 'Recording', desc: 'Ensure voice is captured properly' },
    { color: 'bg-blue-500', label: 'Interface', desc: 'You understand how to answer questions' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <span className="inline-block px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 text-sm font-medium">
          Practice &amp; Final Check
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Let&apos;s Test Your Setup
        </h2>
        <p className="text-gray-600 max-w-2xl mx-auto">
          The AI will ask you a practice question. Answer using your voice or by typing.
          This helps verify your microphone and camera are working.
        </p>
      </div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left Top: Video Preview ─────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3">
            <h3 className="text-white font-semibold text-sm">Your Video Preview</h3>
            <p className="text-purple-200 text-xs mt-0.5">
              Make sure you&apos;re visible and well-lit
            </p>
          </div>
          <div className="relative bg-gray-900 aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Audio level bar */}
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
              <div className="h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    audioLevel > 0.3 ? 'bg-green-400' : audioLevel > 0.05 ? 'bg-yellow-400' : 'bg-gray-500'
                  }`}
                  style={{ width: `${Math.max(audioLevel * 100, 2)}%` }}
                />
              </div>
            </div>
            {/* AI Speaking indicator */}
            {aiSpeaking && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-purple-600/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
                <div className="flex items-center gap-0.5">
                  <span className="w-1 h-3 bg-white rounded-full animate-pulse" />
                  <span className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                  <span className="w-1 h-5 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                  <span className="w-1 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.25s' }} />
                </div>
                AI Speaking...
              </div>
            )}
            {/* Listening indicator */}
            {isListening && !aiSpeaking && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                Listening...
              </div>
            )}
          </div>
        </div>

        {/* ── Right Top: Practice Question ────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3">
            <h3 className="text-white font-semibold text-sm">Practice Question</h3>
            <p className="text-purple-200 text-xs mt-0.5">
              This won&apos;t be recorded — just a test run
            </p>
          </div>
          <div className="p-5 space-y-4 flex-1 flex flex-col">
            {/* AI interviewer prompt */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MessageSquare className="w-4 h-4 text-purple-500" />
              <span>AI Interviewer asks:</span>
              {aiSpeaking && (
                <span className="inline-flex items-center gap-1 text-xs text-purple-600 font-medium">
                  <span className="flex items-center gap-0.5">
                    <span className="w-1 h-2 bg-purple-500 rounded-full animate-pulse" />
                    <span className="w-1 h-3 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                  </span>
                  Speaking...
                </span>
              )}
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
              <p className="text-gray-800 font-medium">
                &ldquo;{PRACTICE_QUESTION}&rdquo;
              </p>
              {/* Replay button */}
              {ttsSupported && !aiSpeaking && aiSpoken && (
                <button
                  type="button"
                  onClick={speakQuestion}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 font-medium transition-colors"
                >
                  <Play className="w-3 h-3" />
                  Replay Question
                </button>
              )}
            </div>

            {/* "Your turn" indicator when AI finishes speaking */}
            {aiSpoken && !aiSpeaking && (
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-700">Your Answer:</p>
                {!isListening && !hasAnswer && speechSupported && (
                  <span className="text-xs text-purple-600 animate-pulse">Your turn to answer!</span>
                )}
                {hasAnswer && (
                  <button
                    type="button"
                    onClick={resetPractice}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Try Again
                  </button>
                )}
              </div>
            )}

            {/* Waiting for AI to finish speaking */}
            {aiSpeaking && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-6 bg-purple-400 rounded-full animate-pulse"
                        style={{ animationDelay: `${i * 0.12}s`, animationDuration: '0.8s' }}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-gray-500">Listen to the question...</p>
                </div>
              </div>
            )}

            {/* Answer area — shown after AI finishes speaking */}
            {(aiSpoken && !aiSpeaking) && (
              <>
                <div className="relative flex-1">
                  <textarea
                    value={displayAnswer}
                    onChange={(e) => {
                      if (isListening) stopListening();
                      setTypedAnswer(e.target.value);
                      setInputMode('typing');
                    }}
                    placeholder={
                      isListening
                        ? 'Listening... speak now and your words will appear here'
                        : 'Click "Start Speaking" below or type your answer here...'
                    }
                    className={`w-full h-full min-h-[80px] border rounded-lg p-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-colors ${
                      isListening
                        ? 'border-red-300 bg-red-50/30'
                        : 'border-gray-300 bg-white'
                    }`}
                    rows={4}
                  />
                  {/* Interim indicator */}
                  {isListening && interimTranscript && (
                    <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 bg-white/80 px-1.5 py-0.5 rounded">
                      recognizing...
                    </div>
                  )}
                </div>

                {/* Speech error */}
                {speechError && (
                  <p className="text-xs text-red-500">{speechError}</p>
                )}

                {/* Voice / Type toggle buttons */}
                <div className="flex gap-3">
                  {speechSupported && (
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        isListening
                          ? 'bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-200'
                          : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 shadow-md shadow-purple-200'
                      }`}
                    >
                      {isListening ? (
                        <>
                          <Square className="w-4 h-4" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" />
                          Start Speaking
                        </>
                      )}
                    </button>
                  )}
                  {!speechSupported && (
                    <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-amber-700">
                        <MicOff className="w-3.5 h-3.5 inline mr-1" />
                        Speech recognition not available in this browser. You can type your answer instead.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Tip — always visible */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-auto">
              <p className="text-xs text-blue-700 leading-relaxed">
                <span className="font-semibold">Tip:</span> During the actual interview,
                the AI will speak each question aloud and transcribe your spoken
                response in real-time using our own AI transcription.
              </p>
            </div>
          </div>
        </div>

        {/* ── Left Bottom: System Status + What We're Testing ─────────── */}
        <div className="space-y-6">
          {/* System Status */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">
              System Status
            </h4>
            <div className="space-y-3">
              {statusItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-700">{item.label}</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${
                      item.ready
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {item.ready && <CheckCircle className="w-3 h-3" />}
                    {item.ready ? 'Ready' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* What We're Testing */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 border-l-4 border-l-purple-500">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              What We&apos;re Testing
            </h4>
            <ul className="space-y-2.5">
              {checklistItems.map((item) => (
                <li key={item.label} className="flex items-start gap-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${item.color}`}
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-medium">{item.label}:</span>{' '}
                    {item.desc}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Right Bottom: Selected Language ─────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-purple-500" />
            <h4 className="text-sm font-semibold text-gray-900">
              Selected Language
            </h4>
          </div>
          <p className="text-lg font-medium text-gray-800 mb-2">
            {selectedLanguage}
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            The interview will be conducted in this language. You can change it
            from the previous screen if needed.
          </p>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onGoBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Go Back
        </button>
        <button
          type="button"
          onClick={onStartInterview}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              Start Interview
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
