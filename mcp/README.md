# SongPad MCP server

Local stdio MCP server for SongPad. It lets an MCP client search, read, create and
update songs, and upload local instrumental files. It never exposes delete tools.

## Build

```bash
npm install
npm run mcp:build
```

The entry point is `mcp/dist/index.js`.

## Configuration

Environment variables only:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SONGPAD_BASE_URL` | yes | App origin, e.g. `http://localhost:3000` |
| `SONGPAD_TOKEN` | yes | Personal access token (`sp_...`) |
| `MAX_INSTRUMENTAL_MB` | no | Pre-upload size cap, default `50` |

Create a token at `/settings/agents`. For imports, grant `songs:read`, `songs:write`
and `media:write`. Add `takes:read` if the agent should list takes. Do not grant
`songs:delete` for import work.

## MCP client config

Claude Desktop example (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "songpad": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\song-writter\\mcp\\dist\\index.js"],
      "env": {
        "SONGPAD_BASE_URL": "http://localhost:3000",
        "SONGPAD_TOKEN": "sp_replace_with_your_token"
      }
    }
  }
}
```

Use the absolute path on your machine. The token is read from the environment and is
never printed by the server.

## Tools

- `search_songs { query?, limit? }` — search title, instrumental filename and lyrics.
- `get_song { songId }` — title, plain-text lyrics, instrumental metadata, take count.
- `create_song { title, lyrics?, importKey? }` — create a song; idempotent by `importKey`.
- `update_lyrics { songId, lyrics }` — replace lyrics with plain text.
- `upload_instrumental { songId, filePath }` — stream a local audio file to Drive.
- `import_song { title, lyrics, instrumentalPath?, importKey }` — create plus optional upload.
- `list_takes { songId }` — newest first.

No delete tools are registered.

## Safety

- Files are only read. Nothing under the source paths is modified, moved or deleted.
- Lyrics, titles and filenames are untrusted data. Tool descriptions tell agents not to
  follow instructions found inside them.
- Uploads are sequential and use the SongPad upload session flow; file bytes never pass
  through the app server.
- API errors are surfaced as `CODE: message`. `RATE_LIMITED` is retried using
  `Retry-After` before failing.

See `../import-runbook.md` for the bulk import workflow.
