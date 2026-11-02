import "server-only";
import { Types } from "mongoose";
import { enforceWindowLimit } from "@/lib/rate-limit/window";
import { ApiError } from "@/lib/api/errors";
import { getEnv } from "@/lib/config/env";
import { storage } from "@/lib/storage";
import { StorageError } from "@/lib/storage/errors";
import type { DriveFileMetadata } from "@/lib/storage/types";
import { Song } from "@/models/Song";
import { Take } from "@/models/Take";
import { UploadSession, type UploadKind } from "@/models/UploadSession";
import {
  toSongDetail,
  type SongLike,
} from "@/lib/services/songSerialization";

const INSTRUMENTAL_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
]);

const TAKE_MIME_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
]);

const MAX_FILE_NAME_LENGTH = 255;
const MAX_TAKE_NAME_LENGTH = 100;

export interface UploadInput {
  fileName: string;
  mimeType: string;
  size: number;
}

export interface UploadSessionResponse {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface CompleteUploadInput {
  uploadId: string;
  driveFileId: string;
}

export interface CompleteTakeInput extends CompleteUploadInput {
  durationMs: number;
  name?: string;
}

export interface TakeSummary {
  id: string;
  songId: string;
  name: string;
  driveFileId: string;
  url: string;
  mimeType: string;
  size: number;
  md5Checksum: string;
  durationMs: number;
  createdAt: string;
}

export interface SongMediaSource {
  _id: string;
  userId: string;
  instrumental: {
    driveFileId: string;
  } | null;
  driveFolderId: string | null;
}

interface TakeLike {
  _id: Types.ObjectId;
  songId: Types.ObjectId;
  name: string;
  driveFileId: string;
  mimeType: string;
  size: number;
  md5Checksum?: string;
  durationMs: number;
  createdAt: Date;
}

function songObjectId(songId: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(songId)) {
    throw new ApiError("NOT_FOUND", "Song not found");
  }
  return new Types.ObjectId(songId);
}

function takeObjectId(takeId: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(takeId)) {
    throw new ApiError("NOT_FOUND", "Take not found");
  }
  return new Types.ObjectId(takeId);
}

function toTakeSummary(doc: TakeLike): TakeSummary {
  return {
    id: String(doc._id),
    songId: String(doc.songId),
    name: doc.name,
    driveFileId: doc.driveFileId,
    url: `/api/media/${doc.driveFileId}`,
    mimeType: doc.mimeType,
    size: doc.size,
    md5Checksum: doc.md5Checksum ?? "",
    durationMs: doc.durationMs,
    createdAt: doc.createdAt.toISOString(),
  };
}

function validateUpload(
  kind: UploadKind,
  input: UploadInput,
): UploadInput {
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType.trim().toLowerCase();

  if (!fileName || fileName.length > MAX_FILE_NAME_LENGTH) {
    throw new ApiError("VALIDATION_ERROR", "File name is invalid");
  }

  const allowed =
    kind === "instrumental" ? INSTRUMENTAL_MIME_TYPES : TAKE_MIME_TYPES;
  if (!allowed.has(mimeType)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Unsupported ${kind} mime type`,
    );
  }

  if (!Number.isInteger(input.size) || input.size <= 0) {
    throw new ApiError("VALIDATION_ERROR", "File size is invalid");
  }

  const maxMb =
    kind === "instrumental"
      ? getEnv().MAX_INSTRUMENTAL_MB
      : getEnv().MAX_TAKE_MB;

  if (input.size > maxMb * 1024 * 1024) {
    throw new ApiError(
      "TOO_LARGE",
      `File must be at most ${maxMb} MB`,
    );
  }

  return { fileName, mimeType, size: input.size };
}

async function findOwnedSong(userId: string, songId: string) {
  const song = await Song.findOne({
    _id: songObjectId(songId),
    userId,
  });

  if (!song) {
    throw new ApiError("NOT_FOUND", "Song not found");
  }

  return song;
}

async function ensureSongFolder(
  userId: string,
  song: Awaited<ReturnType<typeof findOwnedSong>>,
): Promise<string> {
  if (song.driveFolderId) return song.driveFolderId;

  const folderId = await storage.ensureSongFolder(
    userId,
    String(song._id),
    song.title,
  );
  song.driveFolderId = folderId;
  await song.save();
  return folderId;
}

async function loadUploadSession(
  userId: string,
  songId: string,
  kind: UploadKind,
  uploadId: string,
) {
  if (!Types.ObjectId.isValid(uploadId)) {
    throw new ApiError("NOT_FOUND", "Upload session not found");
  }

  const session = await UploadSession.findOne({
    _id: uploadId,
    userId,
    songId: songObjectId(songId),
    kind,
  });

  if (!session) {
    throw new ApiError("NOT_FOUND", "Upload session not found");
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await UploadSession.deleteOne({ _id: session._id });
    throw new ApiError("NOT_FOUND", "Upload session expired");
  }

  return session;
}

async function verifyUploadedFile(
  userId: string,
  session: { folderId: string; size: number; mimeType: string },
  driveFileId: string,
): Promise<DriveFileMetadata> {
  const metadata = await storage.getFileMetadata(userId, driveFileId);

  if (metadata.trashed) {
    throw new ApiError("VALIDATION_ERROR", "Uploaded file is trashed");
  }
  if (!metadata.parents.includes(session.folderId)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Uploaded file is in the wrong folder",
    );
  }
  if (metadata.size !== session.size) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Uploaded file size does not match",
    );
  }
  if (metadata.mimeType.toLowerCase() !== session.mimeType.toLowerCase()) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Uploaded file type does not match",
    );
  }
  if (!metadata.md5Checksum) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Drive did not return a checksum",
    );
  }

  return metadata;
}

export async function startUpload(
  userId: string,
  songId: string,
  kind: UploadKind,
  input: UploadInput,
  origin?: string,
): Promise<UploadSessionResponse> {
  const validated = validateUpload(kind, input);
  const song = await findOwnedSong(userId, songId);
  const env = getEnv();
  await enforceWindowLimit(`upload-session:${userId}`, env.UPLOAD_SESSIONS_PER_MINUTE);
  if (kind === "take" && await Take.countDocuments({ userId, songId: song._id }) >= env.MAX_TAKES_PER_SONG) {
    throw new ApiError("VALIDATION_ERROR", `This song has reached the take limit (${env.MAX_TAKES_PER_SONG}).`);
  }
  const [songsWithAudio, takesWithAudio, openUploads] = await Promise.all([
    Song.find({ userId, "instrumental.size": { $gt: 0 } }).select("instrumental.size").lean(),
    Take.find({ userId }).select("size").lean(),
    UploadSession.find({ userId }).select("size").lean(),
  ]);
  const usedBytes = songsWithAudio.reduce((total, row) => total + (row.instrumental?.size ?? 0), 0)
    + takesWithAudio.reduce((total, row) => total + (row.size ?? 0), 0)
    + openUploads.reduce((total, row) => total + (row.size ?? 0), 0);
  if (usedBytes + validated.size > env.MAX_AUDIO_BYTES_PER_USER) {
    throw new ApiError("TOO_LARGE", "This upload would exceed your total audio storage limit.");
  }
  const folderId = await ensureSongFolder(userId, song);

  const created = await storage.createUploadSession(userId, {
    folderId,
    fileName: validated.fileName,
    mimeType: validated.mimeType,
    size: validated.size,
    origin,
  });

  const session = await UploadSession.create({
    userId,
    songId: song._id,
    kind,
    fileName: validated.fileName,
    mimeType: validated.mimeType,
    size: validated.size,
    folderId,
    expiresAt: created.expiresAt,
  });

  return {
    uploadId: String(session._id),
    uploadUrl: created.uploadUrl,
    expiresAt: created.expiresAt.toISOString(),
  };
}

export async function completeInstrumental(
  userId: string,
  songId: string,
  input: CompleteUploadInput,
) {
  const session = await loadUploadSession(
    userId,
    songId,
    "instrumental",
    input.uploadId,
  );
  const metadata = await verifyUploadedFile(
    userId,
    session,
    input.driveFileId,
  );
  const song = await findOwnedSong(userId, songId);
  const previous = song.instrumental;

  song.instrumental = {
    driveFileId: metadata.id,
    fileName: metadata.name || session.fileName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    md5Checksum: metadata.md5Checksum as string,
    uploadedAt: new Date(),
  };

  await song.save();
  await UploadSession.deleteOne({ _id: session._id });

  if (previous && previous.driveFileId !== metadata.id) {
    try {
      await storage.trashFile(userId, previous.driveFileId);
    } catch (error) {
      if (!(error instanceof StorageError && error.code === "FILE_MISSING")) {
        console.error("[media] could not trash replaced instrumental", {
          songId,
        });
      }
    }
  }

  return toSongDetail(song.toObject() as unknown as SongLike);
}

export async function deleteInstrumental(
  userId: string,
  songId: string,
): Promise<void> {
  const song = await findOwnedSong(userId, songId);

  if (!song.instrumental) {
    throw new ApiError("NOT_FOUND", "Instrumental not found");
  }

  await storage.trashFile(userId, song.instrumental.driveFileId);
  song.instrumental = null;
  await song.save();
}

export async function completeTake(
  userId: string,
  songId: string,
  input: CompleteTakeInput,
): Promise<TakeSummary> {
  const session = await loadUploadSession(
    userId,
    songId,
    "take",
    input.uploadId,
  );
  const metadata = await verifyUploadedFile(
    userId,
    session,
    input.driveFileId,
  );
  const song = await findOwnedSong(userId, songId);

  const explicitName = input.name?.trim();
  if (explicitName && explicitName.length > MAX_TAKE_NAME_LENGTH) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Take name must be at most ${MAX_TAKE_NAME_LENGTH} characters`,
    );
  }

  const existingCount = await Take.countDocuments({
    userId,
    songId: song._id,
  });
  const name = explicitName || `Take ${existingCount + 1}`;

  const take = await Take.create({
    userId,
    songId: song._id,
    name,
    driveFileId: metadata.id,
    mimeType: metadata.mimeType,
    size: metadata.size,
    md5Checksum: metadata.md5Checksum as string,
    durationMs: input.durationMs,
  });

  await UploadSession.deleteOne({ _id: session._id });

  return toTakeSummary(take.toObject() as unknown as TakeLike);
}

export async function listTakes(
  userId: string,
  songId: string,
): Promise<TakeSummary[]> {
  const song = await findOwnedSong(userId, songId);
  const docs = (await Take.find({ userId, songId: song._id })
    .sort({ createdAt: -1 })
    .lean()) as unknown as TakeLike[];

  return docs.map(toTakeSummary);
}

export async function renameTake(
  userId: string,
  takeId: string,
  name: string,
): Promise<TakeSummary> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_TAKE_NAME_LENGTH) {
    throw new ApiError("VALIDATION_ERROR", "Take name is invalid");
  }

  const doc = await Take.findOneAndUpdate(
    { _id: takeObjectId(takeId), userId },
    { $set: { name: trimmed } },
    { new: true },
  ).lean();

  if (!doc) {
    throw new ApiError("NOT_FOUND", "Take not found");
  }

  return toTakeSummary(doc as unknown as TakeLike);
}

export async function deleteTake(
  userId: string,
  takeId: string,
): Promise<void> {
  const take = await Take.findOne({
    _id: takeObjectId(takeId),
    userId,
  });

  if (!take) {
    throw new ApiError("NOT_FOUND", "Take not found");
  }

  await storage.trashFile(userId, take.driveFileId);
  await Take.deleteOne({ _id: take._id, userId });
}

async function findOwnedMedia(
  userId: string,
  driveFileId: string,
): Promise<{ md5Checksum: string } | null> {
  if (!driveFileId) return null;

  const song = await Song.findOne({
    userId,
    "instrumental.driveFileId": driveFileId,
  })
    .select("instrumental")
    .lean();

  if (song?.instrumental) {
    return { md5Checksum: song.instrumental.md5Checksum };
  }

  const take = await Take.findOne({ userId, driveFileId })
    .select("md5Checksum")
    .lean();

  if (take) {
    return { md5Checksum: take.md5Checksum };
  }

  return null;
}

export async function streamMedia(
  userId: string,
  driveFileId: string,
  range: string | null,
  method: "GET" | "HEAD",
): Promise<Response> {
  const owned = await findOwnedMedia(userId, driveFileId);
  if (!owned) {
    throw new ApiError("NOT_FOUND", "Media not found");
  }

  let upstream;
  try {
    upstream = await storage.streamFile(userId, driveFileId, range, method);
  } catch (error) {
    if (error instanceof StorageError && error.code === "FILE_MISSING") {
      throw new ApiError("FILE_MISSING", "Media file is missing");
    }
    throw error;
  }

  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  headers.set("ETag", `"${owned.md5Checksum}"`);
  headers.set(
    "Cache-Control",
    "private, max-age=31536000, immutable",
  );

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function getOwnedMediaKind(
  userId: string,
  driveFileId: string,
): Promise<"instrumental" | "take" | null> {
  const song = await Song.findOne({ userId, "instrumental.driveFileId": driveFileId })
    .select("_id")
    .lean();
  if (song) return "instrumental";
  const take = await Take.findOne({ userId, driveFileId }).select("_id").lean();
  return take ? "take" : null;
}

export async function cleanupSongMedia(
  song: SongMediaSource,
): Promise<void> {
  const songId = songObjectId(song._id);
  const takes = (await Take.find({
    userId: song.userId,
    songId,
  }).lean()) as unknown as TakeLike[];

  if (song.instrumental) {
    await storage.trashFile(song.userId, song.instrumental.driveFileId);
  }

  for (const take of takes) {
    await storage.trashFile(song.userId, take.driveFileId);
  }

  if (song.driveFolderId) {
    let files: DriveFileMetadata[] | null = null;
    try {
      files = await storage.listFolderFiles(
        song.userId,
        song.driveFolderId,
      );
    } catch (error) {
      if (error instanceof StorageError && error.code === "FILE_MISSING") {
        files = [];
      } else {
        console.error("[media] song folder cleanup failed", {
          songId: song._id,
        });
      }
    }
    if (files?.length === 0) {
      try {
        await storage.trashFile(song.userId, song.driveFolderId);
      } catch (error) {
        if (!(error instanceof StorageError && error.code === "FILE_MISSING")) throw error;
      }
    }
  }

  await UploadSession.deleteMany({ userId: song.userId, songId });
  await Take.deleteMany({ userId: song.userId, songId });
}
