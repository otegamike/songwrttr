import { StorageError } from "./errors";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RetryOptions {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt: number, random: () => number): number {
  const base = Math.min(250 * 2 ** (attempt - 1), 4000);
  return Math.round(base * (0.5 + random() * 0.5));
}

export async function requestWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 4;

  let lastNetworkError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      lastNetworkError = error;
      if (attempt === maxAttempts) break;
      await sleep(backoffMs(attempt, random));
      continue;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < maxAttempts) {
      await response.body?.cancel().catch(() => undefined);
      await sleep(backoffMs(attempt, random));
      continue;
    }

    return response;
  }

  throw new StorageError("STORAGE_UNAVAILABLE", "Google Drive request failed", {
    cause: lastNetworkError,
  });
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function assertDriveOk(response: Response): Promise<Response> {
  if (response.ok) return response;

  const body = await readBody(response);

  if (response.status === 404) {
    throw new StorageError("FILE_MISSING", "Drive file not found");
  }

  if (response.status === 401) {
    throw new StorageError(
      "DRIVE_RECONNECT_REQUIRED",
      "Google Drive access expired; reconnect required",
    );
  }

  if (body.includes("storageQuotaExceeded")) {
    throw new StorageError(
      "DRIVE_QUOTA_EXCEEDED",
      "Google Drive storage quota exceeded",
    );
  }

  if (
    response.status === 403 &&
    (body.includes("insufficientPermissions") ||
      body.includes("invalid_grant"))
  ) {
    throw new StorageError(
      "DRIVE_RECONNECT_REQUIRED",
      "Google Drive permissions are insufficient; reconnect required",
    );
  }

  throw new StorageError(
    "STORAGE_UNAVAILABLE",
    `Google Drive request failed with status ${response.status}`,
  );
}
