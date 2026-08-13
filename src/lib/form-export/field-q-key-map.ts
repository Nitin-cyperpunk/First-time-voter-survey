import { REGISTRATION_CORE_FIELDS } from "@/lib/form-export/types";

import type { FormExportSchema } from "@/lib/form-export/types";

import {

  buildFieldOrderFromHtml,

  extractMatrixRows,

  extractOpenMultiBoxes,

  extractOtherSpecifyField,

  extractPrimaryFieldName,

  isConcreteFieldName,

  splitQuestionBlocks,

  stripHtmlScriptTags,

} from "@/lib/form-export/html-utils";

import { isQKey } from "@/lib/response-storage";



const INPUT_TAG_REGEX = /<(?:input|select|textarea)\b[^>]*>/gi;



function parseInputTag(tag: string): { name: string | null; dataQ: string | null } {

  const nameMatch = tag.match(/\bname="([^"]+)"/i);

  const dataQMatch = tag.match(/\bdata-q="([^"]+)"/i);

  return {

    name: nameMatch?.[1]?.trim() ?? null,

    dataQ: dataQMatch?.[1]?.trim() ?? null,

  };

}



function extractExplicitDataQByField(

  html: string,

  options?: { excludeCoreFields?: boolean },

): Map<string, string> {

  const excludeCore = options?.excludeCoreFields ?? true;

  const explicit = new Map<string, string>();



  let match: RegExpExecArray | null;

  while ((match = INPUT_TAG_REGEX.exec(html))) {

    const { name, dataQ } = parseInputTag(match[0]);

    if (!name || !dataQ || !isQKey(dataQ) || !isConcreteFieldName(name)) continue;

    if (

      excludeCore &&

      (REGISTRATION_CORE_FIELDS.has(name) || name.startsWith("dob_"))

    ) {

      continue;

    }

    explicit.set(name, dataQ);

  }



  return explicit;

}



function isExcludedField(

  name: string,

  options?: { excludeCoreFields?: boolean },

): boolean {

  const excludeCore = options?.excludeCoreFields ?? true;

  return (

    excludeCore &&

    (REGISTRATION_CORE_FIELDS.has(name) || name.startsWith("dob_"))

  );

}



function nextAvailableQKey(used: Set<string>, start: number): string {

  let index = start;

  while (used.has(`Q${index}`)) {

    index += 1;

  }

  const qKey = `Q${index}`;

  used.add(qKey);

  return qKey;

}



function assignFieldKey(

  map: Map<string, string>,

  used: Set<string>,

  explicit: Map<string, string>,

  fieldName: string,

  preferredQKey?: string,

  auxiliaryStart?: number,

): void {

  if (map.has(fieldName)) {

    return;

  }



  const explicitQ = explicit.get(fieldName);

  if (explicitQ) {

    map.set(fieldName, explicitQ);

    used.add(explicitQ);

    return;

  }



  if (preferredQKey) {

    map.set(fieldName, preferredQKey);

    used.add(preferredQKey);

    return;

  }



  map.set(fieldName, nextAvailableQKey(used, auxiliaryStart ?? used.size + 1));

}



function collectBlockFieldNames(block: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const regex =
    /<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(block))) {
    const name = match[1]?.trim();
    if (!name || seen.has(name)) continue;
    if (!isConcreteFieldName(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}



/**

 * Authoritative field-name → Q-key map parsed from HTML question blocks.

 * Question numbers are assigned per `.q` block, not per input field.

 */

export function buildFieldNameToQKeyMap(

  html: string,

  options?: { excludeCoreFields?: boolean },

): Map<string, string> {

  const markup = stripHtmlScriptTags(html);

  const explicit = extractExplicitDataQByField(markup, options);

  const map = new Map<string, string>();

  const usedQKeys = new Set<string>();

  const blocks = splitQuestionBlocks(markup);



  if (blocks.length > 0) {

    let questionIndex = 0;



    for (const block of blocks) {

      questionIndex += 1;

      const questionQ = nextAvailableQKey(usedQKeys, questionIndex);

      const primaryField = extractPrimaryFieldName(block);

      const otherSpecify = extractOtherSpecifyField(block);

      const openMultiBoxes = extractOpenMultiBoxes(block);

      const matrixRows = extractMatrixRows(block);

      const blockFieldNames = collectBlockFieldNames(block).filter(

        (name) => !isExcludedField(name, options),

      );

      const auxiliaryFields = new Set<string>();



      if (primaryField && !isExcludedField(primaryField, options)) {

        assignFieldKey(map, usedQKeys, explicit, primaryField, questionQ);

      }



      if (otherSpecify && !isExcludedField(otherSpecify, options)) {

        auxiliaryFields.add(otherSpecify);

      }



      for (const box of openMultiBoxes) {

        if (!isExcludedField(box.fieldName, options)) {

          auxiliaryFields.add(box.fieldName);

        }

      }



      for (const row of matrixRows) {

        if (!isExcludedField(row.fieldName, options)) {

          auxiliaryFields.add(row.fieldName);

        }

      }



      for (const fieldName of blockFieldNames) {

        if (fieldName === primaryField) continue;

        auxiliaryFields.add(fieldName);

      }



      for (const fieldName of auxiliaryFields) {

        if (fieldName === primaryField) continue;

        assignFieldKey(

          map,

          usedQKeys,

          explicit,

          fieldName,

          explicit.get(fieldName),

          usedQKeys.size + 1,

        );

      }

    }



    return map;

  }



  const order = buildFieldOrderFromHtml(markup, options);
  let nextIndex = 1;
  for (const name of order) {
    const explicitQ = explicit.get(name);
    if (explicitQ) {
      map.set(name, explicitQ);
      usedQKeys.add(explicitQ);
      continue;
    }

    while (usedQKeys.has(`Q${nextIndex}`)) {
      nextIndex += 1;
    }
    const qKey = `Q${nextIndex}`;
    map.set(name, qKey);
    usedQKeys.add(qKey);
    nextIndex += 1;
  }

  return map;
}



export function buildFieldNameToQKeyMapFromSchema(

  schema: FormExportSchema,

): Map<string, string> {

  const map = new Map<string, string>();



  for (const field of schema.fields) {

    if (field.fieldName && field.qKey) {

      map.set(field.fieldName, field.qKey);

    }

    if (field.otherSpecifyField && field.otherKey) {

      map.set(field.otherSpecifyField, field.otherKey);

    }

    if (field.rows) {

      for (const row of field.rows) {

        if (row.fieldName && row.qKey) {

          map.set(row.fieldName, row.qKey);

        }

      }

    }

    if (field.boxes) {

      for (const box of field.boxes) {

        if (box.fieldName && box.qKey) {

          map.set(box.fieldName, box.qKey);

        }

      }

    }

  }



  return map;

}



export function fieldNameToQKeyMapToRecord(

  map: Map<string, string>,

): Record<string, string> {

  return Object.fromEntries(map);

}



export function buildFieldNameToQKeyRecordFromHtml(

  html: string,

  options?: { excludeCoreFields?: boolean },

): Record<string, string> {

  return fieldNameToQKeyMapToRecord(buildFieldNameToQKeyMap(html, options));

}


