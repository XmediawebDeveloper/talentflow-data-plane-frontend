/**
 * E2E tests for slot-based timed-mode semantics (updated spec):
 *
 *  - Global timer PAUSES during Bina's regular speech
 *  - Global timer KEEPS TICKING during "Are you there?" silence nudge
 *  - Per-question timer is HIDDEN while Bina speaks, APPEARS when she stops
 *  - When candidate ends turn, global JUMPS to the next 2-min slot boundary
 *    (full 2 min deducted regardless of actual answer time)
 *  - Q2 global resumes from 28:00 with a fresh 2-min per-question
 *  - Candidate mic is gated during "Are you there?" playback
 *  - Text reveal doesn't outpace audio (ArrayBuffer-detach regression guard)
 */
import { test, expect, Page } from "@playwright/test";

const INTERVIEW_TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const INTERVIEW_URL = `/ai-interview/${INTERVIEW_TOKEN}`;

function mockInterviewInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-001",
    candidate_name: "Test Candidate",
    candidate_email: "test@example.com",
    position: "Senior Python Developer",
    interview_type: "ai",
    duration_minutes: 30,
    total_questions: 15,
    status: "in_progress",
    consent_accepted_at: new Date().toISOString(),
    system_check_passed: true,
    available_languages: ["English"],
    selected_language: "English",
    jd_title: "Senior Python Developer",
    jd_must_have_skills: ["Python"],
    jd_nice_to_have_skills: ["AWS"],
    interview_mode: "fixed",
    identity_verified: true,
    copy_paste_blocking: false,
    introduction_video_url: null,
    ...overrides,
  };
}

async function mockCandidateApi(page: Page, overrides: Record<string, unknown> = {}) {
  const token = INTERVIEW_TOKEN;
  const info = mockInterviewInfo(overrides);
  await page.route(`**/candidate/ai-interview/${token}`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(info) });
    }
    return route.continue();
  });
  for (const suffix of [
    "consent", "system-check", "languages", "language-select",
    "identity-verify", "ai-health", "transcribe-practice", "practice-complete",
    "upload-recording", "proctor-event", "start",
  ]) {
    await page.route(`**/candidate/ai-interview/${token}/${suffix}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ success: true, available_languages: ["English"], selected_language: "English", text: "ok", status: "healthy" }) })
    );
  }
}

async function setupWsMock(page: Page) {
  await page.addInitScript(() => {
    (window as any).__wsMessages = { receivedFromClient: [] as string[] };
    (window as any).__wsInstance = null;
    window.WebSocket = function MockWebSocket() {
      const ws: any = {
        readyState: 0, binaryType: "arraybuffer", bufferedAmount: 0, extensions: "", protocol: "", url: "",
        onopen: null, onclose: null, onmessage: null, onerror: null,
        send(data: string | ArrayBuffer) {
          if (typeof data === "string") {
            (window as any).__wsMessages.receivedFromClient.push(data);
          }
        },
        close(code = 1000, reason = "") {
          ws.readyState = 3;
          ws.onclose?.(new CloseEvent("close", { code, reason }));
        },
        _simulateMessage(data: string | ArrayBuffer) {
          if (ws.readyState !== 1) return;
          ws.onmessage?.(new MessageEvent("message", { data }));
        },
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
        CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
      };
      (window as any).__wsInstance = ws;
      setTimeout(() => { ws.readyState = 1; ws.onopen?.(new Event("open")); }, 50);
      return ws;
    } as any;
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });

  const send = async (data: Record<string, unknown>) => {
    await page.evaluate((d) => (window as any).__wsInstance?._simulateMessage(JSON.stringify(d)), data);
  };
  const sendBin = async (bytes: number) => {
    await page.evaluate((n) => (window as any).__wsInstance?._simulateMessage(new ArrayBuffer(n)), bytes);
  };
  const getClientMessages = () =>
    page.evaluate(() => ((window as any).__wsMessages.receivedFromClient as string[]).slice());
  return { send, sendBin, getClientMessages };
}

async function openInterview(page: Page) {
  await page.goto(INTERVIEW_URL);
  await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
}

async function sendConnected(send: (d: Record<string, unknown>) => Promise<void>, remaining = 1800) {
  await send({
    type: "connected", session_id: "sess-test",
    total_questions: 15, duration_minutes: 30,
    remaining_seconds: remaining,
    audio_config: { sample_rate: 24000, channels: 1 },
    vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
  });
}

/** Read the biggest MM:SS on the page — that's the global timer. */
async function readGlobalTimerSeconds(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const values = Array.from(document.querySelectorAll("span, div"))
      .map(el => el.textContent?.trim() ?? "")
      .filter(t => /^\d{1,2}:\d{2}$/.test(t))
      .map(t => {
        const [m, s] = t.split(":").map(Number);
        return m * 60 + s;
      });
    if (values.length === 0) return null;
    // Global timer is the LARGEST MM:SS (it counts down from 30:00)
    return Math.max(...values);
  });
}

/** Bina's text bubble content (empty string if not shown). */
async function readLindaBubbleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    // Find Bina's live violet bubble (currentAiText)
    const violet = Array.from(document.querySelectorAll("[class*='violet'] p"))
      .map(el => el.textContent?.trim() ?? "")
      .find(t => t.length > 0);
    return violet ?? "";
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Slot-based timed-mode semantics", () => {

  test("S1: Global timer PAUSES during Bina's regular speech", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await openInterview(page);

    await sendConnected(send, 1800);
    await page.waitForTimeout(300);

    const before = await readGlobalTimerSeconds(page);
    expect(before).not.toBeNull();
    expect(before!).toBeGreaterThanOrEqual(1795);  // ≈30:00

    // Bina starts speaking → global should PAUSE (new slot-based behaviour)
    await send({ type: "speaking_started" });
    await page.waitForTimeout(3000);

    const after = await readGlobalTimerSeconds(page);
    // Allow 1s drift for the paused-detection gate; must not drop by more than 1s during 3s of Bina talking
    expect(Math.abs(before! - after!)).toBeLessThanOrEqual(1);
  });

  test("S2: Per-question timer is HIDDEN while Bina speaks, APPEARS when she stops", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await openInterview(page);

    await sendConnected(send, 1800);
    await send({ type: "speaking_started" });
    await send({ type: "question_timer_started", seconds: 120, total_seconds: 120,
      question_number: 1, total_questions: 15, linda_spoke_seconds: 2 });
    await page.waitForTimeout(200);

    // While Bina speaks, per-Q timer must NOT be showing 2:00
    const showingWhileSpeaking = await page.evaluate(() =>
      Array.from(document.querySelectorAll("span, div"))
        .map(el => el.textContent?.trim() ?? "")
        .includes("2:00")
    );
    expect(showingWhileSpeaking).toBe(false);

    // Bina finishes — audio flushes and per-Q timer should surface
    for (let i = 0; i < 3; i++) await sendBin(4800);
    await send({ type: "audio_end" });
    await page.waitForTimeout(2500);

    const showingAfterStop = await page.evaluate(() =>
      Array.from(document.querySelectorAll("span, div"))
        .map(el => el.textContent?.trim() ?? "")
        .some(t => /^(1:5\d|2:00)$/.test(t))
    );
    expect(showingAfterStop).toBe(true);
  });

  test("S3: Candidate ending turn deducts full 2-min slot (global jumps to 28:00)", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await openInterview(page);

    await sendConnected(send, 1800);
    await send({ type: "speaking_started" });
    await send({ type: "question_timer_started", seconds: 120, total_seconds: 120,
      question_number: 1, total_questions: 15, linda_spoke_seconds: 2 });
    for (let i = 0; i < 3; i++) await sendBin(4800);
    await send({ type: "audio_end" });
    await page.waitForTimeout(2500);

    // Simulate 10s of candidate answering then ending the turn early
    await page.waitForTimeout(10_000);
    const beforeEnd = await readGlobalTimerSeconds(page);

    // Trigger end_turn — frontend deduct-remainder runs in stopRecording / stopRecordingSilent
    // Easiest simulation: send question_timer_stopped + processing events that happen after end_turn
    await send({ type: "question_timer_stopped", timer_state: {} });
    await send({ type: "listening_ended" });
    await send({ type: "transcript", text: "I answered briefly.", is_final: true });
    await send({ type: "processing", user_text: "I answered briefly." });
    await page.waitForTimeout(500);

    const afterEnd = await readGlobalTimerSeconds(page);
    // Full 2-min slot should have been deducted. Allow ±3s for drift.
    // Before ≈ 30:00 - elapsed ticks (should be ~30:00 since global is paused).
    // After should be ≈ 28:00.
    expect(afterEnd!).toBeGreaterThanOrEqual(1677);  // 27:57
    expect(afterEnd!).toBeLessThanOrEqual(1683);     // 28:03
  });

  test("S4: Per-question timer keeps ticking during 'Are you there?' silence nudge", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await openInterview(page);

    await sendConnected(send, 1800);
    await send({ type: "speaking_started" });
    await send({ type: "question_timer_started", seconds: 120, total_seconds: 120,
      question_number: 1, total_questions: 15, linda_spoke_seconds: 2 });
    for (let i = 0; i < 3; i++) await sendBin(4800);
    await send({ type: "audio_end" });
    await page.waitForTimeout(2500);

    // Per-Q timer now visible
    const perQ = await page.evaluate(() =>
      Array.from(document.querySelectorAll("span, div"))
        .map(el => el.textContent?.trim() ?? "")
        .filter(t => /^\d:\d{2}$/.test(t))
    );
    expect(perQ.length).toBeGreaterThan(0);

    // Silence nudge — Bina asks "Are you there?"
    await send({ type: "interstitial_prompt", text: "Are you there?", kind: "silence_nudge" });
    await send({ type: "speaking_started" });

    const beforeNudge = await readGlobalTimerSeconds(page);
    await page.waitForTimeout(3000);  // wait 3s while Bina plays the nudge
    const afterNudge = await readGlobalTimerSeconds(page);

    // Per spec, timers SHOULD KEEP ticking during the silence nudge
    // So global should have dropped by ~3s
    expect(beforeNudge! - afterNudge!).toBeGreaterThanOrEqual(2);
    expect(beforeNudge! - afterNudge!).toBeLessThanOrEqual(4);
  });

  test("S5: Candidate mic is NOT armed during 'Are you there?' playback", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin, getClientMessages } = await setupWsMock(page);
    await openInterview(page);

    await sendConnected(send, 1800);
    await send({ type: "speaking_started" });
    await send({ type: "question_timer_started", seconds: 120, total_seconds: 120,
      question_number: 1, total_questions: 15, linda_spoke_seconds: 2 });
    for (let i = 0; i < 3; i++) await sendBin(4800);
    await send({ type: "audio_end" });
    await page.waitForTimeout(1500);

    // Candidate sits silent — nudge fires
    await send({ type: "interstitial_prompt", text: "Are you there?", kind: "silence_nudge" });
    await send({ type: "speaking_started" });

    const beforeClientMessages = (await getClientMessages()).length;
    await page.waitForTimeout(1500);  // nudge is playing

    // Client should NOT have sent any `speech_started` during the nudge
    const clientMessagesDuringNudge = (await getClientMessages()).slice(beforeClientMessages);
    const speechStartedSent = clientMessagesDuringNudge.some(m => m.includes('"type":"speech_started"'));
    expect(speechStartedSent).toBe(false);
  });

  test("S6: Text reveal doesn't outrun audio — currentTurnAudioMs accumulates correctly (ArrayBuffer detach regression)", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);

    // Capture all [Reveal] lines for inspection
    const revealLogs: string[] = [];
    page.on("console", msg => {
      const text = msg.text();
      if (text.includes("[Reveal]")) revealLogs.push(text);
    });

    await openInterview(page);
    await sendConnected(send, 1800);
    await send({ type: "speaking_started" });

    // Send 20 chunks of 12000 bytes each — simulates a normal 5s TTS response
    for (let i = 0; i < 20; i++) await sendBin(12000);
    await send({ type: "audio_end" });
    await page.waitForTimeout(3000);

    // Inspect [Reveal] logs: the `received=` number should grow past 1000ms
    // If the detach bug is back, it stalls around 250-500ms.
    const revealWithReceived = revealLogs.filter(l => l.match(/received=\d+/));
    const receivedValues = revealWithReceived.map(l => {
      const m = l.match(/received=(\d+)/);
      return m ? Number(m[1]) : 0;
    });
    const maxReceived = Math.max(0, ...receivedValues);
    console.log(`[S6] max received = ${maxReceived}ms (expected >1000, got ${maxReceived})`);

    expect(maxReceived).toBeGreaterThan(1000);

    // Also verify progress never exceeded cap 1.0 by more than rounding error
    const progValues = revealLogs.map(l => {
      const m = l.match(/prog=([\d.]+)/);
      return m ? Number(m[1]) : 0;
    }).filter(v => v > 0);
    const maxProg = Math.max(0, ...progValues);
    console.log(`[S6] max prog = ${maxProg} (should stay ≤ 1.05)`);
    expect(maxProg).toBeLessThanOrEqual(1.05);
  });

  test("S7: Text bubble stays empty until audio begins (no text-before-voice)", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await openInterview(page);

    await sendConnected(send, 1800);

    // Send lots of LLM tokens — text buffer fills but audio hasn't started yet
    const tokens = "Hello welcome to the interview let's discuss your experience".split(" ");
    for (const t of tokens) await send({ type: "llm_token", token: " " + t });
    await send({ type: "greeting", text: "Hello welcome to the interview let's discuss your experience" });

    // At this point firstPcmAt is null — bubble should be empty
    const bubbleBeforeAudio = await readLindaBubbleText(page);
    expect(bubbleBeforeAudio).toBe("");

    // Start audio
    await send({ type: "speaking_started" });
    for (let i = 0; i < 10; i++) await sendBin(12000);

    // Wait for TALKING_HEAD_BUFFER_MS (1500ms) + some progression
    await page.waitForTimeout(2500);

    const bubbleAfterAudio = await readLindaBubbleText(page);
    console.log(`[S7] bubble after audio: "${bubbleAfterAudio}"`);
    expect(bubbleAfterAudio.length).toBeGreaterThan(0);
  });

});
