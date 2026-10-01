import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let channels: Array<{ port1: { postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; onmessage?: (event: {data:unknown})=>void }; port2: object }>;
beforeEach(() => {
  vi.resetModules(); channels = []; document.body.innerHTML = '';
  vi.stubGlobal('MessageChannel', class {
    port1 = { postMessage:vi.fn(), close:vi.fn(), onmessage:undefined }; port2 = {};
    constructor() { channels.push(this); }
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

function connect() {
  const frame = document.querySelector('iframe')!;
  const handshake = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
  fireEvent.load(frame);
  channels[0].port1.onmessage!({data:'ready'});
  return {frame,handshake,port:channels[0].port1};
}
describe('private analytics transport', () => {
  it('creates one opaque, hidden, no-referrer frame and sends only route categories', async () => {
    const { Analytics } = await import('./analytics');
    Analytics.logPageView('/users/1234/profile');
    const {frame,handshake,port} = connect();
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.referrerPolicy).toBe('no-referrer');expect(frame.hidden).toBe(true);
    expect(frame.src).not.toMatch(/[?#]/);
    expect(handshake).toHaveBeenCalledWith({kind:'wishlist-analytics-connect',version:1},'*',[channels[0].port2]);
    expect(port.postMessage).toHaveBeenCalledWith({event:'page_view',path:'/users/user/profile'});
    Analytics.logPageView('/settings');expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });
  it('never queues or sends private list names, item URLs, identifiers, prices or arbitrary events', async () => {
    const { Analytics } = await import('./analytics');
    Analytics.logViewItemList('secret-id','private wish title');
    Analytics.logAddToWishlist('USD',999,[{item_id:'private-id',item_name:'https://shop.invalid/private?key=synthetic'}]);
    Analytics.logShare('wishlist','private-list-id');Analytics.logCustomEvent('private_custom',{email:'user@example.invalid'});
    const {port} = connect();
    expect(port.postMessage.mock.calls.map(call=>call[0])).toEqual([{event:'view_item_list'},{event:'add_to_wishlist',count:1},{event:'share',contentType:'wishlist'}]);
  });
  it('does not use a top-level gtag and tolerates missing transport support', async () => {
    const gtag = vi.fn();vi.stubGlobal('gtag',gtag);vi.stubGlobal('MessageChannel',undefined);
    const { Analytics } = await import('./analytics');Analytics.logLogin('email');
    expect(gtag).not.toHaveBeenCalled();expect(document.querySelector('iframe')).toBeNull();
  });
  it('bounds a blocked frame queue to 20 coarse events', async () => {
    const { Analytics } = await import('./analytics');
    for(let i=0;i<50;i++)Analytics.logPageView('/settings');
    const {port} = connect();expect(port.postMessage).toHaveBeenCalledTimes(20);
  });
  it('stops and removes the frame when a browser privacy signal becomes active', async () => {
    const { Analytics } = await import('./analytics');Analytics.logPageView('/settings');const {port} = connect();
    vi.stubGlobal('navigator',{globalPrivacyControl:true});Analytics.logLogin('email');
    expect(port.close).toHaveBeenCalled();expect(document.querySelector('iframe')).toBeNull();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });
});
