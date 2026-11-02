# Phase 1: Foundation

Read `00-context.md` first.

## Goal
A deployable skeleton where an invited person can sign in with Google, the server securely holds their Drive refresh token, and a tested storage module can talk to their Drive.

## Tasks

### 1. Scaffold
- Next.js App Router, TypeScript strict, ESLint, Vitest, zod.
- Folders: `src/app`, `src/lib`, `src/models`, `src/styles`.
- `src/styles/tokens.css` (colors, spacing, radius, type scale, light and dark) and a small global stylesheet. CSS Modules for components. No Tailwind.
- `.env.example` with every variable from the context file.
- `README.md` with Google Cloud setup: create project, enable Drive API, create OAuth Web client, redirect URIs for localhost and production, consent screen set to **In production** (Testing mode expires refresh tokens after 7 days), only the scopes `openid email profile https://www.googleapis.com/auth/drive.file`.

### 2. Database
- Cached Mongo connection helper for serverless.
- Models: `User`, `AllowedEmail`, `AccessRequest` (as defined in the context file).

### 3. Auth
- Google provider with authorization params `access_type: "offline"` and the scopes above. JWT sessions that carry only `userId` and `email`; never put Google tokens in the session or JWT.
- `signIn` callback:
  1. Lowercase the email. Allow only if an `AllowedEmail` with status "active" exists, or it equals `ADMIN_EMAIL` (auto-create the admin's entry). Otherwise deny and send to `/login?error=NotInvited`.
  2. Upsert the `User`.
  3. If Google returned a refresh token, encrypt it and store it.
  4. If no refresh token came back and the user has none stored, redirect to `/login?reconsent=1`. That page triggers sign-in with `prompt=consent` (Google only issues refresh tokens on consent).
  5. Do not force `prompt=consent` on every login (it burns through Google's per-account refresh-token limit).
- `/login` page: sign-in button, clear messages for NotInvited and reconsent.

### 4. Token vault
`src/lib/crypto/tokenVault.ts`: AES-256-GCM via `node:crypto`, key from `TOKEN_ENCRYPTION_KEY`, random IV per encryption, `keyVersion` stored for future rotation. Tests: round trip, tampered ciphertext fails, wrong key fails.

### 5. Storage module
`src/lib/storage/types.ts` defines `StorageProvider`. `src/lib/storage/drive.ts` implements it with plain `fetch`:
- `getAccessToken(userId)`: decrypts the refresh token, exchanges it at Google's token endpoint, caches the access token in memory until about a minute before expiry. On `invalid_grant`, mark the stored token unusable and throw `DRIVE_RECONNECT_REQUIRED`.
- `ensureRootFolder(userId)`: finds or creates an app folder (name from `APP_NAME`) and saves `driveRootFolderId`.
- `ensureSongFolder(userId, songId, title)`.
- `createUploadSession(userId, { folderId, fileName, mimeType, size, origin })`: starts a Drive resumable upload and returns the session URL. Send the app origin in the `Origin` header so browser uploads pass CORS.
- `getFileMetadata(userId, fileId)`: id, name, size, mimeType, md5Checksum, parents, trashed.
- `streamFile(userId, fileId, rangeHeader)`: returns the Drive response body stream plus status and the relevant headers.
- `trashFile(userId, fileId)`: treat a 404 as success.
- A shared request helper: retry 429 and 5xx with exponential backoff and jitter (max 4 attempts); map `storageQuotaExceeded` to `DRIVE_QUOTA_EXCEEDED` and 404 to `FILE_MISSING`.
- Unit tests with mocked `fetch` for token refresh, retry behavior, error mapping, and the resumable-session request shape.

### 6. API plumbing
- `apiHandler` wrapper and `ApiError` class mapping to the error format in the context file.
- `requireUser()` helper that reads the session and returns `{ userId }` or throws `UNAUTHENTICATED`. Design it so Phase 4 can extend it to accept bearer tokens.
- For session-authenticated requests that change data, reject requests whose `Origin` header does not match the app's origin.

### 7. Invite admin
- `/admin/invites` page, visible only to `ADMIN_EMAIL`: list, add and revoke allowed emails; list `AccessRequest` entries (will be empty until Phase 8).
- `GET/POST/DELETE /api/admin/invites` with the same restriction.

### 8. Smoke pages
`/songs` placeholder showing "Signed in as <email>" and a sign-out button, protected by auth.

## Acceptance criteria
- An uninvited Google account is rejected; an invited one signs in; `ADMIN_EMAIL` can always sign in.
- After first sign-in the DB holds an encrypted refresh token (verify it is not plaintext and not in the session cookie).
- A temporary dev-only route or script can create the root folder and a test file upload session for the signed-in user.
- Revoking the app in the Google account page leads to `DRIVE_RECONNECT_REQUIRED`, not a crash.
- `npm run lint`, typecheck and tests pass. No Tailwind anywhere.

## Out of scope
Songs, uploads UI, tokens for agents, landing page.
