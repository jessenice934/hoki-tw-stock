import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Optional fallback UI. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  /** Called when an error is caught (for logging). */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic React error boundary — catches render-time crashes in subtree and
 * shows a friendly fallback instead of a blank screen.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="glass-card p-6 flex flex-col items-center text-center gap-3">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <h3 className="text-lg font-bold text-slate-900">
            Unable to display result
          </h3>
          <p className="text-sm text-slate-500 max-w-md">
            Something went wrong rendering this analysis. This is usually a
            transient data issue — please try again or pick a different ticker.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-xs text-red-600 bg-red-50 p-2 rounded max-w-full overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.reset}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
