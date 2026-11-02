# Phase 8 manual QA and owner checklist

- [ ] Logged-out visitors see the public landing page; logged-in visitors go to `/songs`.
- [ ] Landing demo makes no network audio request, does not autoplay and never asks for microphone permission.
- [ ] Demo lyrics toggle, synthesized loop, mute, progress slider and simulated take timer work with reduced motion enabled.
- [ ] Access form shows clear success, validation, network and rate-limit states; duplicate and already-allowed emails return the same success.
- [ ] Admin can approve a request (it becomes an active invite) or dismiss it.
- [ ] Account deletion requires typing `DELETE`, revokes Google authorization, removes app records and leaves Drive files untouched.
- [ ] User song, take, total audio and upload rate caps reject excess use before a Drive upload session is created.
- [ ] Inspect CSP in browser DevTools: OAuth, Google Drive upload, blob audio and local assets work; framing is blocked.
- [ ] `/robots.txt`, `/sitemap.xml`, canonical links, Open Graph image, and noindex metadata for logged-in pages are correct.
- [ ] Verify `/privacy` and `/terms` are clearly labeled owner-review drafts before publishing.
- [ ] Complete every item in `PUBLIC-LAUNCH-CHECKLIST.md` before inviting others.
