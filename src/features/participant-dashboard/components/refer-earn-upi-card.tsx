"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dismissToast,
  toastLoading,
  toastUnexpectedError,
  toastUpiInvalid,
  toastUpiSaved,
} from "@/lib/toast";

type ReferEarnUpiCardProps = {
  totalEarned: number;
  qualifiedCount: number;
  upiId: string | null;
  onSaved: (upiId: string) => void;
  referralRewardAmount?: number;
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
}: ReferEarnUpiCardProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const displayAmount = resolveDisplayAmount(
    totalEarned,
    qualifiedCount,
    referralRewardAmount,
  );
  const shouldPromptUpi = displayAmount > 0;

  if (!shouldPromptUpi && !upiId?.trim()) {
    return null;
  }

  if (upiId?.trim()) {
    return (
      <div className="rounded-[14px] border border-[#C9E5DE] bg-[#E2F0EC] p-6 shadow-sm">
        <p className="text-sm font-semibold text-[#3E8E7E]">
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upiId: value }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        dismissToast(loadingId);
        if (payload.code === "INVALID_UPI") {
          toastUpiInvalid();
          return;
        }
        throw new Error(payload.error ?? "Failed to save UPI ID.");
      }

      dismissToast(loadingId);
      toastUpiSaved();
      onSaved(String(payload.upiId ?? value));
    } catch (error) {
      dismissToast(loadingId);
      if (error instanceof Error && error.message !== "Failed to save UPI ID.") {
        toastUnexpectedError();
      } else {
        toastUnexpectedError();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-[#B8E6C8] bg-[#F0FFF4] p-5 shadow-sm">
      <p className="text-[15px] font-bold text-[#2E8B6F]">
        💸 {formatInr(displayAmount)} reward available
      </p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[#3E8E7E]">
        {qualifiedCount} friend{qualifiedCount === 1 ? "" : "s"} you referred
        qualified. Add your UPI and we&apos;ll send your reward via Razorpay.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-3">
        <Input
          id="upiId"
          className="rounded-lg border-[#C9E5DE] bg-white"
          placeholder="yourname@upi"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
          aria-label="UPI ID"
        />
        <Button
          type="submit"
          className="h-11 w-full rounded-xl bg-[#3FA76F] text-[15px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.35)] hover:bg-[#359A63]"
          disabled={saving || !value.trim()}
        >
          {saving ? "Saving..." : "Add UPI & get paid"}
        </Button>
      </form>
    </div>
  );
}
