import type { TiptapDoc, TiptapMark, TiptapNode } from "./types";

const MAX_DOC_BYTES = 200 * 1024;

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "hardBreak",
  "blockquote",
]);

const ALLOWED_MARKS = new Set(["bold", "italic", "underline", "strike"]);

const NODE_KEYS: Record<string, Set<string>> = {
  doc: new Set(["type", "content"]),
  paragraph: new Set(["type", "content"]),
  text: new Set(["type", "text", "marks"]),
  heading: new Set(["type", "attrs", "content"]),
  bulletList: new Set(["type", "content"]),
  orderedList: new Set(["type", "content"]),
  listItem: new Set(["type", "content"]),
  hardBreak: new Set(["type"]),
  blockquote: new Set(["type", "content"]),
};

export class LyricsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LyricsValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateMark(mark: unknown): TiptapMark {
  if (!isRecord(mark) || typeof mark.type !== "string") {
    throw new LyricsValidationError("Invalid lyric mark");
  }
  if (!ALLOWED_MARKS.has(mark.type)) {
    throw new LyricsValidationError(`Mark not allowed: ${mark.type}`);
  }
  if (Object.keys(mark).some((key) => key !== "type")) {
    throw new LyricsValidationError("Marks may not have attributes");
  }
  return { type: mark.type };
}

function validateNode(node: unknown): TiptapNode {
  if (!isRecord(node) || typeof node.type !== "string") {
    throw new LyricsValidationError("Invalid lyric node");
  }

  if (!ALLOWED_NODES.has(node.type)) {
    throw new LyricsValidationError(`Node not allowed: ${node.type}`);
  }

  const allowedKeys = NODE_KEYS[node.type];
  if (!allowedKeys) {
    throw new LyricsValidationError(`Node not allowed: ${node.type}`);
  }

  for (const key of Object.keys(node)) {
    if (!allowedKeys.has(key)) {
      throw new LyricsValidationError(
        `Unexpected attribute "${key}" on ${node.type}`,
      );
    }
  }

  if (node.type === "text") {
    if (typeof node.text !== "string") {
      throw new LyricsValidationError("Text nodes require a string text value");
    }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) {
        throw new LyricsValidationError("Marks must be an array");
      }
      node.marks = node.marks.map(validateMark);
    }
    return {
      type: "text",
      text: node.text,
      ...(node.marks ? { marks: node.marks as TiptapMark[] } : {}),
    };
  }

  if (node.type === "heading") {
    if (!isRecord(node.attrs)) {
      throw new LyricsValidationError("Headings require a level");
    }
    if (Object.keys(node.attrs).some((key) => key !== "level")) {
      throw new LyricsValidationError("Headings only accept a level attribute");
    }
    const level = node.attrs.level;
    if (level !== 1 && level !== 2 && level !== 3) {
      throw new LyricsValidationError("Heading level must be 1, 2 or 3");
    }
  } else if (node.attrs !== undefined) {
    throw new LyricsValidationError(
      `Attributes are not allowed on ${node.type}`,
    );
  }

  if (node.content !== undefined && !Array.isArray(node.content)) {
    throw new LyricsValidationError("Node content must be an array");
  }

  const content = Array.isArray(node.content)
    ? node.content.map(validateNode)
    : undefined;

  return {
    type: node.type,
    ...(node.type === "heading"
      ? { attrs: { level: node.attrs?.level } }
      : {}),
    ...(content ? { content } : {}),
  };
}

export function validateLyricsDoc(doc: unknown): TiptapDoc {
  const serialized = JSON.stringify(doc);
  if (serialized === undefined) {
    throw new LyricsValidationError("Lyrics must be JSON");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_DOC_BYTES) {
    throw new LyricsValidationError("Lyrics document is too large");
  }

  if (!isRecord(doc) || doc.type !== "doc") {
    throw new LyricsValidationError("Lyrics must be a document");
  }

  if (!Array.isArray(doc.content)) {
    throw new LyricsValidationError("Document content must be an array");
  }

  for (const key of Object.keys(doc)) {
    if (key !== "type" && key !== "content") {
      throw new LyricsValidationError("Unexpected document attribute");
    }
  }

  const content = doc.content.map(validateNode);
  return { type: "doc", content };
}
