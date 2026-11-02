export interface McpConfig {
  baseUrl: string;
  token: string;
  maxInstrumentalMb: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const rawBaseUrl = required(env, "SONGPAD_BASE_URL");
  let baseUrl: string;

  try {
    baseUrl = new URL(rawBaseUrl).toString().replace(/\/+$/, "");
  } catch {
    throw new Error("SONGPAD_BASE_URL must be a valid URL");
  }

  const token = required(env, "SONGPAD_TOKEN");
  const maxInstrumentalMb = Number(env.MAX_INSTRUMENTAL_MB ?? "50");

  if (!Number.isFinite(maxInstrumentalMb) || maxInstrumentalMb <= 0) {
    throw new Error("MAX_INSTRUMENTAL_MB must be a positive number");
  }

  return { baseUrl, token, maxInstrumentalMb };
}
