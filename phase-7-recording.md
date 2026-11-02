# Phase 7: Recording and takes

Read `00-context.md` first. Phases 1 to 3 and 6 must be complete.

## Goal
Record vocals over the playing instrumental, save each take to the user's Drive, and browse, play, rename and delete takes. Takes play **alone** (no sync or mixing with the instrumental), so no latency offset is stored.

## Tasks

### 1. Recorder hook (`useRecorder`)
- `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`. These must be off: they damage singing and fight the playing beat.
- Pick the `MediaRecorder` mime type by feature detection in this order: `audio/webm;codecs=opus`, `audio/mp4`, `audio/ogg;codecs=opus`. Store the chosen type with the take.
- States: `idle`, `requesting-permission`, `recording`, `stopped` (with blob), `error`. Distinct, friendly messages for permission denied, no input device, and unsupported browser.
- Measure `durationMs` with a timer (do not trust blob metadata; recorded webm often reports an infinite duration).
- Always stop all mic tracks and clean up on stop, unmount and route change.
- Collect data with `timeslice` (e.g. 1 s) so a crash loses little.

### 2. Record button behavior
- The record button lives in the instrumental area under the play button. One click handler does both: start the recorder and start instrumental playback (must be in the same user gesture so mobile Safari allows it).
- Playback starts from the **current seek position**.
- Stop ends both. If the instrumental reaches its end, recording stops automatically.
- If the song has no instrumental, recording still works (a metronome-free plain voice recording); the button simply records.
- First-time notice, dismissible and remembered: "Use headphones so the beat isn't picked up by your mic."
- Optional but desirable: a simple input level meter using `AnalyserNode` while recording, respecting reduced motion.

### 3. After recording
A review panel: play the take back, name it (default "Take N"), then **Save** or **Discard**. Save runs the Phase 3 flow: request session, upload to `uploadUrl` with progress, `complete` with `durationMs`. 
- If the upload fails, keep the blob in IndexedDB as a pending take and show it with "Retry upload" so a recording is never lost. Remove it from IndexedDB after success or explicit discard.
- Handle `DRIVE_QUOTA_EXCEEDED` and `DRIVE_RECONNECT_REQUIRED` with the same banners as Phase 6.

### 4. Takes bar and list
- A bar fixed at the bottom of the song page: "Recordings (N)". Tapping opens a bottom sheet (focus-trapped, closable with Escape or swipe/backdrop tap) listing all takes, newest first.
- Each take: name, duration, date, play/pause with a small seek bar, rename (inline), delete (confirm dialog).
- Takes are loaded with the Phase 6 audio cache (`getAudioUrl`), so replays do not hit the network. Newly saved takes can be cached immediately from the local blob.
- Only one audio source plays at a time: starting a take pauses the instrumental and other takes, and vice versa. Recording is disabled while a take is playing, and vice versa.

### 5. Edge cases
- Tab hidden or phone locked while recording: show the state when returning; do not silently drop data.
- Very long recordings: warn when approaching `MAX_TAKE_MB`; stop and save gracefully at the limit.
- Browsers without `MediaRecorder`: hide recording UI and show a clear explanation.

### 6. Tests
Hook tests with a mocked `MediaRecorder` and `getUserMedia` (mime selection, state transitions, cleanup, permission errors); takes list behaviors (rename, delete confirm, single-audio-at-a-time); pending-upload retry logic. Provide a manual QA checklist for Chrome, Firefox, iOS Safari and Android Chrome (permission prompt, headphones, backgrounding).

## Acceptance criteria
- Record 30 seconds over an instrumental with headphones, save, reload, and the take appears in the bar with a correct duration and plays.
- Kill the network mid-upload: the take remains as pending and uploads on retry.
- Rename and delete work; deleted takes disappear from Drive (trashed) and from the list.
- Mic indicator in the browser turns off after stopping.

## Out of scope
Mixing takes with the instrumental, latency compensation, waveform editing.
