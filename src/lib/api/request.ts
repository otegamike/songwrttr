import type { z } from "zod";
import { ApiError } from "./errors";

export function parseQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const params = Object.fromEntries(
    new URL(request.url).searchParams.entries(),
  );
  const parsed = schema.safeParse(params);

  if (!parsed.success) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Query is invalid",
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Request body must be valid JSON",
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Request body is invalid",
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}
