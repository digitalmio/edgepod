import { spawn } from "node:child_process";
import type { Plugin, ViteDevServer } from "vite";

export function edgepod(): Plugin {
  let edgepodProcess: ReturnType<typeof spawn> | null = null;

  const cleanup = () => {
    if (edgepodProcess) {
      edgepodProcess.kill("SIGTERM");
      edgepodProcess = null;
    }
  };

  return {
    name: "edgepod",
    apply: "serve",
    configureServer: (server: ViteDevServer) => {
      edgepodProcess = spawn("edgepod", ["dev"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      edgepodProcess.stdout?.pipe(process.stdout);
      edgepodProcess.stderr?.pipe(process.stderr);

      edgepodProcess.on("error", (err) => {
        console.error(
          `Failed to start edgepod dev: ${err.message}. Make sure @edgepod/cli is installed.`,
        );
      });

      if (server.httpServer) {
        server.httpServer.on("close", cleanup);
      } else {
        server.watcher.on("close", cleanup);
      }
    },
  };
}
