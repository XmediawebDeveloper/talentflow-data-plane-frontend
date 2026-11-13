/**
 * Scroll hand-off for a box that scrolls inside the page (e.g. Version History).
 *
 * Browsers latch a wheel / touch gesture to the box it started in: once the box
 * reaches its top or bottom, the rest of that same gesture does nothing, and
 * the page only moves on the next gesture. With this ref attached, the moment
 * the box is at its edge the remaining scroll goes straight to the page (the
 * nearest scrollable ancestor), in the same gesture.
 *
 * Usage: `<div ref={scrollHandoffRef} className="overflow-y-auto max-h-[240px]">`.
 */

const attached = new WeakMap<HTMLElement, () => void>();

function scrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

/** True when the box can't move any further in the direction of `deltaY`. */
function atEdge(el: HTMLElement, deltaY: number): boolean {
  if (el.scrollHeight <= el.clientHeight) return true;
  if (deltaY < 0) return el.scrollTop <= 0;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}

export function scrollHandoffRef(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined' || attached.has(el)) return;

  const onWheel = (e: WheelEvent) => {
    // A box with nothing to scroll already passes the wheel to the page.
    if (el.scrollHeight <= el.clientHeight) return;
    if (e.ctrlKey || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (!atEdge(el, e.deltaY)) return;
    e.preventDefault();
    const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    scrollParent(el).scrollBy({ top: step });
  };

  let lastY: number | null = null;
  const onTouchStart = (e: TouchEvent) => { lastY = e.touches.length === 1 ? e.touches[0].clientY : null; };
  const onTouchMove = (e: TouchEvent) => {
    if (lastY === null || e.touches.length !== 1 || el.scrollHeight <= el.clientHeight) return;
    const y = e.touches[0].clientY;
    const deltaY = lastY - y; // finger up = scroll down
    lastY = y;
    if (deltaY === 0 || !atEdge(el, deltaY)) return;
    if (e.cancelable) e.preventDefault();
    scrollParent(el).scrollBy({ top: deltaY });
  };
  const onTouchEnd = () => { lastY = null; };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
  attached.set(el, () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
  });
}
