import type { Scope } from "./scopes";

export type AuthContext =
  | {
      userId: string;
      email: string;
      via: "session";
      scopes: Scope[];
    }
  | {
      userId: string;
      email: string;
      via: "bearer";
      tokenId: string;
      scopes: Scope[];
    };
