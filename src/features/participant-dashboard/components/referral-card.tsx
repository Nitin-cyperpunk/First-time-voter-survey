import { LinkIcon } from "lucide-react";

import { ReferralActions } from "@/features/participant-dashboard/components/referral-actions";
import type { ReferralShareMode } from "@/features/participant-dashboard/lib/referral-share-mode";

type ReferralCardProps = {
  referralLink: string;
  shareMode: ReferralShareMode;
  whatsappTemplateKey?: string;
  instagramTemplateKey?: string;
  showCopyLink?: boolean;
  title?: string;
  description?: string;
  referralRewardAmount?: number;
};

export function ReferralCard({
  referralLink,
  shareMode,
  whatsappTemplateKey,
  instagramTemplateKey,
  showCopyLink = true,
  title = "Share with your friends and family",
  description = "Share your referral link with your friends and family who may be interested in this study.",
  referralRewardAmount = 0,
}: ReferralCardProps) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-plum-muted">
        {description}
      </p>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm text-plum-muted">{referralLink}</span>
      </div>

      <ReferralActions
        referralLink={referralLink}
        shareMode={shareMode}
        whatsappTemplateKey={whatsappTemplateKey}
        instagramTemplateKey={instagramTemplateKey}
        showCopyLink={showCopyLink}
        referralRewardAmount={referralRewardAmount}
        className="mt-4"
      />
    </div>
  );
}
