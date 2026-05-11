import { edgePodFetch, BaseEdgePodEngine } from "@edgepod/server";
import * as schema from "../schema";
import * as functions from "../functions";
import migrations from "./migrations/index";

export class EdgePodEngine extends BaseEdgePodEngine {
  protected override schema = schema;
  protected override userFunctions = functions;
  protected override migrations = migrations;
}

import type { Cloudflare } from "@cloudflare/workers-types";

export default {
  async fetch(request: Request, env: Cloudflare.Env) {
    return edgePodFetch(request, env, Object.keys(functions));
  },
};
