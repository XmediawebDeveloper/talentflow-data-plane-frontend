/**
 * Global safety net for face-api.js / TF.js WebGL backend crashes.
 *
 * face-api.js 0.22 on tfjs-core 1.x intermittently emits
 *   "Cannot read properties of undefined (reading 'backend')"
 * from an internal microtask (moveData → runWebGLProgram) when:
 *   - the tab is hidden (WebGL context suspended)
 *   - the device wakes from sleep (WebGL context reset)
 *   - a component unmounts mid-inference
 *
 * The rejection is orphaned inside a kernel run scope — it cannot be
 * caught by the awaiting function. Without a handler, Chrome logs
 * "Uncaught (in promise)" and in some browsers breaks subsequent
 * rendering or takes the tab down.
 *
 * This module installs a ONE-TIME `unhandledrejection` listener that
 * swallows ONLY those specific rejections (matched by message or stack
 * signature) and keeps every other rejection working normally.
 *
 * Usage: import this module anywhere face-api.js is loaded. The import
 * itself arms the handler as a side effect.
 */

let installed = false;

export function installTfjsRejectionGuard(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? '');
    const stack = reason instanceof Error ? reason.stack ?? '' : '';

    const looksLikeTfjsBackendCrash =
      msg.includes("reading 'backend'") ||
      msg.includes("reading 'moveData'") ||
      /moveData|runWebGLProgram|runKernelFunc|scopedRun|BackendWrapper/.test(stack);

    if (looksLikeTfjsBackendCrash) {
      event.preventDefault();
      // eslint-disable-next-line no-console
      console.warn('[TFJS-Guard] Swallowed TF.js backend crash:', msg || '(no message)');
    }
  });
}

// Run as a side effect on import so any module that touches face-api.js
// only needs to `import '@/lib/tfjs-rejection-guard';` to be protected.
installTfjsRejectionGuard();
