import { Component, Suspense, createRef, type ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from './ui/Button';
import { t } from '../utils/localization';

type PageLoader = () => Promise<{ default: ComponentType }>;

// Pages whose code has arrived, kept for the life of the tab. A page is shown the moment its code is here:
// at once when it was opened before, and otherwise as soon as the import settles. The page's code is not
// handed to React.lazy and Suspense, because React holds a Suspense fallback on screen for 300 ms once it
// has been shown, however quickly the code arrives, and that was paid on every single navigation.
const arrived = new Map<PageLoader, ComponentType>();

type BoundaryProps = { load: PageLoader; navigationKey: string };
type BoundaryState = { page: ComponentType | null; failure: 'load' | 'render' | null };

class PageBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { page: arrived.get(this.props.load) ?? null, failure: null };
  private heading = createRef<HTMLHeadingElement>();
  // Only the latest request of a mounted boundary may change what is shown.
  private request = 0;

  static getDerivedStateFromError(): Partial<BoundaryState> { return { failure: 'render' }; }

  componentDidMount() { if (!this.state.page) this.fetchPage(); }

  componentWillUnmount() { this.request++; }

  componentDidUpdate(previous: BoundaryProps, before: BoundaryState) {
    if (this.state.failure && !before.failure) this.heading.current?.focus();
    if (this.state.failure && previous.navigationKey !== this.props.navigationKey) this.retry();
  }

  private fetchPage() {
    const request = ++this.request, load = this.props.load;
    load().then(module => {
      arrived.set(load, module.default);
      if (request === this.request) this.setState({ page: module.default, failure: null });
    }, () => { if (request === this.request) this.setState({ failure: 'load' }); });
  }

  // A failed import is asked for again; a page that failed while rendering is mounted afresh.
  private retry = () => this.setState({ failure: null }, () => { if (!this.state.page) this.fetchPage(); });

  render() {
    if (this.state.failure) return (
      <section role="alert" className="mx-auto max-w-xl space-y-4 rounded-xl border border-muji-border bg-white p-6">
        <h1 ref={this.heading} tabIndex={-1} className="text-xl font-semibold">{t('route.unavailable')}</h1>
        <p>{this.state.failure === 'load' ? t('route.loadFailed') : t('route.renderFailed')}</p>
        <p className="text-sm text-muji-secondary">{t('route.recoveryHint')}</p>
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-11" onClick={this.retry}>{t('route.retry')}</Button>
          <Button className="min-h-11" variant="outline" onClick={() => window.location.reload()}>{t('route.reload')}</Button>
          <Link className="inline-flex min-h-11 items-center rounded-md px-4 underline" to="/">{t('route.home')}</Link>
        </div>
      </section>
    );
    const Page = this.state.page, waiting = <p role="status" className="late-reveal py-6">{t('route.loading')}</p>;
    // The boundary below is only for a page that itself waits for something while rendering.
    return Page ? <Suspense fallback={waiting}><Page /></Suspense> : waiting;
  }
}

// Call once at module scope. Router/Auth/Layout stay mounted outside the boundary.
export function createLazyPage(load: PageLoader) {
  return function LazyPage() {
    const location = useLocation();
    return <PageBoundary load={load} navigationKey={location.key} />;
  };
}
