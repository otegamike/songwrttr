export type MatchField = "title" | "instrumental" | "lyrics";

export interface SearchCursor {
  rank?: number;
  updatedAt: string;
  id: string;
}

export interface SearchableSong {
  title: string;
  instrumentalFileName?: string | null;
  lyricsText: string;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildSearchRegex(query: string): RegExp {
  return new RegExp(escapeRegExp(query), "i");
}

export function getMatchedIn(
  song: SearchableSong,
  regex: RegExp,
): MatchField[] {
  const matched: MatchField[] = [];
  if (regex.test(song.title)) matched.push("title");
  if (song.instrumentalFileName && regex.test(song.instrumentalFileName)) {
    matched.push("instrumental");
  }
  if (regex.test(song.lyricsText)) matched.push("lyrics");
  return matched;
}

export function matchRank(matchedIn: MatchField[]): number {
  if (matchedIn.includes("title")) return 0;
  if (matchedIn.includes("instrumental")) return 1;
  if (matchedIn.includes("lyrics")) return 2;
  return 3;
}

export function createSnippet(
  text: string,
  regex: RegExp,
  radius = 40,
): string | undefined {
  const match = regex.exec(text);
  if (!match) return undefined;

  const start = Math.max(0, match.index - radius);
  const end = Math.min(text.length, match.index + match[0].length + radius);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();

  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(value: string): SearchCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;

    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;

    if (typeof record.updatedAt !== "string" || typeof record.id !== "string") {
      return null;
    }
    if (
      record.rank !== undefined &&
      typeof record.rank !== "number"
    ) {
      return null;
    }

    return {
      ...(record.rank !== undefined ? { rank: record.rank } : {}),
      updatedAt: record.updatedAt,
      id: record.id,
    };
  } catch {
    return null;
  }
}
