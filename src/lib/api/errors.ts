import { ZodError } from "zod";
import { StorageError } from "@/lib/storage/errors";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "TOO_LARGE"
  | "RATE_LIMITED"
  | "FILE_MISSING"
  | "DRIVE_RECONNECT_REQUIRED"
  | "DRIVE_QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  TOO_LARGE: 413,
  RATE_LIMITED: 429,
  FILE_MISSING: 410,
  DRIVE_RECONNECT_REQUIRED: 403,
  DRIVE_QUOTA_EXCEEDED: 409,
  STORAGE_UNAVAILABLE: 502,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: unknown,
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
    this.headers = headers;
  }
}

function isMongoDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return new ApiError(
      "VALIDATION_ERROR",
      "Request data is invalid",
      error.flatten(),
    );
  }

  if (error instanceof StorageError) {
    switch (error.code) {
      case "DRIVE_RECONNECT_REQUIRED":
        return new ApiError("DRIVE_RECONNECT_REQUIRED", error.message);
      case "DRIVE_QUOTA_EXCEEDED":
        return new ApiError("DRIVE_QUOTA_EXCEEDED", error.message);
      case "FILE_MISSING":
        return new ApiError("FILE_MISSING", error.message);
      default:
        return new ApiError("STORAGE_UNAVAILABLE", "Storage request failed");
    }
  }

  if (isMongoDuplicateKey(error)) {
    return new ApiError(
      "VALIDATION_ERROR",
      "A record with that value already exists",
    );
  }

  return new ApiError("INTERNAL", "Something went wrong");
}
