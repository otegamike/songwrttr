export const ALL_SCOPES = [
  "songs:read",
  "songs:write",
  "media:write",
  "takes:read",
  "songs:delete",
] as const;

export type Scope = (typeof ALL_SCOPES)[number];
