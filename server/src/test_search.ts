
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function test() {
    console.log("Testing Google CSE directly...");

    const cseId = process.env.GOOGLE_CSE_ID;
    const apiKey = process.env.GOOGLE_API_KEY;

    console.log("CSE ID:", cseId);
    console.log("API Key:", apiKey?.substring(0, 10) + "...");

    if (!cseId || !apiKey) {
        console.error("Missing API keys!");
        return;
    }

    // Test multiple queries
    const queries = [
        'Nintendo Switch',
        'momo購物網',
        'iPhone 15'
    ];

    for (const query of queries) {
        const url = `https://customsearch.googleapis.com/customsearch/v1?cx=${cseId}&key=${apiKey}&q=${encodeURIComponent(query)}&num=1&safe=active`;
        console.log(`\n--- Testing query: "${query}" ---`);

        try {
            const res = await axios.get(url);
            console.log("Total results:", res.data.searchInformation?.totalResults);
            if (res.data.items && res.data.items.length > 0) {
                console.log("First result:", res.data.items[0].title);
            }
        } catch (e: any) {
            console.error("Error:", e.response?.data?.error?.message || e.message);
        }
    }
}

test();
