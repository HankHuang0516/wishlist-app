
import dotenv from 'dotenv';
import { searchGoogleWeb } from './controllers/aiController';

dotenv.config();

async function test() {
    console.log("Testing searchGoogleWeb...");
    const query = 'site:shopee.tw "272447805" "7843986428"';
    console.log("Query:", query);

    try {
        const result = await searchGoogleWeb(query);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
