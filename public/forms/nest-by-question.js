(function () {
  "use strict";

  var DEFAULT_OTHER_OPTION = "Other";

  function canonicalQKey(key) {
    var match = String(key).match(/^q(\d+)$/i);
    return match ? "q" + match[1] : String(key).toLowerCase();
  }

  function stringifyScalar(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return "";
    if (typeof value === "object") return "";
    return String(value).trim();
  }

  function parseMultiSelectValues(value) {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) {
      return value
        .map(String)
        .map(function (part) {
          return part.trim();
        })
        .filter(Boolean);
    }
    var raw = String(value).trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
  }

  function readAnswerValue(answers, qKey, fieldName) {
    if (qKey) {
      for (var key in answers) {
        if (!Object.prototype.hasOwnProperty.call(answers, key)) continue;
        if (canonicalQKey(key) === canonicalQKey(qKey)) {
          return answers[key];
        }
      }
    }
    if (fieldName && answers[fieldName] !== undefined) {
      return answers[fieldName];
    }
    return undefined;
  }

  function resolveOtherOption(field) {
    return String(field.otherOption || field.otherValue || DEFAULT_OTHER_OPTION).trim();
  }

  function readOtherText(answers, field, otherKey) {
    if (otherKey) {
      return stringifyScalar(readAnswerValue(answers, otherKey));
    }
    if (field.otherSpecifyField) {
      return stringifyScalar(
        readAnswerValue(answers, undefined, field.otherSpecifyField),
      );
    }
    return "";
  }

  function formatOthersLabel(text) {
    return "Others - " + String(text).trim();
  }

  function mergeOtherIntoMultiSelect(selected, otherOption, otherText) {
    var trimmedOther = String(otherText || "").trim();
    var merged = [];
    var replaced = false;

    for (var index = 0; index < selected.length; index += 1) {
      var value = selected[index];
      if (value.trim().toLowerCase() === otherOption.toLowerCase()) {
        if (trimmedOther) {
          merged.push(formatOthersLabel(trimmedOther));
          replaced = true;
        } else {
          merged.push(value);
        }
        continue;
      }
      merged.push(value);
    }

    if (!replaced && trimmedOther) {
      merged.push(formatOthersLabel(trimmedOther));
    }

    return merged;
  }

  function markOtherKeyAbsorbed(field, absorbed) {
    if (field.otherKey) {
      absorbed[canonicalQKey(field.otherKey)] = true;
    }
  }

  function markOpenMultiKeysAbsorbed(field, absorbed) {
    var parent = canonicalQKey(field.qKey);
    var boxes = field.boxes || [];
    for (var index = 0; index < boxes.length; index += 1) {
      var box = boxes[index];
      var boxKey = box.qKey || field.qKey;
      if (canonicalQKey(boxKey) !== parent) {
        absorbed[canonicalQKey(boxKey)] = true;
      }
    }
  }

  function markMatrixKeysAbsorbed(field, absorbed) {
    var parent = canonicalQKey(field.qKey);
    var rows = field.rows || [];
    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index];
      var rowKey = row.qKey || field.qKey;
      if (canonicalQKey(rowKey) !== parent) {
        absorbed[canonicalQKey(rowKey)] = true;
      }
    }
  }

  function nestMultipleSelect(nested, field, absorbed) {
    var parentKey = field.qKey;
    var otherKey = field.otherKey;
    var otherOption = resolveOtherOption(field);
    var parentValue = readAnswerValue(nested, parentKey, field.fieldName);
    var otherText = readOtherText(nested, field, otherKey);
    var selected = parseMultiSelectValues(parentValue);
    var merged =
      otherKey || field.otherSpecifyField
        ? mergeOtherIntoMultiSelect(selected, otherOption, otherText)
        : selected;

    if (merged.length > 0) {
      nested[parentKey] = merged;
    } else {
      delete nested[parentKey];
    }

    markOtherKeyAbsorbed(field, absorbed);
  }

  function nestSingleSelect(nested, field, absorbed) {
    var parentKey = field.qKey;
    var otherKey = field.otherKey;
    var otherOption = resolveOtherOption(field);
    var parentValue = readAnswerValue(nested, parentKey, field.fieldName);
    var otherText = readOtherText(nested, field, otherKey);
    var value = stringifyScalar(parentValue);

    if (
      value &&
      otherText &&
      value.toLowerCase() === otherOption.toLowerCase()
    ) {
      nested[parentKey] = formatOthersLabel(otherText);
    } else if (value) {
      nested[parentKey] = value;
    } else {
      delete nested[parentKey];
    }

    markOtherKeyAbsorbed(field, absorbed);
  }

  function nestOpenMulti(nested, field, absorbed) {
    var parentKey = field.qKey;
    var boxes = field.boxes || [];
    var values = [];

    if (boxes.length === 0) {
      var parentValue = readAnswerValue(nested, parentKey, field.fieldName);
      if (Array.isArray(parentValue)) {
        for (var index = 0; index < parentValue.length; index += 1) {
          var item = stringifyScalar(parentValue[index]);
          if (item) values.push(item);
        }
      } else {
        var scalar = stringifyScalar(parentValue);
        if (scalar) values.push(scalar);
      }
    } else {
      for (var boxIndex = 0; boxIndex < boxes.length; boxIndex += 1) {
        var box = boxes[boxIndex];
        var boxKey = box.qKey || parentKey;
        var text = stringifyScalar(
          readAnswerValue(nested, boxKey, box.fieldName),
        );
        if (text) values.push(text);
      }
    }

    if (values.length > 0) {
      nested[parentKey] = values;
    } else {
      delete nested[parentKey];
    }

    markOpenMultiKeysAbsorbed(field, absorbed);
  }

  function nestMatrix(nested, field, absorbed) {
    var parentKey = field.qKey;
    var rows = field.rows || [];
    if (!rows.length) return;

    var consolidated = {};
    var existing = readAnswerValue(nested, parentKey, field.fieldName);
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      for (var key in existing) {
        if (!Object.prototype.hasOwnProperty.call(existing, key)) continue;
        var existingText = stringifyScalar(existing[key]);
        if (existingText) consolidated[key] = existingText;
      }
    }

    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index];
      var rowKey = row.qKey || parentKey;
      var text = stringifyScalar(
        readAnswerValue(nested, rowKey, row.fieldName),
      );
      if (text) consolidated[row.label] = text;
    }

    if (Object.keys(consolidated).length > 0) {
      nested[parentKey] = consolidated;
    }

    markMatrixKeysAbsorbed(field, absorbed);
  }

  function nestAnswersByQuestion(flatAnswers, schema) {
    var nested = Object.assign({}, flatAnswers || {});
    var absorbed = {};
    var fields = (schema && schema.fields) || [];

    for (var index = 0; index < fields.length; index += 1) {
      var field = fields[index];
      switch (field.type) {
        case "multiple_select":
          nestMultipleSelect(nested, field, absorbed);
          break;
        case "single_select":
          nestSingleSelect(nested, field, absorbed);
          break;
        case "open_multi":
          nestOpenMulti(nested, field, absorbed);
          break;
        case "matrix":
          nestMatrix(nested, field, absorbed);
          break;
        default:
          break;
      }
    }

    for (var key in nested) {
      if (!Object.prototype.hasOwnProperty.call(nested, key)) continue;
      if (absorbed[canonicalQKey(key)]) {
        delete nested[key];
      }
    }

    return nested;
  }

  window.ConcaveNestByQuestion = {
    nestAnswersByQuestion: nestAnswersByQuestion,
  };
})();
