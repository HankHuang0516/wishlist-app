
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

const BASE_URL = 'https://wishlist-app-production.up.railway.app/api';
const TIMESTAMP = Date.now();
const EMAIL = `test_avatar_${TIMESTAMP}@example.com`;
const PASSWORD = 'password123';
const NAME = `AvatarTester_${TIMESTAMP}`;

async function runTest() {
    try {
        console.log('1. Registering new user...');
        const payload = {
            email: EMAIL,
            password: PASSWORD,
            name: NAME,
            phoneNumber: `09${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`
        };
        console.log('Sending payload:', payload);
        const registerRes = await axios.post(`${BASE_URL}/auth/register`, payload);
        console.log('   Registered:', registerRes.data.user.id);

        console.log('2. Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: EMAIL,
            password: PASSWORD
        });
        const token = loginRes.data.token;
        console.log('   Logged in. Token acquired.');

        console.log('3. Preparing dummy avatar...');
        // Create a simple text file acting as image or read a real one if possible
        // Let's try to assume there is a file we can use, or create a small "valid" jpg header
        const dummyPath = path.join(__dirname, 'dummy_avatar.jpg');
        // Minimal valid JPEG header + random data to pass basic mime checks if any
        const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
        fs.writeFileSync(dummyPath, Buffer.concat([jpegHeader, Buffer.alloc(1000)]));

        const form = new FormData();
        form.append('avatar', fs.createReadStream(dummyPath));

        console.log('4. Uploading avatar...');
        const start = Date.now();
        const uploadRes = await axios.post(`${BASE_URL}/users/me/avatar`, form, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...form.getHeaders()
            }
        });
        const duration = (Date.now() - start) / 1000;
        console.log(`   Upload successful! took ${duration}s`);
        console.log('   Response:', uploadRes.data);

        if (uploadRes.data.avatarUrl && uploadRes.data.avatarUrl.includes('flickr.com')) {
            console.log('   ✅ Avatar URL is from Flickr!');
        } else {
            console.log('   ⚠️ Avatar URL is NOT from Flickr (Fallback?):', uploadRes.data.avatarUrl);
        }

        // Cleanup
        fs.unlinkSync(dummyPath);

    } catch (error: any) {
        console.error('❌ Test Failed:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
    }
}

runTest();
