import assert from "node:assert/strict";
import { test } from "node:test";

import { hidePayoutCommentVml, insertDataValidationsXml } from "@/lib/export";

test("dataValidations are inserted after sheetData, before legacyDrawing", () => {
  const sheetXml = [
    '<?xml version="1.0"?>',
    "<worksheet>",
    "<sheetData><row/></sheetData>",
    '<ignoredErrors><ignoredError numberStoredAsText="1" sqref="A1:J3"/></ignoredErrors>',
    '<legacyDrawing r:id="rId1"/>',
    "</worksheet>",
  ].join("");

  const result = insertDataValidationsXml(
    sheetXml,
    '<dataValidations count="1"/>',
  );

  const sheetDataAt = result.indexOf("</sheetData>");
  const validationsAt = result.indexOf("<dataValidations");
  const ignoredAt = result.indexOf("<ignoredErrors");
  const drawingAt = result.indexOf("<legacyDrawing");

  assert.ok(validationsAt > sheetDataAt);
  assert.ok(validationsAt < ignoredAt);
  assert.ok(validationsAt < drawingAt);
  assert.equal(result.includes("</worksheet><dataValidations"), false);
});

test("comment VML always-visible flag is removed and boxes are hidden", () => {
  const vml = [
    '<v:shape id="_x0000_s1025" type="#_x0000_t202" style="position:absolute;width:104pt;height:64pt;z-index:10">',
    '<div style="text-align:left"></div>',
    "<x:ClientData ObjectType=\"Note\"><x:Visible/></x:ClientData>",
    "</v:shape>",
  ].join("");

  const hidden = hidePayoutCommentVml(vml);
  assert.equal(hidden.includes("<x:Visible/>"), false);
  assert.equal(hidden.includes("visibility:hidden"), true);
  assert.equal(hidden.includes("width:140pt"), true);
  assert.equal(hidden.includes("height:52pt"), true);
  assert.equal(hidden.includes('div style="text-align:left"'), true);
});
