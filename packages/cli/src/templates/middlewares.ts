export const middlewaresTemplate = () => `// This is where you define your Edgepod middlewares!
// Middlewares wrap your functions and can perform auth checks, validation, or context enrichment.
//
// The example below blocks requests without a verified JWT.
// Apply it to any function by wrapping it: export const myFn = withAuth(async (ctx) => { ... })

import { createMiddleware } from "@edgepod/server";
import { Ctx } from "./types";

// Blocks requests without a verified JWT (the gateway already verifies the Bearer token)
export const withAuth = createMiddleware(async (ctx: Ctx, _args, next) => {
  if (!ctx.user) throw new Error("UNAUTHORIZED: Bearer token required");
  return next();
});
`;
