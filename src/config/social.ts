const DEFAULT_INSTAGRAM_USERNAME = "concave_insights";
const DEFAULT_WHATSAPP_BUSINESS_NUMBER = "";

export function getInstagramUsername(): string {
  return (
    process.env.NEXT_PUBLIC_INSTAGRAM_USERNAME?.trim() ||
    DEFAULT_INSTAGRAM_USERNAME
  );
}

/** Digits only, with country code — used for respondent verification DMs on Thank You. */
export function getWhatsAppBusinessNumber(): string {
  const raw =
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() ||
    DEFAULT_WHATSAPP_BUSINESS_NUMBER;
  return raw.replace(/\D/g, "");
}

export const INSTAGRAM_USERNAME = getInstagramUsername();

/** Opens a DM thread with the official Instagram account (not profile/home). */
export const INSTAGRAM_DM_URL = `https://ig.me/m/${INSTAGRAM_USERNAME}`;

export function buildWhatsAppVerificationUrl(message: string): string {
  return `https://wa.me/${getWhatsAppBusinessNumber()}?text=${encodeURIComponent(message)}`;
}

export function getInstagramSocialConfig() {
  return {
    username: INSTAGRAM_USERNAME,
    dmUrl: INSTAGRAM_DM_URL,
  };
}

export function getWhatsAppSocialConfig() {
  return {
    businessNumber: getWhatsAppBusinessNumber(),
    verificationDmUrl: (message: string) => buildWhatsAppVerificationUrl(message),
  };
}
