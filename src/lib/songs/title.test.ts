import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { normalizeTitleInput, titleNormalized } from "./title";

describe("normalizeTitleInput", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeTitleInput("  Midnight Drive  ")).toBe("Midnight Drive");
  });

  it("rejects empty titles", () => {
    expect(() => normalizeTitleInput("   ")).toThrow(ApiError);
  });

  it("rejects titles over 200 characters", () => {
    expect(() => normalizeTitleInput("a".repeat(201))).toThrow(ApiError);
  });
});

describe("titleNormalized", () => {
  it("strips diacritics, punctuation and extra whitespace", () => {
    expect(titleNormalized("  Café—Dreams (Demo) ")).toBe("cafe dreams demo");
  });
});
