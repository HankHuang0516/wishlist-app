# Railway deployment checklist

This document is safe to publish. Never paste live API keys, OAuth tokens,
passwords, private keys, connection URLs, or example values copied from a real
account into a repository, pull request, log, screenshot, or support ticket.

## Before deployment

1. Select the existing `wishlist-app` service and the intended Railway
   environment. Confirm the GitHub branch and commit to be deployed.
2. Set required credentials in Railway Variables. Keep local development
   credentials in the OS keychain or other secure local storage. Do not put
   credential values in this checklist or commit them to Git.
3. Confirm database migrations and backup/recovery arrangements. Do not use
   a production database for tests or synthetic smoke data.
4. Run the repository's client, server, and mobile checks that are applicable
   to the changed files, including an isolated-database integration test.
5. Review the final diff and CI results. A passing build alone is not proof of
   working production integrations.

## After deployment

1. Verify the deployed commit and the public health endpoint.
2. Confirm existing accounts and data remain intact using aggregate,
   read-only checks; do not print personal data or credentials.
3. Exercise only authorized test accounts for state-changing checks.
4. Record deployment, rollback, and verification evidence outside this file.

## Four-image marketing pilot

1. Apply the `MarketingJob` migration through the normal service startup. Keep
   `MARKETING_ASSISTANT_ENABLED` off until the signed internal-test build and
   Mac worker have passed the same-commit acceptance checks.
2. Confirm the existing callback capability is present on Railway and only
   read from macOS Keychain by `run-marketing-poller.sh`. Do not copy its value
   into this file, a plist, a build artifact, or an issue.
3. Set `MARKETING_ASSISTANT_PILOT_USER_ID` to the authorized tester's numeric
   account ID before enabling the feature. Start the separate outbound-only
   marketing LaunchAgent after its local path and current commit are verified.
4. Confirm one authorized test item reaches four *private* Flickr assets, a
   seller-editable copy, a selected-slot free revision, and a public listing
   that still contains the real photo. Verify unauthorized users receive no
   access. The paid 100-use/10-pack paths remain unavailable until receipts
   are independently verified; do not advertise them as purchasable.
5. If the worker or storage path fails, turn the feature gate off without
   changing existing listings or revoking unrelated recognition jobs.

## Credential handling

If a credential may have been exposed, coordinate incident response privately
with the owner. Removing a value from the current file alone does not erase
Git history or invalidate copied credentials. Do not publish incident details
or credential values in this repository.
