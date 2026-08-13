(function () {
  "use strict";

  function isQuestionKey(key) {
    return /^Q\d+$/i.test(key);
  }

  function extractQuestionAnswers(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    if (raw.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers)) {
      return Object.assign({}, raw.answers);
    }

    var answers = {};
    for (var key in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      if (!isQuestionKey(key)) continue;
      answers[key] = raw[key];
    }
    return answers;
  }

  window.ConcaveSurveyResponseDocument = {
    extractQuestionAnswers: extractQuestionAnswers,
  };
})();
