"use client";

import { INSTAGRAM_DM_URL } from "@/config/social";
import { useInstagramDmGuide } from "@/hooks/use-instagram-dm-guide";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import {
  buildWhatsAppShareUrl,
  getRenderedMessage,
} from "@/lib/message-templates/client";
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

type NotEligibleKeepEarningCardProps = {
  referralLink: string;
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

function displayReferralLink(link: string): string {
  if (!link) return "";
  try {
    const url = new URL(link);
    const host = url.host;
    const path = `${url.pathname}${url.search}`;
    return `${host}${path.startsWith("/") ? path : `/${path}`}`;
  } catch {
    return link.replace(/^https?:\/\//i, "");
  }
}

export function NotEligibleKeepEarningCard({
  referralLink,
}: NotEligibleKeepEarningCardProps) {
  const { startInstagramDm, modal } = useInstagramDmGuide();

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
      const message = await getRenderedMessage(
        MESSAGE_TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
        {
          referral_link: link,
          instagram_url: INSTAGRAM_DM_URL,
        },
      );
      startInstagramDm({ message });
    } catch {
      toastUnexpectedError();
    }
  }

  async function shareOnWhatsApp() {
    if (!referralLink) return;

    try {
      const link = trackedLink(referralLink, "whatsapp");
      const message = await getRenderedMessage(
        MESSAGE_TEMPLATE_KEYS.WHATSAPP_REFERRAL,
        {
          referral_link: link,
          instagram_url: INSTAGRAM_DM_URL,
        },
      );
      const url = buildWhatsAppShareUrl(message);
      window.open(url, "_blank", "noopener,noreferrer");
      toastWhatsAppShareInitiated();
    } catch {
      toastUnexpectedError();
    }
  }

  return (
    <>
    <div className="rounded-[14px] border border-border bg-surface p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
        SHARE WITH FRIENDS
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-text-body">
          {displayReferralLink(referralLink)}
        </span>
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={!referralLink}
          className={cn(
            "shrink-0 rounded-md bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-primary",
            "transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Copy
        </button>
      </div>

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          disabled={!referralLink}
          onClick={() => void shareOnInstagram()}
          className={cn(
            "flex flex-1 items-center justify-center rounded-xl px-2 py-3 text-[13px] font-bold text-white",
            "bg-primary hover:bg-accent-hover",
            "transition-opacity",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Share on Instagram
        </button>
        <button
          type="button"
          disabled={!referralLink}
          onClick={() => void shareOnWhatsApp()}
          className={cn(
            "flex flex-1 items-center justify-center rounded-xl px-2 py-3 text-[13px] font-bold text-white",
            "bg-primary hover:bg-accent-hover transition-opacity",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Share on WhatsApp
        </button>
      </div>
    </div>
    {modal}
    </>
  );
}
