(function (global) {
  "use strict";

  var FALLBACK = "/images/no-image-available.svg";
  var VALID_FILENAME = /^[a-z][a-z0-9_]*\.(png|jpe?g|webp)$/;
  var GENERIC_FILENAME = /^(img|image|photo|pic|picture)[0-9]*\./i;
  var MANIFEST = {};
  var KEYWORD_RULES = [
    { pattern: /logo/, folder: "logos" },
    { pattern: /bra/, folder: "bras" },
    { pattern: /brand/, folder: "brands" },
    { pattern: /product/, folder: "products" },
  ];

  function normalizeFilename(filename) {
    return String(filename || "").trim();
  }

  function isValidSurveyImageFilename(filename) {
    var normalized = normalizeFilename(filename);
    if (!VALID_FILENAME.test(normalized)) return false;
    if (GENERIC_FILENAME.test(normalized)) return false;
    return true;
  }

  function folderFor(filename, override) {
    var normalized = normalizeFilename(filename);

    if (override) {
      return override;
    }

    if (Object.prototype.hasOwnProperty.call(MANIFEST, normalized)) {
      return MANIFEST[normalized];
    }

    for (var i = 0; i < KEYWORD_RULES.length; i++) {
      if (KEYWORD_RULES[i].pattern.test(normalized)) {
        return KEYWORD_RULES[i].folder;
      }
    }

    if (/^q[0-9]+_/.test(normalized)) {
      return "questions";
    }

    return "questions";
  }

  function getImagePath(filename, folder) {
    if (!isValidSurveyImageFilename(filename)) {
      return null;
    }

    var normalized = normalizeFilename(filename);
    return folderFor(normalized, folder) + "/" + normalized;
  }

  function getFallbackUrl() {
    return global.__concaveSurveyImageFallback || FALLBACK;
  }

  function getDbUrl(filename) {
    var map = global.__concaveSurveyImageMap;
    if (!map || typeof map !== "object") return null;
    var key = normalizeFilename(filename);
    return map[key] || null;
  }

  function resolveSurveyImageUrl(filename, folder) {
    var fromDb = getDbUrl(filename);
    if (fromDb) {
      return fromDb;
    }

    var path = getImagePath(filename, folder);
    if (!path) {
      return getFallbackUrl();
    }

    var baseUrl = global.__concaveStudyImagesPublicBaseUrl;
    if (!baseUrl) {
      return getFallbackUrl();
    }

    return String(baseUrl).replace(/\/$/, "") + "/" + path;
  }

  function bindImageFallback(img) {
    var fallback = getFallbackUrl();
    img.addEventListener("error", function onError() {
      img.removeEventListener("error", onError);
      if (img.getAttribute("src") !== fallback) {
        img.setAttribute("src", fallback);
      }
    });
  }

  function applySingleImage(img) {
    var filename = img.getAttribute("data-img");
    if (!filename) {
      return;
    }

    var folder = img.getAttribute("data-img-folder") || undefined;
    var url = resolveSurveyImageUrl(filename, folder);

    if (!img.getAttribute("loading")) {
      img.setAttribute("loading", "lazy");
    }
    if (!img.getAttribute("decoding")) {
      img.setAttribute("decoding", "async");
    }

    bindImageFallback(img);
    img.setAttribute("src", url);
  }

  function applyQuestionImages(host) {
    var questionKey = (host.getAttribute("data-img-question") || "")
      .trim()
      .toUpperCase();
    if (!questionKey) return;

    var byQuestion = global.__concaveSurveyImagesByQuestion;
    var urls =
      byQuestion && typeof byQuestion === "object"
        ? byQuestion[questionKey] || []
        : [];

    if (!urls.length) {
      host.setAttribute("data-img-empty", "1");
      return;
    }

    host.innerHTML = "";
    urls.forEach(function (url, index) {
      var img = global.document.createElement("img");
      img.className = host.getAttribute("data-img-class") || "survey-img";
      img.alt =
        host.getAttribute("data-img-alt") ||
        questionKey + " image " + (index + 1);
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      bindImageFallback(img);
      img.setAttribute("src", url);
      host.appendChild(img);
    });
  }

  function applySurveyImages(root) {
    var scope = root || global.document;
    if (!scope || !scope.querySelectorAll) {
      return;
    }

    scope.querySelectorAll("img[data-img]").forEach(applySingleImage);
    scope
      .querySelectorAll("[data-img-question]")
      .forEach(applyQuestionImages);
  }

  global.ConcaveSurveyImages = {
    resolveSurveyImageUrl: resolveSurveyImageUrl,
    applySurveyImages: applySurveyImages,
    isValidSurveyImageFilename: isValidSurveyImageFilename,
  };

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        applySurveyImages();
      });
    } else {
      applySurveyImages();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
