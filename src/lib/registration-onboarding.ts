const PENDING_KEY = "concave.registrationCompletePending";
const RESULT_KEY = "concave.registrationResult";

export type RegistrationRenderedMessage = {
  message: string;
  instagramDmUrl: string;
};

export type RegistrationThankYouMessages = {
  instagram_verification: RegistrationRenderedMessage;
  instagram_referral: RegistrationRenderedMessage;
  whatsapp_referral: RegistrationRenderedMessage;
  not_eligible_referral: RegistrationRenderedMessage;
};

export type StoredRegistrationResult = {
  leadId: string;
  fullName: string;
  mobile: string;
  status: string;
  referralLink: string;
  messages: RegistrationThankYouMessages;
};

export function isRegistrationCompletePending(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PENDING_KEY) === "1";
}

export function markRegistrationCompletePending(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_KEY, "1");
}

export function clearRegistrationCompletePending(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PENDING_KEY);
}

export function saveRegistrationResult(result: StoredRegistrationResult): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
}

export function loadRegistrationResult(): StoredRegistrationResult | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(RESULT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredRegistrationResult;
  } catch {
    return null;
  }
}

export function clearRegistrationResult(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(RESULT_KEY);
}
