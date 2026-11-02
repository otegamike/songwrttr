import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessRequest } from "@/models/AccessRequest";
import { AllowedEmail } from "@/models/AllowedEmail";
import { enforceWindowLimit } from "@/lib/rate-limit/window";
import { POST } from "./route";

vi.mock("@/models/AccessRequest", () => ({ AccessRequest: { updateOne: vi.fn() } }));
vi.mock("@/models/AllowedEmail", () => ({ AllowedEmail: { exists: vi.fn() } }));
vi.mock("@/lib/rate-limit/window", () => ({ enforceWindowLimit: vi.fn() }));

function request(body: unknown) { return new Request("http://localhost:3000/api/access-requests", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" }, body: JSON.stringify(body) }); }
afterEach(() => vi.resetAllMocks());

describe("public access request", () => {
  it("normalizes email and returns the generic response", async () => {
    vi.mocked(AllowedEmail.exists).mockResolvedValue(null);
    vi.mocked(AccessRequest.updateOne).mockResolvedValue({} as never);
    const response = await POST(request({ email: "  Person@Example.com ", message: "hello" }), { params: Promise.resolve({}) });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(AccessRequest.updateOne).toHaveBeenCalledWith({ email: "person@example.com" }, expect.objectContaining({ $setOnInsert: expect.objectContaining({ status: "new" }) }), { upsert: true });
    expect(enforceWindowLimit).toHaveBeenCalledWith(expect.stringMatching(/^public-access:/), 5, 3_600_000);
  });

  it("returns the same success for an already-allowed address", async () => {
    vi.mocked(AllowedEmail.exists).mockResolvedValue({ _id: "allowed" } as never);
    const response = await POST(request({ email: "person@example.com" }), { params: Promise.resolve({}) });
    expect(response.status).toBe(202);
    expect(AccessRequest.updateOne).not.toHaveBeenCalled();
  });

  it("silently accepts the honeypot without saving", async () => {
    const response = await POST(request({ email: "robot@example.com", website: "filled" }), { params: Promise.resolve({}) });
    expect(response.status).toBe(202);
    expect(enforceWindowLimit).not.toHaveBeenCalled();
  });
});
