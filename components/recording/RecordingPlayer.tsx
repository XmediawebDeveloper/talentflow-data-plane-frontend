'use client';

/**
 * RecordingPlayer — shared two-view recording player (Candidate View = webcam,
 * Screen View = entire-screen capture).
 *
 * Extracted from components/ai-interview/CandidateResultsView.tsx
 * (VideoWithDuration / RecordingInfoPanel / RecordingTabContent) so the
 * assessment results page shows recordings the same way as the AI interview.
 * The interview page still renders its own inline copy; migrating it here is
 * a follow-up. Playback is stream-first: the caller passes presigned URLs.
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, Monitor, Download, Clock, Loader2, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface RecordingSource {
  /** null = not fetched yet, false = no recording exists, true = exists. */
  available: boolean | null;
  url: string | null;
  downloadUrl: string | null;
  size: number | null;
  loading: boolean;
  error: boolean;
}

export const EMPTY_RECORDING_SOURCE: RecordingSource = {
  available: null, url: null, downloadUrl: null, size: null, loading: false, error: false,
};

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null || !isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

export function VideoWithDuration({
  src, onError, onDuration, seekTo, seekKey,
}: {
  src: string;
  onError: () => void;
  onDuration?: (seconds: number) => void;
  seekTo?: number | null;
  seekKey?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const readyRef = useRef(false);

  const applyDuration = (d: number) => {
    setDuration(d);
    if (onDuration && isFinite(d) && d > 0) onDuration(d);
  };
  const applySeek = () => {
    const v = videoRef.current;
    if (!v || !readyRef.current || seekTo == null) return;
    const max = isFinite(v.duration) && v.duration > 0 ? v.duration - 0.25 : seekTo;
    try {
      v.currentTime = Math.max(0, Math.min(seekTo, max));
      void v.play?.().catch(() => {});
    } catch { /* not yet seekable */ }
  };
  const markReady = () => { readyRef.current = true; applySeek(); };

  useEffect(() => { applySeek(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [seekKey]);

  // WebM written by MediaRecorder has no duration until the remux runs; the
  // seek-to-end trick makes the browser compute it.
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isFinite(v.duration) && v.duration > 0) { applyDuration(v.duration); markReady(); return; }
    const onTimeUpdate = () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.currentTime = 0;
      applyDuration(v.duration);
      markReady();
    };
    v.addEventListener('timeupdate', onTimeUpdate);
    v.currentTime = 1e9;
  };

  return (
    <div className="relative">
      <video
        ref={videoRef}
        controls
        preload="metadata"
        className="w-full max-h-[500px] rounded-xl bg-slate-900 ring-1 ring-black/[0.04]"
        src={src}
        onLoadedMetadata={handleLoadedMetadata}
        onError={onError}
      >
        Your browser does not support video playback.
      </video>
      {duration !== null && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900/80 backdrop-blur-sm text-white text-xs font-medium ring-1 ring-white/10">
          <Clock className="w-3 h-3" /> {formatDuration(duration)}
        </div>
      )}
    </div>
  );
}

function VideoPane({
  label, source, onError, onDuration, seekTo, seekKey,
}: {
  label: string;
  source: RecordingSource;
  onError: () => void;
  onDuration: (s: number) => void;
  seekTo?: number | null;
  seekKey?: number;
}) {
  if (source.loading || source.available === null) {
    return (
      <div className="h-64 rounded-xl bg-slate-100 flex items-center justify-center text-sm text-gray-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading {label.toLowerCase()}…
      </div>
    );
  }
  if (source.available === false || !source.url) {
    return (
      <div className="h-64 rounded-xl bg-slate-50 border border-dashed border-gray-200 flex flex-col items-center justify-center text-sm text-gray-500 gap-2">
        <Video className="w-6 h-6 text-gray-400" />
        {label} not available
      </div>
    );
  }
  if (source.error) {
    return (
      <div className="h-64 rounded-xl bg-destructive-subtle border border-destructive/20 flex items-center justify-center text-sm text-destructive">
        {label} could not be played.
      </div>
    );
  }
  return <VideoWithDuration src={source.url} onError={onError} onDuration={onDuration} seekTo={seekTo} seekKey={seekKey} />;
}

export interface RecordingPlayerProps {
  candidate: RecordingSource;
  screen: RecordingSource;
  /** Used in the download filenames. */
  recordId: string;
  recordedAt?: string;
  screenLabel?: string;
  dateLabel?: string;
  onDownload?: (kind: 'candidate' | 'screen') => void;
  onCandidateError?: () => void;
  onScreenError?: () => void;
  seekRequest?: { seconds: number; key: number } | null;
}

export function RecordingPlayer({
  candidate, screen, recordId, recordedAt, screenLabel = 'Screen View', dateLabel = 'Recorded',
  onDownload, onCandidateError, onScreenError, seekRequest,
}: RecordingPlayerProps) {
  // Default to the screen recording when it exists (the recruiter wants the
  // screen first), else the candidate view.
  const [view, setView] = useState<'candidate' | 'screen'>('screen');
  const [candidateDuration, setCandidateDuration] = useState<number | null>(null);
  const [screenDuration, setScreenDuration] = useState<number | null>(null);

  useEffect(() => {
    if (screen.available === false && candidate.available) setView('candidate');
  }, [screen.available, candidate.available]);

  useEffect(() => {
    if (!seekRequest) return;
    setView(screen.available ? 'screen' : 'candidate');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.key]);

  const isCandidate = view === 'candidate';
  const source = isCandidate ? candidate : screen;
  const downloadUrl = source.downloadUrl || source.url;
  const duration = isCandidate ? candidateDuration : screenDuration;
  const downloadName = isCandidate ? `candidate-view-${recordId}.webm` : `screen-view-${recordId}.webm`;
  const status = source.available ? 'Available' : source.available === false ? 'Unavailable' : 'Checking';

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => setView('candidate')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${isCandidate ? 'bg-white text-brand-blue shadow-sm ring-1 ring-brand-blue/15' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Camera className="w-3.5 h-3.5" /> Candidate View
        </button>
        <button
          type="button"
          onClick={() => setView('screen')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${!isCandidate ? 'bg-white text-brand-blue shadow-sm ring-1 ring-brand-blue/15' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Monitor className="w-3.5 h-3.5" /> {screenLabel}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {!isCandidate && <p className="text-xs text-gray-500">Entire-screen recording captured during the session.</p>}
          {isCandidate ? (
            <VideoPane label="Candidate recording" source={candidate} onError={() => onCandidateError?.()} onDuration={setCandidateDuration} seekTo={seekRequest?.seconds ?? null} seekKey={seekRequest?.key ?? 0} />
          ) : (
            <VideoPane label="Screen recording" source={screen} onError={() => onScreenError?.()} onDuration={setScreenDuration} seekTo={seekRequest?.seconds ?? null} seekKey={seekRequest?.key ?? 0} />
          )}
        </div>
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2 tracking-tight">Recording Information</h3>
            <Row label="Status" value={<Badge variant={source.available ? 'success' : 'secondary'}>{status}</Badge>} />
            <Row label="File Size" value={formatBytes(source.size)} />
            <Row label="Duration" value={duration != null ? formatDuration(duration) : '—'} />
            <Row label={dateLabel} value={formatDate(recordedAt)} />
          </div>
          {source.available && downloadUrl && (
            <a
              href={downloadUrl}
              download={downloadName}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onDownload?.(isCandidate ? 'candidate' : 'screen')}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-brand-blue text-white hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/20 ring-1 ring-brand-blue/30 transition-colors"
            >
              <Download className="w-4 h-4" /> Download Recording
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
