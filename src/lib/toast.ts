import { toast, type ExternalToast } from "sonner";

const DURATION = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 4000,
} as const;

type ToastOptions = ExternalToast & {
  description?: string;
};

const variantClassNames = {
  success:
    "!border-primary/20 !bg-accent-soft !text-text-primary [&_[data-description]]:!text-text-body",
  error:
    "!border-error/30 !bg-error/10 !text-error [&_[data-description]]:!text-error",
  warning:
    "!border-border !bg-accent-soft !text-text-primary [&_[data-description]]:!text-text-body",
  info: "!border-border !bg-surface !text-text-primary [&_[data-description]]:!text-text-muted",
} as const;

function withVariant(
  variant: keyof typeof variantClassNames,
  options?: ToastOptions,
): ExternalToast {
  const { description, classNames, ...rest } = options ?? {};

  return {
    duration: DURATION[variant],
    dismissible: true,
    description,
    classNames: {
      toast: variantClassNames[variant],
      ...classNames,
    },
    ...rest,
  };
}

export function toastSuccess(message: string, options?: ToastOptions) {
  return toast.success(message, withVariant("success", options));
}

export function toastError(message: string, options?: ToastOptions) {
  return toast.error(message, withVariant("error", options));
}

export function toastWarning(message: string, options?: ToastOptions) {
  return toast.warning(message, withVariant("warning", options));
}

export function toastInfo(message: string, options?: ToastOptions) {
  return toast.info(message, withVariant("info", options));
}

export function toastLoading(message: string) {
  return toast.loading(message, { dismissible: true });
}

export function dismissToast(id?: string | number) {
  toast.dismiss(id);
}

export function toastNetworkError() {
  toastError("🌐 Unable to connect.", {
    description: "Please try again.",
  });
}

export function toastUnexpectedError() {
  toastError("❌ Something went wrong.");
}

type ApiErrorPayload = {
  error?: string;
  code?: string;
  support?: string;
};

export function toastRegistrationError(data: ApiErrorPayload) {
  if (data.code === "DUPLICATE_MOBILE") {
    return;
  }

  if (data.code === "DUPLICATE_SCREENER") {
    toastWarning("⚠️ You have already submitted this form.");
    return;
  }

  if (
    data.code === "form_closed" ||
    data.code === "region_full" ||
    data.code === "global_full" ||
    data.code === "city_inactive" ||
    data.code === "city_required"
  ) {
    toastError("❌ Registration not available", {
      description: data.error ?? "Please try again.",
    });
    return;
  }

  toastError("❌ Registration Failed", {
    description: data.error ?? "Please try again.",
  });
}

export function toastSurveyError(data: ApiErrorPayload) {
  if (data.code === "DUPLICATE_SURVEY") {
    toastWarning("⚠️ You have already submitted this survey.");
    return;
  }

  toastError("❌ Something went wrong.", {
    description: data.error ?? "Please try again.",
  });
}

export function toastUpiSaved() {
  toastSuccess("✅ UPI Saved Successfully");
}

export function toastUpiInvalid() {
  toastError("❌ Invalid UPI ID");
}

export function toastEligibilityUpdated(
  eligibility: "eligible" | "not_eligible",
) {
  if (eligibility === "eligible") {
    toastSuccess("✅ Participant marked Eligible");
    return;
  }

  toastWarning("⚠️ Participant marked Not Eligible");
}

export function toastReferralLinkCopied() {
  toastSuccess("Referral link copied.");
}

export function toastInstagramLinkCopied() {
  toastMessageCopiedToClipboard();
}

export function toastInstagramMessageCopied(options?: ToastOptions) {
  toastMessageCopiedToClipboard();
  void options;
}

export function toastLoggedOut() {
  toastSuccess("Logged out successfully.");
}

export function toastRegistrationSuccessful() {
  toastSuccess("Registration completed successfully.");
}

export function toastLoggedInSuccessfully() {
  toastSuccess("Logged in successfully.");
}

export function toastWelcomeBack() {
  toastSuccess("Welcome back!", {
    description: "You're still signed in.",
  });
}

export function toastEligibleForSurvey() {
  toastSuccess("You are eligible for the study.");
}

export function toastNotEligibleSurveyUnavailable() {
  toastInfo("You can still earn through referrals.");
}

export function toastRegistrationUpdateRequested() {
  toastInfo("Registration update requested.");
}

export function toastRefillSubmitted() {
  toastSuccess("Registration updated successfully.");
}

export function toastSurveySubmittedSuccessfully() {
  toastSuccess("Survey submitted successfully.");
}

export function toastPaymentProcessed() {
  toastSuccess("Payment processed successfully.");
}

export function toastRefillRequestSent(copiedMessage = false) {
  toastSuccess(
    copiedMessage
      ? "Refill request sent. Message copied to clipboard."
      : "Refill request sent successfully.",
  );
}

export function toastOpeningInstagram() {
  toastInfo("Opening Instagram...");
}

export function toastMessageCopiedToClipboard() {
  toastSuccess("✅ Message copied to clipboard");
}

export function toastCopiedSuccessfully() {
  toastSuccess("Copied successfully");
}

export function toastInstagramVerificationCopied() {
  toastSuccess("Message copied.", {
    description: "Paste it into Instagram DM.",
  });
}

export function toastSurveyLinkCopied() {
  toastSuccess("Survey link copied successfully.");
}

export function toastWhatsAppShareInitiated() {
  toastSuccess("WhatsApp share opened.");
}

export function toastInstagramShareInitiated() {
  toastSuccess("Instagram share initiated.");
}

export function toastEligibilityFailed() {
  toastError("❌ Unable to update eligibility");
}
