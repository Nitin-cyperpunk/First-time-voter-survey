import { getSupabaseAdmin } from "@/lib/supabase/admin";

import {
  STUDY_IMAGES_BUCKET,
  folderFor,
  getImagePath,
  getSurveyImage,
  isValidSurveyImageFilename,
  type StudyImageFolder,
} from "@/lib/storage/image-service";
import { upsertSurveyImageMetadata } from "@/server/repositories/survey-images.repository";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CACHE_CONTROL = "31536000";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type UploadSurveyImageInput = {
  filename: string;
  data: Buffer | Uint8Array | ArrayBuffer;
  contentType: string;
  folder?: StudyImageFolder;
  questionKey?: string | null;
  description?: string | null;
  upsert?: boolean;
};

export type UploadSurveyImageResult = {
  path: string;
  publicUrl: string;
};

function normalizeContentType(contentType: string): string {
  const normalized = contentType.trim().toLowerCase();
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }
  return normalized;
}

function toBody(data: Buffer | Uint8Array | ArrayBuffer): Buffer | Uint8Array {
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
    return data;
  }
  return Buffer.from(data);
}

function inferQuestionKey(
  filename: string,
  explicit?: string | null,
): string | null {
  if (explicit?.trim()) return explicit.trim().toUpperCase();
  const match = filename.match(/^q(\d+)_/i);
  return match ? `Q${match[1]}` : null;
}

export async function uploadSurveyImage(
  input: UploadSurveyImageInput,
): Promise<UploadSurveyImageResult> {
  const filename = input.filename.trim();
  const contentType = normalizeContentType(input.contentType);

  if (!isValidSurveyImageFilename(filename)) {
    throw new Error(
      "Invalid filename. Use lowercase snake_case (e.g. q37_everyday_bra_front_v1.webp). Generic names like IMG001.jpg are not allowed.",
    );
  }

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("Only PNG, JPG/JPEG, and WEBP images are allowed.");
  }

  const body = toBody(input.data);
  const byteLength =
    body instanceof Buffer ? body.byteLength : body.byteLength;

  if (byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the 5MB size limit.");
  }

  const category = folderFor(filename, input.folder);
  const path =
    getImagePath(filename, input.folder) ?? `${category}/${filename}`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(STUDY_IMAGES_BUCKET).upload(
    path,
    body,
    {
      contentType,
      cacheControl: CACHE_CONTROL,
      upsert: input.upsert ?? true,
    },
  );

  if (error) {
    throw new Error(`Failed to upload survey image: ${error.message}`);
  }

  const publicUrl = getSurveyImage(filename, input.folder);

  try {
    await upsertSurveyImageMetadata({
      image_name: filename,
      image_url: path,
      category,
      question_key: inferQuestionKey(filename, input.questionKey),
      description: input.description ?? null,
      is_active: true,
    });
  } catch (metaError) {
    console.warn(
      "[uploadSurveyImage] Storage upload succeeded but survey_images upsert failed:",
      metaError,
    );
  }

  return {
    path,
    publicUrl,
  };
}
