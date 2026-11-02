import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { apiHandler } from "./handler";

afterEach(() => {
  vi.restoreAllMocks();
});

function request(): Request {
  return new Request("http://localhost:3000/api/test", { method: "GET" });
}

const context = { params: Promise.resolve({}) };

describe("apiHandler", () => {
  it("passes successful responses through", async () => {
    const handler = apiHandler(async () => Response.json({ ok: true }));
    const response = await handler(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("maps ApiError to the shared error envelope", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const handler = apiHandler(async () => {
      throw new ApiError("NOT_FOUND", "Song not found");
    });
    const response = await handler(request(), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "Song not found" },
    });
  });

  it("hides unexpected errors behind INTERNAL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const handler = apiHandler(async () => {
      throw new Error("database exploded");
    });
    const response = await handler(request(), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INTERNAL", message: "Something went wrong" },
    });
  });
});
