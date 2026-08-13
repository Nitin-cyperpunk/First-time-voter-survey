"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  launchLoginSchema,
  type LaunchLoginInput,
} from "@/features/launch/schemas/registration";
import {
  clearRememberMeCredentials,
  loadRememberMeCredentials,
  saveRememberMeCredentials,
} from "@/lib/auth/remember-me-credentials";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastLoggedInSuccessfully,
  toastNetworkError,
  toastRegistrationSuccessful,
  toastInfo,
} from "@/lib/toast";

export function LaunchLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("sessionExpired") === "1";
  const registered = searchParams.get("registered") === "1";
  const mobileParam = searchParams.get("mobile") ?? "";

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof launchLoginSchema>, unknown, LaunchLoginInput>({
    resolver: zodResolver(launchLoginSchema),
    defaultValues: { mobile: mobileParam, dob: "", rememberMe: false },
  });

  useEffect(() => {
    if (mobileParam) {
      setValue("mobile", mobileParam);
    }
  }, [mobileParam, setValue]);

  // 48h Remember Me: autofill mobile + DOB when cache is still valid.
  useEffect(() => {
    const cached = loadRememberMeCredentials();
    if (!cached) return;
    if (!mobileParam) setValue("mobile", cached.mobile);
    setValue("dob", cached.dob);
    setValue("rememberMe", true);
  }, [mobileParam, setValue]);

  useEffect(() => {
    if (sessionExpired) {
      toastInfo("ℹ️ Your session has expired.", {
        description: "Please login again.",
      });
    }
  }, [sessionExpired]);

  useEffect(() => {
    if (registered) {
      toastRegistrationSuccessful();
    }
  }, [registered]);

  // Silent session restore: validate HttpOnly cookie with backend before showing login.
  useEffect(() => {
    let cancelled = false;

    void fetch("/api/auth/session", { credentials: "include" })
      .then((response) => {
        if (cancelled || !response.ok) return;
        router.replace("/dashboard?welcomeBack=1");
        router.refresh();
      })
      .catch(() => {
        // Stay on login when validation fails or the network is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(values: LaunchLoginInput) {
    const loadingId = toastLoading("Signing in...");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      await response.json().catch(() => ({}));
      dismissToast(loadingId);

      if (!response.ok) {
        toastError("❌ Invalid Mobile Number or DOB");
        return;
      }

      if (values.rememberMe) {
        saveRememberMeCredentials({
          mobile: values.mobile,
          dob: values.dob,
        });
      } else {
        clearRememberMeCredentials();
      }

      toastLoggedInSuccessfully();

      router.push("/dashboard");
      router.refresh();
    } catch {
      dismissToast(loadingId);
      toastNetworkError();
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Login</h1>
        <p className="mt-2 text-sm text-plum-muted">
          Sign in with your mobile number and date of birth.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-[14px] border border-border bg-card p-6 shadow-sm"
        noValidate
      >
        <div>
          <label htmlFor="mobile" className="text-sm font-semibold text-plum-muted">
            Mobile number
          </label>
          <Input id="mobile" type="tel" className="mt-1" {...register("mobile")} />
          {errors.mobile && (
            <p className="mt-1 text-sm text-error">{errors.mobile.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="dob" className="text-sm font-semibold text-plum-muted">
            Date of birth
          </label>
          <Input id="dob" type="date" className="mt-1" {...register("dob")} />
          {errors.dob && (
            <p className="mt-1 text-sm text-error">{errors.dob.message}</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-plum-muted">
          <input
            type="checkbox"
            className="size-4 rounded border-border accent-primary"
            {...register("rememberMe")}
          />
          Remember me
          <span className="text-xs text-muted-foreground">
            (autofill + stay signed in for 48 hours)
          </span>
        </label>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Logging in..." : "Login"}
        </Button>
      </form>
    </div>
  );
}
