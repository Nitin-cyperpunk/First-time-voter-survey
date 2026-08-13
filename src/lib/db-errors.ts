export type SubmissionErrorCode =
  | "DUPLICATE_MOBILE"
  | "DUPLICATE_SCREENER"
  | "DUPLICATE_SURVEY";

export class SubmissionError extends Error {
  readonly code: SubmissionErrorCode;

  constructor(code: SubmissionErrorCode, message: string) {
    super(message);
    this.name = "SubmissionError";
    this.code = code;
  }
}

type PostgresError = {
  code?: string;
  details?: string;
  message?: string;
};

export function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as PostgresError).code === "23505"
  );
}

export function getUniqueViolationColumn(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("details" in error)) {
    return null;
  }

  const details = String((error as PostgresError).details ?? "");
  const match = details.match(/Key \(([^)]+)\)/);
  return match?.[1] ?? null;
}

export function mapUniqueViolationToSubmissionError(
  error: unknown,
  code: SubmissionErrorCode,
): SubmissionError | null {
  if (!isPostgresUniqueViolation(error)) return null;
  return new SubmissionError(code, SUBMISSION_ERROR_MESSAGES[code]);
}

export const SUBMISSION_ERROR_MESSAGES: Record<SubmissionErrorCode, string> = {
  DUPLICATE_MOBILE:
    "This mobile number is already registered. Please log in instead.",
  DUPLICATE_SCREENER: "You have already submitted this form.",
  DUPLICATE_SURVEY:
    "Our records show this survey has already been completed.",
};

export const SUBMISSION_ERROR_SUPPORT =
  "If you believe this is an error, please contact support.";

export function submissionErrorResponse(code: SubmissionErrorCode) {
  return {
    error: SUBMISSION_ERROR_MESSAGES[code],
    code,
    support: SUBMISSION_ERROR_SUPPORT,
    ...(code === "DUPLICATE_MOBILE" ? { existingParticipant: true } : {}),
  };
}
