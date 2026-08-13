import { NextResponse } from "next/server";

import { injectSurveyImagesScriptWithCatalog } from "@/lib/forms/inject-survey-images";
import type { FormType } from "@/lib/forms/types";
import { injectRegistrationBridge } from "@/lib/forms/html-upload";
import { injectFieldQKeyMap } from "@/lib/forms/inject-field-q-key-map";
import { isRegistrationAccepting } from "@/lib/study-config/gates";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";

const ANALYTICS_SCRIPT = '<script src="/forms/survey-analytics.js"></script>';
const DEVICE_FINGERPRINT_SCRIPT =
  '<script src="/forms/device-fingerprint.js"></script>';
const FORM_DRAFT_SCRIPT = '<script src="/forms/form-draft.js"></script>';
const SURVEY_RESPONSE_DOCUMENT_SCRIPT =
  '<script src="/forms/survey-response-document.js"></script>';
const NEST_BY_QUESTION_SCRIPT =
  '<script src="/forms/nest-by-question.js"></script>';
const REFERRAL_ATTRIBUTION_SCRIPT =
  '<script src="/forms/referral-attribution.js"></script>';
const REFILL_BRIDGE_SCRIPT = '<script src="/forms/refill-bridge.js"></script>';
const SURVEY_BRIDGE_SCRIPT = '<script src="/forms/survey-bridge.js"></script>';
const SURVEY_BRIDGE_ATTACH =
  "showResult = ConcaveSurveyBridge.attach(showResult);";

function injectHeadScript(html: string, scriptTag: string) {
  if (html.includes(scriptTag) || html.includes(scriptTag.replace(/"/g, "'"))) {
    return html;
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${scriptTag}\n</head>`);
  }
  return html;
}

function injectSurveyBridgeAttach(html: string) {
  if (html.includes("ConcaveSurveyBridge.attach")) {
    return html;
  }

  // Match registration's robust attach: showScreen(0) with optional semicolon.
  if (/showScreen\s*\(\s*0\s*\)\s*;?/.test(html)) {
    return html.replace(
      /showScreen\s*\(\s*0\s*\)\s*;?/,
      `showScreen(0);\n${SURVEY_BRIDGE_ATTACH}`,
    );
  }

  // Fallback: inject before the last </script></body> (same as registration upload path).
  if (/<\/script>\s*<\/body>/i.test(html)) {
    return html.replace(
      /<\/script>\s*<\/body>/i,
      `${SURVEY_BRIDGE_ATTACH}\n</script>\n</body>`,
    );
  }

  // Last resort: append before </body> so submit always wires.
  if (/<\/body>/i.test(html)) {
    return html.replace(
      /<\/body>/i,
      `<script>${SURVEY_BRIDGE_ATTACH}</script>\n</body>`,
    );
  }

  console.warn(
    "[serve-html] Could not attach ConcaveSurveyBridge — survey submit may never fire",
  );
  return html;
}

export function htmlResponse(html: string) {
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}

export function ensureAnalyticsScript(html: string) {
  return injectHeadScript(html, ANALYTICS_SCRIPT);
}

export function ensureDeviceFingerprintScript(html: string) {
  return injectHeadScript(html, DEVICE_FINGERPRINT_SCRIPT);
}

export function ensureFormDraftScript(html: string) {
  return injectHeadScript(html, FORM_DRAFT_SCRIPT);
}

export function ensureRegistrationScripts(html: string) {
  let next = ensureAnalyticsScript(html);
  next = ensureFormDraftScript(next);
  next = ensureDeviceFingerprintScript(next);
  if (!next.includes("/forms/referral-attribution.js") && /<\/head>/i.test(next)) {
    next = next.replace(/<\/head>/i, `  ${REFERRAL_ATTRIBUTION_SCRIPT}\n</head>`);
  }
  return injectRegistrationBridge(next);
}

export function injectStudyConfigScript(html: string, config: unknown) {
  if (!/<\/head>/i.test(html) || html.includes("window.__concaveStudyConfig=")) {
    return html;
  }
  const payload = JSON.stringify(config).replace(/</g, "\\u003c");
  const script = `<script>window.__concaveStudyConfig=${payload};</script>`;
  return html.replace(/<\/head>/i, `  ${script}\n</head>`);
}

export async function ensureSurveyScripts(html: string) {
  let next = ensureAnalyticsScript(html);
  next = ensureFormDraftScript(next);
  next = injectHeadScript(next, SURVEY_RESPONSE_DOCUMENT_SCRIPT);
  next = injectHeadScript(next, NEST_BY_QUESTION_SCRIPT);
  next = injectHeadScript(next, SURVEY_BRIDGE_SCRIPT);
  next = injectSurveyBridgeAttach(next);
  return injectSurveyImagesScriptWithCatalog(next);
}

export function injectFormSchema(html: string, schema: unknown) {
  if (!schema || !/<\/head>/i.test(html)) {
    return html;
  }

  const payload = JSON.stringify(schema).replace(/</g, "\\u003c");
  const script = `<script>window.__concaveFormSchema=${payload};</script>`;
  if (html.includes("window.__concaveFormSchema=")) {
    return html;
  }

  return html.replace(/<\/head>/i, `  ${script}\n</head>`);
}

function surveyClosedPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Survey closed</title>
  <style>
    :root { --bg:#FBF7F8; --card:#fff; --plum:#3A2A33; --muted:#94838C; --line:#ECDDE2; --rose:#C97B8E; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      padding:24px; font-family: system-ui, Segoe UI, sans-serif; background:var(--bg); color:var(--plum); }
    .card { width:100%; max-width:28rem; border:1px solid var(--line); border-radius:14px;
      background:var(--card); padding:2rem; text-align:center; box-shadow:0 1px 2px rgba(58,42,51,.06); }
    .badge { display:inline-flex; align-items:center; gap:8px; border-radius:999px; padding:6px 12px;
      background:#F6EEF1; color:var(--muted); font-size:12px; font-weight:600; margin-bottom:16px; }
    .dot { width:8px; height:8px; border-radius:999px; background:var(--rose); }
    h1 { margin:0 0 12px; font-size:1.25rem; line-height:1.35; }
    p { margin:0; font-size:.9rem; line-height:1.55; color:var(--muted); }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Closed — Not Accepting Responses</div>
    <h1>This survey is no longer accepting responses</h1>
    <p>Please contact the admin if you believe this is an error.</p>
  </div>
</body>
</html>`;
}

export async function serveActiveFormHtml(formType: FormType) {
  let studyConfig = null as Awaited<ReturnType<typeof getStudyConfig>> | null;
  if (formType === "registration") {
    studyConfig = await getStudyConfig();
    if (!isRegistrationAccepting(studyConfig)) {
      return htmlResponse(surveyClosedPageHtml());
    }
  }

  const form = await getActivePublishedForm(formType);

  if (!form?.htmlContent) {
    return htmlResponse(
      `<!doctype html><html><body><p>The ${formType} form is not available. Please try again later.</p></body></html>`,
    );
  }

  let html =
    formType === "registration"
      ? ensureRegistrationScripts(form.htmlContent)
      : await ensureSurveyScripts(form.htmlContent);

  if (formType === "registration" && studyConfig) {
    html = injectStudyConfigScript(html, studyConfig);
  }

  const withFieldMap = injectFieldQKeyMap(html, {
    excludeCoreFields: formType === "registration",
  });

  const withSchema =
    formType === "survey"
      ? injectFormSchema(withFieldMap, form.schema)
      : withFieldMap;

  return htmlResponse(withSchema);
}

export async function serveRefillFormHtml() {
  const form = await getActivePublishedForm("registration");

  if (!form?.htmlContent) {
    return htmlResponse(
      `<!doctype html><html><body><p>The registration form is not available. Please try again later.</p></body></html>`,
    );
  }

  let html = ensureAnalyticsScript(form.htmlContent);
  html = ensureDeviceFingerprintScript(html);
  if (!html.includes("/forms/refill-bridge.js") && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `  ${REFILL_BRIDGE_SCRIPT}\n</head>`);
  }

  const withFieldMap = injectFieldQKeyMap(html, { excludeCoreFields: true });

  return htmlResponse(withFieldMap);
}
