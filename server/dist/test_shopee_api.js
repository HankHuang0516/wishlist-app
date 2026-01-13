"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Native fetch is available in Node 18+
const SHOP_ID = '272447805';
const ITEM_ID = '7843986428';
const API_URL = `https://shopee.tw/api/v4/item/get?itemid=${ITEM_ID}&shopid=${SHOP_ID}`;
function testShopeeApi() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`Fetching ${API_URL}...`);
            const response = yield fetch(API_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://shopee.tw/product/272447805/7843986428', // Important referer
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Shopee-Language': 'zh-Hant'
                }
            });
            if (!response.ok) {
                console.error('Error Status:', response.status);
                console.error('Error Text:', yield response.text());
                return;
            }
            const data = yield response.json();
            // Shopee API returns { data: { ... } } or sometimes { error: ... }
            if (data.data) {
                console.log('✅ Success!');
                console.log('Name:', data.data.name);
                console.log('Price:', data.data.price / 100000); // Usually 100000 divisor
                console.log('Image:', `https://down-ws-tw.img.susercontent.com/${data.data.image}`);
            }
            else {
                console.log('❌ Failed to get data:', JSON.stringify(data, null, 2));
            }
        }
        catch (error) {
            console.error('Exception:', error);
        }
    });
}
testShopeeApi();
