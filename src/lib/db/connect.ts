import "server-only";
import mongoose from "mongoose";
import { getEnv } from "@/lib/config/env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as typeof globalThis & {
  __songpadMongoose?: MongooseCache;
};

const cached: MongooseCache =
  globalForMongoose.__songpadMongoose ?? { conn: null, promise: null };

globalForMongoose.__songpadMongoose = cached;

export async function connectDb(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(getEnv().MONGODB_URI, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export function __resetDbCacheForTests(): void {
  cached.conn = null;
  cached.promise = null;
}
