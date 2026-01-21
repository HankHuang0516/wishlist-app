
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://wishlist-app-production.up.railway.app';
const LOG_FILE = path.join(__dirname, 'agent_check.log');

// Utils
function log(step, message, status = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${step}] [${status}] ${message}`;
    console.log(logLine);
    fs.appendFileSync(LOG_FILE, logLine + '\n');
}

async function request(method, endpoint, data = null, headers = {}) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        const res = await fetch(`${BASE_URL}${endpoint}`, options);
        const contentType = res.headers.get('content-type');

        let responseData;
        if (contentType && contentType.includes('application/json')) {
            responseData = await res.json();
        } else {
            responseData = await res.text();
        }

        return {
            status: res.status,
            ok: res.ok,
            data: responseData
        };
    } catch (error) {
        return {
            status: 0,
            ok: false,
            error: error.message
        };
    }
}

// Simulation State
const state = {
    user: {
        phoneNumber: `09${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
        email: `agent_test_${Date.now()}@example.com`,
        password: 'Password123!',
        name: 'Naive Agent Tester',
        birthday: '1990-01-01'
    },
    token: null,
    apiKey: null,
    wishlistId: null,
    itemId: null
};

async function runSimulation() {
    log('INIT', 'Starting Naive Agent Simulation...');
    log('INIT', `Target Base URL: ${BASE_URL}`);

    // --- Step 1: Discover API ---
    log('STEP 1', 'Reading API Documentation...', 'THINKING');
    // Simulating reading swagger or ai-guide
    // "I see /api/auth/register requires phoneNumber, email, password..."

    // --- Step 2: Register ---
    log('STEP 2', 'Attempting Registration...', 'ACTION');
    const regRes = await request('POST', '/api/auth/register', state.user);
    if (regRes.ok) {
        log('STEP 2', 'Registration Successful', 'SUCCESS');
        if (regRes.data.token) {
            state.token = regRes.data.token;
            log('STEP 2', 'Token received from Registration. Skipping Login step.', 'INFO');
        }
    } else {
        log('STEP 2', `Registration Failed: ${JSON.stringify(regRes.data)}`, 'ERROR');
        if (regRes.status !== 400) return;
    }

    // --- Step 3: Login (Only if no token) ---
    if (!state.token) {
        log('STEP 3', 'Attempting Login to get Token...', 'ACTION');
        const loginRes = await request('POST', '/api/auth/login', {
            phoneNumber: state.user.phoneNumber,
            password: state.user.password
        });

        if (loginRes.ok && loginRes.data.token) {
            state.token = loginRes.data.token;
            log('STEP 3', 'Login Successful. Token received.', 'SUCCESS');
        } else {
            log('STEP 3', `Login Failed: ${JSON.stringify(loginRes.data)}`, 'FATAL');
            return;
        }
    } else {
        log('STEP 3', 'Skipping Login as Token was obtained during Registration.', 'INFO');
    }

    // --- Step 4: Get API Key (Agent Flow) ---
    log('STEP 4', 'Requesting Permanent API Key for Agent usage...', 'ACTION');
    const keyRes = await request('POST', '/api/users/me/apikey', null, {
        'Authorization': `Bearer ${state.token}`
    });

    if (keyRes.ok && keyRes.data.apiKey) {
        state.apiKey = keyRes.data.apiKey;
        log('STEP 4', 'API Key Generated successfully.', 'SUCCESS');
    } else {
        log('STEP 4', `Failed to generate API Key: ${JSON.stringify(keyRes.data)}`, 'ERROR');
        // Proceeding with Token if API Key fails, but noting it as a bug if it fails
        log('STEP 4', 'Will continue using Bearer Token as fallback if needed, but primarily trying API Key.', 'WARN');
    }

    const authHeaders = state.apiKey ? { 'x-api-key': state.apiKey } : { 'Authorization': `Bearer ${state.token}` };
    if (state.apiKey) log('INFO', 'Switching to x-api-key for authentication check.');

    // --- Step 5: Create Wishlist ---
    log('STEP 5', 'Creating a new Wishlist...', 'ACTION');
    const listRes = await request('POST', '/api/wishlists', {
        title: 'Agent Generated List',
        description: 'Created by Naive Agent Simulation'
    }, authHeaders);

    if (listRes.ok) {
        // Assuming response contains the created list or ID
        // The API docs say "201 Wishlist created", but doesn't specify body structure clearly in the simplified guide.
        // Let's inspect response.
        log('STEP 5', `Wishlist Create Response: ${JSON.stringify(listRes.data)}`, 'DEBUG');
        if (listRes.data && listRes.data.id) {
            state.wishlistId = listRes.data.id;
            log('STEP 5', `Wishlist Created. ID: ${state.wishlistId}`, 'SUCCESS');
        } else {
            // Try to list all to find it?
            log('STEP 5', 'ID not returned directly? Checking list...', 'WARN');
        }
    } else {
        log('STEP 5', `Create Wishlist Failed: ${JSON.stringify(listRes.data)}`, 'ERROR');
    }

    // If we missed the ID, fetch list
    if (!state.wishlistId) {
        log('STEP 5.1', 'Listing wishlists to find ID...', 'ACTION');
        const getListRes = await request('GET', '/api/wishlists', null, authHeaders);
        if (getListRes.ok && Array.isArray(getListRes.data) && getListRes.data.length > 0) {
            state.wishlistId = getListRes.data[0].id; // Just take the first one
            log('STEP 5.1', `Found Wishlist ID: ${state.wishlistId}`, 'SUCCESS');
        } else {
            log('STEP 5.1', 'Could not find any wishlists.', 'FATAL');
            return;
        }
    }

    // --- Step 6: Add Item (Manual) ---
    log('STEP 6', 'Adding Item manually...', 'ACTION');
    const itemRes = await request('POST', `/api/wishlists/${state.wishlistId}/items`, {
        name: 'Test Item Manual',
        price: 100,
        note: 'Added by Agent'
    }, authHeaders);

    if (itemRes.ok) {
        log('STEP 6', 'Item Added Successfully.', 'SUCCESS');
    } else {
        log('STEP 6', `Add Item Failed: ${JSON.stringify(itemRes.data)}`, 'ERROR');
    }

    // --- Step 7: Add Item (URL Scraping - AI) ---
    log('STEP 7', 'Adding Item via URL (PChome example)...', 'ACTION');
    // Using a known safe URL from the pre-work checklist
    const targetUrl = 'https://24h.pchome.com.tw/prod/DSAR0S-A900F7PCX';

    // Note: This endpoint /api/wishlists/{id}/items/url might take time due to scraping/AI
    const scrapeRes = await request('POST', `/api/wishlists/${state.wishlistId}/items/url`, {
        url: targetUrl
    }, authHeaders);

    if (scrapeRes.ok) {
        log('STEP 7', 'PChome Item Scrape/Add Successful.', 'SUCCESS');
    } else {
        log('STEP 7', `PChome Add Failed (Possible AI/Crawler error): ${JSON.stringify(scrapeRes.data)}`, 'ERROR');
        // This is where "API回饋或Bug" (Unexpected API feedback) is critical
    }

    // --- Step 8: Verify Items in Wishlist ---
    log('STEP 8', 'Verifying Wishlist Details...', 'ACTION');
    const detailRes = await request('GET', `/api/wishlists/${state.wishlistId}`, null, authHeaders);

    if (detailRes.ok) {
        log('STEP 8', `Wishlist Details Retrieved. Item Count: ${detailRes.data.items ? detailRes.data.items.length : 'Unknown'}`, 'SUCCESS');
        log('STEP 8', `Data: ${JSON.stringify(detailRes.data)}`, 'DEBUG');
    } else {
        log('STEP 8', `Get Wishlist Detail Failed: ${JSON.stringify(detailRes.data)}`, 'ERROR');
    }

    // --- Step 9: AI Guide Endpoint Check ---
    log('STEP 9', 'Checking /api/ai-guide endpoint...', 'ACTION');
    const guideRes = await request('GET', '/api/ai-guide');
    if (guideRes.ok && guideRes.data.meta && guideRes.data.meta.title.includes('AI Guide')) {
        log('STEP 9', 'AI Guide Endpoint is HEALTHY.', 'SUCCESS');
    } else {
        log('STEP 9', `AI Guide Endpoint Unexpected: ${JSON.stringify(guideRes.data)}`, 'ERROR');
    }

    log('FINISH', 'Simulation Complete.', 'INFO');
}

runSimulation();
