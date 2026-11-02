export type StorageErrorCode =
  | "DRIVE_RECONNECT_REQUIRED"
  | "DRIVE_QUOTA_EXCEEDED"
  | "FILE_MISSING"
  | "STORAGE_UNAVAILABLE";

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(
    code: StorageErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}
