import { defineConfig, devices } from "@playwright/test";

/**
 * Screenshots for the website (`deno task website:shots`), not tests: they render
 * the app against the e2e mock with sample data and write website/shots/*.png.
 * Own port and server, so a running dev server can't be picked up by mistake.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /\.shots\.ts$/,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:1425", ...devices["Desktop Chrome"], deviceScaleFactor: 1 },
  webServer: {
    command: "deno run -A --node-modules-dir npm:vite --host 127.0.0.1 --port 1425 --strictPort",
    cwd: "../..",
    url: "http://127.0.0.1:1425",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
