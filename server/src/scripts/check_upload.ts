
import axios from 'axios';

const BASE_URL = 'https://wishlist-app-production.up.railway.app/api';

async function test() {
    console.log('--- STARTING TEST ---');
    const payload = {
        email: `debug_${Date.now()}@example.com`,
        password: 'Password123!',
        name: 'Debug',
        phoneNumber: `09${Math.floor(Math.random() * 100000000)}`
    };
    console.log('Payload:', JSON.stringify(payload));

    try {
        const res = await axios.post(`${BASE_URL}/auth/register`, payload);
        console.log('Register Success:', res.status);
    } catch (e: any) {
        console.log('Register Failed:', e.message);
        if (e.response) {
            console.log('Status:', e.response.status);
            console.log('Data:', JSON.stringify(e.response.data));
        }
    }
}

test();
