# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: timer-slot-based.spec.ts >> Slot-based timed-mode semantics >> S3: Candidate ending turn deducts full 2-min slot (global jumps to 28:00)
- Location: e2e/timer-slot-based.spec.ts:205:7

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 1683
Received:    1791
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
          - generic [ref=e21]: Processing...
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
              - generic [ref=e39]: Q 1
              - generic [ref=e40]: /
              - generic [ref=e41]: "15"
            - generic [ref=e42]:
              - img [ref=e43]
              - generic [ref=e47]: 29:51
            - generic [ref=e50]: LIVE
            - button "End" [ref=e51]:
              - img [ref=e52]
              - generic [ref=e56]: End
        - generic [ref=e57]:
          - generic [ref=e59]:
            - generic [ref=e61]: You
            - generic [ref=e62]:
              - generic [ref=e64]: Your Response
              - paragraph [ref=e66]: I answered briefly.
              - paragraph [ref=e67]: 04:03 pm
          - generic [ref=e70]: L
        - generic [ref=e78]:
          - generic [ref=e81]: REC
          - button "Next Q" [ref=e82]:
            - img [ref=e83]
            - text: Next Q
    - generic [ref=e87]:
      - img [ref=e88]
      - heading "Fullscreen Required" [level=2] [ref=e93]
      - paragraph [ref=e94]: Please return to fullscreen mode to continue your AI interview.
      - generic [ref=e96]:
        - generic [ref=e97]: Interview Time
        - generic [ref=e98]: 29:51
        - generic [ref=e99]: remaining
      - button "Return to Fullscreen" [ref=e100]
      - paragraph [ref=e101]: This event has been recorded
  - region "Notifications alt+T"
  - alert [ref=e102]
```

# Test source

```ts
  135 | }
  136 | 
  137 | /** Linda's text bubble content (empty string if not shown). */
  138 | async function readLindaBubbleText(page: Page): Promise<string> {
  139 |   return page.evaluate(() => {
  140 |     // Find Linda's live violet bubble (currentAiText)
  141 |     const violet = Array.from(document.querySelectorAll("[class*='violet'] p"))
  142 |       .map(el => el.textContent?.trim() ?? "")
  143 |       .find(t => t.length > 0);
  144 |     return violet ?? "";
  145 |   });
  146 | }
  147 | 
  148 | // ─── Tests ─────────────────────────────────────────────────────────────────────
  149 | 
  150 | test.describe("Slot-based timed-mode semantics", () => {
  151 | 
  152 |   test("S1: Global timer PAUSES during Linda's regular speech", async ({ page }) => {
  153 |     await mockCandidateApi(page);
  154 |     const { send, sendBin } = await setupWsMock(page);
  155 |     await openInterview(page);
  156 | 
  157 |     await sendConnected(send, 1800);
  158 |     await page.waitForTimeout(300);
  159 | 
  160 |     const before = await readGlobalTimerSeconds(page);
  161 |     expect(before).not.toBeNull();
  162 |     expect(before!).toBeGreaterThanOrEqual(1795);  // ≈30:00
  163 | 
  164 |     // Linda starts speaking → global should PAUSE (new slot-based behaviour)
  165 |     await send({ type: "speaking_started" });
  166 |     await page.waitForTimeout(3000);
  167 | 
  168 |     const after = await readGlobalTimerSeconds(page);
  169 |     // Allow 1s drift for the paused-detection gate; must not drop by more than 1s during 3s of Linda talking
  170 |     expect(Math.abs(before! - after!)).toBeLessThanOrEqual(1);
  171 |   });
  172 | 
  173 |   test("S2: Per-question timer is HIDDEN while Linda speaks, APPEARS when she stops", async ({ page }) => {
  174 |     await mockCandidateApi(page);
  175 |     const { send, sendBin } = await setupWsMock(page);
  176 |     await openInterview(page);
  177 | 
  178 |     await sendConnected(send, 1800);
  179 |     await send({ type: "speaking_started" });
  180 |     await send({ type: "question_timer_started", seconds: 120, total_seconds: 120,
  181 |       question_number: 1, total_questions: 15, linda_spoke_seconds: 2 });
  182 |     await page.waitForTimeout(200);
  183 | 
  184 |     // While Linda speaks, per-Q timer must NOT be showing 2:00
  185 |     const showingWhileSpeaking = await page.evaluate(() =>
  186 |       Array.from(document.querySelectorAll("span, div"))
  187 |         .map(el => el.textContent?.trim() ?? "")
  188 |         .includes("2:00")
  189 |     );
  190 |     expect(showingWhileSpeaking).toBe(false);
  191 | 
  192 |     // Linda finishes — audio flushes and per-Q timer should surface
  193 |     for (let i = 0; i < 3; i++) await sendBin(4800);
  194 |     await send({ type: "audio_end" });
  195 |     await page.waitForTimeout(2500);
  196 | 
  197 |     const showingAfterStop = await page.evaluate(() =>
  198 |       Array.from(document.querySelectorAll("span, div"))
  199 |         .map(el => el.textContent?.trim() ?? "")
  200 |         .some(t => /^(1:5\d|2:00)$/.test(t))
  201 |     );
  202 |     expect(showingAfterStop).toBe(true);
  203 |   });
  204 | 
  205 |   test("S3: Candidate ending turn deducts full 2-min slot (global jumps to 28:00)", async ({ page }) => {
  206 |     await mockCandidateApi(page);
  207 |     const { send, sendBin } = await setupWsMock(page);
  208 |     await openInterview(page);
  209 | 
  210 |     await sendConnected(send, 1800);
  211 |     await send({ type: "speaking_started" });
  212 |     await send({ type: "question_timer_started", seconds: 120, total_seconds: 120,
  213 |       question_number: 1, total_questions: 15, linda_spoke_seconds: 2 });
  214 |     for (let i = 0; i < 3; i++) await sendBin(4800);
  215 |     await send({ type: "audio_end" });
  216 |     await page.waitForTimeout(2500);
  217 | 
  218 |     // Simulate 10s of candidate answering then ending the turn early
  219 |     await page.waitForTimeout(10_000);
  220 |     const beforeEnd = await readGlobalTimerSeconds(page);
  221 | 
  222 |     // Trigger end_turn — frontend deduct-remainder runs in stopRecording / stopRecordingSilent
  223 |     // Easiest simulation: send question_timer_stopped + processing events that happen after end_turn
  224 |     await send({ type: "question_timer_stopped", timer_state: {} });
  225 |     await send({ type: "listening_ended" });
  226 |     await send({ type: "transcript", text: "I answered briefly.", is_final: true });
  227 |     await send({ type: "processing", user_text: "I answered briefly." });
  228 |     await page.waitForTimeout(500);
  229 | 
  230 |     const afterEnd = await readGlobalTimerSeconds(page);
  231 |     // Full 2-min slot should have been deducted. Allow ±3s for drift.
  232 |     // Before ≈ 30:00 - elapsed ticks (should be ~30:00 since global is paused).
  233 |     // After should be ≈ 28:00.
  234 |     expect(afterEnd!).toBeGreaterThanOrEqual(1677);  // 27:57
> 235 |     expect(afterEnd!).toBeLessThanOrEqual(1683);     // 28:03
      |                       ^ Error: expect(received).toBeLessThanOrEqual(expected)
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
  329 |     expect(maxReceived).toBeGreaterThan(1000);
  330 | 
  331 |     // Also verify progress never exceeded cap 1.0 by more than rounding error
  332 |     const progValues = revealLogs.map(l => {
  333 |       const m = l.match(/prog=([\d.]+)/);
  334 |       return m ? Number(m[1]) : 0;
  335 |     }).filter(v => v > 0);
```