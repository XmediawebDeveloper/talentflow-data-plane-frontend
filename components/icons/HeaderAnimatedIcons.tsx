/**
 * The header's Quick actions, Chat, Notifications and Theme icons: outline at rest, filling
 * to solid — each with its own small animation — when their button is hovered,
 * keyboard-focused or open. Styles and keyframes: `.tf-hbtn` / `.tf-hicon-*`
 * in app/globals.css.
 *
 * Shapes are lucide's (lucide-react 0.561, ISC — already the app's icon set),
 * so they match every other icon at rest. Parts that fill carry
 * `tf-hicon-fill`; the button around them needs `tf-hbtn` (and
 * `data-active="true"` while its menu is open, to stay solid).
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Chat bubble: pops, and its three dots turn light and bounce in turn. */
export function ChatAnimatedIcon({ className = '', ...props }: IconProps) {
  return (
    <svg {...base} className={`tf-hicon tf-hicon-chat ${className}`} {...props}>
      <path
        className="tf-hicon-fill"
        d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"
      />
      <circle className="tf-hicon-dot" cx="8" cy="12" r="1.1" stroke="none" />
      <circle className="tf-hicon-dot" cx="12" cy="12" r="1.1" stroke="none" />
      <circle className="tf-hicon-dot" cx="16" cy="12" r="1.1" stroke="none" />
    </svg>
  );
}

/** Bell: swings from its top, like it's ringing. */
export function BellAnimatedIcon({ className = '', ...props }: IconProps) {
  return (
    <svg {...base} className={`tf-hicon tf-hicon-bell ${className}`} {...props}>
      <path
        className="tf-hicon-fill"
        d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
      />
      <path className="tf-hicon-clapper" d="M10.268 21a2 2 0 0 0 3.464 0" />
    </svg>
  );
}

/** Theme, showing the current mode: sun (rays turn), moon (rocks) or monitor (lifts). */
export function ThemeAnimatedIcon({ mode, className = '', ...props }: IconProps & { mode: 'light' | 'dark' | 'system' }) {
  if (mode === 'dark') {
    return (
      <svg {...base} className={`tf-hicon tf-hicon-moon ${className}`} {...props}>
        <path
          className="tf-hicon-fill"
          d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
        />
      </svg>
    );
  }
  if (mode === 'system') {
    return (
      <svg {...base} className={`tf-hicon tf-hicon-monitor ${className}`} {...props}>
        <rect className="tf-hicon-fill" width="20" height="14" x="2" y="3" rx="2" />
        <line x1="8" x2="16" y1="21" y2="21" />
        <line x1="12" x2="12" y1="17" y2="21" />
      </svg>
    );
  }
  return (
    <svg {...base} className={`tf-hicon tf-hicon-sun ${className}`} {...props}>
      <circle className="tf-hicon-fill" cx="12" cy="12" r="4" />
      <g className="tf-hicon-rays">
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </g>
    </svg>
  );
}

/** Quick actions bolt: strikes down and flickers, like a flash. */
export function ZapAnimatedIcon({ className = '', ...props }: IconProps) {
  return (
    <svg {...base} className={`tf-hicon tf-hicon-zap ${className}`} {...props}>
      <path
        className="tf-hicon-fill"
        d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
      />
    </svg>
  );
}
