// Creates a middleware wrapper for EdgePod functions
// Uses the familiar (ctx, args, next) Hono-like pattern
export function createMiddleware<TCtx, TMiddlewareArgs = any>(
  middlewareLogic: (ctx: TCtx, args: TMiddlewareArgs, next: () => Promise<any>) => Promise<any>
) {
  // this is the actual middleware HOC returned to the user (e.g., `withProjectAccess`)
  return <TArgs extends TMiddlewareArgs, TReturn>(
    handler: (ctx: TCtx, args: TArgs) => Promise<TReturn>
  ) => {
    // return the final wrapped function that user will call
    return async (ctx: TCtx, args: TArgs): Promise<TReturn> => {
      // middlewareLogic is applied here, then we're calling the user's handler as the `next()` callback
      const result = await middlewareLogic(ctx, args, async () => {
        return await handler(ctx, args);
      });
      // type restoration. We know that `next()` returns TReturn, so we can safely cast it back
      return result as TReturn;
    };
  };
}
