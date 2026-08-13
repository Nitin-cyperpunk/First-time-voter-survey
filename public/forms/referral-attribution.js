(function () {
  "use strict";

  var CODE_KEY = "concave_referral_code";
  var PLATFORM_KEY = "concave_referral_platform";

  function getReferralAttribution() {
    var code = sessionStorage.getItem(CODE_KEY);
    var platform = sessionStorage.getItem(PLATFORM_KEY);
    return {
      code: code ? code.trim() : "",
      platform: platform ? platform.trim() : "",
    };
  }

  window.ConcaveReferralAttribution = {
    get: getReferralAttribution,
    clear: function () {
      sessionStorage.removeItem(CODE_KEY);
      sessionStorage.removeItem(PLATFORM_KEY);
    },
  };
})();
