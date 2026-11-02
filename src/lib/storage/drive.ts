import "server-only";
import {
  APP_NAME_DEFAULT,
  DRIVE_API_BASE,
  DRIVE_FILE_FIELDS,
  DRIVE_FOLDER_MIME,
  DRIVE_UPLOAD_BASE,
  GOOGLE_REVOKE_ENDPOINT,
} from "@/lib/config/constants";
import { StorageError } from "./errors";
import {
  assertDriveOk,
  requestWithRetry,
  type FetchLike,
  type RetryOptions,
} from "./http";
import type {
  CreateUploadSessionInput,
  DriveFileMetadata,
  StorageProvider,
  StreamFileResult,
  UploadSessionResult,
} from "./types";

export interface StorageUserRepo {
  getDriveRootFolderId(userId: string): Promise<string | null>;
  setDriveRootFolderId(userId: string, folderId: string): Promise<void>;
}

export interface DriveProviderDeps extends RetryOptions {
  getAccessToken: (userId: string) => Promise<string>;
  revokeAccess?: (userId: string) => Promise<void>;
  userRepo: StorageUserRepo;
  appName?: string;
  now?: () => number;
}

interface DriveFileResponse {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  md5Checksum?: string;
  parents?: string[];
  trashed?: boolean;
}

interface DriveListResponse {
  files?: DriveFileResponse[];
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeFolderName(value: string): string {
  const cleaned = value
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || "Untitled";
}

function toMetadata(file: DriveFileResponse): DriveFileMetadata {
  if (!file.id) {
    throw new StorageError("STORAGE_UNAVAILABLE", "Drive file id was missing");
  }
  return {
    id: file.id,
    name: file.name ?? "",
    mimeType: file.mimeType ?? "",
    size: Number(file.size ?? 0),
    md5Checksum: file.md5Checksum ?? null,
    parents: file.parents ?? [],
    trashed: Boolean(file.trashed),
  };
}

function fileFields(): string {
  return encodeURIComponent(`files(${DRIVE_FILE_FIELDS})`);
}

export function createDriveProvider(
  deps: DriveProviderDeps,
): StorageProvider {
  const fetchImpl: FetchLike = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const appName = deps.appName ?? process.env.APP_NAME ?? APP_NAME_DEFAULT;

  async function request(
    userId: string,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const accessToken = await deps.getAccessToken(userId);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return requestWithRetry(
      url,
      { ...init, headers },
      {
        fetchImpl,
        sleep: deps.sleep,
        random: deps.random,
        maxAttempts: deps.maxAttempts,
      },
    );
  }

  async function ensureRootFolder(userId: string): Promise<string> {
    const existing = await deps.userRepo.getDriveRootFolderId(userId);
    if (existing) return existing;

    const query = [
      `name = '${escapeDriveQuery(appName)}'`,
      `mimeType = '${DRIVE_FOLDER_MIME}'`,
      "trashed = false",
      "'root' in parents",
    ].join(" and ");

    const listResponse = await assertDriveOk(
      await request(
        userId,
        `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${fileFields()}&pageSize=1`,
        { method: "GET" },
      ),
    );
    const list = (await listResponse.json()) as DriveListResponse;
    const found = list.files?.[0]?.id;

    if (found) {
      await deps.userRepo.setDriveRootFolderId(userId, found);
      return found;
    }

    const createResponse = await assertDriveOk(
      await request(userId, `${DRIVE_API_BASE}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: appName,
          mimeType: DRIVE_FOLDER_MIME,
          parents: ["root"],
          appProperties: { app: "songpad" },
        }),
      }),
    );
    const created = (await createResponse.json()) as DriveFileResponse;

    if (!created.id) {
      throw new StorageError(
        "STORAGE_UNAVAILABLE",
        "Drive did not return a folder id",
      );
    }

    await deps.userRepo.setDriveRootFolderId(userId, created.id);
    return created.id;
  }

  async function ensureSongFolder(
    userId: string,
    songId: string,
    title: string,
  ): Promise<string> {
    const rootId = await ensureRootFolder(userId);

    const query = [
      `'${escapeDriveQuery(rootId)}' in parents`,
      `mimeType = '${DRIVE_FOLDER_MIME}'`,
      "trashed = false",
      `appProperties has { key='songId' and value='${escapeDriveQuery(songId)}' }`,
    ].join(" and ");

    const listResponse = await assertDriveOk(
      await request(
        userId,
        `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${fileFields()}&pageSize=1`,
        { method: "GET" },
      ),
    );
    const list = (await listResponse.json()) as DriveListResponse;
    const found = list.files?.[0]?.id;
    if (found) return found;

    const createResponse = await assertDriveOk(
      await request(userId, `${DRIVE_API_BASE}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${sanitizeFolderName(title)} [${songId}]`,
          mimeType: DRIVE_FOLDER_MIME,
          parents: [rootId],
          appProperties: { app: "songpad", songId },
        }),
      }),
    );
    const created = (await createResponse.json()) as DriveFileResponse;

    if (!created.id) {
      throw new StorageError(
        "STORAGE_UNAVAILABLE",
        "Drive did not return a folder id",
      );
    }

    return created.id;
  }

  async function createUploadSession(
    userId: string,
    input: CreateUploadSessionInput,
  ): Promise<UploadSessionResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType,
      "X-Upload-Content-Length": String(input.size),
    };
    if (input.origin) headers.Origin = input.origin;

    const response = await assertDriveOk(
      await request(
        userId,
        `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: input.fileName,
            mimeType: input.mimeType,
            parents: [input.folderId],
          }),
        },
      ),
    );

    const uploadUrl = response.headers.get("location");
    if (!uploadUrl) {
      throw new StorageError(
        "STORAGE_UNAVAILABLE",
        "Drive did not return an upload URL",
      );
    }

    return {
      uploadUrl,
      expiresAt: new Date(now() + 60 * 60 * 1000),
    };
  }

  async function getFileMetadata(
    userId: string,
    fileId: string,
  ): Promise<DriveFileMetadata> {
    const response = await assertDriveOk(
      await request(
        userId,
        `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`,
        { method: "GET" },
      ),
    );
    return toMetadata((await response.json()) as DriveFileResponse);
  }

  async function streamFile(
    userId: string,
    fileId: string,
    range: string | null,
    method: "GET" | "HEAD" = "GET",
  ): Promise<StreamFileResult> {
    const headers = new Headers();
    if (range) headers.set("Range", range);

    const response = await assertDriveOk(
      await request(
        userId,
        `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
        { method, headers },
      ),
    );

    return {
      status: response.status,
      body: response.body,
      headers: response.headers,
    };
  }

  async function listFolderFiles(
    userId: string,
    folderId: string,
  ): Promise<DriveFileMetadata[]> {
    const query = [
      `'${escapeDriveQuery(folderId)}' in parents`,
      "trashed = false",
    ].join(" and ");

    const response = await assertDriveOk(
      await request(
        userId,
        `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${fileFields()}&pageSize=1000`,
        { method: "GET" },
      ),
    );
    const data = (await response.json()) as DriveListResponse;
    return (data.files ?? []).map(toMetadata);
  }

  async function trashFile(userId: string, fileId: string): Promise<void> {
    const response = await request(
      userId,
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=id`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      },
    );

    if (response.status === 404) return;
    await assertDriveOk(response);
  }

  async function revokeAccess(userId: string): Promise<void> {
    if (deps.revokeAccess) return deps.revokeAccess(userId);
    const accessToken = await deps.getAccessToken(userId);
    const response = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: accessToken }).toString(),
    });
    if (!response.ok && response.status !== 400) {
      throw new StorageError("STORAGE_UNAVAILABLE", "Google token revocation failed");
    }
  }

  return {
    getAccessToken: deps.getAccessToken,
    ensureRootFolder,
    ensureSongFolder,
    createUploadSession,
    getFileMetadata,
    streamFile,
    listFolderFiles,
    trashFile,
    revokeAccess,
  };
}
