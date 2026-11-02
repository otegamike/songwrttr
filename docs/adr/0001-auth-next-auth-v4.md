# ADR 0001: Use next-auth v4 LTS

## Status

Accepted.

## Context

`00-context.md` says to use the current stable Auth.js/NextAuth major version. As of
2026-11-02, `next-auth@4.24.15` is the `latest`/LTS line and supports Next 16. The v5
line is still published on the `beta` tag (`5.0.0-beta.32`).

## Decision

Use `next-auth@4.24.15` with the Google provider, JWT sessions, and `getServerSession`
inside route handlers and server components.

Environment variables are `NEXTAUTH_URL` and `NEXTAUTH_SECRET`. The app also accepts
`AUTH_URL` and `AUTH_SECRET` as fallbacks so deployments can use either naming.

## Consequences

- Stable, security-patched LTS line.
- Slightly older App Router ergonomics than v5.
- If v4 proves incompatible with a future Next release, migration to v5 is localized in
  `src/lib/auth/options.ts`, `src/lib/auth/guards.ts`, and the auth route.
