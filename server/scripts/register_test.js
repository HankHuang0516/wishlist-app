
// Native fetch is available in Node 18+

async function registerUser() {
    const email = 'hankhuang0516@gmail.com';
    const password = 'Password123!';
    const phoneNumber = '0912345678'; // Dummy phone

    console.log(`[API] Registering user: ${email}`);

    try {
        const response = await fetch('https://wishlist-app-production.up.railway.app/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password,
                phoneNumber,
                name: 'Test Hank'
            })
        });

        const data = await response.json();
        console.log(`[API] Status: ${response.status}`);
        console.log(`[API] Response:`, data);

    } catch (e) {
        console.error(`[API] Error:`, e);
    }
}

registerUser();
