'use client';

/**
 * RecordingPlayer — shared two-view recording player (Candidate View = webcam,
 * Screen View = entire-screen capture).
 *
 * Extracted from components/ai-interview/CandidateResultsView.tsx
 * (VideoWithDuration / RecordingInfoPanel / RecordingTabContent) so the
 * assessment results page shows recordings the same way as the AI interview.
 * The interview page (CandidateResultsView) uses VideoWithDuration from here
 * too, so all four recordings share one duration probe. Playback is
 * stream-first: the caller passes presigned URLs.
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, Monitor, Download, Clock, Loader2, Video, Play, Pause, Volume2, VolumeX, Maximize, Minimize, ChevronDown, ChevronUp, Check } from 'lucide-react';
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

/** A labelled moment in a recording: a question (a "Q3" chip on the player's
 *  progress bar) or a proctoring violation (a dot, coloured by severity, on
 *  the collapsible violation strip under the player). */
export interface VideoMarker {
  seconds: number;
  label: string;
  /** Hover text, e.g. the question itself. */
  title?: string;
  /** Defaults to 'question'. */
  kind?: 'question' | 'violation';
  /** Violation severity (recruiter-facing scale). */
  severity?: 'serious' | 'moderate' | 'minor';
}

const VIOLATION_DOT: Record<NonNullable<VideoMarker['severity']>, string> = {
  // Same colours as the Violations tab's "When it happened" timeline.
  serious: 'bg-destructive',
  moderate: 'bg-brand-orange',
  minor: 'bg-brand-blue',
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function VideoWithDuration({
  src, onError, onDuration, seekTo, seekKey, markers,
}: {
  src: string;
  onError: () => void;
  onDuration?: (seconds: number) => void;
  seekTo?: number | null;
  seekKey?: number;
  markers?: VideoMarker[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  // The player draws its own controls (not the browser's), so question
  // markers can sit on the progress bar and Speed can sit before Volume.
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Violation strip under the player — collapsed until asked for.
  const [showViolations, setShowViolations] = useState(false);
  // True while the recording's length is being worked out (see
  // handleLoadedMetadata). The controls stay hidden and a loading cover sits
  // over the video meanwhile: the probe parks the playhead at 1e9 s, and the
  // native controls used to show that as "277777:46:40".
  const [probing, setProbing] = useState(true);
  const readyRef = useRef(false);
  const probeCleanupRef = useRef<(() => void) | null>(null);

  // A new recording (e.g. Screen ↔ Candidate view) starts a fresh probe.
  useEffect(() => {
    readyRef.current = false;
    setDuration(null);
    setCurrentTime(0);
    setPlaying(false);
    setProbing(true);
    return () => { probeCleanupRef.current?.(); probeCleanupRef.current = null; };
  }, [src]);

  const applyDuration = (d: number) => {
    if (!isFinite(d) || d <= 0) return; // unknown length stays "—", never Infinity
    setDuration(d);
    onDuration?.(d);
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
  const markReady = () => { setProbing(false); readyRef.current = true; applySeek(); };

  useEffect(() => { applySeek(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [seekKey]);

  // WebM written by MediaRecorder has no duration in its header (Infinity)
  // until the remux runs; seeking far past the end makes the browser scan the
  // file and work it out. Done behind the loading cover, and it always ends:
  // on the real duration arriving (durationchange / timeupdate) or, at the
  // latest, after PROBE_TIMEOUT_MS — it used to wait on `timeupdate` alone and
  // could sit at 1e9 with no Duration for good.
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    probeCleanupRef.current?.();
    probeCleanupRef.current = null;
    if (isFinite(v.duration) && v.duration > 0) { applyDuration(v.duration); markReady(); return; }

    const PROBE_TIMEOUT_MS = 15000;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const known = () => isFinite(v.duration) && v.duration > 0;
    const cleanup = () => {
      v.removeEventListener('durationchange', onProgress);
      v.removeEventListener('timeupdate', onProgress);
      if (timer) clearTimeout(timer);
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      cleanup();
      probeCleanupRef.current = null;
      try { v.currentTime = 0; } catch { /* not seekable yet — plays from the start anyway */ }
      applyDuration(v.duration);
      markReady();
    };
    function onProgress() { if (known()) settle(); }
    v.addEventListener('durationchange', onProgress);
    v.addEventListener('timeupdate', onProgress);
    timer = setTimeout(settle, PROBE_TIMEOUT_MS);
    probeCleanupRef.current = cleanup;
    try { v.currentTime = 1e9; } catch { settle(); }
  };

  // Markers inside the recording, in time order. The active one is the last
  // marker the playhead has passed — the question currently on screen.
  const visibleMarkers = !probing && duration
    ? (markers ?? []).filter(m => m.seconds >= 0 && m.seconds < duration).sort((a, b) => a.seconds - b.seconds)
    : [];
  const questionMarkers = visibleMarkers.filter(m => m.kind !== 'violation');
  const violationMarkers = visibleMarkers.filter(m => m.kind === 'violation');
  let activeMarker = -1;
  questionMarkers.forEach((m, i) => { if (currentTime >= m.seconds) activeMarker = i; });
  const severitiesShown = (['serious', 'moderate', 'minor'] as const).filter(sv => violationMarkers.some(m => (m.severity ?? 'minor') === sv));
  const pct = (t: number) => (duration ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);

  // Ctrl (⌘ on Mac) + →/← jumps to the next / previous question. Ignored while
  // typing in a field. "Previous" skips the marker just passed (within 2 s)
  // so a repeat press keeps stepping back instead of replaying it.
  useEffect(() => {
    if (probing || !duration || !markers?.length) return;
    const times = markers
      .filter(m => m.kind !== 'violation')
      .map(m => m.seconds)
      .filter(t => t >= 0 && t < duration)
      .sort((a, b) => a - b);
    if (times.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      const v = videoRef.current;
      if (!v) return;
      const now = v.currentTime;
      const target = e.key === 'ArrowRight'
        ? times.find(t => t > now + 0.5)
        : [...times].reverse().find(t => t < now - 2);
      e.preventDefault();
      if (target === undefined) return;
      try {
        v.currentTime = Math.max(0, Math.min(target, duration - 0.25));
        void v.play?.().catch(() => {});
      } catch { /* not yet seekable */ }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [markers, duration, probing]);

  // Fullscreen is the whole player (video + controls), so the custom bar
  // stays usable; Esc / the browser's own exit are picked up here.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Close the speed menu on any click outside it.
  useEffect(() => {
    if (!speedOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!speedMenuRef.current?.contains(e.target as Node)) setSpeedOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [speedOpen]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || probing) return;
    if (v.paused || v.ended) void v.play?.().catch(() => {});
    else v.pause();
  };
  const seekToTime = (seconds: number, play = false) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const t = Math.max(0, Math.min(seconds, duration - 0.25));
    try { v.currentTime = t; setCurrentTime(t); } catch { /* not yet seekable */ }
    if (play) void v.play?.().catch(() => {});
  };
  const seekFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !duration || rect.width <= 0) return;
    seekToTime(((clientX - rect.left) / rect.width) * duration);
  };
  const changeRate = (r: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = r;
    setRate(r);
    setSpeedOpen(false);
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 1;
  };
  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
  };
  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  };

  const ctrlBtn = 'p-1 rounded-md text-white/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

  return (
    <div>
    <div
      ref={containerRef}
      className={`group/player relative overflow-hidden bg-slate-900 ring-1 ring-black/[0.04] ${fullscreen ? 'flex flex-col w-full h-full' : 'rounded-xl'}`}
    >
      {/* A fixed 16:9 frame: the webcam records 4:3 (640×480), the screen
          16:9 — both sit centred in the same box, letterboxed, never cropped,
          so switching views doesn't resize the player. */}
      <div className={`relative ${fullscreen ? 'flex-1 min-h-0' : 'aspect-video max-h-[500px]'}`}>
        <video
          ref={videoRef}
          preload="metadata"
          className="absolute inset-0 block w-full h-full object-contain bg-slate-900"
          src={src}
          onClick={togglePlay}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={(e) => { if (!probing && !scrubbingRef.current) setCurrentTime(e.currentTarget.currentTime); }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onVolumeChange={(e) => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
          onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
          onError={onError}
        >
          Your browser does not support video playback.
        </video>
        {probing && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900 text-sm text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading recording…
          </div>
        )}
        {!probing && duration !== null && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900/80 backdrop-blur-sm text-white text-xs font-medium ring-1 ring-white/10 pointer-events-none">
            <Clock className="w-3 h-3" /> {formatDuration(duration)}
          </div>
        )}

        {/* Control bar — an overlay on the video's bottom edge: progress bar
            (with question chips), then Play · time · … · Speed · Volume ·
            Fullscreen. Always shown while paused; while playing it fades out
            until the pointer is over the player (or a control has focus). */}
        {!probing && (
          <div
            className={`absolute inset-x-0 bottom-0 z-10 px-2 pt-6 pb-1 bg-gradient-to-t from-black/75 via-black/35 to-transparent text-white select-none transition-opacity duration-200 ${
              !playing || speedOpen ? 'opacity-100' : 'opacity-0 group-hover/player:opacity-100 focus-within:opacity-100'
            }`}
          >
            <div className={`relative ${questionMarkers.length > 0 ? 'h-8' : 'h-4'}`}>
              {questionMarkers.map((m, i) => (
                <button
                  key={`q-${m.label}-${m.seconds}`}
                  type="button"
                  onClick={() => seekToTime(m.seconds, true)}
                  title={`${m.label} · ${formatDuration(m.seconds)}${m.title ? ` — ${m.title}` : ''}`}
                  aria-label={`Jump to ${m.label} at ${formatDuration(m.seconds)}`}
                  className={`absolute top-0 -translate-x-1/2 px-1 py-0.5 rounded text-[10px] font-semibold leading-none ring-1 transition-colors cursor-pointer ${
                    i === activeMarker
                      ? 'bg-white text-slate-900 ring-white z-10'
                      : 'bg-black/40 text-white/90 ring-white/25 hover:bg-white/20'
                  }`}
                  style={{ left: `${pct(m.seconds)}%` }}
                >
                  {m.label}
                </button>
              ))}
              {/* Scrub area — taller than the visible track for an easy grab. */}
              <div
                ref={trackRef}
                role="slider"
                tabIndex={0}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration ?? 0)}
                aria-valuenow={Math.round(currentTime)}
                aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(duration ?? 0)}`}
                className="group absolute inset-x-0 bottom-0 h-4 cursor-pointer focus:outline-none"
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrubbingRef.current = true; seekFromPointer(e.clientX); }}
                onPointerMove={(e) => { if (scrubbingRef.current) seekFromPointer(e.clientX); }}
                onPointerUp={() => { scrubbingRef.current = false; }}
                onPointerCancel={() => { scrubbingRef.current = false; }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') { e.preventDefault(); seekToTime(currentTime + 5); }
                  else if (e.key === 'ArrowLeft') { e.preventDefault(); seekToTime(currentTime - 5); }
                }}
              >
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 group-hover:h-1.5 rounded-full bg-white/30 transition-all" />
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-1 group-hover:h-1.5 rounded-full bg-brand-blue transition-all"
                  style={{ width: `${pct(currentTime)}%` }}
                />
                {/* Question dots on the track itself, under their chips. */}
                {questionMarkers.map(m => (
                  <span
                    key={`t-${m.seconds}`}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white pointer-events-none"
                    style={{ left: `${pct(m.seconds)}%` }}
                  />
                ))}
                <span
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow ring-2 ring-brand-blue pointer-events-none"
                  style={{ left: `${pct(currentTime)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <button type="button" onClick={togglePlay} className={ctrlBtn} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
              <span className="ml-1 text-xs tabular-nums text-white/90">
                {formatDuration(currentTime)} / {duration !== null ? formatDuration(duration) : '—'}
              </span>
              <div className="flex-1" />

              {/* Speed — before Volume. */}
              <div ref={speedMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setSpeedOpen(o => !o)}
                  className={`${ctrlBtn} min-w-[2.25rem] text-xs font-semibold tabular-nums`}
                  aria-haspopup="menu"
                  aria-expanded={speedOpen}
                  aria-label={`Playback speed ${rate}x`}
                  title="Playback speed"
                >
                  {rate}x
                </button>
                {speedOpen && (
                  <div role="menu" className="absolute bottom-full right-0 mb-2 w-24 py-1 rounded-lg bg-slate-800 shadow-xl ring-1 ring-white/10 z-20">
                    {PLAYBACK_RATES.map(r => (
                      <button
                        key={r}
                        type="button"
                        role="menuitemradio"
                        aria-checked={r === rate}
                        onClick={() => changeRate(r)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs tabular-nums hover:bg-white/10 cursor-pointer ${r === rate ? 'text-white font-semibold' : 'text-white/75'}`}
                      >
                        {r === 1 ? 'Normal' : `${r}x`}
                        {r === rate && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center">
                <button type="button" onClick={toggleMute} className={ctrlBtn} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'} title={muted || volume === 0 ? 'Unmute' : 'Mute'}>
                  {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Volume"
                  className="w-16 h-1 mr-1 accent-white cursor-pointer"
                />
              </div>

              <button type="button" onClick={toggleFullscreen} className={ctrlBtn} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title={fullscreen ? 'Exit full screen' : 'Full screen'}>
                {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>

    {/* Violation strip — separate from the player's progress bar, collapsed
        behind a centred chevron until the reviewer opens it. */}
    {violationMarkers.length > 0 && duration && (
      <div className="mt-1">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowViolations(o => !o)}
            aria-expanded={showViolations}
            aria-label={showViolations ? 'Hide violations timeline' : 'Show violations timeline'}
            title={showViolations ? 'Hide violations' : 'Show violations'}
            className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {showViolations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {showViolations && (
          <div className="px-1">
            <div className="relative h-4">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gray-200" />
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-400/50"
                style={{ width: `${pct(currentTime)}%` }}
              />
              {violationMarkers.map((m, i) => (
                <button
                  key={`v-${i}-${m.seconds}`}
                  type="button"
                  onClick={() => seekToTime(m.seconds, true)}
                  title={`${m.label} · ${formatDuration(m.seconds)}`}
                  aria-label={`Jump to violation: ${m.label} at ${formatDuration(m.seconds)}`}
                  className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white cursor-pointer hover:scale-150 transition-transform ${VIOLATION_DOT[m.severity ?? 'minor']} ${m.severity === 'serious' ? 'w-3 h-3 z-10' : 'w-2.5 h-2.5'}`}
                  style={{ left: `${pct(m.seconds)}%` }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 text-2xs text-gray-400 mt-1">
              <span>0:00</span>
              <span className="flex items-center gap-3 text-gray-500">
                {severitiesShown.map(sv => (
                  <span key={sv} className="inline-flex items-center gap-1 capitalize">
                    <span className={`w-2 h-2 rounded-full ${VIOLATION_DOT[sv]}`} />{sv}
                  </span>
                ))}
              </span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>
        )}
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
      <div className="h-64 rounded-xl bg-slate-100 flex items-center justify-center tf-body-muted gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading {label.toLowerCase()}…
      </div>
    );
  }
  if (source.available === false || !source.url) {
    return (
      <div className="h-64 rounded-xl bg-slate-50 border border-dashed border-gray-200 flex flex-col items-center justify-center tf-body-muted gap-2">
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
      <span className="tf-meta">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Equal-width pills with one white indicator that slides between them. */}
      <div className="relative inline-grid grid-cols-2 bg-slate-100 rounded-lg p-1 ring-1 ring-slate-200">
        <span
          aria-hidden
          className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-white shadow-sm ring-1 ring-brand-blue/15 transition-transform duration-300 ease-out motion-reduce:transition-none ${
            isCandidate ? 'translate-x-full' : 'translate-x-0'
          }`}
        />
        <button
          type="button"
          onClick={() => setView('screen')}
          aria-pressed={!isCandidate}
          className={`relative z-10 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 ${!isCandidate ? 'text-brand-blue' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Monitor className="w-3.5 h-3.5" /> {screenLabel}
        </button>
        <button
          type="button"
          onClick={() => setView('candidate')}
          aria-pressed={isCandidate}
          className={`relative z-10 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors duration-300 ${isCandidate ? 'text-brand-blue' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Camera className="w-3.5 h-3.5" /> Candidate View
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Keyed on the view so the incoming recording fades in. */}
        <div key={view} className="lg:col-span-2 space-y-2 animate-in fade-in duration-300 motion-reduce:animate-none">
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
