import { randomInt } from "node:crypto";

import { REFERRAL_CODE_PREFIX } from "@/lib/referral-code";
import { findByReferralCode } from "@/server/repositories/participants.repository";

const SAFE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERRAL_CODE_SUFFIX_LENGTH = 6;

export function generateReferralCode(): string {
  let suffix = "";
  for (let i = 0; i < REFERRAL_CODE_SUFFIX_LENGTH; i++) {
    suffix += SAFE_ALPHABET[randomInt(SAFE_ALPHABET.length)] ?? "2";
  }
  return `${REFERRAL_CODE_PREFIX}${suffix}`;
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode();
    const existing = await findByReferralCode(code);
    if (!existing) return code;
  }

  throw new Error("REFERRAL_CODE_GENERATION_FAILED");
}
