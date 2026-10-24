# Normal UI inquiry relay

The active outgoing identity is 兩隻小豬 (100053445261716, https://www.facebook.com/twopiggyhavefun/). Use `relay.cjs identity` before routing to verify the protected server endpoint and local identity agree. Old Wishlist.AI routes remain readable for existing receipt history; they cannot prepare new public comments.

Install relay.cjs, relay-identity.cjs and inquiry-questions.cjs together into the existing scheduled tools directory after tests and production identity compatibility pass. No real key, queue or local buyer data belongs in this directory. Retrieve the existing admin credential only at execution time.

Every outbound question still requires Hank approval for the current question fingerprint and normal Facebook UI identity/readback. The tool does not send to Facebook. Rejected external comments remain blocked by the scheduled `runs/relay-outbound-blockers.json`; expiry or switching identity cannot authorize another send.

`issue ROOM_ID CHECKED_AT COMMENT_ID` records an already observed Facebook rejection against the original reservation and acting identity. It sends no Facebook message, creates no delivery receipt or seller reply, and exposes only a system progress code and the same item's original source link to the authenticated buyer. The pending operation is persisted before calling the API, so retrying a lost response uses the same request.

Run `node --test tools/inquiry-relay/relay-identity.test.cjs` for local compatibility and stop checks. Full API/DB tests are in server/src/__tests__/integration/sourceRelayIdentity.integration.ts and use only an explicitly guarded isolated database.
