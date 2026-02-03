import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";

export type DemoServerInfo = {
  pid: number;
  port: number;
  baseURL: string;
};

const stateDir = path.resolve(process.cwd(), ".playwright");
const stateFile = path.join(stateDir, "demo-server.json");

export async function readDemoServerInfo(): Promise<DemoServerInfo> {
  const raw = await fs.readFile(stateFile, "utf-8");
  return JSON.parse(raw) as DemoServerInfo;
}

export async function writeDemoServerInfo(info: DemoServerInfo): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(info, null, 2));
}

export async function removeDemoServerInfo(): Promise<void> {
  try {
    await fs.unlink(stateFile);
  } catch {
    // ignore
  }
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to get a TCP port")));
        return;
      }
      const port = address.port;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHttpReady(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 500);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) {
        return;
      }
    } catch {
      // ignore
    } finally {
      clearTimeout(id);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for demo server at ${url}`);
}

export async function startDemoServer(): Promise<DemoServerInfo> {
  const requested = process.env.PLAYWRIGHT_DEMO_PORT
    ? Number(process.env.PLAYWRIGHT_DEMO_PORT)
    : null;
  const port =
    requested && Number.isFinite(requested) && requested > 0
      ? requested
      : await getAvailablePort();
  const baseURL = `http://127.0.0.1:${port}`;

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = [
    "--workspace",
    "demo",
    "run",
    "dev",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ];

  const child: ChildProcess = spawn(npmCmd, args, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Reduce noise; keep logs in case the server fails to boot.
      NO_COLOR: "1",
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const exitPromise = new Promise<never>((_, reject) => {
    child.once("exit", (code) => {
      reject(
        new Error(
          `Demo server exited early (code=${code}).\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`,
        ),
      );
    });
  });

  await Promise.race([waitForHttpReady(`${baseURL}/`, 30_000), exitPromise]);

  if (!child.pid) {
    throw new Error("Demo server started but has no pid");
  }

  const info: DemoServerInfo = { pid: child.pid, port, baseURL };
  await writeDemoServerInfo(info);
  return info;
}

export async function stopDemoServer(info: DemoServerInfo): Promise<void> {
  const pid = info.pid;
  if (!pid) {
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  const start = Date.now();
  while (Date.now() - start < 3_000) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore
  }
}

