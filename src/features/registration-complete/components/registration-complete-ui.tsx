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
      <p className="text-[15.5px] font-bold leading-snug text-[#2B2230]">
        <span className="text-[#C2476B]">{step}.</span> {title}
      </p>
      <p className="mt-0.5 text-[13.5px] leading-relaxed text-[#7A6E78]">
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
        variant === "primary" &&
          "bg-gradient-to-r from-[#C13584] via-[#E1306C] to-[#F77737]",
        variant === "whatsapp" && "bg-[#3FA76F]",
        variant === "referral" && "bg-[#C2476B]",
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
      className="mx-auto mb-4 grid size-[84px] place-items-center rounded-full bg-[#E3F0EC]"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-10 fill-none stroke-[#2E8B6F]"
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
    <div className="min-h-screen bg-[#FCF7F9] px-3 py-8 sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-[460px]">{children}</div>
    </div>
  );
}
