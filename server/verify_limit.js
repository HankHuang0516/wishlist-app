// No import needed for fetch in Node 18+
const API_URL = 'http://localhost:8000/api';

async function run() {
    try {
        console.log("1. Register...");
        const phone = `09${Math.floor(Math.random() * 1000000000)}`;
        let res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone, password: 'password', name: 'Limit Test' })
        });

        let json = await res.json();
        // Login
        res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phone, password: 'password' })
        });
        json = await res.json();
        const token = json.token;
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

        console.log("2. Create Wishlist...");
        res = await fetch(`${API_URL}/wishlists`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: 'List 1', description: 'Test' })
        });
        const list1 = await res.json();
        console.log(`List 1 Initial Max: ${list1.maxItems}`); // Should be 100

        console.log("3. Expand Limit (Global)...");
        res = await fetch(`${API_URL}/users/me/subscription`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'limit' })
        });
        const subRes = await res.json();
        console.log("Expand Result:", subRes);

        console.log("4. Verify Global Limit (User)...");
        res = await fetch(`${API_URL}/users/me`, { headers });
        const user = await res.json();
        console.log(`User MaxWishlistItems: ${user.maxWishlistItems}`); // Should be 110

        console.log("5. Verify Existing List 1...");
        res = await fetch(`${API_URL}/wishlists/${list1.id}`, { headers });
        const updatedList1 = await res.json();
        console.log(`List 1 Updated Max: ${updatedList1.maxItems}`); // Should be 110

        console.log("6. Create New List 2...");
        res = await fetch(`${API_URL}/wishlists`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: 'List 2', description: 'New' })
        });
        const list2 = await res.json();
        console.log(`List 2 Initial Max: ${list2.maxItems}`); // Should be 110

        console.log("7. Verify Following Limit Expansion...");
        console.log(`Initial MaxFollowing: ${user.maxFollowing}`); // Should be 100

        res = await fetch(`${API_URL}/users/me/subscription`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ type: 'limit', target: 'following' })
        });
        const followRes = await res.json();
        console.log("Following Expand Result:", followRes);

        res = await fetch(`${API_URL}/users/me`, { headers });
        const updatedUser = await res.json();
        console.log(`Updated MaxFollowing: ${updatedUser.maxFollowing}`); // Should be 110

        if (updatedUser.maxFollowing > 100) {
            console.log("SUCCESS: Following Limit Increased.");
        } else {
            console.error("FAILURE: Following Limit did not increase.");
        }

    } catch (e) {
        console.error(e);
    }
}

run();
