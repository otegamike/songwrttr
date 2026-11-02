# Phase 4: Agent access (personal access tokens)

Read `00-context.md` first. Phases 1 to 3 must be complete.

## Goal
A signed-in user can create revocable, scoped tokens. Agents and scripts call the same REST API with `Authorization: Bearer <token>`, and every existing ownership rule still applies.

## Tasks

### 1. ApiToken model and token format
- Token: `sp_` + 40 random characters (base64url, from `crypto.randomBytes`). Shown **once** at creation.
- Store only `sha256(token)` as `tokenHash` (unique index) and the first 8 characters as `prefix` for display. Never store or log the raw token.
- Fields as in the context file. `scopes` come from this fixed set: `songs:read`, `songs:write`, `media:write` (upload sessions and completes, for instrumentals and takes), `takes:read`, `songs:delete`.
- `songs:delete` is never pre-selected and the UI labels it as dangerous.

### 2. Auth resolution
Extend `requireUser({ scope })`:
- Session cookie: full access for that user.
- `Authorization: Bearer sp_...`: hash, look up, reject if revoked or expired, check the required scope, resolve to the token's `userId`. Update `lastUsedAt` at most once per minute.
- Unknown, revoked, expired tokens all return `UNAUTHENTICATED` with the same message (do not reveal which).
- Bearer requests skip the Origin check from Phase 1; cookie requests keep it.
- Apply a scope to every existing route: reads need `songs:read` or `takes:read`; create/update need `songs:write`; upload-session/complete need `media:write`; deletes need `songs:delete`; media streaming needs `songs:read` (or `takes:read` for takes).
- Token-management routes accept the session cookie only, never a bearer token.

### 3. Token management API
- `POST /api/tokens` `{ name, scopes[], expiresInDays? }` (options 1, 7, 30, 90; default 30; "never" allowed only if explicitly requested). Returns the raw token once.
- `GET /api/tokens`: name, prefix, scopes, createdAt, lastUsedAt, expiresAt, revokedAt (no hashes).
- `DELETE /api/tokens/:id`: sets `revokedAt`; effective immediately.
- Cap at 20 active tokens per user.

### 4. Rate limiting
Mongo-backed fixed-window counter (TTL index), keyed by token id: 120 requests per minute for tokens, return `RATE_LIMITED` with `Retry-After`. (In-memory limiters do not work on serverless.)

### 5. Settings UI
`/settings/agents`: create-token form (name, scope checkboxes with plain-language descriptions, expiry), a copy-once dialog that shows the token with a clear "you will not see this again" warning, a list of tokens with prefix, last used, revoke button. CSS Modules only.

### 6. Audit trail
Small `AuditLog` collection: `userId`, `tokenId?`, `action` (e.g. `song.create`, `song.delete`, `media.complete`), `targetId`, `at`. Write an entry for every mutating call made with a bearer token. No UI needed.

### 7. Tests
Hash-only storage, scope enforcement on each route, revoked and expired tokens, bearer token cannot create tokens, rate limiter, `lastUsedAt` throttling, token from user A cannot touch user B's data.

## Acceptance criteria
- Create a token with only `songs:read`: `GET /api/songs` works, `POST /api/songs` returns `FORBIDDEN`.
- Revoke it and the next request fails immediately.
- The database never contains a raw token; server logs never print one.

## Out of scope
The MCP server itself (Phase 5).
