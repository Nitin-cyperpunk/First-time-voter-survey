(function (global) {
  "use strict";

  var FALLBACK = "/images/no-image-available.svg";
  var VALID_FILENAME = /^[a-z][a-z0-9_]*\.(png|jpe?g|webp)$/;
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
    return VALID_FILENAME.test(normalizeFilename(filename));
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

  function resolveSurveyImageUrl(filename, folder) {
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

  function applySurveyImages(root) {
    var scope = root || global.document;
    if (!scope || !scope.querySelectorAll) {
      return;
    }

    scope.querySelectorAll("img[data-img]").forEach(function (img) {
      var filename = img.getAttribute("data-img");
      if (!filename) {
        return;
      }

      var folder = img.getAttribute("data-img-folder") || undefined;
      var url = resolveSurveyImageUrl(filename, folder);
      var fallback = getFallbackUrl();

      if (!img.getAttribute("loading")) {
        img.setAttribute("loading", "lazy");
      }
      if (!img.getAttribute("decoding")) {
        img.setAttribute("decoding", "async");
      }

      img.addEventListener("error", function onError() {
        img.removeEventListener("error", onError);
        if (img.getAttribute("src") !== fallback) {
          img.setAttribute("src", fallback);
        }
      });

      img.setAttribute("src", url);
    });
  }

  global.ConcaveSurveyImages = {
    resolveSurveyImageUrl: resolveSurveyImageUrl,
    applySurveyImages: applySurveyImages,
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
