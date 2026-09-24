import { createFlickr } from 'flickr-sdk';

const { FLICKR_API_KEY, FLICKR_API_SECRET, FLICKR_OAUTH_TOKEN, FLICKR_OAUTH_TOKEN_SECRET } = process.env;
if (![FLICKR_API_KEY, FLICKR_API_SECRET, FLICKR_OAUTH_TOKEN, FLICKR_OAUTH_TOKEN_SECRET].every(Boolean)) {
    console.error('Flickr OAuth environment is incomplete.');
    process.exit(1);
}

try {
    const { flickr } = createFlickr({ consumerKey: FLICKR_API_KEY, consumerSecret: FLICKR_API_SECRET,
        oauthToken: FLICKR_OAUTH_TOKEN, oauthTokenSecret: FLICKR_OAUTH_TOKEN_SECRET });
    const result = await flickr('flickr.auth.oauth.checkToken', {});
    console.log(JSON.stringify({ permission: result?.oauth?.perms?._content ?? null,
        accountMatches: !process.env.FLICKR_USER_ID || result?.oauth?.user?.nsid === process.env.FLICKR_USER_ID,
        topKeys: Object.keys(result ?? {}), oauthKeys: Object.keys(result?.oauth ?? {}) }));
} catch (error) {
    console.error(`Flickr OAuth check failed (${error?.constructor?.name ?? 'unknown_error'}).`);
    process.exitCode = 1;
}
