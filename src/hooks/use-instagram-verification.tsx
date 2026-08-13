"use client";

import { useCallback, useState } from "react";

import { InstagramVerificationModal } from "@/components/participant/instagram-verification-modal";
import { INSTAGRAM_DM_URL } from "@/config/social";

type InstagramVerificationSession = {
  open: boolean;
  message: string;
  dmUrl: string;
};

export function useInstagramVerification() {
  const [session, setSession] = useState<InstagramVerificationSession | null>(
    null,
  );

  const startInstagramVerification = useCallback(
    (input: { message: string; dmUrl?: string }) => {
      setSession({
        open: true,
        message: input.message,
        dmUrl: input.dmUrl ?? INSTAGRAM_DM_URL,
      });
    },
    [],
  );

  const closeInstagramVerification = useCallback(() => {
    setSession((current) => (current ? { ...current, open: false } : null));
  }, []);

  const modal = session ? (
    <InstagramVerificationModal
      open={session.open}
      onOpenChange={(open) => {
        if (!open) closeInstagramVerification();
      }}
      message={session.message}
      dmUrl={session.dmUrl}
    />
  ) : null;

  return {
    startInstagramVerification,
    closeInstagramVerification,
    modal,
  };
}
