# SongPad

A songwriting web app. Songs, rich-text lyrics and metadata live in MongoDB. Audio lives
in each user's own Google Drive. The same REST API is usable by a local MCP server with
revocable, scoped personal access tokens.

See `ARCHITECTURE.md` for the design and `00-context.md` for product constraints.

## Requirements

- Node.js 20.19+ (developed on Node 24)
- npm 11+
- MongoDB (local or Atlas)
- A Google Cloud project with the Drive API enabled

## Google Cloud setup

1. Create a Google Cloud project.
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen:
   - User type: External.
   - Publishing status: **In production**. Testing mode expires refresh tokens after
     7 days.
   - Scopes: `openid`, `email`, `profile`,
     `https://www.googleapis.com/auth/drive.file`.
4. Create an **OAuth client ID** of type **Web application**.
   - Authorized JavaScript origin: `http://localhost:3000` (and the production origin).
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
     (and `https://<your-domain>/api/auth/callback/google`).
5. Copy the client ID and secret into `.env.local`.

`drive.file` lets the app manage files it creates and files that the user explicitly
opens with the app. It does not grant access to the rest of the user's Drive.

## Local setup

```bash
cp .env.example .env.local
# fill in MONGODB_URI, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
# TOKEN_ENCRYPTION_KEY and ADMIN_EMAIL
npm install
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` for the first step.
Set the real MongoDB Atlas URI and OAuth values in `.env.local`; do not commit that
file. `.env.example` contains safe local defaults and empty secret placeholders.
After values are entered, run `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run dev`. Sign in with `ADMIN_EMAIL`, add or approve users in `/admin/invites`,
and check Drive connection from the song UI before importing.

Generate secrets:

```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY (must decode to exactly 32 bytes)
```

`ADMIN_EMAIL` is always allowed to sign in and is automatically added to the invite list.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint (flat config; `next lint` is gone in Next 16) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (mocked Mongoose, no database required) |
| `npm run mcp:build` | Build the MCP server |
| `npm run mcp:typecheck` | Typecheck the MCP server |

The MCP server is documented in `mcp/README.md`. Agent tokens are created at
`/settings/agents`.

## Song batch import

The local `Songs/` audio and lyrics are source material and must remain untouched.
Review `Songs-match-candidates.csv`, `Songs-lyric-review.csv`, and
`import-manifest.json` with the owner. Matching notes are heuristic; approve or
correct the manifest before import. The importer is deliberately not run during
setup. After MongoDB and Google Drive are configured, create a short-lived MCP token
with only the required import scopes and follow `import-runbook.md` step by step.
Stop after the manifest approval checkpoint if any row is uncertain.

Phase QA and launch notes: `phase-6-qa.md`, `phase-7-qa.md`, `phase-8-qa.md`, and
`PUBLIC-LAUNCH-CHECKLIST.md`. The privacy and terms pages are owner-review drafts.

## Troubleshooting

- If the browser console reports NextAuth `JWT_SESSION_ERROR` / `decryption
  operation failed` after changing `NEXTAUTH_SECRET`, stop the dev server, keep
  one stable `NEXTAUTH_SECRET` in `.env.local`, restart, and clear the SongPad
  session cookie for `localhost` in the browser (Application/Storage → Cookies).
  The old cookie was encrypted with a different secret; signing in again creates
  a fresh one. Do not rotate the secret while expecting existing sessions to work.
- The React `eval() is not supported` message is resolved by a development-only
  CSP allowance. Production CSP does not allow `unsafe-eval`.

If `next dev` or `next build` fails with `...next-swc.win32-x64-msvc.node is not
a valid Win32 application`, the native SWC binary was corrupted during install
(OneDrive sync can cause this). Reinstall it:

```bash
npm install --force @next/swc-win32-x64-msvc@16.4.3
```

Then remove it from `dependencies` again if npm added it as a direct dependency;
Next already declares it as an optional dependency.

## Manual Phase 1 checks

1. Sign in with an uninvited Google account: rejected at `/login?error=NotInvited`.
2. Sign in with `ADMIN_EMAIL`: accepted, and `/songs` shows the email.
3. Inspect MongoDB: `users.encryptedRefreshToken` contains base64 `iv`, `tag`,
   `ciphertext`, `keyVersion`; the session cookie contains no Google tokens.
4. With a dev server running and a session cookie, call
   `POST /api/dev/drive-smoke` to create the app folder and a test resumable upload
   session. The route is disabled in production.
5. Revoke the app at <https://myaccount.google.com/permissions> and call the smoke route
   again: it returns `DRIVE_RECONNECT_REQUIRED`.
6. Visit `/admin/invites` as the admin: add and revoke an email.
