import { getEnv } from "@/lib/config/env";
import { ApiError } from "./errors";

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new ApiError("FORBIDDEN", "Origin header is required");
  }

  const allowed = new Set<string>();
  const configured = normalizeOrigin(getEnv().NEXTAUTH_URL);
  if (configured) allowed.add(configured);

  for (const extra of (process.env.ALLOWED_ORIGINS ?? "").split(",")) {
    const normalized = normalizeOrigin(extra.trim());
    if (normalized) allowed.add(normalized);
  }

  const requestOrigin = normalizeOrigin(origin);
  if (!requestOrigin || !allowed.has(requestOrigin)) {
    throw new ApiError("FORBIDDEN", "Cross-origin request rejected");
  }
}
