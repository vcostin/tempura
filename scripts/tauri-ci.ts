/// <reference lib="deno.ns" />
/**
 * Run the Tauri CLI, then (on Linux) drop bundled libwayland from AppImages.
 *
 *   deno task tauri build
 */

const cli = new Deno.Command("deno", {
  args: ["run", "-A", "--node-modules-dir", "npm:@tauri-apps/cli", ...Deno.args],
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
const { code } = await cli.output();
if (code !== 0) Deno.exit(code);

if (Deno.build.os !== "linux") Deno.exit(0);

const script = new URL("./appimage-use-host-wayland.sh", import.meta.url);
const patch = new Deno.Command("bash", {
  args: [script.pathname],
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
const patched = await patch.output();
Deno.exit(patched.code);
