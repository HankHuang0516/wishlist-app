import { Component, Suspense, lazy, createRef, type ComponentType, type LazyExoticComponent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from './ui/Button';
import { t } from '../utils/localization';

type PageLoader = () => Promise<{ default: ComponentType }>;
class PageLoadError extends Error {}

function loadPage(load: PageLoader) {
  return lazy(async () => {
    try { return await load(); }
    catch { throw new PageLoadError('Page resources unavailable'); }
  });
}

type BoundaryProps = { load: PageLoader; navigationKey: string };
type BoundaryState = { page: LazyExoticComponent<ComponentType>; failure: 'load' | 'render' | null };

class PageBoundary extends Component<BoundaryProps, BoundaryState> {
  // Keep the lazy identity stable through form edits and parent rerenders.
  // A rejected React.lazy promise needs a fresh identity on explicit retry.
  state: BoundaryState = { page: loadPage(this.props.load), failure: null };
  private heading = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { failure: error instanceof PageLoadError ? 'load' : 'render' };
  }

  componentDidCatch() { this.heading.current?.focus(); }

  componentDidUpdate(previous: BoundaryProps) {
    if (this.state.failure && previous.navigationKey !== this.props.navigationKey) this.retry();
  }

  private retry = () => this.setState({ page: loadPage(this.props.load), failure: null });

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
    const Page = this.state.page;
    return <Suspense fallback={<p role="status" className="py-6">{t('route.loading')}</p>}><Page /></Suspense>;
  }
}

// Call once at module scope. Router/Auth/Layout stay mounted outside the boundary.
export function createLazyPage(load: PageLoader) {
  return function LazyPage() {
    const location = useLocation();
    return <PageBoundary load={load} navigationKey={location.key} />;
  };
}
