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
    } catch (e) {
      /* storage blocked */
    }
  }

  var stored = "";
  try {
    stored = resolve(localStorage.getItem(KEY) || "");
  } catch (e) {
    /* storage blocked: no remembered choice */
  }

  // Arrived from another page of this site (a language link, even opened in a new tab):
  // that is a choice of English.
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
