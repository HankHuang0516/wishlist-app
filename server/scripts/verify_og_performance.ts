
import { fetchOpenGraphData } from '../src/lib/openGraphScraper';

const testUrls = [
    { name: 'Momo Shop (Standard)', url: 'https://m.momoshop.com.tw/goods.momo?i_code=12345678' }, // Mock or Real URL needed
    { name: 'PChome 24h', url: 'https://24h.pchome.com.tw/prod/DYAJ93-A900GZ1W8' }, // Example
    { name: 'Blog Article', url: 'https://dev.to/example' },
    { name: 'Invalid URL', url: 'https://invalid-url-example.com/foo' }
];

// Use a real PChome product for testing if possible, or generic known sites
const REAL_TEST_URLS = [
    "https://www.apple.com/tw/iphone-16-pro/",
    "https://www.ikea.com.tw/zh/products/sofas/fabric-sofas/friheten-spr-09193669"
];

async function runTest() {
    console.log("🚀 Starting Open Graph Performance Test...\n");
    console.log("---------------------------------------------------");

    for (const url of REAL_TEST_URLS) {
        console.log(`\nTesting: ${url}`);
        const start = Date.now();
        const data = await fetchOpenGraphData(url);
        const duration = Date.now() - start;

        console.log(`⏱️ Time: ${duration}ms`);
        console.log(`✅ Success: ${data.success}`);
        if (data.success) {
            console.log(`   - Title: ${data.title?.substring(0, 50)}...`);
            console.log(`   - Image: ${data.image ? 'Yes' : 'No'}`);
            console.log(`   - Site:  ${data.site_name}`);
        } else {
            console.log(`   ❌ Failed to extract meaningful data`);
        }

        if (duration > 3000) console.warn("   ⚠️ WARNING: Fetch took longer than 3s");
    }

    console.log("\n---------------------------------------------------");
    console.log("Test Complete.");
}

runTest();
