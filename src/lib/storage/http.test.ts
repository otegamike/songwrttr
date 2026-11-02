import { describe, expect, it, vi } from "vitest";
import { StorageError } from "./errors";
import {
  assertDriveOk,
  requestWithRetry,
  type FetchLike,
} from "./http";

function response(status: number, body = ""): Response {
  return new Response(body, { status });
}

describe("requestWithRetry", () => {
  it("retries 429 responses and then succeeds", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200, "ok"));
    const sleep = vi.fn(async () => undefined);

    const result = await requestWithRetry(
      "https://example.test",
      { method: "GET" },
      { fetchImpl, sleep, random: () => 0.5, maxAttempts: 4 },
    );

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx responses up to the attempt limit", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(response(503));
    const sleep = vi.fn(async () => undefined);

    const result = await requestWithRetry(
      "https://example.test",
      { method: "GET" },
      { fetchImpl, sleep, random: () => 0, maxAttempts: 3 },
    );

    expect(result.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries network failures and then throws", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValue(new Error("network down"));
    const sleep = vi.fn(async () => undefined);

    await expect(
      requestWithRetry(
        "https://example.test",
        { method: "GET" },
        { fetchImpl, sleep, maxAttempts: 2 },
      ),
    ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
});

describe("assertDriveOk", () => {
  it("passes through successful responses", async () => {
    const result = await assertDriveOk(response(206));
    expect(result.status).toBe(206);
  });

  it("maps 404 to FILE_MISSING", async () => {
    await expect(assertDriveOk(response(404))).rejects.toMatchObject({
      code: "FILE_MISSING",
    });
  });

  it("maps 401 to DRIVE_RECONNECT_REQUIRED", async () => {
    await expect(assertDriveOk(response(401))).rejects.toMatchObject({
      code: "DRIVE_RECONNECT_REQUIRED",
    });
  });

  it("maps storageQuotaExceeded to DRIVE_QUOTA_EXCEEDED", async () => {
    await expect(
      assertDriveOk(response(403, JSON.stringify({ reason: "storageQuotaExceeded" }))),
    ).rejects.toMatchObject({ code: "DRIVE_QUOTA_EXCEEDED" });
  });

  it("maps other failures to STORAGE_UNAVAILABLE", async () => {
    const error = await assertDriveOk(response(400, "bad request")).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
});
