import { describe, expect, it } from "vitest";
import { plainTextToTiptap, tiptapToPlainText } from "./convert";
import { LyricsValidationError, validateLyricsDoc } from "./validate";

describe("plainTextToTiptap", () => {
  it("turns section labels into level-3 headings", () => {
    const doc = plainTextToTiptap("[Verse 1]\nHello world");

    expect(doc.content).toEqual([
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Verse 1" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello world" }],
      },
    ]);
  });

  it("keeps blank lines as empty paragraphs", () => {
    const doc = plainTextToTiptap("one\n\ntwo");

    expect(doc.content).toHaveLength(3);
    expect(doc.content[1]).toEqual({ type: "paragraph" });
  });

  it("represents empty lyrics as one empty paragraph", () => {
    expect(plainTextToTiptap("")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});

describe("tiptapToPlainText", () => {
  it("round-trips paragraph-only lyrics", () => {
    const text = "Sing it\n\nOne more time";
    expect(tiptapToPlainText(plainTextToTiptap(text))).toBe(text);
  });

  it("drops section brackets when converting headings back to text", () => {
    expect(
      tiptapToPlainText(plainTextToTiptap("[Chorus]\nSing it")),
    ).toBe("Chorus\nSing it");
  });

  it("renders marks, lists and hard breaks", () => {
    const text = tiptapToPlainText({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bold",
              marks: [{ type: "bold" }],
            },
            { type: "hardBreak" },
            { type: "text", text: "next" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "first" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "second" }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(text).toBe("bold\nnext\n- first\n  second");
  });
});

describe("validateLyricsDoc", () => {
  it("accepts a safe document", () => {
    const doc = validateLyricsDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "hello",
              marks: [{ type: "italic" }],
            },
          ],
        },
      ],
    });

    expect(doc.content[0].content?.[0].marks).toEqual([{ type: "italic" }]);
  });

  it("rejects mark attributes", () => {
    expect(() =>
      validateLyricsDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "hello",
                marks: [{ type: "italic", attrs: { color: "red" } }],
              },
            ],
          },
        ],
      }),
    ).toThrow("Marks may not have attributes");
  });

  it("rejects unknown nodes", () => {
    expect(() =>
      validateLyricsDoc({
        type: "doc",
        content: [{ type: "script", content: [] }],
      }),
    ).toThrow(LyricsValidationError);
  });

  it("rejects unexpected attributes", () => {
    expect(() =>
      validateLyricsDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { textAlign: "center" },
          },
        ],
      }),
    ).toThrow("Unexpected attribute");
  });

  it("rejects unsafe marks", () => {
    expect(() =>
      validateLyricsDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "link", attrs: { href: "https://x" } }],
              },
            ],
          },
        ],
      }),
    ).toThrow("Mark not allowed");
  });

  it("rejects heading levels outside 1-3", () => {
    expect(() =>
      validateLyricsDoc({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 4 } }],
      }),
    ).toThrow("Heading level");
  });

  it("rejects non-document input", () => {
    expect(() => validateLyricsDoc({ type: "paragraph" })).toThrow(
      "Lyrics must be a document",
    );
    expect(() => validateLyricsDoc(null)).toThrow("Lyrics must be a document");
  });
});
