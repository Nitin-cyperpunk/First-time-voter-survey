import { NextResponse } from "next/server";

import type { FormType } from "@/lib/forms/types";
import { injectRegistrationBridge } from "@/lib/forms/html-upload";
import { injectFieldQKeyMap } from "@/lib/forms/inject-field-q-key-map";
import {
  ensureCityIdSelect,
  injectSelectableCitiesScript,
} from "@/lib/forms/inject-city-select";
import { isRegistrationAccepting } from "@/lib/study-config/gates";
import { listSelectableCities } from "@/server/services/quota.service";
import { getActivePublishedForm } from "@/server/repositories/forms.repository";
import { getStudyConfig } from "@/server/repositories/form-settings.repository";

const ANALYTICS_SCRIPT = '<script src="/forms/survey-analytics.js"></script>';
const DEVICE_FINGERPRINT_SCRIPT =
  '<script src="/forms/device-fingerprint.js"></script>';
const FORM_DRAFT_SCRIPT = '<script src="/forms/form-draft.js"></script>';
const REFERRAL_ATTRIBUTION_SCRIPT =
  '<script src="/forms/referral-attribution.js"></script>';

function injectHeadScript(html: string, scriptTag: string) {
  if (html.includes(scriptTag) || html.includes(scriptTag.replace(/"/g, "'"))) {
    return html;
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${scriptTag}\n</head>`);
  }
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
  <title>First-Time Voters Study | Concave Insights</title>
  <style>
    :root {
      --bg:#F8F9FA; --surface:#FFFFFF; --text-primary:#1E3A8A; --text-body:#334155;
      --text-muted:#64748B; --border:#E2E8F0; --accent:#5B4B8A; --accent-hover:#4A3C73;
      --accent-soft:#EFECF5; --error:#B91C1C;
    }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      padding:24px; font-family: ui-sans-serif, system-ui, Segoe UI, sans-serif; background:var(--bg); color:var(--text-primary); }
    .card { width:100%; max-width:28rem; border:1px solid var(--border); border-radius:14px;
      background:var(--surface); padding:2rem; text-align:center; box-shadow:0 1px 2px rgba(30,58,138,.06); }
    .badge { display:inline-flex; align-items:center; gap:8px; border-radius:999px; padding:6px 12px;
      background:var(--accent-soft); color:var(--text-muted); font-size:12px; font-weight:600; margin-bottom:16px; }
    .dot { width:8px; height:8px; border-radius:999px; background:var(--accent); }
    h1 { margin:0 0 12px; font-size:1.25rem; line-height:1.35; color:var(--text-primary); }
    p { margin:0; font-size:.9rem; line-height:1.55; color:var(--text-body); }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Closed — Not Accepting Responses</div>
    <h1>The First-Time Voters Study is no longer accepting responses</h1>
    <p>Please contact Concave Insights if you believe this is an error.</p>
  </div>
</body>
</html>`;
}

export async function serveActiveFormHtml(formType: FormType = "registration") {
  const studyConfig = await getStudyConfig();
  if (!isRegistrationAccepting(studyConfig)) {
    return htmlResponse(surveyClosedPageHtml());
  }

  const form = await getActivePublishedForm(formType);

  if (!form?.htmlContent) {
    return htmlResponse(
      `<!doctype html><html><body><p>The registration form is not available. Please try again later.</p></body></html>`,
    );
  }

  let html = ensureRegistrationScripts(form.htmlContent);
  html = injectStudyConfigScript(html, studyConfig);
  html = ensureCityIdSelect(html);
  try {
    const cities = await listSelectableCities();
    html = injectSelectableCitiesScript(html, cities);
  } catch (error) {
    console.error("[serveActiveFormHtml] failed to inject cities:", error);
    html = injectSelectableCitiesScript(html, []);
  }

  const withFieldMap = injectFieldQKeyMap(html, {
    excludeCoreFields: true,
  });

  return htmlResponse(withFieldMap);
}
