import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type RegistrationCompleteStepProps = {
  step: number;
  title: string;
  description: string;
};

export function RegistrationCompleteStep({
  step,
  title,
  description,
}: RegistrationCompleteStepProps) {
  return (
    <div className="pb-4 text-left last:pb-0">
      <p className="text-[15.5px] font-bold leading-snug text-text-primary">
        <span className="text-primary">{step}.</span> {title}
      </p>
      <p className="mt-0.5 text-[13.5px] leading-relaxed text-text-muted">
        {description}
      </p>
    </div>
  );
}

type RegistrationCompleteCtaButtonProps = {
  title: string;
  subtitle: string;
  variant: "primary" | "whatsapp" | "referral";
  disabled?: boolean;
  onClick: () => void;
  className?: string;
};

export function RegistrationCompleteCtaButton({
  title,
  subtitle,
  variant,
  disabled = false,
  onClick,
  className,
}: RegistrationCompleteCtaButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
        className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-3.5 text-center text-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.35)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-primary hover:bg-accent-hover",
        variant === "whatsapp" && "bg-primary hover:bg-accent-hover",
        variant === "referral" && "bg-primary hover:bg-accent-hover",
        className,
      )}
    >
      <span className="text-[14.5px] font-bold leading-tight">{title}</span>
      <span className="text-[11.5px] font-semibold leading-tight opacity-[0.92]">
        {subtitle}
      </span>
    </button>
  );
}

export function RegistrationCompleteCheckIcon() {
  return (
    <div
      aria-hidden
      className="mx-auto mb-4 grid size-[84px] place-items-center rounded-full bg-accent-soft"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-10 fill-none stroke-primary"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </div>
  );
}

type RegistrationCompleteShellProps = {
  children: ReactNode;
};

export function RegistrationCompleteShell({
  children,
}: RegistrationCompleteShellProps) {
  return (
    <div className="min-h-screen bg-background px-3 py-8 sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-[460px]">{children}</div>
    </div>
  );
}
