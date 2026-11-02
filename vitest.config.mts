import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "mcp/**/*.test.ts"],
    exclude: ["node_modules", ".next", "mcp/dist"],
    env: {
      MONGODB_URI: "mongodb://127.0.0.1:27017/songpad-test",
      NEXTAUTH_SECRET: "test-secret-test-secret-test-secret",
      NEXTAUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      TOKEN_ENCRYPTION_KEY:
        "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      ADMIN_EMAIL: "admin@example.com",
      APP_NAME: "SongPad",
      MAX_INSTRUMENTAL_MB: "50",
      MAX_TAKE_MB: "100",
    },
  },
});
