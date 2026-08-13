import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleSubmissionRouteError } from "@/lib/api/submission-route";
import { getAuthenticatedParticipant } from "@/lib/auth/participant-session";
import {
  canAccessSurvey,
  toSurveyAccessFields,
} from "@/lib/survey-token.service";
import { hasSurveyResponse } from "@/server/repositories/survey.repository";
import {
  findSurveyTokenRow,
  markSurveyTokenUsed,
} from "@/server/repositories/survey-tokens.repository";
import { submitSurvey } from "@/server/services/survey.service";

/**
 * Survey submit schema — intentionally looser than registration on timing fields.
 * Floats from analytics are coerced to ints so zod does not reject a valid submit.
 */
const surveySubmissionSchema = z.object({
  surveyToken: z.string().trim().min(1).optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
  answerJson: z.record(z.string(), z.unknown()).optional(),
  csvRow: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  responseTimes: z
    .record(z.string(), z.coerce.number().nonnegative())
    .optional()
    .transform((times) => {
      if (!times) return times;
      const rounded: Record<string, number> = {};
      for (const [key, value] of Object.entries(times)) {
        rounded[key] = Math.max(0, Math.round(value));
      }
      return rounded;
    }),
  currentScreen: z.string().trim().optional(),
  lastScreen: z.string().trim().optional(),
  analytics: z
    .object({
      survey: z.record(z.string(), z.unknown()),
      questions: z.record(z.string(), z.unknown()),
    })
    .optional(),
  startedAt: z.string().optional(),
  submittedAt: z.string().optional(),
});

function coerceIsoDate(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/**
 * POST /api/survey
 *
 * Registration saves without a prior session. Survey requires a participant
 * session established at /survey?t=… entry. After that, trust the session +
 * participant survey-access fields (same canAccessSurvey gate as submitSurvey).
 * Do NOT re-run the full entry-time token-record validator here — that blocked
 * saves when survey_tokens.is_active/used_at drifted while the session was valid.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = surveySubmissionSchema.safeParse(body);

    if (!parsed.success) {
      console.error("POST /api/survey validation failed:", parsed.error.flatten());
      return NextResponse.json(
        {
          error: "Invalid survey submission.",
          code: "INVALID_PAYLOAD",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const participant = await getAuthenticatedParticipant();
    if (!participant) {
      console.error("POST /api/survey rejected: no participant session");
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const access = toSurveyAccessFields(participant);
    if (!canAccessSurvey(access)) {
      console.error("POST /api/survey rejected: canAccessSurvey=false", {
        leadId: participant.leadId,
        status: participant.status,
        surveyAccessGranted: participant.surveyAccessGranted,
        hasToken: Boolean(participant.surveyToken?.trim()),
        expiresAt: participant.surveyTokenExpiresAt,
      });
      return NextResponse.json(
        {
          error: "Survey access is not available for your account.",
          code: "NOT_ELIGIBLE",
        },
        { status: 403 },
      );
    }

    const surveyToken =
      parsed.data.surveyToken?.trim() || participant.surveyToken?.trim() || "";

    if (!surveyToken) {
      console.error("POST /api/survey rejected: missing survey token", {
        leadId: participant.leadId,
      });
      return NextResponse.json(
        { error: "Invalid survey link.", code: "INVALID_SURVEY_TOKEN" },
        { status: 403 },
      );
    }

    // Optional consistency check: if client echoed a token, it must match.
    if (
      parsed.data.surveyToken?.trim() &&
      parsed.data.surveyToken.trim() !== participant.surveyToken?.trim()
    ) {
      console.error("POST /api/survey rejected: token mismatch", {
        leadId: participant.leadId,
      });
      return NextResponse.json(
        { error: "Invalid survey link.", code: "TOKEN_MISMATCH" },
        { status: 403 },
      );
    }

    const alreadySubmitted = await hasSurveyResponse(participant.leadId);
    if (alreadySubmitted) {
      return NextResponse.json(
        {
          error: "Our records show this survey has already been completed.",
          code: "DUPLICATE_SURVEY",
        },
        { status: 409 },
      );
    }

    console.info("POST /api/survey inserting", {
      leadId: participant.leadId,
      answerKeys: Object.keys(parsed.data.answers ?? {}).length,
    });

    await submitSurvey(participant.leadId, {
      answers: parsed.data.answers,
      answerJson: parsed.data.answerJson,
      csvRow: parsed.data.csvRow,
      responseTimes: parsed.data.responseTimes,
      analytics: parsed.data.analytics,
      startedAt: coerceIsoDate(parsed.data.startedAt),
      submittedAt: coerceIsoDate(parsed.data.submittedAt),
      currentScreen: parsed.data.currentScreen,
      lastScreen: parsed.data.lastScreen,
    });

    // Best-effort: mark matching survey_tokens row used (do not fail the save).
    try {
      const row = await findSurveyTokenRow(surveyToken);
      if (row && row.lead_id === participant.leadId) {
        await markSurveyTokenUsed(surveyToken);
      }
    } catch (markError) {
      console.error("POST /api/survey markSurveyTokenUsed failed:", markError);
    }

    console.info("POST /api/survey saved", { leadId: participant.leadId });
    return NextResponse.json({ submitted: true }, { status: 201 });
  } catch (error) {
    console.error("POST /api/survey failed:", error);
    return handleSubmissionRouteError(error, "POST /api/survey");
  }
}
