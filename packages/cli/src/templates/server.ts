export const serverTemplate = () => `import { edgePodFetch } from "@edgepod/server";

export default {
  async fetch(request: Request, env: any) {
    return edgePodFetch(request, env);
  },
};

// barrel export for the DO class, so Wrangler can push the code
export { BaseEdgePodEngine } from "@edgepod/server";`;
