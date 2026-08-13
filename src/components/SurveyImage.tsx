"use client";

import { useState } from "react";

import {
  FALLBACK_SURVEY_IMAGE,
  getSurveyImage,
  type StudyImageFolder,
} from "@/lib/storage/image-service";
import { cn } from "@/lib/utils";

type SurveyImageProps = {
  filename: string;
  alt: string;
  folder?: StudyImageFolder;
  className?: string;
};

export function SurveyImage({
  filename,
  alt,
  folder,
  className,
}: SurveyImageProps) {
  const [src, setSrc] = useState(() => getSurveyImage(filename, folder));

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("h-auto max-w-full", className)}
      onError={() => {
        setSrc((current) =>
          current === FALLBACK_SURVEY_IMAGE ? current : FALLBACK_SURVEY_IMAGE,
        );
      }}
    />
  );
}
