# Phase 2: Songs and search API

Read `00-context.md` first. Phase 1 must be complete.

## Goal
Complete CRUD for songs with rich-text lyrics, plain-text conversion, and search across title, instrumental filename and lyrics.

## Tasks

### 1. Song model
As defined in the context file, including the unique partial index on `{userId, importKey}`. Do not add a text index; search uses escaped regex scoped to the user's own documents (fine at this scale; note Atlas Search as a future upgrade in code comments).

### 2. Lyrics utilities (`src/lib/lyrics/`)
- `plainTextToTiptap(text)`: one paragraph per line; blank lines become empty paragraphs; a line that is only `[Verse 1]`, `[Chorus]`, `(Bridge)` style becomes a level-3 heading; normalize `\r\n`; trim trailing whitespace.
- `tiptapToPlainText(doc)`: paragraphs and headings joined by newlines, list items prefixed with `- `, hard breaks as newlines.
- `validateLyricsDoc(doc)`: allowlist node types (`doc`, `paragraph`, `text`, `heading` levels 1 to 3, `bulletList`, `orderedList`, `listItem`, `hardBreak`, `blockquote`) and marks (`bold`, `italic`, `underline`, `strike`). Reject anything else, any attributes beyond heading level, and docs over 200 KB serialized.
- **`lyricsText` is always derived on the server from `lyricsJson`.** Never accept it from a client.
- Tests for all three, including malicious input.

### 3. Title handling
Trim, 1 to 200 characters. `titleNormalized`: lowercase, diacritics stripped, punctuation turned to spaces, whitespace collapsed.

### 4. Endpoints (all via `apiHandler` and `requireUser()`)
- `POST /api/songs`: `{ title, lyricsJson? | lyricsPlain?, importKey? }`. If `importKey` matches an existing song for this user, return it with `200` and `created: false` (idempotent); otherwise `201` and `created: true`.
- `GET /api/songs?q=&limit=&cursor=`: light payload (no `lyricsJson`): `id, title, updatedAt, hasInstrumental, instrumentalFileName, matchedIn[], snippet?`. Default limit 50, max 100, cursor pagination by `updatedAt` then `_id`.
- `GET /api/songs/:id`: full song including `lyricsJson`.
- `PATCH /api/songs/:id`: `{ title?, lyricsJson? | lyricsPlain? }`. Converts and validates as above.
- `DELETE /api/songs/:id`: deletes the song. Call a `cleanupSongMedia(song)` hook that is a no-op for now (Phase 3 fills it in).

### 5. Search behavior
- Query trimmed, max 100 characters, regex-escaped, case-insensitive, matched against `title`, `instrumental.fileName`, `lyricsText`.
- `matchedIn` lists which of `"title" | "instrumental" | "lyrics"` matched.
- `snippet` appears only for lyrics matches: about 40 characters of plain text on each side of the first match.
- Ordering with a query: title matches, then instrumental matches, then lyrics-only matches, each group by `updatedAt` desc. Without a query: `updatedAt` desc.

### 6. Tests
Conversion round trips; regex escaping (query like `.*(` must not error or match everything); ownership (user B gets `404` for user A's song, on every route); `importKey` idempotency; pagination; search ordering and `matchedIn`.

## Acceptance criteria
- All routes work with a signed-in session via a test client; unauthenticated gets `401`.
- Creating twice with the same `importKey` yields one song.
- A client-supplied `lyricsText` field is ignored.
- Search for a word that appears only in lyrics returns that song with `matchedIn: ["lyrics"]` and a snippet.

## Out of scope
File uploads and streaming (Phase 3), UI (Phase 6).
