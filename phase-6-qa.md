# Phase 6 manual QA

- [ ] Sign in, open `/songs`, confirm loading, empty, and error states.
- [ ] Create a title-only song; verify it opens and appears in the list.
- [ ] Search title, instrumental filename, and lyrics text; confirm debounced `?q=`, match badges, and escaped highlighted snippet.
- [ ] Load more than 50 songs; confirm cursor pagination appends results.
- [ ] Open a song: lyrics start read-only; edit and format, wait for autosave, exit, reload, and verify persistence.
- [ ] Verify title saves on Enter/blur and Escape cancels.
- [ ] Upload an mp3, play/pause, scrub with keyboard and pointer, reload, and confirm cached playback makes no media request in DevTools.
- [ ] Replace/remove instrumental and confirm removal prompt and old cache eviction.
- [ ] Test missing Drive media (410) and reconnect-required account; verify recovery action.
- [ ] Delete a song and confirm linked files are trashed before database rows are removed.
- [ ] Check 360 px viewport, dark mode, keyboard focus, and reduced motion.

Do not run the import manifest or upload the local `Songs/` batch until matches are reviewed and the production environment is configured.
