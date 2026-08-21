'use client';

/**
 * useScreenRecordingDefense — one hook that owns screen-recording defence for
 * the WHOLE candidate portal, before the interview starts and after.
 *
 * It is mounted once, at the top of CandidateAIInterviewPortal, and lives for
 * the portal's entire lifetime. That placement is the point: the guard used to
 * live inside the interview proctoring monitor, which only exists once
 * step === 'interview', so a recorder started during system check, consent or
 * the share-bar gate met no resistance at all.
 *
 * Responsibilities:
 *   1. Install the capture guard (the blockable vectors — see ScreenRecordingGuard).
 *   2. Watch for recorder hotkeys (detection only — see ScreenRecorderHotkeys).
 *   3. Watch the media-device list for recorder virtual cameras and system-audio
 *      loopbacks (detection only — see ScreenRecorderDevices).
 *   4. Report every attempt to the recruiter timeline, throttled per source.
 *   5. Raise `suspicionAt` for signals that are real but not conclusive, so the
 *      portal's vision watch can tighten its cadence instead of accusing on a
 *      keystroke alone.
 *
 * The candidate-facing popup is NOT rendered here: ScreenRecordingBlockedModal
 * subscribes to the same bus independently, so it works no matter which step
 * the portal is rendering.
 */

import { useEffect, useRef, useState } from 'react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import {
  installScreenCaptureGuard,
  onScreenRecordingAttempt,
  reportScreenRecordingAttempt,
  type ScreenRecordingAttempt,
} from './ScreenRecordingGuard';
import { detectRecorderPlatform, matchRecorderHotkey } from './ScreenRecorderHotkeys';
import { listRecorderDevices, recorderDeviceKey, type RecorderDeviceMatch } from './ScreenRecorderDevices';

/**
 * Per-source backend throttle. A candidate holding F9 down produces a keydown
 * every ~30ms; without this the recruiter timeline drowns and the page spends
 * the interview POSTing. The popup is NOT throttled — it is idempotent on
 * screen — only the network write is.
 */
const REPORT_THROTTLE_MS = 5000;

/**
 * How long a non-conclusive signal keeps the vision watch escalated. Long enough
 * to cover the model's slower cadence plus a couple of polls, short enough that
 * one stray function key does not leave the interview jumpy for its whole run.
 */
export const RECORDER_SUSPICION_TTL_MS = 90_000;

/** Recheck the device list on this cadence as a backstop for browsers that fire
 *  `devicechange` unreliably (Safari historically did not fire it for virtual
 *  audio devices at all). Cheap: enumerateDevices is a local, synchronous-ish read. */
const DEVICE_POLL_INTERVAL_MS = 15_000;

export interface ScreenRecordingDefenseState {
  /**
   * Timestamp of the most recent signal that is real but not conclusive on its
   * own (a low-confidence hotkey, recorder software found installed). The portal
   * uses this to poll the shared screen faster and to lower the number of
   * consecutive vision positives it needs. null when nothing is pending.
   */
  suspicionAt: number | null;
  /** Human-readable reason for the current suspicion, for logs and the timeline. */
  suspicionReason: string | null;
  /** Every attempt seen this session, newest last. Small by construction. */
  attempts: ScreenRecordingAttempt[];
}

export function useScreenRecordingDefense(token: string): ScreenRecordingDefenseState {
  const [suspicion, setSuspicion] = useState<{ at: number; reason: string } | null>(null);
  const [attempts, setAttempts] = useState<ScreenRecordingAttempt[]>([]);
  const lastReportAtRef = useRef<Record<string, number>>({});
  // Read through a ref so the subscriptions below never need `token` as a
  // dependency — re-subscribing would tear down the capture guard and the
  // device baseline just because the parent re-rendered with the same token.
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // ── 1. The blockable vectors ──────────────────────────────────────────────
  useEffect(() => installScreenCaptureGuard(), []);

  // ── 4 + 5. One subscriber does the reporting and the escalation, so every
  //          producer below (and the guard's own patches) is handled identically.
  useEffect(() => {
    return onScreenRecordingAttempt((attempt) => {
      setAttempts((prev) => [...prev.slice(-19), attempt]);

      if (attempt.confidence === 'low') {
        setSuspicion({ at: attempt.at, reason: attempt.source });
      }

      const throttleKey = `${attempt.vector}:${attempt.source}`;
      const last = lastReportAtRef.current[throttleKey] || 0;
      if (attempt.at - last < REPORT_THROTTLE_MS) return;
      lastReportAtRef.current[throttleKey] = attempt.at;

      candidateAIInterviewService.reportProctorEvent(tokenRef.current, {
        event_type: 'screen_recording_attempt',
        // A refused capture is a deliberate, unambiguous act. An observed but
        // unblockable signal is graded by how much it actually proves.
        severity: attempt.enforcement === 'blocked' || attempt.confidence === 'high'
          ? 'severe'
          : 'low',
        details: {
          vector: attempt.vector,
          source: attempt.source,
          enforcement: attempt.enforcement,
          confidence: attempt.confidence,
          ...(attempt.details || {}),
        },
      }).catch(() => { /* best-effort: a failed report must never break the interview */ });
    });
  }, []);

  // ── 2. Recorder hotkeys ───────────────────────────────────────────────────
  useEffect(() => {
    const platform = detectRecorderPlatform();
    const onKeyDown = (e: KeyboardEvent) => {
      const hotkey = matchRecorderHotkey(e, platform);
      if (!hotkey) return;
      // Best effort only — the OS consumes these before the page in most cases,
      // and acts on them regardless of preventDefault. Called anyway for the
      // builds where the page does get first refusal.
      try { e.preventDefault(); } catch { /* ignore */ }
      reportScreenRecordingAttempt({
        vector: 'os_hotkey',
        source: hotkey.label,
        enforcement: 'detected',
        confidence: hotkey.confidence,
        details: { hotkey_id: hotkey.id, platform },
      });
    };
    window.addEventListener('keydown', onKeyDown, true);
    console.log(`[ScreenRecordingDefense] hotkey watch started (${platform})`);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // ── 3. Recorder virtual cameras / system-audio loopbacks ──────────────────
  useEffect(() => {
    let cancelled = false;
    // Devices already present at mount are BASELINE: they prove the software is
    // installed, not that it is recording. Reported once, as information.
    const baseline = new Set<string>();
    let baselineReady = false;

    const scan = async (trigger: 'baseline' | 'devicechange' | 'poll') => {
      const found = await listRecorderDevices();
      if (cancelled) return;

      if (!baselineReady) {
        found.forEach((device) => baseline.add(recorderDeviceKey(device)));
        baselineReady = true;
        if (found.length > 0) {
          reportScreenRecordingAttempt({
            vector: 'virtual_device',
            source: `Recording software detected on this machine: ${summarise(found)}`,
            enforcement: 'detected',
            confidence: 'low',
            details: { trigger, phase: 'baseline', devices: found.map((d) => d.label) },
          });
        }
        return;
      }

      // Anything NEW since the baseline is the recorder switching on.
      const fresh = found.filter((device) => !baseline.has(recorderDeviceKey(device)));
      if (fresh.length === 0) return;
      fresh.forEach((device) => baseline.add(recorderDeviceKey(device)));
      reportScreenRecordingAttempt({
        vector: 'virtual_device',
        source: `${summarise(fresh)} started during the session`,
        enforcement: 'detected',
        confidence: 'high',
        details: { trigger, phase: 'live', devices: fresh.map((d) => d.label) },
      });
    };

    const onDeviceChange = () => { void scan('devicechange'); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    void scan('baseline');
    const poll = window.setInterval(() => { void scan('poll'); }, DEVICE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, []);

  // Expire the suspicion window without a timer per signal — a single interval
  // that only runs while something is actually pending.
  useEffect(() => {
    if (!suspicion) return;
    const expiresIn = Math.max(0, suspicion.at + RECORDER_SUSPICION_TTL_MS - Date.now());
    const timer = window.setTimeout(() => setSuspicion(null), expiresIn);
    return () => window.clearTimeout(timer);
  }, [suspicion]);

  return {
    suspicionAt: suspicion?.at ?? null,
    suspicionReason: suspicion?.reason ?? null,
    attempts,
  };
}

/** "OBS Studio virtual camera, BlackHole audio loopback" — de-duplicated. */
function summarise(devices: RecorderDeviceMatch[]): string {
  return Array.from(new Set(devices.map((d) => d.product))).join(', ');
}

/**
 * Escape hatch for surfaces outside React that need to raise an attempt (the
 * portal's vision watch does this when the model confirms a recorder on screen).
 */
export { reportScreenRecordingAttempt };
