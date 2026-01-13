
// Native fetch is available in Node 18+
const SHOP_ID = '272447805';
const ITEM_ID = '7843986428';
const API_URL = `https://shopee.tw/api/v4/item/get?itemid=${ITEM_ID}&shopid=${SHOP_ID}`;

async function testShopeeApi() {
    try {
        console.log(`Fetching ${API_URL}...`);
        const response = await fetch(API_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://shopee.tw/product/272447805/7843986428', // Important referer
                'X-Requested-With': 'XMLHttpRequest',
                'X-Shopee-Language': 'zh-Hant'
            }
        });

        if (!response.ok) {
            console.error('Error Status:', response.status);
            console.error('Error Text:', await response.text());
            return;
        }

        const data = await response.json();
        // Shopee API returns { data: { ... } } or sometimes { error: ... }
        if (data.data) {
            console.log('✅ Success!');
            console.log('Name:', data.data.name);
            console.log('Price:', data.data.price / 100000); // Usually 100000 divisor
            console.log('Image:', `https://down-ws-tw.img.susercontent.com/${data.data.image}`);
        } else {
            console.log('❌ Failed to get data:', JSON.stringify(data, null, 2));
        }

    } catch (error) {
        console.error('Exception:', error);
    }
}

testShopeeApi();
