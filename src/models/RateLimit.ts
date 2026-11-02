import { Schema, model, models, type Model } from "mongoose";

export interface RateLimitDocument {
  key: string;
  windowStart: Date;
  count: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const rateLimitSchema = new Schema<RateLimitDocument>(
  {
    key: { type: String, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

rateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit: Model<RateLimitDocument> =
  (models.RateLimit as Model<RateLimitDocument> | undefined) ??
  model<RateLimitDocument>("RateLimit", rateLimitSchema);
