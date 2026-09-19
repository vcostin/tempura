/// <reference lib="deno.ns" />
/**
 * Clear leftover Tempura Vite on 127.0.0.1:1420 (Ctrl+C often kills Tauri first).
 *
 * Only kills a listener whose command looks like our Vite (`deno` + `npm:vite`,
 * or `vite` whose cwd is this repo). Anything else: print pid + cmd and exit 1.
 *
 *   deno task free-dev-port
 *
 * Linux/macOS first; Windows uses netstat when available.
 */

export const DEV_PORT = 1420;

export type Listener = {
  pid: number;
  cmd: string;
  cwd: string | null;
};

export type FreeOptions = {
  /** Stay quiet when the port is already free (for `tauri:dev`). */
  quietIfFree?: boolean;
  repoRoot?: string;
};

export function repoRootFromScript(): string {
  return new URL("..", import.meta.url).pathname.replace(/\/$/, "");
}

export function normalizePath(p: string): string {
  return p.replaceAll("\\", "/").replace(/\/+$/, "") || "/";
}

function underRepo(path: string, repoRoot: string): boolean {
  const dir = normalizePath(path);
  const repo = normalizePath(repoRoot);
  return dir === repo || dir.startsWith(`${repo}/`);
}

/** True only for Tempura’s Vite — not a random process on 1420. */
export function looksLikeOurVite(cmd: string, cwd: string | null, repoRoot: string): boolean {
  const lower = cmd.toLowerCase();
  const mentionsVite = lower.includes("npm:vite") ||
    /(?:^|[\s/\\])vite(?:\.(?:js|mjs|cjs))?(?:\s|$)/i.test(cmd);
  const runner = /\bdeno\b/i.test(cmd) || /\bnode\b/i.test(cmd);
  if (!mentionsVite || !runner) return false;

  if (cwd && underRepo(cwd, repoRoot)) return true;
  if (normalizePath(cmd).includes(normalizePath(repoRoot))) return true;
  // `deno task dev` / beforeDevCommand: `deno … npm:vite` (cwd may be missing from ss).
  return lower.includes("deno") && lower.includes("npm:vite");
}

export function parseSsUsers(line: string): number[] {
  const pids: number[] = [];
  for (const m of line.matchAll(/pid=(-?\d+)/g)) {
    const pid = Number(m[1]);
    if (Number.isInteger(pid) && pid > 1) pids.push(pid);
  }
  return pids;
}

export function parseLsofPids(output: string): number[] {
  const pids = new Set<number>();
  for (const line of output.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 2 || cols[0] === "COMMAND") continue;
    const pid = Number(cols[1]);
    if (Number.isInteger(pid) && pid > 1) pids.add(pid);
  }
  return [...pids];
}

export function parseNetstatPids(output: string, port: number): number[] {
  const pids = new Set<number>();
  const re = new RegExp(`[:.]${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "i");
  for (const line of output.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    const pid = Number(m[1]);
    if (Number.isInteger(pid) && pid > 1) pids.add(pid);
  }
  return [...pids];
}

async function runCapture(cmd: string, args: string[]): Promise<string | null> {
  try {
    const proc = new Deno.Command(cmd, {
      args,
      stdout: "piped",
      stderr: "null",
    });
    const { code, stdout } = await proc.output();
    if (code !== 0) return null;
    return new TextDecoder().decode(stdout);
  } catch {
    return null;
  }
}

async function cmdlineOf(pid: number): Promise<string> {
  if (Deno.build.os === "linux") {
    try {
      const raw = await Deno.readFile(`/proc/${pid}/cmdline`);
      return new TextDecoder().decode(raw).replaceAll("\0", " ").trim();
    } catch {
      /* fall through */
    }
  }
  if (Deno.build.os === "windows") {
    const out = await runCapture("powershell", [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
    ]);
    return out?.trim() ?? "";
  }
  const out = await runCapture("ps", ["-p", String(pid), "-ww", "-o", "args="]);
  return out?.trim() ?? "";
}

async function cwdOf(pid: number): Promise<string | null> {
  if (Deno.build.os === "linux") {
    try {
      return await Deno.readLink(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  if (Deno.build.os === "darwin") {
    const out = await runCapture("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
    const n = out?.split("\n").find((l) => l.startsWith("n"));
    return n ? n.slice(1) : null;
  }
  return null;
}

async function pidsFromProcfs(port: number): Promise<number[]> {
  if (Deno.build.os !== "linux") return [];
  const pids = new Set<number>();
  const needle = port.toString(16).toUpperCase().padStart(4, "0");
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text: string;
    try {
      text = await Deno.readTextFile(file);
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) continue;
      const local = cols[1] ?? "";
      const state = cols[3];
      const inode = cols[9];
      if (state !== "0A") continue; // LISTEN
      if (!local.toUpperCase().endsWith(`:${needle}`)) continue;
      if (!inode || inode === "0") continue;
      for await (const proc of Deno.readDir("/proc")) {
        if (!proc.isDirectory || !/^\d+$/.test(proc.name)) continue;
        const fdDir = `/proc/${proc.name}/fd`;
        try {
          for await (const fd of Deno.readDir(fdDir)) {
            try {
              const target = await Deno.readLink(`${fdDir}/${fd.name}`);
              if (target === `socket:[${inode}]`) pids.add(Number(proc.name));
            } catch {
              /* skip */
            }
          }
        } catch {
          /* skip */
        }
      }
    }
  }
  return [...pids];
}

export async function findListeners(port: number): Promise<number[]> {
  const fromSs = await runCapture("ss", ["-ltnp", `sport = :${port}`]);
  if (fromSs) {
    const pids = parseSsUsers(fromSs);
    if (pids.length) return pids;
  }
  const fromLsof = await runCapture("lsof", [
    "-nP",
    `-iTCP:${port}`,
    "-sTCP:LISTEN",
  ]);
  if (fromLsof) {
    const pids = parseLsofPids(fromLsof);
    if (pids.length) return pids;
  }
  const fromProc = await pidsFromProcfs(port);
  if (fromProc.length) return fromProc;

  if (Deno.build.os === "windows") {
    const fromNet = await runCapture("netstat", ["-ano", "-p", "tcp"]);
    if (fromNet) return parseNetstatPids(fromNet, port);
  }
  return [];
}

async function describe(pid: number): Promise<Listener> {
  return {
    pid,
    cmd: (await cmdlineOf(pid)) || `(pid ${pid})`,
    cwd: await cwdOf(pid),
  };
}

function stillOurs(pid: number): boolean {
  return pid !== Deno.pid && pid !== Deno.ppid;
}

async function pidStillAlive(pid: number): Promise<boolean> {
  if (Deno.build.os === "linux") {
    try {
      await Deno.stat(`/proc/${pid}`);
      return true;
    } catch {
      return false;
    }
  }
  const out = await runCapture("kill", ["-0", String(pid)]);
  return out !== null;
}

async function stopPid(pid: number): Promise<void> {
  try {
    Deno.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + 1200;
  while (Date.now() < deadline) {
    if (!(await pidStillAlive(pid))) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  try {
    Deno.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

export async function freeDevPort(opts: FreeOptions = {}): Promise<void> {
  const repoRoot = opts.repoRoot ?? repoRootFromScript();
  const pids = (await findListeners(DEV_PORT)).filter(stillOurs);

  if (pids.length === 0) {
    if (!opts.quietIfFree) {
      console.log(`Port ${DEV_PORT} is already free.`);
    }
    return;
  }

  const listeners = await Promise.all(pids.map(describe));
  const ours = listeners.filter((l) => looksLikeOurVite(l.cmd, l.cwd, repoRoot));
  const others = listeners.filter((l) => !looksLikeOurVite(l.cmd, l.cwd, repoRoot));

  if (others.length) {
    console.error(`Port ${DEV_PORT} is in use by something other than Tempura Vite:`);
    for (const l of others) {
      console.error(`  pid ${l.pid}${l.cwd ? `  cwd ${l.cwd}` : ""}`);
      console.error(`  ${l.cmd}`);
    }
    console.error("Not killing it. Stop that process yourself, then retry.");
    Deno.exit(1);
  }

  for (const l of ours) {
    await stopPid(l.pid);
    console.log(`Stopped leftover Vite (pid ${l.pid}) on ${DEV_PORT}.`);
  }
}

if (import.meta.main) {
  const quietIfFree = Deno.args.includes("--quiet-if-free");
  await freeDevPort({ quietIfFree });
}
