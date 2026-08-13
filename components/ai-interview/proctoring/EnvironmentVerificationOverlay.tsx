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
  onExpired: () => void;
}

/**
 * Full-screen blocking overlay shown on the LAPTOP while the candidate
 * completes the mobile environment-verification check. Mounted as a sibling
 * of InterviewProctoringWarnings in InterviewUI.tsx, gated on the
 * `environment_verification_triggered` / `environment_verification_submitted`
 * WS messages.
 *
 * Renders the anti-replay challenge (a solid color panel + short ID string)
 * for the full duration this overlay is visible — per the
 * "AI Interview-Proxy Integrity Verification" spec, the candidate's phone
 * must film this panel during the first ~5s of their recording so the
 * backend vision check can confirm the clip was captured live against THIS
 * interview's session, not replayed/pre-recorded. Shown continuously (not
 * timed to a precise phone-side step) since there's no real-time channel
 * back from the phone to say exactly when its 5s "record the screen" phase
 * starts.
 */
export function EnvironmentVerificationOverlay({
  active,
  qrCodeDataUri,
  verificationUrl,
  expiresAt,
  challengeColor,
  challengeId,
  onExpired,
}: EnvironmentVerificationOverlayProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);

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

  if (!active) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-[95vw] sm:max-w-md mx-4 bg-[#0F1929] border border-brand-blue/40 rounded-2xl shadow-2xl shadow-brand-blue/20 p-7 flex flex-col items-center gap-5">
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

        {challengeColor && challengeId && (
          <div className="w-full space-y-1.5">
            <p className="text-[11px] text-[#94a3b8] text-center">
              Point your phone at this box while recording:
            </p>
            <div
              className="w-full rounded-xl flex items-center justify-center py-6 ring-2 ring-white/20"
              style={{ backgroundColor: challengeColor }}
            >
              <span className="text-white text-2xl font-bold tracking-widest drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                {challengeId}
              </span>
            </div>
          </div>
        )}

        <div className="w-full text-center text-sm font-mono text-brand-blue border border-brand-blue/20 rounded-lg bg-brand-blue/5 px-3 py-2">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')} remaining
        </div>
      </div>
    </div>
  );
}
