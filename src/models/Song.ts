import { Schema, model, models, type Model } from "mongoose";
import type { TiptapDoc } from "@/lib/lyrics/types";

export interface Instrumental {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  md5Checksum: string;
  uploadedAt: Date;
}

export interface SongDocument {
  userId: string;
  title: string;
  titleNormalized: string;
  lyricsJson: TiptapDoc;
  lyricsText: string;
  instrumental: Instrumental | null;
  driveFolderId: string | null;
  importKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const instrumentalSchema = new Schema<Instrumental>(
  {
    driveFileId: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    md5Checksum: { type: String, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const songSchema = new Schema<SongDocument>(
  {
    userId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    titleNormalized: { type: String, required: true },
    lyricsJson: { type: Schema.Types.Mixed, required: true },
    lyricsText: { type: String, required: true, default: "" },
    instrumental: { type: instrumentalSchema, default: null },
    driveFolderId: { type: String, default: null },
    importKey: { type: String, default: null, maxlength: 200 },
  },
  { timestamps: true },
);

songSchema.index({ userId: 1, updatedAt: -1 });
songSchema.index(
  { userId: 1, importKey: 1 },
  {
    unique: true,
    partialFilterExpression: { importKey: { $type: "string" } },
  },
);
songSchema.index({ userId: 1, titleNormalized: 1 });
songSchema.index({ userId: 1, driveFolderId: 1 }, { sparse: true });
songSchema.index({ "instrumental.driveFileId": 1 });

export const Song: Model<SongDocument> =
  (models.Song as Model<SongDocument> | undefined) ??
  model<SongDocument>("Song", songSchema);
