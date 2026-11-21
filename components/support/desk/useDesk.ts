'use client';

/* Support desk — the state of one area (support / team / requests): the
   server-paged list with its filters, the stats, the open ticket, and every
   action. Lists and the open ticket refresh themselves every 30s while the
   tab is visible (and on coming back to it); a refresh never overwrites
   newer data, and someone else's new reply shows a toast. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useDetailAutoRefresh, isOlder, announceNewReplies } from '@/lib/hooks/useDetailAutoRefresh';
import { deskApi, type Priority, type Scope, type Stats, type Ticket } from './model';

export interface Filters { q: string; status: string; priority: string; category: string; assignment: string; sort: string }
export const NO_FILTERS: Filters = { q: '', status: 'all', priority: 'all', category: 'all', assignment: 'all', sort: 'default' };
export type ViewMode = 'table' | 'kanban';
/** Kanban shows every status side by side, so it loads one big page. */
const KANBAN_PAGE = 100;

export function useDesk(scope: Scope, meId: string | undefined, view: ViewMode, enabled = true) {
  const svc = useMemo(() => deskApi(scope, meId), [scope, meId]);

  /* ── List ── */
  const [filters, setFiltersState] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const search = useDebounce(filters.q.trim(), 350);
  const seq = useRef(0);

  const setFilters = (next: Filters) => { setFiltersState(next); setPage(1); };

  const query = useMemo(() => (view === 'kanban'
    // Kanban: every status at once (columns), first 100 by last update.
    ? { page: 1, pageSize: KANBAN_PAGE, status: 'all', priority: filters.priority, category: filters.category, assignment: filters.assignment, search, sort: 'updated' }
    : { page, pageSize, status: filters.status, priority: filters.priority, category: filters.category, assignment: filters.assignment, search, sort: filters.sort }),
  [view, page, pageSize, filters.status, filters.priority, filters.category, filters.assignment, filters.sort, search]);

  const loadList = useCallback(async (silent = false) => {
    const mine = ++seq.current;
    if (!silent) { setState('loading'); setError(''); }
    try {
      const res = await svc.list(query);
      if (mine !== seq.current) return;
      setRows(res.items);
      setTotal(res.total);
      setState('ready');
    } catch (e) {
      if (mine !== seq.current || silent) return;
      setRows([]);
      setTotal(0);
      setError(e instanceof Error && e.message ? e.message : 'Could not load tickets');
      setState('error');
    }
  }, [svc, query]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await svc.stats());
      setStatsFailed(false);
    } catch {
      setStatsFailed(true);
    }
  }, [svc]);

  useEffect(() => {
    if (!enabled) return;
    // Fetching on change is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [enabled, loadList]);
  useEffect(() => {
    if (!enabled) return;
    // Fetching on change is the point of this effect (state is set after the await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStats();
  }, [enabled, loadStats]);

  /* ── Open ticket ── */
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);

  const open = useCallback(async (id: string | null, summary?: Ticket) => {
    setOpenId(id);
    setDetailFailed(false);
    setDetail(summary ?? null);
    if (!id) return;
    setDetailLoading(true);
    try {
      const full = await svc.get(id);
      setDetail(cur => (cur && cur.id !== id ? cur : full));
    } catch {
      setDetailFailed(true);
    } finally {
      setDetailLoading(false);
    }
  }, [svc]);

  /** A changed ticket (from an action or a refresh) → the open view and its row. */
  const apply = useCallback((t: Ticket) => {
    setDetail(cur => (cur && cur.id === t.id && !isOlder(t.updatedAt, cur.updatedAt) ? t : cur));
    setRows(prev => prev.map(r => (r.id === t.id && !isOlder(t.updatedAt, r.updatedAt) ? t : r)));
  }, []);

  /* ── Auto refresh ── */
  const [busy, setBusy] = useState<string | null>(null);
  useDetailAutoRefresh(enabled && !openId, () => { void loadList(true); void loadStats(); });
  useDetailAutoRefresh(enabled && !!openId, async () => {
    if (!openId || busy) return;
    const shown = detail;
    const fresh = await svc.get(openId);
    if (shown && shown.id === fresh.id && !isOlder(fresh.updatedAt, shown.updatedAt)) {
      const since = Date.parse(shown.updatedAt);
      // Replies from the other side only — yours are already on screen.
      const theirs = scope === 'support' ? 'agent' : scope === 'team' ? 'requester' : 'agent';
      announceNewReplies(fresh.number, fresh.replies.filter(r => r.role === theirs && Date.parse(r.at) > since).map(r => ({ name: r.author, message: r.message })));
    }
    apply(fresh);
  });

  /* ── Actions ── */
  const run = async (key: string, fn: () => Promise<Ticket>, ok: string, fail: string) => {
    if (busy) return null;
    setBusy(key);
    try {
      const t = await fn();
      apply(t);
      toast.success(ok);
      void loadStats();
      return t;
    } catch (e) {
      showErrorToast(e, fail);
      return null;
    } finally {
      setBusy(null);
    }
  };
  const actions = {
    busy,
    assign: (t: Ticket) => run(`assign:${t.id}`, () => svc.assign(t.id), `#${t.number} assigned to you`, "Couldn't assign the ticket"),
    resolve: (t: Ticket) => run(`resolve:${t.id}`, () => svc.resolve(t.id), `#${t.number} resolved`, "Couldn't resolve the ticket"),
    close: (t: Ticket) => run(`close:${t.id}`, () => svc.close(t.id), `#${t.number} closed`, "Couldn't close the ticket"),
    reopen: (t: Ticket) => run(`reopen:${t.id}`, () => svc.reopen(t.id), `#${t.number} reopened`, "Couldn't reopen the ticket"),
    setPriority: (t: Ticket, p: Priority) => run(`priority:${t.id}`, () => svc.setPriority(t.id, p), 'Priority updated', "Couldn't update the priority"),
    /** Resolves true when sent (the reply box then clears). */
    reply: async (t: Ticket, text: string, files: File[]) => {
      const done = await run(`reply:${t.id}`, () => svc.reply(t.id, text, files), 'Reply sent', "Couldn't send your reply");
      return !!done;
    },
    download: async (t: Ticket, file: { id: string; name: string }) => {
      try {
        await svc.download(t.id, file);
      } catch (e) {
        showErrorToast(e, `Couldn't download ${file.name}`);
      }
    },
    /** The Forward dialog returned the updated team ticket. */
    forwarded: (raw: NonNullable<Ticket['raw']>) => { apply(svc.mapInternal(raw)); void loadStats(); },
  };

  /** A new ticket: upload its files, then show it from the first page. */
  const create = async (input: { title: string; description: string; category: string; priority: Priority }, files: File[]) => {
    const t = await svc.create(input);
    let uploadFailed: unknown = null;
    if (files.length) {
      try { await svc.uploadFiles(t.id, files); } catch (e) { uploadFailed = e; }
    }
    if (uploadFailed) {
      showErrorToast(uploadFailed, `Ticket #${t.number} created, but its attachments were not uploaded — you can attach them from the ticket`);
    } else {
      toast.success(scope === 'support' ? `Ticket #${t.number} created. We'll respond within 24 hours.` : `Ticket #${t.number} created. Your administrator will respond soon.`);
    }
    setFiltersState(NO_FILTERS);
    if (page === 1) void loadList(); else setPage(1);
    void loadStats();
    return t;
  };

  // Stats from the API, or from the loaded rows if that call failed.
  const effectiveStats: Stats = stats ?? {
    open: rows.filter(t => t.status === 'open').length,
    inProgress: rows.filter(t => t.status === 'in-progress').length,
    resolved: rows.filter(t => t.status === 'resolved').length,
    closed: rows.filter(t => t.status === 'closed').length,
    total,
  };

  return {
    svc, filters, setFilters, page, setPage, pageSize, setPageSize: (n: number) => { setPageSize(n); setPage(1); },
    rows, total, state, error, retry: () => void loadList(), stats: effectiveStats, statsReady: !!stats, statsFailed,
    openId, detail, detailLoading, detailFailed, open, actions, create,
  };
}
export type Desk = ReturnType<typeof useDesk>;
