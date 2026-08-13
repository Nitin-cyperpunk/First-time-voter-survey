import type { FormType } from "@/lib/forms/types";

import { injectFieldQKeyMap } from "@/lib/forms/inject-field-q-key-map";

const ANALYTICS_SCRIPT = '<script src="/forms/survey-analytics.js"></script>';
const DEVICE_FINGERPRINT_SCRIPT =
  '<script src="/forms/device-fingerprint.js"></script>';
const FORM_DRAFT_SCRIPT = '<script src="/forms/form-draft.js"></script>';
const REFERRAL_ATTRIBUTION_SCRIPT =
  '<script src="/forms/referral-attribution.js"></script>';
const REGISTRATION_BRIDGE_SCRIPT =
  '<script src="/forms/registration-bridge.js"></script>';
const REGISTRATION_BRIDGE_ATTACH =
  "showResult = ConcaveRegistrationBridge.attach(showResult);";
const MAX_HTML_BYTES = 1024 * 1024;

export function validateUploadedHtmlFile(input: {
  fileName: string;
  size: number;
}) {
  if (!input.fileName.toLowerCase().endsWith(".html")) {
    throw new Error("Only .html files can be uploaded.");
  }

  if (input.size > MAX_HTML_BYTES) {
    throw new Error("HTML file is too large. Maximum size is 1MB.");
  }
}

export function prepareUploadedFormHtml(html: string, _formType: FormType) {
  return prepareRegistrationHtml(html);
}

function injectScript(html: string, scriptTag: string) {
  if (html.includes(scriptTag)) return html;

  if (!/<\/head>/i.test(html)) {
    throw new Error("HTML must include a </head> tag.");
  }

  return html.replace(/<\/head>/i, `  ${scriptTag}\n</head>`);
}

function injectBridgeAttach(
  html: string,
  attachSnippet: string,
  bridgeGlobal: string,
) {
  if (html.includes(bridgeGlobal)) {
    return html;
  }

  if (html.includes("showScreen(0);")) {
    return html.replace("showScreen(0);", `showScreen(0);\n${attachSnippet}`);
  }

  if (/showScreen\s*\(\s*0\s*\)\s*;?/.test(html)) {
    return html.replace(
      /showScreen\s*\(\s*0\s*\)\s*;?/,
      `showScreen(0);\n${attachSnippet}`,
    );
  }

  if (/<\/script>\s*<\/body>/i.test(html)) {
    return html.replace(
      /<\/script>\s*<\/body>/i,
      `${attachSnippet}\n</script>\n</body>`,
    );
  }

  throw new Error(
    "HTML must call showScreen(0) or expose a final script where the bridge can attach.",
  );
}

function injectFieldQKeyMapScripts(html: string, excludeCoreFields: boolean) {
  return injectFieldQKeyMap(html, { excludeCoreFields });
}

function prepareRegistrationHtml(html: string) {
  const validationErrors = validateRegistrationHtml(html);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(" "));
  }

  return injectRegistrationBridge(
    injectFieldQKeyMapScripts(
      injectScript(
        injectScript(
          injectScript(
            injectScript(html, ANALYTICS_SCRIPT),
            FORM_DRAFT_SCRIPT,
          ),
          DEVICE_FINGERPRINT_SCRIPT,
        ),
        REFERRAL_ATTRIBUTION_SCRIPT,
      ),
      true,
    ),
  );
}

/** Runtime injection for published forms served via /register (idempotent). */
export function injectRegistrationBridge(html: string): string {
  const next = injectScript(html, REGISTRATION_BRIDGE_SCRIPT);
  return injectBridgeAttach(
    next,
    REGISTRATION_BRIDGE_ATTACH,
    "ConcaveRegistrationBridge.attach",
  );
}

function hasFieldName(html: string, name: string) {
  return new RegExp(`name=["']${name}["']`, "i").test(html);
}

function validateRegistrationHtml(html: string) {
  const errors: string[] = [];
  const requiredNames = ["name", "phone"];

  for (const name of requiredNames) {
    if (!hasFieldName(html, name)) {
      errors.push(`Missing required field: ${name}.`);
    }
  }

  if (!hasFieldName(html, "city") && !hasFieldName(html, "city_id")) {
    errors.push("Missing required field: city or city_id.");
  }

  const hasSingleDob = hasFieldName(html, "dob_date");
  const hasSplitDob =
    hasFieldName(html, "dob_month") &&
    hasFieldName(html, "dob_day") &&
    hasFieldName(html, "dob_year");

  if (!hasSingleDob && !hasSplitDob) {
    errors.push(
      "Missing date of birth field. Provide either dob_date, or dob_month + dob_day + dob_year.",
    );
  }

  if (!/function\s+showResult\s*\(/.test(html)) {
    errors.push("Missing required function: showResult(id).");
  }

  if (!/s-thankyou/.test(html)) {
    errors.push("Missing required thank-you screen id: s-thankyou.");
  }

  return errors;
}
