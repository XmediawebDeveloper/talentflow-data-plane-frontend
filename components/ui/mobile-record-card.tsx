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

/**
 * Card layout for every MobileRecordCard below this provider.
 *
 * - `default`: the app-wide record card (checkbox column, wrapping head line,
 *   buttons bottom-right).
 * - `jd`: the Job Openings card, used only inside the Job Openings module
 *   (Job Openings, its Config page, Job Details and their popups):
 *     1. checkbox · ID badge · pills
 *     2. name on one line ("…") · title addon · icon actions on the right
 *     3. icon + text details, flowing
 *     4. "Label: value" pairs, flowing
 *     5. divider, then the count chips as tiles
 *   Text buttons (e.g. "Invite for Assessment") would crush the name, so when
 *   the actions hold any, they drop to their own row at the bottom instead.
 */
export type MobileRecordCardVariant = 'default' | 'jd';
const MobileRecordCardVariantContext = React.createContext<MobileRecordCardVariant>('default');

/** The card layout in effect here — for screens with their own hand-built card that should
 *  switch to MobileRecordCard only inside the Job Openings module. */
export function useMobileRecordCardVariant(): MobileRecordCardVariant {
  return React.useContext(MobileRecordCardVariantContext);
}

export function MobileRecordCardVariantProvider({
  variant,
  children,
}: {
  variant: MobileRecordCardVariant;
  children: React.ReactNode;
}) {
  return (
    <MobileRecordCardVariantContext.Provider value={variant}>
      {children}
    </MobileRecordCardVariantContext.Provider>
  );
}

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
  actionsBelow = false,
  onClick,
  className,
  ...rest
}: {
  /** `jd` layout: put the actions on the bottom row even when they are icon-only (too many
   *  controls for the name row — e.g. a status toggle plus four icons). */
  actionsBelow?: boolean;
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
  const variant = React.useContext(MobileRecordCardVariantContext);
  if (variant === 'jd') {
    return (
      <JdRecordCard
        {...rest}
        select={select}
        idBadge={idBadge}
        badges={badges}
        title={title}
        titleAddon={titleAddon}
        actions={actions}
        shownMeta={shownMeta}
        shownFields={shownFields}
        footer={footer}
        expanded={expanded}
        tooltip={tooltip}
        selected={selected}
        wrapTitle={wrapTitle}
        forceActionsBelow={actionsBelow}
        onClick={onClick}
        className={className}
      >
        {children}
      </JdRecordCard>
    );
  }
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

/**
 * True when the actions hold a button / link with a real text label (more than a short count).
 * Also tags each such control `data-jdv-text`: CSS `:has(> svg:only-child)` ignores
 * text nodes, so an "icon + label" button would otherwise be styled as an icon square.
 */
function hasTextAction(root: HTMLElement): boolean {
  let found = false;
  root.querySelectorAll<HTMLElement>('button, a, [role="button"]').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (text.length > 0) {
      // A short count ("📎 2") still fits the name row; a real label moves the actions down.
      if (text.length > 3) found = true;
      el.setAttribute('data-jdv-text', '');
    } else {
      el.removeAttribute('data-jdv-text');
    }
  });
  return found;
}

/** The Job Openings card layout — see MobileRecordCardVariant. */
function JdRecordCard({
  select,
  idBadge,
  badges,
  title,
  titleAddon,
  actions,
  shownMeta,
  shownFields,
  footer,
  children,
  expanded,
  tooltip,
  selected,
  wrapTitle,
  forceActionsBelow = false,
  onClick,
  className,
  ...rest
}: {
  forceActionsBelow?: boolean;
  select?: React.ReactNode;
  idBadge?: React.ReactNode;
  badges?: React.ReactNode;
  title?: React.ReactNode;
  titleAddon?: React.ReactNode;
  actions?: React.ReactNode;
  shownMeta: MobileRecordMetaItem[];
  shownFields: MobileRecordField[];
  footer?: React.ReactNode;
  children?: React.ReactNode;
  expanded?: React.ReactNode;
  tooltip?: string;
  selected: boolean;
  wrapTitle: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'title'>) {
  // Icon-only actions sit on the name row; any text button moves them all to the bottom row.
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const [textActionsBelow, setActionsBelow] = React.useState(false);
  React.useLayoutEffect(() => {
    if (actionsRef.current) {
      const below = hasTextAction(actionsRef.current);
      setActionsBelow((prev) => (prev === below ? prev : below));
    }
  });
  const actionsBelow = forceActionsBelow || textActionsBelow;
  /* No version chip (titleAddon) to sit beside: icon buttons ride the footer line, right
     after its chips (e.g. "Score 7.5/10 · ⋮"), rather than a line of their own. */
  const actionsInFooter = !actionsBelow && !titleAddon && !!footer;

  const hasTop = !!(idBadge || badges);
  const actionsEl = actions ? (
    <div
      ref={actionsRef}
      className={cn('tf-record-actions tf-jdv-actions', actionsBelow && 'tf-jdv-actions-below')}
      onClick={stop}
    >
      {actions}
    </div>
  ) : null;

  return (
    <div
      {...rest}
      onClick={onClick}
      role={onClick ? 'button' : rest.role}
      tabIndex={onClick ? 0 : rest.tabIndex}
      title={tooltip}
      onKeyDown={onClick ? (e) => {
        rest.onKeyDown?.(e);
        if (e.defaultPrevented || e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      } : rest.onKeyDown}
      className={cn(
        'tf-record-card tf-jdv-card',
        onClick && 'tf-record-card-clickable',
        selected && 'tf-record-card-selected',
        className,
      )}
    >
      {/* The checkbox sits beside the name (its own line), not up with the ID / badges. */}
      {hasTop && (
        <div className="tf-jdv-top">
          {select && !title && <span className="tf-jdv-select" onClick={stop}>{select}</span>}
          {idBadge}
          {badges}
        </div>
      )}

      {(title || titleAddon || (!hasTop && select) || (actionsEl && !actionsBelow && !actionsInFooter)) && (
        <div className={cn('tf-jd-card-head', !hasTop && 'mt-0')}>
          <div className="tf-jd-card-name">
            {title ? (
              <div className="tf-jdv-name-line">
                {select && <span className="tf-jdv-select" onClick={stop}>{select}</span>}
                <div className={wrapTitle ? 'tf-jdv-title-wrap' : 'tf-jdv-title'}>{title}</div>
              </div>
            ) : (
              !hasTop && select && <span className="tf-jdv-select" onClick={stop}>{select}</span>
            )}
            {titleAddon && <span className="inline-flex shrink-0" onClick={stop}>{titleAddon}</span>}
          </div>
          {!actionsBelow && !actionsInFooter && actionsEl}
        </div>
      )}

      {shownMeta.length > 0 && (
        <div className="tf-jd-card-meta">
          <div className="tf-jd-card-info">
            {shownMeta.map((m, i) => (
              <span key={i} className="tf-jdv-meta-item">
                {m.icon}
                <span className="min-w-0 break-words">{m.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {shownFields.length > 0 && (
        <dl className="tf-jdv-fields">
          {shownFields.map((f, i) => (
            <div key={i} className="tf-jdv-field">
              <dt className="tf-jd-card-date-label">{f.label}:</dt>
              <dd className="tf-jdv-field-value">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {children}

      {footer && (
        <div className="tf-jdv-footer" onClick={stop}>
          {footer}
          {actionsInFooter && actionsEl}
        </div>
      )}

      {actionsBelow && actionsEl}

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
