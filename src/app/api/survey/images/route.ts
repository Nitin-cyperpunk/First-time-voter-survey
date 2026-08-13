import { NextResponse } from "next/server";

import {
  getActiveImagesByCategory,
  getImageByName,
  getImagesByQuestion,
} from "@/lib/storage/image-catalog.server";

export const dynamic = "force-dynamic";

/**
 * Public survey image catalog lookups.
 * Prefer serve-time injection; this endpoint supports dynamic question fetches.
 *
 * GET /api/survey/images?name=q37_everyday_bra_front_v1.webp
 * GET /api/survey/images?questionKey=Q37
 * GET /api/survey/images?category=bras
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();
  const questionKey = searchParams.get("questionKey")?.trim();
  const category = searchParams.get("category")?.trim();

  try {
    if (name) {
      const url = await getImageByName(name);
      return NextResponse.json({ name, url });
    }

    if (questionKey) {
      const images = await getImagesByQuestion(questionKey);
      return NextResponse.json({ questionKey: questionKey.toUpperCase(), images });
    }

    if (category) {
      const images = await getActiveImagesByCategory(category);
      return NextResponse.json({ category: category.toLowerCase(), images });
    }

    return NextResponse.json(
      {
        error:
          "Provide one of: name, questionKey, or category query parameters.",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("GET /api/survey/images failed:", error);
    return NextResponse.json(
      { error: "Failed to load survey images." },
      { status: 500 },
    );
  }
}
