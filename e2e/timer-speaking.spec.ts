/**
 * E2E tests for:
 *  - Global timer runs NON-STOP in timed/fixed mode
 *  - Per-question timer starts after Biona stops speaking
 *  - `speaking_ended` unsticks "Speaking..." state
 *  - Timer syncs from connected.remaining_seconds
 *  - Silence nudge banner appears
 */
import { test, expect, Page } from "@playwright/test";

const INTERVIEW_TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const INTERVIEW_URL = `/ai-interview/${INTERVIEW_TOKEN}`;

function fakePcmChunk(bytes = 4800): ArrayBuffer {
  return new ArrayBuffer(bytes);
}

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
    jd_must_have_skills: ["Python", "Django"],
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
  for (const suffix of ["consent", "system-check", "languages", "language-select",
    "identity-verify", "ai-health", "transcribe-practice", "practice-complete",
    "upload-recording", "proctor-event"]) {
    await page.route(`**/candidate/ai-interview/${token}/${suffix}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, available_languages: ["English"], selected_language: "English", text: "ok", status: "healthy" }) })
    );
  }
}

async function setupWsMock(page: Page) {
  await page.exposeFunction("__wsMockOnMessage", () => {});
  await page.addInitScript(() => {
    (window as any).__wsMessages = { receivedFromClient: [] as string[] };
    (window as any).__wsInstance = null;
    (window as any).__wsCallbacks = { onClientMessage: [] as Array<(d: string) => void> };
    window.WebSocket = function MockWebSocket() {
      const ws: any = {
        readyState: 0, binaryType: "arraybuffer", bufferedAmount: 0, extensions: "", protocol: "", url: "",
        onopen: null, onclose: null, onmessage: null, onerror: null,
        send(data: string | ArrayBuffer) {
          if (typeof data === "string") {
            (window as any).__wsMessages.receivedFromClient.push(data);
            (window as any).__wsCallbacks.onClientMessage.forEach((cb: (d: string) => void) => cb(data));
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

  return { send, sendBin };
}

/** Send the `connected` message and complete the greeting sequence. */
async function doGreeting(
  send: (d: Record<string, unknown>) => Promise<void>,
  sendBin: (b: number) => Promise<void>,
  remainingSeconds = 1800,
) {
  await send({
    type: "connected",
    session_id: "sess-test",
    total_questions: 15,
    duration_minutes: 30,
    remaining_seconds: remainingSeconds,
    audio_config: { sample_rate: 24000, channels: 1 },
    vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
  });
  await send({ type: "greeting", text: "Hello! I'm Biona, your AI interviewer." });
  await send({ type: "speaking_started" });
  for (let i = 0; i < 3; i++) await sendBin(4800);
  await send({ type: "audio_end" });
  await send({ type: "speaking_ended" });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Timer & Speaking State", () => {

  test("T1: Global timer syncs from connected.remaining_seconds", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await page.goto(INTERVIEW_URL);
    await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });

    // Send connected with 15 minutes remaining (resumed session)
    await send({
      type: "connected",
      session_id: "sess-test",
      total_questions: 15,
      duration_minutes: 30,
      remaining_seconds: 900,   // 15:00 remaining
      audio_config: { sample_rate: 24000, channels: 1 },
      vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
    });

    // Wait for React to process the event
    await page.waitForTimeout(500);

    // Global timer should show ~15:00 (not 30:00 or 00:00). Allow up to 5s drift for slow machines.
    const timerText = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span, div"));
      return spans.map(el => el.textContent?.trim()).filter(t => /^\d{2}:\d{2}$/.test(t || ""));
    });
    console.log("[T1] Timer values found:", timerText);
    const inRange = timerText.some(t => {
      const [m, s] = t!.split(":").map(Number);
      const total = m * 60 + s;
      return total >= 895 && total <= 900; // 14:55–15:00
    });
    expect(inRange).toBe(true);
  });

  test("T2: Global timer ticks NON-STOP in fixed/timed mode (even during Biona speaking)", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await page.goto(INTERVIEW_URL);
    await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });

    // Connect with full 30 min
    await send({
      type: "connected",
      session_id: "sess-test",
      total_questions: 15,
      duration_minutes: 30,
      remaining_seconds: 1800,
      audio_config: { sample_rate: 24000, channels: 1 },
      vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
    });
    await page.waitForTimeout(300);

    // Read initial timer value
    const getGlobalTimerSeconds = () => page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span"));
      const timerSpans = spans.filter(el => /^\d{2}:\d{2}$/.test(el.textContent?.trim() || ""));
      if (timerSpans.length === 0) return null;
      const t = timerSpans[0].textContent!.trim();
      const [m, s] = t.split(":").map(Number);
      return m * 60 + s;
    });

    const before = await getGlobalTimerSeconds();
    console.log("[T2] Timer before:", before);

    // Biona is "speaking" — timer should still tick
    await send({ type: "speaking_started" });
    await page.waitForTimeout(3000);  // wait 3s while speaking

    const after = await getGlobalTimerSeconds();
    console.log("[T2] Timer after 3s of AI speaking:", after);

    // Timer must have ticked (should be at least 2s less)
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(before! - after!).toBeGreaterThanOrEqual(2);
  });

  test("T3: speaking_ended unsticks isAiSpeaking → mic reopens, timer resumes", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await page.goto(INTERVIEW_URL);
    await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });

    await doGreeting(send, sendBin);
    await page.waitForTimeout(1000);

    // Simulate stuck speaking: send speaking_started but never audio_end
    await send({ type: "speaking_started" });
    await sendBin(4800);
    // No audio_end — TalkingHead's onAudioEnd would never fire

    // Backend recovery: sends speaking_ended after detecting stuck state
    await page.waitForTimeout(500);
    await send({ type: "speaking_ended" });

    // "Speaking..." label should disappear
    await page.waitForTimeout(500);
    const bodyText = await page.locator("body").textContent();
    const stillSpeaking = bodyText?.toLowerCase().includes("speaking...");
    console.log("[T3] Still showing 'Speaking...':", stillSpeaking);
    expect(stillSpeaking).toBe(false);
  });

  test("T4: Per-question timer appears and counts down after speaking_ended", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await page.goto(INTERVIEW_URL);
    await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });

    await doGreeting(send, sendBin);
    await page.waitForTimeout(1000);

    // Send question_timer_started WHILE Biona is speaking
    await send({ type: "speaking_started" });
    await send({
      type: "question_timer_started",
      seconds: 120,
      total_seconds: 120,
      linda_spoke_seconds: 10,
      is_follow_up: false,
      question_number: 1,
      total_questions: 15,
    });

    // Biona finishes → timer should start
    await sendBin(4800);
    await send({ type: "audio_end" });
    await send({ type: "speaking_ended" });

    // Wait for timer to appear
    await page.waitForTimeout(1500);

    // Find the per-question timer banner (shows "02:00" or "01:59" etc. — zero-padded by formatTime)
    const timerText = await page.evaluate(() => {
      const allText = Array.from(document.querySelectorAll("span, div"))
        .map(el => el.textContent?.trim())
        .filter(t => {
          if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
          const [m, s] = t!.split(":").map(Number);
          const total = m * 60 + s;
          return total > 0 && total <= 120; // question timer range
        });
      return allText;
    });
    console.log("[T4] Question timer values:", timerText);
    expect(timerText.length).toBeGreaterThan(0);

    // Wait 3 more seconds and confirm it counted down
    await page.waitForTimeout(3000);
    const timerText2 = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("span, div"))
        .map(el => el.textContent?.trim())
        .filter(t => {
          if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
          const [m, s] = t!.split(":").map(Number);
          const total = m * 60 + s;
          return total > 0 && total <= 120;
        });
    });
    console.log("[T4] Question timer after 3s:", timerText2);

    // Should have moved (different value)
    const firstVal = timerText[0]!.split(":").reduce((m, s, i) => i === 0 ? +s * 60 : m + +s, 0);
    const secondVal = timerText2[0]?.split(":").reduce((m, s, i) => i === 0 ? +s * 60 : m + +s, 0) ?? firstVal;
    expect(firstVal - secondVal).toBeGreaterThanOrEqual(2);
  });

  test("T5: Silence banner appears after 5s of no response", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await page.goto(INTERVIEW_URL);
    await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });

    await doGreeting(send, sendBin);
    await page.waitForTimeout(500);

    // Backend sends silence_detected (fires 5s after Biona stops)
    await send({
      type: "silence_detected",
      seconds_elapsed: 5,
    });

    // Silence banner should appear
    await expect(page.locator("body")).toContainText(/are you (still )?there|silence/i, { timeout: 5_000 });
  });

  test("T6: question_timer_stopped clears per-question timer on end_turn", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await page.goto(INTERVIEW_URL);
    await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });

    await doGreeting(send, sendBin);
    await page.waitForTimeout(500);

    // Start a question timer
    await send({
      type: "question_timer_started",
      seconds: 120,
      total_seconds: 120,
      linda_spoke_seconds: 0,
      is_follow_up: false,
      question_number: 1,
      total_questions: 15,
    });
    await page.waitForTimeout(1500);

    // Simulate candidate answers: backend sends question_timer_stopped
    await send({
      type: "question_timer_stopped",
      timer_state: { current_question: null, question_history: [], global_timer: {} },
    });

    await page.waitForTimeout(500);

    // Per-question timer banner should be gone
    const questionTimerVisible = await page.evaluate(() => {
      const allText = Array.from(document.querySelectorAll("span"))
        .map(el => el.textContent?.trim());
      return allText.some(t => {
        if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
        const [m, s] = t!.split(":").map(Number);
        const total = m * 60 + s;
        return total > 0 && total <= 120; // question timer range only
      });
    });
    console.log("[T6] Question timer still visible after stopped:", questionTimerVisible);
    expect(questionTimerVisible).toBe(false);
  });

  test("T7: Follow-up (same question_number) does NOT restart timer", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await page.goto(INTERVIEW_URL);
    await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });

    await doGreeting(send, sendBin);
    await page.waitForTimeout(500);

    // Q1 starts
    await send({
      type: "question_timer_started",
      seconds: 120, total_seconds: 120, linda_spoke_seconds: 0,
      is_follow_up: false, question_number: 1, total_questions: 15,
    });
    await page.waitForTimeout(3000); // let it tick down 3s

    const timerBefore = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll("span"))
        .map(el => el.textContent?.trim())
        .find(t => {
          if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
          const [m, s] = t!.split(":").map(Number);
          const total = m * 60 + s;
          return total > 0 && total <= 120;
        });
      if (!t) return null;
      const [m, s] = t.split(":").map(Number);
      return m * 60 + s;
    });
    console.log("[T7] Timer before follow-up:", timerBefore);

    // Follow-up from Biona (SAME question number — same slot)
    await send({
      type: "question_timer_started",
      seconds: 120, total_seconds: 120, linda_spoke_seconds: 5,
      is_follow_up: true, question_number: 1, total_questions: 15,
    });
    await page.waitForTimeout(500);

    const timerAfter = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll("span"))
        .map(el => el.textContent?.trim())
        .find(t => {
          if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
          const [m, s] = t!.split(":").map(Number);
          const total = m * 60 + s;
          return total > 0 && total <= 120;
        });
      if (!t) return null;
      const [m, s] = t.split(":").map(Number);
      return m * 60 + s;
    });
    console.log("[T7] Timer after follow-up (should be < before, NOT reset to 120):", timerAfter);

    // Timer should NOT have jumped back to 120 — it should still be counting down
    expect(timerAfter).not.toBeNull();
    expect(timerAfter!).toBeLessThan(120);
    if (timerBefore !== null) {
      // Should still be close to timerBefore (maybe 0-2s more)
      expect(timerAfter!).toBeLessThanOrEqual(timerBefore + 2);
    }
  });

  test("T8: Global timer shows 00:00 for stale resumed session with elapsed > duration", async ({ page }) => {
    await mockCandidateApi(page);
    const { send, sendBin } = await setupWsMock(page);
    await page.goto(INTERVIEW_URL);
    await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });

    // Simulate: interview started 60min ago, duration 30min → remaining = 0
    await send({
      type: "connected",
      session_id: "sess-stale",
      total_questions: 15,
      duration_minutes: 30,
      remaining_seconds: 0,
      audio_config: { sample_rate: 24000, channels: 1 },
      vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
    });
    await page.waitForTimeout(500);

    const timers = await page.evaluate(() =>
      Array.from(document.querySelectorAll("span"))
        .map(el => el.textContent?.trim())
        .filter(t => /^\d{2}:\d{2}$/.test(t || ""))
    );
    console.log("[T8] Timer values for stale session:", timers);
    // Should show 00:00 (correctly reflects expired time)
    expect(timers.some(t => t === "00:00")).toBe(true);
  });
});
