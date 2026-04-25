export const functionsIndexTemplate = () => `import { Ctx } from '../.generated/types';
import { eq } from '@edgepod/server';

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
