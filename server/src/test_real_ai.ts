
import dotenv from 'dotenv';
import { analyzeProductText } from './controllers/aiController';

dotenv.config();

async function testRealAi() {
    console.log("Testing analyzeProductText with specific Shopee URL...");
    const url = "https://shopee.tw/product/272447805/7843986428?gads_t_sig=VTJGc2RHVmtYMTlxTFVSVVRrdENkV083Sk9aTHUvR0kxd1pwOWlVL0grVUl5Y216Y1hySFV0RlZ0aE5ZaXBhWTJTTk41L2FaRXN4VjBNVTFnNlQ2ZWs3STlYL3ZPWWVmRGxxS1dpMG1xYXVMbXpZTTJyZldyazFZRzM2NWl0OEQ";

    // Simulate what processUrlAi does: detects soft block, parses IDs, then calls processTextAi -> analyzeProductText
    // In processTextAi, it might pass searchContext if it used the OLD logic.
    // BUT with the NEW logic, analyzeProductText should do the searching itself if searchContext is null.

    // Let's test providing just the URL, forcing Gemini to use its tool.
    try {
        const start = Date.now();
        const result = await analyzeProductText(url, 'Traditional Chinese');
        const end = Date.now();

        console.log("Analysis Result:", JSON.stringify(result, null, 2));
        console.log(`Duration: ${(end - start) / 1000}s`);

        if (result.name && (result.name.includes("Mario") || result.name.includes("瑪利歐"))) {
            console.log("✅ SUCCESS: Found Mario!");
        } else {
            console.log("❌ FAILURE: Did not find Mario.");
        }
    } catch (e: any) {
        console.error("❌ ERROR:", e);
    }
}

testRealAi();
