const DEV_FALLBACK_URL = "http://localhost:3000";

function stripSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

function vercelOrigin(): string | null {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return stripSlash(
      production.startsWith("http") ? production : `https://${production}`,
    );
  }
  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) {
    return stripSlash(
      deployment.startsWith("http") ? deployment : `https://${deployment}`,
    );
  }
  return null;
}

/** Public origin for referral links. Never use localhost on production. */
export function getAppUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return stripSlash(window.location.origin);
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const production = process.env.NODE_ENV === "production";

  if (configured && !(production && isLocalhostUrl(configured))) {
    return stripSlash(configured);
  }

  const hosted = vercelOrigin();
  if (hosted) return hosted;

  if (!production) {
    return DEV_FALLBACK_URL;
  }

  throw new Error(
    "NEXT_PUBLIC_APP_URL is not set to the public site origin. Set it in the production environment (not localhost).",
  );
}

/** Host the user actually hit (x-forwarded-host), for API-built referral links. */
export function originFromRequest(request: Request): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? request.headers.get("host") ?? "")
    .split(",")[0]
    ?.trim();
  if (!host) return null;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto =
    forwardedProto?.split(",")[0]?.trim() ||
    (isLocalhostUrl(host) ? "http" : "https");
  return stripSlash(`${proto}://${host}`);
}
