// Keeps a crash in one part of the app from blanking the whole window: the part that failed is
// replaced by a card with a way back, and the error is kept so it can be reported.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordError } from '../lib/errors';
import { Pennant } from './icons';

interface Props {
  children: ReactNode;
  /** where in the app this boundary sits, for the error log */
  area: string;
  /** a change of this value (e.g. the page) clears the error and tries again */
  resetKey?: unknown;
  /** fill the whole window (outermost boundary) instead of the page area */
  full?: boolean;
  /** keep the error card out of sight (the chart, while another page is open) */
  hidden?: boolean;
}

interface State {
  error: Error | null;
  resetKey: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordError(this.props.area, error, info.componentStack ?? undefined);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={`crash${this.props.full ? ' full' : ''}`} role="alert" hidden={this.props.hidden}>
        <div className="crash-card">
          <Pennant size={22} />
          <h1 className="crash-title">Something went wrong here</h1>
          <p className="crash-text">
            Your watch and logbook are safe: they are saved as you go, and a watch under way keeps its time. Try again, or reload Leeward.
          </p>
          <p className="crash-detail mono">{error.message || String(error)}</p>
          <div className="crash-actions">
            <button className="btn white" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn primary" onClick={() => location.reload()}>
              Reload Leeward
            </button>
          </div>
        </div>
      </div>
    );
  }
}
