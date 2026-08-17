"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dismissToast,
  toastLoading,
  toastUpiInvalid,
  toastUpiSaveFailed,
  toastUpiSaved,
} from "@/lib/toast";

type ReferEarnUpiCardProps = {
  totalEarned: number;
  qualifiedCount: number;
  upiId: string | null;
  onSaved: (upiId: string) => void;
  referralRewardAmount?: number;
  /** Survey incentive prompt (post-QC) instead of referral-reward copy. */
  variant?: "referral" | "survey";
};

function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function resolveDisplayAmount(
  totalEarned: number,
  qualifiedCount: number,
  referralRewardAmount: number,
) {
  if (totalEarned > 0) return totalEarned;
  if (qualifiedCount > 0) return qualifiedCount * referralRewardAmount;
  return 0;
}

export function ReferEarnUpiCard({
  totalEarned,
  qualifiedCount,
  upiId,
  onSaved,
  referralRewardAmount = 0,
  variant = "referral",
}: ReferEarnUpiCardProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const displayAmount = resolveDisplayAmount(
    totalEarned,
    qualifiedCount,
    referralRewardAmount,
  );
  const shouldPromptUpi =
    variant === "survey" ? !upiId?.trim() && !skipped : displayAmount > 0;

  if (!shouldPromptUpi && !upiId?.trim()) {
    return null;
  }

  if (upiId?.trim()) {
    return (
      <div className="rounded-[14px] border border-primary/20 bg-accent-soft p-6 shadow-sm">
        <p className="text-sm font-semibold text-primary">
          ✅ UPI Added Successfully
        </p>
        <p className="mt-2 text-sm text-plum-muted">
          We&apos;ll process your payment shortly.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const loadingId = toastLoading("Saving UPI ID...");

    try {
      const response = await fetch("/api/participant/upi", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upiId: value }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        upiId?: string;
      };

      if (!response.ok) {
        dismissToast(loadingId);
        if (payload.code === "INVALID_UPI") {
          toastUpiInvalid();
          return;
        }
        console.error("POST /api/participant/upi failed:", {
          status: response.status,
          payload,
        });
        toastUpiSaveFailed(payload.error, payload.code);
        return;
      }

      dismissToast(loadingId);
      toastUpiSaved();
      onSaved(String(payload.upiId ?? value));
    } catch (error) {
      dismissToast(loadingId);
      console.error("UPI save request failed:", error);
      toastUpiSaveFailed();
    } finally {
      setSaving(false);
    }
  }

  const title =
    variant === "survey"
      ? "Add your UPI ID"
      : `💸 ${formatInr(displayAmount)} reward available`;

  const description =
    variant === "survey"
      ? "We will send your survey incentive and any referral rewards via UPI. You can skip and add it later from this page."
      : `${qualifiedCount} friend${qualifiedCount === 1 ? "" : "s"} you referred qualified. Add your UPI and we'll send your reward via Razorpay.`;

  return (
    <div className="rounded-[14px] border border-border bg-accent-soft p-5 shadow-sm">
      <p className="text-[15px] font-bold text-text-primary">{title}</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-text-body">
        {description}
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-3">
        <Input
          id="upiId"
          className="rounded-lg border-border bg-surface"
          placeholder="yourname@upi"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
          aria-label="UPI ID"
        />
        <Button
          type="submit"
          className="h-11 w-full rounded-xl bg-primary text-[15px] font-bold text-white hover:bg-accent-hover"
          disabled={saving || !value.trim()}
        >
          {saving ? "Saving..." : "Save UPI ID"}
        </Button>
        {variant === "survey" ? (
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full text-sm text-plum-muted"
            disabled={saving}
            onClick={() => setSkipped(true)}
          >
            Skip for now
          </Button>
        ) : null}
      </form>
    </div>
  );
}
