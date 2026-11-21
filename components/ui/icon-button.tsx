'use client';

import {
  useCallback, useId, useRef,
  type ComponentProps, type FocusEvent, type MouseEvent, type ReactNode, type Ref,
} from 'react';
import { Button } from './button';
import { TooltipBubble, useTooltipTrigger, type TooltipPosition } from './tooltip';

/**
 * An icon-only button with a name and a tooltip (accessibility §14:
 * "descriptive tooltips on all icons").
 *
 *   <IconButton label="Delete job" variant="ghost" size="sm"><Trash2 /></IconButton>
 *   <IconButton bare label="Refresh logs" className="p-2 rounded-lg …"><RefreshCw /></IconButton>
 *
 * - `label` is the button's accessible name (aria-label) AND its tooltip — say
 *   what the button does ("Refresh logs"), not what the icon is ("Refresh icon").
 * - `tooltip` overrides the bubble text — e.g. the reason a permission-locked
 *   button can't be used; it is also announced as the button's description.
 * - The tooltip shows on hover and on keyboard focus (not after a mouse click),
 *   and hides on leave, blur, press and Escape. It is the same bubble as
 *   <Tooltip>, but adds no wrapper element, so the button's layout is untouched.
 * - Without `bare` it is the shared <Button> (same variants and sizes); with
 *   `bare` it is a plain <button> with exactly the classes you pass.
 * - A natively `disabled` button gets no mouse events, so it also keeps a
 *   native `title` with the tooltip text — the reason still shows on hover.
 */

type Common = {
  label: string;
  tooltip?: ReactNode;
  tooltipPosition?: TooltipPosition;
  ref?: Ref<HTMLButtonElement>;
};
type BareProps = Common & { bare: true } & Omit<ComponentProps<'button'>, 'aria-label' | 'title' | 'ref'>;
type ButtonProps = Common & { bare?: false } & Omit<ComponentProps<typeof Button>, 'aria-label' | 'title' | 'ref'>;
export type IconButtonProps = BareProps | ButtonProps;

export function IconButton(props: IconButtonProps) {
  const {
    label, tooltip, tooltipPosition = 'top', bare, ref,
    onMouseEnter, onMouseLeave, onMouseDown, onFocus, onBlur,
    ...rest
  } = props as Common & { bare?: boolean } & ComponentProps<'button'>;

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const setRef = useCallback((el: HTMLButtonElement | null) => {
    anchorRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLButtonElement | null }).current = el;
  }, [ref]);

  const { isVisible, handlers } = useTooltipTrigger();
  const tipId = useId();
  const tip = tooltip ?? label;
  const describes = isVisible && tooltip != null && tooltip !== label;

  const shared = {
    ...rest,
    ref: setRef,
    'aria-label': label,
    'aria-describedby': describes ? tipId : rest['aria-describedby'],
    title: rest.disabled && typeof tip === 'string' ? tip : undefined,
    onMouseEnter: (e: MouseEvent<HTMLButtonElement>) => { onMouseEnter?.(e); handlers.onMouseEnter(); },
    onMouseLeave: (e: MouseEvent<HTMLButtonElement>) => { onMouseLeave?.(e); handlers.onMouseLeave(); },
    onMouseDown: (e: MouseEvent<HTMLButtonElement>) => { onMouseDown?.(e); handlers.onMouseDown(); },
    onFocus: (e: FocusEvent<HTMLButtonElement>) => { onFocus?.(e); handlers.onFocus(e); },
    onBlur: (e: FocusEvent<HTMLButtonElement>) => { onBlur?.(e); handlers.onBlur(); },
  };

  return (
    <>
      {bare
        ? <button {...shared} />
        : <Button {...(shared as ComponentProps<typeof Button>)} />}
      {isVisible && tip ? <TooltipBubble anchorRef={anchorRef} content={tip} position={tooltipPosition} id={tipId} /> : null}
    </>
  );
}
