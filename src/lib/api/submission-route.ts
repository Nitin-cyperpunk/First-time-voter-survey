import { NextResponse } from "next/server";

import {
  SubmissionError,
  submissionErrorResponse,
  SUBMISSION_ERROR_SUPPORT,
} from "@/lib/db-errors";

export function handleSubmissionRouteError(error: unknown, logLabel: string) {
  if (error instanceof SubmissionError) {
    return NextResponse.json(
      {
        ...submissionErrorResponse(error.code),
        support: SUBMISSION_ERROR_SUPPORT,
      },
      { status: 409 },
    );
  }

  if (error instanceof Error) {
    if (error.message === "DUPLICATE_MOBILE") {
      return NextResponse.json(
        {
          ...submissionErrorResponse("DUPLICATE_MOBILE"),
          support: SUBMISSION_ERROR_SUPPORT,
        },
        { status: 409 },
      );
    }
    if (error.message === "PARTICIPANT_NOT_FOUND") {
      return NextResponse.json(
        { error: "Participant not found." },
        { status: 404 },
      );
    }
    if (error.message === "REFILL_NOT_REQUIRED") {
      return NextResponse.json(
        { error: "Refill is not required for this participant." },
        { status: 400 },
      );
    }
    if (error.message === "SCREENER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Registration response not found." },
        { status: 404 },
      );
    }
    if (error.message === "REFILL_NOT_REQUIRED") {
      return NextResponse.json(
        { error: "Refill is not required for this participant." },
        { status: 400 },
      );
    }
    if (error.message === "SCREENER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Registration response not found." },
        { status: 404 },
      );
    }
    if (error.message.startsWith("MISSING_ANSWER:")) {
      return NextResponse.json(
        { error: "Please complete all required questions." },
        { status: 400 },
      );
    }
    if (error.message.startsWith("INVALID_RESPONSE:")) {
      const detail = error.message.slice("INVALID_RESPONSE:".length);
      return NextResponse.json(
        { error: detail || "Invalid response payload." },
        { status: 400 },
      );
    }
    if (error.message === "NOT_ELIGIBLE") {
      return NextResponse.json(
        {
          error: "Survey access is not available for your account.",
          code: "NOT_ELIGIBLE",
          support: SUBMISSION_ERROR_SUPPORT,
        },
        { status: 403 },
      );
    }
    if (error.message === "SURVEY_CLOSED") {
      return NextResponse.json(
        {
          error:
            "This survey is no longer accepting responses — please contact the admin.",
          code: "SURVEY_CLOSED",
        },
        { status: 403 },
      );
    }
    if (error.message.startsWith("AGE_OUT_OF_RANGE:")) {
      const detail = error.message.slice("AGE_OUT_OF_RANGE:".length);
      return NextResponse.json(
        { error: detail || "Age is outside the study range.", code: "AGE_OUT_OF_RANGE" },
        { status: 400 },
      );
    }
  }

  console.error(`${logLabel} failed:`, error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
