
const email = 'hankhuang0516+test@gmail.com';
const password = 'Password123!';
const name = 'Test User';
const baseUrl = 'https://wishlist-app-production.up.railway.app/api';

async function testFlow() {
    console.log(`[TEST] Starting flow for: ${email}`);

    // 1. Try Registration
    console.log(`[TEST] Attempting Registration...`);
    try {
        const regResponse = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password,
                name,
                phoneNumber: '09' + Math.random().toString().slice(2, 10)
            })
        });

        const regData = await regResponse.json();
        console.log(`[TEST] Register Status: ${regResponse.status}`);

        if (regResponse.ok) {
            console.log(`[TEST] ✅ Registration Successful!`);
            console.log(`[TEST] Message ID: ${regData.messageId}`);
            console.log(`[TEST] Full Response:`, regData);
            return;
        } else {
            console.log(`[TEST] Registration Failed:`, regData);
            if (regData.error && regData.error.includes('exists')) {
                console.log(`[TEST] User exists. Proceeding to Resend Verification...`);
            } else {
                return;
            }
        }

    } catch (e) {
        console.error(`[TEST] Registration Exception:`, e);
    }

    // 2. Try Resend Verification (if user exists)
    console.log(`[TEST] Attempting Resend Verification...`);
    try {
        const resendResponse = await fetch(`${baseUrl}/auth/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const resendData = await resendResponse.json();
        console.log(`[TEST] Resend Status: ${resendResponse.status}`);

        if (resendResponse.ok) {
            console.log(`[TEST] ✅ Resend Verification Successful!`);
            console.log(`[TEST] Message ID: ${resendData.messageId}`);
            console.log(`[TEST] Full Response:`, resendData);
        } else {
            console.log(`[TEST] ❌ Resend Verification Failed:`, resendData);
        }

    } catch (e) {
        console.error(`[TEST] Resend Exception:`, e);
    }
}

testFlow();
