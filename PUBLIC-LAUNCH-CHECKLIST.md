# Public launch checklist

## Before inviting other users

- [ ] Replace `CONTACT_EMAIL` in the privacy and terms drafts and the landing footer.
- [ ] Have the owner review the privacy and terms drafts with qualified counsel; they are not legal advice.
- [ ] Verify the Google API Services User Data Policy / Limited Use statement and the current `drive.file` scope description.
- [ ] Configure the OAuth consent screen with the public homepage, privacy URL, support email and app name; verify the requested scopes and publish the app in production.
- [ ] Configure the Google OAuth web client with the production origin and `/api/auth/callback/google` redirect URI.
- [ ] Set `MONGODB_URI`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`, and capacity settings in the host's secret store.
- [ ] Confirm the encryption key is exactly 32 random bytes when Base64 decoded; back it up securely because losing it prevents refresh-token decryption.
- [ ] Confirm the Vercel plan terms permit the intended commercial use and that function limits fit streaming.
- [ ] Configure Atlas network access, least-privilege database credentials, backups and a restore test.
- [ ] Configure error monitoring and alerting without capturing OAuth tokens, Authorization headers, lyrics or upload URLs.
- [ ] Verify CSP against sign-in, resumable upload, audio playback, and the public demo.
- [ ] Run manual browser QA and Lighthouse on mobile and desktop; target 90+ performance and 95+ accessibility on the landing page.
- [ ] Review and approve the local import manifest before using the MCP importer. Never upload the batch before approval.
