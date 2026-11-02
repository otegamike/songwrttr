import type { Types } from "mongoose";
import type { TiptapDoc } from "@/lib/lyrics/types";
import type { MatchField } from "@/lib/songs/search";
import type { Instrumental } from "@/models/Song";

export interface SongSummary {
  id: string;
  title: string;
  updatedAt: string;
  hasInstrumental: boolean;
  instrumentalFileName: string | null;
  matchedIn?: MatchField[];
  snippet?: string;
}

export interface SongDetail extends SongSummary {
  createdAt: string;
  lyricsJson: TiptapDoc;
  lyricsText: string;
  instrumental: Instrumental | null;
}

export interface SongLike {
  _id: Types.ObjectId;
  title: string;
  lyricsJson: TiptapDoc;
  lyricsText: string;
  instrumental?: Instrumental | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toSongSummary(
  doc: SongLike,
  matchedIn?: MatchField[],
  snippet?: string,
): SongSummary {
  return {
    id: String(doc._id),
    title: doc.title,
    updatedAt: doc.updatedAt.toISOString(),
    hasInstrumental: Boolean(doc.instrumental),
    instrumentalFileName: doc.instrumental?.fileName ?? null,
    ...(matchedIn ? { matchedIn } : {}),
    ...(snippet ? { snippet } : {}),
  };
}

export function toSongDetail(doc: SongLike): SongDetail {
  return {
    ...toSongSummary(doc),
    createdAt: doc.createdAt.toISOString(),
    lyricsJson: doc.lyricsJson,
    lyricsText: doc.lyricsText,
    instrumental: doc.instrumental ?? null,
  };
}
