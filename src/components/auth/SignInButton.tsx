"use client";

import { signIn } from "next-auth/react";
import styles from "./SignInButton.module.css";

interface SignInButtonProps {
  promptConsent?: boolean;
}

export function SignInButton({ promptConsent = false }: SignInButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => {
        void signIn(
          "google",
          undefined,
          promptConsent ? { prompt: "consent" } : undefined,
        );
      }}
    >
      Continue with Google
    </button>
  );
}
