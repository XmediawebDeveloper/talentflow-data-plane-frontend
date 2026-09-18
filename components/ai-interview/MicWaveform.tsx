"use client";

import { memo, useEffect, useRef } from "react";

interface MicWaveformProps {
  /** Ref holding the AnalyserNode tapped off the candidate's mic stream. */
  analyserRef: React.RefObject<AnalyserNode | null>;
  /** Only animates while true (candidate's turn). When false it idles flat. */
  active: boolean;
  bars?: number;
  width?: number;
  height?: number;
  /** Bar colour (defaults to the banner's emerald). */
  color?: string;
  className?: string;
}

/**
 * Live equalizer-style waveform of the candidate's microphone input, drawn on a
 * canvas via requestAnimationFrame so it never triggers React re-renders. Reads
 * frequency data from an AnalyserNode that InterviewUI taps off the mic stream
 * in startRecordingInternal. Idles to a flat baseline when `active` is false or
 * no analyser is present (e.g. between turns / closed AudioContext).
 */
function MicWaveformBase({
  analyserRef,
  active,
  bars = 22,
  width = 132,
  height = 30,
  color = "var(--raw-34d399)",
  className,
}: MicWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // Smoothed per-bar heights so bars ease toward their target instead of jittering.
  const smoothRef = useRef<number[]>(new Array(bars).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    if (smoothRef.current.length !== bars) {
      smoothRef.current = new Array(bars).fill(0);
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);

      const analyser = analyserRef.current;
      const targets: number[] = new Array(bars).fill(0);

      if (active && analyser) {
        const binCount = analyser.frequencyBinCount;
        if (!dataRef.current || dataRef.current.length !== binCount) {
          dataRef.current = new Uint8Array(new ArrayBuffer(binCount));
        }
        try {
          analyser.getByteFrequencyData(dataRef.current);
        } catch {
          /* AudioContext closed mid-frame — fall through to flat */
        }
        const data = dataRef.current;
        // Voice energy lives in the lower ~70% of the spectrum; ignore the
        // high bins (mostly hiss) so the bars track speech, not noise.
        const usable = Math.max(bars, Math.floor(binCount * 0.7));
        const step = usable / bars;
        for (let b = 0; b < bars; b++) {
          let sum = 0;
          let n = 0;
          for (let i = Math.floor(b * step); i < Math.floor((b + 1) * step) && i < usable; i++) {
            sum += data[i];
            n++;
          }
          targets[b] = n ? sum / n / 255 : 0;
        }
      }

      const smooth = smoothRef.current;
      const barW = width / bars;
      const gap = Math.max(1, barW * 0.4);
      const w = Math.max(1, barW - gap);
      ctx.fillStyle = color;
      for (let b = 0; b < bars; b++) {
        // Ease toward target (attack fast, release slower) for a lively feel.
        const t = targets[b];
        smooth[b] += (t - smooth[b]) * (t > smooth[b] ? 0.5 : 0.18);
        const amp = smooth[b];
        const h = Math.max(2, amp * height * 1.15);
        const x = b * barW + gap / 2;
        const y = (height - h) / 2;
        const r = Math.min(w / 2, 2);
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, w, h, r);
        } else {
          ctx.rect(x, y, w, h);
        }
        ctx.fill();
      }
    };

    draw();
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, analyserRef, bars, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={className}
      aria-hidden="true"
    />
  );
}

export const MicWaveform = memo(MicWaveformBase);
export default MicWaveform;
