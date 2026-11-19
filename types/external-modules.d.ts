// Module declarations for runtime-only imports (not present in node_modules
// types) so the typechecker doesn't error.

declare module '/talkinghead/*' {
  export class TalkingHead {
    constructor(container: HTMLElement, options?: Record<string, unknown>);
    audioCtx?: AudioContext;
    [key: string]: any;
  }
}

declare module '@react-three/offscreen' {
  import type { ReactNode } from 'react';
  export function render(scene: ReactNode): void;
}
