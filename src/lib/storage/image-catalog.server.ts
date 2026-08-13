import {
  FALLBACK_SURVEY_IMAGE,
  getSurveyImage,
  resolveStoredImageUrl,
  type SurveyImageCatalog,
} from "@/lib/storage/image-service";
import {
  findSurveyImageByName,
  listActiveSurveyImagesByCategory,
  listAllActiveSurveyImages,
  listSurveyImagesByQuestion,
  syncSurveyImagesFromStorageBucket,
  type SurveyImageRow,
} from "@/server/repositories/survey-images.repository";

function mapRowUrl(row: SurveyImageRow): string {
  return resolveStoredImageUrl(row.image_url);
}

/** Returns the public URL for an active image by exact filename. */
export async function getImageByName(name: string): Promise<string> {
  const normalized = name.trim();
  if (!normalized) return FALLBACK_SURVEY_IMAGE;

  try {
    const row = await findSurveyImageByName(normalized);
    if (row) return mapRowUrl(row);
  } catch (error) {
    console.warn("[image-service] getImageByName failed:", error);
  }

  return getSurveyImage(normalized);
}

/** Active images for a question key (e.g. Q37). */
export async function getImagesByQuestion(
  questionKey: string,
): Promise<Array<{ name: string; url: string; description: string | null }>> {
  try {
    const rows = await listSurveyImagesByQuestion(questionKey);
    return rows.map((row) => ({
      name: row.image_name,
      url: mapRowUrl(row),
      description: row.description,
    }));
  } catch (error) {
    console.warn("[image-service] getImagesByQuestion failed:", error);
    return [];
  }
}

/** Active images in a category folder. */
export async function getActiveImagesByCategory(
  category: string,
): Promise<Array<{ name: string; url: string; questionKey: string | null }>> {
  try {
    const rows = await listActiveSurveyImagesByCategory(category);
    return rows.map((row) => ({
      name: row.image_name,
      url: mapRowUrl(row),
      questionKey: row.question_key,
    }));
  } catch (error) {
    console.warn("[image-service] getActiveImagesByCategory failed:", error);
    return [];
  }
}

/** Full active catalog for survey HTML injection. */
export async function buildSurveyImageCatalog(): Promise<SurveyImageCatalog> {
  const byName: Record<string, string> = {};
  const byQuestion: Record<string, string[]> = {};

  try {
    const rows = await listAllActiveSurveyImages();
    for (const row of rows) {
      const url = mapRowUrl(row);
      byName[row.image_name] = url;
      if (row.question_key) {
        const key = row.question_key.toUpperCase();
        if (!byQuestion[key]) byQuestion[key] = [];
        byQuestion[key].push(url);
      }
    }
  } catch (error) {
    console.warn("[image-service] buildSurveyImageCatalog failed:", error);
  }

  return { byName, byQuestion };
}

/** Re-sync metadata rows from whatever files currently exist in study-images. */
export async function syncSurveyImagesFromStorage(): Promise<number> {
  return syncSurveyImagesFromStorageBucket();
}

// Convenience re-exports so server code can import catalog + URL helpers together.
export {
  FALLBACK_SURVEY_IMAGE,
  STUDY_IMAGES_BUCKET,
  followsImageNamingConvention,
  folderFor,
  getImagePath,
  getStudyImagesPublicBaseUrl,
  getSurveyImage,
  isValidSurveyImageFilename,
  resolveStoredImageUrl,
} from "@/lib/storage/image-service";
