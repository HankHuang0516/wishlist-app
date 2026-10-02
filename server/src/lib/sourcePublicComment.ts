// Public comments never contain buyer-provided text or account details.
export const WISHLIST_PAGE_ID = '61595150241978';
export function publicCommentRoute(route: any, sourceUrl: string): boolean {
 if (route?.routeKind !== 'PUBLIC_COMMENT' || route.channel !== 'FACEBOOK_UI' || route.actingPageId !== WISHLIST_PAGE_ID || route.publicRouteUrl !== sourceUrl) return false;
 try { const u=new URL(sourceUrl); return u.hostname==='www.facebook.com' && !u.search && !u.hash && /^\/groups\/\d+\/posts\/\d+\/?$/.test(u.pathname); } catch { return false; }
}
export function publicCommentPayload(route: any, sourceUrl: string) {
 if (!publicCommentRoute(route,sourceUrl)) throw new Error('BOUND_PUBLIC_COMMENT_ROUTE_REQUIRED');
 return {actingPageId:WISHLIST_PAGE_ID,postUrl:sourceUrl,text:'您好，請問這件商品目前仍在售嗎？售價及取貨方式為何？謝謝，Wishlist.AI。',buyerTextIncluded:false,requiresNormalUiAndReadback:true};
}
