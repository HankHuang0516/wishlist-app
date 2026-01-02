
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeProductText } from '../server/src/controllers/aiController';

// Setup environment
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') });

const MOMO_URL = 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558&osm=Ad07&utm_source=googleshop&utm_medium=googleshop-pmax-all-mb-feed&utm_content=bn&gad_source=4&gad_campaignid=20882989196&gbraid=0AAAAADlbkmPPnBojAyxAjKjTOXb9ptOOu&gclid=Cj0KCQiA9t3KBhCQARIsAJOcR7xDqIKZEueQh5LO1HJr9qy039iILIP733Lg7NWxVunLmEM6RkmiPw8aAmJMEALw_wcB';

async function testMomoFallback() {
    console.log("---------------------------------------------------");
    console.log("🔍 Testing AI Fallback for Momo Shop URL");
    console.log("---------------------------------------------------");
    console.log(`URL: ${MOMO_URL.substring(0, 60)}...`);
    console.log("---------------------------------------------------");

    try {
        console.log("🚀 Invoking analyzeProductText(url)...");
        const startTime = Date.now();
        const result = await analyzeProductText(MOMO_URL);
        const duration = Date.now() - startTime;

        console.log(`\n✅ AI Analysis Completed in ${duration}ms\n`);
        console.log("📋 Result:");
        console.log(JSON.stringify(result, null, 2));

        if (result.name && (result.name.includes('Momo') || result.shoppingLink)) {
            console.log("\n✨ SUCCESS: Gemini successfully inferred details from the URL.");
        } else {
            console.log("\n⚠️  WARNING: Result might be generic.");
        }

    } catch (error) {
        console.error("\n❌ FAILED:", error);
    }
}

testMomoFallback();
