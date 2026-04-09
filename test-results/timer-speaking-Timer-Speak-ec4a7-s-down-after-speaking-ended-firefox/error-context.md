# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: timer-speaking.spec.ts >> Timer & Speaking State >> T4: Per-question timer appears and counts down after speaking_ended
- Location: e2e/timer-speaking.spec.ts:235:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
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
  204 |     expect(before).not.toBeNull();
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
> 277 |     expect(timerText.length).toBeGreaterThan(0);
      |                              ^ Error: expect(received).toBeGreaterThan(expected)
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
  305 |     await doGreeting(send, sendBin);
  306 |     await page.waitForTimeout(500);
  307 | 
  308 |     // Backend sends silence_detected (fires 5s after Linda stops)
  309 |     await send({
  310 |       type: "silence_detected",
  311 |       seconds_elapsed: 5,
  312 |     });
  313 | 
  314 |     // Silence banner should appear
  315 |     await expect(page.locator("body")).toContainText(/are you (still )?there|silence/i, { timeout: 5_000 });
  316 |   });
  317 | 
  318 |   test("T6: question_timer_stopped clears per-question timer on end_turn", async ({ page }) => {
  319 |     await mockCandidateApi(page);
  320 |     const { send, sendBin } = await setupWsMock(page);
  321 |     await page.goto(INTERVIEW_URL);
  322 |     await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
  323 | 
  324 |     await doGreeting(send, sendBin);
  325 |     await page.waitForTimeout(500);
  326 | 
  327 |     // Start a question timer
  328 |     await send({
  329 |       type: "question_timer_started",
  330 |       seconds: 120,
  331 |       total_seconds: 120,
  332 |       linda_spoke_seconds: 0,
  333 |       is_follow_up: false,
  334 |       question_number: 1,
  335 |       total_questions: 15,
  336 |     });
  337 |     await page.waitForTimeout(1500);
  338 | 
  339 |     // Simulate candidate answers: backend sends question_timer_stopped
  340 |     await send({
  341 |       type: "question_timer_stopped",
  342 |       timer_state: { current_question: null, question_history: [], global_timer: {} },
  343 |     });
  344 | 
  345 |     await page.waitForTimeout(500);
  346 | 
  347 |     // Per-question timer banner should be gone
  348 |     const questionTimerVisible = await page.evaluate(() => {
  349 |       const allText = Array.from(document.querySelectorAll("span"))
  350 |         .map(el => el.textContent?.trim());
  351 |       return allText.some(t => {
  352 |         if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
  353 |         const [m, s] = t!.split(":").map(Number);
  354 |         const total = m * 60 + s;
  355 |         return total > 0 && total <= 120; // question timer range only
  356 |       });
  357 |     });
  358 |     console.log("[T6] Question timer still visible after stopped:", questionTimerVisible);
  359 |     expect(questionTimerVisible).toBe(false);
  360 |   });
  361 | 
  362 |   test("T7: Follow-up (same question_number) does NOT restart timer", async ({ page }) => {
  363 |     await mockCandidateApi(page);
  364 |     const { send, sendBin } = await setupWsMock(page);
  365 |     await page.goto(INTERVIEW_URL);
  366 |     await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
  367 | 
  368 |     await doGreeting(send, sendBin);
  369 |     await page.waitForTimeout(500);
  370 | 
  371 |     // Q1 starts
  372 |     await send({
  373 |       type: "question_timer_started",
  374 |       seconds: 120, total_seconds: 120, linda_spoke_seconds: 0,
  375 |       is_follow_up: false, question_number: 1, total_questions: 15,
  376 |     });
  377 |     await page.waitForTimeout(3000); // let it tick down 3s
```