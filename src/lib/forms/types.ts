export const FORM_TYPES = ["registration"] as const;

export type FormType = (typeof FORM_TYPES)[number];

export function isFormType(value: unknown): value is FormType {
  return value === "registration";
}

export function parseFormType(
  value: unknown,
  fallback: FormType = "registration",
): FormType {
  return isFormType(value) ? value : fallback;
}

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  registration: "Registration",
};

export const FORM_TYPE_PATHS: Record<FormType, string> = {
  registration: "/",
};
