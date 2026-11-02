# SongPad: shared context

Read this file fully before starting any phase. Each phase prompt assumes it. "SongPad" is a working name; keep it in one constant so it can change.

## Product
A songwriting web app. A user has songs. Each song has a title, rich-text lyrics, an optional instrumental (mp3), and any number of recorded takes. The user can record vocals while the instrumental plays. Audio files live in the **user's own Google Drive**; titles, lyrics and metadata live in **MongoDB**. Launch audience: the owner, then a few invited friends, then possibly the public. Agents (via MCP) must be able to use the service with a revocable credential.

Out of scope for all phases: Android app, PWA/Capacitor wrapping, S3 storage, payments, collaboration/sharing between users, mixing or syncing takes with the instrumental (takes play alone).

## Stack (fixed)
- Next.js (App Router), TypeScript `strict`, Node runtime for API routes. Use current stable versions; check each library's current docs rather than relying on memory.
- MongoDB via Mongoose, with a connection helper that caches across serverless invocations.
- NextAuth / Auth.js (Google provider), JWT sessions. Use whichever major version is current stable.
- Tiptap for rich-text lyrics.
- **Styling: no Tailwind, ever.** Use CSS Modules plus CSS custom properties (tokens in `src/styles/tokens.css`), light and dark via `prefers-color-scheme`.
- Tests: Vitest for logic and route handlers. Lint and typecheck must pass.
- Google Drive via plain `fetch` against the REST API (no `googleapis` package).
- Hosting target: Vercel free tier. Consequences: never pass large file bodies through a function (request bodies over ~4.5 MB fail); stream responses instead of buffering; keep functions short. Do not rely on in-memory state surviving between requests (it is only a best-effort cache).

## Architecture rules
1. **API-first.** All logic lives in route handlers under `src/app/api`, not server actions, so other clients can reuse it.
2. **Every query filters by `userId`.** Accessing another user's resource returns `404`, not `403`.
3. **Google credentials never reach the browser or an agent.** The server holds each user's encrypted refresh token and acts on their behalf. Only the `drive.file` scope is requested.
4. **All storage goes through `src/lib/storage`** behind a `StorageProvider` interface (Drive implementation now; S3 must be implementable later without touching callers).
5. **Large files go browser/agent to Drive directly** using a resumable upload session the server creates. Server then verifies the result.
6. Treat lyrics, titles and filenames as untrusted text: escape regexes, validate rich-text JSON against an allowlist, never render raw HTML.
7. Never log tokens, `Authorization` headers, or upload URLs.

## Data models (Mongoose; timestamps on all)
- **User**: `email` (unique, lowercase), `name`, `googleId`, `storageProvider` ("drive"), `encryptedRefreshToken` {iv, tag, ciphertext, keyVersion} (nullable), `driveRootFolderId`, `lastLoginAt`.
- **AllowedEmail**: `email` (unique, lowercase), `note`, `status` ("active" | "revoked").
- **AccessRequest**: `email`, `message`, `status` ("new" | "approved" | "dismissed").
- **Song**: `userId`, `title`, `titleNormalized`, `lyricsJson` (Tiptap doc), `lyricsText` (derived server-side), `instrumental?` {`driveFileId`, `fileName`, `mimeType`, `size`, `md5Checksum`}, `driveFolderId?`, `importKey?`. Indexes: `{userId, updatedAt:-1}`; unique partial `{userId, importKey}` where `importKey` exists.
- **Take**: `userId`, `songId`, `name`, `driveFileId`, `mimeType`, `size`, `md5Checksum`, `durationMs`. Index `{songId, createdAt}`.
- **UploadSession** (TTL 1 hour): `userId`, `songId`, `kind` ("instrumental" | "take"), `fileName`, `mimeType`, `size`, `folderId`.
- **ApiToken** (Phase 4): `userId`, `name`, `tokenHash`, `prefix`, `scopes[]`, `expiresAt?`, `lastUsedAt?`, `revokedAt?`.

## API conventions
- JSON everywhere. Errors: `{ "error": { "code": string, "message": string } }`.
- Codes and statuses: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_ERROR` 400, `TOO_LARGE` 413, `RATE_LIMITED` 429, `FILE_MISSING` 410 (Drive file gone), `DRIVE_RECONNECT_REQUIRED` 403 (token revoked/expired), `DRIVE_QUOTA_EXCEEDED` 409.
- Validate every body and query with zod. Wrap handlers in one shared `apiHandler` that maps errors to the above.
- Env vars (document all in `.env.example`): `MONGODB_URI`, `AUTH_SECRET`, `NEXTAUTH_URL`/`AUTH_URL` as required by the auth version, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (32 bytes, base64), `ADMIN_EMAIL`, `MAX_INSTRUMENTAL_MB` (default 50), `MAX_TAKE_MB` (default 100), `APP_NAME`.

## Working rules for the implementing agent
- Do the phase's tasks and nothing from later phases. If something is ambiguous, pick the simplest option consistent with this file, and list the assumption in your final summary.
- Small commits, one per task. Run lint, typecheck and tests before finishing.
- Finish with: what was built, assumptions made, how to verify manually, and anything that blocks the next phase.

## Phases
1. Foundation (auth, invite list, encrypted tokens, Drive storage module)
2. Songs and search API
3. Media API (uploads, streaming, takes)
4. Agent access (personal access tokens)
5. MCP server and bulk-import runbook
6. Web UI: song list, search, song page, lyrics, instrumental player, caching
7. Recording and takes
8. Landing page and public readiness
