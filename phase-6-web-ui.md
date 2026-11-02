# Phase 6: Web UI (song list, search, song page, lyrics, instrumental player, caching)

Read `00-context.md` first. Phases 1 to 3 must be complete (Phases 4 and 5 are not required). Recording and the takes list are Phase 7; leave a clearly marked slot for them.

## Goal
A polished, fast, mobile-friendly UI for browsing songs, searching, editing rich-text lyrics safely, and playing the instrumental with heavy client-side caching.

## Design rules
- CSS Modules plus tokens from `src/styles/tokens.css`. **No Tailwind.**
- Mobile first, works from 360 px up. Light and dark via `prefers-color-scheme`.
- Calm "studio" feel: generous spacing, one accent color, large tap targets (44 px min).
- Accessible: real buttons and labels, visible focus rings, keyboard-operable seek bar, `aria-live` for save status and errors, respects `prefers-reduced-motion`.
- Every async area has loading, empty and error states.

## Tasks

### 1. Song list page (`/songs`)
- Header with app name, a "New song" button, user menu (sign out, link to agent settings if Phase 4 exists).
- Search input pinned at the top, debounced 250 ms, synced to the `?q=` URL param, with a clear button.
- List items show the title, a small instrumental indicator, and **match badges** from `matchedIn` ("title", "instrumental", "lyrics"), plus the lyrics `snippet` when present with the matched text highlighted (escape before highlighting; never inject raw HTML).
- Pagination via "Load more" using the cursor.
- "New song" asks only for a title, creates the song, and navigates to it.
- Empty states: no songs yet; no search results.

### 2. Song page (`/songs/[id]`)
Order from top to bottom:
1. **Title**: inline-editable (click or an edit control), saves on blur or Enter, Escape cancels.
2. **Lyrics**: Tiptap editor (StarterKit plus underline), **read-only by default**. A pencil icon button toggles edit mode (`aria-pressed`, visible state change). In edit mode show a compact toolbar (bold, italic, underline, heading, bullet list). Autosave: debounce 1 s after the last change, show "Saving..." / "Saved" / "Couldn't save, retrying" status, flush on blur, on toggling edit off, and on route change. Only send changes when content actually changed. Unsaved-changes guard on tab close.
3. **Instrumental**: if none, an "Add instrumental" file picker (mp3 and other allowed types). If present, show the filename with replace and remove actions (confirm dialogs), play/pause button, seek bar (`input type=range`), current time and duration, and a loading state while the audio is being cached.
4. **Recording area slot** (empty placeholder component `RecordingSection` rendering nothing yet, so Phase 7 can plug in the record button and the bottom takes bar).
- Delete song in an overflow menu with a confirm dialog.

### 3. Upload flow (instrumental)
Use the Phase 3 endpoints: request session, then upload the file directly to `uploadUrl` with `XMLHttpRequest` (for upload progress events; show a progress bar and a cancel button), then `complete`. Handle `DRIVE_QUOTA_EXCEEDED`, `TOO_LARGE`, network failure (offer retry).

### 4. Audio cache (`src/lib/client/audioCache.ts`)
- Fetch `/api/media/:driveFileId` fully (show download progress), store the Blob in IndexedDB keyed by `${driveFileId}:${md5Checksum}`, and play from `URL.createObjectURL(blob)`. Seeking on blob URLs needs no Range support. Revoke object URLs on unmount or change.
- Cache hit means zero network. Cache miss means fetch then store.
- LRU eviction with a configurable total cap (default 500 MB), tracking `lastAccessedAt`.
- Call `navigator.storage.persist()` once, ignore failure. Treat the cache as an optimization: if IndexedDB is unavailable or full, fall back to streaming directly from the media URL.
- Expose a small API: `getAudioUrl(fileId, md5)`, `evict(fileId)`, `clear()`. Evict on instrumental replace or delete.
- Song list and song data: use SWR-style stale-while-revalidate (a small hook or SWR) so navigating back is instant.

### 5. Error states
- `DRIVE_RECONNECT_REQUIRED`: a banner with a "Reconnect Google Drive" button that starts sign-in with `prompt=consent`.
- `FILE_MISSING` (410): "This file is missing from your Drive" with options to re-upload or remove.
- `NOT_FOUND` on a song: friendly not-found page.

### 6. Tests
Component tests for the lyrics edit toggle (read-only by default, toggling works, autosave called once per debounce window), search debounce and URL sync, cache module (hit, miss, eviction order, fallback when IndexedDB throws). A short manual QA checklist in the PR notes.

## Acceptance criteria
- Create a song, add lyrics, toggle edit off and reload: lyrics persist and the editor is read-only again.
- Upload an mp3, play it, scrub the seek bar smoothly; reload and play again with the Network tab showing no media request (cache hit).
- Searching for a lyrics word finds the song and highlights the snippet.
- Works on a phone-width viewport and in dark mode.

## Out of scope
Recording, takes list, landing page.
