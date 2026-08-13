import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  coerceFormExportSchema,
  parseFormExportSchemaFromHtml,
} from "@/lib/form-export";
import type { FormExportSchema } from "@/lib/form-export/types";
import type { FormType } from "@/lib/forms/types";
import type { ActiveFormVersion } from "@/server/repositories/forms.repository";

type BundledFormConfig = {
  version: number;
  name: string;
  publicPath: string;
};

const BUNDLED_FORMS: Record<FormType, BundledFormConfig> = {
  registration: {
    version: 2,
    name: "Innerwear Screener V2",
    publicPath: "/forms/innerwear_screener_v2.html",
  },
  survey: {
    version: 1,
    name: "Lingerie Study",
    publicPath: "/form/lingerie_study.html",
  },
};

export function publicFormPathToFilePath(publicPath: string): string {
  const normalized = publicPath.replace(/^\/+/, "");
  return join(process.cwd(), "public", normalized);
}

export function readPublicFormHtml(publicPath: string): string | null {
  const filePath = publicFormPathToFilePath(publicPath);
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, "utf8");
}

function resolveSchema(
  formType: FormType,
  html: string,
  schemaFromDb: unknown,
): FormExportSchema {
  const parsedFromHtml = parseFormExportSchemaFromHtml(html, {
    excludeCoreFields: formType === "registration",
  });

  if (parsedFromHtml.fields.length > 0) {
    return parsedFromHtml;
  }

  const coerced = coerceFormExportSchema(schemaFromDb);
  if (coerced.fields.length > 0) {
    return coerced;
  }

  return parsedFromHtml;
}

export function loadBundledActiveForm(formType: FormType): ActiveFormVersion | null {
  const config = BUNDLED_FORMS[formType];
  const htmlContent = readPublicFormHtml(config.publicPath);
  if (!htmlContent) {
    return null;
  }

  return {
    formType,
    version: config.version,
    name: config.name,
    htmlFilePath: config.publicPath,
    htmlContent,
    uploadedFileName: null,
    schema: resolveSchema(formType, htmlContent, null),
  };
}

export function resolveActiveFormHtml(input: {
  formType: FormType;
  htmlContent: string | null;
  htmlFilePath: string | null;
  schemaFromDb: unknown;
  version: number;
  name: string | null;
  uploadedFileName: string | null;
}): ActiveFormVersion | null {
  let htmlContent = input.htmlContent;

  if (!htmlContent && input.htmlFilePath) {
    htmlContent = readPublicFormHtml(input.htmlFilePath);
  }

  if (!htmlContent) {
    return loadBundledActiveForm(input.formType);
  }

  return {
    formType: input.formType,
    version: input.version,
    name: input.name,
    htmlFilePath: input.htmlFilePath,
    htmlContent,
    uploadedFileName: input.uploadedFileName,
    schema: resolveSchema(input.formType, htmlContent, input.schemaFromDb),
  };
}
