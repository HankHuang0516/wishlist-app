
import dotenv from 'dotenv';
import path from 'path';
import { analyzeProductText } from './controllers/aiController';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const debugMomo = async () => {
    const url = "https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558&osm=Ad07";
    // SIMPLIFIED QUERY: Natural language instead of "site:" operator
    const suggestedQuery = "momoshop product 14244558";

    console.log("Debugging Momo AI Processing (Natural Query)...");
    console.log("Input URL:", url);
    console.log("Suggested Query:", suggestedQuery);

    try {
        const result = await analyzeProductText(url, 'traditional chinese', null, suggestedQuery);
        console.log("\n✅ Extracted Name:", result.name);
        console.log("✅ Extracted Image:", result.imageUrl);
    } catch (error) {
        console.error("\n❌ Error:", error);
    }
};

debugMomo();
