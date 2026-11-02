import { createReadStream } from "node:fs";
import type {
  CreateSongResult,
  ListSongsResult,
  SongDetail,
  TakeSummary,
  UploadSessionResult,
} from "./types.js";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SongPadClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export class SongPadApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "SongPadApiError";
    this.code = code;
    this.status = status;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const seconds = header === null ? Number.NaN : Number(header);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 30_000);
  }

  return Math.min(1000 * 2 ** (attempt - 1), 30_000);
}

export class SongPadClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(options: SongPadClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 3;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 1; ; attempt += 1) {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${this.token}`);
      if (init.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      const response = await this.fetchImpl(url, { ...init, headers });

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }

      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      const code = body.error?.code ?? "HTTP_ERROR";
      const message =
        body.error?.message ??
        `SongPad request failed with status ${response.status}`;

      if (response.status === 429 && attempt <= this.maxRetries) {
        await this.sleep(retryDelayMs(response, attempt));
        continue;
      }

      throw new SongPadApiError(code, message, response.status);
    }
  }

  async searchSongs(
    query?: string,
    limit?: number,
  ): Promise<ListSongsResult> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (limit !== undefined) params.set("limit", String(limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return this.request<ListSongsResult>(`/api/songs${suffix}`);
  }

  async getSong(songId: string): Promise<SongDetail> {
    const data = await this.request<{ song: SongDetail }>(
      `/api/songs/${encodeURIComponent(songId)}`,
    );
    return data.song;
  }

  async createSong(input: {
    title: string;
    lyrics?: string;
    importKey?: string;
  }): Promise<CreateSongResult> {
    return this.request<CreateSongResult>("/api/songs", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        ...(input.lyrics !== undefined
          ? { lyricsPlain: input.lyrics }
          : {}),
        ...(input.importKey ? { importKey: input.importKey } : {}),
      }),
    });
  }

  async updateLyrics(songId: string, lyrics: string): Promise<SongDetail> {
    const data = await this.request<{ song: SongDetail }>(
      `/api/songs/${encodeURIComponent(songId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ lyricsPlain: lyrics }),
      },
    );
    return data.song;
  }

  async startInstrumentalUpload(
    songId: string,
    input: { fileName: string; mimeType: string; size: number },
  ): Promise<UploadSessionResult> {
    return this.request<UploadSessionResult>(
      `/api/songs/${encodeURIComponent(songId)}/instrumental/upload-session`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  async completeInstrumental(
    songId: string,
    input: { uploadId: string; driveFileId: string },
  ): Promise<SongDetail> {
    const data = await this.request<{ song: SongDetail }>(
      `/api/songs/${encodeURIComponent(songId)}/instrumental/complete`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return data.song;
  }

  async listTakes(songId: string): Promise<TakeSummary[]> {
    const data = await this.request<{ takes: TakeSummary[] }>(
      `/api/songs/${encodeURIComponent(songId)}/takes`,
    );
    return data.takes;
  }

  async uploadFile(
    uploadUrl: string,
    filePath: string,
    mimeType: string,
    size: number,
  ): Promise<string> {
    const stream = createReadStream(filePath);
    const init = {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(size),
      },
      body: stream,
      duplex: "half",
    } as unknown as RequestInit & { duplex: "half" };

    const response = await this.fetchImpl(uploadUrl, init);

    if (!response.ok) {
      throw new SongPadApiError(
        "UPLOAD_FAILED",
        `Drive upload failed with status ${response.status}`,
        response.status,
      );
    }

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
    };

    if (!data.id) {
      throw new SongPadApiError(
        "UPLOAD_FAILED",
        "Drive did not return a file id",
        502,
      );
    }

    return data.id;
  }
}
