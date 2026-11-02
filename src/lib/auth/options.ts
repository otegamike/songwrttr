import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { GOOGLE_SCOPES } from "@/lib/config/constants";
import { encryptToken } from "@/lib/crypto/tokenVault";
import { connectDb } from "@/lib/db/connect";
import { AllowedEmail } from "@/models/AllowedEmail";
import { User } from "@/models/User";

function baseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  );
}

function adminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: GOOGLE_SCOPES.join(" "),
          access_type: "offline",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = (user.email ?? profile?.email ?? "").trim().toLowerCase();
      if (!email) return `${baseUrl()}/login?error=NotInvited`;

      await connectDb();

      const admin = adminEmail();
      const isAdmin = admin !== "" && email === admin;
      const allowed =
        isAdmin || Boolean(await AllowedEmail.exists({ email, status: "active" }));

      if (!allowed) return `${baseUrl()}/login?error=NotInvited`;

      if (isAdmin) {
        await AllowedEmail.updateOne(
          { email },
          { $setOnInsert: { email, status: "active", note: "admin" } },
          { upsert: true },
        );
      }

      const existing = await User.findOne({ email }).lean();

      const update: Record<string, unknown> = {
        name: user.name ?? existing?.name ?? null,
        googleId: account?.providerAccountId ?? existing?.googleId ?? null,
        storageProvider: "drive",
        lastLoginAt: new Date(),
      };

      if (account?.refresh_token) {
        update.encryptedRefreshToken = encryptToken(account.refresh_token);
        update.driveReconnectRequired = false;
        update.driveReconnectAt = null;
      }

      const dbUser = await User.findOneAndUpdate(
        { email },
        { $set: update, $setOnInsert: { email } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();

      if (!dbUser) return `${baseUrl()}/login?error=NotInvited`;

      const hasRefreshToken = Boolean(
        account?.refresh_token ||
          existing?.encryptedRefreshToken ||
          dbUser.encryptedRefreshToken,
      );

      if (!hasRefreshToken) return `${baseUrl()}/login?reconsent=1`;

      (user as { id?: string }).id = String(dbUser._id);
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id?: string }).id;
        token.email = user.email ?? undefined;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? "";
        session.user.email = token.email ?? session.user.email ?? "";
      }
      return session;
    },
  },
};
