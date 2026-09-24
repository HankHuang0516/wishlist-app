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

## Credential handling

If a credential may have been exposed, coordinate incident response privately
with the owner. Removing a value from the current file alone does not erase
Git history or invalidate copied credentials. Do not publish incident details
or credential values in this repository.
