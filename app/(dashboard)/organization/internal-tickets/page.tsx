'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import InternalTicketAdmin from '@/components/InternalTicketAdmin';
import { useAuth } from '@/lib/hooks/useAuth';

/*
 * The team-ticket admin screen — tenant admins only. Anyone else who lands
 * here (an old link, a notification, a typed URL) is sent to their own Help
 * Desk instead, with the same query (e.g. ?ticket=<id>), so a ticket link
 * still opens that ticket on the side they are allowed to see. The backend's
 * admin endpoints remain the real gate; this keeps non-admins off the screen.
 */
export default function InternalTicketsPage() {
  const { user, isTenantAdmin } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const blocked = !!user && !isTenantAdmin;

  useEffect(() => {
    if (!blocked) return;
    const query = searchParams.toString();
    router.replace(`/help-desk${query ? `?${query}` : ''}`);
  }, [blocked, router, searchParams]);

  // Role not known yet, or on the way out — don't flash the admin screen.
  if (!user || blocked) return null;

  return <InternalTicketAdmin />;
}
