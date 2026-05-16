import { spawn } from "node:child_process";
import type { Plugin } from "vite";

export function edgepod(): Plugin {
  let edgepodProcess: ReturnType<typeof spawn> | null = null;

  return {
    name: "edgepod",
    configureServer: () => {
      // Start edgepod dev server — it runs migrations on startup itself
      edgepodProcess = spawn("edgepod", ["dev"], { stdio: "inherit" });

      edgepodProcess.on("error", (err) => {
        console.error(
          `Failed to start edgepod dev: ${err.message}. Make sure @edgepod/cli is installed.`,
        );
      });

      // Return cleanup function that Vite calls on server shutdown
      return () => {
        if (edgepodProcess) {
          edgepodProcess.kill("SIGTERM");
        }
      };
    },
  };
}
