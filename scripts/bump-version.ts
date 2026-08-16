/// <reference lib="deno.ns" />
/**
 * Keep package.json, tauri.conf.json, Cargo.toml, and Cargo.lock in lockstep.
 *
 *   deno task version 0.2.0
 */

const version = Deno.args[0]?.replace(/^v/, "");

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: deno task version <semver>");
  console.error("  example: deno task version 0.2.0");
  Deno.exit(1);
}

function read(rel: string) {
  return Deno.readTextFileSync(new URL(rel, import.meta.url));
}

function write(rel: string, contents: string) {
  Deno.writeTextFileSync(new URL(rel, import.meta.url), contents);
}

const pkg = JSON.parse(read("../package.json")) as { version: string };
const prev = pkg.version;
pkg.version = version;
write("../package.json", `${JSON.stringify(pkg, null, 2)}\n`);

const tauri = JSON.parse(read("../src-tauri/tauri.conf.json")) as { version: string };
tauri.version = version;
write("../src-tauri/tauri.conf.json", `${JSON.stringify(tauri, null, 2)}\n`);

write(
  "../src-tauri/Cargo.toml",
  read("../src-tauri/Cargo.toml").replace(
    /(\[package\][\s\S]*?^version = ")[^"]+/m,
    `$1${version}`,
  ),
);

write(
  "../src-tauri/Cargo.lock",
  read("../src-tauri/Cargo.lock").replace(
    /(\[\[package\]\]\nname = "tempura"\nversion = ")[^"]+/,
    `$1${version}`,
  ),
);

console.log(`Version ${prev} → ${version}`);
console.log("");
console.log("Next:");
console.log(
  "  git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json",
);
console.log(`  git commit -m "Release v${version}"`);
console.log(`  git tag v${version}`);
console.log("  git push origin main --tags");
console.log("");
console.log(`That tag starts the Release workflow and publishes installers for v${version}.`);
console.log("Download page: https://vcostin.github.io/tempura/");
