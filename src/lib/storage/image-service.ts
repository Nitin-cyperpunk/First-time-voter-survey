/**
 * Survey image URL helpers (client-safe).
 * DB-backed lookups: see image-catalog.server.ts (also re-exported for server callers).
 */

export const STUDY_IMAGES_BUCKET = "study-images";

export const FALLBACK_SURVEY_IMAGE = "/images/no-image-available.svg";

export type StudyImageFolder =
  | "bras"
  | "products"
  | "logos"
  | "brands"
  | "questions"
  | "misc";

export type SurveyImageCatalog = {
  byName: Record<string, string>;
  byQuestion: Record<string, string[]>;
};

/** Lowercase snake_case filenames; rejects opaque camera dumps like IMG001.jpg. */
const VALID_FILENAME = /^[a-z][a-z0-9_]*\.(png|jpe?g|webp)$/;
const GENERIC_FILENAME = /^(img|image|photo|pic|picture)[0-9]*\./i;

/** Preferred convention: qN_… / brand_… / product_… with optional _vN. */
const CONVENTION_FILENAME =
  /^(?:q\d+_[a-z0-9_]+|brand_[a-z0-9_]+|product_[a-z0-9_]+)(_v\d+)?\.(png|jpe?g|webp)$/;

/** Exact filename → folder overrides (highest priority after explicit `folder`). */
const IMAGE_MANIFEST: Record<string, StudyImageFolder> = {};

const KEYWORD_FOLDER_RULES: ReadonlyArray<{
  pattern: RegExp;
  folder: StudyImageFolder;
}> = [
  { pattern: /logo/, folder: "logos" },
  { pattern: /bra/, folder: "bras" },
  { pattern: /brand/, folder: "brands" },
  { pattern: /product/, folder: "products" },
];

function normalizeFilename(filename: string): string {
  return filename.trim();
}

export function isValidSurveyImageFilename(filename: string): boolean {
  const normalized = normalizeFilename(filename);
  if (!VALID_FILENAME.test(normalized)) return false;
  if (GENERIC_FILENAME.test(normalized)) return false;
  return true;
}

/** Stricter check for new uploads (documented naming convention). */
export function followsImageNamingConvention(filename: string): boolean {
  const normalized = normalizeFilename(filename);
  if (!isValidSurveyImageFilename(normalized)) return false;
  return CONVENTION_FILENAME.test(normalized);
}

export function folderFor(
  filename: string,
  override?: StudyImageFolder,
): StudyImageFolder {
  const normalized = normalizeFilename(filename);

  if (override) {
    return override;
  }

  const manifestFolder = IMAGE_MANIFEST[normalized];
  if (manifestFolder) {
    return manifestFolder;
  }

  for (const rule of KEYWORD_FOLDER_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.folder;
    }
  }

  if (/^q[0-9]+_/.test(normalized)) {
    return "questions";
  }

  return "questions";
}

export function getImagePath(
  filename: string,
  folder?: StudyImageFolder,
): string | null {
  if (!isValidSurveyImageFilename(filename)) {
    return null;
  }

  const normalized = normalizeFilename(filename);
  return `${folderFor(normalized, folder)}/${normalized}`;
}

export function getStudyImagesPublicBaseUrl(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return null;
  }

  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${STUDY_IMAGES_BUCKET}`;
}

/** Expand a DB image_url (full URL or bucket-relative path) to a browser URL. */
export function resolveStoredImageUrl(imageUrl: string): string {
  const raw = imageUrl.trim();
  if (!raw) return FALLBACK_SURVEY_IMAGE;

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const baseUrl = getStudyImagesPublicBaseUrl();
  if (!baseUrl) {
    return FALLBACK_SURVEY_IMAGE;
  }

  return `${baseUrl}/${raw.replace(/^\//, "")}`;
}

export function getSurveyImage(
  filename: string,
  folder?: StudyImageFolder,
): string {
  const path = getImagePath(filename, folder);
  if (!path) {
    return FALLBACK_SURVEY_IMAGE;
  }

  const baseUrl = getStudyImagesPublicBaseUrl();
  if (!baseUrl) {
    return FALLBACK_SURVEY_IMAGE;
  }

  return `${baseUrl}/${path}`;
}
