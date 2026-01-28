/**
 * Error Boundary Component
 * 
 * Catches React component errors and displays a fallback UI instead of crashing the entire app.
 * 
 * Issue #11: Missing Error Boundaries
 */

import React, { Component, type ReactNode } from 'react';
import { createLogger } from '../lib/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private logger = createLogger({ context: 'ErrorBoundary' });

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to tracking service
    this.logger.error('ErrorBoundary caught error', error, {
      componentStack: errorInfo.componentStack,
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-earthy">
          <div className="text-center max-w-md mx-auto px-6">
            <h1 className="text-2xl font-serif text-text-earthy mb-4">
              Something went wrong
            </h1>
            <p className="text-text-earthy/70 mb-6">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-3 bg-accent-earthy text-white rounded-full font-medium hover:bg-accent-earthy/90 transition-colors"
            >
              Reload Page
            </button>
            {import.meta.env.MODE === 'development' && this.state.error ? (
              <details className="mt-6 text-left">
                <summary className="text-sm text-text-earthy/60 cursor-pointer mb-2">
                  Error Details (Development Only)
                </summary>
                <pre className="text-xs bg-card-earthy/20 p-4 rounded overflow-auto max-h-48">
                  {this.state.error.toString()}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
