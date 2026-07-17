import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8">
          <div className="glass-panel p-8 max-w-md w-full text-center animate-fade-in shadow-2xl space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto">
              <AlertTriangle size={28} />
            </div>
            <h2 className="font-bold text-white">Something went wrong</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              The application encountered an unexpected error. Your data is safe — this is a rendering issue.
            </p>
            {this.state.error && (
              <details className="text-[10px] text-zinc-500 text-left bg-zinc-900 border border-zinc-800 rounded-lg p-3 font-mono">
                <summary className="cursor-pointer text-zinc-300 mb-1">Error details</summary>
                {this.state.error.message}
              </details>
            )}
            <button
              className="btn btn-outline text-sm flex items-center gap-2 mx-auto"
              onClick={this.handleRetry}
            >
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
