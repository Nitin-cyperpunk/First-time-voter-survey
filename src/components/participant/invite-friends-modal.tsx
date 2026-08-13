"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { cn } from "@/lib/utils";

type InviteFriendsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShareInstagram: () => void;
  onShareWhatsApp: () => void;
  sharingInstagram?: boolean;
  sharingWhatsApp?: boolean;
};

export function InviteFriendsModal({
  open,
  onOpenChange,
  onShareInstagram,
  onShareWhatsApp,
  sharingInstagram = false,
  sharingWhatsApp = false,
}: InviteFriendsModalProps) {
  const busy = sharingInstagram || sharingWhatsApp;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[calc(100%-2rem)] gap-4 p-5 sm:max-w-sm"
        showCloseButton={false}
      >
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="text-base font-semibold leading-snug">
            Share with your friends and family
          </DialogTitle>
          <DialogDescription className="text-sm font-semibold leading-relaxed text-foreground">
            Share this personalized referral link with your friends and family.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            className={cn(
              "h-11 w-full",
              "bg-gradient-to-r from-[#C13584] via-[#E1306C] to-[#F77737] text-white hover:opacity-90",
            )}
            disabled={busy}
            onClick={onShareInstagram}
          >
            <InstagramIcon className="size-4" />
            {sharingInstagram ? "Preparing..." : "Share on Instagram"}
          </Button>
          <Button
            type="button"
            className="h-11 w-full bg-[#3FA76F] text-white hover:bg-[#3FA76F]/90"
            disabled={busy}
            onClick={onShareWhatsApp}
          >
            {sharingWhatsApp ? "Opening..." : "Share on WhatsApp"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
