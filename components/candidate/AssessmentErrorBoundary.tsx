'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  token: string;
}

interface State {
  hasError: boolean;
}

export class AssessmentErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ERROR BOUNDARY] Client-side error caught — reloading to recover:', error, info);
    // sessionStorage already has latest timer from periodic saves in the interval
    // Reload after a brief moment to let the error log flush
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
            <p className="text-gray-600 text-lg font-medium">Something went wrong</p>
            <p className="text-gray-500 text-sm mt-2">Reconnecting your assessment...</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
