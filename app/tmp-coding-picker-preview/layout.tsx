import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

// Development-only preview page: never served by a production build
// (security sheet F8).
export default function DevOnlyLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
