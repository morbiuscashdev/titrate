import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from './ui';

type ErrorBoundaryProps = {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
};

type ErrorBoundaryState = {
  readonly hasError: boolean;
  readonly error: Error | null;
};

/**
 * Catches unhandled errors in the component tree and shows a fallback UI
 * instead of crashing the entire app. Particularly important during
 * distribution where a crash could leave derived wallet keys in an
 * uncertain state.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="mx-auto max-w-lg p-8 text-center">
          <h2 className="font-sans text-lg font-extrabold tracking-tight text-[color:var(--color-err)] mb-2">
            Something went wrong
          </h2>
          <p className="font-mono text-sm text-[color:var(--fg-muted)] mb-4">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <Button variant="primary" onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
