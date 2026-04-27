export const serverTemplate =
  () => `import { edgePodFetch, BaseEdgePodEngine } from "@edgepod/server";
import * as schema from "../schema";
import * as functions from "../functions/index";
import migrations from "./migrations/index";

export class EdgePodEngine extends BaseEdgePodEngine {
  protected override schema = schema;
  protected override userFunctions = functions;
  protected override migrations = migrations;
}

export default {
  async fetch(request: Request, env: any) {
    return edgePodFetch(request, env);
  },
};
`;
