import {activePublicCommentRoute,publicCommentPayload,publicCommentRoute,relayIdentity,RELAY_PAGE_ID,RELAY_PAGE_NAME,WISHLIST_PAGE_ID} from '../lib/sourcePublicComment';
const url='https://www.facebook.com/groups/123/posts/456';
const route={routeKind:'PUBLIC_COMMENT',channel:'FACEBOOK_UI',actingPageId:RELAY_PAGE_ID,publicRouteUrl:url};
test('new comments require the selected Two Pigs identity and exact original post',()=>{
 expect(activePublicCommentRoute(route,url)).toBe(true);
 for(const patch of [{actingPageId:WISHLIST_PAGE_ID},{actingPageId:'personal'},{publicRouteUrl:url+'7'},{routeKind:'DM'},{channel:'EMAIL'}])expect(activePublicCommentRoute({...route,...patch},url)).toBe(false);
 expect(relayIdentity()).toMatchObject({actingPageId:'100053445261716',actingPageName:'兩隻小豬',requiresNormalUiAndReadback:true});
});
test('legacy Wishlist routes retain receipt history but cannot create a new send payload',()=>{
 const legacy={...route,actingPageId:WISHLIST_PAGE_ID};
 expect(publicCommentRoute(legacy,url)).toBe(true);expect(activePublicCommentRoute(legacy,url)).toBe(false);
 expect(()=>publicCommentPayload(legacy,url,'樹屋')).toThrow('BOUND_ACTIVE_PUBLIC_COMMENT_ROUTE_REQUIRED');
 expect(legacy.actingPageId).toBe(WISHLIST_PAGE_ID);
});
test('public output has server identity and fixed item text without buyer details',()=>{
 const p=publicCommentPayload({...route,buyerName:'私人姓名',buyerPhone:'0912345678'},url);
 expect(p.text).toBe('您好，請問這件商品目前仍在售嗎？售價及取貨方式為何？謝謝。');
 expect(p.actingPageId).toBe(RELAY_PAGE_ID);expect(p.actingPageName).toBe(RELAY_PAGE_NAME);
 expect(publicCommentPayload(route,url,'來源線索：環太平洋機器人公仔 6隻').text).toBe('您好，請問「環太平洋機器人公仔 6隻」目前仍在售嗎？售價及取貨方式為何？謝謝。');
 expect(publicCommentPayload(route,url,'A「B」\u0007').text).toBe('您好，請問「AB」目前仍在售嗎？售價及取貨方式為何？謝謝。');
 expect(JSON.stringify(p)).not.toMatch(/私人姓名|0912345678/);expect(p.buyerTextIncluded).toBe(false);
});
test('profile, query, userinfo, port, non-HTTPS and other post routes are refused',()=>{
 for(const u of ['https://www.facebook.com/person',url+'?id=1',url+'#id','https://evil.example/groups/123/posts/456','http://www.facebook.com/groups/123/posts/456','https://user@www.facebook.com/groups/123/posts/456','https://www.facebook.com:444/groups/123/posts/456'])expect(publicCommentRoute({...route,publicRouteUrl:u},u)).toBe(false);
});
