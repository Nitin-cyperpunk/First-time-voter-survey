import { NextRequest, NextResponse } from "next/server";

import { getAppUrl } from "@/lib/app-url";
import {
  establishParticipantSession,
  getAuthenticatedParticipant,
} from "@/lib/auth/participant-session";
import { serveActiveFormHtml } from "@/lib/forms/serve-html";
import {
  canAccessSurvey,
  toSurveyAccessFields,
} from "@/lib/survey-token.service";
import { hasSurveyResponse } from "@/server/repositories/survey.repository";
import { validateSurveyTokenRecord } from "@/server/services/token-validator.service";

export const dynamic = "force-dynamic";

/**
 * Prefer the public app origin; fall back to the request host.
 * Avoids deploy-preview host leaking into redirects when aliases differ.
 */
function resolveOrigin(request: NextRequest): string {
  try {
    return getAppUrl();
  } catch {
    const forwarded = request.headers.get("x-forwarded-host");
    const host = forwarded ?? request.headers.get("host");
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto") ??
        (request.nextUrl.protocol.replace(":", "") || "https");
      return `${proto}://${host.split(",")[0]!.trim()}`;
    }
    return request.nextUrl.origin;
  }
}

function absolutePath(request: NextRequest, pathname: string) {
  return new URL(pathname, `${resolveOrigin(request)}/`);
}

function invalidRedirect(request: NextRequest, reason: string) {
  const url = absolutePath(request, "/survey/invalid");
  url.searchParams.set("reason", reason);
  return new NextResponse(null, {
    status: 303,
    headers: { Location: url.toString() },
  });
}

function injectSurveyDraftId(html: string, leadId: string) {
  if (html.includes("window.__concaveSurveyDraftId=")) return html;
  const payload = JSON.stringify(leadId).replace(/</g, "\\u003c");
  const script = `<script>window.__concaveSurveyDraftId=${payload};</script>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${script}\n</head>`);
  }
  return `${script}\n${html}`;
}

/** Strip ?t= from the address bar without a navigation (avoids Netlify redirect loops). */
function injectCleanSurveyUrlScript(html: string) {
  const script =
    '<script>try{if(location.search.indexOf("t=")!==-1){history.replaceState(null,"",location.pathname);}}catch(e){}</script>';
  if (html.includes("history.replaceState(null,\"\",location.pathname)")) {
    return html;
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${script}\n</head>`);
  }
  return `${script}\n${html}`;
}

async function serveSurveyHtml(leadId: string, options?: { cleanUrl?: boolean }) {
  const htmlResponse = await serveActiveFormHtml("survey");
  let body = injectSurveyDraftId(await htmlResponse.text(), leadId);
  if (options?.cleanUrl) {
    body = injectCleanSurveyUrlScript(body);
  }
  return new NextResponse(body, {
    status: htmlResponse.status,
    headers: htmlResponse.headers,
  });
}

/**
 * Survey entry:
 * - /survey?t=<token> → validate, set session cookie, serve form (no 303 — Netlify
 *   was looping when Location kept ?t=)
 * - /survey (session) → serve form when participant_session cookie is present
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")?.trim();

  if (token) {
    const validation = await validateSurveyTokenRecord(token);
    if (!validation.valid) {
      return invalidRedirect(request, validation.reason);
    }

    try {
      const html = await serveSurveyHtml(validation.leadId, { cleanUrl: true });
      return await establishParticipantSession(
        html,
        validation.leadId,
        true,
      );
    } catch (error) {
      console.error("GET /survey?t= session establish failed:", error);
      return invalidRedirect(request, "SESSION_FAILED");
    }
  }

  // Clean URL path — require an established participant session.
  const participant = await getAuthenticatedParticipant();
  if (!participant) {
    return invalidRedirect(request, "NO_SESSION");
  }

  if (await hasSurveyResponse(participant.leadId)) {
    return invalidRedirect(request, "ALREADY_SUBMITTED");
  }

  if (!canAccessSurvey(toSurveyAccessFields(participant))) {
    if (participant.status !== "eligible") {
      return invalidRedirect(request, "NOT_ELIGIBLE");
    }
    if (!participant.surveyAccessGranted || !participant.surveyToken?.trim()) {
      return invalidRedirect(request, "ACCESS_NOT_GRANTED");
    }
    return invalidRedirect(request, "TOKEN_EXPIRED");
  }

  try {
    return await serveSurveyHtml(participant.leadId);
  } catch (error) {
    console.error("GET /survey failed:", error);
    return invalidRedirect(request, "FORM_UNAVAILABLE");
  }
}
