// Public comments never contain buyer-provided text or account details.
export const WISHLIST_PAGE_ID = '61595150241978';
export const RELAY_PAGE_ID = '100053445261716';
export const RELAY_PAGE_NAME = '兩隻小豬';
export const relayIdentity = () => ({ actingPageId: RELAY_PAGE_ID, actingPageName: RELAY_PAGE_NAME, profileUrl: 'https://www.facebook.com/twopiggyhavefun/', channel: 'FACEBOOK_UI', routeKind: 'PUBLIC_COMMENT', requiresNormalUiAndReadback: true });
// Recognize the former identity only to retain already recorded route/receipt history.
export function publicCommentRoute(route: any, sourceUrl: string): boolean {
 if (route?.routeKind !== 'PUBLIC_COMMENT' || route.channel !== 'FACEBOOK_UI' || ![RELAY_PAGE_ID, WISHLIST_PAGE_ID].includes(route.actingPageId) || route.publicRouteUrl !== sourceUrl) return false;
 try { const u=new URL(sourceUrl); return u.protocol==='https:' && !u.username && !u.password && !u.port && u.hostname==='www.facebook.com' && !u.search && !u.hash && /^\/groups\/\d+\/posts\/\d+\/?$/.test(u.pathname); } catch { return false; }
}
export const activePublicCommentRoute = (route: any, sourceUrl: string) => publicCommentRoute(route, sourceUrl) && route.actingPageId === RELAY_PAGE_ID;
// The item name is our own reviewed title (never buyer text), so a multi-item post knows which item is asked about.
export function publicCommentText(title: unknown) {
 const name = typeof title === 'string' ? title.replace(/^來源線索：/, '').replace(/[\u0000-\u001f\u007f「」]/g, '').trim().slice(0, 80) : '';
 return '您好，請問' + (name ? '「' + name + '」' : '這件商品') + '目前仍在售嗎？售價及取貨方式為何？謝謝。';
}
export function publicCommentPayload(route: any, sourceUrl: string, title?: unknown) {
 if (!activePublicCommentRoute(route,sourceUrl)) throw new Error('BOUND_ACTIVE_PUBLIC_COMMENT_ROUTE_REQUIRED');
 return {...relayIdentity(),postUrl:sourceUrl,text:publicCommentText(title),buyerTextIncluded:false};
}
