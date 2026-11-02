export interface SongSummary {
  id: string;
  title: string;
  updatedAt: string;
  hasInstrumental: boolean;
  instrumentalFileName: string | null;
  matchedIn?: string[];
  snippet?: string;
}

export interface Instrumental {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  md5Checksum: string;
  uploadedAt: string;
}

export interface SongDetail extends SongSummary {
  createdAt: string;
  lyricsText: string;
  lyricsJson: unknown;
  instrumental: Instrumental | null;
}

export interface ListSongsResult {
  songs: SongSummary[];
  nextCursor: string | null;
}

export interface CreateSongResult {
  song: SongDetail;
  created: boolean;
}

export interface UploadSessionResult {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface TakeSummary {
  id: string;
  songId: string;
  name: string;
  driveFileId: string;
  url: string;
  mimeType: string;
  size: number;
  durationMs: number;
  createdAt: string;
}
