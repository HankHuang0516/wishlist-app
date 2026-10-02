import {publicCommentPayload,publicCommentRoute,WISHLIST_PAGE_ID} from '../lib/sourcePublicComment';
const url='https://www.facebook.com/groups/123/posts/456';
const route={routeKind:'PUBLIC_COMMENT',channel:'FACEBOOK_UI',actingPageId:WISHLIST_PAGE_ID,publicRouteUrl:url};
test('only the unique Page and exact original post are eligible',()=>{expect(publicCommentRoute(route,url)).toBe(true);for(const patch of [{actingPageId:'personal'},{publicRouteUrl:url+'7'},{routeKind:'DM'},{channel:'EMAIL'}])expect(publicCommentRoute({...route,...patch},url)).toBe(false)});
test('public output never takes buyer text or personal details',()=>{const p=publicCommentPayload({...route,buyerName:'私人姓名',buyerPhone:'0912345678'},url);expect(p.text).toBe('您好，請問這件商品目前仍在售嗎？售價及取貨方式為何？謝謝，Wishlist.AI。');expect(JSON.stringify(p)).not.toMatch(/私人姓名|0912345678/);expect(p.buyerTextIncluded).toBe(false)});
test('profile, query and other post routes are refused',()=>{for(const u of ['https://www.facebook.com/person',url+'?id=1','https://evil.example/groups/123/posts/456'])expect(publicCommentRoute({...route,publicRouteUrl:u},u)).toBe(false)});
