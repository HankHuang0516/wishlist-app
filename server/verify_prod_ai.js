// const API_URL = 'https://wishlist-app-production.up.railway.app/api';
// const API_URL = 'https://wishlist-app-production.up.railway.app/api';
const API_URL = 'http://127.0.0.1:8000/api'; // Use for local testing

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    try {
        console.log(`Targeting: ${API_URL}`);

        // 1. Register
        const phone = `09${Math.floor(10000000 + Math.random() * 90000000)}`; // 8 random digits, total 10
        console.log(`1. Registering user ${phone}...`);
        let res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone, password: 'Password123', name: 'AI Limit Test' })
        });

        if (!res.ok) throw new Error(`Register failed: ${res.status}`);
        let json = await res.json();

        // 2. Login
        console.log("2. Logging in...");
        res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone, password: 'Password123' })
        });
        if (!res.ok) throw new Error(`Login failed: ${res.status}`);
        json = await res.json();
        const token = json.token;
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

        // 3. Create Wishlist
        console.log("3. Creating Wishlist...");
        res = await fetch(`${API_URL}/wishlists`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: 'AI Test List', description: 'Testing Limits' })
        });
        if (!res.ok) throw new Error(`Create Wishlist failed: ${res.status}`);
        const wishlist = await res.json();
        console.log(`Wishlist ID: ${wishlist.id}`);

        // 4. Test 6 Items
        console.log("4. Testing AI Limits (Creating 6 items)...");

        for (let i = 1; i <= 6; i++) {
            console.log(`   Creating Item ${i}...`);
            const itemRes = await fetch(`${API_URL}/wishlists/${wishlist.id}/items/url`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ url: `Test Product ${i} - Sony Headphones` })
            });

            if (!itemRes.ok) {
                console.error(`   Failed to create item ${i}: ${itemRes.status}`);
                continue;
            }

            const item = await itemRes.json();
            console.log(`   Item ${i} created (ID: ${item.id}). Waiting for AI...`);

            // Wait for processing
            await sleep(3000);

            // Check Item Status
            const checkRes = await fetch(`${API_URL}/items/${item.id}`, { headers });
            const checkItem = await checkRes.json();
            console.log(`   Item ${i} Status: AI=${checkItem.aiStatus}, Name=${checkItem.name}`);

            if (i <= 5) {
                if (checkItem.aiStatus === 'SKIPPED') console.error(`   ❌ ERROR: Item ${i} was SKIPPED but should be processed.`);
                else console.log(`   ✅ Item ${i} processed (Status: ${checkItem.aiStatus})`);
            } else {
                // Item 6
                if (checkItem.aiStatus === 'SKIPPED') console.log(`   ✅ Item ${i} correctly SKIPPED (Limit Reached). Note: ${checkItem.notes}`);
                else console.error(`   ❌ ERROR: Item ${i} was NOT skipped! Status: ${checkItem.aiStatus}`);
            }

            // Check Usage Count
            const usageRes = await fetch(`${API_URL}/users/me/ai-usage`, { headers });
            const usage = await usageRes.json();
            console.log(`   Current Usage: ${usage.used}/${usage.limit}`);
        }

    } catch (e) {
        console.error("FATAL ERROR:", e);
    }
}

run();
