export const middlewaresTemplate = () => `import { createMiddleware } from "@edgepod/server";

// Blocks requests without a verified JWT (the gateway already verifies the Bearer token)
export const withAuth = createMiddleware(async (ctx, _args, next) => {
  if (!ctx.user) throw new Error("UNAUTHORIZED: Bearer token required");
  return next();
});
`;
