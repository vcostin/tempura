// Root page only: send a returning visitor to the language they picked, or a first-time
// visitor to their browser's language. Each language page has its own URL, so crawlers
// (and anyone with JavaScript off) still get English here and every locale by link.
(function () {
  var KEY = "tempura-locale";
  var CODES = ["en", "de", "es", "fr", "it", "pt-BR", "ro", "uk", "pl", "nl", "ja", "zh-Hans", "ko", "ar", "he"];

  function resolve(tag) {
    var raw = String(tag || "").trim().toLowerCase();
    if (!raw) return "";
    for (var i = 0; i < CODES.length; i++) if (CODES[i].toLowerCase() === raw) return CODES[i];
    var base = raw.split("-")[0];
    if (base === "zh") return "zh-Hans";
    if (base === "pt") return "pt-BR";
    if (base === "iw") return "he";
    for (var j = 0; j < CODES.length; j++) if (CODES[j].toLowerCase().split("-")[0] === base) return CODES[j];
    return "";
  }

  var stored = "";
  try {
    stored = localStorage.getItem(KEY) || "";
  } catch (e) {
    /* storage blocked: fall back to the browser language */
  }
  var target = resolve(stored);
  if (!target) {
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var k = 0; k < langs.length && !target; k++) target = resolve(langs[k]);
  }
  if (target && target !== "en") {
    location.replace("./" + target.toLowerCase() + "/" + location.hash);
  }
})();
