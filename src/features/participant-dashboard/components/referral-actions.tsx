"use client";

import { CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { WhatsAppShareButton } from "@/components/ui/whatsapp-share-button";
import { INSTAGRAM_DM_URL } from "@/config/social";
import type { ReferralShareMode } from "@/features/participant-dashboard/lib/referral-share-mode";
import { useInstagramDmGuide } from "@/hooks/use-instagram-dm-guide";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import { getRenderedMessage } from "@/lib/message-templates/client";
import {
  buildTrackedReferralLink,
  normalizeReferralCode,
  type ReferralPlatform,
} from "@/lib/referral-code";
import {
  toastReferralLinkCopied,
  toastUnexpectedError,
  toastWhatsAppShareInitiated,
} from "@/lib/toast";
import { cn } from "@/lib/utils";

type ReferralActionsProps = {
  referralLink: string;
  shareMode: ReferralShareMode;
  whatsappTemplateKey?: string;
  instagramTemplateKey?: string;
  showCopyLink?: boolean;
  shareButtonLabel?: string;
  className?: string;
  referralRewardAmount?: number;
};

function referralCodeFromLink(link: string): string | null {
  if (!link) return null;
  try {
    const pathname = new URL(link).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const code = segments[segments.length - 1];
    return code ? normalizeReferralCode(code) : null;
  } catch {
    const match = link.match(/\/r\/(?:[wic]\/)?([^/?#]+)/i);
    return match?.[1] ? normalizeReferralCode(match[1]) : null;
  }
}

function trackedLink(referralLink: string, platform: ReferralPlatform): string {
  const code = referralCodeFromLink(referralLink);
  if (!code) return referralLink;
  return buildTrackedReferralLink(code, platform);
}

export function ReferralActions({
  referralLink,
  shareMode,
  whatsappTemplateKey = MESSAGE_TEMPLATE_KEYS.WHATSAPP_REFERRAL,
  instagramTemplateKey = MESSAGE_TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
  showCopyLink = true,
  shareButtonLabel,
  className,
  referralRewardAmount = 0,
}: ReferralActionsProps) {
  const { startInstagramDm, modal } = useInstagramDmGuide();
  const resolvedShareLabel =
    shareButtonLabel ??
    (referralRewardAmount > 0
      ? `Share & Earn ₹${referralRewardAmount}`
      : "Share your link");

  async function copyLink() {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(trackedLink(referralLink, "copy"));
      toastReferralLinkCopied();
    } catch {
      toastUnexpectedError();
    }
  }

  async function shareOnInstagram() {
    if (!referralLink) return;

    try {
      const link = trackedLink(referralLink, "instagram");
      const message = await getRenderedMessage(instagramTemplateKey, {
        referral_link: link,
        instagram_url: INSTAGRAM_DM_URL,
      });
      startInstagramDm({ message });
    } catch {
      toastUnexpectedError();
    }
  }

  const showWhatsApp =
    shareMode === "whatsapp_only" || shareMode === "both";
  const showInstagram =
    shareMode === "instagram_only" || shareMode === "both";
  const instagramLabel =
    shareMode === "both" ? "Share on Instagram" : resolvedShareLabel;
  const whatsappLabel =
    shareMode === "both" ? "Share on WhatsApp" : resolvedShareLabel;

  if (!showCopyLink && !showWhatsApp && !showInstagram) {
    return null;
  }

  return (
    <>
      <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap", className)}>
      {showCopyLink ? (
        <Button
          className="sm:flex-1"
          onClick={() => void copyLink()}
          disabled={!referralLink}
        >
          <CopyIcon className="size-4" />
          Copy Referral Link
        </Button>
      ) : null}
      {showInstagram ? (
        <Button
          type="button"
          variant={shareMode === "both" ? "default" : "outline"}
          className={cn(
            "sm:flex-1",
            shareMode === "both" &&
              "bg-gradient-to-r from-[#C13584] via-[#E1306C] to-[#F77737] text-white hover:opacity-90",
          )}
          disabled={!referralLink}
          onClick={() => void shareOnInstagram()}
        >
          <InstagramIcon className="size-4" />
          {instagramLabel}
        </Button>
      ) : null}
      {showWhatsApp ? (
        <WhatsAppShareButton
          referralLink={trackedLink(referralLink, "whatsapp")}
          templateKey={whatsappTemplateKey}
          className="sm:flex-1"
          label={whatsappLabel}
          onShare={toastWhatsAppShareInitiated}
        />
      ) : null}
      </div>
      {modal}
    </>
  );
}
