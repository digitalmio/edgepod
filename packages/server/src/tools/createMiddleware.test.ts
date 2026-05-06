import { describe, it, expect, vi } from "vitest";
import { createMiddleware } from "./createMiddleware";

describe("createMiddleware", () => {
  it("executes middleware before handler", async () => {
    const callOrder: string[] = [];

    const middleware = createMiddleware(async (ctx, args, next) => {
      callOrder.push("middleware-start");
      const result = await next();
      callOrder.push("middleware-end");
      return result;
    });

    const handler = middleware(async () => {
      callOrder.push("handler");
      return "result";
    });

    const result = await handler({} as any, {} as any);

    expect(callOrder).toEqual(["middleware-start", "handler", "middleware-end"]);
    expect(result).toBe("result");
  });

  it("allows middleware to short-circuit by not calling next", async () => {
    const middleware = createMiddleware(async (_ctx, _args, _next) => {
      return "short-circuited";
    });

    const handler = middleware(async () => {
      return "handler-result";
    });

    const result = await handler({} as any, {} as any);

    expect(result).toBe("short-circuited");
  });

  it("passes context and args to middleware", async () => {
    const ctx = { userId: "123" };
    const args = { projectId: "abc" };

    const middleware = createMiddleware(async (mCtx, mArgs, next) => {
      expect(mCtx).toBe(ctx);
      expect(mArgs).toBe(args);
      return next();
    });

    const handler = middleware(async (hCtx, hArgs) => {
      expect(hCtx).toBe(ctx);
      expect(hArgs).toBe(args);
      return "ok";
    });

    await handler(ctx, args);
  });

  it("allows middleware to modify context before next", async () => {
    type Ctx = { user: string | null; role: string };

    const middleware = createMiddleware<Ctx>(async (ctx, _args, next) => {
      ctx.user = "authenticated-user";
      return next();
    });

    const handler = middleware(async (ctx) => {
      return ctx.user;
    });

    const result = await handler({ user: null, role: "admin" }, {});

    expect(result).toBe("authenticated-user");
  });

  it("propagates errors from handler", async () => {
    const middleware = createMiddleware(async (_ctx, _args, next) => {
      return next();
    });

    const handler = middleware(async () => {
      throw new Error("handler error");
    });

    await expect(handler({} as any, {} as any)).rejects.toThrow("handler error");
  });

  it("propagates errors from middleware", async () => {
    const middleware = createMiddleware(async () => {
      throw new Error("middleware error");
    });

    const handler = middleware(async () => {
      return "ok";
    });

    await expect(handler({} as any, {} as any)).rejects.toThrow("middleware error");
  });
});
