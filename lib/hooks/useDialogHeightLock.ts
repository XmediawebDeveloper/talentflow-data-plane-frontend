import { useCallback, useRef, useState } from 'react';

/**
 * Holds a dialog's height steady while it re-reads its own data.
 *
 * The popups this is for size themselves to their content under a viewport cap
 * (`max-h-[92dvh] ... flex flex-col`) rather than to a fixed dvh, which is the
 * right resting behaviour — a three-row list on a large monitor should not
 * stretch a dialog down the whole screen. The cost is that anything which
 * changes the body's height moves the whole box, and because these dialogs are
 * vertically centred, a height change moves BOTH edges at once. That reads as a
 * jump rather than a resize, and clicking Refresh is the worst place for it:
 * the reader asked for the same rows again, not for the dialog to go anywhere.
 *
 * So the height is measured before the request starts and pinned for as long as
 * it runs. The pin is an inline `height` applied under the dialog's existing
 * `max-h` classes, so the viewport clamp still wins on a short screen, and it is
 * released only once the new data is already in state — the dialog therefore
 * resizes at most once, at the end, and only if the data genuinely changed
 * shape.
 *
 * Width is deliberately NOT pinned: these dialogs take their width from a
 * breakpoint ladder that no loading state touches, so pinning it would freeze a
 * value that cannot move anyway and would fight a viewport resize mid-request.
 *
 * Pinning alone is not the whole fix. A dialog that swaps its table for a
 * centred spinner still has nothing to hold up once the pin is released, so the
 * body must ALSO keep its rows mounted while re-reading them — see the callers,
 * which show the loader only when there is genuinely nothing to show yet and
 * otherwise veil the rows in place.
 *
 * Usage:
 *
 *   const heightLock = useDialogHeightLock();
 *   ...
 *   <div {...heightLock.dialogProps} className="... max-h-[92dvh] flex flex-col">
 *   ...
 *   const refresh = () => heightLock.run(async () => {
 *     await Promise.all([loadRows(), loadSummary()]);
 *   });
 */
export function useDialogHeightLock<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);

  /**
   * Runs `work` with the dialog's current height held.
   *
   * Measured synchronously before `work` starts, so the pin is the height the
   * reader is looking at, not one taken after a state change has already moved
   * it. Released in `finally`, so a failed request leaves the dialog free
   * rather than frozen at a stale height.
   */
  const run = useCallback(async <R,>(work: () => Promise<R>): Promise<R> => {
    setLockedHeight(ref.current?.offsetHeight ?? null);
    try {
      return await work();
    } finally {
      setLockedHeight(null);
    }
  }, []);

  return {
    /** Spread onto the dialog panel — the element whose height should hold. */
    dialogProps: {
      ref,
      style: lockedHeight === null ? undefined : { height: lockedHeight },
    },
    run,
  };
}
