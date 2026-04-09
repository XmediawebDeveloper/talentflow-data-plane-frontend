# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: timer-speaking.spec.ts >> Timer & Speaking State >> T2: Global timer ticks NON-STOP in fixed/timed mode (even during Linda speaking)
- Location: e2e/timer-speaking.spec.ts:165:7

# Error details

```
Error: expect(received).not.toBeNull()

Received: null
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - img [ref=e5]
    - paragraph [ref=e7]: Loading interview...
  - region "Notifications alt+T"
```

# Test source

```ts
  104 | 
  105 | /** Send the `connected` message and complete the greeting sequence. */
  106 | async function doGreeting(
  107 |   send: (d: Record<string, unknown>) => Promise<void>,
  108 |   sendBin: (b: number) => Promise<void>,
  109 |   remainingSeconds = 1800,
  110 | ) {
  111 |   await send({
  112 |     type: "connected",
  113 |     session_id: "sess-test",
  114 |     total_questions: 15,
  115 |     duration_minutes: 30,
  116 |     remaining_seconds: remainingSeconds,
  117 |     audio_config: { sample_rate: 24000, channels: 1 },
  118 |     vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
  119 |   });
  120 |   await send({ type: "greeting", text: "Hello! I'm Linda, your AI interviewer." });
  121 |   await send({ type: "speaking_started" });
  122 |   for (let i = 0; i < 3; i++) await sendBin(4800);
  123 |   await send({ type: "audio_end" });
  124 |   await send({ type: "speaking_ended" });
  125 | }
  126 | 
  127 | // ─── Tests ──────────────────────────────────────────────────────────────────────
  128 | 
  129 | test.describe("Timer & Speaking State", () => {
  130 | 
  131 |   test("T1: Global timer syncs from connected.remaining_seconds", async ({ page }) => {
  132 |     await mockCandidateApi(page);
  133 |     const { send, sendBin } = await setupWsMock(page);
  134 |     await page.goto(INTERVIEW_URL);
  135 |     await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
  136 | 
  137 |     // Send connected with 15 minutes remaining (resumed session)
  138 |     await send({
  139 |       type: "connected",
  140 |       session_id: "sess-test",
  141 |       total_questions: 15,
  142 |       duration_minutes: 30,
  143 |       remaining_seconds: 900,   // 15:00 remaining
  144 |       audio_config: { sample_rate: 24000, channels: 1 },
  145 |       vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
  146 |     });
  147 | 
  148 |     // Wait for React to process the event
  149 |     await page.waitForTimeout(500);
  150 | 
  151 |     // Global timer should show ~15:00 (not 30:00 or 00:00). Allow up to 5s drift for slow machines.
  152 |     const timerText = await page.evaluate(() => {
  153 |       const spans = Array.from(document.querySelectorAll("span, div"));
  154 |       return spans.map(el => el.textContent?.trim()).filter(t => /^\d{2}:\d{2}$/.test(t || ""));
  155 |     });
  156 |     console.log("[T1] Timer values found:", timerText);
  157 |     const inRange = timerText.some(t => {
  158 |       const [m, s] = t!.split(":").map(Number);
  159 |       const total = m * 60 + s;
  160 |       return total >= 895 && total <= 900; // 14:55–15:00
  161 |     });
  162 |     expect(inRange).toBe(true);
  163 |   });
  164 | 
  165 |   test("T2: Global timer ticks NON-STOP in fixed/timed mode (even during Linda speaking)", async ({ page }) => {
  166 |     await mockCandidateApi(page);
  167 |     const { send, sendBin } = await setupWsMock(page);
  168 |     await page.goto(INTERVIEW_URL);
  169 |     await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
  170 | 
  171 |     // Connect with full 30 min
  172 |     await send({
  173 |       type: "connected",
  174 |       session_id: "sess-test",
  175 |       total_questions: 15,
  176 |       duration_minutes: 30,
  177 |       remaining_seconds: 1800,
  178 |       audio_config: { sample_rate: 24000, channels: 1 },
  179 |       vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
  180 |     });
  181 |     await page.waitForTimeout(300);
  182 | 
  183 |     // Read initial timer value
  184 |     const getGlobalTimerSeconds = () => page.evaluate(() => {
  185 |       const spans = Array.from(document.querySelectorAll("span"));
  186 |       const timerSpans = spans.filter(el => /^\d{2}:\d{2}$/.test(el.textContent?.trim() || ""));
  187 |       if (timerSpans.length === 0) return null;
  188 |       const t = timerSpans[0].textContent!.trim();
  189 |       const [m, s] = t.split(":").map(Number);
  190 |       return m * 60 + s;
  191 |     });
  192 | 
  193 |     const before = await getGlobalTimerSeconds();
  194 |     console.log("[T2] Timer before:", before);
  195 | 
  196 |     // Linda is "speaking" — timer should still tick
  197 |     await send({ type: "speaking_started" });
  198 |     await page.waitForTimeout(3000);  // wait 3s while speaking
  199 | 
  200 |     const after = await getGlobalTimerSeconds();
  201 |     console.log("[T2] Timer after 3s of AI speaking:", after);
  202 | 
  203 |     // Timer must have ticked (should be at least 2s less)
> 204 |     expect(before).not.toBeNull();
      |                        ^ Error: expect(received).not.toBeNull()
  205 |     expect(after).not.toBeNull();
  206 |     expect(before! - after!).toBeGreaterThanOrEqual(2);
  207 |   });
  208 | 
  209 |   test("T3: speaking_ended unsticks isAiSpeaking → mic reopens, timer resumes", async ({ page }) => {
  210 |     await mockCandidateApi(page);
  211 |     const { send, sendBin } = await setupWsMock(page);
  212 |     await page.goto(INTERVIEW_URL);
  213 |     await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
  214 | 
  215 |     await doGreeting(send, sendBin);
  216 |     await page.waitForTimeout(1000);
  217 | 
  218 |     // Simulate stuck speaking: send speaking_started but never audio_end
  219 |     await send({ type: "speaking_started" });
  220 |     await sendBin(4800);
  221 |     // No audio_end — TalkingHead's onAudioEnd would never fire
  222 | 
  223 |     // Backend recovery: sends speaking_ended after detecting stuck state
  224 |     await page.waitForTimeout(500);
  225 |     await send({ type: "speaking_ended" });
  226 | 
  227 |     // "Speaking..." label should disappear
  228 |     await page.waitForTimeout(500);
  229 |     const bodyText = await page.locator("body").textContent();
  230 |     const stillSpeaking = bodyText?.toLowerCase().includes("speaking...");
  231 |     console.log("[T3] Still showing 'Speaking...':", stillSpeaking);
  232 |     expect(stillSpeaking).toBe(false);
  233 |   });
  234 | 
  235 |   test("T4: Per-question timer appears and counts down after speaking_ended", async ({ page }) => {
  236 |     await mockCandidateApi(page);
  237 |     const { send, sendBin } = await setupWsMock(page);
  238 |     await page.goto(INTERVIEW_URL);
  239 |     await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
  240 | 
  241 |     await doGreeting(send, sendBin);
  242 |     await page.waitForTimeout(1000);
  243 | 
  244 |     // Send question_timer_started WHILE Linda is speaking
  245 |     await send({ type: "speaking_started" });
  246 |     await send({
  247 |       type: "question_timer_started",
  248 |       seconds: 120,
  249 |       total_seconds: 120,
  250 |       linda_spoke_seconds: 10,
  251 |       is_follow_up: false,
  252 |       question_number: 1,
  253 |       total_questions: 15,
  254 |     });
  255 | 
  256 |     // Linda finishes → timer should start
  257 |     await sendBin(4800);
  258 |     await send({ type: "audio_end" });
  259 |     await send({ type: "speaking_ended" });
  260 | 
  261 |     // Wait for timer to appear
  262 |     await page.waitForTimeout(1500);
  263 | 
  264 |     // Find the per-question timer banner (shows "02:00" or "01:59" etc. — zero-padded by formatTime)
  265 |     const timerText = await page.evaluate(() => {
  266 |       const allText = Array.from(document.querySelectorAll("span, div"))
  267 |         .map(el => el.textContent?.trim())
  268 |         .filter(t => {
  269 |           if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
  270 |           const [m, s] = t!.split(":").map(Number);
  271 |           const total = m * 60 + s;
  272 |           return total > 0 && total <= 120; // question timer range
  273 |         });
  274 |       return allText;
  275 |     });
  276 |     console.log("[T4] Question timer values:", timerText);
  277 |     expect(timerText.length).toBeGreaterThan(0);
  278 | 
  279 |     // Wait 3 more seconds and confirm it counted down
  280 |     await page.waitForTimeout(3000);
  281 |     const timerText2 = await page.evaluate(() => {
  282 |       return Array.from(document.querySelectorAll("span, div"))
  283 |         .map(el => el.textContent?.trim())
  284 |         .filter(t => {
  285 |           if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
  286 |           const [m, s] = t!.split(":").map(Number);
  287 |           const total = m * 60 + s;
  288 |           return total > 0 && total <= 120;
  289 |         });
  290 |     });
  291 |     console.log("[T4] Question timer after 3s:", timerText2);
  292 | 
  293 |     // Should have moved (different value)
  294 |     const firstVal = timerText[0]!.split(":").reduce((m, s, i) => i === 0 ? +s * 60 : m + +s, 0);
  295 |     const secondVal = timerText2[0]?.split(":").reduce((m, s, i) => i === 0 ? +s * 60 : m + +s, 0) ?? firstVal;
  296 |     expect(firstVal - secondVal).toBeGreaterThanOrEqual(2);
  297 |   });
  298 | 
  299 |   test("T5: Silence banner appears after 5s of no response", async ({ page }) => {
  300 |     await mockCandidateApi(page);
  301 |     const { send, sendBin } = await setupWsMock(page);
  302 |     await page.goto(INTERVIEW_URL);
  303 |     await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
  304 | 
```