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
import { copyTextToClipboard } from "@/lib/instagram-clipboard";
import { openInstagramReferralComposer } from "@/lib/instagram-share";
import { toastMessageCopiedToClipboard } from "@/lib/toast";

type InstagramDmGuideModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  dmUrl?: string;
};

export function InstagramDmGuideModal({
  open,
  onOpenChange,
  message,
}: InstagramDmGuideModalProps) {
  const [autoCopied, setAutoCopied] = useState(false);

  const copyMessage = useCallback(async () => {
    const copied = await copyTextToClipboard(message);
    setAutoCopied(copied);
    if (copied) {
      toastMessageCopiedToClipboard();
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
        toastMessageCopiedToClipboard();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, message]);

  function handleContinue() {
    openInstagramReferralComposer();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] gap-4 p-5 sm:max-w-sm"
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2 text-primary">
            <InstagramIcon className="size-5 shrink-0" />
            <DialogTitle className="text-base font-semibold leading-snug">
              Share on Instagram
            </DialogTitle>
          </div>
          <DialogDescription className="space-y-2 text-sm leading-relaxed">
            <span className="block font-semibold text-foreground">
              Preparing you for the next step:
            </span>
            <span className="block font-semibold">
              We&apos;ve copied your message. Tap Continue to open Instagram and
              paste it.
            </span>
          </DialogDescription>
        </DialogHeader>

        {!autoCopied ? (
          <p className="text-xs font-semibold leading-relaxed text-plum-muted">
            Couldn&apos;t copy automatically.{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => void copyMessage()}
            >
              Tap to copy message
            </button>
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            className="h-11 w-full"
            onClick={handleContinue}
          >
            Continue to Instagram
            <ArrowRightIcon className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
