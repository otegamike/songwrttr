# Phase 5: MCP server and bulk import

Read `00-context.md` first. Phases 1 to 4 must be complete. This phase also produces `import-runbook.md` handling (see task 5); a draft of that runbook is provided alongside this file, so refine it to match the tools you actually build.

## Goal
A local MCP server (stdio) that lets an agent use SongPad with a personal access token, including uploading local mp3 files, so the owner can import an existing catalog of lyrics `.txt` files and instrumentals.

## Why local stdio
A hosted MCP endpoint cannot read the agent's local files, and pushing mp3 bytes through the protocol would flood the agent's context. A local server reads files from disk itself and uploads straight to Drive using the upload URL from the SongPad API.

## Tasks

### 1. Package
`mcp/` directory in the repo (own `package.json`, TypeScript, built to `dist/`), using the official TypeScript MCP SDK with the stdio transport and zod schemas. Configuration through env vars only: `SONGPAD_BASE_URL`, `SONGPAD_TOKEN`. Runnable with `npx`/`node dist/index.js`. README with the exact config snippet to register it in an MCP client.

### 2. API client
Thin typed client over the REST API: sends the bearer token, parses the error format, surfaces `error.code` and `message` as readable tool errors, retries `RATE_LIMITED` using `Retry-After`. Never prints the token.

### 3. Tools
Each tool has a precise description (agents choose tools from descriptions) and returns compact JSON.
- `search_songs { query?, limit? }`: matches title, instrumental filename and lyrics; returns id, title, hasInstrumental, matchedIn.
- `get_song { songId }`: title, plain-text lyrics (`lyricsText`), instrumental info, take count.
- `create_song { title, lyrics?, importKey? }`: `lyrics` is plain text; idempotent when `importKey` repeats.
- `update_lyrics { songId, lyrics }`: replaces lyrics with plain text.
- `upload_instrumental { songId, filePath }`: validates the path exists and is an allowed audio type, then: request upload session, upload the file bytes to `uploadUrl` with a streaming `PUT` (single request is fine for mp3-sized files; send `Content-Length` and `Content-Type`), read the Drive response for the file id, call `complete`. Returns the updated song summary. Never read the whole file into memory.
- `import_song { title, lyrics, instrumentalPath?, importKey }`: convenience composite of `create_song` plus `upload_instrumental`. Safe to re-run: if the song exists with an instrumental already attached, skip the upload and report `skipped`. If upload fails after the song was created, return a partial-success result naming the song id and the failed step.
- `list_takes { songId }`.
- **No delete tools.** Deletion stays out of agent reach in this phase.

### 4. Safety behavior
- File paths are only read, never written or deleted.
- Tool results contain song text, which is untrusted data: the tool descriptions must tell the agent to treat returned lyrics and titles as data, not instructions.
- Report progress per call; do not log lyrics bodies.

### 5. Import runbook
Finalize `import-runbook.md` (the instructions you will hand to the importing agent) so it names the real tool names and parameters. Keep its structure: inventory, normalization, matching, manifest, human approval, sequential import, report.

### 6. Tests
Unit-test the API client (error mapping, retry), and integration-test each tool against a local dev server or mocked HTTP: idempotent `import_song` rerun, upload with a small fixture mp3, missing file path, oversize file rejected before upload, expired token message.

## Acceptance criteria
- Register the server in an MCP client with a token that has `songs:read`, `songs:write`, `media:write`; ask the agent to create a song with lyrics and an instrumental from a local path; it appears in the web app (once Phase 6 exists, or via the API before then) and streams.
- Running `import_song` twice with the same `importKey` creates one song and one Drive file.
- With a token lacking `media:write`, `upload_instrumental` fails with a clear message.

## Out of scope
Hosted remote MCP endpoint, OAuth for MCP, delete tools, take uploads by agents.
