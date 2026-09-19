/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import {
  looksLikeOurVite,
  parseLsofPids,
  parseNetstatPids,
  parseSsUsers,
} from "../../scripts/free-dev-port.ts";

const REPO = "/home/roth/Work/tempura";

Deno.test("looksLikeOurVite: deno task dev / beforeDevCommand", () => {
  const cmd = "/usr/bin/deno run -A --node-modules-dir npm:vite";
  assertEquals(looksLikeOurVite(cmd, null, REPO), true);
  assertEquals(looksLikeOurVite(cmd, REPO, REPO), true);
});

Deno.test("looksLikeOurVite: node vite under the repo", () => {
  const cmd = "node /home/roth/Work/tempura/node_modules/vite/bin/vite.js";
  assertEquals(looksLikeOurVite(cmd, REPO, REPO), true);
  assertEquals(looksLikeOurVite(cmd, "/tmp/other", REPO), true);
});

Deno.test("looksLikeOurVite: refuses non-Vite holders", () => {
  assertEquals(looksLikeOurVite("python3 -m http.server 1420", REPO, REPO), false);
  assertEquals(looksLikeOurVite("nginx: master process", null, REPO), false);
  assertEquals(looksLikeOurVite("node server.js", REPO, REPO), false);
  assertEquals(
    looksLikeOurVite("node /tmp/other-app/node_modules/vite/bin/vite.js", "/tmp/other-app", REPO),
    false,
  );
});

Deno.test("parseSsUsers extracts pids", () => {
  const line =
    `LISTEN 0 511 127.0.0.1:1420 0.0.0.0:* users:(("deno",pid=40931,fd=24))`;
  assertEquals(parseSsUsers(line), [40931]);
});

Deno.test("parseLsofPids skips header", () => {
  const out = `COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
deno    40931 roth   24u  IPv4  12345      0t0  TCP 127.0.0.1:1420 (LISTEN)
`;
  assertEquals(parseLsofPids(out), [40931]);
});

Deno.test("parseNetstatPids picks LISTENING pid", () => {
  const out = `
  TCP    127.0.0.1:1420         0.0.0.0:0              LISTENING       4242
  TCP    127.0.0.1:1420         127.0.0.1:51234        ESTABLISHED     99
`;
  assertEquals(parseNetstatPids(out, 1420), [4242]);
});
