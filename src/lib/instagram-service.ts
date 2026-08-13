import { INSTAGRAM_DM_URL } from "@/config/social";
import { getInstagramVerificationMessage } from "@/lib/instagram-verification";
import { getRenderedMessage } from "@/lib/message-templates/client";
import { MESSAGE_TEMPLATE_KEYS } from "@/lib/message-templates/keys";
import { openInstagramDmInbox } from "@/lib/instagram-share";

export type ShareReferralInput = {
  referralLink: string;
  templateKey?: string;
};

export type VerifyViaDmInput = {
  fullName: string;
  mobile: string;
  leadId: string;
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

/** Renders the verification DM message (does not open UI). */
export async function renderVerificationDmMessage(
  input: VerifyViaDmInput,
): Promise<string> {
  return getInstagramVerificationMessage(input);
}

/** Opens the official Instagram DM inbox without prefilled text. */
export function openVerificationInstagramDm(dmUrl: string = INSTAGRAM_DM_URL) {
  openInstagramDmInbox(dmUrl);
}
