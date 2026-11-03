'use client';

import * as React from 'react';
import { cn } from './utils';

/**
 * How every table shows its rows on phones and tablets. Below 1024px a table is
 * hidden and its rows render as these cards — the job-openings card is the model:
 *
 *   [☐]  JD-338  Automation Developer  v2  AI  Disabled      ← idBadge · title · badges
 *        ↗ 0-2 years   ▦ Information Technology               ← meta (icon + text)
 *        Created: 26 Oct 2026   Posted: 26 Oct 2026   By: mani ← fields
 *   2 Scored  0 Assessed  0 Interviewed                        ← footer (count chips)
 *                                                  [👁] [⋮]    ← actions (bottom-right)
 *
 * From 1024px the table itself shows. The look lives in the global `tf-record-*`,
 * `tf-stat-chip-*` and `tf-icon-btn-outline` classes in app/globals.css.
 *
 * Usage:
 *   <div className={DESKTOP_TABLE_ONLY}>…the existing <table>…</div>
 *   <MobileRecordList>
 *     {rows.map((r) => (
 *       <MobileRecordCard
 *         key={r.id}
 *         select={<Checkbox … />}          // the table's own checkbox / handler
 *         idBadge={<JobIdBadge>{r.code}</JobIdBadge>}
 *         title={r.name}
 *         badges={<StatusPill … />}        // version / status pills, after the title
 *         meta={[{ icon: <Briefcase />, label: r.type }]}
 *         fields={[{ label: 'Created', value: formatIST(r.created_at) }]}
 *         footer={<MobileStatChip tone="info" icon={<Users />}>3 Scored</MobileStatChip>}
 *         actions={<RowActionsMenu … />}   // the table's own buttons / menu
 *         onClick={() => openRow(r)}       // the table's own row click, if any
 *       />
 *     ))}
 *   </MobileRecordList>
 */

/** Wrapper class for the desktop table: hidden on phones and tablets, shown from 1024px. */
export const DESKTOP_TABLE_ONLY = 'hidden lg:block';

export function MobileRecordList({
  children,
  className,
  empty,
}: {
  children: React.ReactNode;
  className?: string;
  /** Shown when there are no cards (pass the table's own empty state). */
  empty?: React.ReactNode;
}) {
  const hasChildren = React.Children.toArray(children).length > 0;
  return (
    <div className={cn('tf-record-list lg:hidden', className)}>
      {hasChildren ? children : empty}
    </div>
  );
}

export interface MobileRecordField {
  label: React.ReactNode;
  value: React.ReactNode;
}
export interface MobileRecordMetaItem {
  icon?: React.ReactNode;
  label: React.ReactNode;
}

// Clicks on the checkbox / buttons must not also trigger the card's own click.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function MobileRecordCard({
  select,
  idBadge,
  badges,
  title,
  titleAddon,
  actions,
  meta,
  fields,
  footer,
  children,
  expanded,
  tooltip,
  selected = false,
  wrapTitle = false,
  onClick,
  className,
  ...rest
}: {
  /** Expanded content (history, inline lists, details) — rendered at the very bottom, under the buttons. */
  expanded?: React.ReactNode;
  /** Hover tooltip for the whole card (the HTML title attribute; `title` is the card's heading). */
  tooltip?: string;
  /** The row's own checkbox / radio (keeps the table's handler). Sits in its own column on the left. */
  select?: React.ReactNode;
  /** ID chip shown before the title (JD-338, CID, #12 …). */
  idBadge?: React.ReactNode;
  /** Version / status pills shown after the title, on the same wrapping line. */
  badges?: React.ReactNode;
  /** Primary name of the row (up to two lines). */
  title?: React.ReactNode;
  /** Interactive thing right after the title, e.g. a version picker. */
  titleAddon?: React.ReactNode;
  /** The row's own buttons / actions menu — bottom-right of the card. */
  actions?: React.ReactNode;
  /** Icon + text lines (experience, department, type …). Empty labels are skipped. */
  meta?: MobileRecordMetaItem[];
  /** "Label: value" pairs (Created, Posted, By …). Empty values are skipped. */
  fields?: MobileRecordField[];
  /** Count chips (MobileStatChip) or row buttons — along the bottom, from the card's left edge. */
  footer?: React.ReactNode;
  /** Anything else, rendered under the fields. */
  children?: React.ReactNode;
  selected?: boolean;
  /** Show a long title (e.g. a question) in full instead of two lines. */
  wrapTitle?: boolean;
  /** Row click. Receives the click event for handlers that need it. */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'title'>) {
  const shownMeta = (meta ?? []).filter((m) => m.label !== null && m.label !== undefined && m.label !== '' && m.label !== false);
  const shownFields = (fields ?? []).filter((f) => f.value !== null && f.value !== undefined && f.value !== '' && f.value !== false);
  const hasHead = idBadge || title || titleAddon || badges;
  return (
    <div
      {...rest}
      onClick={onClick}
      // A clickable card is reachable and usable from the keyboard too.
      role={onClick ? 'button' : rest.role}
      tabIndex={onClick ? 0 : rest.tabIndex}
      title={tooltip}
      onKeyDown={onClick ? (e) => {
        rest.onKeyDown?.(e); // a caller's own key handling runs first
        if (e.defaultPrevented || e.target !== e.currentTarget) return; // keys inside the card's own buttons / inputs stay theirs
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      } : rest.onKeyDown}
      className={cn(
        'tf-record-card',
        onClick && 'tf-record-card-clickable',
        selected && 'tf-record-card-selected',
        className,
      )}
    >
      <div className="tf-record-body">
        {select && (
          <span className="tf-record-select" onClick={stop}>
            {select}
          </span>
        )}
        <div className="tf-record-content">
          {hasHead && (
            <div className="tf-record-head">
              {idBadge}
              {title && <div className={wrapTitle ? 'tf-record-title-wrap' : 'tf-record-title'}>{title}</div>}
              {titleAddon && <span className="inline-flex shrink-0" onClick={stop}>{titleAddon}</span>}
              {badges}
            </div>
          )}

          {shownMeta.length > 0 && (
            <div className="tf-record-meta">
              {shownMeta.map((m, i) => (
                <span key={i} className="tf-record-meta-item">
                  {m.icon}
                  <span className="min-w-0 break-words">{m.label}</span>
                </span>
              ))}
            </div>
          )}

          {shownFields.length > 0 && (
            <div className="tf-record-fields">
              {shownFields.map((f, i) => (
                <span key={i} className="tf-record-field">
                  <span className="tf-record-field-label">{f.label}:</span>
                  <span className="tf-record-field-value">{f.value}</span>
                </span>
              ))}
            </div>
          )}

          {children}
        </div>
      </div>

      {footer && (
        <div className="tf-record-footer" onClick={stop}>
          {footer}
        </div>
      )}

      {actions && (
        <div className="tf-record-actions" onClick={stop}>
          {actions}
        </div>
      )}

      {expanded && (
        <div className="mt-3" onClick={stop}>
          {expanded}
        </div>
      )}
    </div>
  );
}

export type MobileStatTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/** Coloured count chip for a card footer (e.g. "3 Scored", "2 Interviewed"). */
export function MobileStatChip({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: MobileStatTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('tf-stat-chip', `tf-stat-chip-${tone}`, className)}>
      {icon}
      {children}
    </span>
  );
}
