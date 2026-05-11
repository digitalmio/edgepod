// This is where you define your Edgepod functions!
// These are the functions that will be executed on the Edgepod server and can be called from your frontend or other clients.
//
// Feel free to modify the function signatures and add as many functions as you need.
// Just make sure to export them so they can be used by the Edgepod runtime.

import type { Ctx } from "../types";
import { eq } from "@edgepod/server/schema";
import * as schema from "../schema";
import { withAuth } from "../middlewares";

// 1. Standard Query
export const getUsers = async (ctx: Ctx) => {
  ctx.log.info("Time to get some users 1234567!");
  return await ctx.db.select().from(schema.users);
};

// 2. Query with arguments
export const getUserById = async (ctx: Ctx, args: { id: number }) => {
  const result = await ctx.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, args.id))
    .limit(1);

  return result[0] || null;
};

// 3. Mutation (This triggers the EdgePod WebSockets!)
export const createUser = async (ctx: Ctx, args: { email: string; name: string }) => {
  const newUser = await ctx.db
    .insert(schema.users)
    .values({
      email: args.email,
      name: args.name,
    })
    .returning();

  return newUser[0];
};

export const deleteUser = async (ctx: Ctx, args: { id: number }) => {
  await ctx.db.delete(schema.users).where(eq(schema.users.id, args.id));
  return true;
};

// 4. Auth-protected function (uses withAuth middleware)
export const getMyDetails = withAuth(async (ctx: Ctx) => {
  return ctx.user;
});
