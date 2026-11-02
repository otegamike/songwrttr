import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { RateLimit } from "@/models/RateLimit";
import { enforceTokenRateLimit } from "./tokenLimiter";

vi.mock("@/models/RateLimit", () => ({
  RateLimit: {
    findOneAndUpdate: vi.fn(),
  },
}));

const findOneAndUpdate = RateLimit.findOneAndUpdate as unknown as Mock;

function queryChain(result: unknown) {
  return {
    lean: vi.fn().mockResolvedValue(result),
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("enforceTokenRateLimit", () => {
  it("allows requests up to the limit", async () => {
    findOneAndUpdate.mockReturnValue(queryChain({ count: 120 }));

    await expect(
      enforceTokenRateLimit("token-1", Date.now()),
    ).resolves.toBeUndefined();
  });

  it("rejects requests over 120 per minute with Retry-After", async () => {
    findOneAndUpdate.mockReturnValue(queryChain({ count: 121 }));

    await expect(
      enforceTokenRateLimit("token-1", Date.now()),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      headers: { "Retry-After": expect.any(String) },
    });
  });

  it("retries once when the window upsert races", async () => {
    findOneAndUpdate
      .mockReturnValueOnce({
        lean: vi.fn().mockRejectedValue({ code: 11000 }),
      })
      .mockReturnValueOnce(queryChain({ count: 2 }));

    await enforceTokenRateLimit("token-1", Date.now());

    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
  });
});
