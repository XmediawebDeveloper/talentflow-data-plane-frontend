'use client';

/**
 * ScreenRecorderDevices — recorder detection through the media-device list.
 *
 * Why this works, and why it is worth having: a screen recorder that captures
 * SYSTEM AUDIO ("record what you hear") cannot do it on Windows or macOS without
 * a loopback audio device, and streaming/recording suites ship a virtual camera.
 * Both show up in navigator.mediaDevices.enumerateDevices(), with real labels,
 * because the interview already holds camera + microphone permission. The
 * `devicechange` event then fires the INSTANT one is activated — which for a
 * whole class of recorders is the moment the candidate presses record.
 *
 * This is DETECTION, never prevention: we cannot uninstall a driver.
 *
 * The honest distinction this module encodes, and the reason it is not just a
 * string blacklist:
 *
 *   • A matching device present when the interview STARTS means only that the
 *     software is installed. Plenty of people have VB-Cable or BlackHole for
 *     unrelated reasons. Reported once, confidence 'low', informational.
 *   • A matching device that APPEARS mid-session is the recorder switching on.
 *     Reported confidence 'high'.
 *
 * Deliberately NOT matched: PulseAudio "Monitor of ..." sources, which exist on
 * every Linux desktop whether or not anything is recording, so their presence is
 * evidence of nothing.
 */

/** Substrings matched case-insensitively against MediaDeviceInfo.label. */
interface DeviceSignature {
  pattern: RegExp;
  product: string;
}

const RECORDER_DEVICE_SIGNATURES: DeviceSignature[] = [
  // Virtual cameras shipped by recording / streaming suites
  { pattern: /obs[\s-]*(virtual)?[\s-]*cam/i, product: 'OBS Studio virtual camera' },
  { pattern: /streamlabs/i, product: 'Streamlabs' },
  { pattern: /xsplit|vcam/i, product: 'XSplit / VCam' },
  { pattern: /manycam/i, product: 'ManyCam' },
  { pattern: /camtwist/i, product: 'CamTwist' },
  { pattern: /vmix/i, product: 'vMix' },

  // Loopback / "record system audio" devices. Windows.
  { pattern: /stereo mix|what ?u ?hear/i, product: 'Stereo Mix system-audio loopback' },
  { pattern: /vb-?audio|cable (output|input)|voicemeeter/i, product: 'VB-Audio Virtual Cable / Voicemeeter' },
  // macOS.
  { pattern: /blackhole/i, product: 'BlackHole audio loopback' },
  { pattern: /soundflower/i, product: 'Soundflower audio loopback' },
  { pattern: /loopback audio/i, product: 'Rogue Amoeba Loopback' },
  { pattern: /ishowu audio/i, product: 'iShowU Audio Capture (used by ScreenPal, Movavi, Apowersoft …)' },
  { pattern: /existential audio/i, product: 'BlackHole audio loopback' },

  // Audio devices installed by named recorders
  { pattern: /techsmith|camtasia|snagit/i, product: 'TechSmith Camtasia / Snagit' },
  { pattern: /bandicam|bandicut/i, product: 'Bandicam' },
  { pattern: /apowersoft/i, product: 'Apowersoft Screen Recorder' },
  { pattern: /screencast-?o-?matic|screenpal/i, product: 'ScreenPal / Screencast-O-Matic' },
  { pattern: /movavi/i, product: 'Movavi Screen Recorder' },
  { pattern: /icecream/i, product: 'Icecream Screen Recorder' },
  { pattern: /wondershare|democreator/i, product: 'Wondershare DemoCreator' },
  { pattern: /hitpaw/i, product: 'HitPaw Screen Recorder' },
  { pattern: /easeus|recexperts/i, product: 'EaseUS RecExperts' },
  { pattern: /itop/i, product: 'iTop Screen Recorder' },
  { pattern: /flashback|blueberry/i, product: 'FlashBack Recorder' },
  { pattern: /mirillis|action!/i, product: 'Mirillis Action!' },
  { pattern: /screenrec/i, product: 'ScreenRec' },
  { pattern: /debut|nch software/i, product: 'Debut Video Capture' },
  { pattern: /d3dgear/i, product: 'D3DGear' },
  { pattern: /\bloom\b/i, product: 'Loom' },
];

export interface RecorderDeviceMatch {
  product: string;
  label: string;
  kind: MediaDeviceKind;
  deviceId: string;
}

/** Every recorder-associated device currently visible to the browser. */
export async function listRecorderDevices(): Promise<RecorderDeviceMatch[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  let devices: MediaDeviceInfo[];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
  const matches: RecorderDeviceMatch[] = [];
  for (const device of devices) {
    // Labels are empty until a media permission is granted. The interview always
    // holds camera+mic by this point; if it somehow does not, there is simply
    // nothing to match on and this check contributes nothing rather than lying.
    const label = device.label || '';
    if (!label) continue;
    const signature = RECORDER_DEVICE_SIGNATURES.find((s) => s.pattern.test(label));
    if (signature) {
      matches.push({
        product: signature.product,
        label,
        kind: device.kind,
        deviceId: device.deviceId,
      });
    }
  }
  return matches;
}

/** Stable identity for a device across enumerations (deviceId rotates per origin/session). */
export const recorderDeviceKey = (m: RecorderDeviceMatch) => `${m.kind}::${m.label}`;
