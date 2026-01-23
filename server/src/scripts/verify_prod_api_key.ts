
import axios from 'axios';
// import { getClientUrl } from '../config/constants'; // Commenting out to avoid TS complexities with ts-node if not configured
// We just use the env logic below which is robust enough for a script.
// Hardcode for script simplicity or use robust config loading.
// Let's use the actual production URL or local if specified.

const BASE_URL = process.env.API_URL || 'https://wishlist-app-production.up.railway.app';
const API_URL = `${BASE_URL}/api`;

const TEST_USER = {
    phoneNumber: `0999${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
    password: 'TestPassword123!',
    name: 'ApiKeyTester',
    email: `test_${Date.now()}@example.com`
};

async function verifyApiKey() {
    console.log(`🔍 Testing API Key lifecycle on ${BASE_URL}...`);
    console.log(`👤 Registering temp user: ${TEST_USER.phoneNumber}`);

    try {
        // 1. Register and get token immediately
        const registerRes = await axios.post(`${API_URL}/auth/register`, TEST_USER);
        const token = registerRes.data.token;
        console.log('✅ Registration successful, Token received.');

        // 2. Login (Skipped as we have token, and email is not verified yet)
        /*
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            phoneNumber: TEST_USER.phoneNumber,
            password: TEST_USER.password
        });
        const token = loginRes.data.token;
        */

        // 3. Generate API Key
        console.log('🔑 Generating API Key...');
        const apiKeyRes = await axios.post(
            `${API_URL}/users/me/apikey`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const apiKey = apiKeyRes.data.apiKey;
        if (!apiKey) throw new Error('No API Key returned from generation endpoint');
        console.log('✅ API Key generated:', apiKey.substring(0, 8) + '...');

        // 4. Verify API Key (Get Profile)
        console.log('📡 Verifying API Key access...');
        const profileRes = await axios.get(`${API_URL}/users/me`, {
            headers: { 'x-api-key': apiKey }
        });

        // Helper to check response structure
        const userData = profileRes.data.user || profileRes.data; // Handle both wrapped and unwrapped

        if (userData && userData.phoneNumber === TEST_USER.phoneNumber) {
            console.log('✅ API Key Verification PASSED!');
        } else {
            console.error('Mismatch:', { expected: TEST_USER.phoneNumber, actual: userData?.phoneNumber });
            throw new Error('Profile mismatch');
        }

        // 5. Cleanup (Optional: If we implement delete user)
        // Currently no delete user endpoint for self.
        // We leave the user. In real scenario, we should delete.

    } catch (error: any) {
        console.error('❌ Verification Failed');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
        process.exit(1);
    }
}

verifyApiKey();
