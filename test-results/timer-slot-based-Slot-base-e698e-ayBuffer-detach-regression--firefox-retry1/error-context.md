# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: timer-slot-based.spec.ts >> Slot-based timed-mode semantics >> S6: Text reveal doesn't outrun audio — currentTurnAudioMs accumulates correctly (ArrayBuffer detach regression)
- Location: e2e/timer-slot-based.spec.ts:299:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 1000
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e8]: Linda · AI Interviewer
          - generic [ref=e14]:
            - generic [ref=e15]: 👤
            - paragraph [ref=e16]: Avatar Not Loaded
            - paragraph [ref=e17]: Model must be from Ready Player Me or Avaturn
          - generic [ref=e21]: Speaking...
        - generic [ref=e22]:
          - generic [ref=e24]: You
          - paragraph [ref=e27]: Camera unavailable
      - generic [ref=e28]:
        - generic [ref=e29]:
          - generic [ref=e30]:
            - img [ref=e32]
            - generic [ref=e34]:
              - heading "Chat with LINDA" [level=2] [ref=e35]
              - paragraph [ref=e36]: Live AI-powered interview
          - generic [ref=e37]:
            - generic [ref=e38]:
              - img [ref=e39]
              - generic [ref=e43]: 30:00
            - generic [ref=e46]: LIVE
            - button "End" [ref=e47]:
              - img [ref=e48]
              - generic [ref=e52]: End
        - paragraph [ref=e55]: Conversation will appear here...
        - generic [ref=e58]:
          - generic [ref=e61]: REC
          - button "Next Q" [ref=e62]:
            - img [ref=e63]
            - text: Next Q
    - generic [ref=e67]:
      - img [ref=e68]
      - heading "Fullscreen Required" [level=2] [ref=e73]
      - paragraph [ref=e74]: Please return to fullscreen mode to continue your AI interview.
      - generic [ref=e76]:
        - generic [ref=e77]: Interview Time
        - generic [ref=e78]: 30:00
        - generic [ref=e79]: remaining
      - button "Return to Fullscreen" [ref=e80]
      - paragraph [ref=e81]: This event has been recorded
  - region "Notifications alt+T"
  - alert [ref=e82]
```

# Test source

```ts
  229 | 
  230 |     const afterEnd = await readGlobalTimerSeconds(page);
  231 |     // Full 2-min slot should have been deducted. Allow ±3s for drift.
  232 |     // Before ≈ 30:00 - elapsed ticks (should be ~30:00 since global is paused).
  233 |     // After should be ≈ 28:00.
  234 |     expect(afterEnd!).toBeGreaterThanOrEqual(1677);  // 27:57
  235 |     expect(afterEnd!).toBeLessThanOrEqual(1683);     // 28:03
  236 |   });
  237 | 
  238 |   test("S4: Per-question timer keeps ticking during 'Are you there?' silence nudge", async ({ page }) => {
  239 |     await mockCandidateApi(page);
  240 |     const { send, sendBin } = await setupWsMock(page);
  241 |     await openInterview(page);
  242 | 
  243 |     await sendConnected(send, 1800);
  244 |     await send({ type: "speaking_started" });
  245 |     await send({ type: "question_timer_started", seconds: 120, total_seconds: 120,
  246 |       question_number: 1, total_questions: 15, linda_spoke_seconds: 2 });
  247 |     for (let i = 0; i < 3; i++) await sendBin(4800);
  248 |     await send({ type: "audio_end" });
  249 |     await page.waitForTimeout(2500);
  250 | 
  251 |     // Per-Q timer now visible
  252 |     const perQ = await page.evaluate(() =>
  253 |       Array.from(document.querySelectorAll("span, div"))
  254 |         .map(el => el.textContent?.trim() ?? "")
  255 |         .filter(t => /^\d:\d{2}$/.test(t))
  256 |     );
  257 |     expect(perQ.length).toBeGreaterThan(0);
  258 | 
  259 |     // Silence nudge — Linda asks "Are you there?"
  260 |     await send({ type: "interstitial_prompt", text: "Are you there?", kind: "silence_nudge" });
  261 |     await send({ type: "speaking_started" });
  262 | 
  263 |     const beforeNudge = await readGlobalTimerSeconds(page);
  264 |     await page.waitForTimeout(3000);  // wait 3s while Linda plays the nudge
  265 |     const afterNudge = await readGlobalTimerSeconds(page);
  266 | 
  267 |     // Per spec, timers SHOULD KEEP ticking during the silence nudge
  268 |     // So global should have dropped by ~3s
  269 |     expect(beforeNudge! - afterNudge!).toBeGreaterThanOrEqual(2);
  270 |     expect(beforeNudge! - afterNudge!).toBeLessThanOrEqual(4);
  271 |   });
  272 | 
  273 |   test("S5: Candidate mic is NOT armed during 'Are you there?' playback", async ({ page }) => {
  274 |     await mockCandidateApi(page);
  275 |     const { send, sendBin, getClientMessages } = await setupWsMock(page);
  276 |     await openInterview(page);
  277 | 
  278 |     await sendConnected(send, 1800);
  279 |     await send({ type: "speaking_started" });
  280 |     await send({ type: "question_timer_started", seconds: 120, total_seconds: 120,
  281 |       question_number: 1, total_questions: 15, linda_spoke_seconds: 2 });
  282 |     for (let i = 0; i < 3; i++) await sendBin(4800);
  283 |     await send({ type: "audio_end" });
  284 |     await page.waitForTimeout(1500);
  285 | 
  286 |     // Candidate sits silent — nudge fires
  287 |     await send({ type: "interstitial_prompt", text: "Are you there?", kind: "silence_nudge" });
  288 |     await send({ type: "speaking_started" });
  289 | 
  290 |     const beforeClientMessages = (await getClientMessages()).length;
  291 |     await page.waitForTimeout(1500);  // nudge is playing
  292 | 
  293 |     // Client should NOT have sent any `speech_started` during the nudge
  294 |     const clientMessagesDuringNudge = (await getClientMessages()).slice(beforeClientMessages);
  295 |     const speechStartedSent = clientMessagesDuringNudge.some(m => m.includes('"type":"speech_started"'));
  296 |     expect(speechStartedSent).toBe(false);
  297 |   });
  298 | 
  299 |   test("S6: Text reveal doesn't outrun audio — currentTurnAudioMs accumulates correctly (ArrayBuffer detach regression)", async ({ page }) => {
  300 |     await mockCandidateApi(page);
  301 |     const { send, sendBin } = await setupWsMock(page);
  302 | 
  303 |     // Capture all [Reveal] lines for inspection
  304 |     const revealLogs: string[] = [];
  305 |     page.on("console", msg => {
  306 |       const text = msg.text();
  307 |       if (text.includes("[Reveal]")) revealLogs.push(text);
  308 |     });
  309 | 
  310 |     await openInterview(page);
  311 |     await sendConnected(send, 1800);
  312 |     await send({ type: "speaking_started" });
  313 | 
  314 |     // Send 20 chunks of 12000 bytes each — simulates a normal 5s TTS response
  315 |     for (let i = 0; i < 20; i++) await sendBin(12000);
  316 |     await send({ type: "audio_end" });
  317 |     await page.waitForTimeout(3000);
  318 | 
  319 |     // Inspect [Reveal] logs: the `received=` number should grow past 1000ms
  320 |     // If the detach bug is back, it stalls around 250-500ms.
  321 |     const revealWithReceived = revealLogs.filter(l => l.match(/received=\d+/));
  322 |     const receivedValues = revealWithReceived.map(l => {
  323 |       const m = l.match(/received=(\d+)/);
  324 |       return m ? Number(m[1]) : 0;
  325 |     });
  326 |     const maxReceived = Math.max(0, ...receivedValues);
  327 |     console.log(`[S6] max received = ${maxReceived}ms (expected >1000, got ${maxReceived})`);
  328 | 
> 329 |     expect(maxReceived).toBeGreaterThan(1000);
      |                         ^ Error: expect(received).toBeGreaterThan(expected)
  330 | 
  331 |     // Also verify progress never exceeded cap 1.0 by more than rounding error
  332 |     const progValues = revealLogs.map(l => {
  333 |       const m = l.match(/prog=([\d.]+)/);
  334 |       return m ? Number(m[1]) : 0;
  335 |     }).filter(v => v > 0);
  336 |     const maxProg = Math.max(0, ...progValues);
  337 |     console.log(`[S6] max prog = ${maxProg} (should stay ≤ 1.05)`);
  338 |     expect(maxProg).toBeLessThanOrEqual(1.05);
  339 |   });
  340 | 
  341 |   test("S7: Text bubble stays empty until audio begins (no text-before-voice)", async ({ page }) => {
  342 |     await mockCandidateApi(page);
  343 |     const { send, sendBin } = await setupWsMock(page);
  344 |     await openInterview(page);
  345 | 
  346 |     await sendConnected(send, 1800);
  347 | 
  348 |     // Send lots of LLM tokens — text buffer fills but audio hasn't started yet
  349 |     const tokens = "Hello welcome to the interview let's discuss your experience".split(" ");
  350 |     for (const t of tokens) await send({ type: "llm_token", token: " " + t });
  351 |     await send({ type: "greeting", text: "Hello welcome to the interview let's discuss your experience" });
  352 | 
  353 |     // At this point firstPcmAt is null — bubble should be empty
  354 |     const bubbleBeforeAudio = await readLindaBubbleText(page);
  355 |     expect(bubbleBeforeAudio).toBe("");
  356 | 
  357 |     // Start audio
  358 |     await send({ type: "speaking_started" });
  359 |     for (let i = 0; i < 10; i++) await sendBin(12000);
  360 | 
  361 |     // Wait for TALKING_HEAD_BUFFER_MS (1500ms) + some progression
  362 |     await page.waitForTimeout(2500);
  363 | 
  364 |     const bubbleAfterAudio = await readLindaBubbleText(page);
  365 |     console.log(`[S7] bubble after audio: "${bubbleAfterAudio}"`);
  366 |     expect(bubbleAfterAudio.length).toBeGreaterThan(0);
  367 |   });
  368 | 
  369 | });
  370 | 
```