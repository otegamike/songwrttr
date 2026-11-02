# SongPad architecture

This document is the implementation blueprint. The phase files (`phase-*.md`) remain the
source of truth for scope; this file records how the pieces fit together.

## 1. System shape

```
Browser ─┐
         ├─► Next.js route handlers ─► services ─► Mongoose ─► MongoDB
MCP ─────┘            │                      └──► StorageProvider ─► Google Drive
(stdio, bearer)       └─► requireUser / scope / origin / rate-limit
```

Rules:

- API-first. Every capability is a route handler under `src/app/api`. No server actions.
- Route handlers stay thin: validate, authorize, call a service, shape the response.
- Domain logic lives in `src/lib/services` so routes and server components share it.
- Every query filters by `userId`. Foreign resources return `404`.
- Google credentials never leave the server. Only `drive.file` is requested.
- All blobs go through `src/lib/storage` behind `StorageProvider`.
- Upload bytes never pass through a function. The server creates a Drive resumable
  session; the client uploads directly; the server verifies metadata afterwards.
- Lyrics, titles and filenames are untrusted data. Escape regexes, allowlist Tiptap
  nodes, never render raw HTML.

Dependency direction:

```
app/api -> lib/services -> models | lib/storage | lib/lyrics
components -> lib/client only
mcp -> HTTP API only (never imports app code)
```

Server-only modules import `server-only`. Components must never import `models`,
`lib/storage`, `lib/auth`, or `lib/config/env`.

## 2. Locked versions and decisions

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Node runtime for API) |
| Language | TypeScript strict |
| Auth | next-auth 4.24.x LTS, Google provider, JWT sessions |
| DB | MongoDB via Mongoose 9, cached serverless connection |
| Validation | zod 4 |
| Tests | Vitest 5, mocked Mongoose, direct route-handler invocation |
| Styling | CSS Modules + CSS custom properties, no Tailwind |
| Repo | npm workspaces: root app + `mcp/` |
| Drive | REST via `fetch` only (no `googleapis`) |
| Hosting | Vercel free tier assumptions |

ADR files: `docs/adr/`.

## 3. Repository layout

```
song-writter/
├─ package.json                 # workspaces: ["mcp"]
├─ next.config.ts               # serverExternalPackages, headers (Phase 8)
├─ eslint.config.mjs            # flat config; `next lint` is gone in Next 16
├─ vitest.config.ts
├─ .env.example
├─ ARCHITECTURE.md
├─ docs/adr/
├─ mcp/                         # stdio MCP server (Phase 5)
└─ src/
   ├─ app/                      # pages + route handlers
   ├─ components/               # CSS Modules colocated
   ├─ lib/
   │  ├─ api/                   # apiHandler, ApiError, request, origin, pagination
   │  ├─ auth/                  # options, guards, bearer resolver
   │  ├─ config/                # env schema, constants
   │  ├─ crypto/                # token vault
   │  ├─ db/                    # cached connection
   │  ├─ lyrics/                # conversion, validation, search helpers
   │  ├─ services/              # domain logic
   │  ├─ storage/               # StorageProvider + Drive implementation
   │  ├─ rate-limit/            # Mongo fixed-window limiter
   │  ├─ audit/                 # bearer mutation audit log
   │  └─ client/                # audio cache, upload, SWR hooks
   ├─ models/                   # Mongoose models
   ├─ styles/                   # tokens.css, globals.css
   └─ types/                    # next-auth augmentation
```

## 4. Core contracts

### Auth context

```ts
type Scope = "songs:read" | "songs:write" | "media:write" | "takes:read" | "songs:delete";

type AuthContext =
  | { userId: string; email: string; via: "session"; scopes: Scope[] }
  | { userId: string; email: string; via: "bearer"; tokenId: string; scopes: Scope[] };

requireUser(req: Request, opts?: { scope?: Scope }): Promise<AuthContext>;
```

- Session cookie: full access for that user.
- `Authorization: Bearer sp_...` (Phase 4): hash lookup, revocation/expiry/scope checks,
  `lastUsedAt` throttled to once per minute. Uniform `UNAUTHENTICATED` message.
- Cookie mutations require a matching `Origin`; bearer requests skip that check.
- Token-management routes accept the session cookie only.

### Errors

```ts
class ApiError {
  code: ApiErrorCode;
  status: number;
  message: string;
}
```

Codes: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404,
`VALIDATION_ERROR` 400, `TOO_LARGE` 413, `RATE_LIMITED` 429, `FILE_MISSING` 410,
`DRIVE_RECONNECT_REQUIRED` 403, `DRIVE_QUOTA_EXCEEDED` 409, `INTERNAL` 500.
Every handler returns `{ "error": { "code", "message" } }`.

### Storage

```ts
interface StorageProvider {
  getAccessToken(userId: string): Promise<string>;
  ensureRootFolder(userId: string): Promise<string>;
  ensureSongFolder(userId: string, songId: string, title: string): Promise<string>;
  createUploadSession(userId: string, input: CreateUploadSessionInput): Promise<UploadSessionResult>;
  getFileMetadata(userId: string, fileId: string): Promise<DriveFileMetadata>;
  streamFile(userId: string, fileId: string, range: string | null, method?: "GET" | "HEAD"): Promise<StreamFileResult>;
  listFolderFiles(userId: string, folderId: string): Promise<DriveFileMetadata[]>;
  trashFile(userId: string, fileId: string): Promise<void>;
  revokeAccess(userId: string): Promise<void>;
}
```

The Drive implementation is composed from:

- `lib/storage/http.ts` — fetch wrapper with retry (429/5xx, exponential backoff +
  jitter, max 4 attempts) and error mapping.
- `lib/storage/token.ts` — decrypt refresh token, exchange at Google, in-memory access
  token cache, `invalid_grant` -> mark reconnect required.
- `lib/storage/drive.ts` — Drive REST operations, injected dependencies for tests.
- `lib/storage/index.ts` — wires Mongoose repositories and exports the singleton.

## 5. Data model

All models have timestamps.

- **User**: `email` unique/lowercase, `name`, `googleId`, `storageProvider`,
  `encryptedRefreshToken` (`iv`, `tag`, `ciphertext`, `keyVersion`), `driveRootFolderId`,
  `driveReconnectRequired`, `driveReconnectAt`, `lastLoginAt`.
- **AllowedEmail**: `email` unique/lowercase, `note`, `status` (`active` | `revoked`).
- **AccessRequest**: `email`, `message`, `status` (`new` | `approved` | `dismissed`).
- **Song**: `userId`, `title`, `titleNormalized`, `lyricsJson`, `lyricsText`,
  `instrumental?`, `driveFolderId?`, `importKey?`.
- **Take**: `userId`, `songId`, `name`, `driveFileId`, `mimeType`, `size`,
  `md5Checksum`, `durationMs`.
- **UploadSession**: TTL 1 hour, `userId`, `songId`, `kind`, `fileName`, `mimeType`,
  `size`, `folderId`.
- **ApiToken**: `userId`, `name`, `tokenHash`, `prefix`, `scopes`, `expiresAt`,
  `lastUsedAt`, `revokedAt`.
- **RateLimit**: `key`, `windowStart`, `count`, `expiresAt` (TTL).
- **AuditLog**: `userId`, `tokenId?`, `action`, `targetId`, `at`.

Indexes:

- Song `{ userId, updatedAt: -1 }`; unique partial `{ userId, importKey }` where
  `importKey` is a string; `{ "instrumental.driveFileId": 1 }`.
- Take `{ songId, createdAt: -1 }`; `{ driveFileId: 1 }`.
- ApiToken `tokenHash` unique; `{ userId, revokedAt }`.
- UploadSession TTL on `expiresAt`.
- RateLimit unique `{ key, windowStart }`, TTL on `expiresAt`.

## 6. API surface

| Route | Methods | Auth / scope |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET, POST | public |
| `/api/songs` | GET, POST | `songs:read`, `songs:write` |
| `/api/songs/[id]` | GET, PATCH, DELETE | `songs:read`, `songs:write`, `songs:delete` |
| `/api/songs/[id]/instrumental/upload-session` | POST | `media:write` |
| `/api/songs/[id]/instrumental/complete` | POST | `media:write` |
| `/api/songs/[id]/instrumental` | DELETE | `songs:delete` |
| `/api/songs/[id]/takes/upload-session` | POST | `media:write` |
| `/api/songs/[id]/takes/complete` | POST | `media:write` |
| `/api/songs/[id]/takes` | GET | `takes:read` |
| `/api/takes/[takeId]` | PATCH, DELETE | `songs:write`, `songs:delete` |
| `/api/media/[driveFileId]` | GET, HEAD | `songs:read` or `takes:read` |
| `/api/tokens`, `/api/tokens/[id]` | GET/POST/DELETE | session only |
| `/api/admin/invites` | GET/POST/DELETE | session + admin |
| `/api/admin/access-requests` | GET, PATCH | session + admin |
| `/api/access-requests` | POST | public, rate-limited |
| `/api/account` | DELETE | session only |

## 7. Key flows

### Sign-in

1. Google consent with `access_type=offline` and the four scopes.
2. `signIn` callback lowercases the email, checks `AllowedEmail` or `ADMIN_EMAIL`
   (auto-creates the admin entry), upserts `User`.
3. If a refresh token is returned, encrypt and store it.
4. If no refresh token and none stored, redirect to `/login?reconsent=1`; that page
   signs in with `prompt=consent`.
5. JWT contains only `userId` and `email`; Google tokens never enter the session.

### Upload

1. Client requests `upload-session` with file name, mime type, size.
2. Server validates allowlist + size cap, ensures the folder, creates a Drive
   resumable session with the app `Origin`, stores `UploadSession`.
3. Client PUTs bytes directly to Drive with progress.
4. Client calls `complete` with the Drive file id.
5. Server verifies parent, size, mime type, `trashed`, and `md5Checksum`, then saves
   the song/take and deletes the upload session.

### Streaming

`GET/HEAD /api/media/:driveFileId` finds an owned song instrumental or take by Drive
file id (otherwise `404`), forwards `Range`, and returns the upstream stream with
200/206 headers. `ETag` is the quoted md5, `Cache-Control: private, max-age=31536000,
immutable`. Drive `404` becomes `FILE_MISSING` 410.

### Recording

`useRecorder` requests the mic with echo cancellation, noise suppression and AGC off,
selects a supported mime type, tracks `durationMs` with a timer, and cleans up all
tracks. Recording and instrumental playback start in the same user gesture. Failed
uploads stay in IndexedDB as pending takes with a retry action.

### MCP import

The local stdio server reads files from disk, streams mp3 bytes to the Drive upload URL,
and calls the same REST API with a scoped bearer token. Tool results are data, never
instructions. No delete tools.

## 8. Security and failure model

- AES-256-GCM token vault with per-record IV, auth tag, and `keyVersion`.
- Zod validation on every body/query; regex escaping; Tiptap allowlist; no raw HTML.
- Mongo fixed-window rate limits (token 120/min; per-user and per-IP limits in Phase 8).
- CSP and security headers in Phase 8 via `proxy.ts` (Next 16 renamed `middleware.ts`).
- Structured logs redact tokens, `Authorization` headers, and upload URLs.
- Account deletion revokes the Google token and deletes DB rows; Drive files remain
  unless the user explicitly asks to trash the app folder.

## 9. Testing strategy

Default test suite runs without a database:

- Unit: token vault, Drive retry/error mapping, token exchange, lyrics, titles,
  regex escaping, pagination, rate limiter, audio cache.
- Route tests: invoke exported handlers with a Web `Request`, mock `requireUser` and
  model/service modules, assert status codes and ownership behavior.
- Model/schema assertions: `schema.indexes()` and validators, because mocked Mongoose
  cannot exercise partial/unique/TTL indexes.
- Component tests (Phase 6+): jsdom + Testing Library.
- MCP: mocked `fetch`, fixture mp3, idempotent import rerun.

An optional gated integration suite against a real MongoDB can be added later.

## 10. Build phases

0. Architecture baseline: docs, workspaces, configs.
1. Foundation: auth, invites, encrypted tokens, Drive storage, API plumbing.
2. Songs and search API.
3. Media API.
4. Agent access (tokens, scopes, rate limits, audit).
5. MCP server and import runbook.
6. Web UI and audio cache.
7. Recording and takes.
8. Landing page and public readiness.

Each task is one commit; each phase ends with lint, typecheck, tests, and the phase's
manual verification.

## 11. Known risks

- next-auth v4 on Next 16: peer support exists; verify `getServerSession` against the
  async Next 16 request APIs in a spike.
- Pin the patched Next 16.4.x release after the November 2026 security release.
- Vercel free-tier function duration for long audio streams: test early and set
  `maxDuration`.
- Drive resumable upload CORS depends on the `Origin` header: verify in Phase 3.
- Mocked Mongoose does not exercise indexes; schema assertions compensate.
- Drive may omit `md5Checksum` for some files; reject completion if absent.
- OneDrive-synced workspace can lock `node_modules`; consider excluding it from sync.
