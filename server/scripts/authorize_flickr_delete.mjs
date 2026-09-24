import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createFlickr, FetchTransport, OAuthAuth, OAuthService } from 'flickr-sdk';

const account = 'Wishlist AI';
const service = 'com.hankhuang.wishlist.flickr-delete-oauth-pending';
const key = process.env.FLICKR_API_KEY;
const secret = process.env.FLICKR_API_SECRET;

if (!key || !secret) {
    console.error('Flickr API key and secret must be supplied through the environment.');
    process.exit(1);
}

function saveToKeychain(value) {
    const encoded = JSON.stringify(value);
    const saved = spawnSync('security', ['add-generic-password', '-a', account, '-s', service, '-U', '-w'], {
        input: `${encoded}\n${encoded}\n`, encoding: 'utf8', timeout: 15_000
    });
    if (saved.status !== 0) throw new Error('keychain_write_failed');
    const read = spawnSync('security', ['find-generic-password', '-a', account, '-s', service, '-w'], {
        encoding: 'utf8', timeout: 15_000
    });
    if (read.status !== 0 || read.stdout.trim() !== encoded) throw new Error('keychain_verify_failed');
}

const transport = new FetchTransport();
const request = new OAuthService(transport, new OAuthAuth(key, secret, false, false));
const prompt = createInterface({ input: stdin, output: stdout });

try {
    const { requestToken, requestTokenSecret } = await request.request('oob');
    if (!requestToken || !requestTokenSecret) throw new Error('request_token_failed');
    console.log(`Open this Flickr consent page and grant delete permission:\n${request.authorizeUrl(requestToken, 'delete')}`);
    const verifier = (await prompt.question('Flickr verifier: ')).trim();
    if (!verifier) throw new Error('verifier_missing');
    const verify = new OAuthService(transport, new OAuthAuth(key, secret, requestToken, requestTokenSecret));
    const { nsid, oauthToken, oauthTokenSecret } = await verify.verify(verifier);
    if (!nsid || !oauthToken || !oauthTokenSecret) throw new Error('access_token_failed');
    if (process.env.FLICKR_USER_ID && process.env.FLICKR_USER_ID !== nsid) throw new Error('wrong_flickr_account');
    const { flickr } = createFlickr({ consumerKey: key, consumerSecret: secret, oauthToken, oauthTokenSecret });
    const status = await flickr('flickr.auth.oauth.checkToken', {});
    if (status?.oauth?.perms?._content !== 'delete') throw new Error('delete_permission_missing');
    saveToKeychain({ oauthToken, oauthTokenSecret, nsid });
    console.log('Delete permission and account verified; access token saved to macOS Keychain. Production credentials are unchanged.');
} catch (error) {
    const expected = new Set(['keychain_write_failed', 'keychain_verify_failed', 'request_token_failed',
        'verifier_missing', 'access_token_failed', 'wrong_flickr_account', 'delete_permission_missing']);
    const reason = error instanceof Error && expected.has(error.message) ? error.message : 'unexpected_failure';
    console.error(`Flickr authorization did not complete (${reason}). No production credentials were changed.`);
    process.exitCode = 1;
} finally {
    prompt.close();
}
