import { ApiError } from "@/lib/api/errors";
import { plainTextToTiptap, tiptapToPlainText } from "@/lib/lyrics/convert";
import type { TiptapDoc } from "@/lib/lyrics/types";
import {
  validateLyricsDoc,
  LyricsValidationError,
} from "@/lib/lyrics/validate";
import { Song } from "@/models/Song";
import {
  buildSearchRegex,
  createSnippet,
  decodeCursor,
  encodeCursor,
  getMatchedIn,
  matchRank,
  type SearchCursor,
} from "@/lib/songs/search";
import { normalizeTitleInput, titleNormalized } from "@/lib/songs/title";
import { cleanupSongMedia } from "@/lib/services/media";
import {
  toSongDetail,
  toSongSummary,
  type SongDetail,
  type SongLike,
  type SongSummary,
} from "@/lib/services/songSerialization";
import { Types } from "mongoose";
import { getEnv } from "@/lib/config/env";
import { enforceWindowLimit } from "@/lib/rate-limit/window";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_QUERY_LENGTH = 100;

export type { SongDetail, SongSummary } from "@/lib/services/songSerialization";

export interface ListSongsInput {
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface ListSongsResult {
  songs: SongSummary[];
  nextCursor: string | null;
}

export interface CreateSongInput {
  title: string;
  lyricsJson?: unknown;
  lyricsPlain?: string;
  importKey?: string;
}

export interface UpdateSongInput {
  title?: string;
  lyricsJson?: unknown;
  lyricsPlain?: string;
}

function objectIdOrNotFound(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError("NOT_FOUND", "Song not found");
  }
  return new Types.ObjectId(id);
}

function cursorObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError("VALIDATION_ERROR", "Invalid cursor");
  }
  return new Types.ObjectId(id);
}

function buildLyrics(input: {
  lyricsJson?: unknown;
  lyricsPlain?: string;
}): { lyricsJson: TiptapDoc; lyricsText: string } {
  if (input.lyricsJson !== undefined && input.lyricsPlain !== undefined) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Provide either lyricsJson or lyricsPlain, not both",
    );
  }

  try {
    const lyricsJson =
      input.lyricsJson !== undefined
        ? validateLyricsDoc(input.lyricsJson)
        : plainTextToTiptap(input.lyricsPlain ?? "");

    return { lyricsJson, lyricsText: tiptapToPlainText(lyricsJson) };
  } catch (error) {
    if (error instanceof LyricsValidationError) {
      throw new ApiError("VALIDATION_ERROR", error.message);
    }
    throw error;
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function sameCursor(
  doc: SongLike,
  rank: number,
  cursor: SearchCursor,
): boolean {
  return (
    rank === cursor.rank &&
    doc.updatedAt.toISOString() === cursor.updatedAt &&
    String(doc._id) === cursor.id
  );
}

export async function listSongs(
  userId: string,
  input: ListSongsInput,
): Promise<ListSongsResult> {
  const limit = clampLimit(input.limit);
  const query = (input.q ?? "").trim();

  if (query.length > MAX_QUERY_LENGTH) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Search query must be at most ${MAX_QUERY_LENGTH} characters`,
    );
  }

  let cursor: SearchCursor | null = null;
  if (input.cursor) {
    cursor = decodeCursor(input.cursor);
    if (!cursor) {
      throw new ApiError("VALIDATION_ERROR", "Invalid cursor");
    }
  }

  if (query) {
    const regex = buildSearchRegex(query);
    const docs = (await Song.find({
      userId,
      $or: [
        { title: regex },
        { "instrumental.fileName": regex },
        { lyricsText: regex },
      ],
    })
      .select("title instrumental lyricsText createdAt updatedAt")
      .lean()) as unknown as SongLike[];

    const matches = docs
      .map((doc) => {
        const matchedIn = getMatchedIn(
          {
            title: doc.title,
            instrumentalFileName: doc.instrumental?.fileName ?? null,
            lyricsText: doc.lyricsText,
          },
          regex,
        );

        return {
          doc,
          matchedIn,
          rank: matchRank(matchedIn),
          snippet: matchedIn.includes("lyrics")
            ? createSnippet(doc.lyricsText, regex)
            : undefined,
        };
      })
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const updated = b.doc.updatedAt.getTime() - a.doc.updatedAt.getTime();
        if (updated !== 0) return updated;
        return String(b.doc._id).localeCompare(String(a.doc._id));
      });

    let startIndex = 0;
    if (cursor) {
      const index = matches.findIndex((match) =>
        sameCursor(match.doc, match.rank, cursor as SearchCursor),
      );
      startIndex = index >= 0 ? index + 1 : matches.length;
    }

    const page = matches.slice(startIndex, startIndex + limit);
    const last = page[page.length - 1];
    const nextCursor =
      startIndex + limit < matches.length && last
        ? encodeCursor({
            rank: last.rank,
            updatedAt: last.doc.updatedAt.toISOString(),
            id: String(last.doc._id),
          })
        : null;

    return {
      songs: page.map((match) =>
        toSongSummary(match.doc, match.matchedIn, match.snippet),
      ),
      nextCursor,
    };
  }

  const filter: Record<string, unknown> = { userId };
  if (cursor) {
    const updatedAt = new Date(cursor.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      throw new ApiError("VALIDATION_ERROR", "Invalid cursor");
    }

    filter.$or = [
      { updatedAt: { $lt: updatedAt } },
      {
        updatedAt,
        _id: { $lt: cursorObjectId(cursor.id) },
      },
    ];
  }

  const docs = (await Song.find(filter)
    .select("title instrumental updatedAt")
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()) as unknown as SongLike[];

  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          updatedAt: last.updatedAt.toISOString(),
          id: String(last._id),
        })
      : null;

  return {
    songs: page.map((doc) => toSongSummary(doc)),
    nextCursor,
  };
}

export async function getSong(
  userId: string,
  id: string,
): Promise<SongDetail> {
  const doc = await Song.findOne({
    _id: objectIdOrNotFound(id),
    userId,
  }).lean();

  if (!doc) {
    throw new ApiError("NOT_FOUND", "Song not found");
  }

  return toSongDetail(doc as unknown as SongLike);
}

export async function createSong(
  userId: string,
  input: CreateSongInput,
): Promise<{ song: SongDetail; created: boolean }> {
  const title = normalizeTitleInput(input.title);
  const lyrics = buildLyrics(input);
  const importKey = input.importKey?.trim() || null;

  if (importKey && importKey.length > 200) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Import key must be at most 200 characters",
    );
  }

  if (importKey) {
    const existing = await Song.findOne({ userId, importKey }).lean();
    if (existing) {
      return {
          song: toSongDetail(existing as unknown as SongLike),
        created: false,
      };
    }
  }

  const env = getEnv();
  await enforceWindowLimit(`song-create:${userId}`, env.SONG_CREATES_PER_MINUTE);
  if (await Song.countDocuments({ userId }) >= env.MAX_SONGS_PER_USER) {
    throw new ApiError("VALIDATION_ERROR", `Song limit reached (${env.MAX_SONGS_PER_USER}).`);
  }

  try {
    const doc = await Song.create({
      userId,
      title,
      titleNormalized: titleNormalized(title),
      lyricsJson: lyrics.lyricsJson,
      lyricsText: lyrics.lyricsText,
      importKey,
    });

    return {
      song: toSongDetail(doc.toObject() as unknown as SongLike),
      created: true,
    };
  } catch (error) {
    if (
      importKey &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      const existing = await Song.findOne({ userId, importKey }).lean();
      if (existing) {
        return {
        song: toSongDetail(existing as unknown as SongLike),
          created: false,
        };
      }
    }
    throw error;
  }
}

export async function updateSong(
  userId: string,
  id: string,
  input: UpdateSongInput,
): Promise<SongDetail> {
  const song = await Song.findOne({
    _id: objectIdOrNotFound(id),
    userId,
  });

  if (!song) {
    throw new ApiError("NOT_FOUND", "Song not found");
  }

  if (
    input.title === undefined &&
    input.lyricsJson === undefined &&
    input.lyricsPlain === undefined
  ) {
    throw new ApiError("VALIDATION_ERROR", "No changes supplied");
  }

  if (input.title !== undefined) {
    const title = normalizeTitleInput(input.title);
    song.title = title;
    song.titleNormalized = titleNormalized(title);
  }

  if (input.lyricsJson !== undefined || input.lyricsPlain !== undefined) {
    const lyrics = buildLyrics(input);
    song.lyricsJson = lyrics.lyricsJson;
    song.lyricsText = lyrics.lyricsText;
  }

  await song.save();
  return toSongDetail(song.toObject() as unknown as SongLike);
}

export async function deleteSong(userId: string, id: string): Promise<void> {
  const song = await Song.findOne({
    _id: objectIdOrNotFound(id),
    userId,
  });

  if (!song) {
    throw new ApiError("NOT_FOUND", "Song not found");
  }

  await cleanupSongMedia({
    _id: String(song._id),
    userId,
    instrumental: song.instrumental ?? null,
    driveFolderId: song.driveFolderId ?? null,
  });

  await Song.deleteOne({ _id: song._id, userId });
}
