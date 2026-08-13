import Link from "next/link";

export default function InvalidRefillLinkPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-[14px] border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">
          Invalid or expired refill link.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-plum-muted">
          This link is no longer valid, or refill is not required. Please
          contact Concave Insights if you need help.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Go to home
        </Link>
      </div>
    </div>
  );
}
