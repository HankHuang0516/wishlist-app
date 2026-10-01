import { Component, type ReactNode } from 'react';

/** A graphics failure must not take the account, search or accessible list down. */
export default class MapFallbackBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? this.props.fallback ?? <p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-900">互動地圖暫時無法使用，請切換「商品列表」繼續搜尋與閱覽。</p> : this.props.children;
  }
}
