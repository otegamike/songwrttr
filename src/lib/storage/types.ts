export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  md5Checksum: string | null;
  parents: string[];
  trashed: boolean;
}

export interface CreateUploadSessionInput {
  folderId: string;
  fileName: string;
  mimeType: string;
  size: number;
  origin?: string;
}

export interface UploadSessionResult {
  uploadUrl: string;
  expiresAt: Date;
}

export interface StreamFileResult {
  status: number;
  body: ReadableStream<Uint8Array> | null;
  headers: Headers;
}

export interface StorageProvider {
  getAccessToken(userId: string): Promise<string>;
  ensureRootFolder(userId: string): Promise<string>;
  ensureSongFolder(
    userId: string,
    songId: string,
    title: string,
  ): Promise<string>;
  createUploadSession(
    userId: string,
    input: CreateUploadSessionInput,
  ): Promise<UploadSessionResult>;
  getFileMetadata(userId: string, fileId: string): Promise<DriveFileMetadata>;
  streamFile(
    userId: string,
    fileId: string,
    range: string | null,
    method?: "GET" | "HEAD",
  ): Promise<StreamFileResult>;
  listFolderFiles(
    userId: string,
    folderId: string,
  ): Promise<DriveFileMetadata[]>;
  trashFile(userId: string, fileId: string): Promise<void>;
  revokeAccess(userId: string): Promise<void>;
}
