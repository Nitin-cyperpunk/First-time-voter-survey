import { INSTAGRAM_DM_URL } from "@/config/social";
import { getRenderedMessage } from "@/lib/message-templates/client";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import { openInstagramDmInbox } from "@/lib/instagram-share";

export type ShareReferralInput = {
  referralLink: string;
  templateKey?: string;
};

/** Renders a referral message for Instagram sharing (does not open UI). */
export async function renderReferralInstagramMessage(
  input: ShareReferralInput,
): Promise<string> {
  return getRenderedMessage(
    input.templateKey ?? MESSAGE_TEMPLATE_KEYS.INSTAGRAM_REFERRAL,
    {
      referral_link: input.referralLink,
      instagram_url: INSTAGRAM_DM_URL,
    },
  );
}

/** Opens the official Instagram DM inbox without prefilled text. */
export function openInstagramReferralDm(dmUrl: string = INSTAGRAM_DM_URL) {
  openInstagramDmInbox(dmUrl);
}
