
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load .env for defaults (CSE ID)
dotenv.config({ path: path.join(__dirname, '../.env') });

const verifyCSE = async () => {
    // UPDATED Key from User (Key 1 - Unrestricted)
    const API_KEY = "AIzaSyAnpndAiH3ujMIoduTcC3dE6rq9IA2g8ng";
    // CSE ID from .env
    const CSE_ID = process.env.GOOGLE_CSE_ID;

    console.log("Testing Google Custom Search API...");
    console.log("API Key (Prefix):", API_KEY.substring(0, 10) + "...");
    console.log("CSE ID:", CSE_ID);

    if (!CSE_ID) {
        console.error("❌ Error: GOOGLE_CSE_ID is missing in .env");
        process.exit(1);
    }

    const query = "Nintendo Switch 2";
    const url = `https://customsearch.googleapis.com/customsearch/v1?cx=${CSE_ID}&key=${API_KEY}&q=${encodeURIComponent(query)}&searchType=image&num=1&safe=active`;

    try {
        console.log(`Searching for: "${query}"...`);
        const res = await axios.get(url);

        if (res.data.items && res.data.items.length > 0) {
            console.log("\n✅ Success! Found Image:");
            console.log("Title:", res.data.items[0].title);
            console.log("Link:", res.data.items[0].link);
            console.log("Mime:", res.data.items[0].mime);
        } else {
            console.log("\n⚠️ Response OK, but no items found.");
            console.log("Response data:", JSON.stringify(res.data, null, 2));
        }
    } catch (error: any) {
        console.error("\n❌ API Request Failed:");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error:", error.message);
        }
    }
};

verifyCSE();
