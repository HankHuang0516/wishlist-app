"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const flickr_sdk_1 = require("flickr-sdk");
const readline_1 = __importDefault(require("readline"));
// Instructions:
// 1. Get your API Key and Secret from: https://www.flickr.com/services/apps/create/apply/
// 2. Set them in this file or pass via process.env
const CONSUMER_KEY = process.env.FLICKR_API_KEY || 'YOUR_API_KEY';
const CONSUMER_SECRET = process.env.FLICKR_API_SECRET || 'YOUR_API_SECRET';
if (CONSUMER_KEY === 'YOUR_API_KEY') {
    console.error('❌ Please set FLICKR_API_KEY and FLICKR_API_SECRET env vars or edit this file.');
    process.exit(1);
}
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 1. Get Request Token
            console.log('1. Requesting OAuth Token...');
            const transport = new flickr_sdk_1.FetchTransport();
            const auth = new flickr_sdk_1.OAuthAuth(CONSUMER_KEY, CONSUMER_SECRET, false, false);
            const oauthService = new flickr_sdk_1.OAuthService(transport, auth);
            const { requestToken, requestTokenSecret } = yield oauthService.request('oob');
            console.log(`\n✅ Got Request Token: ${requestToken}`);
            // 2. Authorize URL
            const authUrl = oauthService.authorizeUrl(requestToken, 'write'); // 'write' permission needed for uploads
            console.log(`\n👉 Open this URL in your browser to authorize:\n\n${authUrl}\n`);
            rl.question('📋 Enter the Verifier Code from the browser: ', (verifier) => __awaiter(this, void 0, void 0, function* () {
                try {
                    // 3. Exchange for Access Token
                    // Create a new auth with the request token for verification
                    const verifyAuth = new flickr_sdk_1.OAuthAuth(CONSUMER_KEY, CONSUMER_SECRET, requestToken, requestTokenSecret);
                    const verifyService = new flickr_sdk_1.OAuthService(transport, verifyAuth);
                    const { nsid, oauthToken, oauthTokenSecret, username, fullname } = yield verifyService.verify(verifier.trim());
                    console.log('\n🎉 SUCCESS! Add these to your .env file:');
                    console.log('----------------------------------------');
                    console.log(`FLICKR_API_KEY=${CONSUMER_KEY}`);
                    console.log(`FLICKR_API_SECRET=${CONSUMER_SECRET}`);
                    console.log(`FLICKR_OAUTH_TOKEN=${oauthToken}`);
                    console.log(`FLICKR_OAUTH_TOKEN_SECRET=${oauthTokenSecret}`);
                    console.log(`FLICKR_USER_ID=${nsid}`);
                    console.log('----------------------------------------');
                    console.log(`\nAuthorized user: ${username} (${fullname})`);
                }
                catch (err) {
                    console.error('❌ Verification Failed:', err.message);
                }
                finally {
                    rl.close();
                }
            }));
        }
        catch (error) {
            console.error('❌ Error:', error.message);
            rl.close();
        }
    });
}
main();
