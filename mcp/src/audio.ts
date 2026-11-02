import { stat } from "node:fs/promises";
import path from "node:path";

const AUDIO_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
};

export interface AudioFileInfo {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export async function inspectAudioFile(
  filePath: string,
  maxInstrumentalMb: number,
): Promise<AudioFileInfo> {
  let info;

  try {
    info = await stat(filePath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  if (!info.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }

  const extension = path.extname(filePath).toLowerCase();
  const mimeType = AUDIO_TYPES[extension];

  if (!mimeType) {
    throw new Error(
      `Unsupported audio type "${extension || "none"}". Use mp3, wav, m4a, aac, ogg or mp4.`,
    );
  }

  if (info.size <= 0) {
    throw new Error("Audio file is empty");
  }

  const maxBytes = maxInstrumentalMb * 1024 * 1024;
  if (info.size > maxBytes) {
    const actual = (info.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `Audio file is ${actual} MB; the limit is ${maxInstrumentalMb} MB`,
    );
  }

  return {
    path: filePath,
    fileName: path.basename(filePath),
    mimeType,
    size: info.size,
  };
}
