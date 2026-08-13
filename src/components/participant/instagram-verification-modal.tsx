"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { INSTAGRAM_DM_URL } from "@/config/social";
import { copyTextToClipboard } from "@/lib/instagram-clipboard";
import { openInstagramDmInbox } from "@/lib/instagram-share";
import { toastCopiedSuccessfully } from "@/lib/toast";

const VERIFICATION_STEPS = [
  "We are going to open our official Instagram DM.",
  "Copy/paste the generated verification details.",
  "Send them to our team.",
  "Once verified, our team will send your survey link via Instagram DM.",
  "Do not close Instagram until you have sent the message.",
];

type InstagramVerificationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  dmUrl?: string;
};

export function InstagramVerificationModal({
  open,
  onOpenChange,
  message,
  dmUrl = INSTAGRAM_DM_URL,
}: InstagramVerificationModalProps) {
  const [redirecting, setRedirecting] = useState(false);
  const [autoCopied, setAutoCopied] = useState(false);

  const copyMessage = useCallback(async () => {
    const copied = await copyTextToClipboard(message);
    setAutoCopied(copied);
    if (copied) {
      toastCopiedSuccessfully();
    }
    return copied;
  }, [message]);

  useEffect(() => {
    if (!open) {
      setAutoCopied(false);
      return;
    }

    let cancelled = false;

    void copyTextToClipboard(message).then((copied) => {
      if (cancelled) return;
      setAutoCopied(copied);
      if (copied) {
        toastCopiedSuccessfully();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, message]);

  function handleContinue() {
    setRedirecting(true);
    openInstagramDmInbox(dmUrl);
    onOpenChange(false);
    setRedirecting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] gap-4 p-5 sm:max-w-md"
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2 text-primary">
            <InstagramIcon className="size-5 shrink-0" />
            <DialogTitle className="text-base font-semibold leading-snug">
              Verify via Instagram
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <ul className="list-disc space-y-2 pl-4 text-sm font-semibold leading-relaxed text-foreground">
              {VERIFICATION_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </DialogDescription>
        </DialogHeader>

        {!autoCopied ? (
          <p className="text-xs font-semibold leading-relaxed text-plum-muted">
            Couldn&apos;t copy automatically.{" "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => void copyMessage()}
            >
              Tap to copy message
            </button>
          </p>
        ) : (
          <p className="text-xs font-semibold text-[#2E8B6F]">
            Verification message copied to clipboard.
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            className="h-11 w-full"
            disabled={redirecting}
            onClick={handleContinue}
          >
            Continue
            <ArrowRightIcon className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
