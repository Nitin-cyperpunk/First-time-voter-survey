export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "—" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function buildReferralEmail(referralCode: string): string {
  return `${referralCode.toLowerCase()}@referral.panel.local`;
}
