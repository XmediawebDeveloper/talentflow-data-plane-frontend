'use client';

/* Chat test page — the test-only control bar: view as a role, preview a
   device width, simulate events and states. Everything here is simulated. */

import { Keyboard, Laptop, MessageSquarePlus, RotateCcw, Smartphone, Tablet, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Role } from './types';
import { ROLE_LABEL } from './types';
import { ROLE_SUMMARY } from './permissions';
import { SimTag } from './ui';

export type Device = 'desktop' | 'laptop' | 'tablet' | 'mobile' | 'small';
export const DEVICE_WIDTH: Record<Device, string> = {
  desktop: '100%',
  laptop: '1100px',
  tablet: '820px',
  mobile: '414px',
  small: '320px',
};
const DEVICES: { key: Device; label: string; hint: string; Icon: typeof Laptop }[] = [
  { key: 'desktop', label: 'Desktop', hint: '1280px+ · full three panels', Icon: Laptop },
  { key: 'laptop', label: 'Laptop', hint: '1100px · compact three panels', Icon: Laptop },
  { key: 'tablet', label: 'Tablet', hint: '820px · two panels', Icon: Tablet },
  { key: 'mobile', label: 'Mobile', hint: '414px · one panel at a time', Icon: Smartphone },
  { key: 'small', label: '320', hint: '320px · smallest phone', Icon: Smartphone },
];
export type ListState = 'ready' | 'loading' | 'error' | 'empty';

const seg = (on: boolean) =>
  `inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${on ? 'bg-white text-brand-blue shadow-sm dark:bg-slate-900' : 'text-gray-600 hover:text-gray-900 dark:text-slate-300'}`;

export default function TestControls({ role, onRole, device, onDevice, listState, onListState, onIncoming, onTyping, onReset }: {
  role: Role; onRole: (r: Role) => void;
  device: Device; onDevice: (d: Device) => void;
  listState: ListState; onListState: (s: ListState) => void;
  onIncoming: () => void; onTyping: () => void; onReset: () => void;
}) {
  return (
    <section aria-label="Test controls" className="mb-4 space-y-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3 dark:border-amber-500/40 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical className="h-4 w-4 text-amber-700" />
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">Chat test page</span>
        <SimTag>Test data only · no API</SimTag>
        <span className="text-xs text-amber-900/80 dark:text-amber-200/80">Type “fail” in a message to see a failed send. Nothing here reaches the live app.</span>
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        {/* View as */}
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">View as</p>
          <div className="flex flex-wrap gap-0.5 rounded-lg bg-amber-100/70 p-0.5 dark:bg-slate-800">
            {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
              <button key={r} type="button" onClick={() => onRole(r)} aria-pressed={role === r} className={seg(role === r)}>{ROLE_LABEL[r]}</button>
            ))}
          </div>
          <p className="mt-1 max-w-xl text-xs text-gray-700 dark:text-slate-300">{ROLE_SUMMARY[role]}</p>
        </div>

        {/* Device */}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">Preview width</p>
          <div className="flex flex-wrap gap-0.5 rounded-lg bg-amber-100/70 p-0.5 dark:bg-slate-800">
            {DEVICES.map(({ key, label, hint, Icon }) => (
              <button key={key} type="button" onClick={() => onDevice(key)} aria-pressed={device === key} title={hint} className={seg(device === key)}><Icon className="h-3.5 w-3.5" />{label}</button>
            ))}
          </div>
        </div>

        {/* List state */}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">State</p>
          <div className="flex gap-0.5 rounded-lg bg-amber-100/70 p-0.5 dark:bg-slate-800">
            {(['ready', 'loading', 'error', 'empty'] as ListState[]).map(s => (
              <button key={s} type="button" onClick={() => onListState(s)} aria-pressed={listState === s} className={seg(listState === s)}>{s[0].toUpperCase() + s.slice(1)}</button>
            ))}
          </div>
        </div>

        {/* Events */}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900/70">Simulate</p>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" className="h-8 text-xs" icon={<MessageSquarePlus className="h-3.5 w-3.5" />} onClick={onIncoming}>Incoming message</Button>
            <Button variant="secondary" size="sm" className="h-8 text-xs" icon={<Keyboard className="h-3.5 w-3.5" />} onClick={onTyping}>Typing</Button>
            <Button variant="secondary" size="sm" className="h-8 text-xs" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onReset}>Reset data</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
