import { analyticsDisabled, analyticsPath, type AnalyticsMessage } from '../lib/analyticsPrivacy';

let frame: HTMLIFrameElement | undefined, port: MessagePort | undefined;
let waiting: AnalyticsMessage[] = [];

function send(message: AnalyticsMessage) {
  if (typeof window === 'undefined' || analyticsDisabled()) {
    waiting = []; port?.close(); port = undefined; frame?.remove(); frame = undefined; return;
  }
  if (typeof MessageChannel === 'undefined') return;
  try {
    if (!frame?.isConnected) {
      frame = document.createElement('iframe');
      frame.title = 'Wishlist.ai usage analytics';
      frame.hidden = true;
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.referrerPolicy = 'no-referrer';
      frame.src = new URL('/analytics-frame.html', window.location.origin).href;
      const current = frame;
      frame.onload = () => {
        if (frame !== current || analyticsDisabled()) return;
        port?.close(); port = undefined;
        const channel = new MessageChannel();
        channel.port1.onmessage = event => {
          if (frame !== current || event.data !== 'ready' || analyticsDisabled()) return;
          port = channel.port1;
          for (const pending of waiting) port.postMessage(pending);
          waiting = [];
        };
        // Opaque sandbox origins require '*'; this private port is sent only to
        // this exact frame window, never a general window-message listener.
        current.contentWindow?.postMessage({ kind: 'wishlist-analytics-connect', version: 1 }, '*', [channel.port2]);
      };
      document.body.append(frame);
    }
    if (port) port.postMessage(message);
    else if (waiting.length < 20) waiting.push(message);
  } catch { /* Optional analytics must not disrupt any account/content action. */ }
}

export const Analytics = {
  logPageView: (pathname: string) => send({ event: 'page_view', path: analyticsPath(pathname) }),
  logLogin: (method: 'phone' | 'email') => { if (method === 'phone' || method === 'email') send({ event: 'login', method }); },
  logSignUp: (method: 'phone' | 'email') => { if (method === 'phone' || method === 'email') send({ event: 'sign_up', method }); },
  logShare: (contentType: 'wishlist' | 'item', _itemId?: string) => { if (contentType === 'wishlist' || contentType === 'item') send({ event: 'share', contentType }); },
  logAddToWishlist: (_currency: string, _value: number, items: { item_id: string; item_name: string }[]) => {
    if (Array.isArray(items)) send({ event: 'add_to_wishlist', count: Math.min(items.length, 100) });
  },
  logViewItemList: (_wishlistId: string, _wishlistName: string) => send({ event: 'view_item_list' }),
  // Preserve the legacy call surface without permitting arbitrary telemetry.
  logCustomEvent: (_eventName: string, _params?: Record<string, unknown>) => {},
};
