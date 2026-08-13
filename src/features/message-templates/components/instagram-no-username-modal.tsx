"use client";

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
import { openInstagramDirectInbox } from "@/lib/instagram";

type InstagramNoUsernameModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InstagramNoUsernameModal({
  open,
  onOpenChange,
}: InstagramNoUsernameModalProps) {
  function handleContinue() {
    openInstagramDirectInbox();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-4 p-5 sm:max-w-md">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2 text-primary">
            <InstagramIcon className="size-5 shrink-0" />
            <DialogTitle className="text-base font-semibold leading-snug">
              Instagram ID Missing
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            No Instagram username is available for this respondent. You can
            continue to Instagram Inbox manually or first add their username.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            className="h-11 w-full"
            onClick={handleContinue}
          >
            Continue
            <ArrowRightIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
