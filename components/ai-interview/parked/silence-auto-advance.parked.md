# PARKED — silence auto-advance (pre-AII14 behaviour)

**Status: DISABLED, not deleted.** This file is a `.md` on purpose — it is never
compiled, imported, or typechecked, so it can hold the old implementation
verbatim with zero risk to the build.

## What this was

The behaviour in `InterviewUI.tsx` **before AII14**:

1. Candidate speaks, then pauses.
2. After ~5s of silence a big **10 → 1** countdown appeared over the chat.
3. When the client VAD's silence window elapsed, `stopRecording()` fired and the
   interview **automatically moved on to the next question**.

## Why it was disabled

AII14 ("Silence Detection & Manual Question Progression") explicitly reverses
the auto-advance:

> *"The system shall not automatically move to the next question based only on
> silence detection"* (AC3)

Instead, 15s of continuous silence now shows a **confirmation popup** with a
**Submit** button, and the candidate decides when the turn ends.

## How to restore

Each site below is also left **commented out in place** in `InterviewUI.tsx`,
tagged `AII14-PARKED`, so you can find them without this file. To restore:
delete the new AII14 code at that site and un-comment the original.

Search `InterviewUI.tsx` for: `AII14-PARKED`

---

### Site 1 — state + window constant

Originally around the `midSilenceCountdown` declaration.

```tsx
// ── Mid-speech silence countdown (Change 2) ──────────────────────────────
// Once the candidate has spoken and then pauses, the first ~8s is silent
// (normal listening, no counter). For the LAST 7s of the 15s silence window
// we show a big 7→1 countdown; if they resume speaking it disappears and we
// go back to normal listening; if it reaches 0 the turn ends and we move on.
const [midSilenceCountdown, setMidSilenceCountdown] = useState<number | null>(null);
const midSilenceCountdownRef = useRef<number | null>(null);
const SILENCE_COUNTDOWN_WINDOW_MS = 10000; // show the counter for the final 10s of the 15s window (first ~5s silent, then 10→1)
const setMidSilenceCountdown_ = useCallback((val: number | null) => {
  if (midSilenceCountdownRef.current !== val) {
    midSilenceCountdownRef.current = val;
    setMidSilenceCountdown(val);
  }
}, []);
```

> NOTE: the `midSilenceCountdown` state itself is **still live** in the file —
> it is referenced by the shared countdown overlay and `bannerVisible`. It is
> simply never set to a non-null value any more, so the mid-silence branch of
> the overlay never renders. That keeps the diff small and the build green.

---

### Site 2 — the countdown driver effect

```tsx
// ── Mid-speech silence countdown driver (Change 2) ─────────────────────────
// While the candidate's turn is open, poll the VAD's silenceStartRef every
// 200ms. Show a big 7→1 countdown ONLY for the final 7s of the (15s) silence
// window; show nothing for the first ~8s of a pause. The instant the candidate
// resumes speaking, the VAD resets silenceStartRef → we clear the countdown and
// it's back to normal listening. The actual end-turn is still driven by the VAD
// itself (this is display-only). Uses Date.now() to match the VAD's clock.
useEffect(() => {
  if (!isRecording) { setMidSilenceCountdown_(null); return; }
  const id = setInterval(() => {
    if (!isRecordingRef.current || isAiSpeakingRef.current || isProcessingRef.current) {
      setMidSilenceCountdown_(null);
      return;
    }
    const start = silenceStartRef.current;
    if (start == null) { setMidSilenceCountdown_(null); return; }
    const eff = silenceDurationMsRef.current * (micSilenceMultiplierRef.current || 1);
    const remaining = eff - (Date.now() - start);
    if (remaining > 0 && remaining <= SILENCE_COUNTDOWN_WINDOW_MS) {
      setMidSilenceCountdown_(Math.max(1, Math.ceil(remaining / 1000)));
    } else {
      setMidSilenceCountdown_(null);
    }
  }, 200);
  return () => { clearInterval(id); setMidSilenceCountdown_(null); };
}, [isRecording, setMidSilenceCountdown_]);
```

---

### Site 3 — the VAD auto end-turn (**the actual auto-advance**)

Inside the analyser loop, in the `else` branch that accumulates silence. This is
the code that ended the candidate's turn without asking.

```tsx
// (4) Stretch the silence window for quiet/laggy devices
// (headphones, Bluetooth) so a real answer isn't cut off
// mid-sentence; built-in mic uses the base value (×1).
const effectiveSilenceMs = silenceDurationMsRef.current * micSilenceMultiplierRef.current;
if (nowMs - silenceSince > effectiveSilenceMs) {
  const speechAgeMs =
    speechDetectedAtRef.current == null ? 0 : nowMs - speechDetectedAtRef.current;
  if ((isFlexibleMode || isNewFlexibleMode) && speechAgeMs < 2000) {
    return;
  }
  // Server-side EOT mode: the SERVER (provider EndOfTurn) decides
  // when the turn ends — the client must not cut on its own silence
  // timer. Normally we just let the silence clock keep running and
  // wait for `server_end_turn`. SAFETY NET: if that signal never
  // arrives and TRUE silence has persisted far beyond when EndOfTurn
  // should have fired, force-end the turn here so the interview can't
  // sit idle until the 130 s hard cap (the "answer finished but stays
  // idle" bug). This threshold is generous so a normal pause is never
  // pre-empted — it only rescues a genuinely stuck turn.
  if (serverEotEnabledRef.current) {
    if (nowMs - silenceSince > SERVER_EOT_SILENCE_FALLBACK_MS) {
      console.warn('[INTERVIEW-DEBUG] server_end_turn missing — silence safety-net force-ending turn', {
        silenceMs: nowMs - silenceSince,
        fallbackMs: SERVER_EOT_SILENCE_FALLBACK_MS,
      });
      stopRecording();
    }
    return;
  }
  console.log('[INTERVIEW-DEBUG] Silence timeout -> stopRecording', {
    avgLevel: Number(avgLevel.toFixed(4)),
    softVoiceFloor: Number(softVoiceFloor.toFixed(4)),
    inTurnActivityThreshold: Number(inTurnActivityThreshold.toFixed(4)),
    strongInTurnActivityThreshold: Number(strongInTurnActivityThreshold.toFixed(4)),
    transcriptLedTurn,
    silenceMs: nowMs - silenceSince,
  });
  stopRecording();
  return;
}
```

---

### Site 4 — the mid-silence branch of the countdown overlay

The overlay itself is **still live** (AC1's pre-turn `3..2..1` uses it). Only
the `isPre === false` branch below is now unreachable, because
`midSilenceCountdown` is never set. Kept verbatim for reference.

```tsx
const isLastQ = questionNumber !== null && totalQuestions !== null && questionNumber >= totalQuestions;
const _sec = `${num} second${num === 1 ? '' : 's'}`;
const title = isPre ? 'Get ready to answer' : 'Are you done with your response?';
const subtitle = isPre
  ? 'Speak when it’s your turn.'
  : isLastQ
    ? `Ending the interview in ${_sec}. If you’re not done with your response, kindly speak up.`
    : `Moving on to the next question in ${_sec}. If you’re not done with your response, kindly speak up.`;

{!isPre && !isLastQ && (
  <button
    type="button"
    onClick={() => handleNextQuestion()}
    className="pointer-events-auto mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-gray-900 text-sm font-semibold shadow-lg ring-1 ring-black/10 hover:bg-gray-100 transition-colors"
  >
    Next question →
  </button>
)}
```

---

---

## Site 5 — BACKEND: `_mid_answer_silence_watcher` (the server-side twin)

`talentflow-data-plane-backend/app/routers/ai_interview_ws.py`

The client was not the only thing auto-advancing. Inside
`_restart_question_timer_on_speech()` — which runs **the moment the candidate
starts speaking** — the server armed its own mid-answer watcher:

- **Phase 1** — 20s (`TIMED_SILENCE_WAIT_1`) with no new audio chunk → Bina
  speaks *"Are you there? Take your time…"*
- **Phase 2** — 10s (`TIMED_SILENCE_WAIT_2`) more silence →
  `handle_skip_question(source="silence_skip")` → **next question**.

The function is left fully intact; only its spawn is commented out:

```python
mid_silence_task = asyncio.create_task(_mid_answer_silence_watcher())
```

Restoring the client alone would NOT bring the old behaviour back — and
restoring the server alone would fight the new popup, because its Phase-1 nudge
makes Bina speak, which closes the candidate's mic while the popup is up.

### Backend paths deliberately LEFT ACTIVE

Do not confuse these with the parked watcher — they handle a candidate who
**never speaks at all**, which AII14 does not cover (its trigger is silence
*after* the candidate's speech):

| Path | What it covers |
|---|---|
| `_auto_skip` (inside `_start_question_timer`) | turn-start silence, timed mode |
| `_flexible_silence_watch` | turn-start silence, flexible mode |
| `_existing_slot_auto_skip` | turn-start silence in a follow-up/clarification window |
| `_timer_from_speech()` | the per-question hard cap |

---

## Safety note if you ever restore this

The per-question hard cap (`question_window_hard_cap` / the backend
`_auto_skip`) is a **separate** mechanism and is still active in both modes. It
is what stops a turn idling forever now that silence no longer ends it — do not
disable that as well.
