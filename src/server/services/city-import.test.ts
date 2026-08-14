import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCityDisplayName } from "@/lib/city-resolve";
import {
  cityImportLookupKeys,
  findExistingCityForImportRow,
} from "@/server/services/city-import.service";

test("import lookup matches lower(name)+state not only match_key", () => {
  const existing = {
    id: "city-dahod-rural",
    name: "Dahod (rural)",
    state: "Gujarat",
  };
  const byKey = new Map<string, typeof existing>();
  for (const key of cityImportLookupKeys(existing.name, existing.state)) {
    byKey.set(key, existing);
  }

  const importName = normalizeCityDisplayName("Dahod (Rural)");
  const found = findExistingCityForImportRow(byKey, importName, "Gujarat");
  assert.equal(found?.id, "city-dahod-rural");
});
