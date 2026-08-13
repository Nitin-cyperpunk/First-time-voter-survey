import { buildReferralLeadLink } from "@/lib/referral-lead-link";
import { validateDob } from "@/lib/dob-validation";
import { generateReferralCode } from "@/lib/referral-code.server";
import { normalizePhone } from "@/features/referrals/lib/registration";
import {
  findReferralLeadByMobile,
  insertReferralLead,
  markReferralLeadShared,
  referralLeadCodeExists,
} from "@/server/repositories/referral-leads.repository";

const CODE_GENERATION_MAX_ATTEMPTS = 10;

export class ReferralValidationError extends Error {
  readonly errors: Record<string, string>;

  constructor(errors: Record<string, string>) {
    super("REFERRAL_VALIDATION_FAILED");
    this.name = "ReferralValidationError";
    this.errors = errors;
  }
}

export type CreateReferralLeadInput = {
  fullName: string;
  mobile: string;
  city: string;
  area?: string | null;
  pincode?: string | null;
  dob: string;
  referredBy?: string | null;
};

export type CreateReferralLeadResult = {
  referralCode: string;
  referralLink: string;
  alreadyExists: boolean;
  message?: string;
};

function validateReferralLeadInput(
  input: CreateReferralLeadInput,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const fullName = input.fullName?.trim() ?? "";
  const mobile = normalizePhone(input.mobile ?? "");
  const city = input.city?.trim() ?? "";
  const area = input.area?.trim() ?? "";
  const pincode = input.pincode?.trim() ?? "";
  const dob = input.dob?.trim() ?? "";

  if (fullName.length < 2) {
    errors.fullName = "Full name is required.";
  } else if (fullName.length > 120) {
    errors.fullName = "Name is too long.";
  }

  if (!mobile) {
    errors.mobile = "Mobile number is required.";
  } else if (!/^\d{10}$/.test(mobile)) {
    errors.mobile = "Enter a valid 10-digit mobile number.";
  }

  if (city.length < 2) {
    errors.city = "City is required.";
  } else if (city.length > 80) {
    errors.city = "City name is too long.";
  }

  if (!area) {
    errors.area = "Area is required.";
  } else if (area.length > 120) {
    errors.area = "Area name is too long.";
  }

  if (!pincode) {
    errors.pincode = "Pincode is required.";
  } else if (!/^\d{6}$/.test(pincode)) {
    errors.pincode = "Enter a valid 6-digit pincode.";
  }

  const dobError = validateDob(dob);
  if (dobError) {
    errors.dob = dobError;
  }

  return errors;
}

async function generateUniqueReferralLeadCode(): Promise<string> {
  for (let attempt = 0; attempt < CODE_GENERATION_MAX_ATTEMPTS; attempt++) {
    const code = generateReferralCode();
    const exists = await referralLeadCodeExists(code);
    if (!exists) return code;
  }

  throw new Error("REFERRAL_CODE_GENERATION_FAILED");
}

function buildResult(
  referralCode: string,
  alreadyExists: boolean,
): CreateReferralLeadResult {
  return {
    referralCode,
    referralLink: buildReferralLeadLink(referralCode),
    alreadyExists,
    ...(alreadyExists
      ? { message: "You already have a referral account." }
      : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function createReferralLead(
  input: CreateReferralLeadInput,
): Promise<CreateReferralLeadResult> {
  const errors = validateReferralLeadInput(input);
  if (Object.keys(errors).length > 0) {
    throw new ReferralValidationError(errors);
  }

  const mobile = normalizePhone(input.mobile);
  const existing = await findReferralLeadByMobile(mobile);
  if (existing) {
    return buildResult(existing.referralCode, true);
  }

  const referralCode = await generateUniqueReferralLeadCode();
  const referredBy = input.referredBy?.trim().toUpperCase() || null;

  try {
    await insertReferralLead({
      full_name: input.fullName.trim(),
      mobile,
      city: input.city.trim(),
      area: input.area?.trim() || null,
      pincode: input.pincode?.trim() || null,
      dob: input.dob.trim(),
      referral_code: referralCode,
      referred_by: referredBy,
      status: "Lead",
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await findReferralLeadByMobile(mobile);
      if (raced) {
        return buildResult(raced.referralCode, true);
      }
    }
    throw error;
  }

  return buildResult(referralCode, false);
}

export async function markShared(
  referralCode: string,
  platform: "whatsapp" | "instagram" | "copy",
) {
  return markReferralLeadShared(referralCode, platform);
}
