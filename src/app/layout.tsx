import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/styles/tokens.css";
import "@/styles/globals.css";

const appName = process.env.APP_NAME ?? "SongPad";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description: "Write lyrics, keep your beats, record takes.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
