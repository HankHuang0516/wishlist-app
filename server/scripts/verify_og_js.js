
const axios = require('axios');
const cheerio = require('cheerio');

// Mock implementation of fetchOpenGraphData to test logic in isolation
const fetchOpenGraphData = async (url) => {
    try {
        console.log(`Fetching: ${url}`);
        const response = await axios.get(url, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            maxRedirects: 3
        });

        const html = response.data;
        const $ = cheerio.load(html);

        const getMeta = (property) => {
            return $(`meta[property="${property}"]`).attr('content') ||
                $(`meta[name="${property}"]`).attr('content') ||
                null;
        };

        const data = {
            title: getMeta('og:title') || $('title').text() || null,
            description: getMeta('og:description') || getMeta('description') || null,
            image: getMeta('og:image'),
            site_name: getMeta('og:site_name'),
            price: {
                amount: getMeta('product:price:amount') || getMeta('og:price:amount'),
                currency: getMeta('product:price:currency') || getMeta('og:price:currency')
            },
            success: true
        };

        if (!data.title && !data.image) {
            return { ...data, success: false };
        }
        return data;

    } catch (error) {
        console.warn(`Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
};

const REAL_TEST_URLS = [
    "https://www.apple.com/tw/iphone-16-pro/",
    "https://24h.pchome.com.tw/", // Homepage check
    "https://shopee.tw/search?keyword=iphone" // Search page check
];

async function runTest() {
    console.log("🚀 Starting Open Graph Performance Test (JS Mode)...\n");

    for (const url of REAL_TEST_URLS) {
        const start = Date.now();
        const data = await fetchOpenGraphData(url);
        const duration = Date.now() - start;

        console.log(`\nURL: ${url}`);
        console.log(`⏱️ Time: ${duration}ms`);
        console.log(`✅ Success: ${data.success}`);
        if (data.success) {
            console.log(`   Title: ${data.title ? data.title.substring(0, 50) + '...' : 'N/A'}`);
            console.log(`   Image: ${data.image ? 'Yes' : 'No'}`);
        }
    }
}

runTest();
