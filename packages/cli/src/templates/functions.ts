export const functionsIndexTemplate = () => `// This is where you define your Edgepod functions!
// These are the functions that will be executed on the Edgepod server and can be called from your frontend or other clients.
// 
// Feel free to modify the function signatures and add as many functions as you need.
// Just make sure to export them so they can be used by the Edgepod runtime.

import { Ctx } from '../.generated/types';
import { eq } from '@edgepod/server';
import * as schema from '../schema';

// 1. Standard Query
export const getUsers = async (ctx: Ctx) => {
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

`;
