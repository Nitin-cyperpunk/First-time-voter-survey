// Backward-compatible re-exports — prefer @/lib/referral-code
export {
  REFERRAL_CODE_PREFIX as PARTICIPANT_CODE_PREFIX,
  buildReferralLink,
  isValidReferralCodeFormat as isValidParticipantCodeFormat,
  normalizeReferralCode as normalizeParticipantCode,
} from "@/lib/referral-code";
export {
  generateReferralCode as generateParticipantCode,
  generateUniqueReferralCode as generateUniqueParticipantCode,
} from "@/lib/referral-code.server";
