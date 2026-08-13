"use client";

import { useCallback, useState } from "react";

import { InstagramDmGuideModal } from "@/components/participant/instagram-dm-guide-modal";
import { INSTAGRAM_DM_URL } from "@/config/social";

type InstagramDmSession = {
  open: boolean;
  message: string;
  dmUrl: string;
};

export function useInstagramDmGuide() {
  const [session, setSession] = useState<InstagramDmSession | null>(null);

  const startInstagramDm = useCallback(
    (input: { message: string; dmUrl?: string }) => {
      setSession({
        open: true,
        message: input.message,
        dmUrl: input.dmUrl ?? INSTAGRAM_DM_URL,
      });
    },
    [],
  );

  const closeInstagramDm = useCallback(() => {
    setSession((current) => (current ? { ...current, open: false } : null));
  }, []);

  const modal = session ? (
    <InstagramDmGuideModal
      open={session.open}
      onOpenChange={(open) => {
        if (!open) closeInstagramDm();
      }}
      message={session.message}
      dmUrl={session.dmUrl}
    />
  ) : null;

  return { startInstagramDm, closeInstagramDm, modal };
}
