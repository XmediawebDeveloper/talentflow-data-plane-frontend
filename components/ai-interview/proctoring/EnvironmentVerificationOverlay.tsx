'use client';

import { useEffect, useState } from 'react';
import { QrCode, Smartphone } from 'lucide-react';

interface EnvironmentVerificationOverlayProps {
  active: boolean;
  qrCodeDataUri: string | null;
  verificationUrl: string | null;
  expiresAt: string | null;
  challengeColor: string | null;
  challengeId: string | null;
  /** True once the candidate's phone has actually opened the verify link. */
  challengeRevealed: boolean;
  /** 5 sequential colors, one per second, for the 1s-RGB anti-replay check. */
  challengeColors: string[] | null;
  /** Set once the phone confirms MediaRecorder is actually recording — the
   *  authoritative t=0 the 1-color-per-second cycle is keyed against. */
  recordingStartedAt: string | null;
  onExpired: () => void;
}

/**
 * Full-screen blocking overlay shown on the LAPTOP while the candidate
 * completes the mobile environment-verification check. Mounted as a sibling
 * of InterviewProctoringWarnings in InterviewUI.tsx, gated on the
 * `environment_verification_triggered` / `environment_verification_submitted`
 * WS messages.
 *
 * Per the "AI Interview-Proxy Integrity Verification" spec (Step 4), the
 * candidate's phone must film the LAPTOP'S BACKGROUND showing the challenge
 * color + a short ID — not a small swatch on the page, the actual screen
 * background — so the vision check can confirm the clip was captured live
 * against THIS interview's session, not replayed/pre-recorded.
 *
 * Two visual states, switched on `challengeRevealed`:
 *  - Before the phone opens the link: QR code + countdown card on a neutral
 *    dark background (nothing to film yet).
 *  - After the phone opens the link (environment_verification_opened WS
 *    message): the QR/card is replaced entirely by the full-screen challenge
 *    color + large ID — a clean, unobstructed target for the phone's camera,
 *    with nothing else on screen. The 3-minute expiry timer keeps running
 *    in the background (still calls onExpired) even though it's no longer
 *    visually shown once revealed.
 */
export function EnvironmentVerificationOverlay({
  active,
  qrCodeDataUri,
  verificationUrl,
  expiresAt,
  challengeColor,
  challengeId,
  challengeRevealed,
  challengeColors,
  recordingStartedAt,
  onExpired,
}: EnvironmentVerificationOverlayProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  // Index into challengeColors, driven by elapsed time since
  // recordingStartedAt — 1 color per second for the first 5 seconds, then
  // holds on the last color (phone has moved into its pan phase by then).
  const [colorIndex, setColorIndex] = useState(0);

  useEffect(() => {
    if (!active || !expiresAt) return;
    const expiresAtMs = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) onExpired();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [active, expiresAt, onExpired]);

  useEffect(() => {
    if (!recordingStartedAt || !challengeColors || challengeColors.length === 0) {
      setColorIndex(0);
      return;
    }
    const startedAtMs = new Date(recordingStartedAt).getTime();
    const tick = () => {
      const elapsedSec = (Date.now() - startedAtMs) / 1000;
      const idx = Math.min(challengeColors.length - 1, Math.max(0, Math.floor(elapsedSec)));
      setColorIndex(idx);
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [recordingStartedAt, challengeColors]);

  if (!active) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const hasChallenge = Boolean(challengeColor && challengeId && challengeRevealed);
  // Before recording actually starts, hold on color #1 (static) so there's
  // still something correct on screen; once recordingStartedAt arrives,
  // cycle through the full sequence via colorIndex.
  const displayColor = challengeColors && challengeColors.length > 0
    ? challengeColors[colorIndex]
    : challengeColor;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center transition-colors duration-300"
      style={{ backgroundColor: displayColor || 'rgba(0,0,0,0.9)' }}
    >
      {hasChallenge ? (
        // Once the phone has opened the link, the QR/card's job is done —
        // show ONLY the full-screen color + ID so the phone's camera has a
        // clean, unobstructed target to film, per the candidate's request.
        <span className="text-white text-6xl sm:text-7xl font-bold tracking-[0.3em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
          {challengeId}
        </span>
      ) : (
        <div className="relative w-full max-w-[95vw] sm:max-w-md mx-4 bg-[#0F1929] border border-brand-blue/40 rounded-2xl shadow-2xl shadow-black/40 p-7 flex flex-col items-center gap-5">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-brand-blue/20 border border-brand-blue/40">
            <Smartphone className="w-7 h-7 text-brand-blue" />
          </div>
          <div className="text-center">
            <h3 className="text-white font-semibold text-lg mb-1.5">Environment Verification</h3>
            <p className="text-[#cbd5e1] text-sm leading-relaxed">
              Scan this QR code with your phone to verify your interview environment.
              Your interview is paused and will resume automatically once you&apos;re done.
            </p>
          </div>

          {qrCodeDataUri ? (
            <div className="bg-white rounded-xl p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCodeDataUri} alt="Scan with your phone to verify your environment" className="w-48 h-48" />
            </div>
          ) : (
            <div className="w-48 h-48 flex items-center justify-center bg-white/5 rounded-xl border border-white/10">
              <QrCode className="w-10 h-10 text-white/30" />
            </div>
          )}

          {verificationUrl && (
            <p className="text-[11px] text-[#94a3b8] break-all text-center max-w-full">{verificationUrl}</p>
          )}

          <div className="w-full text-center text-sm font-mono text-brand-blue border border-brand-blue/20 rounded-lg bg-brand-blue/5 px-3 py-2">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')} remaining
          </div>
        </div>
      )}
    </div>
  );
}
