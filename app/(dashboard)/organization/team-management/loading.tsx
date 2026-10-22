import { TeamManagementSkeleton } from '@/components/teams';

// Route-level Suspense fallback — the same skeleton as the page's own
// `if (isLoading)` branch, so refresh/navigation never shows two layouts.
export default function Loading() {
  return <TeamManagementSkeleton />;
}
