'use client';

import { useEffect, useState } from 'react';

/**
 * Team Chat image attachment, loaded once per session.
 *
 * Switching tabs (Teams ⇄ Chat, Direct / Channels / All, another conversation
 * and back) re-renders the thread from freshly fetched messages, and every
 * <img> started its download again — the image area sat empty each time. Here
 * the first load is kept as an in-memory blob keyed by the message, so any
 * later render of the same attachment shows it straight away, even if the
 * server hands back a differently-signed `file_url` for it.
 *
 * If the file can't be fetched as a blob (CORS, auth), it falls back to the
 * plain <img src> the thread always used, so nothing that worked stops working.
 */

const MAX_CACHED = 200;
const cache = new Map<string, string>(); // cacheKey -> object URL
const inflight = new Map<string, Promise<string | null>>();

function remember(key: string, objectUrl: string) {
  cache.set(key, objectUrl);
  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value as string;
    const url = cache.get(oldest);
    cache.delete(oldest);
    if (url) URL.revokeObjectURL(url);
  }
}

function load(key: string, src: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetch(src)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        remember(key, objectUrl);
        return objectUrl;
      })
      .catch(() => null)
      .finally(() => { inflight.delete(key); });
    inflight.set(key, pending);
  }
  return pending;
}

/** The cached copy of an attachment, if it has loaded this session. */
export function cachedChatImageUrl(cacheKey: string): string | undefined {
  return cache.get(cacheKey);
}

export default function CachedChatImage({
  cacheKey,
  src,
  alt,
  className,
}: {
  /** Stable per attachment (the message id) — not the URL, which may be re-signed. */
  cacheKey: string;
  src: string;
  alt: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(() => cache.get(cacheKey) ?? null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const hit = cache.get(cacheKey);
    if (hit) { setObjectUrl(hit); return; }
    let cancelled = false;
    setFallback(false);
    load(cacheKey, src).then((url) => {
      if (cancelled) return;
      if (url) setObjectUrl(url);
      else setFallback(true);
    });
    return () => { cancelled = true; };
  }, [cacheKey, src]);

  if (objectUrl || fallback) {
    return <img src={objectUrl ?? src} alt={alt} className={className} />;
  }
  // First load only: a soft placeholder while the image downloads.
  return <span aria-label={alt} role="img" className="block h-40 w-56 max-w-full animate-pulse rounded bg-gray-100 dark:bg-slate-800" />;
}
