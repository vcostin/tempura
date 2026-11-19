// Root (English, x-default) page only. Sends a visitor on to a language they chose
// explicitly before; never second-guesses someone who asked for English. A first-time
// visitor whose browser prefers another language gets a suggestion banner (site.js)
// instead of a redirect, so the English URL keeps serving English to search results,
// shared links and crawlers.
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

  function store(code) {
    try {
      localStorage.setItem(KEY, code);
      try {
        sessionStorage.removeItem(KEY);
      } catch (e2) {
        /* ignore */
      }
      return;
    } catch (e) {
      /* localStorage blocked: fall through */
    }
    try {
      sessionStorage.setItem(KEY, code);
    } catch (e) {
      /* both blocked */
    }
  }

  function readStored() {
    try {
      var fromLocal = resolve(localStorage.getItem(KEY) || "");
      if (fromLocal) return fromLocal;
    } catch (e) {
      /* localStorage blocked */
    }
    try {
      return resolve(sessionStorage.getItem(KEY) || "");
    } catch (e) {
      return "";
    }
  }

  var stored = readStored();

  // A link to English (?lang=en, from the switcher or footer) is an explicit choice,
  // however it was opened. Remember it and drop the parameter from the address bar.
  var params = new URLSearchParams(location.search);
  if (params.get("lang") === "en") {
    store("en");
    params.delete("lang");
    var qs = params.toString();
    try {
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch (e) {
      /* keep the parameter */
    }
    return;
  }

  // Arrived from another page of this site: also a choice of English (backstop for
  // older links without ?lang=en).
  var base = location.pathname.replace(/index\.html$/, "");
  var ref = null;
  try {
    ref = document.referrer ? new URL(document.referrer) : null;
  } catch (e) {
    ref = null;
  }
  if (ref && ref.origin === location.origin && ref.pathname.indexOf(base) === 0 && ref.pathname !== location.pathname) {
    store("en");
    return;
  }

  if (stored) {
    if (stored !== "en") location.replace("./" + stored.toLowerCase() + "/" + location.hash);
    return;
  }

  var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  var suggested = "";
  for (var k = 0; k < langs.length && !suggested; k++) suggested = resolve(langs[k]);
  if (suggested && suggested !== "en") window.tempuraSuggestedLocale = suggested;
})();
