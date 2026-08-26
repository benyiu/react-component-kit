// What a root does when it throws.
//
// Until now: nothing visible. A React root that throws unmounts its whole
// tree, and every root here renders into a container the classic shell also
// styles — so the failure looked like an empty panel, an absent toolbar, a
// list that never arrived. On a compliance product that is the worst kind of
// failure, because the user cannot tell it from "there is nothing here".
//
// So each root gets one of these. Three rules:
//
//   Say something. A short, translated line naming which region failed, and
//   a way to try again — remounting is often enough, because most of these
//   throw on data that has since arrived.
//
//   Report it. Through one reporter, so where reports go is a wiring
//   decision and not a hundred call sites. The reporter is also what the
//   global handlers use, which is the point of it being a seam.
//
//   Never throw from here. A boundary that throws while reporting takes down
//   what it was protecting.
import { Component } from 'react';
import { DepsContext } from './deps.jsx';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, attempt: 0 };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    const report = this.context && this.context.reportError;
    if (typeof report !== 'function') return;
    try {
      report(error, {
        source: 'react',
        region: this.props.region,
        componentStack: (info && info.componentStack) || '',
      });
    } catch (reportingFailure) {
      // Reporting is best-effort by definition: it is the thing that runs
      // when things are already wrong.
    }
  }

  render() {
    // Keyed on the attempt so that "try again" is a real remount: without it
    // React reuses the fiber that threw and the retry renders nothing.
    if (!this.state.failed) {
      return <div key={this.state.attempt} className="f-react-root">{this.props.children}</div>;
    }
    const t = (this.context && this.context.t) || ((key) => key);
    return (
      <div className="f-react-error" role="alert">
        <span className="f-react-error-copy">{t('common.regionFailed')}</span>
        <button
          type="button"
          className="f-react-error-retry"
          // A new key remounts the subtree, which is what "try again" means
          // for a component that threw on state it no longer holds.
          onClick={() => this.setState((prev) => ({ failed: false, attempt: prev.attempt + 1 }))}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }
}

// Assigned rather than declared as a static class field: the deps context is
// how this reaches the reporter and the translator without a hook, and the
// module's free-identifier guard reads declarations, not class bodies.
ErrorBoundary.contextType = DepsContext;

export { ErrorBoundary };
