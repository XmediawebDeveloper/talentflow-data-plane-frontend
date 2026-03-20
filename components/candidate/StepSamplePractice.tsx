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
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';

// ── Component props ──────────────────────────────────────────────────────────

interface StepSamplePracticeProps {
  token: string;
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
  const english = voices.find(
    (v) => v.lang.startsWith('en') && !v.name.toLowerCase().includes('male')
  );
  return english || voices.find((v) => v.lang.startsWith('en')) || voices[0];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StepSamplePractice({
  token,
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
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [inputMode, setInputMode] = useState<'none' | 'voice' | 'typing'>('none');
  const [audioLevel, setAudioLevel] = useState(0);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [transcribeError, setTranscribeError] = useState('');

  // ── Refs ─────────────────────────────────────────────────────────────────

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setCameraReady(true);
        setMicReady(true);

        // Audio analyser for level meter
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

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

    if (!window.speechSynthesis) {
      setTtsSupported(false);
    }

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
        mediaRecorderRef.current = null;
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
      window.speechSynthesis?.cancel();
    };
  }, []);

  // ── Recording + transcription ─────────────────────────────────────────────

  const stopRecordingAndTranscribe = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    setIsRecording(false);

    await new Promise<void>((resolve) => {
      const mr = mediaRecorderRef.current!;
      mr.onstop = () => resolve();
      try { mr.stop(); } catch { resolve(); }
    });

    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;

    if (chunks.length === 0) return;

    const mimeType = chunks[0].type || 'audio/webm';
    const audioBlob = new Blob(chunks, { type: mimeType });

    setIsTranscribing(true);
    setTranscribeError('');
    try {
      const text = await candidateAIInterviewService.transcribePracticeAudio(token, audioBlob);
      if (text.trim()) {
        setTranscript(text);
        setInputMode('voice');
        setVoiceReady(true);
      } else {
        setTranscribeError('No speech detected. Try again or type your answer below.');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Transcription failed. Please try again or type your answer.';
      setTranscribeError(msg);
    } finally {
      setIsTranscribing(false);
    }
  }, [token]);

  const startRecording = useCallback(() => {
    if (!mediaStreamRef.current?.active) return;

    // Audio-only stream for recording
    const audioTracks = mediaStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const audioStream = new MediaStream(audioTracks);
    audioChunksRef.current = [];

    // Pick best supported MIME type
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ].find((m) => MediaRecorder.isTypeSupported(m)) || '';

    const mr = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = mr;
    mr.start(500); // collect chunks every 500ms
    setIsRecording(true);
    setTranscript('');
    setTypedAnswer('');
    setInputMode('none');
    setTranscribeError('');
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecordingAndTranscribe();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecordingAndTranscribe]);

  // ── TTS: Speak the practice question ──────────────────────────────────────

  const speakQuestion = useCallback(() => {
    if (!window.speechSynthesis) {
      setTtsSupported(false);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(PRACTICE_QUESTION);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => setAiSpeaking(true);

    utterance.onend = () => {
      setAiSpeaking(false);
      setAiSpoken(true);
      // Auto-start recording after AI finishes speaking
      if (mediaStreamRef.current?.active) {
        setTimeout(() => startRecording(), 500);
      }
    };

    utterance.onerror = () => {
      setAiSpeaking(false);
      setAiSpoken(true);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [startRecording]);

  // Auto-speak on mount
  useEffect(() => {
    const fallbackTimer = setTimeout(() => setAiSpoken(true), 3000);

    if (!window.speechSynthesis) {
      setTtsSupported(false);
      return () => clearTimeout(fallbackTimer);
    }

    const trySpeak = () => {
      if (window.speechSynthesis.getVoices().length > 0) speakQuestion();
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      const timer = setTimeout(speakQuestion, 800);
      return () => { clearTimeout(timer); clearTimeout(fallbackTimer); };
    }

    window.speechSynthesis.addEventListener('voiceschanged', trySpeak);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', trySpeak);
      clearTimeout(fallbackTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetPractice = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setIsTranscribing(false);
    setTranscript('');
    setTypedAnswer('');
    setInputMode('none');
    setVoiceReady(false);
    setTranscribeError('');
    setAiSpeaking(false);
    setAiSpoken(false);
    window.speechSynthesis?.cancel();
    setTimeout(() => speakQuestion(), 400);
  }, [speakQuestion]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayAnswer = inputMode === 'voice' ? transcript : typedAnswer;
  const hasAnswer = displayAnswer.trim().length > 0;

  // ── Status items ──────────────────────────────────────────────────────────

  const statusItems = [
    { icon: Camera, label: 'Camera Access', ready: cameraReady },
    { icon: Mic, label: 'Microphone', ready: micReady },
    { icon: Volume2, label: 'Voice Recording', ready: voiceReady },
  ];

  const checklistItems = [
    { color: 'bg-green-500', label: 'Microphone', desc: 'Verify audio input is working' },
    { color: 'bg-orange-400', label: 'Recording', desc: 'Ensure voice is captured properly' },
    { color: 'bg-gray-500', label: 'Interface', desc: 'You understand how to answer questions' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <span className="inline-block px-4 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">
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
          <div className="bg-gray-800 px-5 py-3">
            <h3 className="text-white font-semibold text-sm">Your Video Preview</h3>
            <p className="text-gray-300 text-xs mt-0.5">
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
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-gray-700/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
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
            {/* Recording indicator */}
            {isRecording && !aiSpeaking && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                Recording...
              </div>
            )}
            {/* Transcribing indicator */}
            {isTranscribing && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-blue-600/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
                Transcribing...
              </div>
            )}
          </div>
        </div>

        {/* ── Right Top: Practice Question ────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-gray-800 px-5 py-3">
            <h3 className="text-white font-semibold text-sm">Practice Question</h3>
            <p className="text-gray-300 text-xs mt-0.5">
              This won&apos;t be recorded — just a test run
            </p>
          </div>
          <div className="p-5 space-y-4 flex-1 flex flex-col">
            {/* AI interviewer prompt */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MessageSquare className="w-4 h-4 text-gray-500" />
              <span>AI Interviewer asks:</span>
              {aiSpeaking && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-600 font-medium">
                  <span className="flex items-center gap-0.5">
                    <span className="w-1 h-2 bg-gray-500 rounded-full animate-pulse" />
                    <span className="w-1 h-3 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                  </span>
                  Speaking...
                </span>
              )}
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-800 font-medium">
                &ldquo;{PRACTICE_QUESTION}&rdquo;
              </p>
              {/* Play / Replay button */}
              {ttsSupported && !aiSpeaking && (
                <button
                  type="button"
                  onClick={speakQuestion}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  <Play className="w-3 h-3" />
                  {aiSpoken ? 'Replay Question' : 'Play Question'}
                </button>
              )}
            </div>

            {/* "Your turn" indicator when AI finishes speaking */}
            {aiSpoken && !aiSpeaking && (
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-700">Your Answer:</p>
                {!isRecording && !isTranscribing && !hasAnswer && (
                  <span className="text-xs text-gray-600 animate-pulse">Your turn to answer!</span>
                )}
                {isTranscribing && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Transcribing your answer...
                  </span>
                )}
                {hasAnswer && !isTranscribing && (
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
                        className="w-1.5 h-6 bg-gray-400 rounded-full animate-pulse"
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
                      if (isRecording) return; // don't allow typing while recording
                      setTypedAnswer(e.target.value);
                      setInputMode('typing');
                    }}
                    placeholder={
                      isRecording
                        ? 'Recording… speak now and click Stop when done'
                        : isTranscribing
                        ? 'Transcribing your answer…'
                        : 'Click "Start Recording" below or type your answer here...'
                    }
                    readOnly={isRecording || isTranscribing}
                    className={`w-full h-full min-h-[80px] border rounded-lg p-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-colors ${
                      isRecording
                        ? 'border-red-300 bg-red-50/30'
                        : isTranscribing
                        ? 'border-blue-300 bg-blue-50/30'
                        : 'border-gray-300 bg-white'
                    }`}
                    rows={4}
                  />
                </div>

                {/* Transcription error */}
                {transcribeError && !isTranscribing && (
                  <p className="text-xs text-red-500">{transcribeError}</p>
                )}

                {/* Voice / Record button */}
                <div className="flex gap-3">
                  {micReady ? (
                    <button
                      type="button"
                      onClick={toggleRecording}
                      disabled={isTranscribing}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                        isRecording
                          ? 'bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-200'
                          : 'bg-gray-900 text-white hover:bg-gray-800 shadow-md shadow-gray-200'
                      }`}
                    >
                      {isTranscribing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Transcribing...
                        </>
                      ) : isRecording ? (
                        <>
                          <Square className="w-4 h-4" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" />
                          {hasAnswer ? 'Re-record Answer' : 'Start Recording'}
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-amber-700">
                        <MicOff className="w-3.5 h-3.5 inline mr-1" />
                        Microphone not available. You can type your answer instead.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Tip — always visible */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-auto">
              <p className="text-xs text-gray-700 leading-relaxed">
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
          <div className="bg-white border border-gray-200 rounded-xl p-5 border-l-4 border-l-gray-500">
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
            <Globe className="w-4 h-4 text-gray-500" />
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
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
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
