# ADR 0003: Mock Mongoose in the default test suite

## Status

Accepted.

## Context

Route-handler and model tests need to be fast and runnable without a MongoDB binary in
CI or on a Windows workstation.

## Decision

The default Vitest suite mocks Mongoose models and services. Route handlers are invoked
directly with a Web `Request`, with `requireUser` and data modules mocked. Schema
assertions inspect `schema.indexes()` and validators to catch missing unique, partial and
TTL indexes.

An optional integration suite against a real MongoDB can be added later behind an env
flag.

## Consequences

- Fast, deterministic tests with no external services.
- Index and TTL behavior is not exercised at runtime; schema assertions compensate.
- Query semantics (e.g. partial index behavior) must be verified manually or by the
  optional integration suite.
