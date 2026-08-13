export function whatsappReferralLeadMessage(input: {
  referralCode: string;
  referralLink: string;
}): string {
  return [
    "Hi!",
    "",
    "I found this survey and thought you might be interested.",
    "",
    "Use my referral code:",
    input.referralCode,
    "",
    "Complete the survey here:",
    input.referralLink,
    "",
    "Thanks!",
  ].join("\n");
}

export function instagramReferralLeadMessage(input: {
  referralCode: string;
  referralLink: string;
}): string {
  return whatsappReferralLeadMessage(input);
}
