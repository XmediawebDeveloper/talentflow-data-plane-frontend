'use client';

import { useState, useRef, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrentQuestion } from '@/lib/services/candidateService';

interface HRQuestionViewProps {
  question: CurrentQuestion;
  answer: {
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    language?: string;
  };
  onAnswerChange: (answer: {
    text_response?: string;
    video_response_url?: string;
    selected_options?: string[];
    code_submission?: string;
    language?: string;
  }) => void;
}

export function HRQuestionView({ question, answer, onAnswerChange }: HRQuestionViewProps) {
  const [mode, setMode] = useState<'text' | 'video'>('text');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);

        // In a real implementation, you would upload this blob to a storage service
        // and get back a URL to store in the answer
        // For now, we'll just mark that a video was recorded
        onAnswerChange({ ...answer, video_response_url: 'recorded' });
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Question Text */}
      <div className="prose max-w-none">
        <h3 className="text-lg font-medium text-gray-800 mb-4">{question.question_text}</h3>
      </div>

      {/* Response Mode Toggle */}
      <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          onClick={() => setMode('text')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'text'
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Text Response
        </button>
        <button
          onClick={() => setMode('video')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            mode === 'video'
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Video className="w-4 h-4" />
          Video Response
        </button>
      </div>

      {/* Text Response */}
      {mode === 'text' && (
        <div>
          <textarea
            value={answer.text_response || ''}
            onChange={(e) => onAnswerChange({ ...answer, text_response: e.target.value })}
            placeholder="Type your response here... Be specific and provide examples where relevant."
            className="w-full h-64 p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-gray-500">
              {(answer.text_response || '').split(/\s+/).filter(Boolean).length} words
            </p>
            <p className="text-sm text-gray-500">
              Tip: Use the STAR method (Situation, Task, Action, Result)
            </p>
          </div>
        </div>
      )}

      {/* Video Response */}
      {mode === 'video' && (
        <div className="space-y-4">
          {/* Video Preview */}
          <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isRecording}
              className="w-full h-full object-cover"
            />

            {!isRecording && !recordedBlob && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <Video className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">Click "Start Recording" to begin</p>
              </div>
            )}

            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-3 py-1.5 rounded-full">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-white text-sm font-medium">{formatTime(recordingTime)}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {!isRecording ? (
              <Button
                variant="primary"
                onClick={startRecording}
                disabled={recordedBlob !== null}
              >
                <Video className="w-4 h-4 mr-2" />
                {recordedBlob ? 'Recording Complete' : 'Start Recording'}
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={stopRecording}
              >
                <VideoOff className="w-4 h-4 mr-2" />
                Stop Recording
              </Button>
            )}

            {recordedBlob && (
              <Button
                variant="outline"
                onClick={() => {
                  setRecordedBlob(null);
                  onAnswerChange({ ...answer, video_response_url: undefined });
                }}
              >
                Re-record
              </Button>
            )}
          </div>

          {/* Tips */}
          <div className="p-4 bg-blue-50 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-800">Recording Tips</p>
                <ul className="text-sm text-blue-700 mt-1 space-y-1">
                  <li>- Look directly at the camera while speaking</li>
                  <li>- Speak clearly and at a moderate pace</li>
                  <li>- Keep your answer focused and under 2 minutes</li>
                  <li>- Ensure good lighting on your face</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
