// Public comments never contain buyer-provided text or account details.
export const WISHLIST_PAGE_ID = '61595150241978';
export function publicCommentRoute(route: any, sourceUrl: string): boolean {
 if (route?.routeKind !== 'PUBLIC_COMMENT' || route.channel !== 'FACEBOOK_UI' || route.actingPageId !== WISHLIST_PAGE_ID || route.publicRouteUrl !== sourceUrl) return false;
 try { const u=new URL(sourceUrl); return u.hostname==='www.facebook.com' && !u.search && !u.hash && /^\/groups\/\d+\/posts\/\d+\/?$/.test(u.pathname); } catch { return false; }
}
// The item name is our own reviewed title (never buyer text), so a multi-item post knows which item is asked about.
export function publicCommentText(title: unknown) {
 const name = typeof title === 'string' ? title.replace(/^來源線索：/, '').replace(/[\u0000-\u001f\u007f「」]/g, '').trim().slice(0, 80) : '';
 return '您好，請問' + (name ? '「' + name + '」' : '這件商品') + '目前仍在售嗎？售價及取貨方式為何？謝謝。';
}
export function publicCommentPayload(route: any, sourceUrl: string, title?: unknown) {
 if (!publicCommentRoute(route,sourceUrl)) throw new Error('BOUND_PUBLIC_COMMENT_ROUTE_REQUIRED');
 return {actingPageId:WISHLIST_PAGE_ID,postUrl:sourceUrl,text:publicCommentText(title),buyerTextIncluded:false,requiresNormalUiAndReadback:true};
}
