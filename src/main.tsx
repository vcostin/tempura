import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import { isTauri, windowChrome } from "./lib/platform";

document.documentElement.dataset.chrome = windowChrome();

// The webview's own right-click menu (Reload, Inspect…) is for development. Release
// builds keep only Tempura's own menus, and the text menu (cut, copy, paste) in fields.
if (import.meta.env.PROD && isTauri()) {
  document.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable]:not([contenteditable='false'])")) return;
    e.preventDefault();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
