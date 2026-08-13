"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const CONTACT_LINE =
  "Please contact Concave Insights if you need a new survey link.";

function messageForReason(reason: string | null): {
  title: string;
  body: string;
} {
  switch (reason) {
    case "NOT_ELIGIBLE":
      return {
        title: "Survey not available yet",
        body: "Your registration is not currently eligible for the main survey. " + CONTACT_LINE,
      };
    case "ACCESS_NOT_GRANTED":
      return {
        title: "Survey access not granted",
        body: "Your survey link is not active yet. " + CONTACT_LINE,
      };
    case "TOKEN_EXPIRED":
      return {
        title: "Survey link expired",
        body: "This survey link has expired. " + CONTACT_LINE,
      };
    case "ALREADY_USED":
    case "ALREADY_SUBMITTED":
      return {
        title: "Survey already completed",
        body: "Our records show this survey has already been submitted. Thank you.",
      };
    case "INACTIVE":
    case "TOKEN_MISMATCH":
    case "NOT_FOUND":
    case "MISSING_TOKEN":
      return {
        title: "Invalid survey link",
        body: "This survey link is not valid. " + CONTACT_LINE,
      };
    case "NO_SESSION":
      return {
        title: "Survey session expired",
        body: "Please reopen your personal survey link from the message you received. " + CONTACT_LINE,
      };
    case "FORM_UNAVAILABLE":
    case "SESSION_FAILED":
      return {
        title: "Survey temporarily unavailable",
        body: "Please try again in a moment. " + CONTACT_LINE,
      };
    default:
      return {
        title: "Invalid or expired survey link",
        body: CONTACT_LINE,
      };
  }
}

function InvalidSurveyContent() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const { title, body } = messageForReason(reason);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-[14px] border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-plum-muted">{body}</p>
      </div>
    </div>
  );
}

export default function InvalidSurveyLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
          <div className="w-full max-w-md rounded-[14px] border border-border bg-card p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-foreground">
              Invalid or expired survey link
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-plum-muted">
              {CONTACT_LINE}
            </p>
          </div>
        </div>
      }
    >
      <InvalidSurveyContent />
    </Suspense>
  );
}
