/// <reference lib="deno.ns" />
import { assertEquals, assert } from "jsr:@std/assert@1";
import { blake2b } from "npm:@noble/hashes@1.8.0/blake2b.js";
import {
  appImageSearchDirs,
  findAppImages,
  hasUpdaterSigningKey,
  isLinuxAppImagePostProcess,
  removeStaleAppImageTarballs,
  staleAppImageTarPaths,
} from "../../scripts/tauri-ci.ts";

Deno.test("isLinuxAppImagePostProcess: only Linux build", () => {
  assertEquals(isLinuxAppImagePostProcess(["build"], "linux"), true);
  assertEquals(isLinuxAppImagePostProcess(["build"], "darwin"), false);
  assertEquals(isLinuxAppImagePostProcess(["build"], "windows"), false);
  assertEquals(isLinuxAppImagePostProcess(["dev"], "linux"), false);
  assertEquals(isLinuxAppImagePostProcess(["signer", "sign", "x"], "linux"), false);
  assertEquals(isLinuxAppImagePostProcess([], "linux"), false);
});

Deno.test("staleAppImageTarPaths sit next to the AppImage", () => {
  const ai = "/tmp/bundle/Tempura_0.3.2_amd64.AppImage";
  assertEquals(staleAppImageTarPaths(ai), [
    "/tmp/bundle/Tempura_0.3.2_amd64.AppImage.tar.gz",
    "/tmp/bundle/Tempura_0.3.2_amd64.AppImage.tar.gz.sig",
  ]);
});

Deno.test("hasUpdaterSigningKey: env key or path", () => {
  const env = (map: Record<string, string | undefined>) => ({
    get: (k: string) => map[k],
  });
  assertEquals(hasUpdaterSigningKey(env({})), false);
  assertEquals(hasUpdaterSigningKey(env({ TAURI_SIGNING_PRIVATE_KEY: "   " })), false);
  assertEquals(hasUpdaterSigningKey(env({ TAURI_SIGNING_PRIVATE_KEY: "k" })), true);
  assertEquals(
    hasUpdaterSigningKey(env({ TAURI_SIGNING_PRIVATE_KEY_PATH: "/tmp/tempura.key" })),
    true,
  );
});

Deno.test("findAppImages matches the wayland script dirs", async () => {
  const root = await Deno.makeTempDir({ prefix: "tempura-appimage-" });
  try {
    const dir = `${root}/src-tauri/target/release/bundle/appimage`;
    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(`${dir}/Tempura_0.3.2_amd64.AppImage`, "image");
    await Deno.writeTextFile(`${dir}/notes.txt`, "nope");
    const found = await findAppImages(root);
    assertEquals(found, [`${dir}/Tempura_0.3.2_amd64.AppImage`]);
    const dirs = appImageSearchDirs(root);
    assert(dirs.some((d) => d.endsWith("/release/bundle/appimage")));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("removeStaleAppImageTarballs deletes tar.gz sidecars only", async () => {
  const dir = await Deno.makeTempDir({ prefix: "tempura-tar-" });
  try {
    const ai = `${dir}/Tempura.AppImage`;
    await Deno.writeTextFile(ai, "image");
    await Deno.writeTextFile(`${ai}.tar.gz`, "stale");
    await Deno.writeTextFile(`${ai}.tar.gz.sig`, "stale-sig");
    await Deno.writeTextFile(`${ai}.sig`, "keep");
    const removed = await removeStaleAppImageTarballs(ai);
    assertEquals(removed.sort(), [`${ai}.tar.gz`, `${ai}.tar.gz.sig`].sort());
    await Deno.stat(`${ai}.sig`);
    await Deno.stat(ai);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

function decodeB64(line: string): Uint8Array {
  const bin = atob(line.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function minisignBody(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("untrusted comment:")) return trimmed;
  const first = trimmed.split("\n")[0] ?? "";
  const decoded = new TextDecoder().decode(decodeB64(first));
  if (!decoded.startsWith("untrusted comment:")) {
    throw new Error("not a minisign or Tauri .sig payload");
  }
  return decoded.trim();
}

async function minisignVerify(filePath: string, sigPath: string, pubPath: string): Promise<boolean> {
  const file = await Deno.readFile(filePath);
  const pubLines = minisignBody(await Deno.readTextFile(pubPath)).split("\n");
  const sigLines = minisignBody(await Deno.readTextFile(sigPath)).split("\n");
  const pubLine = pubLines.find((l) => l && !l.startsWith("untrusted comment:"));
  const sigLine = sigLines.find((l) => l && !l.startsWith("untrusted comment:") &&
    !l.startsWith("trusted comment:"));
  if (!pubLine || !sigLine) return false;
  const pub = decodeB64(pubLine);
  const sigBin = decodeB64(sigLine);
  if (pub.byteLength < 42 || sigBin.byteLength < 74) return false;
  const publicKey = pub.slice(10, 42);
  const signature = sigBin.slice(10, 74);
  const digest = new Uint8Array(blake2b(file, { dkLen: 64 }));
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(publicKey),
    "Ed25519",
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    "Ed25519",
    key,
    new Uint8Array(signature),
    digest,
  );
}

Deno.test("re-sign after rewrite: minisign matches only the new bytes", async () => {
  const keysRoot = new URL("../../src-tauri/.keys/", import.meta.url).pathname;
  await Deno.mkdir(keysRoot, { recursive: true });
  const dir = await Deno.makeTempDir({ dir: keysRoot, prefix: "resign-test-" });
  try {
    const keyPath = `${dir}/tempura.key`;
    const testPassword = "tempura-ci-resign-test";
    const childEnv = { ...Deno.env.toObject() };
    delete childEnv.TAURI_SIGNING_PRIVATE_KEY;
    childEnv.TAURI_SIGNING_PRIVATE_KEY_PATH = keyPath;
    childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = testPassword;

    const gen = new Deno.Command("deno", {
      args: [
        "run",
        "-A",
        "--node-modules-dir",
        "npm:@tauri-apps/cli",
        "signer",
        "generate",
        "-w",
        keyPath,
        "--ci",
        "-f",
        "-p",
        testPassword,
      ],
      cwd: dir,
      env: childEnv,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    });
    const generated = await gen.output();
    if (generated.code !== 0) {
      throw new Error(
        `signer generate failed: ${new TextDecoder().decode(generated.stderr)}`,
      );
    }
    const filePath = `${dir}/Tempura_dummy.AppImage`;
    await Deno.writeFile(filePath, new TextEncoder().encode("before-wayland-strip"));

    const sign = async () => {
      const out = await new Deno.Command("deno", {
        args: [
          "run",
          "-A",
          "--node-modules-dir",
          "npm:@tauri-apps/cli",
          "signer",
          "sign",
          "-p",
          testPassword,
          filePath,
        ],
        cwd: dir,
        env: childEnv,
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (out.code !== 0) {
        throw new Error(`signer sign failed: ${new TextDecoder().decode(out.stderr)}`);
      }
    };

    await sign();
    const sigPath = `${filePath}.sig`;
    const pubPath = `${keyPath}.pub`;
    assertEquals(await minisignVerify(filePath, sigPath, pubPath), true);

    await Deno.writeFile(filePath, new TextEncoder().encode("after-wayland-strip!!"));
    assertEquals(await minisignVerify(filePath, sigPath, pubPath), false);

    await sign();
    assertEquals(await minisignVerify(filePath, sigPath, pubPath), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
