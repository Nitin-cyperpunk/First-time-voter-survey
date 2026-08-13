"use client";

import { MessageCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { INSTAGRAM_DM_URL } from "@/config/social";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import {
  buildWhatsAppShareUrl,
  getRenderedMessage,
} from "@/lib/message-templates/client";
import { toastUnexpectedError } from "@/lib/toast";

type WhatsAppShareButtonProps = {
  referralLink: string;
  templateKey?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  onShare?: () => void;
};

export function WhatsAppShareButton({
  referralLink,
  templateKey = MESSAGE_TEMPLATE_KEYS.WHATSAPP_REFERRAL,
  disabled = false,
  className,
  label = "Share on WhatsApp",
  onShare,
}: WhatsAppShareButtonProps) {
  async function handleShare() {
    try {
      const message = await getRenderedMessage(templateKey, {
        referral_link: referralLink,
        instagram_url: INSTAGRAM_DM_URL,
      });
      const url = buildWhatsAppShareUrl(message);
      window.open(url, "_blank", "noopener,noreferrer");
      onShare?.();
    } catch {
      toastUnexpectedError();
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={disabled || !referralLink}
      onClick={() => void handleShare()}
    >
      <MessageCircleIcon className="size-4" />
      {label}
    </Button>
  );
}
