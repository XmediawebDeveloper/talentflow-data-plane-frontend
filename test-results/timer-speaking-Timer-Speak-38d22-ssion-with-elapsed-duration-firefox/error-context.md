# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: timer-speaking.spec.ts >> Timer & Speaking State >> T8: Global timer shows 00:00 for stale resumed session with elapsed > duration
- Location: e2e/timer-speaking.spec.ts:426:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
  378 | 
  379 |     const timerBefore = await page.evaluate(() => {
  380 |       const t = Array.from(document.querySelectorAll("span"))
  381 |         .map(el => el.textContent?.trim())
  382 |         .find(t => {
  383 |           if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
  384 |           const [m, s] = t!.split(":").map(Number);
  385 |           const total = m * 60 + s;
  386 |           return total > 0 && total <= 120;
  387 |         });
  388 |       if (!t) return null;
  389 |       const [m, s] = t.split(":").map(Number);
  390 |       return m * 60 + s;
  391 |     });
  392 |     console.log("[T7] Timer before follow-up:", timerBefore);
  393 | 
  394 |     // Follow-up from Linda (SAME question number — same slot)
  395 |     await send({
  396 |       type: "question_timer_started",
  397 |       seconds: 120, total_seconds: 120, linda_spoke_seconds: 5,
  398 |       is_follow_up: true, question_number: 1, total_questions: 15,
  399 |     });
  400 |     await page.waitForTimeout(500);
  401 | 
  402 |     const timerAfter = await page.evaluate(() => {
  403 |       const t = Array.from(document.querySelectorAll("span"))
  404 |         .map(el => el.textContent?.trim())
  405 |         .find(t => {
  406 |           if (!/^\d{2}:\d{2}$/.test(t || "")) return false;
  407 |           const [m, s] = t!.split(":").map(Number);
  408 |           const total = m * 60 + s;
  409 |           return total > 0 && total <= 120;
  410 |         });
  411 |       if (!t) return null;
  412 |       const [m, s] = t.split(":").map(Number);
  413 |       return m * 60 + s;
  414 |     });
  415 |     console.log("[T7] Timer after follow-up (should be < before, NOT reset to 120):", timerAfter);
  416 | 
  417 |     // Timer should NOT have jumped back to 120 — it should still be counting down
  418 |     expect(timerAfter).not.toBeNull();
  419 |     expect(timerAfter!).toBeLessThan(120);
  420 |     if (timerBefore !== null) {
  421 |       // Should still be close to timerBefore (maybe 0-2s more)
  422 |       expect(timerAfter!).toBeLessThanOrEqual(timerBefore + 2);
  423 |     }
  424 |   });
  425 | 
  426 |   test("T8: Global timer shows 00:00 for stale resumed session with elapsed > duration", async ({ page }) => {
  427 |     await mockCandidateApi(page);
  428 |     const { send, sendBin } = await setupWsMock(page);
  429 |     await page.goto(INTERVIEW_URL);
  430 |     await page.waitForFunction(() => (window as any).__wsInstance?.readyState === 1, null, { timeout: 45_000 });
  431 | 
  432 |     // Simulate: interview started 60min ago, duration 30min → remaining = 0
  433 |     await send({
  434 |       type: "connected",
  435 |       session_id: "sess-stale",
  436 |       total_questions: 15,
  437 |       duration_minutes: 30,
  438 |       remaining_seconds: 0,
  439 |       audio_config: { sample_rate: 24000, channels: 1 },
  440 |       vad_config: { silence_threshold: 0.02, silence_duration_ms: 800 },
  441 |     });
  442 |     await page.waitForTimeout(500);
  443 | 
  444 |     const timers = await page.evaluate(() =>
  445 |       Array.from(document.querySelectorAll("span"))
  446 |         .map(el => el.textContent?.trim())
  447 |         .filter(t => /^\d{2}:\d{2}$/.test(t || ""))
  448 |     );
  449 |     console.log("[T8] Timer values for stale session:", timers);
  450 |     // Should show 00:00 (correctly reflects expired time)
> 451 |     expect(timers.some(t => t === "00:00")).toBe(true);
      |                                             ^ Error: expect(received).toBe(expected) // Object.is equality
  452 |   });
  453 | });
  454 | 
```