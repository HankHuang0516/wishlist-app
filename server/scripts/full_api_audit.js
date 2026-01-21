
const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'https://wishlist-app-production.up.railway.app/api';
const LOG_FILE = 'server/scripts/audit_log.txt';

// Utils
function log(msg, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${type}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

async function apiCall(method, endpoint, data = null, token = null, label = '') {
    log(`Testing ${label} [${method} ${endpoint}]...`);
    try {
        const config = {
            method,
            url: `${BASE_URL}${endpoint}`,
            headers: { 'Content-Type': 'application/json' },
            data
        };
        if (token) config.headers['Authorization'] = `Bearer ${token}`;

        const start = Date.now();
        const response = await axios(config);
        const duration = Date.now() - start;

        log(`  ✅ Status: ${response.status} (${duration}ms)`);
        log(`  Response: ${JSON.stringify(response.data)}`);
        return { success: true, data: response.data, status: response.status };

    } catch (error) {
        if (error.response) {
            log(`  ❌ Status: ${error.response.status}`);
            log(`  Error Body: ${JSON.stringify(error.response.data)}`);
            return { success: false, data: error.response.data, status: error.response.status };
        } else {
            log(`  ❌ Network/Client Error: ${error.message}`);
            return { success: false, error: error.message, status: 0 };
        }
    }
}

// Global State
let AUTH_TOKEN = null;
try {
    const tokenFile = fs.readFileSync('server/scripts/god_token.txt', 'utf8');
    // Extract token from "GOD_TOKEN: <token>" or just raw
    const match = tokenFile.match(/GOD_TOKEN:\s*(\S+)/);
    if (match) {
        AUTH_TOKEN = match[1];
        console.log('[SETUP] Loaded God Token from file.');
    } else {
        console.warn('[SETUP] God text found but format unknown, using raw?');
        AUTH_TOKEN = tokenFile.trim();
    }
} catch (e) {
    console.warn('[SETUP] No god_token.txt found, relying on auth flow.');
}

let API_KEY = null;
let USER_ID = null; // Will need to fetch /users/me to get ID if using god token
let WISHLIST_ID = null;
let ITEM_ID = null;

const TEST_EMAIL = `audit_agent_${Date.now()}@example.com`;
const TEST_PASSWORD = 'Password123!';

async function runAudit() {
    fs.writeFileSync(LOG_FILE, '--- API AUDIT START ---\n');

    // 0. Pre-check: If we have token, get user ID
    if (AUTH_TOKEN) {
        // We assume /users/me endpoint exists or similar? ai-guide mentioned it.
        // Let's try to verify token and get ID.
        // Calling /users/me (Not in swagger but likely exists based on logic?)
        // Swagger said /api/wishlists gets user wishlists.
        // Let's try a safe call.
    }

    // 1. Auth: Register & Login Logic
    log(`\n--- 1. AUTHENTICATION ---`);
    if (!AUTH_TOKEN) {
        log('Attempting Registration...');
        const reg = await apiCall('POST', '/auth/register', {
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            name: 'Audit Agent',
            phoneNumber: '09' + Math.random().toString().slice(2, 10)
        }, null, 'Register Valid User');

        if (reg.success) {
            AUTH_TOKEN = reg.data.token;
            USER_ID = reg.data.user.id;
            log(`Captured Token: ${AUTH_TOKEN ? 'YES' : 'NO'}`);
        } else {
            log('Registration failed. Attempting fallback login...', 'WARN');
            const FALLBACK_EMAIL = 'hankhuang0516+test@gmail.com';
            const FALLBACK_PASS = 'Password123!';

            const login = await apiCall('POST', '/auth/login', {
                phoneNumber: FALLBACK_EMAIL,
                password: FALLBACK_PASS
            }, null, 'Fallback Login');

            if (login.success) {
                AUTH_TOKEN = login.data.token;
                USER_ID = login.data.user.id;
                log(`Captured Token via Fallback: ${AUTH_TOKEN ? 'YES' : 'NO'}`);
            } else {
                log('CRITICAL: Fallback login failed. Aborting auth-dependent tests.', 'ERROR');
                return;
            }
        }
    } else {
        log('[INFO] Using pre-loaded AUTH_TOKEN (God Mode). Skipping Auth Steps.');
    }

    // 3. User: Generate API Key
    log(`\n--- 2. USER PROFILE ---`);
    const apiKeyStore = await apiCall('POST', '/users/me/apikey', {}, AUTH_TOKEN, 'Generate API Key');
    if (apiKeyStore.success) {
        API_KEY = apiKeyStore.data.apiKey;
        log(`Captured API Key: ${API_KEY}`);
    }

    // 4. Wishlists: Create
    log(`\n--- 3. WISHLISTS ---`);
    // 4a. Create Valid
    const wlCreate = await apiCall('POST', '/wishlists', {
        title: 'Audit Wishlist',
        description: 'Created by Automated Audit'
    }, AUTH_TOKEN, 'Create Wishlist');

    if (wlCreate.success) {
        WISHLIST_ID = wlCreate.data.id; // Assuming structure has id
        if (!WISHLIST_ID && wlCreate.data.wishlist) WISHLIST_ID = wlCreate.data.wishlist.id;
        log(`Captured Wishlist ID: ${WISHLIST_ID}`);
    }

    // 4b. Create Invalid (Missing Title)
    await apiCall('POST', '/wishlists', { description: 'Missing title' }, AUTH_TOKEN, 'Create Wishlist (Missing Title)');

    // 4c. Get All
    await apiCall('GET', '/wishlists', null, AUTH_TOKEN, 'List Wishlists');

    // 4d. Get One
    if (WISHLIST_ID) {
        await apiCall('GET', `/wishlists/${WISHLIST_ID}`, null, AUTH_TOKEN, 'Get Single Wishlist');
        await apiCall('GET', `/wishlists/999999`, null, AUTH_TOKEN, 'Get Non-existent Wishlist'); // Check 404 quality
    }

    // 5. Items
    log(`\n--- 4. ITEMS ---`);
    if (WISHLIST_ID) {
        // 5a. Manual Add (Valid)
        const itemAdd = await apiCall('POST', `/wishlists/${WISHLIST_ID}/items`, {
            name: 'Test Item',
            price: 100,
            url: 'https://example.com',
            note: 'Manual add'
            // Missing 'image' might trigger the error user found earlier?
        }, AUTH_TOKEN, 'Add Item (Manual)');

        // 5b. Manual Add (Missing Name)
        await apiCall('POST', `/wishlists/${WISHLIST_ID}/items`, {
            price: 500
        }, AUTH_TOKEN, 'Add Item (Missing Name)');

        // 5c. Crawler Add (PChome example) - Use a safe/fast URL or mock?
        // Using real PChome URL might trigger 429 or slow.
        // Let's use the 'url' endpoint with a dummy URL to see validation?
        await apiCall('POST', `/wishlists/${WISHLIST_ID}/items/url`, {
            url: 'invalid-url'
        }, AUTH_TOKEN, 'Add Item via URL (Invalid URL)');

        await apiCall('POST', `/wishlists/${WISHLIST_ID}/items/url`, {
            url: 'https://24h.pchome.com.tw/prod/DSAR0S-A900F7PCX' // Real URL
        }, AUTH_TOKEN, 'Add Item via URL (PChome)');
    }

    // 6. Payment (Dummy)
    log(`\n--- 5. PAYMENT ---`);
    await apiCall('POST', `/payment/pay`, {
        prime: 'test_prime_token',
        details: { amount: 100, orderId: 'test_order' },
        paymentMethod: 'credit_card'
    }, AUTH_TOKEN, 'Payment (Test)');

    log(`\n--- AUDIT COMPLETE ---`);
}

runAudit();
