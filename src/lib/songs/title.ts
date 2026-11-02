import { ApiError } from "@/lib/api/errors";

export const TITLE_MAX_LENGTH = 200;

export function normalizeTitleInput(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < 1) {
    throw new ApiError("VALIDATION_ERROR", "Title is required");
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Title must be at most ${TITLE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

export function titleNormalized(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
