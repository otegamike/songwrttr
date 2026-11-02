import { Schema, model, models, type Model } from "mongoose";
import { ALL_SCOPES } from "@/lib/auth/scopes";

export interface ApiTokenDocument {
  userId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const apiTokenSchema = new Schema<ApiTokenDocument>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    tokenHash: { type: String, required: true },
    prefix: { type: String, required: true },
    scopes: {
      type: [String],
      enum: [...ALL_SCOPES],
      required: true,
    },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

apiTokenSchema.index({ tokenHash: 1 }, { unique: true });
apiTokenSchema.index({ userId: 1, revokedAt: 1 });

export const ApiToken: Model<ApiTokenDocument> =
  (models.ApiToken as Model<ApiTokenDocument> | undefined) ??
  model<ApiTokenDocument>("ApiToken", apiTokenSchema);
