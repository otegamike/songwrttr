# Phase 3: Media API (uploads, streaming, takes)

Read `00-context.md` first. Phases 1 and 2 must be complete.

## Goal
Instrumentals and takes can be uploaded straight to the user's Drive, verified by the server, streamed back through an authenticated proxy with Range support, and cleaned up on delete.

## Principles
- File bytes never pass through your functions on upload. The server creates a Drive resumable session; the client uploads to it; the server then verifies.
- The streaming proxy must stream (no buffering) and must only serve files that belong to the requesting user.

## Tasks

### 1. Instrumental
- `POST /api/songs/:id/instrumental/upload-session` `{ fileName, mimeType, size }`
  - Validate mime type against an allowlist (`audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/mp4`, `audio/aac`, `audio/ogg`) and `size <= MAX_INSTRUMENTAL_MB`.
  - `ensureSongFolder`, `createUploadSession` (pass the request's `Origin`), save an `UploadSession`, return `{ uploadId, uploadUrl, expiresAt }`.
- `POST /api/songs/:id/instrumental/complete` `{ uploadId, driveFileId }`
  - Load the `UploadSession` (must belong to this user and song). Fetch Drive metadata for `driveFileId` and verify: not trashed, parent equals the session's folder, `size` and `mimeType` match what was declared, `md5Checksum` present.
  - Set `song.instrumental`. If one existed, trash the old Drive file only after the new one is saved. Delete the `UploadSession`. Return the song.
- `DELETE /api/songs/:id/instrumental`: trash the Drive file first, then clear the field.

### 2. Takes
- `POST /api/songs/:id/takes/upload-session` `{ fileName, mimeType, size }` (allow `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`; `size <= MAX_TAKE_MB`).
- `POST /api/songs/:id/takes/complete` `{ uploadId, driveFileId, durationMs, name? }`: same verification as above. Default `name` is "Take N" (N = existing count + 1). `durationMs` comes from the client because recorded webm often lacks duration metadata.
- `GET /api/songs/:id/takes`: newest first.
- `PATCH /api/takes/:takeId` `{ name }`; `DELETE /api/takes/:takeId` (Drive first, then row).

### 3. Streaming proxy
`GET` and `HEAD /api/media/:driveFileId`:
- Authorize by finding a `Song.instrumental.driveFileId` or `Take.driveFileId` equal to the param **and** owned by the session user. Otherwise `404`. Never proxy an arbitrary Drive id.
- Forward the `Range` header to Drive via `streamFile`. Pass through `206`/`200`, `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`.
- Add `ETag` from `md5Checksum` and `Cache-Control: private, max-age=31536000, immutable` (file ids are immutable; `private` keeps shared caches away).
- Node runtime, dynamic, return the upstream stream as the body without reading it into memory.
- Drive 404 returns `FILE_MISSING` (410) so the UI can show a "file missing" state.

### 4. Song deletion cleanup
Fill in `cleanupSongMedia`: trash the instrumental and all take files, then the song folder if empty (best effort), then delete rows. If trashing fails for a reason other than 404, respond `502` and keep the rows so nothing is orphaned silently.

### 5. Error handling
Map `DRIVE_RECONNECT_REQUIRED`, `DRIVE_QUOTA_EXCEEDED`, `FILE_MISSING` consistently. Expired or unknown `uploadId` returns `NOT_FOUND`.

### 6. Tests (mock Drive)
Upload-session validation (bad mime, oversized), `complete` rejecting wrong parent / wrong size / trashed file / another user's session, proxy authorization (other user's file gets 404), Range pass-through (206 with correct headers), delete ordering and failure behavior, replacing an instrumental trashes the old file only after success.

## Acceptance criteria
- With a real Drive account: create a song, upload an mp3 using the returned URL (curl is fine), call `complete`, then `GET /api/media/:id` with a `Range: bytes=0-1023` header returns `206`.
- Another user cannot fetch the file by id.
- Deleting a song leaves no files in the app's Drive folder (trashed) and no rows.

## Out of scope
UI, tokens for agents, recording.
