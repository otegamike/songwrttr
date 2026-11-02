import type { TiptapDoc, TiptapNode } from "./types";

const SECTION_LABEL = /^[[(]\s*(.+?)\s*[\])]$/;

export function plainTextToTiptap(text: string): TiptapDoc {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));

  if (lines.length === 1 && lines[0] === "") {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const content: TiptapNode[] = lines.map((line) => {
    if (line.trim() === "") {
      return { type: "paragraph" };
    }

    const section = SECTION_LABEL.exec(line.trim());
    if (section?.[1]) {
      return {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: section[1] }],
      };
    }

    return {
      type: "paragraph",
      content: [{ type: "text", text: line }],
    };
  });

  return { type: "doc", content };
}

function inlineText(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return "";

  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type === "text") return node.text ?? "";
      return inlineText(node.content);
    })
    .join("");
}

function listText(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return "";

  return nodes
    .map((item) => {
      const blocks = blocksToText(item.content ?? []);
      const [first = "", ...rest] = blocks;
      return [
        `- ${first}`,
        ...rest.map((line) => (line ? `  ${line}` : "")),
      ].join("\n");
    })
    .join("\n");
}

function blocksToText(nodes: TiptapNode[]): string[] {
  const blocks: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "paragraph":
      case "heading":
        blocks.push(inlineText(node.content));
        break;
      case "bulletList":
      case "orderedList":
        blocks.push(listText(node.content));
        break;
      case "blockquote": {
        const inner = blocksToText(node.content ?? []);
        blocks.push(inner.map((line) => (line ? `> ${line}` : ">")).join("\n"));
        break;
      }
      case "hardBreak":
        blocks.push("");
        break;
      default:
        blocks.push(inlineText(node.content));
        break;
    }
  }

  return blocks;
}

export function tiptapToPlainText(doc: TiptapDoc): string {
  return blocksToText(doc.content).join("\n");
}
