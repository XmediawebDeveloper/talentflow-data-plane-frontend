import { ReactNode, useState, useRef, useLayoutEffect, useEffect, useCallback, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string | ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

/** Gap between the trigger and the bubble, and the smallest margin the bubble
 *  keeps to any viewport edge. */
const GAP = 8;
const EDGE = 8;

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
type Placement = { top: number; left: number; arrow: number; position: TooltipPosition };

/**
 * The tooltip bubble itself — shared by <Tooltip> and <IconButton> so every
 * tooltip in the app looks and behaves the same.
 *
 * The bubble is portalled to <body> and positioned `fixed` from the trigger's
 * own rect, NOT absolutely inside the trigger's box. An absolute bubble is
 * clipped by any `overflow` ancestor — a scrolling modal body, a card with
 * rounded corners — which cut the Score Table's Overall Rating tooltip off at
 * the modal's left edge. A portalled, viewport-clamped bubble escapes every
 * such ancestor and is nudged back inside the screen instead of overflowing it.
 */
export function TooltipBubble({
  anchorRef,
  content,
  position = 'top',
  id,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  content: ReactNode;
  position?: TooltipPosition;
  id?: string;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Measure the trigger and the bubble, then place the bubble on the requested
  // side, flip it to the opposite side when that side has no room, and clamp it
  // to the viewport. Runs before paint so the bubble never flashes unplaced.
  const reposition = useCallback(() => {
    const trigger = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    const t = trigger.getBoundingClientRect();
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const tCenterX = t.left + t.width / 2;
    const tCenterY = t.top + t.height / 2;

    let pos = position;
    // Flip to the opposite side if the chosen one would push the bubble off the
    // viewport, and there is more room across the gap.
    if (pos === 'bottom' && t.bottom + GAP + bh > vh - EDGE && t.top - GAP - bh > EDGE) pos = 'top';
    else if (pos === 'top' && t.top - GAP - bh < EDGE && t.bottom + GAP + bh < vh - EDGE) pos = 'bottom';
    else if (pos === 'right' && t.right + GAP + bw > vw - EDGE && t.left - GAP - bw > EDGE) pos = 'left';
    else if (pos === 'left' && t.left - GAP - bw < EDGE && t.right + GAP + bw < vw - EDGE) pos = 'right';

    let top: number;
    let left: number;
    if (pos === 'top' || pos === 'bottom') {
      top = pos === 'bottom' ? t.bottom + GAP : t.top - GAP - bh;
      left = tCenterX - bw / 2;
    } else {
      left = pos === 'right' ? t.right + GAP : t.left - GAP - bw;
      top = tCenterY - bh / 2;
    }

    // Clamp onto the screen, then point the arrow back at the trigger's centre
    // relative to the (possibly clamped) bubble.
    const clampedLeft = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - bw - EDGE));
    const clampedTop = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - bh - EDGE));
    const arrow =
      pos === 'top' || pos === 'bottom'
        ? Math.min(Math.max(10, tCenterX - clampedLeft), bw - 10)
        : Math.min(Math.max(10, tCenterY - clampedTop), bh - 10);

    setPlacement({ top: clampedTop, left: clampedLeft, arrow, position: pos });
  }, [anchorRef, position]);

  // First pass measures with the bubble hidden (rendered but invisible), the
  // second paints it in place. Kept in sync with scroll/resize while open.
  useLayoutEffect(() => {
    reposition();
  }, [content, reposition]);

  useEffect(() => {
    const onMove = () => reposition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [reposition]);

  const arrowClasses = {
    top: 'top-full border-l-transparent border-r-transparent border-b-transparent border-t-gray-700',
    bottom: 'bottom-full border-l-transparent border-r-transparent border-t-transparent border-b-gray-700',
    left: 'left-full border-t-transparent border-b-transparent border-r-transparent border-l-gray-700',
    right: 'right-full border-t-transparent border-b-transparent border-l-transparent border-r-gray-700',
  };
  const pos = placement?.position ?? position;
  const arrowStyle =
    pos === 'top' || pos === 'bottom'
      ? { left: placement?.arrow, transform: 'translateX(-50%)' }
      : { top: placement?.arrow, transform: 'translateY(-50%)' };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={bubbleRef}
      id={id}
      // No entrance animation at all: the bubble appears in place. Any
      // animation here read as the tooltip sliding in from the top of the
      // page, because it is first mounted hidden at the viewport's
      // top-left to be measured, then moved beside the trigger.
      className="fixed z-[9999] w-max max-w-xs pointer-events-none"
      role="tooltip"
      style={{
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        visibility: placement ? 'visible' : 'hidden',
        transition: 'none',
        animation: 'none',
      }}
    >
      <div className="relative bg-gray-700 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-normal">
        {content}
        <div className={`absolute w-0 h-0 border-4 ${arrowClasses[pos]}`} style={arrowStyle} />
      </div>
    </div>,
    document.body,
  );
}

/**
 * Show/hide state for a tooltip trigger: on hover (after `delay`) and on
 * KEYBOARD focus (:focus-visible — a mouse click doesn't pop it up), hidden on
 * leave, blur, press and Escape. Accessibility §14: "tooltip shows on hover
 * and on focus".
 */
export function useTooltipTrigger(delay = 200) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };
  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsVisible(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isVisible]);
  const show = () => { clearTimer(); timeoutRef.current = setTimeout(() => setIsVisible(true), delay); };
  const hide = () => { clearTimer(); setIsVisible(false); };
  return {
    isVisible,
    handlers: {
      onMouseEnter: show,
      onMouseLeave: hide,
      onMouseDown: hide,
      onFocus: (e: { target: EventTarget }) => {
        const el = e.target as HTMLElement;
        if (typeof el.matches === 'function' && el.matches(':focus-visible')) { clearTimer(); setIsVisible(true); }
      },
      onBlur: hide,
    },
  };
}

/**
 * Contextual tooltip component for helpful hints. Wraps its trigger in an
 * inline-block; for icon buttons use <IconButton>, which adds no wrapper.
 */
export function Tooltip({ content, children, position = 'top', delay = 200 }: TooltipProps) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const { isVisible, handlers } = useTooltipTrigger(delay);

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={handlers.onMouseEnter}
      onMouseLeave={handlers.onMouseLeave}
      onFocus={handlers.onFocus}
      onBlur={handlers.onBlur}
    >
      {children}
      {isVisible && <TooltipBubble anchorRef={triggerRef} content={content} position={position} />}
    </div>
  );
}

/**
 * Info tooltip with icon
 */
export function InfoTooltip({ content }: { content: string | ReactNode }) {
  return (
    <Tooltip content={content}>
      <div className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors cursor-help">
        <span className="text-xs font-medium">?</span>
      </div>
    </Tooltip>
  );
}
