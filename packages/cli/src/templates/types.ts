export const genTypesTemplate = () => `import * as schema from "./schema";
import type { EdgePodContext } from "@edgepod/server";

// Any env vars added to .env will be automatically deployed via Wrangler
// Please add any custom env vars you need to the Env type below for type safety in your functions
type Env = {
  SECRET_KEY: string;
}

// Those are request lifecycle variables that you might want to use in your functions
// You can override them per function by passing a second generic argument to the Ctx type (e.g. Ctx<{ myVar: string }>)
type Variables = {
  traceId: string;
}

// The User type represents the shape of the user object available in your functions via
// the 'context.user' property from decoded JWT
type User = {
  id: string;
  isAdmin: boolean;
} | null

export type Ctx<TVariables extends Record<string, any> = Variables> = EdgePodContext<
  typeof schema,
  Env,
  TVariables,
  User
>;
`;
