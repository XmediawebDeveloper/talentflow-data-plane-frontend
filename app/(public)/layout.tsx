import { ReactNode } from 'react';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Will be enhanced with PublicLayout component (header/footer) after migration */}
      {children}
    </div>
  );
}
