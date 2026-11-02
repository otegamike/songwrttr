import { describe, expect, it } from "vitest";
import {
  buildSearchRegex,
  createSnippet,
  decodeCursor,
  encodeCursor,
  escapeRegExp,
  getMatchedIn,
  matchRank,
} from "./search";

describe("escapeRegExp", () => {
  it("escapes regular expression characters", () => {
    const value = "a.b*c(d)[e]{f}^$|?+\\";
    expect(new RegExp(escapeRegExp(value)).test(value)).toBe(true);
  });
});

describe("buildSearchRegex", () => {
  it("matches case-insensitively and literally", () => {
    const regex = buildSearchRegex("(demo)");

    expect(regex.test("A (DEMO) track")).toBe(true);
    expect(regex.test("A demo track")).toBe(false);
  });
});

describe("getMatchedIn", () => {
  it("reports every matching field", () => {
    const regex = /love/i;
    const matched = getMatchedIn(
      {
        title: "Love Song",
        instrumentalFileName: "love-beat.mp3",
        lyricsText: "I love you",
      },
      regex,
    );

    expect(matched).toEqual(["title", "instrumental", "lyrics"]);
  });
});

describe("matchRank", () => {
  it("ranks title matches ahead of lyrics matches", () => {
    expect(matchRank(["title"])).toBeLessThan(matchRank(["lyrics"]));
    expect(matchRank(["instrumental"])).toBeLessThan(matchRank(["lyrics"]));
  });
});

describe("createSnippet", () => {
  it("returns a bounded snippet with ellipses", () => {
    const text = `${"a".repeat(100)}needle${"b".repeat(100)}`;
    const snippet = createSnippet(text, /needle/, 10);

    expect(snippet).toContain("needle");
    expect(snippet?.startsWith("…")).toBe(true);
    expect(snippet?.endsWith("…")).toBe(true);
    expect(snippet?.length).toBeLessThan(text.length);
  });

  it("returns undefined when there is no match", () => {
    expect(createSnippet("hello", /world/)).toBeUndefined();
  });
});

describe("cursor helpers", () => {
  it("round-trips a cursor", () => {
    const cursor = {
      rank: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      id: "507f1f77bcf86cd799439011",
    };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed cursors", () => {
    expect(decodeCursor("not-base64")).toBeNull();
    expect(decodeCursor(Buffer.from("{}").toString("base64url"))).toBeNull();
  });
});
