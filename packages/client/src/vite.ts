import { spawn } from "node:child_process";
import type { Plugin } from "vite";

export function edgepod(): Plugin {
  let edgepodProcess: ReturnType<typeof spawn> | null = null;

  return {
    name: "edgepod",
    configureServer: async () => {
      // Run migrations once before starting the server
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn("edgepod migrations", { stdio: "inherit", shell: true });
          proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`edgepod migrations exited with code ${code}`));
          });
          proc.on("error", reject);
        });
      } catch (e) {
        console.warn(`Initial migrations failed: ${e instanceof Error ? e.message : e}`);
      }

      // Start edgepod dev server
      edgepodProcess = spawn("edgepod dev", { stdio: "inherit", shell: true });
    },
    closeBundle: async () => {
      if (edgepodProcess) {
        edgepodProcess.kill("SIGTERM");
      }
    },
  };
}
