export type WranglerOptions = {
  apiKey: string;
  authMode?: "none" | "local" | "remote";
  jwksUrl?: string | undefined;
};

export const wranglerJsonTemplate = (opts: WranglerOptions): string => {
  const vars: Record<string, string> = { EDGEPOD_API_KEY: opts.apiKey };
  if (opts.authMode === "remote" && opts.jwksUrl) {
    vars.EDGEPOD_JWKS_URL = opts.jwksUrl;
  }

  const config: Record<string, unknown> = {
    name: "edgepod-server",
    main: "./.generated/server.ts",
    compatibility_date: new Date().toISOString().split("T")[0],
    compatibility_flags: ["nodejs_compat"],
    vars,
    durable_objects: {
      bindings: [{ name: "EDGEPOD_DO", class_name: "EdgePodEngine" }],
    },
    migrations: [{ tag: "v1", new_sqlite_classes: ["EdgePodEngine"] }],
  };

  if (opts.authMode === "local") {
    config.assets = { directory: "./.generated/public", binding: "ASSETS" };
  }

  return JSON.stringify(config, null, 2) + "\n";
};
