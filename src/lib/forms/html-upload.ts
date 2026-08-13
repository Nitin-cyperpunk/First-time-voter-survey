/**
 * FTV registration HTML contract (anonymous First-Time Voters / Concave Insights).
 *
 * This study is NOT Enamor. Do not require lingerie-era PII or wizard APIs.
 *
 * REQUIRED (capacity + live submit path):
 *   - name="city_id"     FK to public.cities. Capacity (global 200 + per-city) cannot
 *                        be enforced without it. Free-text `city` / `#fCity` is a
 *                        separate locality string and does not satisfy this.
 *                        Detected via per-tag attribute parse (select/input/any), not
 *                        attribute-order regex.
 *   - showResult(id)     Real screen navigation. ConcaveRegistrationBridge.attach wraps
 *                        it to POST /api/register. Accepts `function showResult(`,
 *                        `const/let/var showResult = function`, `showResult = function`,
 *                        and `showResult: function` object methods. Calls like
 *                        showResult("s-thankyou") do not count.
 *   - id="s-thankyou"    Qualified-completion screen. Detected via per-tag id attribute
 *                        regardless of class/quote/attribute order.
 *
 * OPTIONAL / NOT REQUIRED:
 *   - age_band           Age lives on profile (age_band and/or dob + derived ages).
 *                        Export already maps age_band, dob, age_today, age_at_poll,
 *                        age_at_qualifying_date.
 *   - name, phone, DOB   Anonymous study. Referral attribution is referral code → lead_id.
 *   - s-terminate        Not required. Bridge treats any id containing "terminate" as a
 *                        screen-out. Same id parser; include id="s-terminate" for Q1/Q2.
 *   - showScreen(0)      Enamor wizard boot. FTV uses go(0). Bridge attach accepts either
 *                        plus a closing </script></body>.
 *
 * cities.area_type (urban|rural) ≠ Q15_2 (5-point self-reported area). Never merge.
 */

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

export type ContractCheck = {
  key: string;
  kind: "field" | "function" | "screen-id" | "legacy";
  required: boolean;
  found: boolean;
  note: string;
};

export type UploadDiagnostics = {
  fileName?: string;
  bytes: number;
  encoding: string;
  checks: ContractCheck[];
  hint?: string;
};

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

export function decodeUploadedHtmlBytes(buf: Uint8Array): {
  html: string;
  encoding: string;
} {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return {
      html: Buffer.from(buf.subarray(2)).toString("utf16le"),
      encoding: "utf16le-bom",
    };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const a = swapped[i]!;
      swapped[i] = swapped[i + 1]!;
      swapped[i + 1] = a;
    }
    return { html: swapped.toString("utf16le"), encoding: "utf16be-bom" };
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    return {
      html: Buffer.from(buf.subarray(3)).toString("utf8"),
      encoding: "utf8-bom",
    };
  }
  if (looksLikeUtf16LeHtml(buf)) {
    return {
      html: Buffer.from(buf).toString("utf16le"),
      encoding: "utf16le",
    };
  }
  return { html: Buffer.from(buf).toString("utf8"), encoding: "utf8" };
}

function looksLikeUtf16LeHtml(buf: Uint8Array): boolean {
  if (buf.length < 8) return false;
  let nulOnOdd = 0;
  const sample = Math.min(buf.length, 200);
  for (let i = 1; i < sample; i += 2) {
    if (buf[i] === 0) nulOnOdd += 1;
  }
  const ascii = String.fromCharCode(buf[0] ?? 0, buf[2] ?? 0, buf[4] ?? 0);
  return nulOnOdd >= sample / 6 && /<!d|htm|<ht/i.test(ascii);
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

  if (/go\s*\(\s*0\s*\)\s*;?/.test(html)) {
    return html.replace(/go\s*\(\s*0\s*\)\s*;?/, `go(0);\n${attachSnippet}`);
  }

  if (/<\/script>\s*<\/body>/i.test(html)) {
    return html.replace(
      /<\/script>\s*<\/body>/i,
      `${attachSnippet}\n</script>\n</body>`,
    );
  }

  throw new Error(
    "HTML must call go(0) or showScreen(0), or expose a final </script></body> where the registration bridge can attach.",
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

type HtmlTag = {
  name: string;
  attrs: Record<string, string>;
};

function parseAttrMap(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re =
    /([:@A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

/** Per-tag attribute parse — class before id, either quote style, any element. */
export function parseHtmlTags(html: string): HtmlTag[] {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const tags: HtmlTag[] = [];
  const re = /<([A-Za-z][\w:-]*)\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutComments))) {
    tags.push({
      name: match[1]!.toLowerCase(),
      attrs: parseAttrMap(match[2] ?? ""),
    });
  }
  return tags;
}

export function hasFieldName(html: string, name: string): boolean {
  const target = name.toLowerCase();
  return parseHtmlTags(html).some((tag) => tag.attrs.name?.toLowerCase() === target);
}

export function hasElementId(html: string, id: string): boolean {
  const target = id.toLowerCase();
  return parseHtmlTags(html).some((tag) => tag.attrs.id?.toLowerCase() === target);
}

export function hasShowResultFunction(html: string): boolean {
  return (
    /function\s+showResult\s*\(/.test(html) ||
    /(?:var|let|const)\s+showResult\s*=\s*(?:async\s*)?function\s*\(/.test(
      html,
    ) ||
    /showResult\s*=\s*(?:async\s*)?function\s*\(/.test(html) ||
    /showResult\s*:\s*(?:async\s*)?function\s*\(/.test(html)
  );
}

export function inspectRegistrationContract(html: string): ContractCheck[] {
  return [
    {
      key: "city_id",
      kind: "field",
      required: true,
      found: hasFieldName(html, "city_id"),
      note: "name= city_id on any control (select/input/hidden). Capacity FK.",
    },
    {
      key: "showResult",
      kind: "function",
      required: true,
      found: hasShowResultFunction(html),
      note: "function showResult(id) or assignment/method equivalent. Bridge wrap target.",
    },
    {
      key: "s-thankyou",
      kind: "screen-id",
      required: true,
      found: hasElementId(html, "s-thankyou"),
      note: "id=s-thankyou on any element, any attribute order.",
    },
    {
      key: "s-terminate",
      kind: "screen-id",
      required: false,
      found: hasElementId(html, "s-terminate"),
      note: "Optional screen-out id. Bridge matches ids containing terminate.",
    },
    {
      key: "age_band",
      kind: "field",
      required: false,
      found: hasFieldName(html, "age_band"),
      note: "Optional. Age may live on profile.age_band or dob-derived fields.",
    },
    {
      key: "name",
      kind: "legacy",
      required: false,
      found:
        hasFieldName(html, "name") ||
        hasFieldName(html, "full_name") ||
        hasFieldName(html, "fullName"),
      note: "Lingerie/Enamor PII — not required.",
    },
    {
      key: "phone",
      kind: "legacy",
      required: false,
      found:
        hasFieldName(html, "phone") ||
        hasFieldName(html, "mobile") ||
        hasFieldName(html, "fullPhone"),
      note: "Lingerie/Enamor PII — not required.",
    },
    {
      key: "dob",
      kind: "legacy",
      required: false,
      found:
        hasFieldName(html, "dob") ||
        hasFieldName(html, "dob_date") ||
        /id=["']dDOB["']/i.test(html),
      note: "Lingerie/Enamor PII — not required.",
    },
    {
      key: "showScreen",
      kind: "legacy",
      required: false,
      found: /function\s+showScreen\s*\(/.test(html),
      note: "Enamor wizard boot — not required. FTV uses go(0).",
    },
  ];
}

/** Standalone FTV original (surveyc / Downloads): free-text city, innerHTML end screens. */
export function looksLikeStandaloneFtvOriginal(html: string): boolean {
  return (
    /id=["']fCity["']/i.test(html) &&
    !hasFieldName(html, "city_id") &&
    !hasShowResultFunction(html) &&
    !hasElementId(html, "s-thankyou") &&
    /function\s+finish\s*\(/.test(html) &&
    /shell\.innerHTML\s*=/.test(html)
  );
}

export function buildUploadDiagnostics(input: {
  html: string;
  bytes: number;
  encoding: string;
  fileName?: string;
}): UploadDiagnostics {
  const checks = inspectRegistrationContract(input.html);
  const missingRequired = checks.filter((c) => c.required && !c.found);
  const fileName = input.fileName ?? "file";
  const missingKeys = missingRequired.map((c) => c.key).join(", ");
  const standalone = looksLikeStandaloneFtvOriginal(input.html);

  let hint: string | undefined;
  if (missingRequired.length > 0 && standalone) {
    hint = `Upload "${fileName}" (${input.bytes} bytes, ${input.encoding}) is the standalone FTV original (first_time_voters_surveyc.html / Downloads): free-text city and innerHTML thank-you. It is missing ${missingKeys}. Upload public\\form\\first_time_voters_survey.html instead — not surveyc.`;
  } else if (missingRequired.length > 0) {
    hint = `Upload "${fileName}" (${input.bytes} bytes, ${input.encoding}) is missing: ${missingKeys}. Choose Referral-Tracking-System\\public\\form\\first_time_voters_survey.html — not first_time_voters_surveyc.html or Downloads.`;
  }

  return {
    fileName: input.fileName,
    bytes: input.bytes,
    encoding: input.encoding,
    checks,
    hint,
  };
}

export function validateRegistrationHtml(html: string) {
  return inspectRegistrationContract(html)
    .filter((check) => check.required && !check.found)
    .map((check) => {
      if (check.kind === "field") return `Missing required field: ${check.key}.`;
      if (check.kind === "function") {
        return `Missing required function: ${check.key}(id).`;
      }
      return `Missing required thank-you screen id: ${check.key}.`;
    });
}
