import { Component, type ReactNode } from 'react';

type ErrorBoundaryProps = {
    /** Rendered after a child throws; `retry` remounts the children. */
    fallback: (retry: () => void) => ReactNode;
    children: ReactNode;
};

type ErrorBoundaryState = { failed: boolean };

/** Contains a render failure to one subtree instead of blanking the whole panel. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        console.error('[wand-remote] A panel section failed to render.', error);
    }

    render() {
        return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
    }
}
