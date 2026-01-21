
const fs = require('fs');

async function triggerVerification() {
    const email = 'hankhuang0516@gmail.com';
    console.log(`[TEST] Triggering verification email for: ${email}`);

    try {
        const response = await fetch('https://wishlist-app-production.up.railway.app/api/auth/resend-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        console.log(`[TEST] Status Code: ${response.status}`);
        console.log(`[TEST] Response:`, data);

        if (response.ok) {
            console.log('[TEST] ✅ Verification email request accepted.');
        } else {
            console.log('[TEST] ❌ Request failed.');
        }

    } catch (error) {
        console.error('[TEST] Exception:', error);
    }
}

triggerVerification();
