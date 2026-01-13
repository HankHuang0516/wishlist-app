import { OAuthService, FetchTransport, OAuthAuth } from 'flickr-sdk';
import readline from 'readline';

// Instructions:
// 1. Get your API Key and Secret from: https://www.flickr.com/services/apps/create/apply/
// 2. Set them in this file or pass via process.env

const CONSUMER_KEY = process.env.FLICKR_API_KEY || 'YOUR_API_KEY';
const CONSUMER_SECRET = process.env.FLICKR_API_SECRET || 'YOUR_API_SECRET';

if (CONSUMER_KEY === 'YOUR_API_KEY') {
    console.error('❌ Please set FLICKR_API_KEY and FLICKR_API_SECRET env vars or edit this file.');
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    try {
        // 1. Get Request Token
        console.log('1. Requesting OAuth Token...');

        const transport = new FetchTransport();
        const auth = new OAuthAuth(CONSUMER_KEY, CONSUMER_SECRET, false, false);
        const oauthService = new OAuthService(transport, auth);

        const { requestToken, requestTokenSecret } = await oauthService.request('oob');

        console.log(`\n✅ Got Request Token: ${requestToken}`);

        // 2. Authorize URL
        const authUrl = oauthService.authorizeUrl(requestToken, 'write'); // 'write' permission needed for uploads
        console.log(`\n👉 Open this URL in your browser to authorize:\n\n${authUrl}\n`);

        rl.question('📋 Enter the Verifier Code from the browser: ', async (verifier) => {
            try {
                // 3. Exchange for Access Token
                // Create a new auth with the request token for verification
                const verifyAuth = new OAuthAuth(CONSUMER_KEY, CONSUMER_SECRET, requestToken, requestTokenSecret);
                const verifyService = new OAuthService(transport, verifyAuth);

                const { nsid, oauthToken, oauthTokenSecret, username, fullname } = await verifyService.verify(verifier.trim());

                console.log('\n🎉 SUCCESS! Add these to your .env file:');
                console.log('----------------------------------------');
                console.log(`FLICKR_API_KEY=${CONSUMER_KEY}`);
                console.log(`FLICKR_API_SECRET=${CONSUMER_SECRET}`);
                console.log(`FLICKR_OAUTH_TOKEN=${oauthToken}`);
                console.log(`FLICKR_OAUTH_TOKEN_SECRET=${oauthTokenSecret}`);
                console.log(`FLICKR_USER_ID=${nsid}`);
                console.log('----------------------------------------');
                console.log(`\nAuthorized user: ${username} (${fullname})`);

            } catch (err: any) {
                console.error('❌ Verification Failed:', err.message);
            } finally {
                rl.close();
            }
        });

    } catch (error: any) {
        console.error('❌ Error:', error.message);
        rl.close();
    }
}

main();
