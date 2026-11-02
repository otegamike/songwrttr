# Phase 8: Landing page and public readiness

Read `00-context.md` first. Phases 1 to 3 and 6 must be complete. Phase 7 is helpful for the demo's look but not required.

## Goal
A fast, visual, interactive landing page that explains the product, a request-access flow feeding the invite list, and the policy and safety pieces needed before inviting people beyond the owner.

## Design rules
CSS Modules plus tokens. **No Tailwind.** Static where possible, minimal JavaScript, demo code lazy-loaded. Respect `prefers-reduced-motion` and light/dark. Lighthouse targets: performance 90+, accessibility 95+.

## Tasks

### 1. Landing page (`/`, logged-out visitors; logged-in users redirect to `/songs`)
Sections:
1. **Hero**: one-line pitch, short subline, an animated waveform that is purely decorative, a "Request access" call to action and a "Sign in" link.
2. **Interactive demo** (the centerpiece), a mock song page that visitors can actually use:
   - A lyrics block with a lock/pencil toggle: locked by default, unlocking makes it editable (a plain `contenteditable` here, not Tiptap, to keep the bundle small).
   - A play button that plays a short loop **synthesized with the Web Audio API** (kick, hat, bass at about 90 BPM using oscillators and a noise buffer). No audio files. Audio only starts on user gesture; include a mute control.
   - A seek/progress bar tied to the loop.
   - A record button that shows a running timer and animated level bars, and on stop adds a "Take 1" row to a small recordings list. It is **simulated**: it never asks for the microphone.
   - A caption that says it is an interactive preview.
3. **How it works**: three steps (add a beat, write lyrics, record takes).
4. **Your audio stays yours**: explain that audio lives in the user's own Google Drive, the app only touches files it creates itself, and what is stored on the app's servers (titles, lyrics, metadata, an encrypted access token).
5. **For agents**: a short note that the app can be used by AI agents with scoped, revocable tokens (link to docs if they exist, otherwise just the note).
6. **Request access** form and footer (privacy, terms, contact).

### 2. Request access
- `POST /api/access-requests` `{ email, message? }`: validate, lowercase, store an `AccessRequest`. Honeypot field plus per-IP rate limiting (Mongo-backed fixed window). Same success response whether or not the email already exists.
- Show requests in `/admin/invites` with actions: approve (creates an active `AllowedEmail` and marks the request approved) and dismiss.
- Clear success and error states in the form.

### 3. Policy pages
- `/privacy` and `/terms`, with content written as a **draft for the owner to review** (state this in your summary; do not present it as legal advice). The privacy page must plainly cover: the `drive.file` scope and what it does and does not allow, exactly what is stored in the database, encrypted token storage, where audio lives, how to revoke access (Google account permissions page and in-app), how to delete the account and data, and a contact email placeholder. Include a statement about adherence to Google's API Services User Data Policy, marked for the owner to verify against Google's current wording.
- These URLs, plus the landing page, are what the Google OAuth consent screen needs as homepage and privacy policy links.

### 4. Account deletion
- `DELETE /api/account` (session auth only, requires a typed confirmation in the UI): revoke the stored Google refresh token at Google's revoke endpoint, delete the user's songs, takes, tokens, upload sessions, audit logs and user document. Leave the user's Drive files untouched by default and say so; optionally offer a checkbox to trash the app folder.
- UI in `/settings/account`.

### 5. Abuse and cost limits
- Per-user caps with env-configurable defaults: songs (e.g. 500), takes per song (e.g. 50), total stored audio bytes per user as tracked from `size` fields (e.g. 5 GB). Enforce at `upload-session` and create routes with clear `VALIDATION_ERROR` or `TOO_LARGE` messages.
- Rate limit song creation and upload-session requests per user.
- Security headers via `next.config`: a restrictive Content-Security-Policy (allow own origin, Google endpoints needed for auth and uploads, `blob:` for audio), `X-Content-Type-Options`, `Referrer-Policy`, frame protection.

### 6. SEO and sharing
Page title, description, canonical URL, Open Graph and Twitter tags, an OG image (static asset or generated), `robots.txt` and sitemap. The app routes behind login get `noindex`.

### 7. Tests and checks
Access-request endpoint (validation, duplicate handling, rate limit, honeypot), approve-flow creating an `AllowedEmail`, account deletion removes all user data and revokes the token (mock Google), cap enforcement, CSP does not break sign-in, upload or audio playback (manual checklist). Include a final public-launch checklist in your summary: Google consent screen fields filled in and set to production, `ADMIN_EMAIL` and encryption key set in Vercel, Vercel plan terms checked for non-commercial restrictions, Atlas network access and backups, error monitoring.

## Acceptance criteria
- The landing demo works with no microphone permission and no network audio files, and does not autoplay.
- A visitor submits a request; the admin approves it; that email can now sign in.
- Deleting an account leaves no documents referencing that user and invalidates their Google token.
- Lighthouse targets met on the landing page.

## Out of scope
Android/PWA wrapping, S3 storage, payments.
