'use client';

import { useEffect, useState } from 'react';
import { MinusCircle, PlusCircle, Loader2, RefreshCw } from 'lucide-react';
import teamService, { UnitActivityItem, UnitActivityKind } from '@/lib/services/teamService';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';

/**
 * A member's unit activity: every unit deducted (e.g. a resume upload, 1 RU)
 * and every unit returned (deleting that resume gives the 1 RU back).
 * Shown inside an expanded member row on the Teams usage page.
 */

const UNIT_NAMES: Record<string, string> = {
  RS: 'Resume Scoring',
  AS: 'Assessment',
  AIU: 'AI Interview',
  RU: 'Resume Upload',
};

const PAGE_SIZE = 20;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function UnitActivityLog({
  teamId,
  userId,
  memberName,
  fromDate,
  toDate,
  compact = false,
}: {
  teamId: string;
  userId: string;
  memberName: string;
  fromDate: string;
  toDate: string;
  /** Narrow layout for the mobile member card. */
  compact?: boolean;
}) {
  const [kind, setKind] = useState<UnitActivityKind>('all');
  const [items, setItems] = useState<UnitActivityItem[]>([]);
  const [summary, setSummary] = useState<{ deducted: number; returned: number; net: number } | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // "Loading" = the first page for the current filters hasn't landed yet.
  // Derived from keys, so the effect only sets state once the request settles.
  const requestKey = `${teamId}|${userId}|${kind}|${fromDate}|${toDate}|${reloadKey}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const loading = settledKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    teamService
      .getMemberUnitActivity(teamId, userId, { kind, fromDate, toDate, limit: PAGE_SIZE, offset: 0 })
      .then(page => {
        if (cancelled) return;
        setItems(page.items);
        setSummary(page.summary);
        setTotal(page.total);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setError('Could not load unit activity');
      })
      .finally(() => {
        if (!cancelled) setSettledKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, teamId, userId, kind, fromDate, toDate]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await teamService.getMemberUnitActivity(teamId, userId, {
        kind, fromDate, toDate, limit: PAGE_SIZE, offset: items.length,
      });
      setItems(prev => [...prev, ...page.items]);
      setTotal(page.total);
    } catch {
      setError('Could not load more activity');
    } finally {
      setLoadingMore(false);
    }
  };

  const filters: { value: UnitActivityKind; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'deducted', label: 'Deducted' },
    { value: 'returned', label: 'Returned' },
  ];

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Header: title, period totals, filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="tf-eyebrow tracking-wide">Unit activity</p>
          {summary && (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 dark:bg-slate-800 dark:text-slate-200">
                {fmt(summary.deducted)} deducted
              </span>
              <span className="rounded-full bg-success-subtle px-2 py-0.5 font-medium text-success">
                {fmt(summary.returned)} returned
              </span>
              <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 font-semibold text-brand-blue">
                Net {fmt(summary.net)}
              </span>
            </p>
          )}
        </div>
        <div role="group" aria-label="Show" className="tf-panel inline-flex p-0.5">
          {filters.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setKind(f.value)}
              aria-pressed={kind === f.value}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                kind === f.value
                  ? 'bg-brand-blue text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center gap-2 py-3 tf-meta">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading unit activity…
        </div>
      ) : error && items.length === 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive-line bg-destructive-subtle px-3 py-2 tf-error">
          {error}
          <button type="button" onClick={() => setReloadKey(k => k + 1)} className="inline-flex items-center gap-1 font-medium hover:underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-2 tf-hint italic">
          {kind === 'returned'
            ? `No units were returned to ${memberName} between ${formatISTDate(fromDate)} and ${formatISTDate(toDate)}.`
            : kind === 'deducted'
            ? `No units were deducted for ${memberName} in this period.`
            : `No unit activity for ${memberName} in this period.`}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(item => {
            const returned = item.direction === 'returned';
            const amount = Math.abs(item.units);
            return (
              <li
                key={item.id}
                className={`flex items-start gap-2.5 rounded-lg border bg-white px-3 py-2 dark:bg-slate-900 ${
                  returned ? 'border-success-line' : 'border-gray-200 dark:border-slate-700'
                }`}
              >
                {returned
                  ? <PlusCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  : <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className="tf-row-name">
                    {item.label}
                    {item.entity_name && (
                      <span className="ml-1.5 font-normal text-gray-500 dark:text-slate-400 break-all">· {item.entity_name}</span>
                    )}
                  </p>
                  <p className="mt-0.5 tf-meta">
                    {UNIT_NAMES[item.unit_type] ?? item.unit_type}
                    {item.created_at && <> · {formatIST(item.created_at)}</>}
                  </p>
                  {/* The other half of the pair, when we can link it. */}
                  {!returned && item.returned_at && (
                    <p className="tf-badge mt-1 bg-success-subtle text-success">
                      Unit returned {formatISTDate(item.returned_at)}{item.returned_by ? ` · deleted by ${item.returned_by}` : ''}
                    </p>
                  )}
                  {returned && item.original_upload_at && (
                    <p className="mt-1 tf-meta">
                      Uploaded {formatISTDate(item.original_upload_at)}{item.original_upload_by ? ` by ${item.original_upload_by}` : ''}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${returned ? 'text-success' : 'text-gray-900 dark:text-slate-50'}`}
                  title={returned ? 'Credited back to the quota' : 'Deducted from the quota'}
                >
                  {returned ? '+' : '−'}{fmt(amount)} {item.unit_type}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && items.length > 0 && items.length < total && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline disabled:opacity-60"
        >
          {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
          Show more ({total - items.length} left)
        </button>
      )}
    </div>
  );
}
