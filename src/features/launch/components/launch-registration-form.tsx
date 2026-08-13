"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AlreadyRegisteredDialog } from "@/components/participant/already-registered-dialog";
import {
  dismissToast,
  toastError,
  toastLoading,
  toastNetworkError,
  toastRegistrationError,
  toastRegistrationSuccessful,
  toastUnexpectedError,
  toastWarning,
} from "@/lib/toast";
import { saveRegistrationResult } from "@/lib/registration-onboarding";
import { SurveyAnalytics } from "@/analytics";
import { attachAnalyticsToSubmission } from "@/lib/analytics-storage";
import {
  ACQUISITION_OTHER,
  ACQUISITION_SOURCE_OPTIONS,
} from "@/lib/acquisition";
import { getReferralAttribution } from "@/lib/referral-attribution";
import type { ScreenerSchema } from "@/types/domain";

type SelectableCity = { id: string; name: string; state: string };

const baseSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  mobile: z
    .string()
    .trim()
    .min(10, "Enter a valid mobile number")
    .regex(/^[\d\s+()-]+$/, "Enter a valid mobile number"),
  dob: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth"),
  city_id: z.string().uuid("Please select a city from the list."),
});

type BaseFormValues = z.infer<typeof baseSchema>;

export function LaunchRegistrationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [referrerCode, setReferrerCode] = useState("");
  const [referralPlatform, setReferralPlatform] = useState("");

  const [acquisitionSource, setAcquisitionSource] = useState("");
  const [otherSource, setOtherSource] = useState("");
  const [formSchema, setFormSchema] = useState<ScreenerSchema | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fieldStartTimes, setFieldStartTimes] = useState<
    Record<string, number>
  >({});
  const [fieldResponseTimes, setFieldResponseTimes] = useState<
    Record<string, number>
  >({});
  const [startedAt] = useState(() => new Date().toISOString());
  const [loadingForm, setLoadingForm] = useState(true);
  const [cities, setCities] = useState<SelectableCity[]>([]);
  const [duplicateMobile, setDuplicateMobile] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastCheckedMobile = useRef<string>("");

  useEffect(() => {
    const stored = getReferralAttribution();
    if (stored.code) {
      setReferrerCode(stored.code);
      setReferralPlatform(stored.platform ?? "");
      return;
    }

    setReferrerCode(searchParams.get("ref") ?? "");
    setReferralPlatform(searchParams.get("platform") ?? "");
  }, [searchParams]);

  async function checkMobileExists(rawMobile: string) {
    const mobile = rawMobile.replace(/\D/g, "");
    if (mobile.length < 10 || mobile === lastCheckedMobile.current) return;
    lastCheckedMobile.current = mobile;

    try {
      const response = await fetch(
        `/api/participant/check-mobile?mobile=${encodeURIComponent(mobile)}`,
      );
      if (!response.ok) return;

      const data = (await response.json()) as { exists?: boolean };
      if (data.exists) {
        setDuplicateMobile(rawMobile.trim());
      }
    } catch {
      // Never block registration if the lookup fails.
    }
  }

  useEffect(() => {
    if (!formRef.current || loadingForm) return;
    SurveyAnalytics.start(formRef.current);
    return () => SurveyAnalytics.stop();
  }, [loadingForm, formSchema]);

  function startFieldTimer(fieldId: string) {
    setFieldStartTimes((current) => ({ ...current, [fieldId]: Date.now() }));
  }

  function recordFieldTime(fieldId: string) {
    const start = fieldStartTimes[fieldId];
    if (!start) return;
    const seconds = Math.max(0, Math.round((Date.now() - start) / 1000));
    setFieldResponseTimes((current) => ({ ...current, [fieldId]: seconds }));
  }

  function buildSubmissionPayload(values: BaseFormValues) {
    if (!formSchema) {
      return null;
    }

    const qAnswers: Record<string, string> = {};
    const qTimes: Record<string, number> = {};

    formSchema.fields.forEach((field, index) => {
      const qKey = `Q${index + 1}`;
      qAnswers[qKey] = answers[field.id] ?? "";
      const activeStart = fieldStartTimes[field.id];
      if (activeStart) {
        qTimes[qKey] = Math.max(
          0,
          Math.round((Date.now() - activeStart) / 1000),
        );
      } else {
        qTimes[qKey] = fieldResponseTimes[field.id] ?? 0;
      }
    });

    const selectedCity = cities.find((city) => city.id === values.city_id);

    return {
      ...values,
      city: selectedCity?.name,
      referrerCode: referrerCode || undefined,
      referralPlatform: referralPlatform || undefined,
      acquisitionSource: acquisitionSource || undefined,
      otherSource:
        acquisitionSource === ACQUISITION_OTHER
          ? otherSource || undefined
          : undefined,
      answers: qAnswers,
      responseTimes: qTimes,
      startedAt,
      submittedAt: new Date().toISOString(),
    };
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BaseFormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: { fullName: "", mobile: "", dob: "", city_id: "" },
  });

  useEffect(() => {
    void Promise.all([
      fetch("/api/form/active").then((res) => res.json()),
      fetch("/api/cities").then((res) => res.json()),
    ])
      .then(([formData, citiesData]) => {
        if (formData.schema) setFormSchema(formData.schema as ScreenerSchema);
        if (Array.isArray(citiesData.cities)) {
          setCities(citiesData.cities as SelectableCity[]);
        }
      })
      .catch(() => toastNetworkError())
      .finally(() => setLoadingForm(false));
  }, []);

  async function onSubmit(values: BaseFormValues) {
    if (!formSchema) {
      toastError("❌ Registration Failed", {
        description: "Registration form is not available.",
      });
      return;
    }

    if (!acquisitionSource) {
      toastWarning("Please tell us how you heard about this survey.");
      return;
    }

    if (acquisitionSource === ACQUISITION_OTHER && !otherSource.trim()) {
      toastWarning("Please specify how you heard about this survey.");
      return;
    }

    for (const field of formSchema.fields) {
      if (field.required && !answers[field.id]?.trim()) {
        toastWarning(`Please answer: ${field.label}`);
        return;
      }
    }

    const loadingId = toastLoading("Registering...");

    try {
      const payload = buildSubmissionPayload(values);
      if (!payload) {
        dismissToast(loadingId);
        toastError("❌ Registration Failed", {
          description: "Registration form is not available.",
        });
        return;
      }

      const response = await fetch("/api/screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          attachAnalyticsToSubmission(payload, SurveyAnalytics.export()),
        ),
      });

      const data = await response.json();
      dismissToast(loadingId);

      if (!response.ok) {
        if (data.code === "DUPLICATE_MOBILE") {
          setDuplicateMobile(values.mobile);
          return;
        }
        toastRegistrationError(data);
        return;
      }

      toastRegistrationSuccessful();

      saveRegistrationResult({
        leadId: data.leadId,
        fullName: data.fullName,
        mobile: data.mobile,
        status: data.status,
        referralLink: data.referralLink,
        messages: data.messages,
      });

      window.setTimeout(() => {
        router.push("/registration-complete");
      }, 1500);
    } catch {
      dismissToast(loadingId);
      toastUnexpectedError();
    }
  }

  if (loadingForm) {
    return (
      <p className="text-center text-sm text-plum-muted">
        Loading registration form...
      </p>
    );
  }

  return (
    <>
      <AlreadyRegisteredDialog
        open={duplicateMobile !== null}
        mobile={duplicateMobile ?? ""}
      />

      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="mt-4 text-2xl font-semibold text-foreground">
            First-Time Voters Study
          </h1>
          <p className="mt-2 text-sm text-plum-muted">
            Independent research on first-time voters in the 2024 Lok Sabha
            election.
          </p>
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 rounded-[14px] border border-border bg-card p-6 shadow-sm"
          noValidate
        >
          <div>
            <label
              htmlFor="fullName"
              className="text-sm font-semibold text-plum-muted"
            >
              Full name
            </label>
            <Input id="fullName" className="mt-1" {...register("fullName")} />
            {errors.fullName && (
              <p className="mt-1 text-sm text-error">
                {errors.fullName.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="mobile"
              className="text-sm font-semibold text-plum-muted"
            >
              Mobile number
            </label>
            <Input
              id="mobile"
              type="tel"
              className="mt-1"
              {...register("mobile")}
              onBlur={(event) => {
                void register("mobile").onBlur(event);
                void checkMobileExists(event.target.value);
              }}
            />
            {errors.mobile && (
              <p className="mt-1 text-sm text-error">
                {errors.mobile.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="dob"
              className="text-sm font-semibold text-plum-muted"
            >
              Date of birth
            </label>
            <Input id="dob" type="date" className="mt-1" {...register("dob")} />
            {errors.dob && (
              <p className="mt-1 text-sm text-error">{errors.dob.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="city_id"
              className="text-sm font-semibold text-plum-muted"
            >
              City
            </label>
            <Select id="city_id" className="mt-1" {...register("city_id")}>
              <option value="">Select city</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                  {city.state ? ` (${city.state})` : ""}
                </option>
              ))}
            </Select>
            {errors.city_id && (
              <p className="mt-1 text-sm text-error">
                {errors.city_id.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="acquisitionSource"
              className="text-sm font-semibold text-plum-muted"
            >
              How did you hear about this survey?
            </label>
            <Select
              id="acquisitionSource"
              className="mt-1"
              value={acquisitionSource}
              onChange={(e) => setAcquisitionSource(e.target.value)}
            >
              <option value="">Select...</option>
              {ACQUISITION_SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          {acquisitionSource === ACQUISITION_OTHER && (
            <div>
              <label
                htmlFor="otherSource"
                className="text-sm font-semibold text-plum-muted"
              >
                Please specify
              </label>
              <Input
                id="otherSource"
                className="mt-1"
                value={otherSource}
                onChange={(e) => setOtherSource(e.target.value)}
              />
            </div>
          )}

          {formSchema?.fields.map((field) => (
            <div key={field.id}>
              <label
                htmlFor={field.id}
                className="text-sm font-semibold text-plum-muted"
              >
                {field.label}
              </label>
              {field.type === "select" && field.options ? (
                <Select
                  id={field.id}
                  className="mt-1"
                  value={answers[field.id] ?? ""}
                  onFocus={() => startFieldTimer(field.id)}
                  onBlur={() => recordFieldTime(field.id)}
                  onChange={(e) =>
                    setAnswers((current) => ({
                      ...current,
                      [field.id]: e.target.value,
                    }))
                  }
                >
                  <option value="">Select...</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={field.id}
                  className="mt-1"
                  value={answers[field.id] ?? ""}
                  onFocus={() => startFieldTimer(field.id)}
                  onBlur={() => recordFieldTime(field.id)}
                  onChange={(e) =>
                    setAnswers((current) => ({
                      ...current,
                      [field.id]: e.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Register"}
          </Button>
        </form>
      </div>
    </>
  );
}
