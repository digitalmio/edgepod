export const middlewaresTemplate = () => `import { createMiddleware } from "@edgepod/server";
import { Ctx } from "./types";

// Blocks requests without a verified JWT (the gateway already verifies the Bearer token)
export const withAuth = createMiddleware(async (ctx: Ctx, _args, next) => {
  if (!ctx.user) throw new Error("UNAUTHORIZED: Bearer token required");
  return next();
});
`;
