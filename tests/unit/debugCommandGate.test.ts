/// <reference lib="deno.ns" />
/**
 * `debug_test_notification` must not be on the release invoke handler.
 * UI hiding (Debug page / localStorage) is not IPC lockdown.
 */

Deno.test("debug_test_notification is cfg(debug_assertions) in Rust", async () => {
  const commands = await Deno.readTextFile(
    new URL("../../src-tauri/src/commands.rs", import.meta.url),
  );
  const lib = await Deno.readTextFile(new URL("../../src-tauri/src/lib.rs", import.meta.url));

  const fnIdx = commands.indexOf("pub fn debug_test_notification");
  if (fnIdx < 0) throw new Error("commands.rs is missing debug_test_notification");
  const prelude = commands.slice(Math.max(0, fnIdx - 160), fnIdx);
  if (!prelude.includes("#[cfg(debug_assertions)]")) {
    throw new Error("debug_test_notification must be #[cfg(debug_assertions)]");
  }

  if (!/cfg\(debug_assertions\)[\s\S]{0,400}debug_test_notification/.test(lib)) {
    throw new Error("lib.rs must register debug_test_notification only under cfg(debug_assertions)");
  }
  for (const match of lib.matchAll(/generate_handler!\[([\s\S]*?)\]/g)) {
    if (match[1].includes("debug_test_notification")) {
      throw new Error("debug_test_notification must not sit in an unguarded generate_handler! list");
    }
  }
});
