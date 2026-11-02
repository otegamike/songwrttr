import { afterEach, describe, expect, it } from "vitest";
import { __resetEnvForTests } from "@/lib/config/env";
import { ApiError } from "./errors";
import { assertSameOrigin } from "./origin";

const ORIGINAL_URL = process.env.NEXTAUTH_URL;

afterEach(() => {
  process.env.NEXTAUTH_URL = ORIGINAL_URL;
  delete process.env.ALLOWED_ORIGINS;
  __resetEnvForTests();
});

function requestWithOrigin(origin?: string): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers,
  });
}

describe("assertSameOrigin", () => {
  it("allows a matching origin", () => {
    expect(() =>
      assertSameOrigin(requestWithOrigin("http://localhost:3000")),
    ).not.toThrow();
  });

  it("rejects a different origin", () => {
    expect(() =>
      assertSameOrigin(requestWithOrigin("https://evil.example")),
    ).toThrow(ApiError);
  });

  it("rejects a request with no Origin header", () => {
    expect(() => assertSameOrigin(requestWithOrigin())).toThrow(ApiError);
  });

  it("allows an explicitly configured extra origin", () => {
    process.env.ALLOWED_ORIGINS = "https://preview.example";
    __resetEnvForTests();

    expect(() =>
      assertSameOrigin(requestWithOrigin("https://preview.example")),
    ).not.toThrow();
  });
});
