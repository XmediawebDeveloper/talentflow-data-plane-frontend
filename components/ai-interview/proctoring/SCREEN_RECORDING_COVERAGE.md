# Screen-recording coverage — AI Interview

What the interview can actually do about each way a candidate might record their
screen, and what it cannot. Written to be checked against, not to reassure.

**The headline, stated plainly: this system does not block all screen recording,
and no browser-only application can.** A web page can refuse screen capture only
when the capture is requested *through the page*. Native recorders read the
framebuffer through the operating system and never ask the browser for anything,
so there is no API call to intercept and nothing to deny. Everything below is
organised around that boundary.

---

## The three tiers

| Tier | What happens | Guarantee |
|---|---|---|
| **Blocked** | The capture call is refused. No frame is ever produced. Popup: "Screen recording is not allowed during the interview." | Hard. The recording does not start. |
| **Detected** | The recording starts — we cannot stop it — but it is seen, the interview pauses, and the screen is blanked behind a full-screen notice, so the recording contains none of the interview. A violation is written to the recruiter timeline. | Soft. Detection is high-confidence but not exhaustive; the *content* protection is the real enforcement. |
| **Uncontrollable** | Neither refused nor detected. Documented rather than papered over. | None. |

Where the code lives:

- `ScreenRecordingGuard.ts` — the blocked tier (capture-API patches), and the
  attempt bus every tier reports on.
- `ScreenRecorderHotkeys.ts` — recorder hotkey table (detection).
- `ScreenRecorderDevices.ts` — virtual camera / audio-loopback signatures (detection).
- `useScreenRecordingDefense.ts` — installs all of the above for the whole portal
  lifetime, before and after the interview starts, and reports to the backend.
- `CandidateAIInterviewPortal.tsx` — the vision watch over the shared screen, the
  pause, and the blanking overlay.
- `POST /ai-interview/{token}/detect-screen-recorder` (backend) — the vision model.

---

## Tier 1 — Blocked

Refused synchronously; the caller gets a `NotAllowedError`, the candidate gets the
popup, the recruiter gets a `screen_recording_attempt` with `enforcement: "blocked"`.

| Vector | Covers |
|---|---|
| `navigator.mediaDevices.getDisplayMedia()` | Every in-page browser screen capture, from any script on the interview origin |
| `navigator.getDisplayMedia()` (legacy alias) | Older browser builds |
| `getUserMedia({video:{mandatory:{chromeMediaSource:'desktop'}}})` | The `chrome.desktopCapture` source-id path used by extension recorders |
| `new MediaRecorder(streamWithForeignDisplayTrack)` | Encoding a display stream obtained before the guard was installed, or handed in by an extension |
| `HTMLCanvasElement.captureStream()` / `HTMLMediaElement.captureStream()` | Re-capturing our own avatar/webcam elements into a recordable stream |

Named products in the required list that land here **when used as a browser
recorder**: **Screenity**, **Nimbus Screenshot & Screen Video Recorder**,
**Vmaker** (web), **Loom** (web recorder / MV3 in-page path), **Screencastify**
(in-page path), and any other extension or page that reaches for `getDisplayMedia`.

Not blocked, and deliberately so: the interview's own Entire-Screen share and its
own session recording. `beginLegitimateShare()` / `endLegitimateShare()` bracket
the app's own request (ref-counted, with a 1.5 s trailing grace), and
`registerAppOwnedStream()` whitelists the resulting track for the MediaRecorder
guard. Regression covered by `e2e/screen-recording-guard.spec.ts`.

---

## Tier 2 — Detected, then neutralised

Three independent signals feed the same response. Any one of them is enough.

**A. Recording hotkeys** (`ScreenRecorderHotkeys.ts`) — the keystroke reaches the
page even though the OS acts on it regardless. Immediate.

**B. Virtual devices** (`ScreenRecorderDevices.ts`) — recorders that capture system
audio need a loopback device, and streaming suites ship a virtual camera; both
appear in `enumerateDevices()` with real labels, and `devicechange` fires the
moment one is activated. A device present *at start* means only that the software
is installed (logged, low confidence); a device that appears *mid-session* is the
recorder switching on (high confidence).

**C. Vision watch** — the app already holds a live Entire-Screen capture, so a
vision model diffs the current screen against a reference frame taken seconds
after the interview began. Sees windows, toolbars, tray icons and selection
overlays. Normally 12 s cadence / 3 consecutive positives / 30 s warm-up;
escalates to 4 s / 1 positive / 10 s warm-up while A or B has raised a suspicion.

| Product | Hotkey | Virtual device | Vision | Notes |
|---|:--:|:--:|:--:|---|
| OBS Studio | — | ✅ | ✅ | Virtual camera only if enabled; docked panels are highly recognisable |
| ShareX | ✅ `Ctrl+Shift+PrtScn` | — | ✅ | |
| Bandicam | ⚠️ `F12` | ✅ | ✅ | Green capture frame |
| Camtasia | ⚠️ `F9`/`F10` (Win), ✅ `Shift+Cmd+2` (Mac) | ✅ | ✅ | |
| Snagit | — | ✅ | ✅ | TechSmith audio device |
| ScreenPal / Screencast-O-Matic | — | ✅ | ✅ | |
| ScreenRec | — | ✅ | ✅ | |
| Loom (desktop app) | ✅ `Ctrl/Cmd+Shift+L` | ✅ | ✅ | Loom *web* is Tier 1 |
| FlashBack | ⚠️ `F9` | ✅ | ✅ | |
| Movavi Screen Recorder | ⚠️ `F10` | ✅ | ✅ | |
| Icecream Screen Recorder | ⚠️ `F9`/`F10` | ✅ | ✅ | |
| Debut Video Capture | — | ✅ | ✅ | |
| Fraps | ⚠️ `F9` | — | ✅ | Corner FPS/elapsed overlay |
| Mirillis Action! | ⚠️ `F9` | ✅ | ✅ | |
| D3DGear | — | ✅ | ✅ | |
| Apowersoft Screen Recorder | — | ✅ | ✅ | |
| Wondershare DemoCreator | ⚠️ `F9`/`F10` | ✅ | ✅ | |
| HitPaw Screen Recorder | ⚠️ `F9` | ✅ | ✅ | |
| EaseUS RecExperts | ⚠️ `F9`/`F10` | ✅ | ✅ | |
| iTop Screen Recorder | — | ✅ | ✅ | |
| Vmaker (desktop) | — | — | ✅ | Vmaker *browser* is Tier 1 |
| Tella | — | — | ✅ | |
| Screen Studio | — | — | ✅ | |
| CleanShot X | ✅ `Shift+Cmd+6` | — | ✅ | Also takes over `Shift+Cmd+5` |
| QuickTime Player | ✅ `Ctrl+Cmd+N` | — | ✅ | Menu-bar stop button is a strong vision cue |
| macOS Screenshot toolbar (`Shift+Cmd+5`) | ✅ | — | ✅ | |
| Windows Xbox Game Bar | ✅ `Win+Alt+R`, `Win+G`, `Win+Alt+G` | — | ✅ | Meta key also terminates in production |
| Windows Snipping Tool recording | ✅ `Win+Shift+R` | — | ✅ | |
| Microsoft Clipchamp | — | — | ✅ | Web version: recording happens on *its* origin, so it cannot be blocked — but switching to that tab is itself a terminating violation in production |
| NVIDIA ShadowPlay / NVIDIA App | ✅ `Alt+Z`, `Alt+F9`, `Alt+F10` | — | ✅ | See the Instant Replay caveat below |
| AMD Adrenalin Record & Stream | ✅ `Ctrl+Shift+E`, `Ctrl+Shift+R` | — | ✅ | |
| Intel screen recording (Arc Control) | — | — | ✅ | No dependable shipped default hotkey to key on |
| SimpleScreenRecorder | — | — | ✅ | |
| Kazam | ✅ `Super+Ctrl+R/F` | — | ✅ | |
| Kooha | — | — | ✅ | |
| vokoscreenNG | ⚠️ `F9`/`F10` | — | ✅ | |
| GPU Screen Recorder | — | — | ✅ | Hotkeys are user-assigned |
| Peek | — | — | ✅ | Translucent recording frame |
| Blue Recorder / Green Recorder | — | — | ✅ | |
| recordMyDesktop | — | — | ✅ | |
| GNOME built-in recorder | ✅ `Ctrl+Alt+Shift+R` | — | ✅ | Red pill in the top bar |
| KDE Spectacle recording | ✅ `Meta+Shift+R` | — | ✅ | |
| FFmpeg screen capture | — | — | ⚠️ | Only if a terminal window is visible — see Tier 3 |

✅ covered · ⚠️ partial / low confidence · — not applicable

**⚠️ on hotkeys means a bare function key** (`F9`, `F10`, `F12`). Those are
genuine shipped defaults for a dozen products *and* an innocent keypress, so they
never accuse anyone on their own: they are logged, and they escalate the vision
watch for 90 s. A recorder started with F9 is then confirmed in ~4 s instead of
~36 s; a candidate who simply brushed a function key sees nothing, because the
escalation changes how hard we look, never what counts as seeing.

**Application hotkeys are user-configurable.** The table lists shipped defaults.
A candidate who rebinds theirs defeats signal A — and is still caught by B or C.

### What "detected" actually buys

The interview pauses (backend question timer cancelled, the AI interviewer
silenced, no answer time lost) and a full-screen notice covers the question, the
transcript, the avatar and the webcam tile. Whatever the recorder captures from
that point is the "Screen recording is not allowed" screen. It releases itself
only when the recorder is **closed** — a recorder merely stopped, or minimised to
the tray, still reads as present.

In production the interview additionally terminates on leaving the window at all
(Alt+Tab, the Meta key, Escape, F11, focus loss), so a candidate cannot go and
start or stop a recorder mid-interview without ending the session.

---

## Tier 3 — Cannot be controlled from a browser

Listed so nobody plans around a guarantee that does not exist.

| Case | Why |
|---|---|
| **Headless native capture** — `ffmpeg -f x11grab/gdigrab/avfoundation` started before the interview with its terminal closed, or a service-mode recorder | No window on screen, no keystroke at start, no virtual device. Nothing observable. |
| **NVIDIA Instant Replay already running** | A rolling buffer with no visible overlay. The `Alt+F10` *save* is caught; a save triggered from another device or a rebound key is not. |
| **MV3 extension recorders using `chrome.tabCapture` / offscreen documents** | Capture happens in the extension's own context, never through the page. Not blockable and not observable from the page. Mitigation is enterprise policy (`ExtensionInstallBlocklist` / `ExtensionInstallAllowlist`), not application code. |
| **Another origin's recorder in another tab** (e.g. Clipchamp web) | A page cannot deny `getDisplayMedia` on an origin it does not control. In production, switching tabs terminates the interview instead. |
| **Hardware capture** — HDMI splitter, capture card, a second machine | Entirely outside the OS the browser runs on. |
| **A phone or camera pointed at the screen** | Not screen recording. Covered separately by the object detector (`phone_detected`). |
| **The interview run inside a VM or remote desktop that the host records** | The guest browser cannot see the host. |
| **A candidate who stops sharing their screen** | The vision watch loses its input. This is not a silent gap: stopping the share raises its own severe violation and a blocking re-share overlay. |
| **Mobile / tablet candidates** | iOS and Android record at OS level with no browser-visible signal at all. |

---

## Testing

### Automated — `e2e/screen-recording-guard.spec.ts` (27 cases, passing)

Runs the real modules against stubbed browser globals; no dev server needed:

```bash
E2E_EXTERNAL=1 npx playwright test e2e/screen-recording-guard.spec.ts
```

Covers: every Tier-1 vector refused; the app's own share passing through
untouched; overlapping app-owned shares (the ref-count regression that used to
produce false accusations); ref-counted install/uninstall restoring the native
functions; the desktop-capture constraint shapes; the full hotkey matrix
including the near-misses (`Cmd+G` on macOS must **not** read as Game Bar,
platform gating both ways, `F11` left alone); and the device signatures including
PulseAudio `Monitor of …` sources, which must **not** match.

What it cannot cover: Tier 2 end-to-end. Confirming that OBS on a real desktop is
seen requires OBS on a real desktop and a vision model looking at it.

### Manual — the Tier-2 matrix

For each product on the machine under test, with a real interview running:

1. Start the interview normally and let it settle past the 30 s warm-up.
2. Start the recorder the way a candidate would (hotkey and UI, separately).
3. Record what happened:
   - popup shown? within how long?
   - interview paused and screen blanked?
   - `screen_recording_attempt` on the recruiter timeline, with which `vector`?
   - after closing the recorder: did the interview resume by itself?
4. Then the false-positive pass, which matters just as much: run the same
   interview for 10 minutes with **no** recorder, on the same machine, and
   confirm zero `screen_recording_attempt` events.

Log the result per row of the Tier-2 table above. A row that fails on all three
signals belongs in Tier 3, and this document should be edited to say so.

### Environment coverage still outstanding

The Tier-2 matrix has **not** been executed against real installations of the
listed products — that needs Windows, macOS and Linux machines with the software
installed, which is a QA-lab task rather than a code change. Tier 1 is verified
by the automated suite above. Nothing in this repository should be described as
"all screen recording is blocked".
