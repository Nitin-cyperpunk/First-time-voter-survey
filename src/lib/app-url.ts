const DEV_FALLBACK_URL = "http://localhost:3000";

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "development") {
    return DEV_FALLBACK_URL;
  }

  throw new Error(
    "NEXT_PUBLIC_APP_URL is not set. Configure it in your deployment environment.",
  );
}
