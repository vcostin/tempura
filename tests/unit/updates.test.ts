/// <reference lib="deno.ns" />
import {
  downloadPercent,
  formatUpdateErrorDetail,
  isSoftUpdateError,
} from "../../src/lib/updates.ts";

Deno.test("downloadPercent: unknown or empty total stays null", () => {
  if (downloadPercent(10, null) !== null) throw new Error("null total");
  if (downloadPercent(10, undefined) !== null) throw new Error("undefined total");
  if (downloadPercent(10, 0) !== null) throw new Error("zero total");
});

Deno.test("downloadPercent: clamps to 0–100", () => {
  if (downloadPercent(25, 100) !== 25) throw new Error("25%");
  if (downloadPercent(100, 100) !== 100) throw new Error("100%");
  if (downloadPercent(150, 100) !== 100) throw new Error("clamp");
});

Deno.test("isSoftUpdateError: network / missing latest.json", () => {
  const soft = [
    "error sending request for url (https://github.com/...)",
    "timed out",
    "Could not fetch a valid release JSON from the remote",
    "failed to fetch",
    "404 Not Found",
    "os error 101",
  ];
  for (const msg of soft) {
    if (!isSoftUpdateError(new Error(msg))) {
      throw new Error(`expected soft: ${msg}`);
    }
  }
});

Deno.test("isSoftUpdateError: signature / unexpected stay firm", () => {
  if (isSoftUpdateError(new Error("signature verification failed"))) {
    throw new Error("signature should not be soft");
  }
});

Deno.test("formatUpdateErrorDetail: trims and collapses space", () => {
  if (formatUpdateErrorDetail(new Error("  signature\n  failed  ")) !== "signature failed") {
    throw new Error("collapse");
  }
  if (formatUpdateErrorDetail("plain") !== "plain") throw new Error("string");
  if (formatUpdateErrorDetail(new Error("   ")) !== "") throw new Error("blank");
});

Deno.test("formatUpdateErrorDetail: caps length with ellipsis", () => {
  const long = "x".repeat(300);
  const out = formatUpdateErrorDetail(new Error(long), 20);
  if (out.length !== 20) throw new Error(`len ${out.length}`);
  if (!out.endsWith("…")) throw new Error("ellipsis");
  if (formatUpdateErrorDetail(new Error("short"), 220) !== "short") {
    throw new Error("under cap");
  }
});
