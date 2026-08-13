import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { STUDY_IMAGES_BUCKET } from "@/lib/storage/image-service";
import type { Database } from "@/lib/supabase/types";

export type SurveyImageRow =
  Database["public"]["Tables"]["survey_images"]["Row"];

export type SurveyImageInsert =
  Database["public"]["Tables"]["survey_images"]["Insert"];

export async function findSurveyImageByName(
  imageName: string,
): Promise<SurveyImageRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("survey_images")
    .select("*")
    .eq("image_name", imageName.trim())
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listSurveyImagesByQuestion(
  questionKey: string,
): Promise<SurveyImageRow[]> {
  const key = questionKey.trim().toUpperCase();
  const { data, error } = await getSupabaseAdmin()
    .from("survey_images")
    .select("*")
    .eq("question_key", key)
    .eq("is_active", true)
    .order("image_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listActiveSurveyImagesByCategory(
  category: string,
): Promise<SurveyImageRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("survey_images")
    .select("*")
    .eq("category", category.trim())
    .eq("is_active", true)
    .order("image_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listAllActiveSurveyImages(): Promise<SurveyImageRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("survey_images")
    .select("*")
    .eq("is_active", true)
    .order("image_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function upsertSurveyImageMetadata(
  input: SurveyImageInsert,
): Promise<SurveyImageRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("survey_images")
    .upsert(
      {
        ...input,
        image_name: input.image_name.trim(),
        image_url: input.image_url.trim(),
        category: (input.category ?? "misc").trim() || "misc",
        question_key: input.question_key?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "image_name" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i;

async function listAllBucketObjectPaths(
  prefix = "",
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const paths: string[] = [];
  const pageSize = 100;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(STUDY_IMAGES_BUCKET)
      .list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) throw error;
    if (!data?.length) break;

    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (!IMAGE_EXT.test(entry.name)) {
        // No image extension → treat as folder and recurse
        const nested = await listAllBucketObjectPaths(fullPath);
        paths.push(...nested);
        continue;
      }

      paths.push(fullPath);
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return paths;
}

/**
 * Lists every image in the study-images bucket and upserts:
 * - image_name = original file name (basename, unchanged)
 * - image_url  = public Storage URL from getPublicUrl()
 */
export async function syncSurveyImagesFromStorageBucket(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const objectPaths = await listAllBucketObjectPaths();
  let synced = 0;

  for (const objectPath of objectPaths) {
    const originalName = objectPath.split("/").pop()?.trim();
    if (!originalName) continue;

    const { data: publicData } = supabase.storage
      .from(STUDY_IMAGES_BUCKET)
      .getPublicUrl(objectPath);

    const publicUrl = publicData?.publicUrl?.trim();
    if (!publicUrl) continue;

    const category =
      objectPath.includes("/") ? objectPath.split("/")[0]! : "misc";

    await upsertSurveyImageMetadata({
      image_name: originalName,
      image_url: publicUrl,
      category,
      question_key: null,
      description: null,
      is_active: true,
    });
    synced += 1;
  }

  return synced;
}
