export const genTypesTemplate = () => `import * as schema from "./schema";
import type { EdgePodContext } from "@edgepod/server";

type Env = {
  SECRET_KEY: string;
}

type Variables = {
  traceId: string;
}

type User = {
  id: string;
  isAdmin: boolean;
} | null

export type Ctx = EdgePodContext<typeof schema, Env, Variables, User>;
`;
