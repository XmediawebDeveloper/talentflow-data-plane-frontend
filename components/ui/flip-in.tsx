'use client';

import React from 'react';

export type FlipHinge = 'left' | 'right';
export type FlipSwing = 'close' | 'open';

export interface FlipInProps {
  children: React.ReactNode;
  /** Edge the block turns on, like a door's hinges. */
  hinge: FlipHinge;
  /**
   * `close`: starts swung out toward the viewer and shuts flat, like a door
   * closed from inside the room. `open`: starts swung away behind the page and
   * comes forward flat, like a door pulled shut from outside.
   */
  swing?: FlipSwing;
  /** Seconds before the flip starts. The block stays hidden until then. */
  delay?: number;
  /** Seconds the flip takes. */
  duration?: number;
  /** Degrees the block starts turned from flat (0–90). */
  angle?: number;
  /** CSS timing function. */
  easing?: string;
  className?: string;
  style?: React.CSSProperties;
}

export interface FlipStageProps {
  children: React.ReactNode;
  /** CSS perspective distance in px. Smaller values give a stronger 3D effect. */
  perspective?: number;
  /** Where the viewer stands, as a CSS perspective-origin. Default: the centre. */
  origin?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The 3D viewpoint for FlipIn blocks: wrap the blocks' shared container in it
 * (a grid, a flex row) so they are all seen from one point, by default the
 * middle. Two doors hinged on the outer edges then swing shut toward the
 * viewer standing between them. Without a stage the flips still play, but flat.
 */
export function FlipStage({
  children,
  perspective = 1600,
  origin = '50% 50%',
  className = '',
  style,
}: FlipStageProps) {
  return (
    <div
      className={className}
      style={{ perspective: `${perspective}px`, perspectiveOrigin: origin, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * Horizontal flip entrance: the block turns about a vertical axis on its
 * `hinge` edge and fades up as it lands flat.
 *
 * A pair of doors closing from inside, one after the other:
 *   <FlipStage className="grid grid-cols-2 gap-5">
 *     <FlipIn hinge="left"  swing="close" delay={0.1}>left column</FlipIn>
 *     <FlipIn hinge="right" swing="close" delay={0.35}>right column</FlipIn>
 *   </FlipStage>
 *
 * The keyframes (`tf-flip-in`) live in globals.css and read the start angle
 * from a CSS variable set here. `animation-fill-mode: both` keeps the block
 * hidden through `delay`, and users with reduced motion get no animation.
 * Renders a plain div, so layout classes passed through `className` let it
 * stand in for the grid or flex item it wraps.
 */
export default function FlipIn({
  children,
  hinge,
  swing = 'close',
  delay = 0,
  duration = 0.6,
  angle = 90,
  easing = 'cubic-bezier(0.22, 1, 0.36, 1)',
  className = '',
  style,
}: FlipInProps) {
  /* rotateY: a negative angle brings the right side toward the viewer, a
     positive one the left side. When closing, the free edge (the one opposite
     the hinge) starts toward the viewer. */
  const freeEdgeTowardViewer = swing === 'close';
  const sign = (hinge === 'left') === freeEdgeTowardViewer ? -1 : 1;

  return (
    <div
      className={`tf-flip-in ${className}`}
      style={{
        '--tf-flip-angle': `${sign * angle}deg`,
        animationName: 'tf-flip-in',
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
        animationTimingFunction: easing,
        animationFillMode: 'both',
        transformOrigin: `${hinge} center`,
        backfaceVisibility: 'hidden',
        ...style,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
