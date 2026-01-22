const axios = require('axios');
const jwt = require('jsonwebtoken');

// BASE_URL for Production (as requested)
const BASE_URL = 'https://wishlist-app-production.up.railway.app/api';
// const BASE_URL = 'http://localhost:8000/api';

// Log to user-requested verify directory
const LOG_FILE = 'server/verify/naive_audit_log.txt';
const fs = require('fs');

// Ensure directory exists
if (!fs.existsSync('server/verify')) {
    fs.mkdirSync('server/verify', { recursive: true });
}
if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
}
fs.writeFileSync(LOG_FILE, `--- NAIVE AGENT SIMULATION START [${new Date().toISOString()}] ---\n`);

function log(message, data = null) {
    const timestamp = new Date().toISOString();
    let logStr = `\n[${timestamp}] ${message}`;
    if (data) {
        if (typeof data === 'object') {
            logStr += `\n${JSON.stringify(data, null, 2)}`;
        } else {
            logStr += ` ${data}`;
        }
    }
    console.log(logStr);
    fs.appendFileSync(LOG_FILE, logStr + '\n');
}

// Generate God Token (to simulate being logged in without relying on Register/Login limits)
// NOTE: This only works locally unless we know the prod secret.
// For Prod, we must validly register/login.
const GOD_TOKEN = jwt.sign(
    { id: 1, email: 'admin@audit.com' },
    'secret_key_default',
    { expiresIn: '1h' }
);

async function naiveRequest(method, endpoint, data = null, headers = {}) {
    log(`➡️  Testing ${method} ${endpoint}...`);
    try {
        const config = { method, url: `${BASE_URL}${endpoint}`, headers };
        if (data) config.data = data;

        const response = await axios(config);
        log(`   ✅ Status: ${response.status} (Unexpected Success?)`);
        log(`   Response:`, response.data);
        return { status: response.status, data: response.data };
    } catch (error) {
        if (error.response) {
            log(`   ❌ Status: ${error.response.status}`);
            log(`   Error Body:`, error.response.data);

            // Analyze Quality of Error Message
            const body = error.response.data;
            if (typeof body === 'string' && body.startsWith('<')) {
                log(`   ⚠️  WARNING: HTML Error Response Detected! (Should be JSON)`);
            } else if (!body.errorCode) {
                log(`   ⚠️  WARNING: Missing 'errorCode' field in JSON response.`);
            } else { // Verified Good Error
                log(`   ✨ Good Error Format: ${body.errorCode}`);
            }

            return { status: error.response.status, data: error.response.data };
        } else {
            log(`   🔥 Network/System Error: ${error.message}`);
            return { error: error.message };
        }
    }
}

async function runSimulation() {
    log('--- PHASE 1: AUTH CONFUSION (Test Errors) ---');

    // 1. Register with Missing Password
    await naiveRequest('POST', '/auth/register', {
        email: 'naive_agent@test.com',
        phoneNumber: '0900000000'
        // Missing password
    });

    // 2. Login with Wrong Credentials
    await naiveRequest('POST', '/auth/login', {
        phoneNumber: '0900000000',
        password: 'wrong_password'
    });

    log('\n--- PHASE 1.5: REAL AUTH (Get Valid Token) ---');
    // Create random user to get valid token for Prod testing
    const randomSuffix = Math.floor(Math.random() * 100000);
    const testUser = {
        name: `Naive Tester ${randomSuffix}`,
        email: `naive${randomSuffix}@test.com`,
        phoneNumber: `09${randomSuffix.toString().padStart(8, '0')}`,
        password: 'Password123!',
        birthday: '1990-01-01'
    };

    log(`   Attempting to create/login user: ${testUser.phoneNumber}`);
    // Register
    const regRes = await naiveRequest('POST', '/auth/register', testUser);

    let token = '';
    if (regRes.status === 201 && regRes.data && regRes.data.token) {
        token = regRes.data.token;
        log('   ✅ Got Valid Token via Register');
    } else {
        log('   ℹ️ Register failed (maybe exists), trying login...');
        // Try login
        const loginRes = await naiveRequest('POST', '/auth/login', {
            phoneNumber: testUser.phoneNumber,
            password: testUser.password
        });
        if (loginRes.data && loginRes.data.token) {
            token = loginRes.data.token;
            log('   ✅ Got Valid Token via Login');
        } else {
            log('   ❌ FAILED TO GET TOKEN. Cannot proceed with Authenticated Tests.');
            return; // Abort
        }
    }

    log('\n--- PHASE 2: API KEY & HEADERS ---');

    // 3. Get API Key using Valid Token
    const apiKeyRes = await naiveRequest('POST', '/users/me/apikey', {}, {
        'Authorization': `Bearer ${token}`
    });

    let apiKeyHeader = {};
    if (apiKeyRes.data && apiKeyRes.data.apiKey) {
        log(`   🔑 Obtained API Key: ${apiKeyRes.data.apiKey}`);
        apiKeyHeader = { 'x-api-key': apiKeyRes.data.apiKey };
    } else {
        log('   ⚠️ Failed to get API Key, falling back to Bearer Token.');
        apiKeyHeader = { 'Authorization': `Bearer ${token}` };
    }

    log('\n--- PHASE 3: WISHLIST CHAOS ---');

    // 4. Create Wishlist - Empty Body
    await naiveRequest('POST', '/wishlists', {}, apiKeyHeader);

    // 5. Create Wishlist - Null Title
    // EXPECT: 400 + MISSING_FIELDS
    await naiveRequest('POST', '/wishlists', { title: null }, apiKeyHeader);

    // 6. Valid Wishlist Create (to get ID for items)
    const wlRes = await naiveRequest('POST', '/wishlists', { title: 'Naive Agent List' }, apiKeyHeader);
    const wishlistId = wlRes.data ? wlRes.data.id : null;

    if (wishlistId) {
        log(`   ✅ Created Target Wishlist ID: ${wishlistId}`);

        log('\n--- PHASE 4: ITEM TYPING ERRORS ---');

        // 8. Add Item - Price as String "expensive"
        await naiveRequest('POST', `/wishlists/${wishlistId}/items`, {
            name: 'Expensive Item',
            price: 'expensive'
        }, apiKeyHeader);

        // 9. Add Item - Missing Name
        await naiveRequest('POST', `/wishlists/${wishlistId}/items`, {
            price: 100
        }, apiKeyHeader);

        // 10. Add Item URL - Not a URL
        await naiveRequest('POST', `/wishlists/${wishlistId}/items/url`, {
            url: 'not-a-valid-url'
        }, apiKeyHeader);

    } else {
        log('   ⚠️ Skipping Item tests due to missing Wishlist ID');
    }

    log('\n--- PHASE 5: PAYMENT FAILURES ---');

    // 11. Payment - Missing Prime
    await naiveRequest('POST', '/payment/pay', {
        details: { amount: 100 }
    }, apiKeyHeader);



    // --- PHASE 5.5: UPDATES & DELETES (Expanded Coverage) ---
    log('\n--- PHASE 5.5: UPDATES & DELETES ---');

    // 5.1 Update User Profile
    log('   ➡️  Testing PUT /users/me...');
    await naiveRequest('PUT', '/users/me', {
        name: 'Updated Naive Agent',
        // Naive 1: Send 'birthday' in wrong format
        birthday: 'not-a-date'
    }, apiKeyHeader);

    // 5.2 Update Wishlist
    if (wishlistId) {
        log(`   ➡️  Testing PUT /wishlists/${wishlistId}...`);
        await naiveRequest('PUT', `/wishlists/${wishlistId}`, {
            title: 'Updated Naive List',
            description: 12345 // Naive 2: Description should be string
        }, apiKeyHeader);
    }

    // 5.3 Feedback Endpoint
    log('   ➡️  Testing POST /feedback...');
    await naiveRequest('POST', '/feedback', {
        message: 'This is a simulation test.',
        type: 'bug',
        extraField: 'should be ignored' // Naive 3: Extra fields
    }, apiKeyHeader);

    // 5.4 Delete Items & Wishlist
    if (wishlistId) {
        // Create a temp item to delete
        const itemRes = await naiveRequest('POST', `/wishlists/${wishlistId}/items`, {
            name: 'Item to Delete',
            price: 5
        }, apiKeyHeader);

        if (itemRes.data && itemRes.data.id) {
            const itemId = itemRes.data.id;
            log(`   ➡️  Testing DELETE /items/${itemId}...`);
            await naiveRequest('DELETE', `/items/${itemId}`, null, apiKeyHeader);

            // Verify Deletion (Should be 404 or null)
            // Note: API might not have GET /items/:id, check swagger.
            // Usually we check by listing wishlist items.
        }

        log(`   ➡️  Testing DELETE /wishlists/${wishlistId}...`);
        await naiveRequest('DELETE', `/wishlists/${wishlistId}`, null, apiKeyHeader);

        // Naive 4: Delete already deleted wishlist
        log('   ➡️  Testing DELETE (Again)...');
        await naiveRequest('DELETE', `/wishlists/${wishlistId}`, null, apiKeyHeader);
    }

    log('\n--- PHASE 6: ACCESS CONTROL ---');
    // Try to access non-existent wishlist
    await naiveRequest('GET', '/wishlists/999999', null, apiKeyHeader);

    // --- PHASE 7: EXTRA ITEM ACTIONS ---
    log('\n--- PHASE 7: EXTRA ITEM ACTIONS ---');
    if (wishlistId) {
        // Create a temp item to interact with
        const itemRes = await naiveRequest('POST', `/wishlists/${wishlistId}/items`, {
            name: 'Item to Clone/Watch',
            price: 10
        }, apiKeyHeader);

        if (itemRes.data && itemRes.data.id) {
            const itemId = itemRes.data.id;

            // 7.1 Get Item (Public)
            log(`   ➡️  Testing GET /items/${itemId}...`);
            await naiveRequest('GET', `/items/${itemId}`, null, apiKeyHeader);

            // 7.2 Watch Item
            log(`   ➡️  Testing POST /items/${itemId}/watch...`);
            await naiveRequest('POST', `/items/${itemId}/watch`, {}, apiKeyHeader);

            // 7.3 Clone Item (Back to same wishlist for simplicity, or fail)
            // Note: Clone usually requires a target, or defaults to first.
            // Let's try to clone without body to see default behavior or error
            log(`   ➡️  Testing POST /items/${itemId}/clone...`);
            await naiveRequest('POST', `/items/${itemId}/clone`, {}, apiKeyHeader);

            // Cleanup
            await naiveRequest('DELETE', `/items/${itemId}`, null, apiKeyHeader);
        }
    }

    log('\n--- PHASE 8: ADVANCED FUZZING & STRESS ---');

    // 8.1 Path Parameter Fuzzing
    log('   ➡️  Testing GET /wishlists/not-a-number...');
    await naiveRequest('GET', '/wishlists/not-a-number', null, apiKeyHeader);

    log('   ➡️  Testing GET /items/abc-def...');
    await naiveRequest('GET', '/items/abc-def', null, apiKeyHeader);

    // 8.2 Large Payload Testing
    log('   ➡️  Testing POST /wishlists with 100KB payload...');
    const largeTitle = 'A'.repeat(100000);
    await naiveRequest('POST', '/wishlists', { title: largeTitle }, apiKeyHeader);

    // 8.3 User Profile Boundary Cases
    log('   ➡️  Testing PUT /users/me (Extreme Data)...');
    await naiveRequest('PUT', '/users/me', {
        name: 'N'.repeat(100), // Should trigger validation
        nicknames: ['1', '2', '3', '4', '5', '6'], // Too many
        email: 'not-an-email' // Invalid format
    }, apiKeyHeader);

    // 8.4 Social Endpoints (New Coverage)
    log('   ➡️  Testing POST /users/999999/follow...');
    await naiveRequest('POST', '/users/999999/follow', {}, apiKeyHeader);

    log('   ➡️  Testing DELETE /users/invalid-id/follow...');
    await naiveRequest('DELETE', '/users/invalid-id/follow', null, apiKeyHeader);

    log('   ➡️  Testing GET /users/999999/delivery-info...');
    await naiveRequest('GET', '/users/999999/delivery-info', null, apiKeyHeader);

    // 8.5 Malformed JSON Stress (using raw axios to send garbage)
    log('   ➡️  Testing POST /auth/login with Garbage String...');
    try {
        const res = await axios.post(`${BASE_URL}/auth/login`, "THIS IS NOT JSON", {
            headers: { 'Content-Type': 'application/json' }
        });
        log(`   ✅ Status: ${res.status}`);
    } catch (e) {
        if (e.response) {
            log(`   ❌ Status: ${e.response.status}`);
            log(`   Error:`, e.response.data);
        } else {
            log(`   🔥 Error: ${e.message}`);
        }
    }

    log('\n--- SIMULATION COMPLETE ---');
}

runSimulation();
