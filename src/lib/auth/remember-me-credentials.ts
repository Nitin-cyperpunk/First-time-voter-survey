/** Client-side Remember Me credential cache (48 hours). */

export const REMEMBER_ME_CREDENTIALS_KEY = "concave.remember_me_credentials";
export const REMEMBER_ME_TTL_MS = 48 * 60 * 60 * 1000;

export type RememberMeCredentials = {
  mobile: string;
  dob: string;
  expiresAt: number;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function saveRememberMeCredentials(input: {
  mobile: string;
  dob: string;
}): void {
  if (!canUseStorage()) return;

  const payload: RememberMeCredentials = {
    mobile: input.mobile.trim(),
    dob: input.dob.trim(),
    expiresAt: Date.now() + REMEMBER_ME_TTL_MS,
  };

  try {
    localStorage.setItem(REMEMBER_ME_CREDENTIALS_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function loadRememberMeCredentials(): RememberMeCredentials | null {
  if (!canUseStorage()) return null;

  try {
    const raw = localStorage.getItem(REMEMBER_ME_CREDENTIALS_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<RememberMeCredentials>;
    const mobile = typeof parsed.mobile === "string" ? parsed.mobile.trim() : "";
    const dob = typeof parsed.dob === "string" ? parsed.dob.trim() : "";
    const expiresAt =
      typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;

    if (!mobile || !dob || !expiresAt) {
      clearRememberMeCredentials();
      return null;
    }

    if (Date.now() > expiresAt) {
      clearRememberMeCredentials();
      return null;
    }

    return { mobile, dob, expiresAt };
  } catch {
    clearRememberMeCredentials();
    return null;
  }
}

export function clearRememberMeCredentials(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(REMEMBER_ME_CREDENTIALS_KEY);
  } catch {
    // Ignore.
  }
}
