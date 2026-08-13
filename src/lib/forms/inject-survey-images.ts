import {
  FALLBACK_SURVEY_IMAGE,
  getStudyImagesPublicBaseUrl,
} from "@/lib/storage/image-service";
import { buildSurveyImageCatalog } from "@/lib/storage/image-catalog.server";

const SURVEY_IMAGES_SCRIPT =
  '<script src="/forms/survey-images.js"></script>';

function injectBeforeHeadClose(html: string, snippet: string): string {
  if (!/<\/head>/i.test(html)) {
    return html;
  }
  if (html.includes(snippet)) {
    return html;
  }
  return html.replace(/<\/head>/i, `  ${snippet}\n</head>`);
}

function injectConfigScript(
  html: string,
  catalog: { byName: Record<string, string>; byQuestion: Record<string, string[]> },
): string {
  if (html.includes("window.__concaveSurveyImageMap")) {
    return html;
  }

  const baseUrl = getStudyImagesPublicBaseUrl();
  const payload = {
    baseUrl,
    fallback: FALLBACK_SURVEY_IMAGE,
    byName: catalog.byName,
    byQuestion: catalog.byQuestion,
  };

  const config = `<script>window.__concaveStudyImagesPublicBaseUrl=${JSON.stringify(baseUrl)};window.__concaveSurveyImageFallback=${JSON.stringify(FALLBACK_SURVEY_IMAGE)};window.__concaveSurveyImageMap=${JSON.stringify(payload.byName).replace(/</g, "\\u003c")};window.__concaveSurveyImagesByQuestion=${JSON.stringify(payload.byQuestion).replace(/</g, "\\u003c")};</script>`;

  return injectBeforeHeadClose(html, config);
}

/** Sync inject for upload prep (base URL + script only; catalog filled at serve time). */
export function injectSurveyImagesScript(html: string): string {
  let next = html;

  const baseUrl = getStudyImagesPublicBaseUrl();
  if (baseUrl && !next.includes("window.__concaveStudyImagesPublicBaseUrl")) {
    const config = `<script>window.__concaveStudyImagesPublicBaseUrl=${JSON.stringify(baseUrl)};window.__concaveSurveyImageFallback=${JSON.stringify(FALLBACK_SURVEY_IMAGE)};window.__concaveSurveyImageMap=window.__concaveSurveyImageMap||{};window.__concaveSurveyImagesByQuestion=window.__concaveSurveyImagesByQuestion||{};</script>`;
    next = injectBeforeHeadClose(next, config);
  }

  return injectBeforeHeadClose(next, SURVEY_IMAGES_SCRIPT);
}

/** Serve-time inject: DB catalog is the source of truth for image URLs. */
export async function injectSurveyImagesScriptWithCatalog(
  html: string,
): Promise<string> {
  const catalog = await buildSurveyImageCatalog();
  const next = injectConfigScript(html, catalog);
  return injectBeforeHeadClose(next, SURVEY_IMAGES_SCRIPT);
}
