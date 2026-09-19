/// <reference lib="deno.ns" />
/**
 * Keep the frontend constant and the Rust allowlist pointed at Discussion #5.
 */

const PINNED = "https://github.com/vcostin/tempura/discussions/5";

Deno.test("feedback URL is pinned in frontend and Rust opener", async () => {
  const platform = await Deno.readTextFile(new URL("../../src/lib/platform.ts", import.meta.url));
  const rust = await Deno.readTextFile(new URL("../../src-tauri/src/open_url.rs", import.meta.url));
  if (!platform.includes(PINNED)) {
    throw new Error("src/lib/platform.ts is missing the pinned Discussion URL");
  }
  if (!rust.includes(PINNED)) {
    throw new Error("src-tauri/src/open_url.rs is missing the pinned Discussion URL");
  }
});
