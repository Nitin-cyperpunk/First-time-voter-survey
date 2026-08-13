(function () {
  "use strict";

  function readInjectedMap() {
    var injected = window.__concaveFieldQKeyMap;
    if (!injected || typeof injected !== "object") return null;
    return injected;
  }

  function readDomDataQMap() {
    var map = {};
    document
      .querySelectorAll(
        'input[name][data-q], select[name][data-q], textarea[name][data-q]',
      )
      .forEach(function (el) {
        var name = el.name;
        var dataQ = (el.getAttribute("data-q") || "").trim();
        if (!name || !dataQ || map[name]) return;
        map[name] = dataQ;
      });
    return Object.keys(map).length > 0 ? map : null;
  }

  function resolveMap() {
    return readInjectedMap() || readDomDataQMap() || {};
  }

  function fieldToQ(name) {
    if (!name) return null;
    var map = resolveMap();
    return map[name] || null;
  }

  window.ConcaveFieldQKeyMap = {
    resolveMap: resolveMap,
    fieldToQ: fieldToQ,
  };
})();
