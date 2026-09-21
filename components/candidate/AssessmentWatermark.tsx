'use client';

import { useEffect, useMemo, useState } from 'react';

interface AssessmentWatermarkProps {
  candidateName: string;
  candidateEmail: string;
  attemptId: string;
}

const BASE_POSITIONS = [
  { top: 10, left: 8, size: 'text-2xs md:text-xs' },
  { top: 18, left: 56, size: 'text-xs md:text-sm' },
  { top: 34, left: 24, size: 'text-2xs md:text-xs' },
  { top: 42, left: 70, size: 'text-xs md:text-sm' },
  { top: 58, left: 10, size: 'text-xs md:text-sm' },
  { top: 64, left: 48, size: 'text-2xs md:text-xs' },
  { top: 78, left: 18, size: 'text-xs md:text-sm' },
  { top: 84, left: 62, size: 'text-2xs md:text-xs' },
] as const;

const POSITION_REFRESH_MS = 10000;
const TIMESTAMP_REFRESH_MS = 5000;

function buildTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function AssessmentWatermark({
  candidateName,
  candidateEmail,
  attemptId,
}: AssessmentWatermarkProps) {
  const [now, setNow] = useState(() => new Date());
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timestampTimer = window.setInterval(() => {
      setNow(new Date());
    }, TIMESTAMP_REFRESH_MS);
    return () => window.clearInterval(timestampTimer);
  }, []);

  useEffect(() => {
    const phaseTimer = window.setInterval(() => {
      setPhase(prev => prev + 1);
    }, POSITION_REFRESH_MS);
    return () => window.clearInterval(phaseTimer);
  }, []);

  const watermarkText = useMemo(() => {
    return `${candidateName} • ${candidateEmail} • ${attemptId} • ${buildTimestamp(now)}`;
  }, [attemptId, candidateEmail, candidateName, now]);

  const positions = useMemo(() => {
    return BASE_POSITIONS.map((position, index) => {
      const topOffset = positiveModulo((phase * 5) + (index * 3), 9) - 4;
      const leftOffset = positiveModulo((phase * 7) + (index * 5), 11) - 5;
      return {
        ...position,
        top: Math.max(6, Math.min(88, position.top + topOffset)),
        left: Math.max(4, Math.min(78, position.left + leftOffset)),
      };
    });
  }, [phase]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none"
    >
      {positions.map((position, index) => (
        <div
          key={`${position.top}-${position.left}-${index}`}
          className={`absolute whitespace-nowrap font-mono font-medium uppercase tracking-[0.22em] text-slate-700 ${position.size}`}
          style={{
            top: `${position.top}%`,
            left: `${position.left}%`,
            opacity: 0.14,
            transform: `rotate(-18deg) translateZ(0)`,
            textShadow: '0 0 1px rgba(255,255,255,0.35)',
          }}
        >
          {watermarkText}
        </div>
      ))}
    </div>
  );
}
