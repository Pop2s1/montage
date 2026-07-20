import { spawn } from "child_process";

/**
 * Starts Next.js + background worker together for local MVP.
 */
function run(name: string, command: string, args: string[]) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  child.on("exit", (code) => {
    console.log(`[${name}] exited with ${code}`);
    process.exit(code ?? 1);
  });
  return child;
}

const web = run("web", "pnpm", ["dev:web"]);
const worker = run("worker", "pnpm", ["worker"]);

function shutdown() {
  web.kill("SIGTERM");
  worker.kill("SIGTERM");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
