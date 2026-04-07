import { ReactNode } from 'react';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    // Force light color scheme for the candidate portal.
    // The root ThemeProvider adds class="dark" to <html> when the OS is in dark mode,
    // but candidate-facing pages are light-only. colorScheme:'light' also prevents
    // Android Chrome's "Force Dark Mode" feature from inverting colors.
    <div className="min-h-screen bg-white" style={{ colorScheme: 'light' }}>
      {children}
    </div>
  );
}
