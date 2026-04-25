export const genTypesTemplate = () => `import * as schema from "./schema";
import type { EdgePodContext } from "@edgepod/server";

type Env = {
  SECRET_KEY: string;
}

type Variables = {
  user: { id: number; name: string } | null;
  traceId: string;
}

export type Ctx = EdgePodContext<typeof schema, Env, Variables>;
`;
